# LSM Tree Visualizer

Built with ❤️ using vibe coding

Interactive browser-based visualization of **Log-Structured Merge Trees** with SSTables -- the storage engine behind RocksDB, Apache Cassandra, LevelDB, and similar key-value stores.

Insert keys, watch data flow through the MemTable, trigger flushes to L0 SSTables, and observe compaction cascading through levels -- all with live animations on a draggable canvas.

## Features

- **Write path visualization** -- keys flow through WAL -> MemTable -> flush to L0 SSTable
- **Read path highlighting** -- search path lights up from MemTable through each level
- **Two compaction strategies** -- Leveled (RocksDB-style) and Size-Tiered (Cassandra-style)
- **Live configuration** -- adjust MemTable size, level multiplier, compaction trigger, max levels via sliders
- **Draggable everything** -- nodes, panels, pan/zoom canvas with minimap
- **Dark mode** -- default dark theme with color-coded levels (amber L0, emerald L1, cyan L2, violet L3, pink L4)
- **Statistics panel** -- write/read/space amplification, per-level SSTable counts

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd lsm_visualizer
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

Choose **"Start from Scratch"** for an empty tree or **"Sample Data"** to pre-populate ~30 key-value pairs with flushes already triggered.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once (CI-friendly) |

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React + TypeScript | 19 |
| Build | Vite | 7 |
| Visualization | @xyflow/react (React Flow) | 12 |
| State | Zustand | 5 |
| Animation | motion (Framer Motion) | 12 |
| Styling | Tailwind CSS v4 + shadcn/ui | 4 |
| Testing | Vitest | 4 |

## Project Structure

```
src/
  engine/           Pure TS LSM engine (no React imports)
    types.ts        Shared interfaces and config defaults
    memtable.ts     In-memory sorted write buffer
    sstable.ts      SSTable creation, merge, overlap detection
    wal.ts          Write-Ahead Log model
    compaction.ts   Leveled + Size-Tiered compaction strategies
    lsm-tree.ts     Orchestrator: put/get/delete/flush/compact
  store/
    lsm-store.ts    Zustand store bridging engine and React
  hooks/
    use-flow-layout.ts  Converts LSM state to React Flow nodes/edges
  components/
    flow/           Custom React Flow nodes (MemTable, SST, Level, WAL)
    panels/         Draggable floating panels (Config, Ops, Stats)
    StartScreen.tsx Landing page
    Visualizer.tsx  Main canvas
  App.tsx           Root component
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for full low-level design documentation.

## How It Works

The engine is **pure TypeScript** with no React dependencies -- it can be tested and used independently. The Zustand store wraps an `LSMTree` instance and exposes an immutable `LSMSnapshot` that React subscribes to. The `useFlowLayout` hook converts snapshots into positioned React Flow nodes and edges.

```
User action -> Zustand store -> LSMTree engine -> Snapshot -> React Flow canvas
```

Every mutation (`put`/`delete`/`flush`/`compact`) returns `LSMEvent[]` so the UI can animate exactly what happened.

## Configuration

All parameters are adjustable live via the Configuration panel:

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| MemTable Size | 2-32 | 8 | Entries before auto-flush |
| Level Multiplier | 2-10 | 4 | Max SSTables per level (leveled) |
| Max Levels | 2-7 | 5 | Depth of level hierarchy |
| L0 Compaction Trigger | 2-8 | 4 | L0 SSTable count before compaction |
| Compaction Strategy | -- | Leveled | Leveled (RocksDB) or Size-Tiered (Cassandra) |

## License

MIT
