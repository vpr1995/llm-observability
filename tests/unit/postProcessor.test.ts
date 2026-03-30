import * as meter from '../../src/observabilty/meter';
import { postProcess } from '../../src/pipeline/postProcessor';

describe('postProcess', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes whitespace', async () => {
    const durationSpy = vi.spyOn(meter, 'recordPostProcessDuration').mockImplementation(() => undefined);
    const lengthSpy = vi.spyOn(meter, 'recordPostProcessOutputLength').mockImplementation(() => undefined);

    const result = await postProcess('Hello   world\n\nthis\t is   spaced');

    expect(result.answer).toBe('Hello world this is spaced');
    expect(result.summaryLength).toBe(result.answer.length);
    expect(durationSpy).toHaveBeenCalledTimes(1);
    expect(lengthSpy).toHaveBeenCalledWith(result.summaryLength, expect.any(Object));
  });

  it('trims long output with ellipsis', async () => {
    const text = 'x'.repeat(200);
    const result = await postProcess(text, 50);

    expect(result.answer).toHaveLength(50);
    expect(result.answer.endsWith('...')).toBe(true);
  });
});
