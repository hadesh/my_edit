// 通过 window.__TAURI__ 访问 Tauri API（需要 withGlobalTauri: true）
const invoke = (...args) => window.__TAURI__.core.invoke(...args);
const listen  = (...args) => window.__TAURI__.event.listen(...args);

// dialog 插件全局对象（Tauri v2 plugin-dialog 注入到 __TAURI__.dialog）
async function tauriOpen(opts)  { return window.__TAURI__.dialog.open(opts); }
async function tauriSave(opts)  { return window.__TAURI__.dialog.save(opts); }
async function tauriAsk(msg, opts) { return window.__TAURI__.dialog.ask(msg, opts); }

const EXT_TO_MODE = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'javascript', tsx: 'javascript', jsx: 'javascript',
  json: 'javascript',
  py: 'python',
  md: 'markdown', markdown: 'markdown',
  html: 'htmlmixed', htm: 'htmlmixed',
  css: 'css', scss: 'css', less: 'css',
  rs: 'rust',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml',
  xml: 'xml', svg: 'xml',
  txt: null,
};

const EXT_TO_COLOR = {
  js: '#f7df1e', ts: '#3178c6', jsx: '#61dafb', tsx: '#3178c6',
  py: '#3572a5', rs: '#dea584', md: '#083fa1',
  json: '#cbcb41', html: '#e34c26', css: '#563d7c',
  sh: '#89e051', sql: '#e38c00', yaml: '#cb171e',
};

const state = {
  tabs: [],
  activeTabId: null,
  workspaceRoot: null,
  cm: null,
  fontSize: 13.5,
  terminalSessions: [],
  activeTerminalId: null,
  pendingProcessIds: new Set(),
  contextMenuTarget: null,
  findState: { query: '', matches: 0, cursor: null },
};

let uid = 0;
const nextId = () => `id_${++uid}`;

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function ext(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function langMode(filename) {
  return EXT_TO_MODE[ext(filename)] ?? null;
}

function langLabel(filename) {
  const e = ext(filename);
  const labels = {
    js:'JavaScript', ts:'TypeScript', jsx:'JSX', tsx:'TSX',
    py:'Python', rs:'Rust', md:'Markdown', json:'JSON',
    html:'HTML', css:'CSS', scss:'SCSS', sh:'Shell',
    sql:'SQL', yaml:'YAML', toml:'TOML', xml:'XML', txt:'Plain Text',
  };
  return labels[e] || (e ? e.toUpperCase() : 'Plain Text');
}

function basename(p) { return p.split('/').pop() || p; }
function dirname(p)  { return p.substring(0, p.lastIndexOf('/')) || '/'; }

function showToast(msg, type = 'info', duration = 2800) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function showModal({ title, label, defaultVal = '', confirmText = '确认', onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${title}</h3>
      <label>${label}</label>
      <input type="text" value="${defaultVal}" id="modal-input">
      <div class="modal-btns">
        <button class="btn btn-ghost" id="modal-cancel">取消</button>
        <button class="btn btn-primary" id="modal-confirm">${confirmText}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#modal-input');
  input.focus();
  input.select();
  const close = () => overlay.remove();
  overlay.querySelector('#modal-cancel').onclick = close;
  overlay.querySelector('#modal-confirm').onclick = () => { close(); onConfirm(input.value.trim()); };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { close(); onConfirm(input.value.trim()); }
    if (e.key === 'Escape') close();
  });
}

async function confirmDialog(msg) {
  return tauriAsk(msg, { title: 'MyEdit', kind: 'warning' });
}

// ── CodeMirror 初始化 ────────────────────────

function initCodeMirror() {
  const textarea = $('#cm-editor');
  state.cm = CodeMirror.fromTextArea(textarea, {
    theme: 'one-dark',
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    lineWrapping: false,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    autoRefresh: true,
    tabSize: 2,
    indentWithTabs: false,
    extraKeys: {
      'Ctrl-/': cm => cm.execCommand('toggleComment'),
      'Cmd-/':  cm => cm.execCommand('toggleComment'),
      'Tab': cm => {
        if (cm.somethingSelected()) cm.indentSelection('add');
        else cm.replaceSelection('  ', 'end');
      },
    },
  });

  state.cm.setSize('100%', '100%');

  state.cm.on('change', () => {
    if (state.activeTabId) {
      const tab = state.tabs.find(t => t.id === state.activeTabId);
      if (tab && !tab.dirty) {
        tab.dirty = true;
        renderTabs();
      }
    }
    triggerPreviewUpdate();
  });

  state.cm.on('cursorActivity', updateStatusBar);
  state.cm.on('mousedown', handleEditorMousedown);

  $('#editor-placeholder').style.display = 'flex';
  state.cm.getWrapperElement().style.display = 'none';
}

function setEditorMode(filename) {
  const mode = langMode(filename);
  state.cm.setOption('mode', mode || 'null');
  $('#status-lang').textContent = langLabel(filename);
}

function updateStatusBar() {
  const cursor = state.cm.getCursor();
  $('#status-pos').textContent = `行 ${cursor.line + 1}，列 ${cursor.ch + 1}`;
  if (state.activeTabId) {
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (tab) {
      $('#status-file').textContent = basename(tab.path || tab.title);
    }
  }
}

