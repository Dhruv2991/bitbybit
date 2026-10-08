// ════════════════════════════════════════════════════════════
// src/lib/visualizerAnalytics.ts
// Intelligent State Diffing, Execution Heatmap Analysis,
// Event-Driven Jump Indexing, and Call Stack Synthesis.
// ════════════════════════════════════════════════════════════

import type { ExecStep, StackFrame } from '@/lib/visualizer';

export type VariableDiffStatus = 'added' | 'modified' | 'removed' | 'unchanged';

export interface ArrayElementDiff {
  index: number;
  value: string;
  prevValue?: string;
  changed: boolean;
}

export interface ObjectPropertyDiff {
  key: string;
  value: string;
  prevValue?: string;
  status: VariableDiffStatus;
}

export interface VariableDiffItem {
  name: string;
  value: string;
  prevValue?: string;
  status: VariableDiffStatus;
  kind: 'int' | 'float' | 'str' | 'bool' | 'list' | 'dict' | 'tuple' | 'none' | 'other';
  isArray: boolean;
  isObject: boolean;
  arrayElements?: ArrayElementDiff[];
  objectProperties?: ObjectPropertyDiff[];
}

export interface LineHeatmap {
  line: number;
  count: number;
  intensity: number; // 0.0 to 1.0
  isHotspot: boolean;
  heatColor: string;
  heatBg: string;
}

export interface TraceIndex {
  mutationMap: Record<string, number[]>;
  lineMap: Record<number, number[]>;
  errorStepIndex: number | null;
  totalSteps: number;
  hotspotLines: number[];
  maxLineCount: number;
  lineHeatmap: Record<number, LineHeatmap>;
  allVariableNames: string[];
}

// ── 1. Value Classifier ───────────────────────────────────────

export function classifyVariableValue(repr: string): 'int' | 'float' | 'str' | 'bool' | 'list' | 'dict' | 'tuple' | 'none' | 'other' {
  if (!repr) return 'none';
  const trimmed = repr.trim();
  if (trimmed === 'None' || trimmed === 'null' || trimmed === 'nil' || trimmed === 'nullptr' || trimmed === 'undefined') return 'none';
  if (trimmed === 'True' || trimmed === 'False' || trimmed === 'true' || trimmed === 'false') return 'bool';
  if (/^-?\d+$/.test(trimmed)) return 'int';
  if (/^-?\d+\.\d+$/.test(trimmed)) return 'float';
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) return 'str';
  if (trimmed.startsWith('[') || (trimmed.startsWith('{') && trimmed.endsWith('}') && !trimmed.includes(':') && trimmed.includes(','))) return 'list';
  if (trimmed.startsWith('{') && (trimmed.includes(':') || trimmed === '{}')) return 'dict';
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return 'tuple';
  return 'other';
}

// ── 2. Safe Array & Object Parser for Element-Level Diffing ───

export function parseArrayElements(repr: string): string[] | null {
  if (!repr) return null;
  const trimmed = repr.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  // Split by top-level commas respecting nested brackets/quotes
  const elements: string[] = [];
  let depth = 0;
  let inQuote: string | null = null;
  let current = '';

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    const prevChar = i > 0 ? inner[i - 1] : '';

    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (inQuote === char) inQuote = null;
      else if (!inQuote) inQuote = char;
      current += char;
    } else if (!inQuote && (char === '[' || char === '{' || char === '(')) {
      depth++;
      current += char;
    } else if (!inQuote && (char === ']' || char === '}' || char === ')')) {
      depth--;
      current += char;
    } else if (!inQuote && char === ',' && depth === 0) {
      elements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    elements.push(current.trim());
  }

  return elements;
}

