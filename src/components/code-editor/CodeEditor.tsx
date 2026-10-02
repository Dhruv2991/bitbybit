'use client';
// ════════════════════════════════════════════════════════════
// src/components/code-editor/CodeEditor.tsx
// Monaco Editor wrapper with standard VS Code aesthetics
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

interface CodeEditorProps {
  value:     string;
  language:  SupportedLang;
  onChange:  (value: string) => void;
  readOnly?: boolean;
  height?:   string;
  /** Ctrl/Cmd+Enter while focused in the editor */
  onRun?:    () => void;
  /** Ctrl/Cmd+Shift+Enter while focused in the editor */
  onSubmit?: () => void;
}

export default function CodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
  height = '420px',
  onRun,
  onSubmit,
}: CodeEditorProps) {
  const [theme, setTheme] = useState<'vs-dark' | 'vs'>('vs-dark');

  const onRunRef    = useRef(onRun);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => { onRunRef.current = onRun; }, [onRun]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);

  useEffect(() => {
    const updateTheme = () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      setTheme(isLight ? 'vs' : 'vs-dark');
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleMount: OnMount = (editor, monaco) => {
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

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--border)] shadow-md bg-[#1e1e1e]">
      <Editor
        height={height}
        language={MONACO_LANG_MAP[language] || 'python'}
        value={value}
        theme={theme}
        onMount={handleMount}
        onChange={(v) => onChange(v ?? '')}
        loading={
          <div className="h-full flex items-center justify-center text-sm font-mono text-gray-400 bg-[#1e1e1e]">
            Loading editor...
          </div>
        }
        options={{
          readOnly,
          fontSize:                   14,
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
        }}
      />
    </div>
  );
}
