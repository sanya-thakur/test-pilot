-- CreateTable
CREATE TABLE "dataset_records" (
    "id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "stored_filename" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "column_count" INTEGER NOT NULL,
    "duplicate_row_count" INTEGER NOT NULL,
    "encoding" TEXT NOT NULL,
    "delimiter" TEXT NOT NULL,
    "header_quality" TEXT NOT NULL,
    "health_score" INTEGER NOT NULL,
    "health_score_deductions" JSONB NOT NULL,
    "scoring_version" TEXT NOT NULL,
    "severity_totals" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "column_profiles" JSONB NOT NULL,
    "profiler_version" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dataset_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dataset_records_file_sha256_idx" ON "dataset_records"("file_sha256");

-- CreateIndex
CREATE INDEX "dataset_records_created_at_idx" ON "dataset_records"("created_at");
