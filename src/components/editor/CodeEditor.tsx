'use client';
// ════════════════════════════════════════════════════════════
// src/components/editor/CodeEditor.tsx
// Monaco Editor wrapper
// ════════════════════════════════════════════════════════════

import { useRef, useEffect } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
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
}

export default function CodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
  height = '420px',
}: CodeEditorProps) {

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
        theme="bitbybit-dark"
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
