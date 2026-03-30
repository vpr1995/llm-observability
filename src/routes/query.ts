import { SpanKind } from '@opentelemetry/api';
import { NextFunction, Request, Response, Router } from 'express';

import { config } from '../config';
import { getLogger } from '../utils/logger';
import { incrementRequestCount, recordOperationDuration, recordTokenUsage } from '../observabilty/meter';
import { LlmClient, llmClient } from '../pipeline/llmClient';
import { postProcess } from '../pipeline/postProcessor';
import { buildPrompt } from '../pipeline/promptBuilder';
import { retrieveDocuments } from '../pipeline/retriever';
import { recordSpanError, withActiveSpan } from '../observabilty/span';
import { ATTRS, NO_ERROR_TYPE, OPERATION_NAMES, SPAN_NAMES } from '../observabilty/semantic-conventions';
import { querySchema, QueryRequestBody } from '../types/route';
import { validateBody } from '../middleware/validation';
import { QueryResponseBody } from '../types/route';
import express from 'express';

export const createQueryRouter = (client: LlmClient = llmClient): Router => {
  const router = Router();
  router.use(express.json());

  router.post('/query', validateBody(querySchema), async (req: Request, res: Response, next: NextFunction) => {
    const logger = req.logger ?? getLogger({ [ATTRS.REQUEST_ID]: req.requestId });
    const startedAt = Date.now();
    const requestMetricAttributes = {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.QUERY,
      [ATTRS.GEN_AI_PROVIDER_NAME]: config.llmProvider,
      [ATTRS.GEN_AI_REQUEST_MODEL]: config.llmModel,
      [ATTRS.REQUEST_ID]: req.requestId,
      [ATTRS.SESSION_ID]: req.sessionId,
      [ATTRS.CONVERSATION_ID]: req.conversationId,
    };

    try {
      await withActiveSpan(
        {
          name: SPAN_NAMES.QUERY,
          kind: SpanKind.INTERNAL,
          attributes: {
            [ATTRS.REQUEST_ID]: req.requestId,
            [ATTRS.SESSION_ID]: req.sessionId,
            [ATTRS.CONVERSATION_ID]: req.conversationId,
            [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.QUERY,
          },
          onError: (error, span) => {
            recordOperationDuration((Date.now() - startedAt) / 1000, {
              [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.QUERY,
              [ATTRS.GEN_AI_PROVIDER_NAME]: config.llmProvider,
              [ATTRS.GEN_AI_REQUEST_MODEL]: config.llmModel,
              [ATTRS.REQUEST_ID]: req.requestId,
              [ATTRS.SESSION_ID]: req.sessionId,
              [ATTRS.CONVERSATION_ID]: req.conversationId,
              [ATTRS.ERROR_TYPE]: error.errorType,
            });

            recordSpanError(span, error);
          },
        },
        async (span) => {
          incrementRequestCount(requestMetricAttributes);

          const { query, topK, temperature, maxTokens, simulateError } = req.body as QueryRequestBody;

          span.setAttribute(ATTRS.GEN_AI_QUERY_LENGTH, query.length);
          span.setAttribute(ATTRS.GEN_AI_QUERY_TOP_K_REQUESTED, topK);

          logger.info({ query_length: query.length, top_k: topK }, 'Query received');

          const docs = await retrieveDocuments(query, topK, logger);

          span.setAttribute(ATTRS.GEN_AI_CONTEXT_DOCUMENTS_RETRIEVED, docs.length);

          if (docs.length > 0) {
            const scores = docs.map((doc) => doc.score);
            span.setAttribute(ATTRS.GEN_AI_CONTEXT_MIN_SCORE, Number(Math.min(...scores).toFixed(3)));
            span.setAttribute(ATTRS.GEN_AI_CONTEXT_MAX_SCORE, Number(Math.max(...scores).toFixed(3)));
          }

          const prompt = await buildPrompt(query, docs, logger);

          const llmResponse = await client.generateResponse({
            prompt,
            temperature,
            maxTokens,
            simulateError,
          }, logger);

          const processed = await postProcess(llmResponse.content, 1200, logger);

          const spanContext = span.spanContext();
          const traceFlags = (spanContext.traceFlags ?? 0).toString(16).padStart(2, '0');
          const traceparent = `00-${spanContext.traceId}-${spanContext.spanId}-${traceFlags}`;

          recordTokenUsage(llmResponse.usage.inputTokens, {
            [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.QUERY,
            [ATTRS.GEN_AI_TOKEN_TYPE]: 'input',
            [ATTRS.GEN_AI_PROVIDER_NAME]: config.llmProvider,
            [ATTRS.GEN_AI_REQUEST_MODEL]: llmResponse.model,
            [ATTRS.REQUEST_ID]: req.requestId,
            [ATTRS.SESSION_ID]: req.sessionId,
            [ATTRS.CONVERSATION_ID]: req.conversationId,
          });

          recordTokenUsage(llmResponse.usage.outputTokens, {
            [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.QUERY,
            [ATTRS.GEN_AI_TOKEN_TYPE]: 'output',
            [ATTRS.GEN_AI_PROVIDER_NAME]: config.llmProvider,
            [ATTRS.GEN_AI_REQUEST_MODEL]: llmResponse.model,
            [ATTRS.REQUEST_ID]: req.requestId,
            [ATTRS.SESSION_ID]: req.sessionId,
            [ATTRS.CONVERSATION_ID]: req.conversationId,
          });

          recordOperationDuration((Date.now() - startedAt) / 1000, {
            ...requestMetricAttributes,
            [ATTRS.GEN_AI_RESPONSE_MODEL]: llmResponse.model,
            [ATTRS.ERROR_TYPE]: NO_ERROR_TYPE,
          });

          const payload: QueryResponseBody & { traceparent: string } = {
            requestId: req.requestId,
            sessionId: req.sessionId,
            conversationId: req.conversationId,
            traceId: spanContext.traceId,
            traceparent,
            estimatedCostUsd: llmResponse.estimatedCostUsd,
            query,
            answer: processed.answer,
            sources: docs.map((doc) => ({ id: doc.id, source: doc.source, score: doc.score })),
            usage: llmResponse.usage,
            model: llmResponse.model,
          };

          logger.info(
            {
              model: llmResponse.model,
              input_tokens: llmResponse.usage.inputTokens,
              output_tokens: llmResponse.usage.outputTokens,
              estimated_cost_usd: llmResponse.estimatedCostUsd,
              [ATTRS.SESSION_ID]: req.sessionId,
              [ATTRS.CONVERSATION_ID]: req.conversationId,
            },
            'LLM call completed',
          );

          res.status(200).json(payload);
        },
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
};