// ── 标签页管理 ───────────────────────────────

function openTab(path, content = '') {
  const existing = state.tabs.find(t => t.path === path);
  if (existing) {
    activateTab(existing.id);
    return existing;
  }
  const tab = {
    id: nextId(),
    path,
    title: basename(path),
    content,
    dirty: false,
    savedContent: content,
    scrollInfo: null,
    cursorPos: { line: 0, ch: 0 },
  };
  state.tabs.push(tab);
  renderTabs();
  activateTab(tab.id);
  return tab;
}

function openUntitledTab() {
  const tab = {
    id: nextId(),
    path: null,
    title: `未命名 ${state.tabs.filter(t => !t.path).length + 1}`,
    content: '',
    dirty: false,
    savedContent: '',
    scrollInfo: null,
    cursorPos: { line: 0, ch: 0 },
  };
  state.tabs.push(tab);
  renderTabs();
  activateTab(tab.id);
  return tab;
}

function activateTab(id) {
  if (state.activeTabId === id) return;

  if (state.activeTabId) {
    const prev = state.tabs.find(t => t.id === state.activeTabId);
    if (prev) {
      prev.content = state.cm.getValue();
      prev.scrollInfo = state.cm.getScrollInfo();
      prev.cursorPos  = state.cm.getCursor();
    }
  }

  state.activeTabId = id;
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;

  $('#editor-placeholder').style.display = 'none';
  state.cm.getWrapperElement().style.display = '';

  state.cm.setValue(tab.content);
  state.cm.setCursor(tab.cursorPos);
  if (tab.scrollInfo) state.cm.scrollTo(tab.scrollInfo.left, tab.scrollInfo.top);

  setEditorMode(tab.title);
  updateStatusBar();
  renderTabs();
  triggerPreviewUpdate();

  state.cm.focus();
}

function closeTab(id) {
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;

  if (tab.dirty) {
    confirmDialog(`"${tab.title}" 有未保存的更改，确定要关闭吗？`).then(ok => {
      if (ok) doCloseTab(id);
    });
    return;
  }
  doCloseTab(id);
}

function doCloseTab(id) {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  state.tabs.splice(idx, 1);

  if (state.activeTabId === id) {
    state.activeTabId = null;
    if (state.tabs.length > 0) {
      activateTab(state.tabs[Math.min(idx, state.tabs.length - 1)].id);
    } else {
      state.cm.setValue('');
      state.cm.getWrapperElement().style.display = 'none';
      $('#editor-placeholder').style.display = 'flex';
      $('#status-lang').textContent = 'Plain Text';
      $('#status-file').textContent = '未打开文件';
      $('#preview-panel').classList.remove('visible');
      $('#preview-resizer').style.display = 'none';
    }
  }
  renderTabs();
}

function renderTabs() {
  const list = $('#tabs-list');
  list.innerHTML = '';
  state.tabs.forEach(tab => {
    const color = EXT_TO_COLOR[ext(tab.title)] || '#6c7086';
    const el = document.createElement('div');
    el.className = `tab${tab.id === state.activeTabId ? ' active' : ''}${tab.dirty ? ' dirty' : ''}`;
    el.dataset.id = tab.id;
    el.innerHTML = `
      <span class="tab-lang-dot" style="background:${color}"></span>
      <span class="tab-name" title="${tab.path || tab.title}">${tab.title}</span>
      <button class="tab-close" data-id="${tab.id}">×</button>`;
    el.addEventListener('click', e => {
      if (e.target.classList.contains('tab-close')) return;
      activateTab(tab.id);
    });
    el.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      showTabContextMenu(e, tab.id);
    });
    list.appendChild(el);
  });
}

function showTabContextMenu(e, tabId) {
  const menu = document.createElement('div');
  menu.style.cssText = `position:fixed;top:${e.clientY}px;left:${e.clientX}px;
    background:var(--bg-secondary);border:1px solid var(--border);
    border-radius:6px;padding:4px;z-index:9999;min-width:160px;
    box-shadow:0 8px 24px rgba(0,0,0,.4)`;
  const items = [
    ['关闭', () => closeTab(tabId)],
    ['关闭其他', () => {
      state.tabs.filter(t => t.id !== tabId).forEach(t => doCloseTab(t.id));
    }],
    ['关闭右侧', () => {
      const idx = state.tabs.findIndex(t => t.id === tabId);
      state.tabs.slice(idx + 1).forEach(t => doCloseTab(t.id));
    }],
    ['在 Finder 中显示', async () => {
      const tab = state.tabs.find(t => t.id === tabId);
      if (tab?.path) await invoke('execute_command', { program: 'open', args: ['-R', tab.path] });
    }],
  ];
  items.forEach(([label, action]) => {
    const item = document.createElement('div');
    item.className = 'ctx-item';
    item.textContent = label;
    item.onclick = () => { menu.remove(); action(); };
    menu.appendChild(item);
  });
  document.body.appendChild(menu);
  const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

// ── 文件操作 ─────────────────────────────────

async function openFile(filePath) {
  try {
    const content = await invoke('read_file', { path: filePath });
    openTab(filePath, content);
  } catch (e) {
    showToast(`打开失败: ${e}`, 'error');
  }
}

async function saveCurrentFile() {
  if (!state.activeTabId) return;
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;

  const content = state.cm.getValue();

  if (!tab.path) {
    const filePath = await tauriSave({
      defaultPath: tab.title,
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: 'Text', extensions: ['txt', 'md', 'js', 'ts', 'py', 'rs', 'json'] },
      ],
    });
    if (!filePath) return;
    tab.path = filePath;
    tab.title = basename(filePath);
    setEditorMode(tab.title);
  }

  try {
    await invoke('write_file', { path: tab.path, content });
    tab.content = content;
    tab.savedContent = content;
    tab.dirty = false;
    renderTabs();
    showToast('已保存', 'success', 1500);
  } catch (e) {
    showToast(`保存失败: ${e}`, 'error');
  }
}

