"""Durable CSV drafts and immutable typed rows in the configured import database.

SQLite stores file/column metadata only. Original bytes remain in the protected
file directory, and confirmed rows are committed together in PostgreSQL before
a Dataset can become ready. Retrying the same reviewed file reuses its table.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import threading
import uuid
from typing import Any, Sequence

import psycopg
from psycopg import sql

from .csv_import import CsvFile, CsvImportError, parse_csv
from .digest import canonical_sha256

MAX_IMPORT_BYTES = 10 * 1024 * 1024
_DATABASE_TYPES = {"text": "text", "number": "numeric", "date": "date"}
IMPORT_SCHEMA = "catalyst_imports"


class ImportStore:
    def __init__(self, metadata_path: str, directory: Path, connection_uri: str):
        self.directory = directory
        self.connection_uri = connection_uri
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(
            metadata_path, timeout=5, check_same_thread=False
        )
        self._connection.row_factory = sqlite3.Row
        self._connection.execute(
            "CREATE TABLE IF NOT EXISTS catalyst_csv_imports ("
            "import_id TEXT PRIMARY KEY, filename TEXT NOT NULL, sha256 TEXT NOT NULL, "
            "byte_count INTEGER NOT NULL, types_json TEXT NOT NULL, title TEXT NOT NULL, "
            "dataset_version_id TEXT)"
        )
        self._connection.commit()

    def close(self) -> None:
        self._connection.close()

    def _record(self, import_id: str) -> dict[str, Any]:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM catalyst_csv_imports WHERE import_id = ?", (import_id,)
            ).fetchone()
        if row is None:
            raise CsvImportError("This import was not found. Choose your CSV again.")
        return dict(row)

    def _file(self, record: dict[str, Any]) -> CsvFile:
        try:
            file = parse_csv((self.directory / record["import_id"]).read_bytes())
        except OSError:
            raise CsvImportError(
                "The original file is unavailable. Restore it or choose your CSV again."
            ) from None
        if file.sha256 != record["sha256"]:
            raise CsvImportError(
                "The original file changed. Choose your CSV again as a new import."
            )
        return file

    def create(self, filename: str, content: bytes) -> dict[str, Any]:
        filename = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
        if not filename.lower().endswith(".csv") or len(filename) > 255:
            raise CsvImportError(
                "Choose a file with a .csv name of at most 255 characters."
            )
        file = parse_csv(content, max_bytes=MAX_IMPORT_BYTES)
        import_id = str(uuid.uuid4())
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = self.directory / import_id
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            with self._lock, self._connection:
                self._connection.execute(
                    "INSERT INTO catalyst_csv_imports VALUES (?, ?, ?, ?, ?, ?, NULL)",
                    (
                        import_id,
                        filename,
                        file.sha256,
                        file.byte_count,
                        json.dumps(file.suggested_types()),
                        filename[:-4],
                    ),
                )
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        return self.review(import_id)

    def review(self, import_id: str, offset: int = 0) -> dict[str, Any]:
        record = self._record(import_id)
        file = self._file(record)
        types = json.loads(record["types_json"])
        error = None
        try:
            preview = file.preview(types, offset=offset)
        except CsvImportError as failure:
            error = str(failure)
            # Keep the chosen types and original cells visible for correction.
            preview = file.preview(["text"] * len(file.headers), offset=offset)
        return {
            "importId": import_id,
            "filename": record["filename"],
            "sha256": file.sha256,
            "bytes": file.byte_count,
            "title": record["title"],
            "types": types,
            "preview": preview,
            "error": error,
            "datasetVersionId": record["dataset_version_id"],
        }

    def update(
        self, import_id: str, *, title: str, types: Sequence[str]
    ) -> dict[str, Any]:
        record = self._record(import_id)
        file = self._file(record)
        if record["dataset_version_id"]:
            raise CsvImportError(
                "This import is already saved. Upload another file to create a new Dataset."
            )
        if len(types) != len(file.headers) or any(
            kind not in _DATABASE_TYPES for kind in types
        ):
            raise CsvImportError("Choose Text, Number or Date for every column.")
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE catalyst_csv_imports SET title = ?, types_json = ? WHERE import_id = ?",
                (
                    title.strip() or record["filename"][:-4],
                    json.dumps(types),
                    import_id,
                ),
            )
        return self.review(import_id)

    def mark_saved(self, import_id: str, version_id: str) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE catalyst_csv_imports SET dataset_version_id = ? WHERE import_id = ?",
                (version_id, import_id),
            )

    def persist(self, import_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        record = self._record(import_id)
        file = self._file(record)
        types = json.loads(record["types_json"])
        rows = file.review(types)
        digest = canonical_sha256(
            {"importId": import_id, "sha256": file.sha256, "types": types}
        )
        table = "file_" + digest[:48]
        relation = sql.Identifier(IMPORT_SCHEMA, table)
        columns = file.preview(types, limit=0)["columns"]
        for index, column in enumerate(columns):
            column.update(
                databaseName=f"c{index}", databaseType=_DATABASE_TYPES[types[index]]
            )
        try:
            with psycopg.connect(self.connection_uri, connect_timeout=10) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SET LOCAL statement_timeout = '60s'")
                    cursor.execute(
                        "SELECT pg_advisory_xact_lock(%s)", (int(digest[:15], 16),)
                    )
                    cursor.execute(
                        sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
                            sql.Identifier(IMPORT_SCHEMA)
                        )
                    )
                    cursor.execute(
                        "SELECT to_regclass(%s)", (f"{IMPORT_SCHEMA}.{table}",)
                    )
                    existence = cursor.fetchone()
                    assert existence is not None
                    if existence[0] is None:
                        fields: list[sql.Composable] = [
                            sql.SQL('"row_order" bigint PRIMARY KEY')
                        ]
                        fields.extend(
                            sql.SQL("{} {}").format(
                                sql.Identifier(column["databaseName"]),
                                sql.SQL(column["databaseType"]),
                            )
                            for column in columns
                        )
                        cursor.execute(
                            sql.SQL("CREATE TABLE {} ({})").format(
                                relation, sql.SQL(", ").join(fields)
                            )
                        )
                        with cursor.copy(
                            sql.SQL("COPY {} FROM STDIN").format(relation)
                        ) as copy:
                            for index, row in enumerate(rows):
                                copy.write_row((index, *row))
                        cursor.execute(
                            sql.SQL("COMMENT ON TABLE {} IS {}").format(
                                relation, sql.Literal(digest)
                            )
                        )
                    else:
                        cursor.execute(
                            "SELECT obj_description(to_regclass(%s), 'pg_class')",
                            (f"{IMPORT_SCHEMA}.{table}",),
                        )
                        comment = cursor.fetchone()
                        assert comment is not None
                        if comment[0] != digest:
                            raise CsvImportError(
                                "The stored import does not match this file. Contact the administrator; your draft is retained."
                            )
                        cursor.execute(
                            sql.SQL("SELECT count(*) FROM {}").format(relation)
                        )
                        count = cursor.fetchone()
                        assert count is not None
                        if count[0] != len(rows):
                            raise CsvImportError(
                                "The stored import is incomplete. Contact the administrator; your draft is retained."
                            )
        except psycopg.Error:
            raise CsvImportError(
                "The file could not be saved. Your file and reviewed types are retained; try again when storage is available."
            ) from None
        return record, {
            "kind": "file",
            "importId": import_id,
            "filename": record["filename"],
            "sha256": file.sha256,
            "bytes": file.byte_count,
            "rowCount": len(rows),
            "types": types,
            "columns": columns,
            "storage": {"schema": IMPORT_SCHEMA, "table": table, "digest": digest},
        }

    def rows(
        self, origin: dict[str, Any], *, offset: int, limit: int
    ) -> dict[str, Any]:
        if offset < 0 or not 1 <= limit <= 100:
            raise CsvImportError(
                "Choose a nonnegative page offset and between 1 and 100 rows."
            )
        columns = origin["columns"]
        try:
            with psycopg.connect(self.connection_uri, connect_timeout=10) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION READ ONLY")
                    cursor.execute("SET LOCAL statement_timeout = '10s'")
                    cursor.execute(
                        sql.SQL(
                            'SELECT {} FROM {} ORDER BY "row_order" LIMIT %s OFFSET %s'
                        ).format(
                            sql.SQL(", ").join(
                                sql.Identifier(column["databaseName"])
                                for column in columns
                            ),
                            sql.Identifier(
                                origin["storage"]["schema"], origin["storage"]["table"]
                            ),
                        ),
                        (limit, offset),
                    )
                    values = cursor.fetchall()
        except psycopg.Error:
            raise CsvImportError(
                "The saved rows are unavailable. Try again when storage is available."
            ) from None
        return {
            "columns": columns,
            "rows": [
                [
                    {"type": "null"}
                    if value is None
                    else {"type": column["logicalType"], "value": str(value)}
                    for column, value in zip(columns, row)
                ]
                for row in values
            ],
            "rowCount": {
                "total": origin["rowCount"],
                "returned": len(values),
                "truncated": offset + len(values) < origin["rowCount"],
            },
            "offset": offset,
        }
