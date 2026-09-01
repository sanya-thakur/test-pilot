# TestPilot Data Engine

Deterministic, local FastAPI service for bounded CSV health profiling. Install with `python -m pip install -r requirements.txt`, then run `python -m uvicorn app.api.main:app --reload --port 8000` from this directory.

Call `POST /profile` using multipart form data: `curl -F "file=@tests/fixtures/normal.csv;type=text/csv" http://127.0.0.1:8000/profile`. `GET /health` is the liveness endpoint.

## Limits and determinism

CSV files only; default limits are 10 MiB, 100,000 data rows, 500 columns, 100,000 bytes per field, and 10 seconds parsing time. Set `TESTPILOT_MAX_FILE_BYTES`, `TESTPILOT_MAX_ROWS`, `TESTPILOT_MAX_COLUMNS`, `TESTPILOT_MAX_FIELD_BYTES`, or `TESTPILOT_PARSE_TIMEOUT_SECONDS` to tighten or raise them. Upload data is read in bounded chunks, validated with Python's CSV parser before a bounded in-memory DataFrame is made, and never returned as raw rows. Preview values are capped at three and represented only by truncated SHA-256 hashes; ordering is deterministically derived from the file SHA-256.

## Score

`score-v1` starts at 100. Every warning deducts 5 and every error deducts 12; deductions are capped at 30 per rule ID. Rules and score configuration are included in the response. Thresholds: missing/duplicate rows are warnings at 5% and errors at 25%; duplicate values are warnings at 80% and errors at 95%; IQR outliers are warnings at 1% and errors at 10%. Outliers are values `< Q1 - 1.5×IQR` or `> Q3 + 1.5×IQR`. The same bytes and profiler version produce the same report.

Type inference is deterministic: all non-empty values must parse for `integer`, `number`, or `date`; a column is `mixed` when at least 75% (and at least two) parse as numeric or dates, with the remainder reported as invalid parsed values. Other columns are `string`.

## Profiling semantics

`distinct_percentage` and `duplicate_value_rate` use populated values as their denominator. For example, a three-row column with two populated, different values has `distinct_count: 2` and `distinct_percentage: 100.0`; its missing value is represented separately by `null_count` and `null_percentage`. For a `mixed` numeric column, numeric statistics are calculated only from successfully parsed numeric values, while the failed values are reported through `invalid_parsed_value_count` and deterministic findings. `duplicate_rows.v1` compares only rows with at least one populated cell; fully empty rows are diagnosed as missing/all-null data rather than duplicate records.