export function parseObjectEntries(repr: string): Record<string, string> | null {
  if (!repr) return null;
  const trimmed = repr.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return {};

  const entries: Record<string, string> = {};
  let depth = 0;
  let inQuote: string | null = null;
  let current = '';

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    const prevChar = i > 0 ? inner[i - 1] : '';

    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (inQuote === char) inQuote = null;
      else if (!inQuote) inQuote = char;
      current += char;
    } else if (!inQuote && (char === '[' || char === '{' || char === '(')) {
      depth++;
      current += char;
    } else if (!inQuote && (char === ']' || char === '}' || char === ')')) {
      depth--;
      current += char;
    } else if (!inQuote && char === ',' && depth === 0) {
      const colonIdx = current.indexOf(':');
      if (colonIdx !== -1) {
        const k = current.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
        const v = current.slice(colonIdx + 1).trim();
        entries[k] = v;
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    const colonIdx = current.indexOf(':');
    if (colonIdx !== -1) {
      const k = current.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
      const v = current.slice(colonIdx + 1).trim();
      entries[k] = v;
    }
  }

  return entries;
}

// ── 3. Intelligent State Diffing ──────────────────────────────

export function computeStateDiff(
  prevVars: Record<string, string> | null | undefined,
  currVars: Record<string, string> | null | undefined
): VariableDiffItem[] {
  const prev = prevVars || {};
  const curr = currVars || {};
  const allKeys = Array.from(new Set([...Object.keys(prev), ...Object.keys(curr)]));

  const items: VariableDiffItem[] = [];

  for (const name of allKeys) {
    const hasPrev = name in prev;
    const hasCurr = name in curr;
    const prevVal = prev[name];
    const currVal = curr[name];

    let status: VariableDiffStatus = 'unchanged';
    if (!hasPrev && hasCurr) {
      status = 'added';
    } else if (hasPrev && !hasCurr) {
      status = 'removed';
    } else if (prevVal !== currVal) {
      status = 'modified';
    }

    const valueToInspect = hasCurr ? currVal : prevVal || '';
    const kind = classifyVariableValue(valueToInspect);

    let isArray = kind === 'list';
    let isObject = kind === 'dict';
    let arrayElements: ArrayElementDiff[] | undefined;
    let objectProperties: ObjectPropertyDiff[] | undefined;

    // Element-level diff for arrays
    if (isArray && hasCurr) {
      const currArr = parseArrayElements(currVal);
      const prevArr = hasPrev ? parseArrayElements(prevVal) : null;

      if (currArr && currArr.length <= 100) {
        arrayElements = currArr.map((elVal, idx) => {
          const prevEl = prevArr && idx < prevArr.length ? prevArr[idx] : undefined;
          const changed = prevEl === undefined || prevEl !== elVal;
          return {
            index: idx,
            value: elVal,
            prevValue: prevEl,
            changed,
          };
        });
      }
    }

    // Property-level diff for objects/dicts
    if (isObject && hasCurr) {
      const currObj = parseObjectEntries(currVal);
      const prevObj = hasPrev ? parseObjectEntries(prevVal) : null;

      if (currObj) {
        const allPropKeys = Array.from(new Set([...Object.keys(prevObj || {}), ...Object.keys(currObj)]));
        objectProperties = allPropKeys.map((pKey) => {
          const pPrev = prevObj ? prevObj[pKey] : undefined;
          const pCurr = currObj[pKey];
          let pStatus: VariableDiffStatus = 'unchanged';
          if (pPrev === undefined && pCurr !== undefined) pStatus = 'added';
          else if (pPrev !== undefined && pCurr === undefined) pStatus = 'removed';
          else if (pPrev !== pCurr) pStatus = 'modified';

          return {
            key: pKey,
            value: pCurr ?? (pPrev || ''),
            prevValue: pPrev,
            status: pStatus,
          };
        });
      }
    }

    items.push({
      name,
      value: currVal ?? (prevVal || ''),
      prevValue: hasPrev ? prevVal : undefined,
      status,
      kind,
      isArray,
      isObject,
      arrayElements,
      objectProperties,
    });
  }

  // Sort: modified/added first, then unchanged, then removed
  const statusRank: Record<VariableDiffStatus, number> = {
    modified: 0,
    added: 1,
    removed: 2,
    unchanged: 3,
  };

  return items.sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.name.localeCompare(b.name));
}

