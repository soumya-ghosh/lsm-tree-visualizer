import { create } from 'zustand';
import type { LSMConfig, LSMEvent, LSMSnapshot } from '@/engine/types';
import { LSMTree } from '@/engine/lsm-tree';

interface GetResult {
  key: string;
  value: string | null;
  found: boolean;
  path: string[];
}

interface SearchAnimation {
  active: boolean;
  steps: string[];
  currentStepIndex: number;
  key: string;
  found: boolean;
  value: string | null;
  foundSSTId: string | null;
}

interface LSMStore {
  tree: LSMTree;
  snapshot: LSMSnapshot;
  events: LSMEvent[];
  lastGetResult: GetResult | null;
  highlightedPath: string[];
  started: boolean;
  selectedSST: string | null;
  searchAnimation: SearchAnimation | null;

  start: (withData: boolean, config?: Partial<LSMConfig>) => void;
  put: (key: string, value: string) => void;
  get: (key: string) => void;
  del: (key: string) => void;
  bulkInsert: (count: number) => void;
  manualFlush: () => void;
  updateConfig: (config: Partial<LSMConfig>) => void;
  reset: () => void;
  clearHighlight: () => void;
  setSelectedSST: (id: string | null) => void;
  advanceSearch: () => void;
}

function refreshSnapshot(tree: LSMTree): LSMSnapshot {
  return tree.getSnapshot();
}

const KEY_PREFIXES = ['user', 'order', 'product', 'session', 'config', 'log', 'cache', 'metric', 'tx', 'event'];

function randomKey(): string {
  const prefix = KEY_PREFIXES[Math.floor(Math.random() * KEY_PREFIXES.length)];
  const id = Math.floor(Math.random() * 1_000) + 1;
  return `${id}:${prefix}`;
}

function randomValue(): string {
  const vals = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
  return vals[Math.floor(Math.random() * vals.length)];
}

export const useLSMStore = create<LSMStore>((set, get) => ({
  tree: new LSMTree(),
  snapshot: new LSMTree().getSnapshot(),
  events: [],
  lastGetResult: null,
  highlightedPath: [],
  started: false,
  selectedSST: null,
  searchAnimation: null,

  start: (withData, config) => {
    const tree = new LSMTree(config);
    if (withData) {
      for (let i = 0; i < 30; i++) {
        tree.put(randomKey(), randomValue());
      }
    }
    set({
      tree,
      snapshot: refreshSnapshot(tree),
      events: [],
      lastGetResult: null,
      highlightedPath: [],
      started: true,
    });
  },

  put: (key, value) => {
    const { tree } = get();
    const newEvents = tree.put(key, value);
    set({
      snapshot: refreshSnapshot(tree),
      events: [...get().events, ...newEvents].slice(-50),
      lastGetResult: null,
      highlightedPath: [],
    });
  },

  get: (key) => {
    const { tree } = get();
    const result = tree.get(key);

    const lastInPath = result.path[result.path.length - 1];
    const foundSSTId =
      result.found && lastInPath && lastInPath !== 'memtable'
        ? lastInPath
        : null;

    const getResult: GetResult = {
      key,
      value: result.value,
      found: result.found,
      path: result.path,
    };

    if (result.path.length <= 1) {
      set({
        snapshot: refreshSnapshot(tree),
        events: [...get().events, ...result.events].slice(-50),
        lastGetResult: getResult,
        highlightedPath: result.path,
        searchAnimation: null,
        selectedSST: null,
      });
    } else {
      set({
        snapshot: refreshSnapshot(tree),
        events: [...get().events, ...result.events].slice(-50),
        lastGetResult: getResult,
        highlightedPath: [result.path[0]],
        searchAnimation: {
          active: true,
          steps: result.path,
          currentStepIndex: 0,
          key,
          found: result.found,
          value: result.value,
          foundSSTId,
        },
        selectedSST: null,
      });
    }
  },

  del: (key) => {
    const { tree } = get();
    const newEvents = tree.delete(key);
    set({
      snapshot: refreshSnapshot(tree),
      events: [...get().events, ...newEvents].slice(-50),
      lastGetResult: null,
      highlightedPath: [],
    });
  },

  bulkInsert: (count) => {
    const { tree } = get();
    const allEvents: LSMEvent[] = [];
    for (let i = 0; i < count; i++) {
      const key = randomKey();
      allEvents.push(...tree.put(key, randomValue()));
    }
    set({
      snapshot: refreshSnapshot(tree),
      events: [...get().events, ...allEvents].slice(-50),
      lastGetResult: null,
      highlightedPath: [],
    });
  },

  manualFlush: () => {
    const { tree } = get();
    const newEvents = tree.flush();
    set({
      snapshot: refreshSnapshot(tree),
      events: [...get().events, ...newEvents].slice(-50),
    });
  },

  updateConfig: (config) => {
    const { tree } = get();
    tree.updateConfig(config);
    set({ snapshot: refreshSnapshot(tree) });
  },

  reset: () => {
    const tree = new LSMTree();
    set({
      tree,
      snapshot: refreshSnapshot(tree),
      events: [],
      lastGetResult: null,
      highlightedPath: [],
      started: false,
    });
  },

  clearHighlight: () => {
    set({ highlightedPath: [], lastGetResult: null, searchAnimation: null, selectedSST: null });
  },

  setSelectedSST: (id) => {
    set({ selectedSST: id });
  },

  advanceSearch: () => {
    const { searchAnimation } = get();
    if (!searchAnimation || !searchAnimation.active) return;

    const nextStep = searchAnimation.currentStepIndex + 1;
    if (nextStep >= searchAnimation.steps.length) {
      set({
        searchAnimation: null,
        highlightedPath: searchAnimation.steps,
        selectedSST: searchAnimation.foundSSTId,
      });
      return;
    }

    set({
      searchAnimation: { ...searchAnimation, currentStepIndex: nextStep },
      highlightedPath: searchAnimation.steps.slice(0, nextStep + 1),
    });
  },
}));
