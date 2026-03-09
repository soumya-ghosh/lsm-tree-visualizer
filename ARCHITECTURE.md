# LSM Tree Visualizer -- Architecture Document

> **Location:** This file lives at the repository root (`ARCHITECTURE.md`).
> It should stay here so that AI agents, new contributors, and future-you can
> consume it as context before making changes.

---

## 1. Overview

An interactive, browser-based visualizer for **Log-Structured Merge Trees**
(LSM trees) with SSTables -- the storage engine behind RocksDB, Apache
Cassandra, LevelDB, and similar key-value stores.

Users can insert/query/delete keys, watch data flow through the MemTable,
trigger flushes to L0 SSTables, and observe compaction cascading through
levels -- all with live animations on a draggable React Flow canvas.

---

## 2. Tech Stack

| Layer        | Technology                             | Version  |
| ------------ | -------------------------------------- | -------- |
| Framework    | React + TypeScript                     | 19.2     |
| Build        | Vite                                   | 7.3      |
| Visualization| @xyflow/react (React Flow)             | 12.10    |
| State        | Zustand                                | 5.0      |
| Animation    | motion (Framer Motion)                 | 12.35    |
| Styling      | Tailwind CSS v4 + shadcn/ui            | 4.2      |
| Icons        | lucide-react                           | 0.577    |

---

## 3. High-Level Architecture

```
+-------------------------------------------------------+
|                    Browser (React 19)                  |
|                                                        |
|  +------------------+   +---------------------------+  |
|  |   StartScreen    |   |       Visualizer          |  |
|  |  (landing page)  |   |  +-----+ +-----+ +-----+ |  |
|  +--------+---------+   |  |Config| | Ops | |Stats| |  |
|           |              |  |Panel | |Panel| |Panel| |  |
|           v              |  +-----+ +-----+ +-----+ |  |
|  +------------------+   |                            |  |
|  |   Zustand Store  |<--+  React Flow Canvas         |  |
|  |  (lsm-store.ts)  |   |  (WAL, MemTable, Levels,  |  |
|  +--------+---------+   |   SSTables as nodes)       |  |
|           |              +---------------------------+  |
|           v                                            |
|  +------------------+                                  |
|  |   LSM Engine     |  <-- pure TypeScript, no React   |
|  |  (lsm-tree.ts)   |                                  |
|  +------------------+                                  |
+-------------------------------------------------------+
```

**Core principle:** The engine layer is completely decoupled from React.
The Zustand store is the only bridge -- it holds an `LSMTree` instance,
calls its methods, and exposes a reactive `LSMSnapshot` that the UI
subscribes to.

---

## 4. Directory Structure

```
src/
  engine/                 # Pure TS engine -- zero React imports
    types.ts              # All shared interfaces and constants
    memtable.ts           # In-memory sorted buffer (Map-backed)
    sstable.ts            # SSTable creation, merge, overlap detection
    wal.ts                # Write-Ahead Log model
    compaction.ts         # Leveled + Size-Tiered compaction strategies
    lsm-tree.ts           # Orchestrator: put/get/delete/flush/compact
  store/
    lsm-store.ts          # Zustand store bridging engine <-> React
  hooks/
    use-flow-layout.ts    # Converts LSMSnapshot -> React Flow nodes/edges
  components/
    flow/                 # Custom React Flow node components
      MemTableNode.tsx
      SSTNode.tsx
      LevelGroupNode.tsx
      WALNode.tsx
    panels/               # Draggable floating control panels
      DraggablePanel.tsx
      ConfigPanel.tsx
      OperationsPanel.tsx
      StatsPanel.tsx
    ui/                   # shadcn/ui primitives (auto-generated)
    StartScreen.tsx       # Landing page (empty vs sample data)
    Visualizer.tsx        # Main canvas + panels + React Flow setup
  lib/
    utils.ts              # shadcn cn() helper
  App.tsx                 # Root: routes between StartScreen and Visualizer
  main.tsx                # Entry point: renders App into #root
  index.css               # Tailwind v4 + shadcn theme (dark/light vars)
```

---

## 5. Engine Layer -- Low-Level Design

The engine is designed to be **unit-testable** and **framework-agnostic**.
Every mutation returns `LSMEvent[]` so the UI layer can animate what happened.

### 5.1 `types.ts` -- Shared Types

