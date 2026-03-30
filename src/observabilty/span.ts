import { Attributes, context, Link, propagation, Span, SpanKind, SpanStatusCode, Tracer } from '@opentelemetry/api';

import { AppError, ERROR_TYPES } from '../errors';
import { ATTRS } from './semantic-conventions';
import { tracer as defaultTracer } from './tracer';

export interface ActiveSpanOptions {
  name: string;
  kind?: SpanKind;
  attributes?: Attributes;
  links?: Link[];
  tracer?: Tracer;
  onError?: (error: AppError, span: Span) => void;
}

export const toAppError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message, 500, ERROR_TYPES.INTERNAL, false);
  }

  return new AppError('Internal server error', 500, ERROR_TYPES.INTERNAL, false);
};

export const recordSpanError = (span: Span, error: unknown): AppError => {
  const appError = toAppError(error);

  span.recordException(appError);
  span.setStatus({ code: SpanStatusCode.ERROR, message: appError.message });
  span.setAttribute(ATTRS.ERROR_TYPE, appError.errorType);

  return appError;
};

export const withActiveSpan = async <T>(
  options: ActiveSpanOptions,
  callback: (span: Span) => Promise<T> | T,
): Promise<T> => {
  const activeTracer = options.tracer ?? defaultTracer;
  const baggage = propagation.getBaggage(context.active());
  const baggageAttributes: Attributes = {};

  const requestId = baggage?.getEntry(ATTRS.REQUEST_ID)?.value;
  const sessionId = baggage?.getEntry(ATTRS.SESSION_ID)?.value;
  const conversationId = baggage?.getEntry(ATTRS.CONVERSATION_ID)?.value;

  if (requestId) {
    baggageAttributes[ATTRS.REQUEST_ID] = requestId;
  }

  if (sessionId) {
    baggageAttributes[ATTRS.SESSION_ID] = sessionId;
  }

  if (conversationId) {
    baggageAttributes[ATTRS.CONVERSATION_ID] = conversationId;
  }

  return activeTracer.startActiveSpan(
    options.name,
    {
      kind: options.kind,
      attributes: {
        ...baggageAttributes,
        ...options.attributes,
      },
      links: options.links,
    },
    async (span) => {
      try {
        return await callback(span);
      } catch (error) {
        const appError = toAppError(error);

        if (options.onError) {
          options.onError(appError, span);
        } else {
          recordSpanError(span, appError);
        }

        throw appError;
      } finally {
        span.end();
      }
    },
  );
};
