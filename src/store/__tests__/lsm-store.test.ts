import { describe, it, expect, beforeEach } from 'vitest';
import { useLSMStore } from '../lsm-store';
import { resetSSTCounter } from '@/engine/sstable';

function getState() {
  return useLSMStore.getState();
}

describe('LSM Store (Zustand)', () => {
  beforeEach(() => {
    resetSSTCounter();
    getState().reset();
  });

  it('initial state: started is false', () => {
    expect(getState().started).toBe(false);
  });

  it('start(false) sets started:true with empty tree', () => {
    getState().start(false);
    const s = getState();
    expect(s.started).toBe(true);
    expect(s.snapshot.memtable).toHaveLength(0);
    expect(s.snapshot.levels.every((l) => l.length === 0)).toBe(true);
  });

  it('start(true) pre-populates data', () => {
    getState().start(true);
    expect(getState().snapshot.stats.totalPuts).toBe(30);
  });

  it('start with custom config applies it', () => {
    getState().start(false, { memtableMaxSize: 16 });
    expect(getState().snapshot.config.memtableMaxSize).toBe(16);
  });

  it('put updates snapshot', () => {
    getState().start(false);
    getState().put('k', 'v');
    expect(getState().snapshot.memtable.find((e) => e.key === 'k')).toBeDefined();
  });

  it('put appends events (capped at 50)', () => {
    getState().start(false, { memtableMaxSize: 100 });
    for (let i = 0; i < 60; i++) getState().put(`k${i}`, `v${i}`);
    expect(getState().events.length).toBeLessThanOrEqual(50);
  });

  it('get sets lastGetResult and highlightedPath', () => {
    getState().start(false);
    getState().put('k', 'v');
    getState().get('k');
    const s = getState();
    expect(s.lastGetResult).not.toBeNull();
    expect(s.lastGetResult!.found).toBe(true);
    expect(s.highlightedPath).toContain('memtable');
  });

  it('get for missing key sets found:false', () => {
    getState().start(false);
    getState().get('nope');
    expect(getState().lastGetResult!.found).toBe(false);
  });

  it('del clears lastGetResult', () => {
    getState().start(false);
    getState().put('k', 'v');
    getState().get('k');
    getState().del('k');
    expect(getState().lastGetResult).toBeNull();
  });

  it('bulkInsert(n) adds n entries', () => {
    getState().start(false, { memtableMaxSize: 100 });
    getState().bulkInsert(10);
    expect(getState().snapshot.stats.totalPuts).toBe(10);
  });

  it('manualFlush flushes memtable', () => {
    getState().start(false);
    getState().put('a', '1');
    getState().put('b', '2');
    getState().put('c', '3');
    getState().manualFlush();
    expect(getState().snapshot.memtable).toHaveLength(0);
  });

  it('updateConfig updates snapshot config', () => {
    getState().start(false);
    getState().updateConfig({ levelMultiplier: 8 });
    expect(getState().snapshot.config.levelMultiplier).toBe(8);
  });

  it('reset returns to initial state', () => {
    getState().start(true);
    getState().put('extra', 'val');
    getState().reset();
    const s = getState();
    expect(s.started).toBe(false);
    expect(s.snapshot.stats.totalPuts).toBe(0);
  });

  it('clearHighlight clears path and result', () => {
    getState().start(false);
    getState().put('k', 'v');
    getState().get('k');
    getState().clearHighlight();
    const s = getState();
    expect(s.highlightedPath).toHaveLength(0);
    expect(s.lastGetResult).toBeNull();
  });
});
