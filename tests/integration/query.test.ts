import request from 'supertest';

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

const createTestApp = () => {
  const client = new LlmClient(makeConfig());
  return createApp(client);
};

describe('POST /query', () => {
  it('returns 200 and expected shape for valid request', async () => {
    const app = createTestApp();

    const response = await request(app).post('/query').send({ query: 'What is OpenTelemetry?' });

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body).toMatchObject({
      requestId: expect.any(String),
      traceId: expect.any(String),
      traceparent: expect.any(String),
      query: 'What is OpenTelemetry?',
      answer: expect.any(String),
      usage: {
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
      },
      model: expect.any(String),
    });
    expect(Array.isArray(response.body.sources)).toBe(true);
  });

  it('returns 400 for malformed body', async () => {
    const app = createTestApp();

    const response = await request(app).post('/query').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.type).toBe('bad_request');
  });

  it('returns 502 on LLM provider failure', async () => {
    const app = createTestApp();

    const response = await request(app).post('/query').send({ query: 'fail', simulateError: 'provider' });

    expect(response.status).toBe(502);
    expect(response.body.error.type).toBe('llm_provider_error');
  });

});
