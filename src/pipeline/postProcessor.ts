import { trace } from '@opentelemetry/api';
import { Logger } from 'pino';

import { traced } from '../decorators/traced';
import { PostProcessorError } from '../errors';
import { getLogger } from '../utils/logger';
import { recordPostProcessDuration, recordPostProcessOutputLength } from '../observabilty/meter';
import { recordSpanError } from '../observabilty/span';
import { ATTRS, OPERATION_NAMES, SPAN_NAMES } from '../observabilty/semantic-conventions';

export interface PostProcessResult {
  answer: string;
  summaryLength: number;
}

const _postProcess = (content: string, maxLength = 1200, logger?: Logger): PostProcessResult => {
  const startedAt = Date.now();
  const requestLogger = logger ?? getLogger({ component: 'post-process' });
  requestLogger.debug({ span_name: SPAN_NAMES.POSTPROCESS, max_length: maxLength }, 'Span started');

  if (typeof content !== 'string') {
    throw new PostProcessorError('Post-processor expects content to be a string');
  }

  const normalized = content.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    throw new PostProcessorError('Post-processor cannot process an empty response');
  }

  const answer = normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
  const result = { answer, summaryLength: answer.length };
  trace.getActiveSpan()?.setAttribute(ATTRS.POSTPROCESS_SUMMARY_LENGTH, result.summaryLength);

  const durationSeconds = (Date.now() - startedAt) / 1000;
  recordPostProcessDuration(durationSeconds, {
    [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.POSTPROCESS,
  });
  recordPostProcessOutputLength(result.summaryLength, {
    [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.POSTPROCESS,
  });

  requestLogger.debug(
    { span_name: SPAN_NAMES.POSTPROCESS, duration_seconds: durationSeconds, output_length: result.summaryLength },
    'Span completed',
  );

  return result;
}

export const postProcess = traced(
  SPAN_NAMES.POSTPROCESS,
  {
    attributes: {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.POSTPROCESS,
    },
    onError: (error, span) => recordSpanError(span, error),
  },
  _postProcess,
);
