const { sleepMock } = vi.hoisted(() => ({
  sleepMock: vi.fn<(delayMs: number) => Promise<void>>(async () => undefined),
}));

vi.mock('../../src/utils', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
  return {
    ...actual,
    sleep: sleepMock,
  };
});

import { AppConfig, config } from '../../src/config';
import {
  LLMProviderError,
  LLMTimeoutError,
} from '../../src/errors';
import * as meter from '../../src/observabilty/meter';
import { LlmClient } from '../../src/pipeline/llmClient';
import { OPERATION_NAMES } from '../../src/observabilty/semantic-conventions';
import { expectMetricRecorded } from '../utils/metricAssertions';

const makeConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  ...config,
  llmUseMock: true,
  llmMaxRetries: 0,
  llmTimeoutMs: 250,
  ...overrides,
});

describe('LlmClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a mock response on success', async () => {
    const recordTokenUsageSpy = vi.spyOn(meter, 'recordTokenUsage').mockImplementation(() => undefined);
    const recordOperationDurationSpy = vi.spyOn(meter, 'recordOperationDuration').mockImplementation(() => undefined);
    const recordRequestCostSpy = vi.spyOn(meter, 'recordRequestCost').mockImplementation(() => undefined);
    const activeRequestSpy = vi.spyOn(meter, 'addActiveRequest').mockImplementation(() => undefined);

    const client = new LlmClient(makeConfig());

    const response = await client.generateResponse({ prompt: 'User question: hello' });

    expect(response.content).toContain('Based on retrieved context');
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.estimatedCostUsd).toBeGreaterThan(0);
    expect(recordTokenUsageSpy).toHaveBeenCalledTimes(2);
    expect(recordOperationDurationSpy).toHaveBeenCalled();
    expect(recordRequestCostSpy).toHaveBeenCalledTimes(1);
    expect(activeRequestSpy).toHaveBeenNthCalledWith(1, 1, expect.any(Object));
    expect(activeRequestSpy).toHaveBeenLastCalledWith(-1, expect.any(Object));
    expectMetricRecorded(recordOperationDurationSpy, { 'gen_ai.operation.name': OPERATION_NAMES.CHAT });
  });

  it('retries transient failures with exponential backoff', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const incrementRetryCountSpy = vi.spyOn(meter, 'incrementRetryCount').mockImplementation(() => undefined);

    const client = new LlmClient(
      makeConfig({ llmMaxRetries: 2 }),
    );

    await expect(
      client.generateResponse({
        prompt: 'User question: fail',
        simulateError: 'provider',
      }),
    ).rejects.toBeInstanceOf(LLMProviderError);

    const delays = sleepMock.mock.calls.map(([delayMs]) => delayMs);

    expect(delays).toEqual([1000, 2000]);
    expect(incrementRetryCountSpy).toHaveBeenCalled();
  });

  it('throws timeout error for aborted requests', async () => {
    const client = new LlmClient(makeConfig({ llmTimeoutMs: 5, llmMaxRetries: 0 }));

    await expect(
      client.generateResponse({
        prompt: 'User question: timeout',
        simulateError: 'timeout',
      }),
    ).rejects.toBeInstanceOf(LLMTimeoutError);
  });

});