async function saveAs() {
  if (!state.activeTabId) return;
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;

  const filePath = await tauriSave({
    defaultPath: tab.title,
    filters: [{ name: '所有文件', extensions: ['*'] }],
  });
  if (!filePath) return;

  const content = state.cm.getValue();
  try {
    await invoke('write_file', { path: filePath, content });
    tab.path = filePath;
    tab.title = basename(filePath);
    tab.dirty = false;
    setEditorMode(tab.title);
    renderTabs();
    showToast('另存为成功', 'success', 1500);
  } catch (e) {
    showToast(`另存为失败: ${e}`, 'error');
  }
}

async function cmdOpenFile() {
  const selected = await tauriOpen({
    multiple: false,
    filters: [
      { name: '所有文件', extensions: ['*'] },
      { name: '文本', extensions: ['txt', 'md', 'json', 'js', 'ts', 'py', 'rs', 'html', 'css', 'sh', 'yaml', 'toml'] },
    ],
  });
  if (selected) await openFile(selected);
}

async function cmdOpenFolder() {
  const selected = await tauriOpen({ directory: true });
  if (selected) await loadWorkspace(selected);
}

async function loadWorkspace(folderPath) {
  state.workspaceRoot = folderPath;
  $('#sidebar-title').textContent = basename(folderPath);
  $('#sidebar-title').title = folderPath;
  await refreshFileTree();
}

// ── 文件树 ────────────────────────────────────

async function refreshFileTree() {
  if (!state.workspaceRoot) return;
  try {
    const entries = await invoke('read_dir_tree', { path: state.workspaceRoot });
    renderFileTree(entries, $('#file-tree'), 0);
    $('#tree-empty').style.display = 'none';
  } catch (e) {
    showToast(`刷新目录失败: ${e}`, 'error');
  }
}

function renderFileTree(entries, container, depth) {
  const existing = $$('.tree-item', container);
  existing.forEach(el => el.remove());

  if (entries.length === 0 && depth === 0) {
    $('#tree-empty').style.display = '';
    return;
  }

  entries.forEach(entry => {
    const item = buildTreeItem(entry, depth);
    container.appendChild(item);

    if (entry.is_dir && entry.children) {
      const childContainer = document.createElement('div');
      childContainer.dataset.path = entry.path;
      childContainer.dataset.collapsed = 'false';
      container.appendChild(childContainer);
      renderFileTree(entry.children, childContainer, depth + 1);
    }
  });
}

function buildTreeItem(entry, depth) {
  const item = document.createElement('div');
  item.className = 'tree-item';
  item.dataset.path = entry.path;
  item.dataset.isDir = entry.is_dir;

  const icon = entry.is_dir ? '📁' : fileIcon(entry.extension);
  const indentPx = depth * 14 + 8;

  item.innerHTML = `
    <span class="item-indent" style="width:${indentPx}px"></span>
    ${entry.is_dir ? '<span class="collapse-icon">▾</span>' : '<span class="collapse-icon" style="visibility:hidden">▾</span>'}
    <span class="item-icon">${icon}</span>
    <span class="item-name">${entry.name}</span>`;

  item.addEventListener('click', e => handleTreeItemClick(e, entry));
  item.addEventListener('contextmenu', e => showTreeContextMenu(e, entry));
  item.addEventListener('dblclick', () => {
    if (entry.is_dir) return;
    openFile(entry.path);
  });

  return item;
}

function fileIcon(extension) {
  const icons = {
    js:'🟨', ts:'🔷', jsx:'🟦', tsx:'🔵',
    py:'🐍', rs:'🦀', md:'📝', json:'📋',
    html:'🌐', css:'🎨', scss:'🎨',
    sh:'🖥', bash:'🖥', zsh:'🖥',
    sql:'🗄', yaml:'⚙', yml:'⚙', toml:'⚙',
    txt:'📄', png:'🖼', jpg:'🖼', jpeg:'🖼',
    gif:'🖼', svg:'🖼', pdf:'📕',
    zip:'📦', tar:'📦', gz:'📦',
    mp4:'🎬', mp3:'🎵',
  };
  return icons[extension] || '📄';
}

