import { create } from 'zustand'
import type { Tab, TerminalSession, FileEntry, FindState, ContextMenuTarget } from '../types'

// 全局 UI 状态（非持久化）
interface UIState {
  sidebarVisible: boolean
  terminalVisible: boolean
  previewVisible: boolean
  sidebarWidth: number
  terminalHeight: number
  previewWidth: number
  isLoading: boolean
  toastQueue: Array<{ id: string; msg: string; type: 'success' | 'error' | 'info'; duration: number }>
  modalState: {
    isOpen: boolean
    title: string
    label: string
    defaultVal: string
    confirmText: string
    onConfirm: ((val: string) => void) | null
  }
  fileSearchOpen: boolean
  shortcutsOpen: boolean
  commandPaletteOpen: boolean
  globalSearchOpen: boolean
}

// 主状态（对应原 main.js 的 state 对象）
interface AppState {
  // 标签页
  tabs: Tab[]
  activeTabId: string | null

  // 工作区
  workspaceRoot: string | null
  fileTree: FileEntry[]
  fileTreeOrder: Record<string, string[]>
  selectedFolder: string | null
  selectedFilePath: string | null  // 当前选中的文件路径（用于文件树高亮）

  // 编辑器
  fontSize: number

  // 终端
  terminalSessions: TerminalSession[]
  activeTerminalId: string | null
  pendingProcessIds: Set<string>

  // 右键菜单
  contextMenuTarget: ContextMenuTarget | null

  // 查找栏
  findState: FindState

  // UI 状态
  ui: UIState
}

// Actions
interface AppActions {
  // Tab 操作
  setTabs: (tabs: Tab[]) => void
  setActiveTabId: (id: string | null) => void
  updateTab: (id: string, updates: Partial<Tab>) => void
  addTab: (tab: Tab) => void
  addTabAndActivate: (tab: Tab) => void
  removeTab: (id: string) => void

  // 工作区
  setWorkspaceRoot: (root: string | null) => void
  setFileTree: (tree: FileEntry[]) => void
  setFileTreeOrder: (order: Record<string, string[]>) => void
  setSelectedFolder: (path: string | null) => void
  setSelectedFilePath: (path: string | null) => void

  // 编辑器
  setFontSize: (size: number) => void

  // 终端
  setTerminalSessions: (sessions: TerminalSession[]) => void
  setActiveTerminalId: (id: string | null) => void
  addTerminalSession: (session: TerminalSession) => void
  removeTerminalSession: (id: string) => void
  updateTerminalSession: (id: string, updates: Partial<TerminalSession>) => void
  addPendingProcess: (id: string) => void
  removePendingProcess: (id: string) => void

  // 右键菜单
  setContextMenuTarget: (target: ContextMenuTarget | null) => void

  // 查找栏
  setFindState: (state: Partial<FindState>) => void

  // UI
  setSidebarVisible: (v: boolean) => void
  setTerminalVisible: (v: boolean) => void
  setPreviewVisible: (v: boolean) => void
  setSidebarWidth: (w: number) => void
  setTerminalHeight: (h: number) => void
  setPreviewWidth: (w: number) => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info', duration?: number) => void
  dismissToast: (id: string) => void
  showModal: (opts: { title: string; label: string; defaultVal?: string; confirmText?: string; onConfirm: (val: string) => void }) => void
  closeModal: () => void
  setFileSearchOpen: (v: boolean) => void
  setShortcutsOpen: (v: boolean) => void
  setCommandPaletteOpen: (v: boolean) => void
  setGlobalSearchOpen: (v: boolean) => void
}

type Store = AppState & AppActions

const defaultFindState: FindState = {
  query: '',
  replaceQuery: '',
  matches: 0,
  currentMatch: 0,
  isOpen: false,
  withReplace: false,
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
}

const defaultUIState: UIState = {
  sidebarVisible: true,
  terminalVisible: false,
  previewVisible: false,
  sidebarWidth: 240,
  terminalHeight: 220,
  previewWidth: 400,
  isLoading: false,
  toastQueue: [],
  modalState: {
    isOpen: false,
    title: '',
    label: '',
    defaultVal: '',
    confirmText: '确认',
    onConfirm: null,
  },
  fileSearchOpen: false,
  shortcutsOpen: false,
  commandPaletteOpen: false,
  globalSearchOpen: false,
}

