import { Attributes } from '@opentelemetry/api';
import { MockInstance } from 'vitest';

export const expectMetricRecorded = (
  spy: MockInstance,
  expectedAttributes: Partial<Attributes>,
): void => {
  const matchedCall = spy.mock.calls.find((call) => {
    const attributes = call[1] as Attributes | undefined;

    if (!attributes) {
      return false;
    }

    return Object.entries(expectedAttributes).every(([key, value]) => attributes[key] === value);
  });

  expect(matchedCall).toBeDefined();
};