function handleTreeItemClick(e, entry) {
  if (entry.is_dir) {
    const item = e.currentTarget;
    const container = item.nextElementSibling;
    if (!container || container.dataset.path !== entry.path) return;
    const collapsed = container.dataset.collapsed === 'true';
    container.dataset.collapsed = !collapsed;
    container.style.display = collapsed ? '' : 'none';
    item.querySelector('.collapse-icon').textContent = collapsed ? '▾' : '▸';
    item.querySelector('.item-icon').textContent = collapsed ? '📂' : '📁';
  } else {
    $$('.tree-item.active').forEach(el => el.classList.remove('active'));
    e.currentTarget.classList.add('active');
    openFile(entry.path);
  }
}

function showTreeContextMenu(e, entry) {
  e.preventDefault();
  e.stopPropagation();
  state.contextMenuTarget = entry;

  const menu = $('#context-menu');
  const isDir = entry.is_dir;

  menu.querySelector('[data-ctx="open"]').style.display    = isDir ? 'none' : '';
  menu.querySelector('[data-ctx="new-file-here"]').style.display   = isDir ? '' : 'none';
  menu.querySelector('[data-ctx="new-folder-here"]').style.display = isDir ? '' : 'none';

  menu.style.left = e.clientX + 'px';
  menu.style.top  = e.clientY + 'px';
  menu.classList.add('open');
}

function startRename(entry) {
  const treeItem = $$(`.tree-item[data-path="${CSS.escape(entry.path)}"]`)[0];
  if (!treeItem) return;
  treeItem.classList.add('renaming');
  const nameSpan = treeItem.querySelector('.item-name');
  const oldName = entry.name;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'item-name-input';
  input.value = oldName;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const finish = async () => {
    const newName = input.value.trim();
    input.replaceWith(nameSpan);
    treeItem.classList.remove('renaming');
    if (!newName || newName === oldName) return;
    const newPath = dirname(entry.path) + '/' + newName;
    try {
      await invoke('rename_path', { oldPath: entry.path, newPath });
      const tab = state.tabs.find(t => t.path === entry.path);
      if (tab) { tab.path = newPath; tab.title = newName; renderTabs(); }
      await refreshFileTree();
    } catch (err) {
      showToast(`重命名失败: ${err}`, 'error');
    }
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finish();
    if (e.key === 'Escape') {
      input.replaceWith(nameSpan);
      treeItem.classList.remove('renaming');
    }
  });
}

function promptNewFile(parentPath) {
  showModal({
    title: '新建文件',
    label: '文件名',
    onConfirm: async name => {
      if (!name) return;
      const newPath = parentPath + '/' + name;
      await invoke('create_file', { path: newPath });
      await refreshFileTree();
      await openFile(newPath);
    },
  });
}

function promptNewFolder(parentPath) {
  showModal({
    title: '新建文件夹',
    label: '文件夹名',
    onConfirm: async name => {
      if (!name) return;
      const newPath = parentPath + '/' + name;
      await invoke('create_dir', { path: newPath });
      await refreshFileTree();
    },
  });
}

// ── JSON 格式化 ──────────────────────────────

function formatJSON() {
  const val = state.cm.getValue();
  try {
    const parsed = JSON.parse(val);
    const formatted = JSON.stringify(parsed, null, 2);
    state.cm.setValue(formatted);
    showToast('JSON 格式化成功', 'success', 1500);
    updatePreviewIfJSON();
  } catch (e) {
    showToast(`JSON 格式化失败: ${e.message}`, 'error');
  }
}

function updatePreviewIfJSON() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;
  if (ext(tab.title) !== 'json') return;
  const previewPanel = $('#preview-panel');
  if (!previewPanel.classList.contains('visible')) return;
  renderJSONPreview(state.cm.getValue());
}

function renderJSONPreview(content) {
  const container = $('#preview-content');
  try {
    const parsed = JSON.parse(content);
    container.innerHTML = `<pre style="font-family:var(--font-mono,'JetBrains Mono',Menlo,monospace);font-size:13px">${syntaxHighlightJSON(JSON.stringify(parsed, null, 2))}</pre>`;
  } catch (e) {
    container.innerHTML = `<div class="json-error">JSON 解析错误: ${e.message}</div>`;
  }
}

function syntaxHighlightJSON(json) {
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      cls = /:$/.test(match) ? 'json-key' : 'json-string';
    } else if (/true|false/.test(match)) {
      cls = 'json-bool';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

// ── Markdown 预览 ────────────────────────────

let previewTimer = null;

function triggerPreviewUpdate() {
  const previewPanel = $('#preview-panel');
  if (!previewPanel.classList.contains('visible')) return;

  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 250);
}

function updatePreview() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;

  const content = state.cm.getValue();
  const e = ext(tab.title);

  if (e === 'json') {
    renderJSONPreview(content);
  } else if (e === 'md' || e === 'markdown') {
    renderMarkdownPreview(content);
  }
}

function renderMarkdownPreview(content) {
  marked.setOptions({
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true,
  });
  $('#preview-content').innerHTML = marked.parse(content);
}

function togglePreview() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;

  const e = ext(tab.title);
  const supported = ['md', 'markdown', 'json'].includes(e);
  if (!supported) {
    showToast('当前文件类型不支持预览（支持 .md / .json）', 'info');
    return;
  }

  const panel = $('#preview-panel');
  const resizer = $('#preview-resizer');
  const isVisible = panel.classList.contains('visible');

  if (isVisible) {
    panel.classList.remove('visible');
    resizer.style.display = 'none';
  } else {
    panel.classList.add('visible');
    resizer.style.display = '';
    const label = e === 'json' ? 'JSON 预览' : 'Markdown 预览';
    $('#preview-label').textContent = label;
    updatePreview();
  }
}

