import { trace } from '@opentelemetry/api';

export const tracer = trace.getTracer('llm-service', '1.0.0');
