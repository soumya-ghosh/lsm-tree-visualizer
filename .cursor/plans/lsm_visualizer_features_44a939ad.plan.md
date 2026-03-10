---
name: LSM Visualizer Features
overview: Nine independently implementable features spanning engine logic, visualization, and UX. Each feature is self-contained and can be built and shipped without depending on the others.
todos:
  - id: feat-1-bloom
    content: "Feature 1: Bloom Filter Simulation — engine (types, sstable, lsm-tree), store, layout hook, SSTNode, StatsPanel"
    status: pending
  - id: feat-2-anim
    content: "Feature 2: Flush & Compaction Animations — store (flushAnimation, compactionAnimation), Visualizer intervals, SSTNode + MemTableNode animation states"
    status: pending
  - id: feat-3-heatmap
    content: "Feature 3: Key Range Heatmap — use-flow-layout densityRatio, SSTNode opacity/fill, entry count tooltip"
    status: pending
  - id: feat-4-stcs
    content: "Feature 4: Proper Size-Tiered Compaction — compaction.ts groupBySizeClass, merge-within-group logic"
    status: pending
  - id: feat-5-score
    content: "Feature 5: Compaction Score — LSMSnapshot.compactionScores, lsm-tree getSnapshot, LevelGroupNode badge, StatsPanel section"
    status: pending
  - id: feat-6-manual
    content: "Feature 6: Manual Compaction Picker — lsm-tree.compactSSTable, compactLevelToNext pickedSST param, store action, SSTDetailDialog button"
    status: pending
  - id: feat-7-scan
    content: "Feature 7: Range Scan — lsm-tree.scan, store scanResult + scan action, OperationsPanel scan UI"
    status: pending
  - id: feat-8-eventlog
    content: "Feature 8: Event Log Panel — new EventLogPanel component, add to Visualizer, verify LSMEvent.details fields"
    status: pending
  - id: feat-9-chunk-scaling
    content: "Feature 9: Level-Scaled SSTable Size — baseChunkSize config param, chunkSize = baseChunkSize * 2^(targetLevel-1) in compaction.ts, ConfigPanel slider"
    status: pending
isProject: false
---

# LSM Visualizer Feature Plan

Each feature below is fully independent. Files affected are listed per feature.

---

## Feature 1: Bloom Filter Simulation

**Goal:** Show per-SSTable Bloom filter probes during `get` — green skip (filter said "no") vs amber check (filter said "maybe, read the file").

**Engine changes — `[src/engine/types.ts](src/engine/types.ts)`**

- Add `bloomFilter: Set<string>` to `SSTableMeta`
- Add `bloomSkipped: string[]` and `bloomChecked: string[]` to the return type of `LSMTree.get`

**Engine changes — `[src/engine/sstable.ts](src/engine/sstable.ts)`**

- In `createSSTable`, populate `bloomFilter` as a `Set` of all entry keys (exact match = no false positives for the visualizer; can optionally add configurable FP rate by randomly omitting N% of keys)

**Engine changes — `[src/engine/lsm-tree.ts](src/engine/lsm-tree.ts)`**

- In `get()`, before scanning an SSTable's entries, check `sst.bloomFilter.has(key)`. If false, push to `bloomSkipped`; if true, push to `bloomChecked`
- Return `bloomSkipped` and `bloomChecked` alongside `path`

**Store changes — `[src/store/lsm-store.ts](src/store/lsm-store.ts)`**

- Extend `SearchAnimation` with `bloomSkipped: string[]` and `bloomChecked: string[]`
- Pass these into the animation state; during `advanceSearch`, use them to classify each step

**Layout changes — `[src/hooks/use-flow-layout.ts](src/hooks/use-flow-layout.ts)`**

- Pass `bloomSkipped` and `bloomChecked` arrays into each `SSTNodeData`
- New fields: `bloomState: 'skipped' | 'checked' | 'found' | null`

**UI changes — `[src/components/flow/SSTNode.tsx](src/components/flow/SSTNode.tsx)`**

- Render a small filter badge: green "BLOOM SKIP" or amber "BLOOM HIT" based on `bloomState`
- Animate badge in with a short fade

**Stats — `[src/components/panels/StatsPanel.tsx](src/components/panels/StatsPanel.tsx)`**

- Track `bloomSkipCount` and `bloomCheckCount` in `LSMStats` (engine side) and show "Bloom skips" and "Bloom hits" counters

---

## Feature 2: Flush & Compaction Animations

**Goal:** Step-by-step animation for flush (MemTable → L0) and compaction (Ln → Ln+1), similar to the existing Get search animation.

**Store changes — `[src/store/lsm-store.ts](src/store/lsm-store.ts)`**

- Add `flushAnimation: { active: boolean; sourceIds: string[]; targetId: string } | null`
- Add `compactionAnimation: { active: boolean; removedIds: string[]; newIds: string[]; fromLevel: number; toLevel: number } | null`
- After `manualFlush()` or auto-flush inside `put()`, extract the new SST id from `LSMEvent[]` (event type `flush`) and set `flushAnimation`
- After compaction events, set `compactionAnimation` from `CompactionResult` data in the events
- Add `clearFlushAnimation()` and `clearCompactionAnimation()` actions

