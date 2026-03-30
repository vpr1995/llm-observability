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

describe('session correlation', () => {
  it('echoes session and conversation ids on query responses', async () => {
    const app = createApp(new LlmClient(makeConfig()));

    const response = await request(app)
      .post('/query')
      .set('X-Session-ID', 'session-123')
      .set('X-Conversation-ID', 'conversation-456')
      .send({ query: 'track my session' })
      .expect(200);

    expect(response.headers['x-session-id']).toBe('session-123');
    expect(response.headers['x-conversation-id']).toBe('conversation-456');
    expect(response.body.sessionId).toBe('session-123');
    expect(response.body.conversationId).toBe('conversation-456');
  });
});