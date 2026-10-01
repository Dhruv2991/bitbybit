'use client';
// ════════════════════════════════════════════════════════════
// src/components/editor/CodeEditor.tsx
// Monaco Editor wrapper
// ════════════════════════════════════════════════════════════

import { useRef, useEffect, useState } from 'react';
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react';
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
  const [monacoTheme, setMonacoTheme] = useState<'bitbybit-dark' | 'bitbybit-light'>('bitbybit-dark');

  // Monaco actions are registered once on mount, so the callbacks they
  // invoke need to go through a ref — otherwise they'd keep calling
  // whatever onRun/onSubmit were on the very first render (e.g. always
  // seeing running=false) instead of the latest ones.
  const onRunRef    = useRef(onRun);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => { onRunRef.current = onRun; }, [onRun]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);

  useEffect(() => {
    const read = () =>
      setMonacoTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'bitbybit-light' : 'bitbybit-dark');
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('bitbybit-dark', {
      base:    'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',  foreground: '6b7280', fontStyle: 'italic' },
        { token: 'keyword',  foreground: 'a78bfa', fontStyle: 'bold' },
        { token: 'string',   foreground: '00e87a' },
        { token: 'number',   foreground: 'f0b429' },
        { token: 'type',     foreground: '60a5fa' },
        { token: 'function', foreground: 'fbbf24' },
        { token: 'variable', foreground: 'f3f4f6' },
        { token: 'operator', foreground: 'ff7eb6' },
      ],
      colors: {
        'editor.background':                      '#0f0f0f',
        'editor.foreground':                      '#f3f4f6',
        'editorGutter.background':                '#0f0f0f',
        'editorLineNumber.foreground':             '#4b5563',
        'editorLineNumber.activeForeground':       '#00e87a',
        'editor.selectionBackground':             '#00e87a40',
        'editor.inactiveSelectionBackground':     '#00e87a25',
        'editor.selectionHighlightBackground':    '#00e87a30',
        'editor.wordHighlightBackground':         '#00e87a25',
        'editor.wordHighlightStrongBackground':   '#00e87a35',
        'editor.lineHighlightBackground':         '#18181b',
        'editor.lineHighlightBorder':             '#00000000',
        'editorCursor.foreground':                '#00e87a',
        'editorBracketMatch.background':          '#00e87a30',
        'editorBracketMatch.border':              '#00e87a',
        'scrollbarSlider.background':             '#27272a',
        'scrollbarSlider.hoverBackground':        '#3f3f46',
        'scrollbarSlider.activeBackground':       '#52525b',
      },
    });
    monaco.editor.defineTheme('bitbybit-light', {
      base:    'vs',
      inherit: true,
      rules: [
        { token: 'comment',  foreground: '8a8a94', fontStyle: 'italic' },
        { token: 'keyword',  foreground: '7c3aed', fontStyle: 'bold' },
        { token: 'string',   foreground: '15803d' },
        { token: 'number',   foreground: 'b45309' },
        { token: 'type',     foreground: '1d4ed8' },
        { token: 'function', foreground: 'a16207' },
        { token: 'variable', foreground: '17171b' },
        { token: 'operator', foreground: 'be185d' },
      ],
      colors: {
        'editor.background':                      '#f7f7f8',
        'editor.foreground':                      '#17171b',
        'editorGutter.background':                '#f7f7f8',
        'editorLineNumber.foreground':             '#9ca3af',
        'editorLineNumber.activeForeground':       '#00b368',
        'editor.selectionBackground':             '#00e87a40',
        'editor.inactiveSelectionBackground':     '#00e87a25',
        'editor.selectionHighlightBackground':    '#00e87a30',
        'editor.lineHighlightBackground':         '#ececef',
        'editorCursor.foreground':                '#00b368',
        'editorBracketMatch.background':          '#00e87a30',
        'editorBracketMatch.border':              '#00b368',
        'scrollbarSlider.background':             '#dadae0',
        'scrollbarSlider.hoverBackground':        '#c2c2cc',
      },
    });
  };

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
    <div className="rounded-lg overflow-hidden border border-[var(--border2)] bg-[#0f0f0f]">
      <Editor
        height={height}
        language={MONACO_LANG_MAP[language] || 'python'}
        value={value}
        theme={monacoTheme}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={(v) => onChange(v ?? '')}
        loading={
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            fontSize: '13px',
            fontFamily: '"JetBrains Mono", monospace',
            background: '#0f0f0f',
          }}>
            Loading editor...
          </div>
        }
        options={{
          readOnly,
          fontSize:                   14,
          fontFamily:                 '"JetBrains Mono", "Fira Code", monospace',
          fontLigatures:              true,
          minimap:                    { enabled: false },
          scrollBeyondLastLine:       false,
          lineNumbers:                'on',
          renderWhitespace:           'selection',
          tabSize:                    4,
          insertSpaces:               true,
          wordWrap:                   'on',
          automaticLayout:            true,
          cursorBlinking:             'blink',
          cursorSmoothCaretAnimation: 'on',
          cursorStyle:                'line',
          cursorWidth:                2,
          renderLineHighlight:        'all',
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
          padding: { top: 16, bottom: 16 },
        }}
      />
    </div>
  );
}
