# LSM Tree Visualizer -- Test Plan

> **Location:** Repository root (`TEST_PLAN.md`).
> Use this as a task list in a separate chat to implement all tests.

---

## Setup

**Runner:** Vitest (fast, Vite-native, TS-first)
**Install:** `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
**Config:** Add `vitest.config.ts` extending `vite.config.ts` with `environment: 'jsdom'` for React tests.

**File convention:** Co-located test files: `src/engine/__tests__/memtable.test.ts`, etc.
Engine tests need no DOM -- use default `node` environment.
Store/hook tests need `jsdom` environment.

**Important:** Call `resetSSTCounter()` in a `beforeEach` for any test that creates SSTables, since the counter is module-level global state.

---

## 1. Unit Tests -- Engine Layer

### 1.1 `memtable.test.ts` (MemTable)

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 1 | `put` and `get` a single key | `get("k1")` returns `{ key: "k1", value: "v1", timestamp, deleted: false }` |
| 2 | `put` overwrites existing key | After two puts with same key, `get` returns second value; `size` stays 1 |
| 3 | `get` returns `undefined` for missing key | `get("nonexistent")` is `undefined` |
| 4 | `put` with `deleted=true` stores tombstone | `get("k1")?.deleted` is `true`, `value` is empty |
| 5 | `size` reflects unique keys | Put 3 distinct keys -> `size === 3`; overwrite one -> `size === 3` |
| 6 | `getSorted` returns alphabetical order | Put keys `["c", "a", "b"]` -> `getSorted()` keys are `["a", "b", "c"]` |
| 7 | `clear` empties the table | After `clear()`, `size === 0` and `get` returns `undefined` |
| 8 | `entries` returns all values | Put 3 keys -> `entries().length === 3` |

### 1.2 `sstable.test.ts` (SSTable utilities)

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 1 | `createSSTable` sorts entries by key | Entries with keys `["c","a","b"]` -> `sst.entries` keys are `["a","b","c"]` |
| 2 | `createSSTable` sets correct `minKey`/`maxKey` | `sst.minKey === "a"`, `sst.maxKey === "c"` |
| 3 | `createSSTable` sets `size` to entry count | 3 entries -> `sst.size === 3` |
| 4 | `createSSTable` assigns incrementing IDs with level suffix | Two calls at level 0 -> ids contain `L0`, second id counter > first |
| 5 | `resetSSTCounter` resets IDs | After reset, next SST id starts from `sst-1-L*` |
| 6 | `mergeEntries` keeps newest value per key | Two SSTables with same key, different timestamps -> merged has newer value |
| 7 | `mergeEntries` drops tombstones | SSTable with `deleted: true` entry -> key absent from merged output |
| 8 | `mergeEntries` returns sorted output | Merged result keys are in alphabetical order |
| 9 | `mergeEntries` with non-overlapping tables | Two disjoint SSTables -> merged has all entries from both |
| 10 | `hasOverlap` returns `true` for overlapping ranges | SST `[a..d]` and `[c..f]` -> `true` |
| 11 | `hasOverlap` returns `false` for disjoint ranges | SST `[a..b]` and `[d..f]` -> `false` |
| 12 | `hasOverlap` returns `true` for exact boundary touch | SST `[a..c]` and `[c..f]` -> `true` |

### 1.3 `wal.test.ts` (WAL)

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 1 | `append` adds entry with correct fields | Returned entry has `operation`, `key`, `value`, `timestamp` |
| 2 | `getEntries` returns all entries in order | Append 3 entries -> `getEntries().length === 3`, order preserved |
| 3 | `getRecent(n)` returns last n entries | Append 5 -> `getRecent(2).length === 2`, returns last two |
| 4 | `clear` empties the log | After `clear()`, `size === 0` |
| 5 | `size` tracks count | Append 3 -> `size === 3` |

### 1.4 `compaction.test.ts` (Compaction strategies)

**Use `resetSSTCounter()` in `beforeEach`.**

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 1 | `leveledCompaction` returns `null` when L0 is below trigger | 2 SSTables in L0, trigger=4 -> `null` |
| 2 | `leveledCompaction` triggers L0->L1 when L0 reaches trigger | 4 SSTables in L0 -> result has `fromLevel: 0, toLevel: 1` |
| 3 | L0->L1 compaction merges overlapping L1 SSTables | L0 has `[a..d]`, L1 has `[c..f]` and `[g..h]` -> only `[c..f]` is in `removedSSTs` (plus all L0) |
| 4 | L0->L1 compaction chunks output into SSTables of size 4 | 12 merged entries -> 3 new SSTables |
| 5 | `leveledCompaction` triggers Ln->Ln+1 when level exceeds `multiplier^n` | L1 with 5 SSTables, multiplier=4 -> compaction fires |
| 6 | `leveledCompaction` picks oldest SSTable from Ln for Ln->Ln+1 | First SSTable in L1 is the one included in `removedSSTs` |
| 7 | `sizeTieredCompaction` returns `null` below trigger | 2 SSTables in L0, trigger=4 -> `null` |
| 8 | `sizeTieredCompaction` merges entire level into one SSTable at next level | 4 SSTables in L0 -> 1 new SSTable at L1 |
| 9 | `runCompaction` dispatches to leveled strategy | Config `compactionStrategy: 'leveled'` -> calls leveledCompaction logic |
| 10 | `runCompaction` dispatches to size-tiered strategy | Config `compactionStrategy: 'size-tiered'` -> calls sizeTieredCompaction logic |
| 11 | Compaction drops tombstoned keys | SSTable with `deleted: true` entry -> key not in output SSTables |
| 12 | Compaction with empty levels returns `null` | All levels empty -> `null` |

### 1.5 `lsm-tree.test.ts` (LSMTree orchestrator)

**Use `resetSSTCounter()` in `beforeEach`.**

#### Put / Write path

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 1 | `put` adds key to memtable | After `put("k","v")`, `snapshot.memtable` contains the entry |
| 2 | `put` appends to WAL | After `put`, `snapshot.wal` has a `put` entry |
| 3 | `put` returns event with type `'put'` | `events[0].type === 'put'` and `details.key/value` match |
| 4 | `put` increments `stats.totalPuts` | After 3 puts, `snapshot.stats.totalPuts === 3` |
| 5 | Auto-flush when memtable reaches max size | Config `memtableMaxSize: 4`, put 4 keys -> memtable is empty, L0 has 1 SSTable |
| 6 | Auto-flush emits `'flush'` event | Events array contains event with `type: 'flush'` |
| 7 | Multiple flushes accumulate L0 SSTables | 8 puts with maxSize=4 -> 2 SSTables in L0 |

#### Get / Read path

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 8 | `get` finds key in memtable | Put then get -> `{ found: true, value: "v" }`, `path === ['memtable']` |
| 9 | `get` finds key in L0 SSTable after flush | Put, flush, get -> `found: true`, path includes SST id |
| 10 | `get` returns `found: false` for missing key | `get("nope")` -> `{ found: false, value: null }` |
| 11 | `get` returns latest value (memtable over SST) | Put "k"="v1", flush, put "k"="v2", get "k" -> value is "v2", path is `['memtable']` |
| 12 | `get` searches L0 newest-first | Two L0 SSTables with same key, different values -> returns newer |
| 13 | `get` increments `stats.totalGets` | After 2 gets, `stats.totalGets === 2` |
| 14 | `get` returns events including `'get'` and `'get-result'` | events array has both types |

#### Delete

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 15 | `delete` makes subsequent `get` return `found: false` | Put then delete then get -> `found: false` |
| 16 | `delete` stores tombstone in memtable | After delete, memtable entry has `deleted: true` |
| 17 | Tombstone survives flush and masks old value | Put "k"="v", flush, delete "k", flush, get "k" -> `found: false` |
| 18 | `delete` increments `stats.totalDeletes` | After 2 deletes, `stats.totalDeletes === 2` |

#### Flush

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 19 | `flush()` on empty memtable returns `[]` | No events returned |
| 20 | `flush()` clears memtable | After flush, `snapshot.memtable.length === 0` |
| 21 | `flush()` creates L0 SSTable with sorted entries | SSTable entries are sorted by key |
| 22 | `flush()` increments `stats.totalFlushes` | |

#### Compaction (integration via LSMTree)

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 23 | Auto-compaction fires when L0 reaches trigger | Config `memtableMaxSize: 2, l0CompactionTrigger: 2` -> after 4 puts, L0 is emptied, L1 has SSTables |
| 24 | Compaction event is emitted | Events contain `type: 'compaction'` with `fromLevel` and `toLevel` |
| 25 | `stats.totalCompactions` increments | After compaction triggers, counter > 0 |
| 26 | Cascading compaction works | Enough data to trigger L0->L1 and then L1->L2 |

#### Config and Reset

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 27 | `updateConfig` changes behavior | Change `memtableMaxSize` to 16 -> 10 puts don't trigger flush |
| 28 | `updateConfig` expands levels array if `maxLevels` increases | Increase maxLevels from 5 to 7 -> `snapshot.levels.length >= 7` |
| 29 | `reset()` clears all state | After reset, memtable empty, all levels empty, stats zeroed |
| 30 | `reset()` with custom config applies it | `reset({ memtableMaxSize: 16 })` -> new config applies |

#### Snapshot

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 31 | `getSnapshot()` returns immutable copy | Mutating returned snapshot doesn't affect tree internals |
| 32 | Snapshot `config` matches current config | After `updateConfig`, snapshot reflects new values |

#### Amplification Metrics

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 33 | Write amplification increases after flush | After flushes, `stats.writeAmplification > 0` |
| 34 | Read amplification accounts for levels | With SSTables in L0 and L1, `stats.readAmplification > 1` |

---

## 2. Unit Tests -- Store Layer

### 2.1 `lsm-store.test.ts` (Zustand store)

These tests exercise the store actions and state transitions.
Use `useLSMStore.getState()` and `useLSMStore.setState()` directly (no React rendering needed for Zustand).

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 1 | Initial state: `started` is `false` | `getState().started === false` |
| 2 | `start(false)` sets `started: true` with empty tree | `started === true`, `snapshot.memtable.length === 0`, all levels empty |
| 3 | `start(true)` pre-populates data | `started === true`, `snapshot.stats.totalPuts === 30` |
| 4 | `start` with custom config applies it | `start(false, { memtableMaxSize: 16 })` -> `snapshot.config.memtableMaxSize === 16` |
| 5 | `put` updates snapshot | `put("k","v")` -> `snapshot.memtable` contains key |
| 6 | `put` appends events (capped at 50) | 60 puts -> `events.length <= 50` |
| 7 | `get` sets `lastGetResult` and `highlightedPath` | `put("k","v")` then `get("k")` -> `lastGetResult.found === true`, `highlightedPath` includes `'memtable'` |
| 8 | `get` for missing key sets `found: false` | `get("nope")` -> `lastGetResult.found === false` |
| 9 | `del` clears `lastGetResult` | After a get then del, `lastGetResult === null` |
| 10 | `bulkInsert(n)` adds n entries | `bulkInsert(10)` -> `snapshot.stats.totalPuts === 10` |
| 11 | `manualFlush` flushes memtable | Put 3 keys, `manualFlush()` -> `snapshot.memtable.length === 0` |
| 12 | `updateConfig` updates snapshot config | `updateConfig({ levelMultiplier: 8 })` -> `snapshot.config.levelMultiplier === 8` |
| 13 | `reset` returns to initial state | After operations + `reset()` -> `started === false`, stats zeroed |
| 14 | `clearHighlight` clears path and result | After get + `clearHighlight()` -> `highlightedPath.length === 0`, `lastGetResult === null` |

---

## 3. Unit Tests -- Layout Hook

### 3.1 `use-flow-layout.test.ts`

Test the pure layout logic. Since `useFlowLayout` is a hook using `useMemo`, either:
- Extract the inner function for direct testing, or
- Use `renderHook` from `@testing-library/react`.

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 1 | Empty snapshot produces WAL + MemTable + L0 group nodes | `nodes.length === 3` (wal, memtable, level-0) |
| 2 | WAL node has correct type and position | `type === 'walNode'`, `position.x === 0` |
| 3 | MemTable node has correct type and position | `type === 'memtableNode'`, `position.x === 300` |
| 4 | MemTable `highlighted` flag reflects `highlightedPath` | Pass `['memtable']` -> `data.highlighted === true` |
| 5 | SSTable nodes are children of their level group | SST node has `parentId === 'level-0'` |
| 6 | SST nodes get `highlighted` from path | Pass SST id in `highlightedPath` -> `data.highlighted === true` |
| 7 | Empty levels (except L0) are skipped | Snapshot with empty L1 -> no `level-1` node |
| 8 | Non-empty L1 creates level group and SST nodes | Snapshot with 2 L1 SSTables -> `level-1` node + 2 SST children |
| 9 | Edges: always has `wal-to-mem` | Present in all cases |
| 10 | Edges: `mem-to-l0` exists when L0 is present | L0 group exists -> edge exists with label `'flush'` |
| 11 | Edges: `l0-to-l1` exists when both levels present | Both L0 and L1 groups -> edge with label `'compact'` |
| 12 | Level group width scales with SST count | 5 SSTables -> width > 300 (the minimum) |
| 13 | SST nodes are horizontally spaced within level | Second SST x > first SST x by `SST_WIDTH + SST_GAP` |

---

## 4. Integration Tests -- End-to-End Scenarios

These test multi-step workflows through the `LSMTree` class directly (no UI).

| # | Test Case | What to Assert |
|---|-----------|----------------|
| 1 | **Full write-flush-compact cycle**: 20 puts with `memtableMaxSize=4, l0CompactionTrigger=4` | After 20 puts: memtable has 0-3 entries, L0 has <4 SSTables (compacted), L1+ has SSTables, no data loss (all non-deleted keys retrievable) |
| 2 | **Overwrite consistency**: Put "k"="v1", flush, put "k"="v2", flush, compact, get "k" | Returns "v2" (newer survives compaction) |
| 3 | **Delete consistency across compaction**: Put "k"="v", flush, delete "k", flush, compact, get "k" | Returns `found: false` (tombstone removes key during compaction merge) |
| 4 | **Size-tiered strategy**: Switch to `'size-tiered'`, do 20 puts | Compaction produces single SSTables at next level (not chunked) |
| 5 | **Config hot-swap**: Start leveled, do some puts, switch to size-tiered, do more puts | Both strategies produce valid state, all keys retrievable |
| 6 | **Bulk insert stress**: 100 puts with `memtableMaxSize=4, l0CompactionTrigger=2` | No crashes, all unique keys retrievable, compactions cascade to deeper levels |
| 7 | **Read path correctness**: Put same key at multiple levels, verify read finds most recent | Key in memtable shadows key in L0 which shadows key in L1 |
| 8 | **WAL records all writes**: 50 puts -> `snapshot.wal` has last 20 entries (getRecent(20)) | WAL length capped at 20, entries are the most recent |

---

## 5. LSM Tree Correctness Tests

> **File:** `src/engine/__tests__/lsm-correctness.test.ts`
>
> These tests verify the **semantic invariants** that any correct LSM tree implementation
> must uphold -- independent of config, operation order, or data volume. They are
> property-based in spirit: assert invariants after arbitrary operation sequences rather
> than checking specific function return values.

### 5.1 Read-After-Write Linearizability

Every key that was written and not deleted must be readable with its latest value.

| # | Test Case | Invariant |
|---|-----------|-----------|
| 1 | **Immediate read-after-write** | `put("k","v")` then `get("k")` -> always returns `"v"`, regardless of whether a flush happened between them |
| 2 | **Read-after-write survives flush** | `put("k","v")`, `flush()`, `get("k")` -> `"v"` (data in SSTable is still readable) |
| 3 | **Read-after-write survives compaction** | `put("k","v")`, flush enough to trigger compaction, `get("k")` -> `"v"` |
| 4 | **Read-after-write for every key in a bulk sequence** | Put 50 unique keys with known values, trigger multiple flushes + compactions, then get every key -> all return correct value |

### 5.2 Last-Writer-Wins (Recency)

When the same key is written multiple times, only the latest value is visible.

| # | Test Case | Invariant |
|---|-----------|-----------|
| 5 | **Memtable shadowing** | `put("k","v1")`, `put("k","v2")` -> `get("k")` returns `"v2"` |
| 6 | **Memtable shadows SSTable** | `put("k","v1")`, flush, `put("k","v2")` (in memtable) -> `get("k")` returns `"v2"` from memtable, not `"v1"` from L0 |
| 7 | **Newer L0 SST shadows older L0 SST** | `put("k","v1")`, flush, `put("k","v2")`, flush -> two L0 SSTables, `get("k")` returns `"v2"` (newest L0 searched first) |
| 8 | **Recency survives leveled compaction** | Write "k" three times with flushes between each, trigger L0->L1 compaction -> `get("k")` returns third value |
| 9 | **Recency survives size-tiered compaction** | Same as above with `compactionStrategy: 'size-tiered'` |
| 10 | **Recency across levels** | Put "k"="v1" in L1 (via flush+compact), then put "k"="v2" in L0 (via flush) -> `get("k")` returns `"v2"` from L0 |

### 5.3 Tombstone / Delete Correctness

Deletes must make keys invisible, even if older live values exist in deeper levels.

| # | Test Case | Invariant |
|---|-----------|-----------|
| 11 | **Delete in memtable masks value in same memtable** | `put("k","v")`, `delete("k")` -> `get("k")` returns `found: false` |
| 12 | **Tombstone in memtable masks value in SSTable** | `put("k","v")`, flush (value now in L0), `delete("k")` (tombstone in memtable) -> `get("k")` returns `found: false` |
| 13 | **Tombstone in L0 SSTable masks value in L1** | Put "k", flush, compact to L1, delete "k", flush (tombstone now in L0) -> `get("k")` returns `found: false` |
| 14 | **Compaction merge eliminates tombstoned keys** | After tombstone and live value are compacted together, the key is absent from the output SSTables' entries |
| 15 | **Re-insert after delete is visible** | `put("k","v1")`, `delete("k")`, `put("k","v2")` -> `get("k")` returns `"v2"` |
| 16 | **Re-insert after delete survives compaction** | Same as #15 but with flushes and compaction between steps -> still returns `"v2"` |

### 5.4 No Data Loss During Compaction

Compaction must never silently drop non-deleted keys.

| # | Test Case | Invariant |
|---|-----------|-----------|
| 17 | **All keys survive L0->L1 leveled compaction** | Insert N unique keys, flush to fill L0, trigger compaction -> every key is retrievable via `get` |
| 18 | **All keys survive L1->L2 leveled compaction** | Push enough data to trigger L1->L2 -> every key is still retrievable |
| 19 | **All keys survive size-tiered compaction** | Same test under `'size-tiered'` strategy |
| 20 | **Repeated compaction cycles don't lose data** | 200 unique puts with aggressive config (`memtableMaxSize=2, l0CompactionTrigger=2`) -> all keys retrievable after all compactions settle |

### 5.5 SSTable Structural Invariants

Every SSTable produced by flush or compaction must satisfy internal consistency.

| # | Test Case | Invariant |
|---|-----------|-----------|
| 21 | **Entries are sorted by key** | For every SSTable in every level: `entries[i].key <= entries[i+1].key` |
| 22 | **`minKey` equals first entry's key** | `sst.minKey === sst.entries[0].key` |
| 23 | **`maxKey` equals last entry's key** | `sst.maxKey === sst.entries[sst.entries.length - 1].key` |
| 24 | **`size` equals `entries.length`** | For every SSTable in snapshot |
| 25 | **No duplicate keys within a single SSTable** | After compaction merge, no SSTable has two entries with the same key |
| 26 | **SSTable level matches its position** | For each level index `i`, every SSTable in `levels[i]` has `sst.level === i` |

### 5.6 Level Structure Invariants

| # | Test Case | Invariant |
|---|-----------|-----------|
| 27 | **L0 SSTables may have overlapping key ranges** | (Not an assertion to fail -- just confirm the engine allows it.) After multiple flushes without compaction, L0 SSTables can overlap. |
| 28 | **L1+ SSTables have non-overlapping key ranges after leveled compaction** | After leveled compaction produces L1 SSTables, no two L1 SSTables have `hasOverlap` returning true |
| 29 | **Level count never exceeds `maxLevels`** | After any sequence of operations, `snapshot.levels.length <= config.maxLevels` (or auto-extended levels are valid) |
| 30 | **Compaction only moves data downward** | `CompactionResult.toLevel > CompactionResult.fromLevel` always |

### 5.7 Read Path Correctness

The read path must search in the correct order: MemTable -> L0 (newest first) -> L1 -> L2 -> ...

| # | Test Case | Invariant |
|---|-----------|-----------|
| 31 | **`get` path always starts with `'memtable'`** | `result.path[0] === 'memtable'` for every get |
| 32 | **`get` path only includes SSTables whose key range contains the query key** | For each SST id in `path`, that SST's `[minKey, maxKey]` range contains the queried key |
| 33 | **`get` stops at first match** | If key is in memtable, path is `['memtable']` only (doesn't scan SSTables) |
| 34 | **`get` scans all levels on miss** | For a missing key, path includes `'memtable'` plus every SST whose key range overlaps the query |

### 5.8 Amplification Metrics Sanity

| # | Test Case | Invariant |
|---|-----------|-----------|
| 35 | **Write amplification >= 0** | Always non-negative after any operation sequence |
| 36 | **Write amplification > 0 after at least one flush** | Data was written to storage, so `writeAmplification > 0` |
| 37 | **Read amplification >= 1** | At minimum, memtable is always searched (counts as 1) |
| 38 | **Space amplification >= 1 when data exists in last level** | Total entries / last-level entries >= 1 |

### 5.9 Randomized / Fuzzy Correctness (property-based style)

| # | Test Case | Invariant |
|---|-----------|-----------|
| 39 | **Random put/get/delete sequence (leveled)** | Generate 200 random operations (70% put, 20% get, 10% delete) with `memtableMaxSize=4, l0CompactionTrigger=3`. Maintain a reference `Map<string, string\|null>` in the test. After all operations, for every key in the reference map: if value is non-null, `get` returns it; if null (deleted), `get` returns `found: false`. |
| 40 | **Random put/get/delete sequence (size-tiered)** | Same as #39 with `compactionStrategy: 'size-tiered'` |
| 41 | **Random config changes mid-stream** | 100 operations with random `updateConfig` calls between them. After all operations, every key in reference map is retrievable with correct value. No crashes. |

---

## 6. Test File Structure

```
src/
  engine/
    __tests__/
      memtable.test.ts          # 8 tests
      sstable.test.ts            # 12 tests
      wal.test.ts                # 5 tests
      compaction.test.ts         # 12 tests
      lsm-tree.test.ts           # 34 tests
      lsm-correctness.test.ts    # 41 tests  <-- LSM semantic invariants
      integration.test.ts        # 8 tests
  store/
    __tests__/
      lsm-store.test.ts         # 14 tests
  hooks/
    __tests__/
      use-flow-layout.test.ts    # 13 tests
