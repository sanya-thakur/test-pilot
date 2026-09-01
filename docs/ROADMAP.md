# TestPilot Roadmap

Phases are product outcomes, not a commitment to add every future technology in advance. Validate each phase before advancing.

## V1 Dataset Intelligence

Build the local single-user CSV workflow with React + Vite, Node.js + Express + TypeScript, and a Python + FastAPI deterministic profiler. Deliver CSV upload, local temporary storage, profiling, and a Data Health Report for missing values, duplicates, invalid/mixed values, outliers, schema issues, and column statistics. Introduce PostgreSQL only after the first vertical slice works, for durable dataset/report history.

Excluded: authentication, tenancy, Redis, queues, cloud/object storage, LLM/Gemini, cleaning, chat, project uploads, synthetic data, API testing, and GCP.

## V2 AI Data Assistant

Add a conversational assistant that uses approved structured dataset metadata and health reports. Require privacy controls, citations to deterministic findings, scoped context, usage controls, and a clear distinction between AI explanation and factual profile outputs.

## V3 Project Analyzer

Allow users to upload or connect software projects. Analyze structure, declared schemas, data models, and API specifications. Produce a versioned project-understanding model; focus on discovery, not generating or executing tests.

## V4 Synthetic Test Data

Generate realistic, boundary-case, and adversarial test data from dataset profiles and project schemas. Add constraints, privacy safeguards, reproducibility controls, and human review.

## V5 Automated Application Testing

Connect to permitted applications/APIs, generate and execute data-driven test scenarios, collect results and artifacts, and present failures. Add secure credential handling, isolation, scheduling, and test-run history.

## V6 AI Root-Cause Analysis

Use structured test artifacts, logs, application/schema context, and deterministic data-quality results to assist failure investigation. Require evidence citations, clearly label hypotheses, and retain human approval for consequential actions.

## V7 GCP Production Deployment

Deploy production-grade services on Google Cloud: identity and tenancy, encrypted object storage, PostgreSQL, asynchronous queues/workers, autoscaling, monitoring, auditing, backups, lifecycle/retention controls, CI/CD, and disaster-recovery procedures. Reassess security, privacy, cost, and operational targets before launch.
