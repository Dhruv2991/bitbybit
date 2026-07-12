'use client';
// ════════════════════════════════════════════════════════════
// src/components/editor/CodeEditor.tsx
// Monaco Editor wrapper
// ════════════════════════════════════════════════════════════

import { useRef, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { OnMount, BeforeMount } from '@monaco-editor/react';
import type { SupportedLang } from '@/types/database';

const Editor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.default),
  {
    ssr: false,
    loading: () => (
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
    ),
  }
);

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
}

export default function CodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
  height = '420px',
}: CodeEditorProps) {

  const [monacoTheme, setMonacoTheme] = useState<'bitbybit-dark' | 'bitbybit-light'>('bitbybit-dark');

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
        { token: 'comment',  foreground: '555555', fontStyle: 'italic' },
        { token: 'keyword',  foreground: 'a78bfa', fontStyle: 'bold' },
        { token: 'string',   foreground: '00e87a' },
        { token: 'number',   foreground: 'f0b429' },
        { token: 'type',     foreground: '60a5fa' },
        { token: 'function', foreground: 'fbbf24' },
        { token: 'variable', foreground: 'e0e0e0' },
        { token: 'operator', foreground: 'ff7eb6' },
      ],
      colors: {
        'editor.background':                      '#0f0f0f',
        'editor.foreground':                      '#e0e0e0',
        'editorLineNumber.foreground':             '#333333',
        'editorLineNumber.activeForeground':       '#666666',
        'editor.selectionBackground':             '#00e87a22',
        'editor.lineHighlightBackground':         '#161616',
        'editorCursor.foreground':                '#00e87a',
        'editor.selectionHighlightBackground':    '#00e87a15',
        'editorBracketMatch.background':          '#00e87a20',
        'editorBracketMatch.border':              '#00e87a',
        'scrollbarSlider.background':             '#1f1f1f',
        'scrollbarSlider.hoverBackground':        '#2a2a2a',
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
        'editorLineNumber.foreground':             '#b8b8c3',
        'editorLineNumber.activeForeground':       '#7a7a81',
        'editor.selectionBackground':             '#00e87a33',
        'editor.lineHighlightBackground':         '#ececef',
        'editorCursor.foreground':                '#00b368',
        'editor.selectionHighlightBackground':    '#00e87a22',
        'editorBracketMatch.background':          '#00e87a30',
        'editorBracketMatch.border':              '#00b368',
        'scrollbarSlider.background':             '#dadae0',
        'scrollbarSlider.hoverBackground':        '#c2c2cc',
      },
    });
  };

  const handleMount: OnMount = (editor) => {
    editor.addAction({
      id:    'format-code',
      label: 'Format Code',
      keybindings: [(2048 | 49)], // Ctrl/Cmd+S
      run: (ed) => { ed.getAction('editor.action.formatDocument')?.run(); },
    });
  };

  return (
    <div className="rounded-lg overflow-hidden border border-[#1f1f1f]">
      <Editor
        height={height}
        language={MONACO_LANG_MAP[language]}
        value={value}
        theme={monacoTheme}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={(v) => onChange(v || '')}
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
          cursorBlinking:             'smooth',
          cursorSmoothCaretAnimation: 'on',
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