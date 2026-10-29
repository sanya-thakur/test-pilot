import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Markdown from 'react-markdown';
import { askAIAssistant } from '../services/api';

interface AIAssistantPanelProps {
  datasetId: string;
}

export function AIAssistantPanel({ datasetId }: AIAssistantPanelProps) {
  // A new dataset gets an entirely new form, including pending-request refs.
  return <AssistantForm key={datasetId} datasetId={datasetId} />;
}

function AssistantForm({ datasetId }: AIAssistantPanelProps) {
  const id = useId();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answeredQuestion, setAnsweredQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The ref also guards submits before React has rendered the disabled button.
    if (activeRequest.current) return;
    const message = question.trim();
    if (!message || question.length > 2000) {
      setError('Enter a question between 1 and 2,000 characters.');
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setIsLoading(true);
    setError(null);
    setAnswer('');
    setAnsweredQuestion('');
    try {
      const result = await askAIAssistant(datasetId, message, controller.signal);
      if (activeRequest.current !== controller || controller.signal.aborted) return;
      setAnswer(result.answer);
      setAnsweredQuestion(result.message);
    } catch (failure) {
      if (activeRequest.current !== controller || controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'The assistant could not answer. Please try again.');
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setIsLoading(false);
      }
    }
  };

  return (
    <section className="layout-section assistant-panel" aria-labelledby={`${id}-heading`}>
      <div>
        <p className="eyebrow">AI Assistant</p>
        <h3 id={`${id}-heading`}>Ask about this report</h3>
      </div>
      <p id={`${id}-help`} className="muted-copy">
        Ask one question at a time about this saved report. Each question is independent; previous questions and answers are not sent.
      </p>
      <form onSubmit={handleSubmit} aria-label="Ask about this report" className="assistant-form">
        <label htmlFor={`${id}-question`}>Your question</label>
        <textarea
          id={`${id}-question`}
          value={question}
          onChange={(event) => setQuestion(event.target.value.slice(0, 2000))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={2000}
          rows={4}
          disabled={isLoading}
          aria-describedby={`${id}-help ${id}-count ${id}-shortcut`}
          placeholder="For example: Explain the health score"
        />
        <div className="assistant-form-meta">
          <small id={`${id}-shortcut`} className="muted-copy">Ctrl or ⌘ + Enter to submit</small>
          <small id={`${id}-count`}>{question.length.toLocaleString()} / 2,000 characters</small>
        </div>
        <button type="submit" className="primary-button" disabled={isLoading || !question.trim()}>
          Ask assistant
        </button>
      </form>
      <div aria-live="polite" aria-atomic="true">
        {isLoading && <p role="status" className="assistant-status">Generating answer…</p>}
        {answer && (
          <div className="assistant-answer">
            <p className="muted-copy">Question: {answeredQuestion}</p>
            <h4>Answer</h4>
            <div className="assistant-markdown">
              <Markdown
                skipHtml
                allowedElements={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'strong', 'em', 'ol', 'ul', 'li', 'hr', 'code', 'pre', 'blockquote', 'a', 'br']}
                components={{ pre: ({ children }) => <pre tabIndex={0} aria-label="Code block">{children}</pre> }}
              >
                {answer}
              </Markdown>
            </div>
          </div>
        )}
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
    </section>
  );
}
