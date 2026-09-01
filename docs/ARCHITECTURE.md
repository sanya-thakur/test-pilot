# TestPilot Architecture

## Architectural scope

TestPilot begins with a local, single-user vertical slice for deterministic CSV profiling:

```text
React + Vite frontend → Node.js + Express API → Python + FastAPI data engine
                                        ↘ local filesystem
```

A user selects a CSV in the browser. Express accepts and validates it, stores it locally, calls the FastAPI data engine, receives a deterministic report, and returns that report for the frontend to display.

This milestone does **not** require authentication, multi-tenancy, PostgreSQL, Redis, queues, cloud infrastructure, S3-compatible storage, LLMs/Gemini, or application-testing functionality. These omissions are deliberate. Clear interfaces keep later adoption possible without bringing operational complexity into the first working slice.

## Chosen technology stack

| Layer | Choice | Responsibility |
|---|---|---|
| Frontend | React + TypeScript + Vite | CSV selection/upload, progress and error states, and report rendering. It never profiles files or calls the data engine directly. |
| Backend | Node.js + Express + TypeScript | Browser-facing API, upload validation, local file lifecycle, data-engine orchestration, and response shaping. |
| Data engine | Python + FastAPI | Deterministic, versioned CSV parsing and profiling. Returns structured results only. |
| Local storage | Filesystem | Temporary uploaded CSVs in a dedicated, ignored runtime directory. |
| Future metadata store | PostgreSQL | Added after the first slice for durable dataset, report, and analysis history. |

Run the frontend, backend, and engine as separate local processes. The browser calls only Express; Express calls FastAPI through a configurable internal URL. This preserves a useful service boundary for later asynchronous jobs and independent worker scaling.

## Proposed folder structure

```text
testpilot/
├── frontend/                         # React + Vite application
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── api/                      # Express API client only
│       └── types/
├── backend/                          # Node.js + Express + TypeScript
│   └── src/
│       ├── routes/
│       ├── controllers/
│       ├── services/                 # upload and engine orchestration
│       ├── clients/                  # FastAPI client
│       ├── storage/                  # local storage interface/adapter
│       └── contracts/
├── data-engine/                      # Python + FastAPI
│   └── app/
│       ├── api/
│       ├── profiling/                # deterministic rules and scoring
│       ├── readers/
│       ├── models/
│       └── tests/
├── shared/
│   └── contracts/                    # OpenAPI/specification and generated types later
├── data/uploads/                     # ignored local runtime files
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
└── README.md
```

Keep `storage` and `clients` narrow. Initially `LocalFileStorage` and a synchronous `FastApiProfilerClient` implement them. Later, local storage can be replaced by object storage and the synchronous client by job/queue dispatch without changing routes or UI contracts.

## First vertical slice

1. React submits a CSV to `POST /api/v1/datasets/profile` as multipart form data.
2. Express validates the file and stores it with a generated ID in `data/uploads/`.
3. Express calls FastAPI with the stored file (or a controlled local path on the same trusted development machine).
4. FastAPI parses and profiles the CSV with versioned deterministic rules and returns a structured health report.
5. Express returns a sanitized report to React. The UI shows summary metrics, findings, and column details.
6. Express removes the temporary file after profiling unless a development retention option is enabled.

The first path is synchronous with explicit upload-size and profiling-time limits. The UI shows an in-progress state and clear failure message. Do not claim durable report history until PostgreSQL is added.

## API contracts for the first milestone

| Method and path | Purpose |
|---|---|
| `POST /api/v1/datasets/profile` | Accept one `multipart/form-data` field named `file`, validate/store it, invoke the engine synchronously, and return the deterministic health report. |
| `GET /api/v1/health` | Express liveness check. |
| `GET /health` | FastAPI liveness check for local orchestration. |

The profile response contains a profiler/rule-set version, file summary, overall health score, severity totals, findings, and column profiles. It never returns the complete raw CSV or unbounded samples. Define and validate the contract with OpenAPI/JSON Schema when implementation begins.