// ── 终端 ─────────────────────────────────────

function ensureTerminalVisible() {
  const container = $('#terminal-container');
  const resizer    = $('#terminal-resizer');
  if (!container.classList.contains('visible')) {
    container.classList.add('visible');
    resizer.style.display = '';
  }
}

function createTerminalSession(label = null) {
  const id = nextId();
  const session = {
    id,
    label: label || `终端 ${state.terminalSessions.length + 1}`,
    lines: [],
  };
  state.terminalSessions.push(session);
  state.activeTerminalId = id;
  renderTerminalTabs();
  ensureTerminalVisible();
  return session;
}

function getOrCreateActiveSession() {
  if (!state.activeTerminalId) return createTerminalSession();
  const s = state.terminalSessions.find(s => s.id === state.activeTerminalId);
  return s || createTerminalSession();
}

function activateTerminalSession(id) {
  state.activeTerminalId = id;
  renderTerminalTabs();
  renderTerminalOutput();
}

function closeTerminalSession(id) {
  const idx = state.terminalSessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  state.terminalSessions.splice(idx, 1);
  if (state.activeTerminalId === id) {
    state.activeTerminalId = state.terminalSessions.length > 0
      ? state.terminalSessions[Math.max(0, idx - 1)].id
      : null;
  }
  if (state.terminalSessions.length === 0) {
    $('#terminal-container').classList.remove('visible');
    $('#terminal-resizer').style.display = 'none';
  }
  renderTerminalTabs();
  renderTerminalOutput();
}

function renderTerminalTabs() {
  const container = $('#terminal-tabs');
  container.innerHTML = '';
  state.terminalSessions.forEach(session => {
    const el = document.createElement('div');
    el.className = `term-tab${session.id === state.activeTerminalId ? ' active' : ''}`;
    el.innerHTML = `<span>${session.label}</span><span class="term-close">×</span>`;
    el.querySelector('span').onclick = () => activateTerminalSession(session.id);
    el.querySelector('.term-close').onclick = e => {
      e.stopPropagation();
      closeTerminalSession(session.id);
    };
    container.appendChild(el);
  });
}

function appendTerminalLine(sessionId, text, cls = '') {
  const session = state.terminalSessions.find(s => s.id === sessionId);
  if (!session) return;
  session.lines.push({ text, cls });

  if (session.id !== state.activeTerminalId) return;
  const area = $('#terminal-output-area');
  const line = document.createElement('div');
  line.className = `term-line ${cls}`;
  line.innerHTML = `<span class="term-text">${escapeHtml(text)}</span>`;
  area.appendChild(line);
  area.scrollTop = area.scrollHeight;
}

function renderTerminalOutput() {
  const area = $('#terminal-output-area');
  area.innerHTML = '';
  const session = state.terminalSessions.find(s => s.id === state.activeTerminalId);
  if (!session) return;
  session.lines.forEach(({ text, cls }) => {
    const line = document.createElement('div');
    line.className = `term-line ${cls}`;
    line.innerHTML = `<span class="term-text">${escapeHtml(text)}</span>`;
    area.appendChild(line);
  });
  area.scrollTop = area.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── 脚本运行 ─────────────────────────────────

async function runScript(code, filePath) {
  const e = filePath ? ext(filePath) : null;

  let program, args, label;
  if (e === 'py') {
    program = 'python3';
    args = filePath ? [filePath] : ['-c', code];
    label = '🐍 Python';
  } else if (e === 'js' || e === 'mjs' || e === 'ts') {
    program = 'node';
    args = filePath ? [filePath] : ['-e', code];
    label = '🟢 Node';
  } else if (code.trim().startsWith('python')) {
    const lines = code.trim().split('\n');
    const pyCode = lines.slice(1).join('\n');
    program = 'python3';
    args = ['-c', pyCode];
    label = '🐍 Python (内联)';
  } else {
    program = 'node';
    args = ['-e', code];
    label = '🟢 Node (内联)';
  }

  const session = createTerminalSession(label);
  const cwd = filePath ? dirname(filePath) : state.workspaceRoot || undefined;

  appendTerminalLine(session.id, `$ ${program} ${args.join(' ')}`, 'system');
  appendTerminalLine(session.id, `工作目录: ${cwd || '~'}`, 'system');
  appendTerminalLine(session.id, '', '');

  const processId = nextId();
  state.pendingProcessIds.add(processId);

  const unlisten = await listen(`process-output-${processId}`, event => {
    const { stream, data } = event.payload;
    if (stream === 'stdout') {
      appendTerminalLine(session.id, data, '');
    } else if (stream === 'stderr') {
      appendTerminalLine(session.id, data, 'stderr');
    } else if (stream === 'exit') {
      const code = parseInt(data);
      appendTerminalLine(session.id, '', '');
      appendTerminalLine(session.id,
        code === 0 ? `✓ 进程退出 (0)` : `✗ 进程退出 (${code})`,
        code === 0 ? 'exit-ok' : 'exit-err'
      );
      state.pendingProcessIds.delete(processId);
      unlisten();
    }
  });

  try {
    await invoke('execute_command_stream', {
      id: processId,
      program,
      args,
      cwd,
    });
  } catch (err) {
    appendTerminalLine(session.id, `启动失败: ${err}`, 'stderr');
    unlisten();
  }
}

async function runCurrentFile() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;
  const e = ext(tab.title);
  if (!['py', 'js', 'mjs', 'ts'].includes(e)) {
    showToast('只支持运行 .py / .js / .ts 文件', 'info');
    return;
  }
  if (tab.dirty) await saveCurrentFile();
  await runScript(state.cm.getValue(), tab.path);
}