// ── 4. Execution Heatmap Computation ──────────────────────────

export function computeLineHeatmap(steps: ExecStep[]): {
  lineHeatmap: Record<number, LineHeatmap>;
  maxCount: number;
  hotspots: number[];
} {
  const lineCounts: Record<number, number> = {};
  for (const s of steps) {
    if (s.line > 0) {
      lineCounts[s.line] = (lineCounts[s.line] || 0) + 1;
    }
  }

  const counts = Object.values(lineCounts);
  const maxCount = counts.length > 0 ? Math.max(...counts) : 1;
  const avgCount = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 1;

  const lineHeatmap: Record<number, LineHeatmap> = {};
  const hotspots: number[] = [];

  for (const [lineStr, count] of Object.entries(lineCounts)) {
    const line = Number(lineStr);
    const intensity = Math.min(1, count / maxCount);
    const isHotspot = count >= 3 && count >= avgCount * 1.5;

    if (isHotspot) {
      hotspots.push(line);
    }

    // Heat color scale from cool cyan (low) to amber (mid) to flame rose/red (high loop activity)
    let heatColor = 'text-cyan-400';
    let heatBg = 'bg-cyan-500/10 border-cyan-500/20';

    if (intensity > 0.75) {
      heatColor = 'text-rose-400';
      heatBg = 'bg-rose-500/20 border-rose-500/40';
    } else if (intensity > 0.45) {
      heatColor = 'text-amber-400';
      heatBg = 'bg-amber-500/15 border-amber-500/30';
    } else if (intensity > 0.2) {
      heatColor = 'text-emerald-400';
      heatBg = 'bg-emerald-500/10 border-emerald-500/20';
    }

    lineHeatmap[line] = {
      line,
      count,
      intensity,
      isHotspot,
      heatColor,
      heatBg,
    };
  }

  return { lineHeatmap, maxCount, hotspots };
}

// ── 5. Event-Driven Jump Indexer ──────────────────────────────

export function buildTraceIndex(steps: ExecStep[], error?: string): TraceIndex {
  const mutationMap: Record<string, number[]> = {};
  const lineMap: Record<number, number[]> = {};
  const varNamesSet = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prev = i > 0 ? steps[i - 1] : null;

    // Line indexing
    if (step.line > 0) {
      if (!lineMap[step.line]) lineMap[step.line] = [];
      lineMap[step.line].push(i);
    }

    // Variable mutations indexing
    const currVars = step.variables || {};
    const prevVars = prev?.variables || {};

    for (const [k, v] of Object.entries(currVars)) {
      varNamesSet.add(k);
      if (!prev || prevVars[k] !== v) {
        if (!mutationMap[k]) mutationMap[k] = [];
        mutationMap[k].push(i);
      }
    }
  }

  const { lineHeatmap, maxCount, hotspots } = computeLineHeatmap(steps);

  // Error step detection
  let errorStepIndex: number | null = null;
  if (error && steps.length > 0) {
    errorStepIndex = steps.length - 1;
  }

  return {
    mutationMap,
    lineMap,
    errorStepIndex,
    totalSteps: steps.length,
    hotspotLines: hotspots,
    maxLineCount: maxCount,
    lineHeatmap,
    allVariableNames: Array.from(varNamesSet).sort(),
  };
}

export function findNextMutationStep(
  mutationMap: Record<string, number[]>,
  currentStepIdx: number,
  varName?: string
): number | null {
  if (varName && mutationMap[varName]) {
    const steps = mutationMap[varName];
    const next = steps.find((idx) => idx > currentStepIdx);
    return next !== undefined ? next : null;
  }

  // Any variable mutation
  let minNext: number | null = null;
  for (const stepList of Object.values(mutationMap)) {
    const next = stepList.find((idx) => idx > currentStepIdx);
    if (next !== undefined && (minNext === null || next < minNext)) {
      minNext = next;
    }
  }
  return minNext;
}

