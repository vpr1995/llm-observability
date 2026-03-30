export const ERROR_TYPES = {
  INTERNAL: 'internal_error',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  LLM_PROVIDER: 'llm_provider_error',
  RETRIEVER: 'retriever_error',
  PROMPT_BUILDER: 'prompt_builder_error',
  POST_PROCESSOR: 'post_processor_error',
  BAD_REQUEST: 'bad_request',
} as const;

export type ErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorType: ErrorType,
    public readonly isRetryable: boolean,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class LLMTimeoutError extends AppError {
  constructor(message = 'LLM request timed out') {
    super(message, 504, ERROR_TYPES.TIMEOUT, true);
  }
}

export class LLMRateLimitError extends AppError {
  constructor(message = 'LLM provider rate limited the request', public readonly retryAfterMs?: number) {
    super(message, 429, ERROR_TYPES.RATE_LIMIT, true);
  }
}

export class LLMProviderError extends AppError {
  constructor(public readonly upstreamStatusCode = 500, message = 'LLM provider error') {
    super(message, 502, ERROR_TYPES.LLM_PROVIDER, upstreamStatusCode >= 500);
  }
}

export class RetrieverError extends AppError {
  constructor(message = 'Retriever failed to fetch supporting documents') {
    super(message, 502, ERROR_TYPES.RETRIEVER, false);
  }
}

export class PromptBuilderError extends AppError {
  constructor(message = 'Prompt builder failed to construct prompt') {
    super(message, 500, ERROR_TYPES.PROMPT_BUILDER, false);
  }
}

export class PostProcessorError extends AppError {
  constructor(message = 'Post-processor failed to process model output') {
    super(message, 500, ERROR_TYPES.POST_PROCESSOR, false);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, ERROR_TYPES.BAD_REQUEST, false);
  }
}

const isTimeoutError = (error: unknown): boolean => {
  const typed = error as { name?: string; code?: string };
  return typed?.name === 'AbortError' || typed?.code === 'ETIMEDOUT';
};

const getErrorStatus = (error: {
  status?: number;
  statusCode?: number;
  response?: { status?: number };
}): number | undefined => error.status ?? error.statusCode ?? error.response?.status;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const typed = error as { message?: string };
  return typed.message ?? fallback;
};

export const normalizeLlmError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (isTimeoutError(error)) {
    return new LLMTimeoutError();
  }

  const typedError = error as {
    status?: number;
    statusCode?: number;
    message?: string;
    response?: { status?: number };
  };

  const status = getErrorStatus(typedError);

  if (status === 429) {
    return new LLMRateLimitError(getErrorMessage(error, 'Rate limited by LLM provider'));
  }

  if (status && status >= 500) {
    return new LLMProviderError(status, getErrorMessage(error, `LLM provider returned status ${status}`));
  }

  return new LLMProviderError(status ?? 502, getErrorMessage(error, 'Unexpected LLM provider error'));
};