export const useStore = create<Store>((set, get) => ({
  // 初始状态
  tabs: [],
  activeTabId: null,
  workspaceRoot: null,
  fileTree: [],
  fileTreeOrder: {},
  selectedFolder: null,
  selectedFilePath: null,
  fontSize: 13.5,
  terminalSessions: [],
  activeTerminalId: null,
  pendingProcessIds: new Set<string>(),
  contextMenuTarget: null,
  findState: defaultFindState,
  ui: defaultUIState,

  // Tab actions
  setTabs: (tabs) => set({ tabs }),
  setActiveTabId: (id) => {
    const state = get()
    const activeTab = state.tabs.find((t) => t.id === id)
    set({ activeTabId: id, selectedFilePath: activeTab?.path ?? null })
  },
  updateTab: (id, updates) => set((state) => ({
    tabs: state.tabs.map((t) => t.id === id ? { ...t, ...updates } : t),
  })),
  addTab: (tab) => set((state) => {
    let newTab = tab
    if (state.tabs.some((t) => t.id === tab.id)) {
      newTab = { ...tab, id: `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` }
    }
    return { tabs: [...state.tabs, newTab] }
  }),
  addTabAndActivate: (tab) => set((state) => {
    let newTab = tab
    if (state.tabs.some((t) => t.id === tab.id)) {
      newTab = { ...tab, id: `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` }
    }
    return {
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
      selectedFilePath: newTab.path ?? null,
    }
  }),
  removeTab: (id) => set((state) => {
    const idx = state.tabs.findIndex((t) => t.id === id)
    const newTabs = state.tabs.filter((t) => t.id !== id)
    let newActiveId = state.activeTabId
    let newSelectedPath = state.selectedFilePath
    if (state.activeTabId === id) {
      const next = newTabs[idx] ?? newTabs[idx - 1] ?? null
      newActiveId = next?.id ?? null
      newSelectedPath = next?.path ?? null
    }
    return { tabs: newTabs, activeTabId: newActiveId, selectedFilePath: newSelectedPath }
  }),

  // 工作区 actions
  setWorkspaceRoot: (root) => set({ workspaceRoot: root }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setFileTreeOrder: (order) => set({ fileTreeOrder: order }),
  setSelectedFolder: (path) => set({ selectedFolder: path }),
  setSelectedFilePath: (path) => set({ selectedFilePath: path }),

  // 编辑器 actions
  setFontSize: (size) => set({ fontSize: size }),

  // 终端 actions
  setTerminalSessions: (sessions) => set({ terminalSessions: sessions }),
  setActiveTerminalId: (id) => set({ activeTerminalId: id }),
  addTerminalSession: (session) => set((state) => ({
    terminalSessions: [...state.terminalSessions, session],
  })),
  removeTerminalSession: (id) => set((state) => ({
    terminalSessions: state.terminalSessions.filter((s) => s.id !== id),
  })),
  updateTerminalSession: (id, updates) => set((state) => ({
    terminalSessions: state.terminalSessions.map((s) => s.id === id ? { ...s, ...updates } : s),
  })),
  addPendingProcess: (id) => set((state) => {
    const next = new Set(state.pendingProcessIds)
    next.add(id)
    return { pendingProcessIds: next }
  }),
  removePendingProcess: (id) => set((state) => {
    const next = new Set(state.pendingProcessIds)
    next.delete(id)
    return { pendingProcessIds: next }
  }),

  // 右键菜单 actions
  setContextMenuTarget: (target) => set({ contextMenuTarget: target }),

  // 查找栏 actions
  setFindState: (partial) => set((state) => ({
    findState: { ...state.findState, ...partial },
  })),

  // UI actions
  setSidebarVisible: (v) => set((state) => ({ ui: { ...state.ui, sidebarVisible: v } })),
  setTerminalVisible: (v) => set((state) => ({ ui: { ...state.ui, terminalVisible: v } })),
  setPreviewVisible: (v) => set((state) => ({ ui: { ...state.ui, previewVisible: v } })),
  setSidebarWidth: (w) => set((state) => ({ ui: { ...state.ui, sidebarWidth: w } })),
  setTerminalHeight: (h) => set((state) => ({ ui: { ...state.ui, terminalHeight: h } })),
  setPreviewWidth: (w) => set((state) => ({ ui: { ...state.ui, previewWidth: w } })),
  showToast: (msg, type = 'info', duration = 2500) => set((state) => ({
    ui: {
      ...state.ui,
      toastQueue: [...state.ui.toastQueue, { id: Date.now().toString(), msg, type, duration }],
    },
  })),
  dismissToast: (id) => set((state) => ({
    ui: {
      ...state.ui,
      toastQueue: state.ui.toastQueue.filter((t) => t.id !== id),
    },
  })),
  showModal: (opts) => set((state) => ({
    ui: {
      ...state.ui,
      modalState: {
        isOpen: true,
        title: opts.title,
        label: opts.label,
        defaultVal: opts.defaultVal ?? '',
        confirmText: opts.confirmText ?? '确认',
        onConfirm: opts.onConfirm,
      },
    },
  })),
  closeModal: () => set((state) => ({
    ui: {
      ...state.ui,
      modalState: { ...state.ui.modalState, isOpen: false, onConfirm: null },
    },
  })),
  setFileSearchOpen: (v) => set((state) => ({ ui: { ...state.ui, fileSearchOpen: v } })),
  setShortcutsOpen: (v) => set((state) => ({ ui: { ...state.ui, shortcutsOpen: v } })),
  setCommandPaletteOpen: (v) => set((state) => ({ ui: { ...state.ui, commandPaletteOpen: v } })),
  setGlobalSearchOpen: (v) => set((state) => ({ ui: { ...state.ui, globalSearchOpen: v } })),
}))

// 便捷 selector hooks
export const useTabs = () => useStore((s) => s.tabs)
export const useActiveTab = () => useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
export const useWorkspaceRoot = () => useStore((s) => s.workspaceRoot)
export const useFileTree = () => useStore((s) => s.fileTree)
export const useTerminalSessions = () => useStore((s) => s.terminalSessions)
export const useActiveTerminalSession = () => useStore((s) => s.terminalSessions.find((t) => t.id === s.activeTerminalId) ?? null)
export const useFindState = () => useStore((s) => s.findState)
export const useUI = () => useStore((s) => s.ui)