export function findPrevMutationStep(
  mutationMap: Record<string, number[]>,
  currentStepIdx: number,
  varName?: string
): number | null {
  if (varName && mutationMap[varName]) {
    const steps = mutationMap[varName];
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i] < currentStepIdx) return steps[i];
    }
    return null;
  }

  // Any variable mutation
  let maxPrev: number | null = null;
  for (const stepList of Object.values(mutationMap)) {
    for (let i = stepList.length - 1; i >= 0; i--) {
      const idx = stepList[i];
      if (idx < currentStepIdx) {
        if (maxPrev === null || idx > maxPrev) {
          maxPrev = idx;
        }
        break;
      }
    }
  }
  return maxPrev;
}

export function findNextLineStep(
  lineMap: Record<number, number[]>,
  currentStepIdx: number,
  line: number
): number | null {
  const steps = lineMap[line];
  if (!steps) return null;
  const next = steps.find((idx) => idx > currentStepIdx);
  return next !== undefined ? next : null;
}

export function findPrevLineStep(
  lineMap: Record<number, number[]>,
  currentStepIdx: number,
  line: number
): number | null {
  const steps = lineMap[line];
  if (!steps) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i] < currentStepIdx) return steps[i];
  }
  return null;
}

// ── 6. Visual Call Stack Synthesis & Inspection ───────────────

export interface ResolvedStackFrame {
  id: string;
  functionName: string;
  depth: number;
  line: number;
  variables: Record<string, string>;
  isTop: boolean;
  argsString?: string;
}

export function resolveCallStack(
  currentStep: ExecStep | null,
  prevStep: ExecStep | null,
  functionNameHint?: string
): {
  frames: ResolvedStackFrame[];
  isPushed: boolean;
  isPopped: boolean;
  depthChange: number;
} {
  if (!currentStep) {
    return { frames: [], isPushed: false, isPopped: false, depthChange: 0 };
  }

  // If the step already has explicit stack frames from tracer
  if (currentStep.stack && currentStep.stack.length > 0) {
    const rawFrames = currentStep.stack;
    const prevFrames = prevStep?.stack || [];

    const depthChange = rawFrames.length - prevFrames.length;
    const isPushed = depthChange > 0;
    const isPopped = depthChange < 0;

    const resolved: ResolvedStackFrame[] = rawFrames.map((f, idx) => {
      // Build brief args representation from frame variables if available
      const argEntries = Object.entries(f.variables).slice(0, 3);
      const argsString = argEntries.length > 0 ? argEntries.map(([k, v]) => `${k}=${v}`).join(', ') : undefined;

      return {
        id: f.id || `${f.functionName}_${idx}`,
        functionName: f.functionName || 'function',
        depth: rawFrames.length - idx,
        line: f.line || currentStep.line,
        variables: f.variables || {},
        isTop: idx === 0,
        argsString,
      };
    });

    return { frames: resolved, isPushed, isPopped, depthChange };
  }

  // Synthesize single root frame if no multi-frame stack recorded
  const fnName = currentStep.functionName || functionNameHint || 'solution';
  const argEntries = Object.entries(currentStep.variables).slice(0, 3);
  const argsString = argEntries.length > 0 ? argEntries.map(([k, v]) => `${k}=${v}`).join(', ') : undefined;

  const defaultFrame: ResolvedStackFrame = {
    id: `frame_0_${currentStep.line}`,
    functionName: fnName,
    depth: 1,
    line: currentStep.line,
    variables: currentStep.variables,
    isTop: true,
    argsString,
  };

  return {
    frames: [defaultFrame],
    isPushed: false,
    isPopped: false,
    depthChange: 0,
  };
}
