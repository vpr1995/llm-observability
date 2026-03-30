import { trace } from '@opentelemetry/api';
import { NextFunction, Request, Response } from 'express';

import { config } from '../config';
import { ATTRS, EVENT_NAMES } from '../observabilty/semantic-conventions';

export interface RedactionOptions {
  redactIncomingContent: boolean;
  redactOutgoingContent: boolean;
}

const piiPatterns = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/g,
];

export const redactText = (value: string): string => {
  return piiPatterns.reduce((acc, pattern) => acc.replace(pattern, '[REDACTED]'), value);
};

export const redactionMiddleware = (options: RedactionOptions = config.privacy): (req: Request, res: Response, next: NextFunction) => void => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const span = trace.getActiveSpan();

    if (options.redactIncomingContent && req.body && typeof req.body === 'object') {
      if (typeof req.body.query === 'string') {
        const redactedQuery = redactText(req.body.query);
        if (redactedQuery !== req.body.query) {
          span?.setAttribute(ATTRS.GEN_AI_CONTENT_FILTERED, true);
          span?.addEvent(EVENT_NAMES.GEN_AI_CONTENT_FILTERED, {
            field: 'query',
            direction: 'incoming',
          });
        }

        req.body.query = redactedQuery;
      }

      if (typeof req.body.comment === 'string') {
        const redactedComment = redactText(req.body.comment);
        if (redactedComment !== req.body.comment) {
          span?.setAttribute(ATTRS.GEN_AI_CONTENT_FILTERED, true);
          span?.addEvent(EVENT_NAMES.GEN_AI_CONTENT_FILTERED, {
            field: 'comment',
            direction: 'incoming',
          });
        }

        req.body.comment = redactedComment;
      }
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (options.redactOutgoingContent && body && typeof body === 'object' && 'answer' in body && typeof (body as { answer?: unknown }).answer === 'string') {
        const answer = (body as { answer: string }).answer;
        const redactedAnswer = redactText(answer);

        if (redactedAnswer !== answer) {
          span?.setAttribute(ATTRS.GEN_AI_CONTENT_FILTERED, true);
          span?.addEvent(EVENT_NAMES.GEN_AI_CONTENT_FILTERED, {
            field: 'answer',
            direction: 'outgoing',
            [ATTRS.GEN_AI_OPERATION_NAME]: 'http_response_redaction',
          });
        }

        (body as { answer: string }).answer = redactedAnswer;
      }

      return originalJson(body);
    }) as typeof res.json;

    next();
  };
};