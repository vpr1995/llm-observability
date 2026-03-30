import { Attributes, metrics } from '@opentelemetry/api';
import { METRIC_NAMES, ATTRS } from './semantic-conventions';

export const meter = metrics.getMeter('llm-service', '1.0.0');

export const tokenUsageHistogram = meter.createHistogram(METRIC_NAMES.GEN_AI_CLIENT_TOKEN_USAGE, {
  description: 'Token usage per GenAI request',
  unit: '{token}',
});

export const operationDurationHistogram = meter.createHistogram(METRIC_NAMES.GEN_AI_CLIENT_OPERATION_DURATION, {
  description: 'End-to-end GenAI operation duration',
  unit: 's',
});

export const retrievalDurationHistogram = meter.createHistogram(METRIC_NAMES.RAG_RETRIEVAL_DURATION, {
  description: 'Retrieval latency per query',
  unit: 's',
});

export const promptLengthHistogram = meter.createHistogram(METRIC_NAMES.RAG_PROMPT_LENGTH, {
  description: 'Prompt size per request',
  unit: '{character}',
});

export const retrievalDocumentCountHistogram = meter.createHistogram(METRIC_NAMES.RAG_RETRIEVAL_DOCUMENT_COUNT, {
  description: 'Number of documents retrieved for a query',
  unit: '{document}',
});

export const emptyRetrievalCounter = meter.createCounter(METRIC_NAMES.RAG_RETRIEVAL_EMPTY_COUNT, {
  description: 'Count of retrievals that returned zero documents',
  unit: '{request}',
});

export const requestCounter = meter.createCounter(METRIC_NAMES.GEN_AI_REQUEST_COUNT, {
  description: 'Total count of GenAI requests',
  unit: '{request}',
});

export const errorCounter = meter.createCounter(METRIC_NAMES.GEN_AI_REQUEST_ERROR_COUNT, {
  description: 'Total count of LLM request errors',
  unit: '{error}',
});

export const retryCounter = meter.createCounter(METRIC_NAMES.GEN_AI_REQUEST_RETRY_COUNT, {
  description: 'Total count of LLM request retries',
  unit: '{retry}',
});

export const activeRequestCounter = meter.createUpDownCounter(METRIC_NAMES.GEN_AI_CLIENT_ACTIVE_REQUESTS, {
  description: 'Current number of active in-flight LLM client requests',
  unit: '{request}',
});

export const costHistogram = meter.createHistogram(METRIC_NAMES.GEN_AI_REQUEST_COST_USD, {
  description: 'Estimated cost per LLM request',
  unit: '$',
});

export const feedbackRatingHistogram = meter.createHistogram(METRIC_NAMES.GEN_AI_FEEDBACK_RATING, {
  description: 'User feedback rating on response quality',
  unit: '{rating}',
});

export const feedbackCounter = meter.createCounter(METRIC_NAMES.GEN_AI_FEEDBACK_COUNT, {
  description: 'Total count of feedback submissions',
  unit: '{feedback}',
});

export const answerAccuracyCounter = meter.createCounter(METRIC_NAMES.GEN_AI_ANSWER_ACCURACY_COUNT, {
  description: 'Total count of accurate and inaccurate answers',
  unit: '{result}',
});

export const postProcessDurationHistogram = meter.createHistogram(METRIC_NAMES.GEN_AI_POSTPROCESS_DURATION, {
  description: 'Post-processing duration per generated answer',
  unit: 's',
});

export const postProcessOutputLengthHistogram = meter.createHistogram(METRIC_NAMES.GEN_AI_POSTPROCESS_OUTPUT_LENGTH, {
  description: 'Post-processed answer length',
  unit: '{character}',
});

export const recordTokenUsage = (value: number, attributes: Attributes): void => {
  tokenUsageHistogram.record(value, attributes);
};

export const recordOperationDuration = (durationSeconds: number, attributes: Attributes): void => {
  operationDurationHistogram.record(durationSeconds, attributes);
};

export const recordRetrievalDuration = (durationSeconds: number, attributes: Attributes): void => {
  retrievalDurationHistogram.record(durationSeconds, attributes);
};

export const recordPromptLength = (length: number, attributes: Attributes): void => {
  promptLengthHistogram.record(length, attributes);
};

export const recordRetrievalDocumentCount = (count: number, attributes: Attributes): void => {
  retrievalDocumentCountHistogram.record(count, attributes);
};

export const incrementEmptyRetrievalCount = (attributes: Attributes): void => {
  emptyRetrievalCounter.add(1, attributes);
};

export const incrementRequestCount = (attributes: Attributes): void => {
  requestCounter.add(1, attributes);
};

export const incrementErrorCount = (attributes: Attributes): void => {
  errorCounter.add(1, attributes);
};

export const incrementRetryCount = (attributes: Attributes): void => {
  retryCounter.add(1, attributes);
};

export const addActiveRequest = (delta: number, attributes: Attributes): void => {
  activeRequestCounter.add(delta, attributes);
};

export const recordRequestCost = (costUsd: number, attributes: Attributes): void => {
  costHistogram.record(costUsd, attributes);
};

export const recordFeedbackRating = (rating: number, attributes: Attributes): void => {
  feedbackRatingHistogram.record(rating, attributes);
};

export const incrementFeedbackCount = (attributes: Attributes): void => {
  feedbackCounter.add(1, attributes);
};

export const incrementAnswerAccuracyCount = (accurate: boolean, attributes: Attributes): void => {
  answerAccuracyCounter.add(1, {
    ...attributes,
    [ATTRS.ANSWER_ACCURATE]: accurate,
  });
};

export const recordPostProcessDuration = (durationSeconds: number, attributes: Attributes): void => {
  postProcessDurationHistogram.record(durationSeconds, attributes);
};

export const recordPostProcessOutputLength = (length: number, attributes: Attributes): void => {
  postProcessOutputLengthHistogram.record(length, attributes);
};
