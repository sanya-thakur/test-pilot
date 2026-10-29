import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIAssistantPanel } from './AIAssistantPanel';
import { askAIAssistant } from '../services/api';
import type { AIAssistantResponse } from '../types/ai-assistant';
import { StrictMode } from 'react';

vi.mock('../services/api', () => ({ askAIAssistant: vi.fn() }));
const mockAsk = vi.mocked(askAIAssistant);
const response = { datasetId: 'one', message: 'Explain score', answer: 'The score reflects measured findings.' };
const input = () => screen.getByRole('textbox', { name: 'Your question' });
const submit = () => screen.getByRole('button', { name: 'Ask assistant' });
const form = () => screen.getByRole('form', { name: 'Ask about this report' });

describe('AIAssistantPanel', () => {
  beforeEach(() => {
    mockAsk.mockReset();
    mockAsk.mockResolvedValue(response);
  });

  it('renders an accessible form and explains independent questions', () => {
    render(<AIAssistantPanel datasetId="one" />);
    expect(screen.getByRole('heading', { name: 'Ask about this report' })).toBeInTheDocument();
    expect(input()).toHaveAccessibleDescription(/Each question is independent/);
    expect(submit()).toBeDisabled();
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it.each(['', '   \n '])('rejects empty or whitespace-only input %j', (question) => {
    render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: question } });
    expect(submit()).toBeDisabled();
    fireEvent.submit(form());
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a question');
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it('trims questions and drops raw HTML from answers', async () => {
    const answer = '<img src=x onerror=alert(1)>\n\nSecond line';
    mockAsk.mockResolvedValue({ ...response, answer });
    const { container } = render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: '  Explain score  ' } });
    await userEvent.click(submit());
    expect(mockAsk).toHaveBeenCalledWith('one', 'Explain score', expect.any(AbortSignal));
    expect(await screen.findByText('Second line')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Question: Explain score')).toBeInTheDocument();
  });

  it('renders Markdown headings, paragraphs, emphasis, lists, rules and code', async () => {
    const answer = [
      '# Report summary', '',
      'The score is **healthy**, but *review duplicates* and check `customer_id`.', '',
      '- Missing values', '- Duplicate rows', '',
      '1. Review findings', '2. Re-run profiling', '',
      '---', '',
      '## Example query', '',
      '```sql', 'SELECT customer_id FROM customers;', '```',
    ].join('\n');
    mockAsk.mockResolvedValue({ ...response, answer });
    const { container } = render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: 'Explain score' } });
    await userEvent.click(submit());
    expect(await screen.findByRole('heading', { level: 1, name: 'Report summary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Example query' })).toBeInTheDocument();
    expect(screen.getByText('healthy').tagName).toBe('STRONG');
    expect(screen.getByText('review duplicates').tagName).toBe('EM');
    expect(screen.getByText('customer_id').tagName).toBe('CODE');
    expect(container.querySelector('ul')).toHaveTextContent('Missing values');
    expect(container.querySelector('ol')).toHaveTextContent('Review findings');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    const code = screen.getByText('SELECT customer_id FROM customers;');
    expect(code).toHaveClass('language-sql');
    expect(code.parentElement?.tagName).toBe('PRE');
    expect(code.parentElement).toHaveAttribute('tabindex', '0');
  });

  it('blocks scripts, raw event handlers, embedded media and executable link URLs', async () => {
    const answer = [
      'Safe content', '', '<script>alert("bad")</script>', '',
      '<img src=x onerror=alert(1)>', '', '<iframe src="https://example.com"></iframe>', '',
      '[Unsafe link](javascript:alert%281%29)', '', '[Documentation](https://example.com/docs)', '',
      '![Remote image](https://example.com/tracker.png)',
    ].join('\n');
    mockAsk.mockResolvedValue({ ...response, answer });
    const { container } = render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: 'Explain score' } });
    await userEvent.click(submit());
    await screen.findByText('Safe content');
    expect(container.querySelector('script, img, iframe, [onerror]')).toBeNull();
    expect(screen.getByText('Unsafe link')).not.toHaveAttribute('href', expect.stringMatching(/javascript:/i));
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', 'https://example.com/docs');
  });

  it('keeps HTML inside fenced code as inert code text', async () => {
    mockAsk.mockResolvedValue({ ...response, answer: '```html\n<script>alert("example")</script>\n```' });
    const { container } = render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: 'Explain score' } });
    await userEvent.click(submit());
    const code = await screen.findByText('<script>alert("example")</script>');
    expect(code.tagName).toBe('CODE');
    expect(container.querySelector('script')).toBeNull();
  });

  it('caps input at 2,000 characters and allows a question exactly at the limit', async () => {
    render(<AIAssistantPanel datasetId="one" />);
    expect(input()).toHaveAttribute('maxlength', '2000');
    fireEvent.change(input(), { target: { value: 'x'.repeat(2001) } });
    expect(input()).toHaveValue('x'.repeat(2000));
    expect(screen.getByText('2,000 / 2,000 characters')).toBeInTheDocument();
    await userEvent.click(submit());
    expect(mockAsk).toHaveBeenCalledWith('one', 'x'.repeat(2000), expect.any(AbortSignal));
  });

  it('announces loading and blocks duplicate submits, including repeated form events', async () => {
    let resolve: (value: AIAssistantResponse) => void = () => {};
    mockAsk.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: 'Explain score' } });
    fireEvent.submit(form());
    fireEvent.submit(form());
    expect(screen.getByRole('status')).toHaveTextContent('Generating answer…');
    expect(submit()).toBeDisabled();
    expect(input()).toBeDisabled();
    expect(mockAsk).toHaveBeenCalledTimes(1);
    await act(async () => resolve(response));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  it('does not abort the first request in StrictMode or impose a frontend timeout', async () => {
    vi.useFakeTimers();
    try {
      let resolve: (value: AIAssistantResponse) => void = () => {};
      mockAsk.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
      const view = render(<StrictMode><AIAssistantPanel datasetId="one" /></StrictMode>);
      fireEvent.change(input(), { target: { value: 'Explain score' } });
      fireEvent.submit(form());
      const signal = mockAsk.mock.calls[0][2];
      await act(async () => { await vi.advanceTimersByTimeAsync(31000); });
      expect(signal?.aborted).toBe(false);
      expect(mockAsk).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent('Generating answer');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(async () => resolve(response));
      expect(screen.getByText(response.answer)).toBeInTheDocument();
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows keyboard submission with Ctrl+Enter while preserving plain Enter for multiline text', async () => {
    render(<AIAssistantPanel datasetId="one" />);
    await userEvent.type(input(), 'Explain score');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByText(response.answer)).toBeInTheDocument();
    expect(mockAsk).toHaveBeenCalledTimes(1);
  });

  it('preserves the question after failure and allows retry', async () => {
    mockAsk.mockRejectedValueOnce(new Error('The assistant timed out. Please try again.'));
    render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: 'Explain score' } });
    await userEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('timed out');
    expect(input()).toHaveValue('Explain score');
    await userEvent.click(submit());
    expect(await screen.findByText(response.answer)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockAsk).toHaveBeenCalledTimes(2);
  });

  it('clears completed answers and question state when the dataset changes', async () => {
    const view = render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: 'Explain score' } });
    await userEvent.click(submit());
    await screen.findByText(response.answer);
    view.rerender(<AIAssistantPanel datasetId="two" />);
    expect(input()).toHaveValue('');
    expect(screen.queryByText(response.answer)).not.toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('clears errors on dataset change', async () => {
    mockAsk.mockRejectedValueOnce(new Error('Request failed'));
    const view = render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: 'Explain score' } });
    await userEvent.click(submit());
    await screen.findByRole('alert');
    view.rerender(<AIAssistantPanel datasetId="two" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input()).toHaveValue('');
  });

  it.each(['resolve', 'reject'])('aborts and ignores a stale %s after dataset change', async (settlement) => {
    let resolve: (value: AIAssistantResponse) => void = () => {};
    let reject: (error: Error) => void = () => {};
    mockAsk.mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
    const view = render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: 'Explain score' } });
    fireEvent.submit(form());
    const signal = mockAsk.mock.calls[0][2];
    view.rerender(<AIAssistantPanel datasetId="two" />);
    expect(signal?.aborted).toBe(true);
    fireEvent.change(input(), { target: { value: 'New question' } });
    mockAsk.mockResolvedValueOnce({ datasetId: 'two', message: 'New question', answer: 'New answer' });
    await userEvent.click(submit());
    await screen.findByText('New answer');
    await act(async () => {
      if (settlement === 'resolve') resolve(response);
      else reject(new Error('Old error'));
    });
    expect(screen.getByText('New answer')).toBeInTheDocument();
    expect(screen.queryByText(response.answer)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('aborts a pending request when the report closes and starts fresh on reopening', async () => {
    let resolve: (value: AIAssistantResponse) => void = () => {};
    mockAsk.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = render(<AIAssistantPanel datasetId="one" />);
    fireEvent.change(input(), { target: { value: 'Explain score' } });
    fireEvent.submit(form());
    const signal = mockAsk.mock.calls[0][2];
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(response));
    render(<AIAssistantPanel datasetId="one" />);
    expect(input()).toHaveValue('');
    expect(screen.queryByText(response.answer)).not.toBeInTheDocument();
  });
});
