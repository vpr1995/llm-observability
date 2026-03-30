import { redactText } from '../../src/middleware/redaction';

describe('redactText', () => {
  it('redacts common PII patterns', () => {
    const result = redactText('email me at jane@example.com, ssn 123-45-6789, phone 555-123-4567');

    expect(result).not.toContain('jane@example.com');
    expect(result).not.toContain('123-45-6789');
    expect(result).not.toContain('555-123-4567');
    expect(result).toContain('[REDACTED]');
  });
});