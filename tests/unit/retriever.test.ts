import * as meter from '../../src/observabilty/meter';
import { RetrieverError } from '../../src/errors';
import { retrieveDocuments } from '../../src/pipeline/retriever';

describe('retrieveDocuments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns top-k ranked documents', async () => {
    const recordRetrievalDurationSpy = vi
      .spyOn(meter, 'recordRetrievalDuration')
      .mockImplementation(() => undefined);
    const recordRetrievalDocumentCountSpy = vi
      .spyOn(meter, 'recordRetrievalDocumentCount')
      .mockImplementation(() => undefined);

    const docs = await retrieveDocuments('OpenTelemetry tracing metrics', 3);

    expect(docs).toHaveLength(3);
    expect(docs[0].score).toBeGreaterThanOrEqual(docs[1].score);
    expect(recordRetrievalDurationSpy).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({
      'gen_ai.operation.name': 'retrieval',
      'gen_ai.data_source.id': 'knowledge-base-v1',
      'gen_ai.request.top_k': 3,
      'rag.retrieval.returned_count': 3,
      'error.type': 'none',
    }));
    expect(recordRetrievalDocumentCountSpy).toHaveBeenCalledWith(3, expect.objectContaining({
      'gen_ai.operation.name': 'retrieval',
      'gen_ai.data_source.id': 'knowledge-base-v1',
      'gen_ai.request.top_k': 3,
    }));
  });

  it('throws for empty query', async () => {
    await expect(retrieveDocuments('', 5)).rejects.toBeInstanceOf(RetrieverError);
  });

  it('throws RetrieverError on simulated failure', async () => {
    await expect(retrieveDocuments('__retriever_fail__', 5)).rejects.toBeInstanceOf(RetrieverError);
  });
});
