import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import request from 'supertest';

import { createApp } from '../../src/app';
import { AppConfig, config } from '../../src/config';
import { LlmClient } from '../../src/pipeline/llmClient';

const makeConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  ...config,
  llmUseMock: true,
  llmMaxRetries: 1,
  llmTimeoutMs: 250,
  ...overrides,
});

describe('trace spans for /query', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  beforeAll(() => {
    provider.register();
  });

  beforeEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  it('captures retrieval/chat/postprocess spans with expected gen_ai attributes', async () => {
    const app = createApp(new LlmClient(makeConfig()));

    await request(app).post('/query').send({ query: 'trace happy path' }).expect(200);

    const spans = exporter.getFinishedSpans();

    const retrievalSpan = spans.find((span) => span.name.startsWith('retrieval'));
    const promptSpan = spans.find((span) => span.name === 'prompt_construction');
    const chatSpan = spans.find((span) => span.name.startsWith('chat'));
    const postprocessSpan = spans.find((span) => span.name === 'postprocess');
    const querySpan = spans.find((span) => span.name === 'llm.query');

    expect(retrievalSpan).toBeDefined();
    expect(promptSpan).toBeDefined();
    expect(chatSpan).toBeDefined();
    expect(postprocessSpan).toBeDefined();
    expect(querySpan).toBeDefined();

    expect(retrievalSpan?.kind).toBe(SpanKind.CLIENT);
    expect(chatSpan?.kind).toBe(SpanKind.CLIENT);

    expect(chatSpan?.attributes['gen_ai.operation.name']).toBe('chat');
    expect(chatSpan?.attributes['gen_ai.provider.name']).toBe(config.llmProvider);
    expect(chatSpan?.attributes['gen_ai.request.model']).toBe(config.llmModel);
    expect(chatSpan?.attributes['gen_ai.usage.input_tokens']).toEqual(expect.any(Number));
    expect(chatSpan?.attributes['gen_ai.usage.output_tokens']).toEqual(expect.any(Number));
    expect(chatSpan?.events.some((event) => event.name === 'gen_ai.prompt.sent')).toBe(true);
    expect(chatSpan?.events.some((event) => event.name === 'gen_ai.response.received')).toBe(true);

    expect(retrievalSpan?.events.some((event) => event.name === 'rag.retrieval.complete')).toBe(true);

    const querySpanId = querySpan?.spanContext().spanId;
    const retrievalParent = (retrievalSpan as any)?.parentSpanContext?.spanId ?? (retrievalSpan as any)?.parentSpanId;
    const promptParent = (promptSpan as any)?.parentSpanContext?.spanId ?? (promptSpan as any)?.parentSpanId;
    const chatParent = (chatSpan as any)?.parentSpanContext?.spanId ?? (chatSpan as any)?.parentSpanId;
    const postprocessParent = (postprocessSpan as any)?.parentSpanContext?.spanId ?? (postprocessSpan as any)?.parentSpanId;

    expect(retrievalParent).toBe(querySpanId);
    expect(promptParent).toBe(querySpanId);
    expect(chatParent).toBe(querySpanId);
    expect(postprocessParent).toBe(querySpanId);

  });

  it('creates an app-level llm.query span with prompt instrumentation', async () => {
    const app = createApp(new LlmClient(makeConfig()));

    await request(app).post('/query').send({ query: 'trace happy path', topK: 3 }).expect(200);

    const spans = exporter.getFinishedSpans();

    const querySpan = spans.find((span) => span.name === 'llm.query');
    const promptSpan = spans.find((span) => span.name === 'prompt_construction');

    expect(querySpan).toBeDefined();
    expect(promptSpan).toBeDefined();

    expect(querySpan?.kind).toBe(SpanKind.INTERNAL);
    expect(querySpan?.attributes['request.id']).toEqual(expect.any(String));
    expect(querySpan?.attributes['session.id']).toEqual(expect.any(String));
    expect(querySpan?.attributes['conversation.id']).toEqual(expect.any(String));
    expect(querySpan?.attributes['gen_ai.query.length']).toBeGreaterThan(0);
    expect(querySpan?.attributes['gen_ai.query.top_k_requested']).toBe(3);
    expect(querySpan?.attributes['gen_ai.context.documents_retrieved']).toBeGreaterThan(0);
    expect(querySpan?.attributes['gen_ai.context.min_score']).toEqual(expect.any(Number));
    expect(querySpan?.attributes['gen_ai.context.max_score']).toEqual(expect.any(Number));

    expect(promptSpan?.kind).toBe(SpanKind.INTERNAL);
    expect(promptSpan?.attributes['gen_ai.operation.name']).toBe('prompt_construction');
    expect(promptSpan?.attributes['gen_ai.prompt.characters']).toEqual(expect.any(Number));
    expect(promptSpan?.attributes['gen_ai.prompt.document_count']).toBe(3);
    expect(promptSpan?.attributes['gen_ai.prompt.estimated_tokens']).toEqual(expect.any(Number));
    expect(promptSpan?.attributes['gen_ai.retrieval.min_score']).toEqual(expect.any(Number));
    expect(promptSpan?.attributes['gen_ai.retrieval.max_score']).toEqual(expect.any(Number));
    expect(promptSpan?.attributes['gen_ai.retrieval.avg_score']).toEqual(expect.any(Number));

    const promptParentSpanId = (promptSpan as any)?.parentSpanContext?.spanId ?? (promptSpan as any)?.parentSpanId;
    expect(promptParentSpanId).toBe(querySpan?.spanContext().spanId);
  });

  it('records retry event and error.type for failed chat span', async () => {
    const app = createApp(new LlmClient(makeConfig({ llmMaxRetries: 1 })));

    await request(app)
      .post('/query')
      .send({ query: 'trace error path', simulateError: 'provider' })
      .expect(502);

    const spans = exporter.getFinishedSpans();
    const chatSpan = spans.find((span) => span.name.startsWith('chat'));

    expect(chatSpan).toBeDefined();
    expect(chatSpan?.attributes['error.type']).toBe('llm_provider_error');
    expect(chatSpan?.events.some((event) => event.name === 'gen_ai.retry')).toBe(true);
    expect(chatSpan?.status.code).toBe(SpanStatusCode.ERROR);
    expect(chatSpan?.events.some((event) => event.name === 'exception')).toBe(true);

  });

  it('creates a span link from feedback to original query span', async () => {
    const app = createApp(new LlmClient(makeConfig()));

    const queryResponse = await request(app)
      .post('/query')
      .send({ query: 'trace feedback link path' })
      .expect(200);

    await request(app)
      .post('/feedback')
      .set('X-Linked-To', queryResponse.body.traceparent)
      .send({ requestId: queryResponse.body.requestId, rating: 5, accuracy: true })
      .expect(202);

    const spans = exporter.getFinishedSpans();
    const querySpan = spans.find(
      (span) => span.name === 'llm.query' && span.attributes['request.id'] === queryResponse.body.requestId,
    );
    const feedbackSpan = spans.find(
      (span) => span.name === 'llm.feedback' && span.attributes['gen_ai.feedback.request_id'] === queryResponse.body.requestId,
    );

    expect(querySpan).toBeDefined();
    expect(feedbackSpan).toBeDefined();

    const hasLink = feedbackSpan?.links.some(
      (link) =>
        link.context.traceId === querySpan?.spanContext().traceId
        && link.context.spanId === querySpan?.spanContext().spanId,
    );

    expect(hasLink).toBe(true);
  });

  it('propagates session and conversation IDs to child spans via baggage', async () => {
    const app = createApp(new LlmClient(makeConfig()));

    await request(app)
      .post('/query')
      .set('X-Session-ID', 'sess-baggage-1')
      .set('X-Conversation-ID', 'conv-baggage-1')
      .send({ query: 'baggage propagation path' })
      .expect(200);

    const spans = exporter.getFinishedSpans();
    const childSpans = spans.filter((span) => ['retrieval knowledge-base-v1', 'prompt_construction', 'chat', 'postprocess'].includes(span.name));

    expect(childSpans.length).toBe(4);

    for (const span of childSpans) {
      expect(span.attributes['session.id']).toBe('sess-baggage-1');
      expect(span.attributes['conversation.id']).toBe('conv-baggage-1');
    }
  });
});
