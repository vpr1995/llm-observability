import { SpanKind, trace } from '@opentelemetry/api';
import { Logger } from 'pino';

import { traced } from '../decorators/traced';
import { PromptBuilderError } from '../errors';
import { getLogger } from '../utils/logger';
import { recordPromptLength } from '../observabilty/meter';
import { recordSpanError } from '../observabilty/span';
import { ATTRS, OPERATION_NAMES, SPAN_NAMES } from '../observabilty/semantic-conventions';
import { RetrievedDocument } from '../types/llm';

const MAX_QUERY_LENGTH = 2000;

const _buildPrompt = async (query: string, docs: RetrievedDocument[], logger?: Logger): Promise<string> => {
  const span = trace.getActiveSpan();
  const requestLogger = logger ?? getLogger({ component: 'prompt-builder' });

  requestLogger.debug({ span_name: SPAN_NAMES.PROMPT_CONSTRUCTION, document_count: docs.length }, 'Span started');

  const sanitizedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);

  if (!sanitizedQuery) {
    throw new PromptBuilderError('Cannot build prompt from an empty query');
  }

  const context = docs.length
    ? docs
        .map(
          (doc, index) =>
            `Source ${index + 1} (${doc.id}, score=${doc.score.toFixed(3)}, ${doc.source}):\n${doc.content}`,
        )
        .join('\n\n')
    : 'No additional context documents were retrieved.';

  const prompt = [
    'You are an observability assistant. Provide concise, accurate answers using the supplied context.',
    '',
    'Context:',
    context,
    '',
    'User question:',
    sanitizedQuery,
    '',
    'Instructions:',
    '- If context is insufficient, clearly say so.',
    '- Cite source IDs when possible.',
  ].join('\n');

  span?.setAttribute(ATTRS.GEN_AI_PROMPT_CHARACTERS, prompt.length);
  span?.setAttribute(ATTRS.GEN_AI_PROMPT_DOCUMENT_COUNT, docs.length);
  span?.setAttribute(ATTRS.GEN_AI_PROMPT_ESTIMATED_TOKENS, Math.ceil(prompt.length / 4));

  if (docs.length > 0) {
    const scores = docs.map((doc) => doc.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    span?.setAttribute(ATTRS.GEN_AI_RETRIEVAL_MIN_SCORE, Number(minScore.toFixed(3)));
    span?.setAttribute(ATTRS.GEN_AI_RETRIEVAL_MAX_SCORE, Number(maxScore.toFixed(3)));
    span?.setAttribute(ATTRS.GEN_AI_RETRIEVAL_AVG_SCORE, Number(avgScore.toFixed(3)));
  }

  recordPromptLength(prompt.length, {
    [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.PROMPT_CONSTRUCTION,
    [ATTRS.GEN_AI_PROMPT_DOCUMENT_COUNT]: docs.length,
  });

  requestLogger.debug(
    { span_name: SPAN_NAMES.PROMPT_CONSTRUCTION, prompt_characters: prompt.length, document_count: docs.length },
    'Span completed',
  );

  return prompt;
};

export const buildPrompt = traced(
  SPAN_NAMES.PROMPT_CONSTRUCTION,
  {
    kind: SpanKind.INTERNAL,
    attributes: {
      [ATTRS.GEN_AI_OPERATION_NAME]: OPERATION_NAMES.PROMPT_CONSTRUCTION,
    },
    onError: (error, span) => recordSpanError(span, error),
  },
  _buildPrompt,
);
