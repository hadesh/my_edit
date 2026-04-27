# AGENTS.md — my_edit 项目知识库

> 供 AI Agent 读取。描述项目架构、模块职责、关键实现方案及注意事项。

---

## 一、项目概览

`my_edit` 是一个基于 **Tauri v2** 的 macOS 桌面文本编辑器。

- **前端**：原生 JavaScript + CodeMirror 5 + marked.js，零框架依赖
- **后端**：Rust 2021 + Tauri v2，通过 `invoke` IPC 调用
- **平台**：macOS 10.15+（DMG / APP）
- **入口**：`src/index.html`（HTML + 内联 CSS）、`src/main.js`（全部前端逻辑，~1628 行）
- **Rust**：`src-tauri/src/lib.rs`（应用启动 + 事件拦截）、`src-tauri/src/commands.rs`（所有 IPC 命令）

---

## 二、目录结构

```
my_edit/
├── src/
│   ├── index.html        # HTML 结构 + 全部 CSS（内联 <style>）
│   └── main.js           # 前端全部逻辑
├── src-tauri/
│   ├── icons/            # 应用图标（icon.icns / icon.ico / PNG 各尺寸）
│   ├── src/
│   │   ├── lib.rs        # Tauri Builder、ExitRequested 拦截
│   │   ├── main.rs       # 入口
│   │   └── commands.rs   # 全部 #[tauri::command]
│   ├── Cargo.toml
│   └── tauri.conf.json
└── AGENTS.md
```

---

## 三、Tauri 配置要点

- `withGlobalTauri: true`：前端通过 `window.__TAURI__` 访问所有 API
- IPC 调用封装（main.js 顶部）：
  ```js
  const invoke = (...args) => window.__TAURI__.core.invoke(...args);
  const listen  = (...args) => window.__TAURI__.event.listen(...args);
  ```
- 对话框：`window.__TAURI__.dialog.open/save/ask`
- 退出拦截：`lib.rs` 中监听 `RunEvent::ExitRequested`，调用 `api.prevent_exit()` 并 emit `exit-requested` 事件到前端，前端保存 session 后再 `invoke('exit_app')` 真正退出

---

## 四、前端核心状态

`main.js` 顶部的单例 `state` 对象是全部运行时状态：

```js
const state = {
  tabs: [],                  // Tab 数组，每项含 { id, path, title, content, dirty, cursorPos, scrollInfo }
  activeTabId: null,         // 当前激活 tab 的 id
  workspaceRoot: null,       // 当前打开的工作区根目录（绝对路径）
  cm: null,                  // CodeMirror 实例
  fontSize: 13.5,
  terminalSessions: [],      // 终端会话数组
  activeTerminalId: null,
  pendingProcessIds: Set,    // 运行中进程 id 集合
  contextMenuTarget: null,   // 右键菜单目标 entry
  selectedFolder: null,      // 侧边栏当前选中的文件夹路径
  findState: { query, matches, cursor },
  fileTreeOrder: {},         // 虚拟排序表：{ [dirPath]: [childPath, ...] }
};
```

模块级拖拽变量（非 state）：
- `_treeDragSrcPath`：拖拽源路径
- `_treeDragGhost`：跟随鼠标的幽灵 DOM 元素
- `_treeDragDidMove`：防止拖拽结束后误触 click 的标志

---

## 五、关键功能实现方案

### 5.1 标签页管理

- `openTab(path, content)` — 若已存在则 `activateTab`，否则新建 tab 对象并追加
- `activateTab(id)` — 切换前把当前 tab 的 content/cursor/scroll 写回 state，再加载新 tab 到 CodeMirror
- `closeTab(id)` — dirty 时弹确认框；`doCloseTab` 真正移除
- `_suppressChangeEvent` — 布尔标志，`activateTab` 调用 `cm.setValue` 时置 true，防止 CodeMirror change 事件误标 dirty

### 5.2 文件树

DOM 结构：每个目录下，`.tree-item` 和其子容器 `div[data-path]` **交替排列**于同一父容器。

```
container
  ├── .tree-item[data-path="folder1"][data-is-dir="true"]
  ├── div[data-path="folder1"]          ← 子容器，collapsed 控制显隐
  │     ├── .tree-item[data-path="folder1/file.js"]
  │     └── ...
  ├── .tree-item[data-path="file.txt"]
  └── ...
```