async function runSelection() {
  const sel = state.cm.getSelection();
  if (!sel.trim()) {
    showToast('请先选中要运行的代码', 'info');
    return;
  }
  await runScript(sel, null);
}

// ── curl 执行 ────────────────────────────────

function handleEditorMousedown() {
  setTimeout(updateCurlTooltip, 50);
}

function updateCurlTooltip() {
  const sel = state.cm.getSelection().trim();
  const tooltip = $('#curl-tooltip');
  if (sel && (sel.startsWith('curl ') || sel.startsWith('curl\n'))) {
    const coords = state.cm.cursorCoords(false, 'window');
    tooltip.style.top  = (coords.bottom + 4) + 'px';
    tooltip.style.left = coords.left + 'px';
    tooltip.classList.add('visible');
    $('#curl-tooltip-text').textContent = sel.length > 40 ? sel.slice(0, 40) + '…' : sel;
  } else {
    tooltip.classList.remove('visible');
  }
}

async function executeCurl(curlCmd) {
  const session = createTerminalSession('⚡ curl');
  const processId = nextId();
  state.pendingProcessIds.add(processId);

  appendTerminalLine(session.id, `$ ${curlCmd}`, 'system');
  appendTerminalLine(session.id, '', '');

  const unlisten = await listen(`process-output-${processId}`, event => {
    const { stream, data } = event.payload;
    if (stream === 'stdout') appendTerminalLine(session.id, data, '');
    else if (stream === 'stderr') appendTerminalLine(session.id, data, 'stderr');
    else if (stream === 'exit') {
      const code = parseInt(data);
      appendTerminalLine(session.id, '', '');
      appendTerminalLine(session.id,
        code === 0 ? '✓ 完成' : `✗ 退出码 ${code}`,
        code === 0 ? 'exit-ok' : 'exit-err'
      );
      state.pendingProcessIds.delete(processId);
      unlisten();
    }
  });

  try {
    await invoke('execute_curl', { id: processId, curlCommand: curlCmd });
  } catch (err) {
    appendTerminalLine(session.id, `curl 失败: ${err}`, 'stderr');
    unlisten();
  }
}

// ── 查找替换 ─────────────────────────────────

let findCursor = null;

function openFindBar(withReplace = false) {
  const bar = $('#find-bar');
  bar.classList.add('visible');
  const findInput = $('#find-input');
  const replaceInput = $('#replace-input');
  replaceInput.style.display = withReplace ? '' : 'none';
  $('#btn-replace-one').style.display = withReplace ? '' : 'none';
  $('#btn-replace-all').style.display = withReplace ? '' : 'none';
  const sep = bar.querySelector('.find-sep');
  sep.style.display = withReplace ? '' : 'none';

  const sel = state.cm.getSelection();
  if (sel) findInput.value = sel;
  findInput.focus();
  findInput.select();
  if (findInput.value) doFind(findInput.value);
}

function closeFindBar() {
  $('#find-bar').classList.remove('visible');
  state.cm.focus();
  findCursor = null;
  $('#find-count').textContent = '';
}

function doFind(query) {
  if (!query) { $('#find-count').textContent = ''; return; }
  const cursor = state.cm.getSearchCursor(query, CodeMirror.Pos(0, 0), { caseFold: true });
  let count = 0;
  while (cursor.findNext()) count++;
  $('#find-count').textContent = count > 0 ? `${count} 处` : '未找到';
  findCursor = null;
}

function findNext(query) {
  if (!query) return;
  if (!findCursor) findCursor = state.cm.getSearchCursor(query, state.cm.getCursor(), { caseFold: true });
  if (!findCursor.findNext()) {
    findCursor = state.cm.getSearchCursor(query, CodeMirror.Pos(0, 0), { caseFold: true });
    findCursor.findNext();
  }
  if (findCursor.from()) {
    state.cm.setSelection(findCursor.from(), findCursor.to());
    state.cm.scrollIntoView({ from: findCursor.from(), to: findCursor.to() }, 80);
  }
}

function findPrev(query) {
  if (!query) return;
  const cursor = state.cm.getSearchCursor(query, state.cm.getCursor(), { caseFold: true });
  if (!cursor.findPrevious()) {
    const end = CodeMirror.Pos(state.cm.lastLine());
    const c2 = state.cm.getSearchCursor(query, end, { caseFold: true });
    if (c2.findPrevious()) {
      state.cm.setSelection(c2.from(), c2.to());
      state.cm.scrollIntoView({ from: c2.from(), to: c2.to() }, 80);
    }
    return;
  }
  state.cm.setSelection(cursor.from(), cursor.to());
  state.cm.scrollIntoView({ from: cursor.from(), to: cursor.to() }, 80);
}

