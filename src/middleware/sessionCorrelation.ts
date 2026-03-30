import { context, propagation, SpanContext, trace, TraceFlags } from '@opentelemetry/api';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { getLogger } from '../utils/logger';
import { ATTRS } from '../observabilty/semantic-conventions';

/**
 * Parse a W3C traceparent value (e.g. "00-<traceId>-<spanId>-<flags>") into a SpanContext.
 * Returns undefined when the value is missing or malformed.
 */
const parseLinkedTraceparent = (value: string | undefined): SpanContext | undefined => {
  if (!value) return undefined;
  const parts = value.trim().split('-');
  if (parts.length < 4) return undefined;
  const [, traceId, spanId, flags] = parts;
  if (!traceId || traceId.length !== 32 || !spanId || spanId.length !== 16) return undefined;
  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16) as TraceFlags,
    isRemote: true,
  };
};

export const sessionCorrelationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingSessionId = req.header('X-Session-ID');
  const incomingConversationId = req.header('X-Conversation-ID');

  req.sessionId = incomingSessionId && incomingSessionId.trim().length > 0 ? incomingSessionId : uuidv4();
  req.conversationId = incomingConversationId && incomingConversationId.trim().length > 0 ? incomingConversationId : req.sessionId;

  // Clients send the query's traceparent as "X-Linked-To" (not "traceparent")
  // so the HTTP auto-instrumentation doesn't adopt it as a parent context.
  // Each request naturally gets its own trace ID; we only store the linked
  // span context for explicit span linking (e.g., feedback → query).
  const linkedSpanContext = parseLinkedTraceparent(req.header('X-Linked-To'));
  if (linkedSpanContext) {
    req.linkedSpanContext = linkedSpanContext;
  }

  req.logger = (req.logger ?? getLogger({ [ATTRS.REQUEST_ID]: req.requestId })).child({
    [ATTRS.SESSION_ID]: req.sessionId,
    [ATTRS.CONVERSATION_ID]: req.conversationId,
  });

  const activeSpan = trace.getActiveSpan();
  activeSpan?.setAttribute(ATTRS.SESSION_ID, req.sessionId);
  activeSpan?.setAttribute(ATTRS.CONVERSATION_ID, req.conversationId);

  const currentBaggage = propagation.getBaggage(context.active()) ?? propagation.createBaggage();
  const requestBaggage = currentBaggage
    .setEntry(ATTRS.REQUEST_ID, { value: req.requestId })
    .setEntry(ATTRS.SESSION_ID, { value: req.sessionId })
    .setEntry(ATTRS.CONVERSATION_ID, { value: req.conversationId });

  const contextWithBaggage = propagation.setBaggage(context.active(), requestBaggage);

  res.setHeader('X-Session-ID', req.sessionId);
  res.setHeader('X-Conversation-ID', req.conversationId);

  context.with(contextWithBaggage, next);
};