Dataset CRUD, durable report retrieval, job status, authentication, and tenant endpoints are deferred until persistence and asynchronous processing exist.

## Deterministic data engine

The data engine is V1's source of truth: the same input bytes and profiler version must produce the same output.

- Safely detect supported encoding/delimiter and reject malformed or unsupported inputs with machine-readable errors.
- Calculate row/column counts, header quality, inferred types, null/empty/distinct/duplicate rates, duplicate rows, numeric statistics, string lengths, and date ranges where applicable.
- Emit findings for missing data, duplicate rows/values, mixed or incompatible types, invalid parse values, all-null/constant columns, schema-name issues, and robust IQR-based outliers.
- Produce a transparent weighted health score, rule identifiers, thresholds, and severity totals. Version profiler code and score configuration.
- Use bounded deterministic samples based on a stable file hash if samples are shown.

No LLM or Gemini call may influence profiling, type inference, finding severity, health score, or report language. Determinism gives repeatability, fixture-based tests, predictable cost, and defensible results.

## Storage and persistence evolution

In the first milestone, local files are transient runtime data. Keep uploads out of Git, generate non-user-controlled file names, restrict directory access to the backend, and make the backend—rather than browser or engine—own lifecycle.

After the vertical slice is proven, introduce PostgreSQL for dataset metadata, versions, profiler runs, reports, column profiles, and findings. Keep original data separate from report records. When concurrent workloads require it, add persistent/object storage, job records/status endpoints, then a queue and scalable workers behind existing interfaces. When users or hosting are introduced, add identity, tenancy, and authorization to every persisted resource.

## Security considerations

Treat CSV contents as untrusted even in local development:

- Accept CSV only; enforce file size, row/column, field-length, parse-time, and memory limits. Reject archives and unsupported formats.
- Generate storage names, prevent path traversal, restrict permissions, and delete temporary files on success/failure according to retention settings.
- Validate multipart content server-side—not by extension/MIME alone—and use request-size/rate limits when anything is exposed beyond localhost.
- Escape displayed values and guard against CSV/formula injection if exporting later. Never execute embedded data.
- Keep FastAPI private to the local/internal network; only Express serves the browser. Use strict timeouts and response schema validation between services.
- Avoid logging raw cells or sensitive samples. Plan redaction/retention boundaries now.

Production releases require authentication, authorization, encryption, tenant isolation, audit trails, secret management, malware scanning, and formal data retention; none are shortcut substitutes for V1's local-only limits.

## Scalability and evolution risks

Synchronous local profiling is appropriate only for bounded small-to-medium files. Large uploads can consume memory, block Express request lifecycles, and make users wait. Concurrency is limited by the engine process and local disk.

Mitigate now with strict quotas, timeouts, streaming/chunked parsing where practical, limited concurrent profiling, and visible limits. Evolve only when needed: PostgreSQL for history; persistent/object storage; asynchronous jobs; Redis or another queue; independently scalable workers; then cloud production infrastructure.

## Explicit non-goals

Do not implement dataset cleaning, AI chat, project uploads, source/API schema understanding, synthetic/adversarial data generation, API testing, test execution, AI-assisted root-cause analysis, or GCP deployment in this phase. V1 contains no future-feature UI, endpoints, dependencies, prompts, models, or cloud infrastructure.

## Implementation sequence

1. Create the three service folders, local scripts, environment-variable conventions, ignored runtime-data directory, and report API contract.
2. Build FastAPI health endpoint, safe CSV reader, deterministic profiler, report schema, unit tests, and golden fixture tests.
3. Build Express health endpoint, multipart validation, local generated file storage, FastAPI client with timeout, report validation, cleanup, and integration tests.
4. Build React/Vite upload UI, progress/error states, and Data Health Report views against the Express contract.
5. Verify valid, malformed, empty, duplicate-heavy, missing-value, mixed-type, and outlier fixture CSVs end-to-end.
6. Set operational limits, then add PostgreSQL as the following milestone for durable dataset/report history.
