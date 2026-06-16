import { describe, it, expect } from 'vitest';
import { summarize } from './operation-summary.js';
import { type Operation } from '../value-objects/operation.js';
import { snap, stateWith } from '../../test-support/fakes.js';

describe('summarize', () => {
  it('shows a trigger firing-condition VALUE change, not just the rename', () => {
    const triggerRaw = {
      name: 'purchase (daypass)',
      type: 'customEvent',
      fingerprint: 'fp-A',
      triggerId: '1538',
      filter: [
        {
          type: 'equals',
          parameter: [
            { type: 'template', key: 'arg0', value: '{{commercialType}}' },
            { type: 'template', key: 'arg1', value: 'daypass' },
          ],
        },
      ],
    };
    const state = stateWith({
      trigger: [snap('trigger', '1538', 'purchase (daypass)', 'fp-A', triggerRaw)],
    });
    const next = {
      ...triggerRaw,
      name: 'purchase (dayaccess)',
      filter: [
        {
          type: 'equals',
          parameter: [
            { type: 'template', key: 'arg0', value: '{{commercialType}}' },
            { type: 'template', key: 'arg1', value: 'dayaccess' },
          ],
        },
      ],
    };
    const ops: Operation[] = [
      { op: 'update', entity: 'trigger', target: { id: '1538' }, data: next },
    ];
    const line = summarize(ops, state)[0] ?? '';
    expect(line).toContain('filter[0].parameter[1].value');
    expect(line).toContain('"daypass" → "dayaccess"');
    expect(line).toContain('name'); // rename still surfaced
  });

  it('surfaces an event-label change buried in a long tag html body without dumping the blob', () => {
    const html = (label: string) =>
      `<script>${'x'.repeat(300)}\n  fbq('track', '${label}', { value: {{v}} });\n${'y'.repeat(300)}</script>`;
    const raw = {
      name: 'FB - Purchase daypass',
      type: 'html',
      parameter: [{ type: 'template', key: 'html', value: html('Bookings Daypass') }],
    };
    const state = stateWith({ tag: [snap('tag', '1539', 'FB - Purchase daypass', 'fp-A', raw)] });
    const next = {
      ...raw,
      parameter: [{ type: 'template', key: 'html', value: html('Bookings Dayaccess') }],
    };
    const ops: Operation[] = [{ op: 'update', entity: 'tag', target: { id: '1539' }, data: next }];
    const line = summarize(ops, state)[0] ?? '';
    expect(line).toContain('parameter[0].value');
    expect(line).toContain('Bookings Dayaccess');
    expect(line).toContain('…'); // focused, not the full body
    expect(line.length).toBeLessThan(html('Bookings Dayaccess').length); // blob not dumped
  });

  it('renders a pure rename as a Rename line', () => {
    const state = stateWith({
      variable: [snap('variable', 'v1', 'daypass', 'fp-A', { name: 'daypass' })],
    });
    const ops: Operation[] = [
      { op: 'update', entity: 'variable', target: { id: 'v1' }, data: { name: 'dayaccess' } },
    ];
    expect(summarize(ops, state)[0]).toBe('Rename variable «daypass» → «dayaccess»');
  });

  it('ignores noise-only changes (e.g. fingerprint)', () => {
    const state = stateWith({
      variable: [snap('variable', 'v1', 'x', 'fp-A', { name: 'x', fingerprint: 'fp-A' })],
    });
    const ops: Operation[] = [
      {
        op: 'update',
        entity: 'variable',
        target: { id: 'v1' },
        data: { name: 'x', fingerprint: 'fp-B' },
      },
    ];
    const line = summarize(ops, state)[0] ?? '';
    expect(line).toContain('no field changes detected');
    expect(line).not.toContain('fingerprint');
  });
});
