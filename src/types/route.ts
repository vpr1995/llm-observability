import { z } from 'zod';
import { LlmUsage, RetrievedDocument } from './llm';

export const querySchema = z.object({
  query: z
    .preprocess((value) => {
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
    }, z.string().min(1, { message: 'query must be a non-empty string' })),
  topK: z.number().int().positive().default(5),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(500),
  simulateError: z.enum(['timeout', 'rate_limit', 'provider']).optional(),
});

export type QueryRequestBody = z.infer<typeof querySchema>;

export const feedbackSchema = z.object({
  requestId: z.string().min(1),
  rating: z.number().int().min(1).max(5).optional(),
  accuracy: z.boolean().optional(),
  comment: z.string().max(500).optional(),
});

export type FeedbackRequestBody = z.infer<typeof feedbackSchema>;

export interface QueryResponseBody {
  requestId: string;
  traceId: string;
  traceparent?: string;
  sessionId?: string;
  conversationId?: string;
  estimatedCostUsd?: number;
  query: string;
  answer: string;
  sources: Array<Pick<RetrievedDocument, 'id' | 'source' | 'score'>>;
  usage: LlmUsage;
  model: string;
}

export interface FeedbackResponseBody {
  accepted: boolean;
  feedbackId: string;
  requestId: string;
  traceId?: string;
  linkedTraceId?: string;
}