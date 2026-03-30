import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

export {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
};

export const OPERATION_NAMES = {
  QUERY: 'query',
  RETRIEVAL: 'retrieval',
  PROMPT_CONSTRUCTION: 'prompt_construction',
  CHAT: 'chat',
  POSTPROCESS: 'postprocess',
  FEEDBACK: 'feedback',
} as const;

export const SPAN_NAMES = {
  QUERY: 'llm.query',
  FEEDBACK: 'llm.feedback',
  RETRIEVAL: 'retrieval knowledge-base-v1',
  PROMPT_CONSTRUCTION: 'prompt_construction',
  CHAT: 'chat',
  POSTPROCESS: 'postprocess',
} as const;

export const EVENT_NAMES = {
  GEN_AI_PROMPT_SENT: 'gen_ai.prompt.sent',
  GEN_AI_RESPONSE_RECEIVED: 'gen_ai.response.received',
  GEN_AI_CONTENT_FILTERED: 'gen_ai.content.filtered',
  RAG_RETRIEVAL_COMPLETE: 'rag.retrieval.complete',
  GEN_AI_RETRY: 'gen_ai.retry',
} as const;

export const ATTRS = {
  ERROR_TYPE: 'error.type',

  REQUEST_ID: 'request.id',
  SESSION_ID: 'session.id',
  CONVERSATION_ID: 'conversation.id',

  GEN_AI_OPERATION_NAME: 'gen_ai.operation.name',
  GEN_AI_PROVIDER_NAME: 'gen_ai.provider.name',

  GEN_AI_REQUEST_MODEL: 'gen_ai.request.model',
  GEN_AI_REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  GEN_AI_REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  GEN_AI_REQUEST_TOP_K: 'gen_ai.request.top_k',
  GEN_AI_REQUEST_COUNT: 'gen_ai.request.count',

  GEN_AI_QUERY_LENGTH: 'gen_ai.query.length',
  GEN_AI_QUERY_TOP_K_REQUESTED: 'gen_ai.query.top_k_requested',

  GEN_AI_RESPONSE_MODEL: 'gen_ai.response.model',
  GEN_AI_RESPONSE_ID: 'gen_ai.response.id',
  GEN_AI_RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',

  GEN_AI_USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  GEN_AI_USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  GEN_AI_USAGE_ESTIMATED_COST_USD: 'gen_ai.usage.estimated_cost_usd',

  GEN_AI_TOKEN_TYPE: 'gen_ai.token.type',
  GEN_AI_CONTENT_FILTERED: 'gen_ai.content.filtered',

  GEN_AI_PROMPT_CHARACTERS: 'gen_ai.prompt.characters',
  GEN_AI_PROMPT_DOCUMENT_COUNT: 'gen_ai.prompt.document_count',
  GEN_AI_PROMPT_ESTIMATED_TOKENS: 'gen_ai.prompt.estimated_tokens',

  GEN_AI_CONTEXT_DOCUMENTS_RETRIEVED: 'gen_ai.context.documents_retrieved',
  GEN_AI_CONTEXT_MIN_SCORE: 'gen_ai.context.min_score',
  GEN_AI_CONTEXT_MAX_SCORE: 'gen_ai.context.max_score',

  GEN_AI_DATA_SOURCE_ID: 'gen_ai.data_source.id',
  GEN_AI_RETRIEVAL_DOCUMENTS: 'gen_ai.retrieval.documents',
  GEN_AI_RETRIEVAL_MIN_SCORE: 'gen_ai.retrieval.min_score',
  GEN_AI_RETRIEVAL_MAX_SCORE: 'gen_ai.retrieval.max_score',
  GEN_AI_RETRIEVAL_AVG_SCORE: 'gen_ai.retrieval.avg_score',

  RAG_RETRIEVAL_RETURNED_COUNT: 'rag.retrieval.returned_count',

  RETRY_ATTEMPT: 'retry.attempt',
  RETRY_DELAY_MS: 'retry.delay_ms',

  POSTPROCESS_SUMMARY_LENGTH: 'postprocess.summary_length',

  FEEDBACK_SOURCE: 'feedback.source',
  FEEDBACK_REQUEST_ID: 'gen_ai.feedback.request_id',
  FEEDBACK_COMMENT_LENGTH: 'gen_ai.feedback.comment_length',
  FEEDBACK_RATING: 'gen_ai.feedback.rating',
  FEEDBACK_ACCURACY: 'gen_ai.feedback.accuracy',
  ANSWER_ACCURATE: 'answer.accurate',
} as const;

export const METRIC_NAMES = {
  GEN_AI_CLIENT_TOKEN_USAGE: 'gen_ai.client.token.usage',
  GEN_AI_CLIENT_OPERATION_DURATION: 'gen_ai.client.operation.duration',
  GEN_AI_CLIENT_ACTIVE_REQUESTS: 'gen_ai.client.active_requests',

  GEN_AI_REQUEST_COUNT: 'gen_ai.request.count',
  GEN_AI_REQUEST_ERROR_COUNT: 'gen_ai.request.error.count',
  GEN_AI_REQUEST_RETRY_COUNT: 'gen_ai.request.retry.count',
  GEN_AI_REQUEST_COST_USD: 'gen_ai.request.cost.usd',

  RAG_RETRIEVAL_DURATION: 'rag.retrieval.duration',
  RAG_PROMPT_LENGTH: 'rag.prompt.length',
  RAG_RETRIEVAL_DOCUMENT_COUNT: 'rag.retrieval.document.count',
  RAG_RETRIEVAL_EMPTY_COUNT: 'rag.retrieval.empty.count',

  GEN_AI_POSTPROCESS_DURATION: 'gen_ai.postprocess.duration',
  GEN_AI_POSTPROCESS_OUTPUT_LENGTH: 'gen_ai.postprocess.output.length',

  GEN_AI_FEEDBACK_RATING: 'gen_ai.feedback.rating',
  GEN_AI_FEEDBACK_COUNT: 'gen_ai.feedback.count',
  GEN_AI_ANSWER_ACCURACY_COUNT: 'gen_ai.answer.accuracy.count',
} as const;

export const TOKEN_USAGE_BUCKETS = [
  1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216, 67108864,
];

export const DURATION_BUCKETS = [
  0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48, 40.96, 81.92,
];

export const RETRIEVAL_DOCUMENT_COUNT_BUCKETS = [0, 1, 2, 3, 4, 5, 8, 10, 15, 20];

export const COST_BUCKETS = [0.001, 0.01, 0.1, 1, 10, 100];

export const FEEDBACK_RATING_BUCKETS = [1, 2, 3, 4, 5];

export const NO_ERROR_TYPE = 'none' as const;
