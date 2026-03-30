import { Attributes, Span, SpanKind } from '@opentelemetry/api';

import { AppError } from '../errors';
import { withActiveSpan } from '../observabilty/span';

export interface TracedOptions {
  kind?: SpanKind;
  attributes?: Attributes;
  onError?: (error: AppError, span: Span) => void;
}

/**
 * Class method decorator — manages span lifecycle.
 * Use trace.getActiveSpan() inside the method to add custom attributes.
 */
export function Traced(spanName: string, options: TracedOptions = {}) {
  return function (_target: object, _propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return withActiveSpan({ name: spanName, ...options }, () => original.apply(this, args));
    };
  };
}

/**
 * Function wrapper — manages span lifecycle for standalone functions.
 * Use trace.getActiveSpan() inside the wrapped function to add custom attributes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function traced<F extends (...args: any[]) => any>(
  spanName: string,
  options: TracedOptions,
  fn: F,
): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>> {
  return (...args: Parameters<F>) =>
    withActiveSpan({ name: spanName, ...options }, () => fn(...args) as Awaited<ReturnType<F>>);
}
