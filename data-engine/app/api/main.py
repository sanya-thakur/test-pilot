from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from app.models.report import ErrorResponse, ProfileReport
from app.profiling.profiler import profile_csv
from app.readers.csv_reader import CsvInputError, ReadLimits

app = FastAPI(title="TestPilot Data Engine", version="1.0.0")

@app.exception_handler(CsvInputError)
async def csv_error_handler(_, exc: CsvInputError):
    status = 413 if exc.code == "resource_limit_exceeded" else 422
    return JSONResponse(status_code=status, content={"error": {"code": exc.code, "message": exc.message}})

@app.get("/health")
def health():
    return {"status": "ok", "service": "testpilot-data-engine"}

@app.post("/profile", response_model=ProfileReport, responses={413: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
async def profile(file: UploadFile = File(...)):
    limits = ReadLimits()
    chunks, total = [], 0
    while chunk := await file.read(64 * 1024):
        total += len(chunk)
        if total > limits.max_bytes:
            raise CsvInputError("resource_limit_exceeded", "The file exceeds the configured size limit.")
        chunks.append(chunk)
    return profile_csv(b"".join(chunks), file.filename or "", file.content_type)
