import { type Result, ok, err } from '../../shared/result.js';
import { type CatalogMode } from '../ports/datalayer-catalog.js';

/**
 * Pure parsing + compaction over the raw generated `datalayer-events.ts` source
 * (ADR 0008). No network, no TypeScript compiler — the file is generated and
 * regular (one `type X = …;` per line, one `"event": …;` per line in the
 * `DataLayerEvents` map), so a line/structure scan is enough.
 */

export interface ParsedCatalog {
  /** Helper type name → its body text (RHS of `type X = <body>;`). */
  readonly decls: ReadonlyMap<string, string>;
  /** Event name → its object shape (RHS of `"event": <rhs>;`). */
  readonly events: ReadonlyMap<string, string>;
}

// A single string literal: "double-quoted" or `backtick` (the catalog never escapes quotes).
const STR = '(?:"[^"]*"|`[^`]*`)';
// A run of >=2 string literals joined by `|` — the fat-union blowup source.
const UNION_RUN = new RegExp(`${STR}(?:\\s*\\|\\s*${STR})+`, 'g');
const STR_TOKEN = new RegExp(STR, 'g');

const DECL_LINE = /^(?:export )?type (\w+) = (.*);\s*$/;
const EVENT_LINE = /^\s*"([^"]+)":\s*(.*);\s*$/;
const EVENTS_OPEN = /^export type DataLayerEvents = \{/;

/** Collapse any string-literal union longer than 8 members; leave everything else verbatim. */
export function collapseUnions(body: string): string {
  return body.replace(UNION_RUN, (match) => {
    const members = match.match(STR_TOKEN) ?? [];
    if (members.length <= 8) return match;
    const head = members.slice(0, 2).join(' | ');
    return `<${members.length} strings: ${head} | … (+${members.length - 2} more)>`;
  });
}

export function parseCatalog(raw: string): ParsedCatalog {
  const decls = new Map<string, string>();
  const events = new Map<string, string>();

  let inEvents = false;
  for (const line of raw.split('\n')) {
    if (!inEvents) {
      if (EVENTS_OPEN.test(line)) {
        inEvents = true;
        continue;
      }
      const m = DECL_LINE.exec(line);
      if (m !== null && m[1] !== undefined && m[2] !== undefined && m[1] !== 'DataLayerEventName') {
        decls.set(m[1], m[2]);
      }
      continue;
    }

    if (line.trim().startsWith('}')) {
      inEvents = false;
      continue;
    }
    const em = EVENT_LINE.exec(line);
    if (em !== null && em[1] !== undefined && em[2] !== undefined) {
      events.set(em[1], em[2]);
    }
  }

  return { decls, events };
}

/** Cheap index: every event name. */
export function listEvents(parsed: ParsedCatalog): string[] {
  return [...parsed.events.keys()];
}

/** Names of parsed helper types referenced (by word boundary) in `rhs`. */
function referencedDecls(rhs: string, decls: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const name of decls.keys()) {
    if (new RegExp(`\\b${name}\\b`).test(rhs)) out.push(name);
  }
  return out;
}

export function getEvent(parsed: ParsedCatalog, name: string, mode: CatalogMode): Result<string> {
  const rhs = parsed.events.get(name);
  if (rhs === undefined) return err(new Error(`Unknown dataLayer event: ${name}`));

  let out = collapseUnions(rhs);
  if (mode === 'full') {
    const refs = referencedDecls(rhs, parsed.decls);
    if (refs.length > 0) {
      const expanded = refs
        .map((n) => `type ${n} = ${collapseUnions(parsed.decls.get(n) ?? '')};`)
        .join('\n');
      out += `\n\n// referenced types (1 level):\n${expanded}`;
    }
  }
  return ok(out);
}

export function getType(parsed: ParsedCatalog, name: string): Result<string> {
  const body = parsed.decls.get(name);
  if (body === undefined) return err(new Error(`Unknown dataLayer type: ${name}`));
  return ok(`type ${name} = ${collapseUnions(body)};`);
}