```

**Total: ~147 test cases** (106 functional + 41 correctness)

---

## 6. Implementation Notes

1. **Vitest config:** Create `vitest.config.ts` at root:
   ```typescript
   import { defineConfig } from 'vitest/config';
   import path from 'path';

   export default defineConfig({
     resolve: {
       alias: { '@': path.resolve(__dirname, './src') },
     },
     test: {
       environment: 'jsdom',
       globals: true,
       include: ['src/**/*.test.ts'],
     },
   });
   ```

2. **Package.json script:** Add `"test": "vitest"` and `"test:run": "vitest run"`.

3. **`resetSSTCounter()`** must be called in `beforeEach` for tests in `sstable.test.ts`, `compaction.test.ts`, `lsm-tree.test.ts`, and `integration.test.ts` -- the SST counter is module-level state that leaks between tests.

4. **Zustand testing:** Use `useLSMStore.getState()` and `useLSMStore.setState()` directly. No need for React rendering. Reset the store in `beforeEach` via `useLSMStore.getState().reset()`.

5. **Hook testing:** `useFlowLayout` uses `useMemo` so needs `renderHook` from `@testing-library/react`. Alternatively, extract the inner computation into a pure function and test that directly for simpler setup.

6. **Snapshot helpers for tests:** Create SSTables with deterministic timestamps by manually constructing `SSTableMeta` objects or by using a fixed `Date.now()` mock.

7. **No UI/component tests needed** at this stage -- the custom React Flow nodes are thin render-only components. The logic lives in the engine and store, which are covered above.
