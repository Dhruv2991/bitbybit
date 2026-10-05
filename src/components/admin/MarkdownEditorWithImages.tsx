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
      if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.svg') || file.type.includes('svg')) {
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

  // Detect all uploaded or referenced images in the markdown/HTML text
  const detectedImages = React.useMemo(() => {
    const images: { src: string; alt: string; fullMatch: string }[] = [];
    if (!value) return images;

    // Match Markdown images: ![alt](url)
    const mdRegex = /!\[(.*?)\]\((.*?)\)/g;
    let match: RegExpExecArray | null;
    while ((match = mdRegex.exec(value)) !== null) {
      const srcUrl = match[2].split(/\s+/)[0];
      if (srcUrl) {
        images.push({
          src: srcUrl,
          alt: match[1] || 'Problem diagram',
          fullMatch: match[0],
        });
      }
    }

    // Match HTML images: <img src="..." />
    const htmlRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    while ((match = htmlRegex.exec(value)) !== null) {
      const src = match[1];
      const altMatch = match[0].match(/alt=["']([^"']*)["']/i);
      if (src && !images.some(i => i.src === src)) {
        images.push({
          src,
          alt: altMatch ? altMatch[1] : 'Image',
          fullMatch: match[0],
        });
      }
    }

    return images;
  }, [value]);

  const [previewModalImg, setPreviewModalImg] = useState<{ src: string; alt: string } | null>(null);

  function removeImageFromText(fullMatch: string) {
    const nextVal = value.replace(fullMatch, '').replace(/\n\s*\n\s*\n/g, '\n\n');
    onChange(nextVal);
  }

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
            className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              tab === 'preview'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-xs'
                : 'text-zinc-400 hover:text-cyan-300'
            }`}
          >
            <span>👁️ Live Preview</span>
            {detectedImages.length > 0 && (
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded-full font-mono">
                {detectedImages.length} img
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,.svg"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700/80 text-zinc-300 hover:text-zinc-100 hover:border-cyan-500/60 disabled:opacity-50 transition-colors shadow-xs"
            title="Upload and insert image"
          >
            {uploading ? (
              <>
                <span className="w-2.5 h-2.5 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>Uploading…</span>
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
                  <span>Improving…</span>
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
        <div className="space-y-2">
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

          {/* Attached images gallery chip bar */}
          {detectedImages.length > 0 && (
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-medium text-zinc-300 flex items-center gap-1.5">
                  <span>🖼️</span>
                  <span>Attached Images ({detectedImages.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setTab('preview')}
                  className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  View in Live Preview →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {detectedImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700 transition-colors group"
                  >
                    <div
                      onClick={() => setPreviewModalImg(img)}
                      className="w-12 h-12 rounded-md bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 cursor-pointer relative group-hover:ring-1 ring-cyan-500/50 flex items-center justify-center p-1"
                      title="Click to view full image"
                    >
                      <img
                        src={img.src}
                        alt={img.alt}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-mono text-zinc-200 truncate font-medium">
                        {img.alt || 'Problem image'}
                      </p>
                      <p className="text-[10px] font-mono text-zinc-500 truncate mt-0.5">
                        {img.src}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setPreviewModalImg(img)}
                          className="text-[10px] font-mono text-cyan-400 hover:underline"
                        >
                          Zoom
                        </button>
                        <span className="text-zinc-700">·</span>
                        <button
                          type="button"
                          onClick={() => removeImageFromText(img.fullMatch)}
                          className="text-[10px] font-mono text-rose-400 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-5 max-h-[600px] overflow-y-auto space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2 mb-2">
            <span className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
              <span>👁️</span>
              <span>LeetCode-Grade Problem Description Preview</span>
            </span>
            <button
              type="button"
              onClick={() => setTab('write')}
              className="text-xs font-mono text-cyan-400 hover:underline"
            >
              ← Back to Edit
            </button>
          </div>
          <ProblemDescription problem={dummyProblem} />
        </div>
      )}

      {/* Full Image Zoom Modal */}
      {previewModalImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewModalImg(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-mono text-zinc-300 font-semibold truncate">
                {previewModalImg.alt || 'Uploaded Image Preview'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewModalImg(null)}
                className="text-xs font-mono px-2 py-1 bg-zinc-800 text-zinc-400 hover:text-white rounded-md"
              >
                ✕ Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-zinc-900/50 rounded-xl p-2 border border-zinc-800/60">
              <img
                src={previewModalImg.src}
                alt={previewModalImg.alt}
                className="max-w-full w-full max-h-[65vh] object-contain rounded-lg"
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400 pt-1">
              <span className="truncate flex-1 mr-2">{previewModalImg.src}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`![${previewModalImg.alt}](${previewModalImg.src})`);
                }}
                className="text-xs font-mono text-cyan-400 hover:underline shrink-0"
              >
                📋 Copy Markdown Tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