- `renderFileTree(entries, container, depth)` — 递归渲染，按 `state.fileTreeOrder[parentPath]` 排序
- `buildTreeItem(entry, depth)` — 构建单个 `.tree-item` DOM，设置 `dataset.path` 和 `dataset.isDir`
- 搜索直接子 `.tree-item` 时必须用 `$$('.tree-item', container).filter(el => el.parentElement === container)`，不能用 `querySelectorAll`（会取所有后代）

### 5.3 文件树拖拽排序

**背景**：Tauri WebView 会把 HTML5 `dragover` 转成系统拖拽，`dataTransfer` 丢失，`drop` 不触发，因此完全用 mouse 事件模拟。

**流程**：
1. `mousedown` 记录 `_treeDragSrcPath`，`e.preventDefault()` 阻止文字选中
2. `mousemove` 超过 4px 阈值后触发拖拽，创建 ghost DOM 跟随鼠标；`document.body.style.userSelect = 'none'`
3. `mouseup` 销毁 ghost，恢复 userSelect；根据鼠标位置判断目标

**目标判定**（mouseup）：
- 鼠标在目标 `.tree-item` 上半部分 → 同级排序（插到目标前面）
- 鼠标在目标文件夹的下半部分 → 移入该文件夹（`rename_path`）
- 鼠标在树空白区 → 移到 `workspaceRoot` 末尾
- 鼠标在树外 → 取消

**视觉反馈**：
- `.drag-over-top`（蓝色顶部线）= 排序到前面
- `.drag-over`（蓝色背景）= 移入文件夹

**`applyTreeOrder(srcPath, targetPath, targetIsDir)`** 返回值语义：
- `null` → 同目录排序，只更新 `state.fileTreeOrder`，不需要 rename
- `string` → 跨目录，返回新路径，调用方执行 `invoke('rename_path')`

**`currentDirOrder(dirPath)`** — 若 `state.fileTreeOrder[dirPath]` 不存在，从 DOM 直接子 `.tree-item` 读取当前顺序初始化，避免排序结果只剩一项。

**防止拖拽后误触 click**：`_treeDragDidMove` 标志 + `setTimeout(() => { _treeDragDidMove = false }, 0)` 延迟重置。

**CSS**：`#sidebar` 及 `#sidebar *` 均设 `user-select: none`，避免拖拽时文字被选中。

### 5.4 Session 持久化

- 存储路径：`~/.myedit_session.json`（通过 `app.path().home_dir()` 获取）
- 存储内容：`{ workspaceRoot, activeFilePath, openFiles: [{path, cursorPos, scrollInfo}], fileTreeOrder }`
- `openFiles` 只保存 `!t.dirty` 的文件（未保存文件不恢复）

**保存时机（事件驱动，而非仅在退出时）**：
| 触发点 | 函数 |
|---|---|
| 切换 tab | `activateTab` 末尾 `saveSession()` |
| 关闭 tab | `doCloseTab` → `renderTabs` 末尾 `saveSession()` |
| 打开/切换工作区 | `loadWorkspace(path, persist=true)` 末尾 |
| 文件树拖拽排序后 | `onMouseUp` 末尾 `saveSession()` |
| 窗口关闭（CloseRequested） | `listen('tauri://close-requested')` |
| Command+Q（ExitRequested） | `listen('exit-requested')` |

`loadWorkspace` 有 `persist` 参数（默认 `true`），`restoreSession` 内调用时传 `false`，避免恢复过程中覆盖 session。

**Command+Q 退出链路**：
```
用户按 Cmd+Q
  → Tauri RunEvent::ExitRequested
  → Rust: api.prevent_exit() + app.emit("exit-requested", ())
  → 前端: listen('exit-requested') → saveSession() → invoke('exit_app')
  → Rust: app.exit(0)
```

### 5.5 外部文件（工作区外）处理

策略：文件正常打开，不加入文件树，状态栏显示完整路径。

- `openFile(filePath)` 检测 `!filePath.startsWith(workspaceRoot + '/')`，满足则显示 Toast：「文件在工作区外，仅在编辑器中打开」
- `updateStatusBar()`：外部文件时 `#status-file` 显示 `↗ /full/path`，加 `.external` class（橙色）；工作区内文件只显示文件名
- CSS：`#status-file` 设 `direction: rtl`，长路径从左侧截断，文件名始终可见；`max-width: 420px`

### 5.6 脚本执行 & 终端

