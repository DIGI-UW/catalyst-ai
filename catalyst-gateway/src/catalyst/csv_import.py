"""CSV parsing and reviewed types for file-origin Datasets.

Keep original cells separate from conversions: changing a reviewed type or
retrying persistence must never destroy what was uploaded. No SQL or model
calls belong in this module.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Sequence


_NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?\Z")
_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")
IMPORT_TYPES = {"text": "string", "number": "decimal", "date": "date"}


class CsvImportError(ValueError):
    """An actionable file or type-review error, without database details."""


def _date(value: str) -> date:
    if not _DATE.fullmatch(value):
        raise ValueError
    return date.fromisoformat(value)


def _number(value: str) -> Decimal:
    if not _NUMBER.fullmatch(value):
        raise ValueError
    return Decimal(value)


def _convert(value: str, kind: str) -> str | Decimal | date | None:
    if kind == "text":
        return value
    if value == "":
        return None
    return _number(value) if kind == "number" else _date(value)


def _suggest(values: Sequence[str]) -> str:
    present = [value for value in values if value != ""]
    if not present:
        return "text"
    for kind, converter in (("date", _date), ("number", _number)):
        try:
            for value in present:
                converter(value)
        except ValueError:
            continue
        return kind
    return "text"


@dataclass(frozen=True)
class CsvFile:
    headers: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]
    sha256: str
    byte_count: int

    def suggested_types(self) -> list[str]:
        return [
            _suggest([row[index] for row in self.rows])
            for index in range(len(self.headers))
        ]

    def review(self, types: Sequence[str]) -> list[tuple[Any, ...]]:
        if len(types) != len(self.headers) or any(
            kind not in IMPORT_TYPES for kind in types
        ):
            raise CsvImportError("Choose Text, Number or Date for every column.")
        converted = []
        for row_number, row in enumerate(self.rows, 1):
            values = []
            for column, (value, kind) in enumerate(zip(row, types)):
                try:
                    values.append(_convert(value, kind))
                except ValueError:
                    raise CsvImportError(
                        f"{self.headers[column]}, result row {row_number}: this value is not a valid {kind}. Choose Text to preserve it, or correct the file."
                    ) from None
            converted.append(tuple(values))
        return converted

    def preview(
        self, types: Sequence[str], *, limit: int = 100, offset: int = 0
    ) -> dict[str, Any]:
        """Validate the complete file; return a bounded review with truthful totals."""
        if offset < 0 or limit < 0 or limit > 100:
            raise CsvImportError(
                "Choose a nonnegative page offset and at most 100 rows."
            )
        converted = self.review(types)
        rows = []
        for row in converted[offset : offset + limit]:
            cells = []
            for value, kind in zip(row, types):
                if value is None:
                    cells.append({"type": "null"})
                else:
                    cells.append({"type": IMPORT_TYPES[kind], "value": str(value)})
            rows.append(cells)
        return {
            "columns": [
                {
                    "ordinal": index,
                    "name": name,
                    "logicalType": IMPORT_TYPES[types[index]],
                }
                for index, name in enumerate(self.headers)
            ],
            "rows": rows,
            "offset": offset,
            "rowCount": {
                "total": len(self.rows),
                "returned": len(rows),
                "truncated": offset + len(rows) < len(self.rows),
            },
        }


def parse_csv(
    content: bytes,
    *,
    max_bytes: int = 10 * 1024 * 1024,
    max_rows: int = 100_000,
    max_columns: int = 200,
) -> CsvFile:
    if len(content) > max_bytes:
        raise CsvImportError(f"Choose a CSV no larger than {max_bytes:,} bytes.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CsvImportError("Save the file as UTF-8 CSV and try again.") from None
    if "\x00" in text:
        raise CsvImportError(
            "This file contains unsupported null characters. Choose a text CSV file."
        )
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    try:
        headers = next(reader, [])
        if (
            not headers
            or any(not name.strip() for name in headers)
            or len(set(headers)) != len(headers)
        ):
            raise CsvImportError("Use one unique, nonempty heading for each column.")
        if len(headers) > max_columns:
            raise CsvImportError(
                f"Choose a report with at most {max_columns:,} columns."
            )
        rows: list[tuple[str, ...]] = []
        for row in reader:
            if not row:
                continue
            if len(row) != len(headers):
                raise CsvImportError(
                    f"Result row {len(rows) + 1} has a different number of columns. Check the CSV and try again."
                )
            if len(rows) >= max_rows:
                raise CsvImportError(
                    f"Choose a report with at most {max_rows:,} result rows."
                )
            rows.append(tuple(row))
    except csv.Error:
        raise CsvImportError(
            "Check the CSV quotation marks and make sure the file is complete."
        ) from None
    if not rows:
        raise CsvImportError(
            "This file has headings but no results. Choose a report with data."
        )
    return CsvFile(
        tuple(headers), tuple(rows), hashlib.sha256(content).hexdigest(), len(content)
    )
