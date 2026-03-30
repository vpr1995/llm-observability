import { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      sessionId?: string;
      conversationId?: string;
      logger: Logger;
      linkedSpanContext?: import('@opentelemetry/api').SpanContext;
    }
  }
}

export {};
