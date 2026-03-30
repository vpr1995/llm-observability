# LLM Observability (OpenTelemetry + RAG Demo)

This project is a **simple, end-to-end learning repo** for OpenTelemetry in a real API flow.

You can see how traces, metrics, and correlated logs work together for a GenAI-style pipeline:

- `/query` → retrieval → prompt building → LLM call → post-processing
- `/feedback` → linked back to the original `/query` trace

If you want to understand OpenTelemetry quickly (without theory overload), you are in the right place.

## What you will learn

- How telemetry is initialized in Node.js ([src/observabilty/instrumentation.ts](src/observabilty/instrumentation.ts))
- How a parent span creates child spans ([src/routes/query.ts](src/routes/query.ts), [src/decorators/traced.ts](src/decorators/traced.ts))
- How custom attributes/events are added to spans ([src/pipeline/*](src/pipeline))
- How metrics are recorded and exported ([src/observabilty/meter.ts](src/observabilty/meter.ts), [src/observabilty/instrumentation.ts](src/observabilty/instrumentation.ts))
- How logs are correlated with trace IDs ([src/utils/logger.ts](src/utils/logger.ts))
- How request/session/conversation IDs are propagated ([src/middleware/sessionCorrelation.ts](src/middleware/sessionCorrelation.ts))
- How feedback is connected to an earlier trace via span links ([src/routes/feedback.ts](src/routes/feedback.ts))

## Quick architecture map

- **App entrypoint:** `src/main.ts`
  - Loads telemetry first: `import './instrumentation'`
- **Telemetry bootstrap:** `src/observabilty/instrumentation.ts`
  - `NodeSDK`, OTLP exporters, Prometheus exporter, metric views
- **HTTP app + middleware:** `src/app.ts`
  - `requestIdMiddleware` → `sessionCorrelationMiddleware` → `redactionMiddleware`
- **Observability core:**
  - `src/observabilty/span.ts` - `withActiveSpan(...)` handles span lifecycle + error recording
  - `src/observabilty/meter.ts` - metric instruments and recording
  - `src/observabilty/tracer.ts` - tracer configuration
  - `src/observabilty/semantic-conventions.ts` - attribute names and conventions
- **Decorators/wrappers:** `src/decorators/traced.ts`
  - `traced(...)` and `@Traced(...)` create child spans safely
- **Core routes:**
  - `src/routes/query.ts`
  - `src/routes/feedback.ts`
  - `src/routes/health.ts`
- **RAG-ish pipeline:**
  - `src/pipeline/retriever.ts`
  - `src/pipeline/promptBuilder.ts`
  - `src/pipeline/llmClient.ts`
  - `src/pipeline/postProcessor.ts`

## Local setup

1. Install dependencies.
2. Start observability stack (Jaeger + Prometheus + Grafana).
3. Run the API.

You can use:

- `docker compose up -d`
- `npm run dev`

Useful UIs:

- Jaeger: `http://localhost:16686`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (admin/admin)
- App health: `http://localhost:3000/health`
- App metrics scrape endpoint: `http://localhost:9464/metrics`

> Tip: `.env.example` has all important variables. You can copy it to `.env` and modify if needed.

## OpenTelemetry flow in this codebase (simple mental model)

Think of each request as a story:

1. **Request arrives** at `/query`.
2. Middleware attaches IDs (`request.id`, `session.id`, `conversation.id`).
3. Route creates parent span: `llm.query`.
4. Child spans track each pipeline stage:
   - `retrieval knowledge-base-v1`
   - `prompt_construction`
   - `chat`
   - `postprocess`
5. Metrics are recorded (latency, token usage, retries, cost, etc.).
6. Logs include `trace_id` + `span_id` for instant correlation.

Expected span tree (verified in [tests/trace/spans.test.ts](tests/trace/spans.test.ts)):

```text
llm.query
├── retrieval knowledge-base-v1
├── prompt_construction
├── chat
└── postprocess
```

## Tracing examples from current code

### 1) Parent span for `/query`

[src/routes/query.ts](src/routes/query.ts) wraps the request with:

- span name: `llm.query`
- attributes: `request.id`, `session.id`, `conversation.id`, `gen_ai.operation.name=query`

It also records query-level attributes like:

- `gen_ai.query.length`
- `gen_ai.query.top_k_requested`
- `gen_ai.context.documents_retrieved`

### 2) Child spans for pipeline stages

[src/pipeline/retriever.ts](src/pipeline/retriever.ts), [src/pipeline/promptBuilder.ts](src/pipeline/promptBuilder.ts), [src/pipeline/postProcessor.ts](src/pipeline/postProcessor.ts)
use `traced(...)` wrappers.

[src/pipeline/llmClient.ts](src/pipeline/llmClient.ts) uses `@Traced(...)` for `chat` span and adds:

- events: `gen_ai.prompt.sent`, `gen_ai.response.received`, `gen_ai.retry`
- attributes: model/provider/tokens/cost/error type

### 3) Feedback span links

[src/routes/feedback.ts](src/routes/feedback.ts) uses a custom `X-Linked-To` header (not `traceparent`) to link feedback back to the original query trace.
The client sends the `traceparent` value from the `/query` response as `X-Linked-To` on the `/feedback` request.
The middleware parses it and the feedback span is created with a **span link** to the query span.

Using a custom header avoids the `@opentelemetry/instrumentation-http` auto-instrumentation treating it as a parent context, which would cause the feedback request to share the query's trace ID instead of getting its own.

## Metrics examples from current code

Metric instruments are defined in [src/observabilty/meter.ts](src/observabilty/meter.ts) and exported via:

- OTLP metrics exporter (`/v1/metrics`)
- Prometheus scrape endpoint (`/metrics`)

Examples:

- `gen_ai.client.token.usage` (histogram)
- `gen_ai.client.operation.duration` (histogram)
- `gen_ai.request.retry.count` (counter)
- `gen_ai.request.cost.usd` (histogram)
- `rag.retrieval.duration` (histogram)
- `gen_ai.feedback.count` (counter)

Custom bucket boundaries are configured in [src/observabilty/instrumentation.ts](src/observabilty/instrumentation.ts) using views.

## Log correlation

[src/utils/logger.ts](src/utils/logger.ts) injects these fields into each log line (when a span is active):

- `trace_id`
- `span_id`
- `severity_number`

This lets you jump between logs and traces quickly.

## Session/conversation propagation

[src/middleware/sessionCorrelation.ts](src/middleware/sessionCorrelation.ts):

- reads `X-Session-ID` and `X-Conversation-ID`
- stores them on request/response
- writes them into OTel baggage

[src/observabilty/span.ts](src/observabilty/span.ts) reads baggage and auto-adds those IDs to child spans.

That is why child spans can retain session context across nested calls.

## Privacy redaction

[src/middleware/redaction.ts](src/middleware/redaction.ts) can redact incoming/outgoing content.

When redaction happens, it sets:

- attribute: `gen_ai.content.filtered=true`
- event: `gen_ai.content.filtered`

So you can audit privacy filtering in traces.

## Run simple API examples

### Query example

```bash
curl -s http://localhost:3000/query \
  -H 'Content-Type: application/json' \
  -H 'X-Session-ID: sess-001' \
  -H 'X-Conversation-ID: conv-001' \
  -d '{"query":"What is OpenTelemetry?","topK":3}' | jq
```

You will get response fields like:

- `requestId`
- `traceId`
- `sessionId`
- `conversationId`

Use `traceId` in Jaeger to inspect the full span tree.

### Feedback example (linked to query)

```bash
curl -s http://localhost:3000/feedback \
  -H 'Content-Type: application/json' \
  -H 'X-Session-ID: sess-001' \
  -H 'X-Conversation-ID: conv-001' \
  -H 'X-Linked-To: <TRACEPARENT_FROM_QUERY>' \
  -d '{"requestId":"<REQUEST_ID_FROM_QUERY>","rating":5,"accuracy":true,"comment":"Helpful"}' | jq
```

> The `X-Linked-To` header should contain the `traceparent` value returned in the `/query` response body.
> This creates a span link in the feedback trace pointing back to the query trace (visible as `FOLLOWS_FROM` in Jaeger).

## Troubleshooting

- **Telemetry not starting?** Check `/health` and `telemetry.startupError`.
- **Missing env vars?** `src/config.ts` enforces required values (e.g. `OTEL_EXPORTER_OTLP_ENDPOINT`).
- **No traces in Jaeger?** Ensure `docker compose` services are up and app points to `http://localhost:4318`.
- **No app metrics in Prometheus?** Ensure app is running and `http://localhost:9464/metrics` is reachable.

---

## Article

A detailed walkthrough of every pattern in this repo: [article.md](./article.md)

---

If you are new to OpenTelemetry, start by reading these files in order:

1. [src/observabilty/instrumentation.ts](src/observabilty/instrumentation.ts)
2. [src/routes/query.ts](src/routes/query.ts)
3. [src/decorators/traced.ts](src/decorators/traced.ts)
4. [src/pipeline/llmClient.ts](src/pipeline/llmClient.ts)
5. [tests/trace/spans.test.ts](tests/trace/spans.test.ts)

That path gives you the full picture with minimal confusion.
