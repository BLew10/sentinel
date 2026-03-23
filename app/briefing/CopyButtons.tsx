'use client';

import { useState, useCallback } from 'react';

export function CopyBriefingButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const el = document.getElementById('briefing-content');
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.textContent ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  return (
    <button
      onClick={handleCopy}
      className="px-4 py-2 rounded-lg border border-green/30 bg-green-bg text-green text-sm font-medium hover:border-green/50 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy Briefing'}
    </button>
  );
}

export function CopyPromptButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const el = document.getElementById('prompt-content');
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.textContent ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1.5 rounded border border-purple/30 bg-purple-bg text-purple text-xs font-medium hover:border-purple/50 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy Prompt'}
    </button>
  );
}
