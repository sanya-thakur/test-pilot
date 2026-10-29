import { askAIAssistant } from './api';

describe('askAIAssistant', () => {
  const mockFetch = vi.fn();
  const success = { datasetId: 'dataset-1', message: 'Explain score', answer: 'The score is 90.' };
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Response(JSON.stringify(success), { status: 200 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts JSON to the configured API, encodes the ID and forwards cancellation', async () => {
    const datasetId = 'dataset/with ?#';
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ...success, datasetId })));
    const controller = new AbortController();
    await expect(askAIAssistant(datasetId, '  Explain score  ', controller.signal)).resolves.toEqual({ ...success, datasetId });
    expect(mockFetch).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'}/api/v1/datasets/dataset%2Fwith%20%3F%23/ai-assistant`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Explain score' }), signal: controller.signal },
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns validated fields only', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ...success, internalField: 'ignored' })));
    await expect(askAIAssistant('dataset-1', 'Explain score')).resolves.toEqual(success);
  });

  it.each([null, [], {}, { ...success, datasetId: 'different' }, { ...success, message: 12 },
    { ...success, message: 'Different question' }, { ...success, answer: null }, { ...success, answer: '   ' },
  ])('rejects malformed success responses %#', async (body) => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(askAIAssistant('dataset-1', 'Explain score')).rejects.toThrow('Malformed assistant response');
  });

  it('rejects invalid JSON without displaying the payload', async () => {
    mockFetch.mockResolvedValue(new Response('private-payload'));
    await expect(askAIAssistant('dataset-1', 'Explain score')).rejects.toThrow('Malformed assistant response');
  });

  it.each([
    [400, 'Enter a question'], [404, 'no longer available'], [502, 'could not answer'],
    [503, 'not configured'], [504, 'timed out'], [500, 'unavailable'], [429, 'unavailable'],
  ])('maps HTTP %s to useful copy without exposing error bodies', async (status, copy) => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Authorization: secret-key; sample-cell' }), { status: Number(status) }));
    const pending = askAIAssistant('dataset-1', 'Explain score');
    await expect(pending).rejects.toThrow(String(copy));
    await expect(pending).rejects.not.toThrow('secret-key');
  });

  it('sanitizes network errors', async () => {
    mockFetch.mockRejectedValue(new Error('secret network details'));
    await expect(askAIAssistant('dataset-1', 'Explain score')).rejects.toThrow('Could not reach the assistant');
  });

  it('preserves cancellation without exposing transport errors', async () => {
    const controller = new AbortController();
    controller.abort();
    mockFetch.mockRejectedValue(new Error('private transport error'));
    await expect(askAIAssistant('dataset-1', 'Explain score', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
