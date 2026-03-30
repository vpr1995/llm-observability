import { SpanKind, trace } from '@opentelemetry/api';
import { Logger } from 'pino';

import { traced } from '../decorators/traced';
import { RetrieverError } from '../errors';
import { getLogger } from '../utils/logger';
import { incrementEmptyRetrievalCount, recordRetrievalDocumentCount, recordRetrievalDuration } from '../observabilty/meter';
import { recordSpanError } from '../observabilty/span';
import { ATTRS, EVENT_NAMES, NO_ERROR_TYPE, OPERATION_NAMES, SPAN_NAMES } from '../observabilty/semantic-conventions';
import { RetrievedDocument } from '../types/llm';

const RETRIEVAL_DATA_SOURCE_ID = 'knowledge-base-v1';

const KNOWLEDGE_BASE: RetrievedDocument[] = [
  {
    id: 'doc-1',
    source: 'kb://observability/otel-intro',
    score: 0.96,
    content: 'OpenTelemetry standardizes traces, metrics, and logs for distributed systems.',
  },
  {
    id: 'doc-2',
    source: 'kb://observability/genai-semconv',
    score: 0.93,
    content:
      'Gen AI semantic conventions include gen_ai.operation.name, model information, and token usage attributes.',
  },
  {
    id: 'doc-3',
    source: 'kb://observability/rag-pipeline',
    score: 0.89,
    content: 'RAG pipelines often include retrieval, prompt construction, generation, and post-processing.',
  },
  {
    id: 'doc-4',
    source: 'kb://resilience/retries',
    score: 0.85,
    content: 'Retry with exponential backoff and jitter is recommended for transient failures and rate limits.',
  },
  {
    id: 'doc-5',
    source: 'kb://resilience/circuit-breaker',
    score: 0.82,
    content: 'Circuit breaker protects downstream systems by failing fast after consecutive failures.',
  },
  {
    id: 'doc-6',
    source: 'kb://observability/log-correlation',
    score: 0.81,
    content: 'Log correlation with trace_id and span_id dramatically improves debugging speed.',
  },
];

const scoreDocument = (query: string, doc: RetrievedDocument): number => {
  const queryTokens = query.toLowerCase().split(/\s+/);
  const content = `${doc.content} ${doc.source}`.toLowerCase();

  const overlap = queryTokens.filter((token) => content.includes(token)).length;
  const overlapBoost = overlap / Math.max(queryTokens.length, 1);

  return Number((doc.score + overlapBoost * 0.15).toFixed(4));
};

const _retrieveDocuments = async (query: string, topK = 5, logger?: Logger): Promise<RetrievedDocument[]> => {
  const startedAt = Date.now();
  const requestLogger = logger ?? getLogger({ component: 'retriever' });

  requestLogger.debug({ span_name: SPAN_NAMES.RETRIEVAL, top_k: topK }, 'Span started');

  if (!query || typeof query !== 'string') {
    throw new RetrieverError('Query must be a non-empty string');
  }

  if (query.includes('__retriever_fail__')) {
    throw new RetrieverError('Simulated retriever failure');
  }

  try {
    const ranked = KNOWLEDGE_BASE.map((doc) => ({
      ...doc,
      score: scoreDocument(query, doc),
    }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));

    const span = trace.getActiveSpan();

    span?.setAttribute(ATTRS.GEN_AI_REQUEST_TOP_K, topK);
    span?.setAttribute(
      ATTRS.GEN_AI_RETRIEVAL_DOCUMENTS,
      JSON.stringify(ranked.map((doc) => `${doc.id}:${doc.score.toFixed(4)}`)),
    );
    span?.addEvent(EVENT_NAMES.RAG_RETRIEVAL_COMPLETE, {
      [ATTRS.RAG_RETRIEVAL_RETURNED_COUNT]: ranked.length,
    });

    const durationSeconds = (Date.now() - startedAt) / 1000;
    recordRetrievalDuration(durationSeconds, {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.RETRIEVAL,
      [ATTRS.GEN_AI_DATA_SOURCE_ID]: RETRIEVAL_DATA_SOURCE_ID,
      [ATTRS.GEN_AI_REQUEST_TOP_K]: topK,
      [ATTRS.RAG_RETRIEVAL_RETURNED_COUNT]: ranked.length,
      [ATTRS.ERROR_TYPE]: NO_ERROR_TYPE,
    });
    recordRetrievalDocumentCount(ranked.length, {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.RETRIEVAL,
      [ATTRS.GEN_AI_DATA_SOURCE_ID]: RETRIEVAL_DATA_SOURCE_ID,
      [ATTRS.GEN_AI_REQUEST_TOP_K]: topK,
    });

    if (ranked.length === 0) {
      incrementEmptyRetrievalCount({
        [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.RETRIEVAL,
        [ATTRS.GEN_AI_DATA_SOURCE_ID]: RETRIEVAL_DATA_SOURCE_ID,
        [ATTRS.GEN_AI_REQUEST_TOP_K]: topK,
      });
    }

    requestLogger.debug(
      { span_name: SPAN_NAMES.RETRIEVAL, top_k: topK, document_count: ranked.length },
      'Span completed',
    );

    return ranked;
  } catch (error) {
    const retrieverError =
      error instanceof RetrieverError
        ? error
        : new RetrieverError(error instanceof Error ? error.message : 'Retriever encountered an unknown error');

    const durationSeconds = (Date.now() - startedAt) / 1000;
    recordRetrievalDuration(durationSeconds, {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.RETRIEVAL,
      [ATTRS.GEN_AI_DATA_SOURCE_ID]: RETRIEVAL_DATA_SOURCE_ID,
      [ATTRS.GEN_AI_REQUEST_TOP_K]: topK,
      [ATTRS.RAG_RETRIEVAL_RETURNED_COUNT]: 0,
      [ATTRS.ERROR_TYPE]: retrieverError.errorType,
    });

    requestLogger.debug(
      { span_name: SPAN_NAMES.RETRIEVAL, error_type: retrieverError.errorType },
      'Span completed with error',
    );

    throw retrieverError;
  }
};

export const retrieveDocuments = traced(SPAN_NAMES.RETRIEVAL,
  {
    kind: SpanKind.CLIENT,
    attributes: {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.RETRIEVAL,
      [ATTRS.GEN_AI_DATA_SOURCE_ID]: RETRIEVAL_DATA_SOURCE_ID,
    },
    onError: (error, span) => recordSpanError(span, error),
  },
  _retrieveDocuments,
);