# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyEdit is a macOS desktop text editor built with **Tauri v2 + React + TypeScript** (frontend) and **Rust 2021** (backend). The project is currently on the `refactor/react` branch — migrating from a vanilla JS monolith (`src/main.js.bak`, `src/index.html.bak`) to a React + Zustand + CSS Modules architecture.

## Commands

```bash
# Frontend dev server (Vite, port 5173)
npm run dev

# Tauri desktop app (launches Rust backend + frontend)
npm run tauri:dev

# Build for production
npm run tauri:build

# Type check
npx tsc --noEmit

# Rust check (from src-tauri/)
cd src-tauri && cargo check
```

No test framework is configured.

## Architecture

### Frontend (React + TypeScript)

- **Entry**: `index.html` → `src/main.tsx` → `src/App.tsx`
- **State**: Single Zustand store in `src/store/index.ts` — all app state (tabs, workspace, terminal, UI) lives here. Use `useStore` or the convenience hooks (`useTabs`, `useActiveTab`, `useWorkspaceRoot`, etc.).
- **IPC layer**: `src/hooks/useIPC.ts` wraps all `window.__TAURI__.core.invoke` calls. Tauri uses `withGlobalTauri: true`, so never `import` from `@tauri-apps/api` — always access via `window.__TAURI__`.
- **Event bridge**: Components communicate via `window.dispatchEvent(new CustomEvent(...))` for cross-cutting actions (`open-file`, `menu-action`, `save-session`, `terminal-action`, `confirm-close-tab`). `App.tsx` handles routing these events.
- **Tauri events**: `src/hooks/useTauriEvent.ts` wraps `window.__TAURI__.event.listen` for Rust→JS events (`exit-requested`, `process-output-${id}`, `shell-output-${id}`).
- **Session**: `src/hooks/useSession.ts` — persists workspace/tabs/scroll to `~/.myedit_session.json` via Rust IPC. Fire-and-forget on tab switch/close; awaited on app exit.
- **Styles**: CSS Modules per component (`*.module.css`), global theme variables in `src/styles/variables.css`.
- **Editor**: CodeMirror 6 via `src/hooks/useCodeMirror.ts`. Language extensions in `src/utils/langUtils.ts`.

### Backend (Rust)

- `src-tauri/src/lib.rs` — Tauri builder, plugin registration, `ExitRequested` interception (prevents immediate exit, emits `exit-requested` to frontend).
- `src-tauri/src/commands.rs` — All `#[tauri::command]` handlers: file I/O, dir tree, process execution (sync + streaming), curl, session, image base64 reading.
- Streaming output uses `tokio::process::Command` + `app.emit()` to push `StreamEvent { id, stream, data }` per line.

### Key Patterns

- **Cmd+Q exit chain**: User → Rust `api.prevent_exit()` + emit `exit-requested` → Frontend saves session → `invoke('exit_app')` → `app.exit(0)`.
- **FileEntry fields use snake_case** (`is_dir`, not `isDir`) — must match Rust struct exactly.
- **File tree**: Directories filtered to hide dotfiles, `node_modules`, `target`. Max depth 5 levels.
- **Tab dirty tracking**: Content compared against `savedContent` field on each tab.

## Constraints

- **No HTML5 Drag API** in file tree — Tauri WebView hijacks `dragover`/`drop`. Use mouse events instead.
- **macOS only** (10.15+). Platform-specific APIs like `reveal_in_finder` use `open -R`.
- **`withGlobalTauri: true`** — IPC arguments must be passed as an object with keys matching the Rust parameter names exactly.