| Type            | Purpose                                                    |
| --------------- | ---------------------------------------------------------- |
| `LSMConfig`     | Tunable parameters: memtable size, level multiplier, max levels, L0 compaction trigger, compaction strategy |
| `DEFAULT_CONFIG`| Sensible defaults: `{ memtableMaxSize: 8, levelMultiplier: 4, maxLevels: 5, l0CompactionTrigger: 4, compactionStrategy: 'leveled' }` |
| `KeyValue`      | `{ key, value, timestamp, deleted? }` -- a single record   |
| `SSTableMeta`   | `{ id, level, entries[], minKey, maxKey, size, createdAt }` |
| `WALEntry`      | `{ operation: 'put'\|'delete', key, value, timestamp }`    |
| `LSMEvent`      | `{ type, timestamp, details }` -- emitted by every mutation |
| `LSMSnapshot`   | Full read-only state: memtable entries, WAL tail, all levels, config, stats |
| `LSMStats`      | Counters + amplification metrics (write, read, space)       |

### 5.2 `memtable.ts` -- MemTable

An in-memory `Map<string, KeyValue>` that acts as the write buffer.

| Method          | Signature                                         | Notes                         |
| --------------- | ------------------------------------------------- | ----------------------------- |
| `put`           | `(key, value, timestamp, deleted?) => void`       | Upserts entry                 |
| `get`           | `(key) => KeyValue \| undefined`                  | O(1) lookup                   |
| `getSorted`     | `() => KeyValue[]`                                | Sorted by key (for flush)     |
| `clear`         | `() => void`                                      | Called after flush             |
| `size`          | getter `=> number`                                | Entry count                   |

### 5.3 `sstable.ts` -- SSTable Utilities

Stateless functions for SSTable operations.

| Function          | Signature                                       | Notes                           |
| ----------------- | ----------------------------------------------- | ------------------------------- |
| `createSSTable`   | `(level, entries[]) => SSTableMeta`              | Sorts entries, assigns id `sst-{n}-L{level}`, computes min/max key |
| `mergeEntries`    | `(tables[]) => KeyValue[]`                       | Merge-sorts by key then timestamp (newest wins), drops tombstones |
| `hasOverlap`      | `(a, b) => boolean`                              | Key range overlap check         |
| `resetSSTCounter` | `() => void`                                     | Resets id counter (used on tree reset) |

### 5.4 `wal.ts` -- Write-Ahead Log

Append-only log. In this visualizer it is a display model (no crash recovery).

| Method      | Signature                              | Notes                    |
| ----------- | -------------------------------------- | ------------------------ |
| `append`    | `(operation, key, value) => WALEntry`  | Adds timestamped entry   |
| `getRecent` | `(n) => WALEntry[]`                    | Last N entries for UI    |
| `clear`     | `() => void`                           |                          |

### 5.5 `compaction.ts` -- Compaction Strategies

| Function               | Strategy     | Trigger                                          |
| ---------------------- | ------------ | ------------------------------------------------ |
| `leveledCompaction`    | Leveled      | L0 count >= `l0CompactionTrigger`, or Ln count > `levelMultiplier^n` |
| `sizeTieredCompaction` | Size-Tiered  | Any level count >= `l0CompactionTrigger`          |
| `runCompaction`        | Dispatcher   | Calls leveled or size-tiered based on `config.compactionStrategy` |

**Leveled internals:**
- `compactL0ToL1` -- merges all L0 SSTables with overlapping L1 SSTables, chunks merged output into new L1 SSTables (chunk size 4)
- `compactLevelToNext` -- picks oldest SSTable from Ln, merges with overlapping Ln+1 SSTables

**Size-Tiered internals:**
- Merges all SSTables in a level into a single SSTable at the next level

**Return type:** `CompactionResult { removedSSTs: string[], newSSTs: SSTableMeta[], fromLevel, toLevel }`

### 5.6 `lsm-tree.ts` -- LSMTree Orchestrator

The main class. Holds all state and coordinates operations.

| Method          | Returns              | Behavior                                                     |
| --------------- | -------------------- | ------------------------------------------------------------ |
| `put(key, val)` | `LSMEvent[]`         | WAL append -> MemTable insert -> auto-flush if full -> auto-compact |
| `get(key)`      | `{ value, found, path, events }` | Searches: MemTable -> L0 (newest first) -> L1 -> ... -> Ln. `path` lists every component checked. |
| `delete(key)`   | `LSMEvent[]`         | Tombstone write (`deleted: true`) via same put path          |
| `flush()`       | `LSMEvent[]`         | Freezes MemTable -> creates L0 SSTable -> clears MemTable -> runs compaction |
| `getSnapshot()` | `LSMSnapshot`        | Immutable copy of all state for React consumption            |
| `updateConfig`  | `void`               | Hot-updates config (takes effect on next operation)          |
| `reset`         | `void`               | Full reset to defaults, clears all data                      |

