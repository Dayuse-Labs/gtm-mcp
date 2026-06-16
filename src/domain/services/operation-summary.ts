import { type ContainerState } from '../ports/gtm-client.js';
import { type Operation } from '../value-objects/operation.js';
import { findExisting } from './state-query.js';

function refLabel(op: Operation): string {
  const t = op.target;
  if (t === undefined) return '(new)';
  return t.name ?? t.id ?? t.ref ?? '(?)';
}

/** Server-managed / location / self-id fields — noise in a human diff (not references). */
const NOISE = new Set<string>([
  'fingerprint',
  'path',
  'tagManagerUrl',
  'accountId',
  'containerId',
  'workspaceId',
  'tagId',
  'triggerId',
  'variableId',
  'clientId',
  'transformationId',
  'folderId',
  'templateId',
  'zoneId',
  'builtInVariableId',
  'gtmMetaData',
]);

const MAX_INLINE = 120; // longer strings get a focused diff instead of a full dump
const MAX_CHANGES = 8; // cap how many field changes a single op line enumerates

type ChangeKind = 'changed' | 'added' | 'removed';
interface FieldChange {
  readonly path: string;
  readonly from?: string;
  readonly to?: string;
  readonly kind: ChangeKind;
}

function show(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return String(v);
  return JSON.stringify(v);
}

function clip(s: string): string {
  return s.length > MAX_INLINE ? `${s.slice(0, MAX_INLINE)}…` : s;
}

/** For two long strings, surface only the differing region with a little context. */
function focusedString(a: string, b: string): { from: string; to: string } {
  const min = Math.min(a.length, b.length);
  let p = 0;
  while (p < min && a[p] === b[p]) p += 1;
  let suf = 0;
  while (
    suf < a.length - p &&
    suf < b.length - p &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  ) {
    suf += 1;
  }
  const ctx = 12;
  const preStart = Math.max(0, p - ctx);
  const pre = a.slice(preStart, p);
  const post = a.slice(a.length - suf, a.length - suf + ctx);
  const lead = preStart > 0 ? '…' : '';
  const tail = a.length - suf + ctx < a.length ? '…' : '';
  return {
    from: lead + pre + a.slice(p, a.length - suf) + post + tail,
    to: lead + pre + b.slice(p, b.length - suf) + post + tail,
  };
}

function diff(oldV: unknown, newV: unknown, path: string, out: FieldChange[]): void {
  if (out.length > 50) return; // runaway guard
  const oObj = oldV !== null && typeof oldV === 'object' && !Array.isArray(oldV);
  const nObj = newV !== null && typeof newV === 'object' && !Array.isArray(newV);
  if (oObj && nObj) {
    const o = oldV as Record<string, unknown>;
    const n = newV as Record<string, unknown>;
    for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
      if (NOISE.has(k)) continue;
      diff(o[k], n[k], path ? `${path}.${k}` : k, out);
    }
    return;
  }
  if (Array.isArray(oldV) && Array.isArray(newV)) {
    const len = Math.max(oldV.length, newV.length);
    for (let i = 0; i < len; i += 1) diff(oldV[i], newV[i], `${path}[${i}]`, out);
    return;
  }
  if (oldV === undefined && newV !== undefined) {
    out.push({ path, to: clip(show(newV)), kind: 'added' });
    return;
  }
  if (oldV !== undefined && newV === undefined) {
    out.push({ path, from: clip(show(oldV)), kind: 'removed' });
    return;
  }
  const os = show(oldV);
  const ns = show(newV);
  if (os === ns) return;
  if (
    typeof oldV === 'string' &&
    typeof newV === 'string' &&
    (oldV.length > MAX_INLINE || newV.length > MAX_INLINE)
  ) {
    const f = focusedString(oldV, newV);
    out.push({ path, from: clip(f.from), to: clip(f.to), kind: 'changed' });
  } else {
    out.push({ path, from: clip(os), to: clip(ns), kind: 'changed' });
  }
}

function renderChange(c: FieldChange): string {
  if (c.kind === 'added') return `${c.path}: (added) "${c.to ?? ''}"`;
  if (c.kind === 'removed') return `${c.path}: (removed) "${c.from ?? ''}"`;
  return `${c.path} "${c.from ?? ''}" → "${c.to ?? ''}"`;
}

/**
 * Plain-language, one line per operation — the human-facing half of a Preview (ADR 0006).
 * Updates enumerate field-level VALUE changes (condition values, event labels inside
 * tag bodies, …), not just renames — so a reviewer sees the real edit.
 */
export function summarize(operations: readonly Operation[], state: ContainerState): string[] {
  return operations.map((op) => {
    if (op.op === 'create') {
      const name = typeof op.data?.name === 'string' ? op.data.name : '(unnamed)';
      return `Create ${op.entity} «${name}»`;
    }
    if (op.op === 'delete') {
      return `Delete ${op.entity} «${refLabel(op)}»`;
    }
    // update
    const found = op.target ? findExisting(state, op.entity, op.target) : null;
    const current = found && found.success ? found.data.raw : null;
    const oldName = found && found.success ? found.data.name : refLabel(op);
    const next = op.data ?? {};

    const changes: FieldChange[] = [];
    if (current) {
      diff(current, next, '', changes);
    } else {
      for (const [k, v] of Object.entries(next)) {
        if (!NOISE.has(k)) changes.push({ path: k, to: clip(show(v)), kind: 'changed' });
      }
    }

    if (changes.length === 0) {
      return `Update ${op.entity} «${oldName}» (no field changes detected)`;
    }
    const only = changes[0];
    if (changes.length === 1 && only && only.path === 'name' && only.kind === 'changed') {
      return `Rename ${op.entity} «${only.from ?? oldName}» → «${only.to ?? ''}»`;
    }
    const shown = changes.slice(0, MAX_CHANGES).map(renderChange);
    const extra = changes.length > MAX_CHANGES ? `; (+${changes.length - MAX_CHANGES} more)` : '';
    return `Update ${op.entity} «${oldName}»: ${shown.join('; ')}${extra}`;
  });
}
