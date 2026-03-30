import { Link, SpanKind } from '@opentelemetry/api';
import { NextFunction, Request, Response, Router } from 'express';
import express from 'express';
import { getLogger } from '../utils/logger';
import { incrementAnswerAccuracyCount, incrementFeedbackCount, recordFeedbackRating } from '../observabilty/meter';
import { withActiveSpan } from '../observabilty/span';
import { ATTRS, OPERATION_NAMES, SPAN_NAMES } from '../observabilty/semantic-conventions';
import { FeedbackResponseBody } from '../types/route';
import { FeedbackRequestBody, feedbackSchema } from '../types/route';
import { validateBody } from '../middleware/validation';



export const createFeedbackRouter = (): Router => {
  const router = Router();
  router.use(express.json());

  router.post('/feedback', validateBody(feedbackSchema), async (req: Request, res: Response, next: NextFunction) => {
    const logger = req.logger ?? getLogger({ [ATTRS.REQUEST_ID]: req.requestId });
    const { requestId, rating, accuracy, comment } = req.body as FeedbackRequestBody;

    const BASE_ATTRIBUTES = {
      [ATTRS.FEEDBACK_SOURCE]: 'user',
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.FEEDBACK,
      [ATTRS.REQUEST_ID]: req.requestId,
      [ATTRS.SESSION_ID]: req.sessionId,
      [ATTRS.CONVERSATION_ID]: req.conversationId,
    };

    const links: Link[] = req.linkedSpanContext
      ? [
        {
          context: req.linkedSpanContext,
          attributes: {
            link_type: 'feedback_to_query',
            [ATTRS.REQUEST_ID]: requestId,
          },
        },
      ]
      : [];

    try {
      await withActiveSpan(
        {
          name: SPAN_NAMES.FEEDBACK,
          kind: SpanKind.INTERNAL,
          links,
          attributes: {
            ...BASE_ATTRIBUTES,
          },
        },
        async (span) => {
          span.setAttribute(ATTRS.FEEDBACK_REQUEST_ID, requestId);
          span.setAttribute(ATTRS.FEEDBACK_COMMENT_LENGTH, comment?.length ?? 0);

          incrementFeedbackCount({
            ...BASE_ATTRIBUTES,
          });

          if (rating !== undefined) {
            span.setAttribute(ATTRS.FEEDBACK_RATING, rating);
            recordFeedbackRating(rating, {
              ...BASE_ATTRIBUTES,
            });
          }

          if (accuracy !== undefined) {
            span.setAttribute(ATTRS.FEEDBACK_ACCURACY, accuracy);
            incrementAnswerAccuracyCount(accuracy, {
              ...BASE_ATTRIBUTES,
            });
          }

          logger.info(
            {
              feedback_request_id: requestId,
              rating,
              accuracy,
              comment_length: comment?.length ?? 0,
              linked_to_query_trace: req.linkedSpanContext?.traceId,
            },
            'Feedback received',
          );

          const response: FeedbackResponseBody = {
            accepted: true,
            feedbackId: `fb-${Date.now()}`,
            requestId,
            traceId: span.spanContext().traceId,
            linkedTraceId: req.linkedSpanContext?.traceId,
          };

          res.status(202).json(response);
        },
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
};