**Private methods:**
- `tryCompaction()` -- loops `runCompaction()` until no more work, collecting events
- `updateAmplification()` -- recalculates write amp (bytes written to storage / bytes written by user), read amp (levels to search + 1), space amp (total entries / last-level entries)

---

## 6. Store Layer -- Low-Level Design

### 6.1 `lsm-store.ts` -- Zustand Store

The single source of truth for the React app. Wraps an `LSMTree` instance.

**State shape:**
```typescript
{
  tree: LSMTree;              // mutable engine instance (not reactive itself)
  snapshot: LSMSnapshot;      // immutable snapshot -- React subscribes to this
  events: LSMEvent[];         // last 50 events for potential event log UI
  lastGetResult: GetResult;   // result of most recent Get operation
  highlightedPath: string[];  // node IDs to highlight (from Get's search path)
  started: boolean;           // controls StartScreen vs Visualizer routing
}
```

**Actions:**

| Action          | What it does                                                      |
| --------------- | ----------------------------------------------------------------- |
| `start(withData, config?)` | Creates fresh `LSMTree`. If `withData`, inserts 30 random KV pairs from `SAMPLE_KEYS`. |
| `put(key, value)` | Delegates to `tree.put()`, refreshes snapshot                   |
| `get(key)`      | Delegates to `tree.get()`, sets `lastGetResult` and `highlightedPath` |
| `del(key)`      | Delegates to `tree.delete()`, refreshes snapshot                  |
| `bulkInsert(n)` | Inserts `n` random key-value pairs                                |
| `manualFlush()` | Forces a flush even if MemTable isn't full                        |
| `updateConfig`  | Hot-updates engine config                                         |
| `reset()`       | Resets engine and all store state, returns to StartScreen         |
| `clearHighlight()` | Clears search path highlighting                                |

**Sample data:** 30 predefined keys (`user:001`..`user:005`, `order:100`..`order:103`, `product:a`..`product:d`, `session:x1`..`session:x3`, `config:*`, `log:*`, `cache:*`, `metric:*`) paired with random values from `[alpha, beta, gamma, delta, epsilon, zeta, eta, theta]`.

---

## 7. Visualization Layer -- Low-Level Design

### 7.1 `use-flow-layout.ts` -- Layout Hook

Converts `LSMSnapshot` + `highlightedPath` into React Flow `Node[]` and `Edge[]`.

**Layout strategy (absolute positioning):**
- WAL node at `(0, 0)`
- MemTable node at `(300, 0)`
- Level groups start at `y=180`, each `levelHeight + 20px` gap below the previous
- SST nodes are children of their level group node, positioned at `(LEVEL_PADDING_SIDE + idx * (SST_WIDTH + SST_GAP), LEVEL_PADDING_TOP)` within the parent
- Empty levels (except L0) are skipped

**Layout constants:** `SST_WIDTH=150`, `SST_HEIGHT=60`, `SST_GAP=16`, `LEVEL_PADDING_TOP=32`, `LEVEL_PADDING_SIDE=16`, `LEVEL_GAP=20`

**Edges:**
- `wal-to-mem` -- WAL right handle -> MemTable left handle (animated dashed)
- `mem-to-l0` -- MemTable bottom -> Level 0 top (animated, labeled "flush")
- `l{n}-to-l{n+1}` -- level-to-level (dashed, labeled "compact")

### 7.2 Custom React Flow Nodes

All nodes use `motion/react` for enter animations and state-driven transitions.

| Node              | File                    | Visual                                                  |
| ----------------- | ----------------------- | ------------------------------------------------------- |
| `MemTableNode`    | `flow/MemTableNode.tsx` | Animated fill bar (blue/amber), sorted KV list, glow when highlighted or near-full. Handles: target-left, source-bottom. |
| `SSTNode`         | `flow/SSTNode.tsx`      | Level-colored border (amber/emerald/cyan/violet/pink), key range `[min..max]`, size badge, spring-scale on highlight. Handles: target-top, source-bottom. |
| `LevelGroupNode`  | `flow/LevelGroupNode.tsx` | Gradient background band, level label + SST count, transparent handles for edge connections. Acts as parent for SST child nodes. |
| `WALNode`         | `flow/WALNode.tsx`      | Scrollable log with `PUT`/`DEL` colored entries, fade-in animation per entry. Handle: source-right. |

### 7.3 Draggable Panels

`DraggablePanel` is a reusable wrapper using pointer events for drag, with collapse toggle.

