'use client';
// ════════════════════════════════════════════════════════════
// src/app/duel/[roomId]/DuelEditor.tsx
// Monaco Editor direct component for Live Duel Arena with
// automaticLayout, responsive resizing, and dual-theme support.
// ════════════════════════════════════════════════════════════

import { useRef, useEffect, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { SupportedLang } from '@/types/database';

const MONACO_LANG_MAP: Record<SupportedLang, string> = {
  python:     'python',
  javascript: 'javascript',
  cpp:        'cpp',
  java:       'java',
  rust:       'rust',
  go:         'go',
};

interface DuelEditorProps {
  value:       string;
  language:    SupportedLang;
  onChange:    (value: string) => void;
  readOnly?:   boolean;
  height?:     string;
  activeLine?: number | null;
  /** Ctrl/Cmd+Enter while focused in the editor */
  onRun?:      () => void;
  /** Ctrl/Cmd+Shift+Enter while focused in the editor */
  onSubmit?:   () => void;
  options?:    Record<string, any>;
  className?:  string;
}

export default function DuelEditor({
  value,
  language,
  onChange,
  readOnly = false,
  height = '100%',
  activeLine = null,
  onRun,
  onSubmit,
  options: customOptions,
  className = '',
}: DuelEditorProps) {
  const [theme, setTheme] = useState<'vs-dark' | 'vs'>('vs-dark');
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const onRunRef = useRef(onRun);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => { onRunRef.current = onRun; }, [onRun]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);

  // Dual-theme synchronization: observes both .dark class and [data-theme='light'|'dark']
  useEffect(() => {
    const updateTheme = () => {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark';
      setTheme(isDark ? 'vs-dark' : 'vs');
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.addAction({
      id:          'format-code',
      label:       'Format Code',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run:         (ed) => { ed.getAction('editor.action.formatDocument')?.run(); },
    });
    editor.addAction({
      id:          'run-tests',
      label:       'Run Tests',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run:         () => { onRunRef.current?.(); },
    });
    editor.addAction({
      id:          'submit-solution',
      label:       'Submit Solution',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run:         () => { onSubmitRef.current?.(); },
    });
  };

  // Sync Active Line Decoration with Monaco if provided
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (activeLine && activeLine > 0) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(activeLine, 1, activeLine, 1),
          options: {
            isWholeLine: true,
            className: 'monaco-viz-active-line',
            glyphMarginClassName: 'monaco-viz-glyph',
          },
        },
      ]);
      editor.revealLineInCenterIfOutsideViewport(activeLine);
    } else {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    }
  }, [activeLine]);

  return (
    <div
      className={`rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 shadow-xs bg-white dark:bg-[#1e1e1e] relative w-full ${
        height === '100%' ? 'h-full flex-1 flex flex-col min-h-0' : ''
      } ${className}`}
    >
      <style jsx global>{`
        .monaco-viz-active-line {
          background: rgba(0, 229, 255, 0.15) !important;
          border-left: 3px solid #00E5FF !important;
        }
      `}</style>
      <div className="relative flex-1 min-h-0 w-full h-full flex flex-col">
        <Editor
          height={height}
          language={MONACO_LANG_MAP[language] || 'python'}
          value={value}
          theme={theme}
          onMount={handleMount}
          onChange={(v) => onChange(v ?? '')}
          loading={
            <div className="h-full flex items-center justify-center text-sm font-mono text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-[#1e1e1e]">
              Loading editor...
            </div>
          }
          options={{
            readOnly,
            fontSize:                   15.5,
            lineHeight:                 24,
            fontFamily:                 '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
            fontLigatures:              true,
            minimap:                    { enabled: false },
            scrollBeyondLastLine:       false,
            lineNumbers:                'on',
            folding:                    true,
            renderWhitespace:           'selection',
            tabSize:                    4,
            insertSpaces:               true,
            wordWrap:                   'on',
            automaticLayout:            true,
            cursorBlinking:             'blink',
            cursorSmoothCaretAnimation: 'on',
            cursorStyle:                'line',
            cursorWidth:                2,
            renderLineHighlight:        'line',
            matchBrackets:              'always',
            smoothScrolling:            true,
            bracketPairColorization:    { enabled: true },
            guides: {
              bracketPairs: true,
              indentation:  true,
            },
            suggest: {
              showKeywords: true,
              showSnippets: true,
            },
            ...customOptions,
          }}
        />
      </div>
    </div>
  );
}
