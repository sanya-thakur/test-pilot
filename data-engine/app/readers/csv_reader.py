import csv
import hashlib
import io
import os
import time
from dataclasses import dataclass
import pandas as pd

@dataclass(frozen=True)
class ReadLimits:
    max_bytes: int = int(os.getenv("TESTPILOT_MAX_FILE_BYTES", 10 * 1024 * 1024))
    max_rows: int = int(os.getenv("TESTPILOT_MAX_ROWS", 100_000))
    max_columns: int = int(os.getenv("TESTPILOT_MAX_COLUMNS", 500))
    max_field_bytes: int = int(os.getenv("TESTPILOT_MAX_FIELD_BYTES", 100_000))
    parse_timeout_seconds: float = float(os.getenv("TESTPILOT_PARSE_TIMEOUT_SECONDS", "10"))

class CsvInputError(Exception):
    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(message)

def _decode(data: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise CsvInputError("invalid_csv", "The file cannot be decoded as supported CSV text.")

def read_csv(data: bytes, filename: str | None, content_type: str | None, limits: ReadLimits = ReadLimits()):
    if not filename or not filename.lower().endswith(".csv"):
        raise CsvInputError("unsupported_input", "Only .csv files are supported.")
    if content_type and content_type not in {"text/csv", "application/csv", "application/vnd.ms-excel", "application/octet-stream"}:
        raise CsvInputError("unsupported_input", "The uploaded content type is not CSV.")
    if not data:
        raise CsvInputError("empty_file", "The uploaded file is empty.")
    if len(data) > limits.max_bytes:
        raise CsvInputError("resource_limit_exceeded", "The file exceeds the configured size limit.")
    text, encoding = _decode(data)
    try:
        dialect = csv.Sniffer().sniff(text[: min(len(text), 64_000)], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    old_limit = csv.field_size_limit()
    try:
        csv.field_size_limit(limits.max_field_bytes)
        deadline = time.monotonic() + limits.parse_timeout_seconds
        rows = []
        for row in csv.reader(io.StringIO(text, newline=""), dialect, strict=True):
            if time.monotonic() > deadline:
                raise CsvInputError("resource_limit_exceeded", "CSV parsing exceeded the configured time limit.")
            rows.append(row)
    except (csv.Error, UnicodeError) as exc:
        raise CsvInputError("parsing_failure", "The CSV could not be parsed safely.") from exc
    finally:
        csv.field_size_limit(old_limit)
    if not rows or not rows[0]:
        raise CsvInputError("empty_file", "The CSV has no header row.")
    if len(rows) == 1:
        raise CsvInputError("empty_file", "The CSV has no data rows.")
    width = len(rows[0])
    # A blank physical line is one empty value in a valid one-column CSV.
    if width == 1:
        rows = [row if row else [""] for row in rows]
    if width > limits.max_columns or len(rows) - 1 > limits.max_rows:
        raise CsvInputError("resource_limit_exceeded", "The CSV exceeds configured row or column limits.")
    if any(len(row) != width for row in rows):
        raise CsvInputError("invalid_csv", "CSV rows do not have a consistent number of columns.")
    try:
        frame = pd.DataFrame(rows[1:], columns=rows[0], dtype="string")
    except Exception as exc:
        raise CsvInputError("parsing_failure", "The CSV could not be loaded.") from exc
    return frame, {"encoding": encoding, "delimiter": dialect.delimiter, "sha256": hashlib.sha256(data).hexdigest(), "size_bytes": len(data)}
