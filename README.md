# CC Buddy

A desktop pet that watches your [Claude Code](https://claude.ai/code) sessions and reacts in real time.

CC Buddy lives as a small transparent window on your desktop. It monitors local Claude Code activity — reading files, running commands, writing code — and maps each action to a pet mood expressed through animated transitions. It never sends data anywhere; everything stays on your machine.

![Tauri](https://img.shields.io/badge/Tauri-2.x-blue)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Rust](https://img.shields.io/badge/Rust-2021-orange)

## How it works

```
~/.claude/sessions/   ──►  Rust file watcher  ──►  MonitorSnapshot / Delta
~/.claude/projects/        (incremental JSONL       ──►  Tauri IPC events
.claude.json                tail reading)               ──►  React UI
```

1. **Rust backend** discovers active Claude Code sessions from local files, tails JSONL event logs incrementally, and infers what your session is doing.
2. **Tauri IPC** pushes snapshots and deltas to the frontend — no polling.
3. **React frontend** renders two windows: a floating pet and an info dashboard.

## Pet moods

The pet's mood changes based on what Claude Code is doing:

| Activity | Mood | Animation |
|----------|------|-----------|
| Reasoning | thinking | pondering |
| Running shell commands | excited | running command |
| Editing / writing files | focused | writing code |
| Reading files | curious | reading |
| Searching (grep/glob) | hunting | searching |
| Delegating to sub-agents | busy | delegating |
| Task completed | happy | celebrating |
| Error encountered | worried | debugging |
| No activity (30s+) | idle | sleeping (3 variants) |

Each mood transition plays a `.webm` video (`{from}-to-{to}.webm`), giving the pet smooth animated state changes.

## Windows

**Pet Window** — A 512x512 transparent, always-on-top floating window. Shows the pet animation and a speech bubble describing the current activity. Draggable. Click to interact.

**Dashboard** — A regular window showing active sessions (top 3), companion stats (name, personality, age), and a live event feed.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/) toolchain
- [Tauri CLI prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Install & run

```bash
cd app
npm install

# Full desktop app (recommended)
npm run tauri:dev

# Frontend only (uses mock data, no Tauri required)
npm run dev
```

### Build for production

```bash
cd app
npm run tauri:build
```

The packaged application will be in `app/src-tauri/target/release/bundle/`.

## Project structure

```
cc-buddy/
├── app/
│   ├── src/
│   │   ├── main.tsx                # Entry — routes to /pet or /dashboard
│   │   ├── App.tsx                 # Dashboard UI
│   │   ├── PetWindow.tsx           # Pet floating window
│   │   ├── PetWindow.css           # Transparent window styling
│   │   ├── domain/                 # Pure business logic
│   │   │   ├── types.ts            # Shared data model
│   │   │   ├── behavior.ts         # Tool usage → pet mood mapping
│   │   │   ├── animationMachine.ts # Video transition state machine
│   │   │   ├── monitor.ts          # Snapshot construction
│   │   │   ├── monitorDelta.ts     # Incremental state merging
│   │   │   └── ...
│   │   ├── bridge/
│   │   │   └── monitor.ts          # Tauri IPC / browser mock abstraction
│   │   └── hooks/
│   │       ├── useMonitorState.ts   # Snapshot + delta subscription
│   │       └── usePetAnimation.ts   # Animation playback state machine
│   ├── src-tauri/
│   │   ├── src/lib.rs              # Rust core — session discovery, file watcher, JSONL tail
│   │   ├── tauri.conf.json         # Window definitions and app config
│   │   └── resources/videos/       # ~60 mood transition .webm files
│   └── package.json
└── docs/
    └── architecture-cn.md          # Detailed architecture doc (Chinese)
```

## Testing

```bash
cd app

# Frontend unit tests
npm test

# Lint
npm run lint

# Rust tests
cd src-tauri && cargo test
```

## Design principles

- **Read-only** — never writes to Claude Code's files or interferes with sessions
- **Local-only** — all data stays on your machine, no network calls
- **Low overhead** — incremental JSONL tailing, delta-based updates, no polling
- **Unidirectional data flow** — Rust owns the state, React renders it

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2.x |
| Backend | Rust 2021 (notify, serde, dirs) |
| Frontend | React 19 + TypeScript 5.9 |
| Build | Vite 7 + Cargo |
| Tests | Vitest + @testing-library/react |

## License

Private project.
