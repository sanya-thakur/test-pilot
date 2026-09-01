# TestPilot Product Definition

## Problem

Teams regularly receive CSV exports and datasets with unknown quality. Finding missing values, duplicates, malformed data, inconsistent types, outliers, and schema problems is often manual, slow, and hard to repeat. Bad data quietly reaches dashboards, decisions, tests, and downstream systems.

TestPilot makes the first inspection fast, repeatable, and explainable. It profiles an uploaded CSV and turns deterministic measurements into a Data Health Report.

## Target user

The initial users are software engineers, QA engineers, data analysts, data engineers, and technical product teams who need a trustworthy assessment of a CSV before analysis, migration, integration, or test preparation. V1 assumes a single local developer/user workflow; organizations and shared workspaces come later.

## V1 functionality: Dataset Intelligence

```text
Upload CSV → deterministic profile → Data Health Report
```

V1 reports missing values, duplicates, inferred types, invalid or mixed values, schema/header issues, constant/all-null fields, descriptive statistics, and robust outliers. It includes a transparent health score, severity totals, column-level profiles, and versioned rules so results can be reproduced.

The first milestone is local and synchronous: React/Vite uploads to Express; Express invokes a Python/FastAPI profiler; the frontend renders the result. Local file storage is adequate; PostgreSQL follows once this path works. V1 does not yet promise durable report history.

## Future functionality

- AI Data Assistant: chat over safe, structured dataset/report context.
- Project Analyzer: ingest software projects and understand schemas and APIs.
- Synthetic Test Data: generate realistic and adversarial data constrained by discovered rules.
- Automated Application Testing: execute data-driven tests against applications and APIs.
- AI Root-Cause Analysis: correlate failures, logs, schemas, and data-quality context.
- GCP Production Deployment: provide secure hosted storage, identity, asynchronous processing, observability, and operations.

These are future roadmap phases. V1 contains no LLM/Gemini dependency, cleaning workflow, project upload, synthetic-data capability, or application-testing feature.

## Why TestPilot is not a generic AI chatbot

TestPilot is a data-quality and testing platform anchored in deterministic, versioned evidence. Its source of truth is measured file and column behavior—not a model's free-form interpretation. Scores, findings, thresholds, and outlier rules are reproducible and testable. Any future AI assistant will be constrained by this structured evidence and complement, not replace, deterministic analysis.

This enables repeatable quality gates, explainable diagnostics, reliable analysis of actual uploaded data, and a path from data health to software-test outcomes—capabilities a generic chatbot does not provide by itself.