- `execute_command_stream`（Rust）：用 `tokio::process::Command` spawn 子进程，逐行读取 stdout/stderr，通过 `app.emit(id, StreamEvent)` 推送到前端
- 前端 `listen(processId, handler)` 接收流式输出，追加到对应终端 session
- 支持 Python（`python3`）、Node、Shell 命令
- 终端支持多 session，各自维护 `{ id, label, lines[] }`

### 5.7 HTTP 请求（curl 集成）

- `execute_curl`（Rust）：解析 curl 命令字符串（方法、headers、body），用 `reqwest` 发送，支持 SSE 流式响应
- 前端 `executeCurl(curlCmd)` 解析多行 curl（反斜杠续行），调用 Rust command，结果输出到终端 session

### 5.8 Markdown / JSON 预览

- Markdown：`marked.js` 渲染，`togglePreview()` 开启左右分屏，`triggerPreviewUpdate()` debounce 300ms 后 `updatePreview()`
- JSON：`formatJSON()` / `syntaxHighlightJSON()` 对选中文本或全文操作，结果写回编辑器

---

## 六、Rust IPC 命令一览

| 命令 | 签名 | 说明 |
|---|---|---|
| `read_file` | `(path) → String` | 读文件内容 |
| `write_file` | `(path, content) → SaveResult` | 写文件，自动创建父目录 |
| `read_dir_tree` | `(path) → Vec<FileEntry>` | 递归读目录树 |
| `create_file` | `(path)` | 创建文件 |
| `create_dir` | `(path)` | 创建目录 |
| `delete_path` | `(path)` | 删除文件或目录 |
| `rename_path` | `(old_path, new_path)` | 重命名/移动 |
| `path_exists` | `(path) → bool` | 路径是否存在 |
| `get_file_info` | `(path) → FileEntry` | 获取文件元信息 |
| `execute_command` | `(cmd, args, cwd) → ProcessOutput` | 同步执行命令 |
| `execute_command_stream` | `(id, cmd, args, cwd)` | 流式执行，emit 事件到前端 |
| `execute_curl` | `(method, url, headers, body) → StreamEvent` | HTTP 请求 |
| `save_session` | `(data: String)` | 写 `~/.myedit_session.json` |
| `load_session` | `() → String` | 读 session，不存在返回 `"null"` |
| `exit_app` | `(app)` | `app.exit(0)` |

`FileEntry` 结构：`{ name, path, is_dir, children: Option<Vec<FileEntry>>, size, extension }`

---

## 七、CSS 约定

- 所有 CSS 写在 `src/index.html` 的 `<style>` 块内，不使用外部 CSS 文件
- CSS 变量定义在 `:root`，包含 `--bg-primary/secondary/tertiary`、`--text-primary/secondary`、`--accent`、`--border`、`--statusbar-bg/text`、`--statusbar-height: 24px`
- 主题：Monokai 深色
- 关键 class：
  - `.tree-item` — 文件树条目
  - `.tree-item.active` — 当前选中
  - `.tree-item.drag-over` — 拖拽目标（移入文件夹，蓝色背景）
  - `.tree-item.drag-over-top` — 拖拽目标（同级排序，顶部蓝线）
  - `.tree-item.dragging` — 拖拽源（半透明）
  - `.tree-drag-ghost` — 拖拽跟随幽灵元素
  - `.status-item.external` — 外部文件路径（橙色）
  - `#status-file` — 设 `direction: rtl` 实现从左截断

---

## 八、已知约束 & 注意事项

1. **不要用 HTML5 Drag API**：Tauri WebView 会劫持 dragover，改为 mouse 事件模拟
2. **CodeMirror change 事件保护**：调用 `cm.setValue()` 前设 `_suppressChangeEvent = true`，之后复原
3. **文件树子节点查询**：用 `el.parentElement === container` 过滤直接子节点，`querySelectorAll` 会取所有后代
4. **`applyTreeOrder` 返回值**：`null` = 仅排序（不 rename），`string` = 需要 rename，调用方 `if (newPath !== null) return` 跳过不必要刷新
5. **`loadWorkspace(path, persist=false)`**：`restoreSession` 内调用时必须传 `false`，防止覆盖 session
6. **session 保存是 fire-and-forget**：`saveSession()` 调用不需要 await（退出路径除外），失败静默忽略
7. **`withGlobalTauri: true`**：必须通过 `window.__TAURI__` 访问，不能 import Tauri JS SDK