**Visualizer changes — `[src/components/Visualizer.tsx](src/components/Visualizer.tsx)`**

- Add a second `setInterval` (or reuse existing) that drives flush/compaction animation frames at ~700ms
- Phase 1 of flush: highlight MemTable + glow
- Phase 2: highlight new L0 SST
- Phase 1 of compaction: highlight source SSTables (red/orange ring)
- Phase 2: highlight new output SSTables (green ring), briefly show removed SSTables as fading out before the snapshot updates

**UI changes — `[src/components/flow/SSTNode.tsx](src/components/flow/SSTNode.tsx)`**

- Accept `animationState: 'compacting' | 'created' | null` in `SSTNodeData`
- `compacting`: pulsing amber ring; `created`: spring scale-in from 0

**UI changes — `[src/components/flow/MemTableNode.tsx](src/components/flow/MemTableNode.tsx)`**

- Accept `flushing: boolean` in data; when true, show a pulsing blue glow

---

## Feature 3: Key Range Heatmap on SSTables

**Goal:** Color each SSTable's background by entry density relative to the max across all SSTables on the canvas. Denser = more saturated color.

**Layout changes — `[src/hooks/use-flow-layout.ts](src/hooks/use-flow-layout.ts)`**

- Compute `maxEntries = Math.max(...allSSTables.map(s => s.entries.length))` before building nodes
- Pass `densityRatio: number` (0–1) into each `SSTNodeData`

**UI changes — `[src/components/flow/SSTNode.tsx](src/components/flow/SSTNode.tsx)`**

- Use `densityRatio` to set `opacity` on the level-colored background fill (e.g., `opacity: 0.1 + densityRatio * 0.5`)
- Add a tooltip showing the entry count

No engine changes required.

---

## Feature 4: Proper Size-Tiered Compaction (STCS)

**Goal:** Replace the current "merge everything in a level" STCS with proper grouping: SSTables are grouped by similar size (within a 2× factor); a group only compacts when it has ≥ `l0CompactionTrigger` members.

**Engine changes — `[src/engine/compaction.ts](src/engine/compaction.ts)`**

Current `sizeTieredCompaction` (roughly):

```typescript
// merges entire level into one SSTable at next level
const merged = mergeEntries(level);
return { removedSSTs: level.map(s => s.id), newSSTs: [createSSTable(lvlIdx + 1, merged)], ... }
```

New logic:

```typescript
function groupBySizeClass(ssts: SSTableMeta[]): SSTableMeta[][] {
  // sort by size, then group consecutive SSTables within 2x factor
}
// Pick the first group with >= l0CompactionTrigger members
// Merge that group into one SSTable at the same level (STCS stays within level until size crosses threshold)
```

The output SSTable stays at the same level until it exceeds the level's size budget, then moves to the next. This is a behavioral change visible in the visualizer.

---

## Feature 5: Compaction Score / Priority

**Goal:** Show each level's compaction "urgency score" (RocksDB style) as a badge on the level group node, and in the stats panel.

**Engine changes — `[src/engine/types.ts](src/engine/types.ts)`**

- Add `compactionScores: Record<number, number>` to `LSMSnapshot`

**Engine changes — `[src/engine/lsm-tree.ts](src/engine/lsm-tree.ts)`**

- In `getSnapshot()`, compute score for each level:
  - L0: `l0Count / l0CompactionTrigger`
  - Ln: `sstCount / (levelMultiplier ^ n)`
- Include scores in snapshot

**UI changes — `[src/components/flow/LevelGroupNode.tsx](src/components/flow/LevelGroupNode.tsx)`**

- Accept `compactionScore: number` in node data
- Render a small pill: green (< 0.5), amber (0.5–0.9), red (≥ 1.0)
- Red = compaction is overdue/triggered

**Layout changes — `[src/hooks/use-flow-layout.ts](src/hooks/use-flow-layout.ts)`**

- Pass `compactionScore` from `snapshot.compactionScores[level]` into `LevelGroupNode` data

**UI changes — `[src/components/panels/StatsPanel.tsx](src/components/panels/StatsPanel.tsx)`**

- Add a "Compaction Scores" subsection showing per-level scores

---

## Feature 6: Manual Compaction Picker

**Goal:** Let users click an SSTable and trigger single-file compaction of that SSTable into the next level, without waiting for automatic thresholds.

**Engine changes — `[src/engine/lsm-tree.ts](src/engine/lsm-tree.ts)`**

- Add `compactSSTable(sstId: string): LSMEvent[]`
- Finds the SSTable by id, determines its level, runs `compactLevelToNext` scoped to just that SSTable (pass it as the "picked" file rather than using the default "oldest" picker)

**Engine changes — `[src/engine/compaction.ts](src/engine/compaction.ts)`**

- Refactor `compactLevelToNext` to accept an optional `pickedSST: SSTableMeta` override parameter instead of always picking the oldest

