# AI providers

The backend supports OpenAI, Google Gemini, and Groq through the same `AIProvider`
interface. Set `AI_PROVIDER=openai`, `AI_PROVIDER=gemini`, or `AI_PROVIDER=groq`. Unset defaults to
OpenAI for compatibility. Names are exact and case-sensitive; unsupported or
empty values cause a configuration error during default service construction.
Changing selection requires restarting the backend. Injected service providers
and `setProvider()` continue to override the default factory.

## Configuration

Keep credentials private in the backend process environment or the existing
backend `.env`; never put them in frontend configuration or source control.

| Provider | Required for requests | Optional settings and defaults |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL=gpt-4o-mini`, `OPENAI_TIMEOUT_MS=30000`, optional `OPENAI_BASE_URL` |
| Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL=gemini-3.8-flash`, `GEMINI_TIMEOUT_MS=30000` |
| Groq | `GROQ_API_KEY` | `GROQ_MODEL=openai/gpt-oss-20b`, `GROQ_TIMEOUT_MS=30000`, optional `GROQ_BASE_URL=https://api.groq.com/openai/v1` |

Only the selected provider needs credentials. Gemini client initialization and
key validation happen when generation is requested, so startup and report-context
retrieval work without a Gemini key. A missing key produces the existing 503
configuration response on an assistant request for an existing dataset. Gemini
constructor overrides take precedence over environment settings. Its timeout must
be an integer from 1 through 2147483647 milliseconds; blank model names are invalid.

Gemini uses the Developer API with an explicit key, not ambient Vertex settings.
The SDK is pinned to `@google/genai` 2.30.0, which requires Node >=20 and publishes
a CommonJS entry point. The default model is documented as stable in Google's
[model catalog](https://ai.google.dev/gemini-api/docs/models). Model availability
and permissions depend on the account; this feature was validated with mocks,
not live provider requests.

Groq uses its OpenAI-compatible Chat Completions endpoint with the existing
OpenAI SDK. The adapter makes one request (`maxRetries: 0`) and preserves the
same 503/504/502 public error mapping. It logs only request ID, provider,
duration, timeout, failure category, and HTTP status when available.

## Bounded provider context

The public AI-context endpoint continues to return the complete mapped report.
Assistant provider requests instead use a deterministic compact projection so a
large dataset report cannot exceed provider request-body limits. The projection
is capped at 24,000 serialized characters, includes at most 20 findings and 20
column profiles, orders findings by severity then rule/column and columns by
name, retains numeric metrics only, and omits representative sample values.
Safe logs report source/sent item counts and serialized character counts, but
never report values or prompt content.

## Request behavior

The existing assistant system prompt, user question and saved report context are
mapped into Gemini's system instruction and user contents. No CSV is uploaded to
Gemini. Context still includes report samples and finding metrics from the existing
mapper; this adapter does not introduce a new redaction layer.

The Gemini timeout applies to both the SDK request and an adapter deadline. The
adapter aborts and stops waiting at the deadline even if the SDK does not settle.
Client cancellation cannot guarantee cancellation of processing/billing remotely.
SDK HTTP retries are disabled (one attempt). Timeouts, including HTTP 408/504,
map to the existing 504 response. Other API errors, blocked output, empty output,
tool-only output and network failures map to the existing 502 responses. Partial
nonempty output stopped at `MAX_TOKENS` is accepted; safety/other abnormal finish
reasons are rejected. Provider error messages and request payloads are never copied
into Gemini errors or adapter logs. There is no automatic fallback to OpenAI or
another provider on errors.

HTTP contracts remain unchanged:

- `GET /api/v1/datasets/:id/ai-context` returns mapped saved-report context.
- `POST /api/v1/datasets/:id/ai-assistant` accepts `{ "message": "Explain the health score" }`.
- Success returns `{ "datasetId": "...", "message": "...", "answer": "..." }`.
- Validation errors are 400, missing datasets 404, provider configuration 503,
  timeout 504, other provider failures 502, unexpected internal failures 500.

## Local use and validation

Run backend commands from the `backend` directory, never the untracked root npm
project. Privately configure provider credentials and existing persistence settings,
then run `npm run dev`. With the backend on its default port, submit the POST above
to `http://127.0.0.1:3000/api/v1/datasets/<saved-dataset-id>/ai-assistant`.
Use an existing saved dataset; live assistant requests use provider quota and are
not part of automated validation. Upload/profiling additionally requires FastAPI.

Targeted mocked tests (from `backend`):

```powershell
npm test -- --runInBand --runTestsByPath tests/gemini.provider.test.ts tests/groq.provider.test.ts tests/ai-provider.factory.test.ts tests/openai.provider.test.ts tests/ai-assistant.service.test.ts
npm run build
```

The tests use injected/mocked SDK clients and make no live AI requests. Do not run
the unrestricted backend suite against preserved user uploads: the existing
`tests/integration/datasets-profile.integration.test.ts` cleanup can delete existing
files in `data/uploads/`. Its repair is separate work. The OpenAI adapter's existing
local diagnostic logging diff was preserved unchanged for this feature.