function replaceOne(query, replacement) {
  if (!query) return;
  if (!findCursor) findCursor = state.cm.getSearchCursor(query, state.cm.getCursor(), { caseFold: true });
  if (findCursor.findNext()) {
    findCursor.replace(replacement);
  }
}

function replaceAll(query, replacement) {
  if (!query) return;
  const cursor = state.cm.getSearchCursor(query, CodeMirror.Pos(0, 0), { caseFold: true });
  let count = 0;
  while (cursor.findNext()) { cursor.replace(replacement); count++; }
  showToast(`已替换 ${count} 处`, 'success', 1800);
  findCursor = null;
  doFind(query);
}

// ── 字体缩放 ─────────────────────────────────

function setFontSize(size) {
  state.fontSize = Math.min(28, Math.max(8, size));
  state.cm.getWrapperElement().style.fontSize = state.fontSize + 'px';
  state.cm.refresh();
}

// ── 菜单动作分发 ─────────────────────────────

function dispatchMenuAction(action) {
  switch (action) {
    case 'open-file':     cmdOpenFile(); break;
    case 'open-folder':   cmdOpenFolder(); break;
    case 'new-file':      openUntitledTab(); break;
    case 'save':          saveCurrentFile(); break;
    case 'save-as':       saveAs(); break;
    case 'close-tab':     if (state.activeTabId) closeTab(state.activeTabId); break;
    case 'find':          openFindBar(false); break;
    case 'replace':       openFindBar(true); break;
    case 'format-json':   formatJSON(); break;
    case 'toggle-comment':state.cm?.execCommand('toggleComment'); break;
    case 'toggle-preview':togglePreview(); break;
    case 'toggle-terminal': {
      const tc = $('#terminal-container');
      if (tc.classList.contains('visible')) {
        tc.classList.remove('visible');
        $('#terminal-resizer').style.display = 'none';
      } else {
        if (state.terminalSessions.length === 0) createTerminalSession();
        else ensureTerminalVisible();
      }
      break;
    }
    case 'toggle-sidebar': {
      const sb = $('#sidebar');
      const sr = $('#sidebar-resizer');
      if (sb.style.display === 'none') { sb.style.display = ''; sr.style.display = ''; }
      else { sb.style.display = 'none'; sr.style.display = 'none'; }
      break;
    }
    case 'zoom-in':    setFontSize(state.fontSize + 1); break;
    case 'zoom-out':   setFontSize(state.fontSize - 1); break;
    case 'zoom-reset': setFontSize(13.5); break;
    case 'run-script': runCurrentFile(); break;
    case 'run-selection': runSelection(); break;
    case 'run-curl': {
      const sel = state.cm?.getSelection().trim();
      if (sel) executeCurl(sel);
      else showToast('请先选中 curl 命令', 'info');
      break;
    }
    case 'stop-process':
      showToast('停止功能需要进程 PID 管理，当前版本暂不支持强制 kill', 'info');
      break;
  }
}

// ── 拖拽分隔线 ────────────────────────────────