**Store changes — `[src/store/lsm-store.ts](src/store/lsm-store.ts)`**

- Add `manualCompact(sstId: string)` action that calls `tree.compactSSTable(sstId)` and refreshes snapshot

**UI changes — `[src/components/flow/SSTDetailDialog.tsx](src/components/flow/SSTDetailDialog.tsx)`**

- Add a "Compact to L{n+1}" button in the modal footer (disabled if already at `maxLevels - 1`)
- On click, call `manualCompact(selectedSST)` and close the modal

---

## Feature 7: Range Scan / Iterator

**Goal:** Add a `scan(startKey, endKey)` operation that returns all live entries in a key range across all levels, and highlights every SSTable that was consulted.

**Engine changes — `[src/engine/lsm-tree.ts](src/engine/lsm-tree.ts)`**

- Add `scan(startKey: string, endKey: string): { entries: KeyValue[]; consultedSSTIds: string[]; events: LSMEvent[] }`
- Walk memtable entries, then each level (L0 sorted newest-first, L1+ sorted by key range)
- For each SSTable where `minKey <= endKey && maxKey >= startKey`, scan its entries in range and add id to `consultedSSTIds`
- Merge all candidates by key (newest wins), drop tombstones

**Store changes — `[src/store/lsm-store.ts](src/store/lsm-store.ts)`**

- Add `scanResult: { entries: KeyValue[]; consultedSSTIds: string[] } | null`
- Add `scan(startKey: string, endKey: string)` action
- Set `highlightedPath = consultedSSTIds` after scan (reuses existing highlight machinery)

**UI changes — `[src/components/panels/OperationsPanel.tsx](src/components/panels/OperationsPanel.tsx)`**

- Add a "Scan" section with start/end key inputs and a Scan button
- Show scan results as a scrollable table of `key → value` pairs below the button
- Show "X entries found, Y SSTables consulted"

---

## Feature 8: Event Log Panel

**Goal:** Show the last 50 operations as a scrollable timeline. The data already exists in `store.events: LSMEvent[]`; only the UI is missing.

**New component — `src/components/panels/EventLogPanel.tsx`**

- Draggable panel (use existing `DraggablePanel` wrapper)
- Scrollable list of events from `useLSMStore(s => s.events)`, newest at top
- Color-code by `event.type`: PUT (blue), DELETE (red), FLUSH (amber), COMPACTION (violet), GET (emerald)
- Each row: timestamp (relative, e.g. "2s ago"), type badge, and `event.details` summary
- Auto-scroll to top on new events

**UI changes — `[src/components/Visualizer.tsx](src/components/Visualizer.tsx)`**

- Import and render `<EventLogPanel />` as a fourth overlay panel alongside the existing three

**Check `[src/engine/types.ts](src/engine/types.ts)`**

- Verify `LSMEvent.details` has enough info to render meaningful rows (key, level, SST count); add fields if sparse

---

## Feature 9: Level-Scaled SSTable Size

**Goal:** Make compaction output SSTable size double with each level, mirroring RocksDB's `target_file_size_multiplier`. L0→L1 outputs SSTables of `baseChunkSize` entries; L1→L2 outputs `baseChunkSize * 2`; L2→L3 outputs `baseChunkSize * 4`, etc.

The formula at target level `t`: `chunkSize = baseChunkSize * 2^(t - 1)`

Current state: both `compactL0ToL1` and `compactLevelToNext` hardcode `const chunkSize = 4` and don't receive `config`.

**Engine changes — `[src/engine/types.ts](src/engine/types.ts)`**

- Add `baseChunkSize: number` to `LSMConfig` (default `4`, range `2–16`)
- Update `DEFAULT_CONFIG` accordingly

**Engine changes — `[src/engine/compaction.ts](src/engine/compaction.ts)`**

- Pass `config: LSMConfig` into `compactL0ToL1` and `compactLevelToNext` (both are currently internal functions called from `leveledCompaction` which already has `config`)
- Replace the hardcoded `const chunkSize = 4` in each function:

```typescript
// compactL0ToL1 — target level is 1
const chunkSize = config.baseChunkSize * Math.pow(2, 0); // = baseChunkSize

// compactLevelToNext(levels, level) — target level is level + 1
const chunkSize = config.baseChunkSize * Math.pow(2, level); // level+1-1 = level
```

So compacting into L1 = `baseChunkSize * 1`, into L2 = `baseChunkSize * 2`, into L3 = `baseChunkSize * 4`, etc.

**UI changes — `[src/components/panels/ConfigPanel.tsx](src/components/panels/ConfigPanel.tsx)`**

- Add a slider for `baseChunkSize` (range 2–16, default 4, label "Base SSTable Size")
- Add a read-only display showing the resulting sizes per level, e.g. "L1: 4, L2: 8, L3: 16 entries/SST" — updates live as the slider moves

**No store or layout changes required** — `SSTableMeta.entries.length` already reflects the actual entry count, so `SSTNode` and `SSTDetailDialog` will naturally show the larger SSTables without any changes.