| Panel             | File                        | Controls                                           |
| ----------------- | --------------------------- | -------------------------------------------------- |
| `ConfigPanel`     | `panels/ConfigPanel.tsx`    | Sliders: memtable size (2-32), level multiplier (2-10), max levels (2-7), L0 trigger (2-8). Dropdown: compaction strategy. |
| `OperationsPanel` | `panels/OperationsPanel.tsx`| Key/value inputs, Put/Get/Delete buttons, bulk insert (count + button), manual flush. Displays last Get result with found/not-found badge and search path. |
| `StatsPanel`      | `panels/StatsPanel.tsx`     | Total puts/gets/deletes, flushes, compactions, SST count, entry count, write/read/space amplification, per-level SST counts. |

### 7.4 Top-Level Components

| Component      | File                    | Behavior                                              |
| -------------- | ----------------------- | ----------------------------------------------------- |
| `StartScreen`  | `StartScreen.tsx`       | Two cards: "Start from Scratch" (empty tree) and "Sample Data" (~30 random entries). Calls `store.start()`. |
| `Visualizer`   | `Visualizer.tsx`        | Full-screen React Flow canvas with `Background`, `Controls`, `MiniMap`. Renders all 3 panels as overlays. Reset button top-right. |
| `App`          | `App.tsx`               | Routes between `StartScreen` and `Visualizer` based on `store.started`. Wraps in `TooltipProvider`. |

---

## 8. Data Flow

```
User action (Put "user:001" = "alpha")
  |
  v
OperationsPanel.handlePut()
  |
  v
useLSMStore.put(key, value)
  |
  v
LSMTree.put(key, value)
  |-- WAL.append('put', key, value)
  |-- MemTable.put(key, value, timestamp)
  |-- if memtable.size >= config.memtableMaxSize:
  |     LSMTree.flush()
  |       |-- createSSTable(0, memtable.getSorted())
  |       |-- levels[0].push(newSST)
  |       |-- memtable.clear()
  |       |-- tryCompaction()
  |             |-- runCompaction(levels, config)  [loop until null]
  |                   |-- leveledCompaction or sizeTieredCompaction
  |-- updateAmplification()
  |-- return LSMEvent[]
  |
  v
Store sets snapshot = tree.getSnapshot()
  |
  v
useFlowLayout(snapshot, highlightedPath) recomputes nodes + edges
  |
  v
React Flow re-renders with new/updated nodes
  |
  v
motion/react animates node enter/update transitions
```

---

## 9. Styling & Theming

- **Dark mode by default:** `<html class="dark">` in `index.html`
- **Color scheme:** shadcn/ui oklch CSS variables with full dark variant
- **Level color coding:**
  - L0: amber
  - L1: emerald
  - L2: cyan
  - L3: violet
  - L4+: pink
- **MemTable:** blue border (amber when near-full)
- **WAL:** slate border
- **Edges:** blue for flush, indigo dashed for compaction, slate dashed for WAL-to-MemTable
- **React Flow controls/minimap:** themed to match dark card background

---

## 10. Configuration Reference

| Parameter             | Range  | Default   | Effect                                               |
| --------------------- | ------ | --------- | ---------------------------------------------------- |
| `memtableMaxSize`     | 2-32   | 8         | Entries before auto-flush                            |
| `levelMultiplier`     | 2-10   | 4         | Max SSTables per level = `multiplier^level` (leveled)|
| `maxLevels`           | 2-7    | 5         | Depth of the level hierarchy                         |
| `l0CompactionTrigger` | 2-8    | 4         | L0 SSTable count before compaction fires             |
| `compactionStrategy`  | --     | leveled   | `'leveled'` (RocksDB) or `'size-tiered'` (Cassandra) |

---

## 11. Key Design Decisions

1. **Engine/UI separation:** The `src/engine/` directory has zero React imports. This makes it testable with plain TS/JS test runners and potentially reusable in non-React contexts (e.g., Node CLI, Web Worker).

2. **Snapshot-based reactivity:** The engine is mutable (`LSMTree` class with internal state), but the store always produces an immutable `LSMSnapshot` for React. This avoids deep-comparison issues and makes React Flow's memoization work correctly.

3. **Event-sourced mutations:** Every `put`/`get`/`delete`/`flush`/`compact` returns `LSMEvent[]`. This enables the UI to animate specific operations (e.g., highlight the Get search path) without coupling animation logic into the engine.

4. **React Flow parent-child nodes:** SSTable nodes are children of their `LevelGroupNode` (via `parentId`). This means dragging a level moves all its SSTables together, and the layout math for SST positioning is relative to the level, not the canvas.

5. **Draggable panels via pointer events:** Instead of a drag library, `DraggablePanel` uses raw `onPointerDown`/`pointermove`/`pointerup` for minimal overhead and zero extra dependencies.

6. **Compaction chunking:** Merged entries are split into chunks of 4 to produce multiple SSTables per compaction, which better mirrors real-world behavior where compaction outputs are bounded by target file size.
