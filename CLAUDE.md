# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyEdit is a macOS desktop text editor built with **Tauri v2 + React + TypeScript** (frontend) and **Rust 2021** (backend). The project is currently on the `refactor/react` branch — migrating from a vanilla JS monolith (`src/main.js.bak`, `src/index.html.bak`) to a React + Zustand + CSS Modules architecture.

> ⚠️ **`AGENTS.md` is outdated** — it describes the vanilla JS architecture (corresponding to the `.bak` files) and predates the React refactor. Do not use it as a reference for current code.
>
> ⚠️ **`*.bak` files** (`src/main.js.bak`, `src/index.html.bak`) are the legacy vanilla JS implementation kept for reference only. Do not modify them; do not assume their patterns apply to the React code.

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
- **Session**: `src/hooks/useSession.ts` — persists workspace/tabs/scroll to `~/.myedit_session.json` (Rust resolves `$HOME` via `app.path().home_dir()`). Fire-and-forget on tab switch/close; awaited on app exit. 启动期由模块级标志守门 saveSession,避免 restoreSession 完成前用空 tabs 覆盖 session 文件;StrictMode 双跑由 `hasStartedRestore` 防重入。
- **Drafts (auto-save)**: `src/hooks/useDraft.ts` — 每个 Tab 持有跨会话稳定的 `draftId`(UUID),内容变化 debounce 500ms 后原子写入 `$APP_CACHE_DIR/drafts/{draftId}.json`(macOS: `~/Library/Caches/com.myedit.app/drafts/`)。下次启动从草稿恢复:临时文件按 `title` 重建为"未命名 N";磁盘文件与原盘内容比对,有差异则恢复并标 dirty。保存到磁盘后删除草稿,启动末尾清理孤儿草稿。Rust 端命令:`write_draft` / `read_draft` / `delete_draft` / `list_drafts`(详见 `commands.rs:498`)。
- **Components**: 13 component directories under `src/components/` — `Editor/`, `Sidebar/`, `TabsBar/`, `Terminal/`, `FindBar/`, `PreviewPanel/`, `FileSearchOverlay/`, `Modal/`, `Toast/`, `ContextMenu/`, `ShortcutsOverlay/`, `StatusBar/`, `TitleBar/`. Each ships its own `*.module.css`.
- **Styles**: CSS Modules per component (`*.module.css`), global theme variables in `src/styles/variables.css`.
- **Editor**: CodeMirror 6 via `src/hooks/useCodeMirror.ts`. Language extensions in `src/utils/langUtils.ts`.

### Backend (Rust)

- `src-tauri/src/lib.rs` — Tauri builder, plugin registration, `ExitRequested` interception (prevents immediate exit, emits `exit-requested` to frontend).
- `src-tauri/src/commands.rs` — All `#[tauri::command]` handlers: file I/O, dir tree, process execution (sync + streaming), curl, session, drafts (`write_draft` / `read_draft` / `delete_draft` / `list_drafts`,原子 rename 写入), image base64 reading.
- Streaming output uses `tokio::process::Command` + `app.emit()` to push `StreamEvent { id, stream, data }` per line.
- **Notable commands beyond plain file I/O**:
  - `shell_exec` — runs `/bin/bash -l -c <cmd>`; output streams via `shell-output-${id}` events (distinct prefix from `process-output-${id}`).
  - `read_file_base64` — reads images as base64 for in-editor preview.
  - `reveal_in_finder` — shells out to `open -R <path>`.
  - `execute_curl` — parses curl-style args and streams response (supports SSE) via `process-output-${id}`.

### Key Patterns

- **Cmd+Q exit chain**: User → Rust `api.prevent_exit()` + emit `exit-requested` → Frontend saves session → `invoke('exit_app')` → `app.exit(0)`.
- **FileEntry fields use snake_case** (`is_dir`, not `isDir`) — must match Rust struct exactly.
- **File tree**: Directories filtered to hide dotfiles, `node_modules`, `target`. Max depth 5 levels.
- **Tab dirty tracking**: Content compared against `savedContent` field on each tab.
- **Tab `draftId`**: 每个 Tab 创建时一次性分配 UUID(`newDraftId()`),贯穿生命周期不变;`SessionData.openFiles[i]` 同步存 `draftId`(可选,兼容老 session)。临时文件 `path: null` + `isUntitled: true` + `title` 三者必备。

## Constraints

- **No HTML5 Drag API** in file tree — Tauri WebView hijacks `dragover`/`drop`. Use mouse events instead.
- **macOS only** (10.15+). Platform-specific APIs like `reveal_in_finder` use `open -R`.
- **`withGlobalTauri: true`** — always access Tauri APIs via `window.__TAURI__`, never `import` from `@tauri-apps/api`.
- **IPC parameter naming**: Tauri v2 auto-converts JS `camelCase` → Rust `snake_case` parameters. Either form works in the `invoke` args object (e.g., `{ curlCommand }` matches Rust `curl_command`; `{ old_path, new_path }` works too). What you must NOT do is rename the keys arbitrarily — they have to map to the Rust signature one way or the other. `FileEntry` *struct fields* in returned data stay snake_case (`is_dir`, not `isDir`).
