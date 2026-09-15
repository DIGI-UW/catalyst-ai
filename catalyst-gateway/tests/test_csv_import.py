from datetime import date
from decimal import Decimal
import hashlib

import pytest

from src.catalyst.csv_import import CsvImportError, parse_csv


def test_csv_preserves_bom_order_identifiers_repeats_and_quoted_cells():
    raw = '\ufeffAccession,Result,Notes,Collected\r\n001,<20,"first, ""quoted""\r\nsecond",2026-05-06\r\n001,450,,2026-05-06\r\n001,450,,2026-05-06\r\n'.encode()
    file = parse_csv(raw)
    assert file.headers == ("Accession", "Result", "Notes", "Collected")
    assert file.rows[0] == ("001", "<20", 'first, "quoted"\r\nsecond', "2026-05-06")
    assert file.rows[1] == file.rows[2]
    assert file.sha256 == hashlib.sha256(raw).hexdigest()
    assert file.byte_count == len(raw)
    assert file.suggested_types() == ["text", "text", "text", "date"]
    converted = file.review(file.suggested_types())
    assert converted[0][-1] == date(2026, 5, 6)
    assert converted[1][2] == ""
    assert len(converted) == 3


def test_type_correction_keeps_original_values_after_error():
    file = parse_csv(b"Accession,Result\n001,450.250\n002,<20\n")
    with pytest.raises(CsvImportError, match="Result, result row 2"):
        file.review(["text", "number"])
    assert file.review(["text", "text"]) == [("001", "450.250"), ("002", "<20")]
    assert file.rows[0] == ("001", "450.250")
    with pytest.raises(CsvImportError, match="Choose Text"):
        file.review(["number", "text"])


def test_numeric_precision_blanks_and_invalid_dates_are_not_guessed():
    file = parse_csv(
        b"Value,Date,Other\n12345678901234567890.123456789,2026-02-30,\n,,\n"
    )
    assert file.suggested_types() == ["number", "text", "text"]
    values = file.review(["number", "text", "text"])
    assert values[0][0] == Decimal("12345678901234567890.123456789")
    assert values[1] == (None, "", "")
    with pytest.raises(CsvImportError, match="valid date"):
        file.review(["number", "date", "text"])


def test_preview_checks_entire_file_and_reports_complete_count():
    raw = "ID,Value\n" + "".join(f"{i},450\n" for i in range(100)) + "100,<20\n"
    file = parse_csv(raw.encode())
    assert file.suggested_types() == ["number", "text"]
    preview = file.preview(["text", "text"])
    assert preview["rowCount"] == {"total": 101, "returned": 100, "truncated": True}
    with pytest.raises(CsvImportError, match="result row 101"):
        file.preview(["text", "number"])
    assert file.preview(["text", "text"])["rows"][0] == [
        {"type": "string", "value": "0"},
        {"type": "string", "value": "450"},
    ]


@pytest.mark.parametrize(
    "raw",
    [
        b"",
        b"Name\n",
        b"Name,Name\na,b\n",
        b",Name\na,b\n",
        b'Name\n"unfinished',
        b"Name,Value\none\n",
        b"Name\n\xff\n",
        b"Name\n\x00\n",
    ],
)
def test_invalid_or_empty_csv_has_actionable_failure(raw):
    with pytest.raises(CsvImportError):
        parse_csv(raw)


@pytest.mark.parametrize(
    "limit", [dict(max_bytes=3), dict(max_rows=1), dict(max_columns=1)]
)
def test_file_limits_reject_whole_import_without_truncating(limit):
    with pytest.raises(CsvImportError):
        parse_csv(b"ID,Value\n1,2\n3,4\n", **limit)


def test_review_types_must_match_columns():
    file = parse_csv(b"ID,Value\n1,2\n")
    for kinds in ([], ["text"], ["text", "sql"]):
        with pytest.raises(CsvImportError, match="every column"):
            file.review(kinds)
