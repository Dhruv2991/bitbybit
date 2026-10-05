'use client';
// ════════════════════════════════════════════════════════════
// src/components/admin/MarkdownEditorWithImages.tsx
//
// Admin Problem Markdown Editor with:
// - Drag-and-drop image upload
// - Clipboard paste image upload (Ctrl+V screenshot/diagram paste)
// - File picker image upload button
// - Live LeetCode-grade Preview tab
// ════════════════════════════════════════════════════════════

import React, { useState, useRef, useCallback } from 'react';
import ProblemDescription from '@/components/problem/ProblemDescription';
import type { Problem } from '@/types/database';

interface MarkdownEditorWithImagesProps {
  value: string;
  onChange: (val: string) => void;
  rows?: number;
  placeholder?: string;
  onAiImprove?: () => void;
  improvingAi?: boolean;
  problemPreviewData?: Partial<Problem>;
}

export default function MarkdownEditorWithImages({
  value,
  onChange,
  rows = 8,
  placeholder = 'Write problem statement in Markdown or HTML...',
  onAiImprove,
  improvingAi = false,
  problemPreviewData,
}: MarkdownEditorWithImagesProps) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Uploads an image file to the server and returns the public URL
   */
  async function uploadImageFile(file: File): Promise<string> {
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload image');
      }

      return data.url;
    } finally {
      setUploading(false);
    }
  }

  /**
   * Inserts text at current cursor position in the textarea
   */
  const insertAtCursor = useCallback(
    (textToInsert: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(value + '\n' + textToInsert);
        return;
      }

      const start = textarea.selectionStart ?? value.length;
      const end = textarea.selectionEnd ?? value.length;

      const newValue = value.substring(0, start) + textToInsert + value.substring(end);
      onChange(newValue);

      // Restore cursor position after inserted text
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
      }, 50);
    },
    [value, onChange]
  );

  /**
   * Handles clipboard paste events for screenshots and images
   */
  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            const url = await uploadImageFile(file);
            const markdownImg = `\n![Architecture / Tree Diagram](${url})\n`;
            insertAtCursor(markdownImg);
          } catch (err: any) {
            setUploadError(err.message || 'Image upload failed');
          }
        }
        return;
      }
    }
  }

  /**
   * Handles file drop events
   */
  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        try {
          const url = await uploadImageFile(file);
          const altText = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          const markdownImg = `\n![${altText}](${url})\n`;
          insertAtCursor(markdownImg);
        } catch (err: any) {
          setUploadError(err.message || 'Image upload failed');
        }
      }
    }
  }

  /**
   * Handles manual file picker selection
   */
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const url = await uploadImageFile(file);
        const altText = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const markdownImg = `\n![${altText}](${url})\n`;
        insertAtCursor(markdownImg);
      } catch (err: any) {
        setUploadError(err.message || 'Image upload failed');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  }

  const dummyProblem: Problem = {
    id: 'preview',
    title: problemPreviewData?.title || 'Problem Preview',
    difficulty: problemPreviewData?.difficulty || 'Medium',
    points: problemPreviewData?.points || 100,
    tags: problemPreviewData?.tags || ['Algorithms'],
    description: value || '<p>No description provided yet.</p>',
    example: problemPreviewData?.example || '',
    starter_code: problemPreviewData?.starter_code || '',
    param_types: problemPreviewData?.param_types || [],
    return_type: problemPreviewData?.return_type || 'int',
    test_cases: problemPreviewData?.test_cases || [],
    submission_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="space-y-2">
      {/* ── Header Toolbar & Tabs ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setTab('write')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all ${
              tab === 'write'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            ✏️ Write (Markdown/HTML)
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all ${
              tab === 'preview'
                ? 'bg-zinc-800 text-cyan-300 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            👁️ Live Preview
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700/80 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 disabled:opacity-50 transition-colors"
            title="Upload and insert image"
          >
            {uploading ? (
              <>
                <span className="w-2.5 h-2.5 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <span>🖼️</span>
                <span>Upload Image</span>
              </>
            )}
          </button>

          {onAiImprove && (
            <button
              type="button"
              onClick={onAiImprove}
              disabled={improvingAi || !value.trim()}
              className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg
                bg-purple-500/10 border border-purple-500/25 text-purple-400
                hover:bg-purple-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {improvingAi ? (
                <>
                  <span className="w-2.5 h-2.5 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                  Improving…
                </>
              ) : (
                '✦ AI Improve'
              )}
            </button>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="text-[11px] text-rose-400 font-mono bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg">
          ⚠️ {uploadError}
        </div>
      )}

      {/* ── Tab Content ── */}
      {tab === 'write' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className="relative rounded-lg overflow-hidden"
        >
          {isDragging && (
            <div className="absolute inset-0 z-20 bg-cyan-950/80 border-2 border-dashed border-cyan-400 rounded-lg flex flex-col items-center justify-center text-cyan-200 pointer-events-none backdrop-blur-xs">
              <span className="text-2xl mb-1">🖼️</span>
              <span className="font-mono text-xs font-semibold">Drop image to upload & embed</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            rows={rows}
            placeholder={placeholder}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm font-mono text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 leading-relaxed"
          />

          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mt-1 px-1">
            <span>💡 Tip: Paste (Ctrl+V) or Drag & Drop images directly into editor</span>
            <span>{value.length} characters</span>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-5 max-h-[500px] overflow-y-auto">
          <ProblemDescription problem={dummyProblem} />
        </div>
      )}
    </div>
  );
}
