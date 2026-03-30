import request from 'supertest';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import { createApp } from '../../src/app';
import { AppConfig, config } from '../../src/config';
import { LlmClient } from '../../src/pipeline/llmClient';

const makeConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  ...config,
  llmUseMock: true,
  llmMaxRetries: 0,
  llmTimeoutMs: 250,
  ...overrides,
});

describe('POST /feedback', () => {
  it('accepts valid feedback payloads', async () => {
    const app = createApp(new LlmClient(makeConfig()));

    const response = await request(app)
      .post('/feedback')
      .send({
        requestId: 'req-123',
        rating: 5,
        accuracy: true,
        comment: 'Helpful answer',
      })
      .expect(202);

    expect(response.body).toMatchObject({
      accepted: true,
      feedbackId: expect.any(String),
      requestId: 'req-123',
    });
  });

  it('returns 400 for invalid feedback payloads', async () => {
    const app = createApp(new LlmClient(makeConfig()));

    const response = await request(app).post('/feedback').send({ rating: 10 });

    expect(response.status).toBe(400);
  });

  it('gets its own traceId when traceparent is forwarded from query', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();

    try {
      const app = createApp(new LlmClient(makeConfig()));

      // 1. Make a query to get a traceparent
      const queryRes = await request(app)
        .post('/query')
        .set('X-Session-ID', 'sess-trace-test')
        .send({ query: 'trace id test' })
        .expect(200);

      const { traceId: queryTraceId, traceparent } = queryRes.body;
      expect(queryTraceId).toBeTruthy();
      expect(traceparent).toBeTruthy();

      // 2. Send feedback with the X-Linked-To header (not traceparent) from the query
      const feedbackRes = await request(app)
        .post('/feedback')
        .set('X-Session-ID', 'sess-trace-test')
        .set('X-Linked-To', traceparent)
        .send({
          requestId: queryRes.body.requestId,
          rating: 4,
          accuracy: true,
          comment: 'trace linking test',
        })
        .expect(202);

      // 3. Feedback must have its own traceId, different from the query's
      expect(feedbackRes.body.traceId).toBeTruthy();
      expect(feedbackRes.body.traceId).not.toBe(queryTraceId);

      // 4. Feedback's linkedTraceId should point back to the query
      expect(feedbackRes.body.linkedTraceId).toBe(queryTraceId);
    } finally {
      await provider.shutdown();
    }
  });
});