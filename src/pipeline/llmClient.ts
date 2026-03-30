import { Span, SpanKind, trace } from '@opentelemetry/api';
import OpenAI from 'openai';
import { Logger } from 'pino';
import { sleep, delayWithAbort, getRetryDelay } from '../utils';
import { config, AppConfig } from '../config';
import { Traced } from '../decorators/traced';
import { LLMProviderError, normalizeLlmError } from '../errors';
import { addActiveRequest, incrementRetryCount, recordOperationDuration, recordRequestCost, recordTokenUsage } from '../observabilty/meter';
import { getLogger } from '../utils/logger';
import { recordSpanError } from '../observabilty/span';
import { ATTRS, EVENT_NAMES, NO_ERROR_TYPE, OPERATION_NAMES, SPAN_NAMES } from '../observabilty/semantic-conventions';
import { LLMGenerateOptions, LlmResponse } from '../types/llm';

class LlmClient {
  private readonly openaiClient?: OpenAI;

  constructor(
    private readonly appConfig: AppConfig,
  ) {
    if (!appConfig.llmUseMock && appConfig.openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: appConfig.openaiApiKey });
    }
  }

  private estimateRequestCostUsd(inputTokens: number, outputTokens: number): number {
    const inputUsd = (inputTokens / 1_000_000) * this.appConfig.llmPricing.inputUsdPerMillionTokens;
    const outputUsd = (outputTokens / 1_000_000) * this.appConfig.llmPricing.outputUsdPerMillionTokens;
    return Number((inputUsd + outputUsd).toFixed(6));
  }

  @Traced(SPAN_NAMES.CHAT, { kind: SpanKind.CLIENT, onError: (error, span) => recordSpanError(span, error) })
  public async generateResponse(options: LLMGenerateOptions, logger?: Logger): Promise<LlmResponse> {
    const model = options.model ?? this.appConfig.llmModel;
    const startedAt = Date.now();
    const span = trace.getActiveSpan();
    const requestLogger = logger ?? getLogger({ component: 'llm-client' });
    const baseAttributes = {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.CHAT,
      [ATTRS.GEN_AI_PROVIDER_NAME]: this.appConfig.llmProvider,
      [ATTRS.GEN_AI_REQUEST_MODEL]: model,
    };

    requestLogger.debug({ span_name: SPAN_NAMES.CHAT, model }, 'Span started');

    span?.setAttributes(baseAttributes);
    addActiveRequest(1, baseAttributes);

    span?.setAttribute(ATTRS.GEN_AI_REQUEST_TEMPERATURE, options.temperature ?? 0.7);
    span?.setAttribute(ATTRS.GEN_AI_REQUEST_MAX_TOKENS, options.maxTokens ?? 500);

    const maxAttempts = this.appConfig.llmMaxRetries + 1;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const estimatedPromptTokens = Math.ceil(options.prompt.length / 4);
          span?.addEvent(EVENT_NAMES.GEN_AI_PROMPT_SENT, {
            [ATTRS.GEN_AI_PROMPT_ESTIMATED_TOKENS]: estimatedPromptTokens,
            [ATTRS.RETRY_ATTEMPT]: attempt,
          });

          const response = await this.callWithTimeout(options);
          response.startedAt = startedAt;
          response.completedAt = Date.now();

          const estimatedCostUsd = this.setLLMOtelMetrics(span, response, options);
          response.estimatedCostUsd = estimatedCostUsd;

          requestLogger.debug(
            {
              span_name: SPAN_NAMES.CHAT,
              model: response.model,
              input_tokens: response.usage.inputTokens,
              output_tokens: response.usage.outputTokens,
            },
            'Span completed',
          );

          return response;
        } catch (error) {
          const appError = normalizeLlmError(error);

          const shouldRetry = appError.isRetryable && attempt < maxAttempts;

          if (!shouldRetry) {
            recordOperationDuration((Date.now() - startedAt) / 1000, {
              [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.CHAT,
              [ATTRS.GEN_AI_PROVIDER_NAME]: this.appConfig.llmProvider,
              [ATTRS.GEN_AI_REQUEST_MODEL]: model,
              [ATTRS.GEN_AI_RESPONSE_MODEL]: model,
              [ATTRS.ERROR_TYPE]: appError.errorType,
            });

            requestLogger.debug(
              {
                span_name: SPAN_NAMES.CHAT,
                error_type: appError.errorType,
              },
              'Span completed with error',
            );

            throw appError;
          }

          const delayMs = getRetryDelay(attempt);

          incrementRetryCount({
            [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.CHAT,
            [ATTRS.GEN_AI_PROVIDER_NAME]: this.appConfig.llmProvider,
            [ATTRS.GEN_AI_REQUEST_MODEL]: model,
            [ATTRS.ERROR_TYPE]: appError.errorType,
            [ATTRS.RETRY_ATTEMPT]: attempt,
            [ATTRS.RETRY_DELAY_MS]: delayMs,
          });

          span?.addEvent(EVENT_NAMES.GEN_AI_RETRY, {
            [ATTRS.RETRY_ATTEMPT]: attempt,
            [ATTRS.RETRY_DELAY_MS]: delayMs,
            [ATTRS.ERROR_TYPE]: appError.errorType,
          });

          await sleep(delayMs);
        }
      }
    } finally {
      addActiveRequest(-1, baseAttributes);
    }

    throw new LLMProviderError(502, 'Unexpected retry loop termination');
  }

  private async callWithTimeout(options: LLMGenerateOptions): Promise<LlmResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.appConfig.llmTimeoutMs);

    try {
      return await this.executeRequest(options, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeRequest(options: LLMGenerateOptions, signal: AbortSignal): Promise<LlmResponse> {
    if (this.appConfig.llmUseMock) {
      return this.executeMockRequest(options, signal);
    }

    if (!this.openaiClient) {
      throw new LLMProviderError(500, 'OpenAI client not configured');
    }

    const completion = await this.openaiClient.chat.completions.create(
      {
        model: options.model ?? this.appConfig.llmModel,
        messages: [{ role: 'user', content: options.prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 500,
      },
      { signal },
    );

    const firstChoice = completion.choices[0];
    const content = firstChoice?.message?.content ?? '';

    return {
      id: completion.id,
      model: completion.model,
      finishReasons: completion.choices.map((choice) => choice.finish_reason ?? 'unknown'),
      content: typeof content === 'string' ? content : JSON.stringify(content),
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async executeMockRequest(options: LLMGenerateOptions, signal: AbortSignal): Promise<LlmResponse> {
    if (options.simulateError === 'timeout') {
      await delayWithAbort(this.appConfig.llmTimeoutMs + 20, signal);
    }

    if (options.simulateError === 'rate_limit') {
      throw {
        status: 429,
        message: 'Simulated 429 from provider',
      };
    }

    if (options.simulateError === 'provider') {
      throw {
        status: 503,
        message: 'Simulated upstream provider failure',
      };
    }

    await delayWithAbort(50, signal);

    const userQuestion = options.prompt.split('User question:')[1]?.trim() ?? options.prompt;
    const answer = `Based on retrieved context: ${userQuestion.slice(0, 400)}`;

    return {
      id: `mock-${Date.now()}`,
      model: options.model ?? this.appConfig.llmModel,
      finishReasons: ['stop'],
      content: answer,
      usage: {
        inputTokens: Math.max(1, Math.ceil(options.prompt.length / 4)),
        outputTokens: Math.max(1, Math.ceil(answer.length / 4)),
      },
    };
  }

  private setLLMOtelMetrics(span: Span | undefined, response: LlmResponse, options: LLMGenerateOptions): number {

    span?.setAttribute(ATTRS.GEN_AI_RESPONSE_MODEL, response.model);
    span?.setAttribute(ATTRS.GEN_AI_USAGE_INPUT_TOKENS, response.usage.inputTokens);
    span?.setAttribute(ATTRS.GEN_AI_USAGE_OUTPUT_TOKENS, response.usage.outputTokens);
    span?.setAttribute(ATTRS.GEN_AI_RESPONSE_FINISH_REASONS, response.finishReasons);
    span?.setAttribute(ATTRS.GEN_AI_RESPONSE_ID, response.id);

    span?.addEvent(EVENT_NAMES.GEN_AI_RESPONSE_RECEIVED, {
      [ATTRS.GEN_AI_RESPONSE_FINISH_REASONS]: response.finishReasons,
      [ATTRS.GEN_AI_USAGE_INPUT_TOKENS]: response.usage.inputTokens,
      [ATTRS.GEN_AI_USAGE_OUTPUT_TOKENS]: response.usage.outputTokens,
    });

    recordTokenUsage(response.usage.inputTokens, {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.CHAT,
      [ATTRS.GEN_AI_PROVIDER_NAME]: this.appConfig.llmProvider,
      [ATTRS.GEN_AI_TOKEN_TYPE]: 'input',
      [ATTRS.GEN_AI_REQUEST_MODEL]: options.model ?? this.appConfig.llmModel,
      [ATTRS.GEN_AI_RESPONSE_MODEL]: response.model,
    });

    recordTokenUsage(response.usage.outputTokens, {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.CHAT,
      [ATTRS.GEN_AI_PROVIDER_NAME]: this.appConfig.llmProvider,
      [ATTRS.GEN_AI_TOKEN_TYPE]: 'output',
      [ATTRS.GEN_AI_REQUEST_MODEL]: options.model ?? this.appConfig.llmModel,
      [ATTRS.GEN_AI_RESPONSE_MODEL]: response.model,
    });

    recordOperationDuration((response?.completedAt! - response?.startedAt!) / 1000, {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.CHAT,
      [ATTRS.GEN_AI_PROVIDER_NAME]: this.appConfig.llmProvider,
      [ATTRS.GEN_AI_REQUEST_MODEL]: options.model ?? this.appConfig.llmModel,
      [ATTRS.GEN_AI_RESPONSE_MODEL]: response.model,
      [ATTRS.ERROR_TYPE]: NO_ERROR_TYPE,
    });

    const estimatedCostUsd = this.estimateRequestCostUsd(response.usage.inputTokens, response.usage.outputTokens);

    recordRequestCost(estimatedCostUsd, {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.CHAT,
      [ATTRS.GEN_AI_PROVIDER_NAME]: this.appConfig.llmProvider,
      [ATTRS.GEN_AI_REQUEST_MODEL]: options.model ?? this.appConfig.llmModel,
      [ATTRS.GEN_AI_RESPONSE_MODEL]: response.model,
      [ATTRS.ERROR_TYPE]: NO_ERROR_TYPE,
    });

    return estimatedCostUsd;
  }
}

export { LlmClient };
export const llmClient = new LlmClient(config);