function makeSidebarResizer() {
  const resizer = $('#sidebar-resizer');
  const sidebar = $('#sidebar');
  let startX, startW;

  resizer.addEventListener('mousedown', e => {
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    resizer.classList.add('dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    const w = Math.min(480, Math.max(140, startW + e.clientX - startX));
    sidebar.style.width = w + 'px';
    document.documentElement.style.setProperty('--sidebar-width', w + 'px');
  }
  function onUp() {
    resizer.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
}

function makePreviewResizer() {
  const resizer = $('#preview-resizer');
  const preview = $('#preview-panel');
  let startX, startW;

  resizer.addEventListener('mousedown', e => {
    startX = e.clientX;
    startW = preview.offsetWidth;
    resizer.classList.add('dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    const total = $('#editor-preview').offsetWidth;
    const newW = Math.min(total * 0.8, Math.max(200, startW - (e.clientX - startX)));
    preview.style.width = newW + 'px';
  }
  function onUp() {
    resizer.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
}

function makeTerminalResizer() {
  const resizer   = $('#terminal-resizer');
  const terminal  = $('#terminal-container');
  let startY, startH;

  resizer.addEventListener('mousedown', e => {
    startY = e.clientY;
    startH = terminal.offsetHeight;
    resizer.classList.add('dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    const h = Math.min(600, Math.max(80, startH - (e.clientY - startY)));
    terminal.style.height = h + 'px';
  }
  function onUp() {
    resizer.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
}

// ── 所有 DOM 事件绑定（在 DOMContentLoaded 后统一注册）────

function bindEvents() {
  // 右键菜单
  $('#context-menu').addEventListener('click', async e => {
    const item = e.target.closest('[data-ctx]');
    if (!item) return;
    const action = item.dataset.ctx;
    const target = state.contextMenuTarget;
    $('#context-menu').classList.remove('open');

    if (action === 'open' && target) {
      await openFile(target.path);
    } else if (action === 'rename' && target) {
      startRename(target);
    } else if (action === 'delete' && target) {
      const ok = await confirmDialog(`确认删除 "${target.name}"？此操作不可撤销。`);
      if (ok) {
        await invoke('delete_path', { path: target.path });
        await refreshFileTree();
        showToast('已删除', 'info', 1500);
      }
    } else if (action === 'new-file-here' && target) {
      promptNewFile(target.path);
    } else if (action === 'new-folder-here' && target) {
      promptNewFolder(target.path);
    }
  });

  // curl 浮窗点击
  $('#curl-tooltip').addEventListener('click', async () => {
    const sel = state.cm.getSelection().trim();
    if (!sel) return;
    $('#curl-tooltip').classList.remove('visible');
    await executeCurl(sel);
  });

  // 查找替换工具栏
  $('#find-input').addEventListener('input', e => doFind(e.target.value));
  $('#find-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); findNext($('#find-input').value); }
    if (e.key === 'Escape') closeFindBar();
  });
  $('#btn-find-next').addEventListener('click', () => findNext($('#find-input').value));
  $('#btn-find-prev').addEventListener('click', () => findPrev($('#find-input').value));
  $('#btn-replace-one').addEventListener('click', () => replaceOne($('#find-input').value, $('#replace-input').value));
  $('#btn-replace-all').addEventListener('click', () => replaceAll($('#find-input').value, $('#replace-input').value));
  $('#btn-find-close').addEventListener('click', closeFindBar);

  // 菜单栏
  $$('.menu-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const cmd = e.target.closest('[data-action]');
      if (cmd) {
        $$('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
        dispatchMenuAction(cmd.dataset.action);
        return;
      }
      const dropdown = item.querySelector('.dropdown-menu');
      $$('.dropdown-menu.open').forEach(m => { if (m !== dropdown) m.classList.remove('open'); });
      dropdown.classList.toggle('open');
    });
  });

  // 点击空白关闭菜单/tooltip
  document.addEventListener('click', () => {
    $$('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    $('#context-menu').classList.remove('open');
    $('#curl-tooltip').classList.remove('visible');
  });

  // 全局快捷键
  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    if (e.key === 's' && !e.shiftKey) { e.preventDefault(); saveCurrentFile(); }
    else if (e.key === 's' && e.shiftKey) { e.preventDefault(); saveAs(); }
    else if (e.key === 'o' && !e.shiftKey) { e.preventDefault(); cmdOpenFile(); }
    else if (e.key === 'O' && e.shiftKey) { e.preventDefault(); cmdOpenFolder(); }
    else if (e.key === 'n') { e.preventDefault(); openUntitledTab(); }
    else if (e.key === 'w') { e.preventDefault(); if (state.activeTabId) closeTab(state.activeTabId); }
    else if (e.key === 'f') { e.preventDefault(); openFindBar(false); }
    else if (e.key === 'h') { e.preventDefault(); openFindBar(true); }
    else if (e.key === 'F' && e.shiftKey) { e.preventDefault(); formatJSON(); }
    else if (e.key === 'P' && e.shiftKey) { e.preventDefault(); togglePreview(); }
    else if (e.key === '`') { e.preventDefault(); dispatchMenuAction('toggle-terminal'); }
    else if (e.key === 'b') { e.preventDefault(); dispatchMenuAction('toggle-sidebar'); }
    else if (e.key === '=' || e.key === '+') { e.preventDefault(); setFontSize(state.fontSize + 1); }
    else if (e.key === '-') { e.preventDefault(); setFontSize(state.fontSize - 1); }
    else if (e.key === '0') { e.preventDefault(); setFontSize(13.5); }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runCurrentFile(); }
    else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); runSelection(); }
  });

  // 侧边栏按钮
  $('#btn-open-folder-sidebar').addEventListener('click', cmdOpenFolder);
  const linkOpenFolder = $('#link-open-folder');
  if (linkOpenFolder) linkOpenFolder.addEventListener('click', cmdOpenFolder);
  $('#btn-refresh').addEventListener('click', refreshFileTree);
  $('#btn-new-file').addEventListener('click', () => {
    if (state.workspaceRoot) promptNewFile(state.workspaceRoot);
    else openUntitledTab();
  });
  $('#btn-new-folder').addEventListener('click', () => {
    if (state.workspaceRoot) promptNewFolder(state.workspaceRoot);
    else showToast('请先打开一个文件夹', 'info');
  });
  $('#btn-new-term').addEventListener('click', createTerminalSession);
  $('#btn-term-clear').addEventListener('click', () => {
    const session = state.terminalSessions.find(s => s.id === state.activeTerminalId);
    if (session) { session.lines = []; renderTerminalOutput(); }
  });
  $('#btn-term-hide').addEventListener('click', () => {
    $('#terminal-container').classList.remove('visible');
    $('#terminal-resizer').style.display = 'none';
  });

  // 拖放文件到编辑器
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', async e => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    for (const file of files) {
      if (file.path) await openFile(file.path);
    }
  });
}

// ── 初始化入口 ────────────────────────────────

function init() {
  initCodeMirror();
  makeSidebarResizer();
  makePreviewResizer();
  makeTerminalResizer();
  bindEvents();

  state.cm.on('cursorActivity', () => setTimeout(updateCurlTooltip, 50));
}

document.addEventListener('DOMContentLoaded', init);
