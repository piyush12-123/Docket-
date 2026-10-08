import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, Loader2, AlertCircle, FileText, X } from 'lucide-react';
import * as documentsApi from '@/api/documentsApi';

interface AiQueryBarProps {
  onSuccess?: () => void;
}

export default function AiQueryBar({ onSuccess }: AiQueryBarProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    answer: string;
    matchedDocumentIds: string[];
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = question.trim();
    if (!trimmed) {
      setError('Please enter a question about your documents.');
      return;
    }

    if (trimmed.length > 500) {
      setError('Question must be 500 characters or less.');
      return;
    }

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 30 second timeout — Requirement 10.9
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);

    setLoading(true);
    setResult(null);

    try {
      const res = await documentsApi.query(trimmed);
      clearTimeout(timeoutId);
      setResult(res);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        setError('Request timed out after 30 seconds. Please try again.');
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to process your question. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuestion('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5 p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Ask AI Assistant</h2>
            <p className="text-xs text-muted-foreground">
              Ask natural-language questions about your stored documents
            </p>
          </div>
        </div>
        {(question || result || error) && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Query Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <textarea
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            maxLength={500}
            rows={2}
            placeholder="e.g., When does my passport expire? Or what was the amount of my last insurance bill?"
            className="w-full rounded-lg border border-input bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition resize-none pr-12"
          />
          <div className="absolute right-2.5 bottom-2.5 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {question.length}/500
            </span>
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
              aria-label="Submit question"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Validation error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2.5 rounded-md">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>

      {/* AI Answer Result Card */}
      {result && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-card p-4 space-y-3 shadow-sm animate-in fade-in duration-300">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Response</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
            {result.answer}
          </p>

          {/* Matched Documents */}
          {result.matchedDocumentIds.length > 0 && (
            <div className="pt-2 border-t border-border">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">
                Referenced Documents:
              </span>
              <div className="flex flex-wrap gap-2">
                {result.matchedDocumentIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => navigate(`/documents/${id}`)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors"
                  >
                    <FileText className="h-3 w-3 text-primary" />
                    <span>View Document</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
