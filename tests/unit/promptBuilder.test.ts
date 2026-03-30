import * as meter from '../../src/observabilty/meter';
import { buildPrompt } from '../../src/pipeline/promptBuilder';

describe('buildPrompt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds prompt with context documents', async () => {
    const recordPromptLengthSpy = vi.spyOn(meter, 'recordPromptLength').mockImplementation(() => undefined);

    const prompt = await buildPrompt('How does retry work?', [
      {
        id: 'doc-1',
        source: 'kb://retry',
        score: 0.95,
        content: 'Retry with exponential backoff and jitter.',
      },
    ]);

    expect(prompt).toContain('How does retry work?');
    expect(prompt).toContain('doc-1');
    expect(prompt).toContain('Retry with exponential backoff and jitter.');
    expect(recordPromptLengthSpy).toHaveBeenCalledWith(expect.any(Number), {
      'gen_ai.operation.name': 'prompt_construction',
      'gen_ai.prompt.document_count': 1,
    });
  });

  it('handles missing docs gracefully', async () => {
    const recordPromptLengthSpy = vi.spyOn(meter, 'recordPromptLength').mockImplementation(() => undefined);

    const prompt = await buildPrompt('No docs question', []);

    expect(prompt).toContain('No additional context documents were retrieved.');
    expect(recordPromptLengthSpy).toHaveBeenCalledWith(expect.any(Number), {
      'gen_ai.operation.name': 'prompt_construction',
      'gen_ai.prompt.document_count': 0,
    });
  });

  it('trims very long query input', async () => {
    const longQuery = 'a'.repeat(3000);
    const prompt = await buildPrompt(longQuery, []);

    expect(prompt).toContain('a'.repeat(2000));
    expect(prompt).not.toContain('a'.repeat(2200));
  });
});
