# Autonomous Browser Agent

An LLM-powered autonomous browser agent that plans and executes
structured web workflows using deterministic Playwright automation.

This project demonstrates a production-style execution loop combining: -
Structured LLM planning - Deterministic browser automation - Strict JSON
plan validation - Single-worker queue management - HTTP API with
synchronous wait support - Interval-based scheduling - Run lifecycle
tracking with bounded memory - Structured logging and artifact capture

---

## Runtime Requirements

- **Node.js 20+** (required)
- Playwright-compatible system dependencies
- Gemini API key for LLM planning

---

## Overview

The agent automates a multi-section healthcare form located at:

https://magical-medical-form.netlify.app/

It dynamically discovers the page structure, builds a catalog of
available controls, generates a strictly validated JSON execution plan
via an LLM, and executes that plan deterministically using Playwright.

The system is designed to behave predictably, avoid uncontrolled agent
behavior, and maintain clear execution boundaries.

---

## System Architecture

High-level execution flow:

1.  Snapshot page and build section catalog
2.  Generate strict JSON plan via LLM
3.  Validate plan against schema
4.  Execute actions deterministically
5.  Capture artifacts and emit structured logs
6.  Persist run state in bounded registry
7.  Return status via API or scheduler

Core design principles:

- Deterministic execution (no freeform browsing)
- Label-driven element resolution
- Strict JSON-only LLM output contract
- Bounded model calls
- Single browser worker to avoid race conditions
- Memory-bounded run storage

---

## Features

### Agentic Planning Loop

- Dynamically inspects the DOM
- Catalogs:
  - Input labels
  - Select labels and options
  - Section toggles
  - Submit button
- Prompts the LLM to return strictly formatted JSON
- Validates plan shape before execution
- Enforces action limits and call bounds

Supported actions:

- Expand section
- Fill input
- Select dropdown option
- Click submit
- Done

---

### Deterministic Playwright Execution

All actions are executed using hardened primitives:

- Scroll-into-view before interaction
- Strict selector resolution
- No guessing of fields or options
- Full-page screenshot capture on key stages

Artifacts are written to:

```text
artifacts/
```

---

### HTTP API

Start, monitor, and optionally wait for runs via API.

Endpoints:

```http
GET    /api/v1/health
POST   /api/v1/run
GET    /api/v1/runs/:id
```

Create asynchronous run:

```bash
curl -X POST "http://localhost:3000/api/v1/run"   -H "Content-Type: application/json"   -d '{"vars":{"firstName":"John","lastName":"Doe"}}'
```

Create run and wait synchronously:

```bash
curl -X POST "http://localhost:3000/api/v1/run?wait=true&timeoutMs=60000"   -H "Content-Type: application/json"   -d '{"vars":{"firstName":"John","lastName":"Doe"}}'
```

---

### Scheduler

Supports interval-based execution with overlap prevention.

```env
SCHEDULE_INTERVAL_MS=300000
SCHEDULE_RUN_ON_START=true
```

---

### Run Lifecycle Management

- Single-worker queue
- In-memory run registry
- TTL-based pruning (`RUN_TTL_MS`)
- Max run count enforcement (`MAX_RUNS`)
- Waiter cleanup on timeout

Run states:

- queued
- running
- succeeded
- failed

---

## Environment Configuration

The project uses environment variables for runtime configuration.

Copy the provided example file:

```bash
cp .env.example .env
```

Then open `.env` and provide your Gemini API key:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

The `.env.example` file documents all available configuration variables, including:

- Target URL for the automation workflow
- LLM model configuration
- Model safety limits
- API server configuration
- Scheduler interval settings
- Run lifecycle management limits

---

## Installation

```bash
npm install
npx playwright install
cp .env.example .env
```

After copying the environment file, open `.env` and add your Gemini API key.

---

## Running

CLI:

```bash
npm run cli
```

API server:

```bash
npm run api
```

Scheduler:

```bash
npm run schedule
```

---

## Variable Injection

The workflow supports runtime overrides for all form fields via API.

Supported variables:

- firstName
- lastName
- dateOfBirth
- medicalId
- gender
- bloodType
- allergies
- currentMedications
- emergencyContactName
- emergencyContactPhone

Example:

```bash
curl -X POST "http://localhost:3000/api/v1/run?wait=true"   -H "Content-Type: application/json"   -d '{"vars":{"firstName":"Alice","lastName":"Ng"}}'
```

---

## Project Structure

```text
src/workflow.ts            # Workflow orchestration
src/agent/loop.ts          # LLM planning loop
src/agent/catalog.ts       # Section catalog builder
src/agent/snapshot.ts      # DOM snapshot extraction
src/agent/resolve.ts       # Selector resolution
src/agent/tools.ts         # Playwright primitives
src/agent/types.ts         # Plan types and validation
src/agent/json.ts          # Strict JSON extraction
src/api/server.ts          # API + run queue
src/api/registry.ts        # Run registry
src/scheduler.ts           # Interval scheduler
src/logger.ts              # Structured logging

__tests__/helpers/mocks.ts              # Shared mock factories
__tests__/agent/json.test.ts            # JSON extraction tests
__tests__/agent/types.test.ts           # Plan validation tests
__tests__/agent/resolve.test.ts         # Selector resolution tests
__tests__/agent/tools.test.ts           # Playwright primitive tests
__tests__/agent/loop.test.ts            # LLM planning loop tests
__tests__/api/registry.test.ts          # Registry pruning/waiter tests
__tests__/api/server.test.ts            # API integration tests
__tests__/scheduler/scheduler.test.ts   # Scheduler overlap tests
__tests__/workflow/workflow.test.ts     # Workflow helper tests
```

---

## Testing

116 deterministic tests across 9 files using **Vitest**. All tests are fully mocked — no network calls, no real browser launches, no LLM API calls.

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Generate coverage report
```

Coverage reports are output to `coverage/`.

---

## Limitations

- In-memory run storage
- Single worker execution
- No authentication layer
- Not horizontally scalable

---

## Production Extensions

- Durable job queue (Redis / BullMQ)
- Persistent run storage
- Browser pooling
- Multi-tenant isolation
- Metrics and tracing
- Stronger submission verification

---

## License

ISC
