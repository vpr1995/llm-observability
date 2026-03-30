import { SpanStatusCode, trace } from '@opentelemetry/api';
import { ErrorRequestHandler } from 'express';

import { config } from '../config';
import { AppError, ERROR_TYPES } from '../errors';
import { incrementErrorCount } from '../observabilty/meter';
import { ATTRS } from '../observabilty/semantic-conventions';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(error instanceof Error ? error.message : 'Internal server error', 500, ERROR_TYPES.INTERNAL, false);

  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.recordException(appError);
    activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: appError.message });
    activeSpan.setAttribute(ATTRS.ERROR_TYPE, appError.errorType);
  }

  incrementErrorCount({
    [ATTRS.ERROR_TYPE]: appError.errorType,
    [ATTRS.GEN_AI_PROVIDER_NAME]: config.llmProvider,
    [ATTRS.GEN_AI_REQUEST_MODEL]: config.llmModel,
  });

  req.logger?.error(
    {
      err: {
        message: appError.message,
        name: appError.name,
        type: appError.errorType,
      },
      status_code: appError.statusCode,
    },
    'Request failed',
  );

  res.status(appError.statusCode).json({
    error: {
      type: appError.errorType,
      message: appError.message,
    },
    requestId: req.requestId,
  });
};
