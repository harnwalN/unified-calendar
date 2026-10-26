import { describe, expect, it } from 'vitest';
import type { ClassInfo, SyncedData, TaskMeta } from '../types';
import { emptySynced, mergeSynced, parseSyncFile, sameSynced, TOMBSTONE_TTL_MS } from './driveSync';

const NOW = 1_800_000_000_000;

const cls = (id: string, updatedAt: number, extra: Partial<ClassInfo> = {}): ClassInfo => ({
  id, name: id.toUpperCase(), color: '#000', aliases: [], order: 0, updatedAt, ...extra,
});
const meta = (uid: string, updatedAt: number, extra: Partial<TaskMeta> = {}): TaskMeta => ({
  uid, status: 'todo', priority: 'none', subtasks: [], updatedAt, ...extra,
});
const data = (patch: Partial<SyncedData>): SyncedData => ({ ...emptySynced(), ...patch });

describe('mergeSynced', () => {
  it('keeps records that exist on only one side', () => {
    const merged = mergeSynced(data({ classes: { a: cls('a', 1) } }), data({ classes: { b: cls('b', 2) } }), NOW);
    expect(Object.keys(merged.classes).sort()).toEqual(['a', 'b']);
  });

  it('takes the newer record per key (last write wins)', () => {
    const local = data({ meta: { x: meta('x', 10, { status: 'done' }), y: meta('y', 30, { notes: 'local' }) } });
    const remote = data({ meta: { x: meta('x', 20, { status: 'doing' }), y: meta('y', 25, { notes: 'remote' }) } });
    const merged = mergeSynced(local, remote, NOW);
    expect(merged.meta.x.status).toBe('doing');
    expect(merged.meta.y.notes).toBe('local');
    expect(merged.meta.y).toBe(local.meta.y);
  });

  it('lets a tombstone win a tie, otherwise keeps local on a tie', () => {
    const tomb = cls('a', NOW - 5, { deleted: true });
    expect(mergeSynced(data({ classes: { a: cls('a', NOW - 5) } }), data({ classes: { a: tomb } }), NOW).classes.a.deleted).toBe(true);
    expect(mergeSynced(data({ classes: { a: tomb } }), data({ classes: { a: cls('a', NOW - 5) } }), NOW).classes.a.deleted).toBe(true);
    const local = cls('a', NOW - 5, { name: 'Local' });
    expect(mergeSynced(data({ classes: { a: local } }), data({ classes: { a: cls('a', NOW - 5) } }), NOW).classes.a).toBe(local);
  });

  it('a newer edit resurrects an older tombstone', () => {
    const merged = mergeSynced(
      data({ classes: { a: cls('a', NOW - 5, { deleted: true }) } }),
      data({ classes: { a: cls('a', NOW - 4) } }),
      NOW,
    );
    expect(merged.classes.a.deleted).toBeFalsy();
  });

  it('prunes tombstones older than the TTL but keeps recent ones', () => {
    const old = NOW - TOMBSTONE_TTL_MS - 1;
    const merged = mergeSynced(
      data({ classes: { old: cls('old', old, { deleted: true }), fresh: cls('fresh', NOW - 1000, { deleted: true }), live: cls('live', old) } }),
      emptySynced(),
      NOW,
    );
    expect(Object.keys(merged.classes).sort()).toEqual(['fresh', 'live']);
  });
});

describe('sameSynced', () => {
  it('compares by keys, updatedAt and tombstone state', () => {
    const a = data({ classes: { a: cls('a', 1) } });
    expect(sameSynced(a, data({ classes: { a: cls('a', 1, { name: 'other' }) } }))).toBe(true);
    expect(sameSynced(a, data({ classes: { a: cls('a', 2) } }))).toBe(false);
    expect(sameSynced(a, data({ classes: { a: cls('a', 1, { deleted: true }) } }))).toBe(false);
    expect(sameSynced(a, emptySynced())).toBe(false);
  });
});

describe('parseSyncFile', () => {
  it('drops malformed records and unknown schemas', () => {
    const parsed = parseSyncFile({
      schema: 1,
      data: { classes: { a: cls('a', 1), b: { id: 'c', updatedAt: 1 }, d: { id: 'd' } }, meta: 'nope' },
    });
    expect(Object.keys(parsed.classes)).toEqual(['a']);
    expect(parsed.meta).toEqual({});
    expect(parseSyncFile({ schema: 2, data: {} })).toEqual(emptySynced());
    expect(parseSyncFile(null)).toEqual(emptySynced());
  });
});
