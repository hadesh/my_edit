/**
 * App.tsx - React 根组件
 * 负责：整体布局、可拖拽 Resizer、全局事件路由
 *
 * 布局：TitleBar(顶部) + TabsBar + 主区域(Sidebar | Editor+FindBar | PreviewPanel) + Terminal(底部可折叠) + StatusBar(最底部)
 */

import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useStore, useActiveTab, useTabs, useWorkspaceRoot, useFindState } from './store'
import { TitleBar } from './components/TitleBar/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { TabsBar } from './components/TabsBar/TabsBar'
import Editor from './components/Editor/Editor'
import type { EditorRef } from './components/Editor/Editor'
import { FindBar } from './components/FindBar/FindBar'
import { Terminal } from './components/Terminal/Terminal'
import { PreviewPanel } from './components/PreviewPanel/PreviewPanel'
import { StatusBar } from './components/StatusBar/StatusBar'
import { FileSearchOverlay } from './components/FileSearchOverlay/FileSearchOverlay'
import { ShortcutsOverlay } from './components/ShortcutsOverlay/ShortcutsOverlay'
import { ContextMenu } from './components/ContextMenu/ContextMenu'
import { TabContextMenu } from './components/TabsBar/TabContextMenu'
import {
  readFile,
  readFileBase64,
  writeFile,
  readDirTree,
  exitApp,
  getFileInfo,
} from './hooks/useIPC'
import { useTauriEvent } from './hooks/useTauriEvent'
import { useSession } from './hooks/useSession'
import { writeDraft, deleteDraft, newDraftId } from './hooks/useDraft'
import type { Tab, FileEntry, ImageData } from './types'
import { getExtension, getLanguageName } from './utils/langUtils'
import styles from './App.module.css'

// ─────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────

let uid = 0
const nextId = () => `id_${++uid}`

/** 从路径提取文件名 */
function basename(path: string): string {
  return path.split('/').pop() || path
}

/** 判断是否为图片文件 */
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'tiff', 'tif', 'avif'])
function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTS.has(ext)
}

// ─────────────────────────────────────────────────────────
// Resizer 组件
// ─────────────────────────────────────────────────────────

interface ResizerProps {
  type: 'vertical' | 'horizontal'
  onDrag: (delta: number) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  visible?: boolean
  className?: string
}

function Resizer({ type, onDrag, onDragStart, onDragEnd, visible = true, className }: ResizerProps) {
  const [dragging, setDragging] = useState(false)
  const startPosRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startPosRef.current = type === 'vertical' ? e.clientX : e.clientY
    setDragging(true)
    onDragStart?.()
  }, [type, onDragStart])

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = type === 'vertical' ? e.clientX : e.clientY
      const delta = currentPos - startPosRef.current
      onDrag(delta)
      startPosRef.current = currentPos // 更新起始位置，使 delta 为增量而非累计
    }

    const handleMouseUp = () => {
      setDragging(false)
      onDragEnd?.()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, type, onDrag, onDragEnd])

  if (!visible) return null

  const resizerClass =
    type === 'vertical'
      ? `${styles.resizer} ${dragging ? styles.resizerDragging : ''} ${className || ''}`
      : `${styles.resizerH} ${dragging ? styles.resizerDragging : ''} ${className || ''}`

  return (
    <div
      className={resizerClass}
      onMouseDown={handleMouseDown}
      style={{ cursor: type === 'vertical' ? 'col-resize' : 'row-resize' }}
    />
  )
}

// ─────────────────────────────────────────────────────────
// Toast 容器组件
// ─────────────────────────────────────────────────────────

function ToastContainer() {
  const toastQueue = useStore((s) => s.ui.toastQueue)
  const dismissToast = useStore((s) => s.dismissToast)

  useEffect(() => {
    toastQueue.forEach((toast) => {
      const timer = setTimeout(() => {
        dismissToast(toast.id)
      }, toast.duration)
      return () => clearTimeout(timer)
    })
  }, [toastQueue, dismissToast])

  return (
    <div className={styles.toastContainer}>
      {toastQueue.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}
        >
          {toast.msg}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Modal 组件
// ─────────────────────────────────────────────────────────

function ModalOverlay() {
  const modalState = useStore((s) => s.ui.modalState)
  const closeModal = useStore((s) => s.closeModal)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (modalState.isOpen && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [modalState.isOpen])

  if (!modalState.isOpen) return null

  const handleConfirm = () => {
    const value = inputRef.current?.value.trim() || ''
    if (modalState.onConfirm) {
      modalState.onConfirm(value)
    }
    closeModal()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      closeModal()
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>{modalState.title}</h3>
        <label>{modalState.label}</label>
        <input
          ref={inputRef}
          type="text"
          defaultValue={modalState.defaultVal}
          onKeyDown={handleKeyDown}
          onBlur={(e) => e.target.focus()}
        />
        <div className={styles.modalBtns}>
          <button className={styles.btnGhost} onClick={closeModal}>
            取消
          </button>
          <button className={styles.btnPrimary} onClick={handleConfirm}>
            {modalState.confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ConfirmCloseDialog 组件
// ─────────────────────────────────────────────────────────

function ConfirmCloseDialog() {
  const [pendingTabId, setPendingTabId] = useState<string | null>(null)
  const tabs = useTabs()
  const removeTab = useStore((s) => s.removeTab)

  useEffect(() => {
    const handler = (e: CustomEvent<string>) => {
      setPendingTabId(e.detail)
    }
    window.addEventListener('confirm-close-tab', handler as EventListener)
    return () => window.removeEventListener('confirm-close-tab', handler as EventListener)
  }, [])

  if (!pendingTabId) return null

  const tab = tabs.find((t) => t.id === pendingTabId)
  if (!tab) {
    setPendingTabId(null)
    return null
  }

  const handleConfirm = async () => {
    // 保存文件（如果有路径）
    if (tab.path && !tab.isImage) {
      try {
        await writeFile(tab.path, tab.content)
        // 已落盘到真实文件,清掉草稿
        await deleteDraft(tab.draftId)
      } catch (err) {
        console.error('保存失败:', err)
      }
    }
    removeTab(pendingTabId)
    setPendingTabId(null)
  }

  const handleDiscard = () => {
    // 用户主动放弃修改,删除对应草稿(避免污染缓存目录)
    deleteDraft(tab.draftId)
    removeTab(pendingTabId)
    setPendingTabId(null)
  }

  const handleCancel = () => {
    setPendingTabId(null)
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>关闭未保存的文件</h3>
        <p style={{ marginBottom: 16, fontSize: 13 }}>
          "{tab.title}" 有未保存的更改，是否保存？
        </p>
        <div className={styles.modalBtns}>
          <button className={styles.btnGhost} onClick={handleCancel}>
            取消
          </button>
          <button className={styles.btnDanger} onClick={handleDiscard}>
            不保存
          </button>
          <button className={styles.btnPrimary} onClick={handleConfirm}>
            保存并关闭
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// App 主组件
// ─────────────────────────────────────────────────────────

export default function App() {
  // Store 状态
  const store = useStore()
  const activeTab = useActiveTab()
  const tabs = useTabs()
  const workspaceRoot = useWorkspaceRoot()
  const findState = useFindState()

  // Editor ref
  const editorRef = useRef<EditorRef>(null)

  // Session 持久化
  const { restoreSession, triggerSaveSession } = useSession()

  // UI 状态
  const sidebarVisible = useStore((s) => s.ui.sidebarVisible)
  const sidebarWidth = useStore((s) => s.ui.sidebarWidth)
  const terminalVisible = useStore((s) => s.ui.terminalVisible)
  const terminalHeight = useStore((s) => s.ui.terminalHeight)
  const previewVisible = useStore((s) => s.ui.previewVisible)
  const previewWidth = useStore((s) => s.ui.previewWidth)

  // Actions
  const setSidebarWidth = useStore((s) => s.setSidebarWidth)
  const setSidebarVisible = useStore((s) => s.setSidebarVisible)
  const setTerminalHeight = useStore((s) => s.setTerminalHeight)
  const setTerminalVisible = useStore((s) => s.setTerminalVisible)
  const setPreviewWidth = useStore((s) => s.setPreviewWidth)
  const setPreviewVisible = useStore((s) => s.setPreviewVisible)
  const setFindState = useStore((s) => s.setFindState)
  const setActiveTabId = useStore((s) => s.setActiveTabId)
  const addTab = useStore((s) => s.addTab)
  const addTabAndActivate = useStore((s) => s.addTabAndActivate)
  const setWorkspaceRoot = useStore((s) => s.setWorkspaceRoot)
  const setFileTree = useStore((s) => s.setFileTree)
  const setFileTreeOrder = useStore((s) => s.setFileTreeOrder)
  const showToast = useStore((s) => s.showToast)
  const showModal = useStore((s) => s.showModal)

  // ── 保存辅助 ─────────────────────────────────────────
  const saveAsDialog = useCallback(async () => {
    if (!activeTab || activeTab.isImage) return
    try {
      const filePath = await (window as any).__TAURI__.dialog.save({
        defaultPath: activeTab.title,
        filters: [{ name: '所有文件', extensions: ['*'] }],
      })
      if (filePath) {
        await writeFile(filePath, activeTab.content)
        store.updateTab(activeTab.id, {
          path: filePath,
          title: basename(filePath),
          dirty: false,
          savedContent: activeTab.content,
        })
        // 内容已落盘到真实文件,清掉草稿(draftId 保留以备后续修改复用)
        deleteDraft(activeTab.draftId)
        showToast('已保存', 'success')
      }
    } catch (err) {
      showToast(`另存为失败: ${err}`, 'error')
    }
  }, [activeTab, store, showToast])

  // ── Resizer 处理 ───────────────────────────────────────

  const handleSidebarResizerDrag = useCallback(
    (delta: number) => {
      const newWidth = Math.min(500, Math.max(120, sidebarWidth + delta))
      setSidebarWidth(newWidth)
    },
    [sidebarWidth, setSidebarWidth]
  )

  const handleTerminalResizerDrag = useCallback(
    (delta: number) => {
      // 向上拖动增大高度（delta 为负时增大）
      const newHeight = Math.min(600, Math.max(80, terminalHeight - delta))
      setTerminalHeight(newHeight)
    },
    [terminalHeight, setTerminalHeight]
  )

  const handlePreviewResizerDrag = useCallback(
    (delta: number) => {
      // 向左拖动增大宽度（delta 为负时增大）
      const newWidth = Math.max(200, previewWidth - delta)
      setPreviewWidth(newWidth)
    },
    [previewWidth, setPreviewWidth]
  )

  // ── 打开文件处理 ───────────────────────────────────────

  const openFile = useCallback(
    async (filePath: string) => {
      try {
        // 检查是否已打开
        const existing = tabs.find((t) => t.path === filePath)
        if (existing) {
          setActiveTabId(existing.id)
          return
        }

        // 图片文件
        if (isImageFile(filePath)) {
          const imageData = await readFileBase64(filePath)
          const tab: Tab = {
            id: nextId(),
            path: filePath,
            title: basename(filePath),
            content: '',
            savedContent: '',
            dirty: false,
            scrollInfo: null,
            cursorPos: { line: 0, ch: 0 },
            isImage: true,
            imageData,
            draftId: newDraftId(),
          }
          addTabAndActivate(tab)
          return
        }

        // 文本文件
        const content = await readFile(filePath)
        const tab: Tab = {
          id: nextId(),
          path: filePath,
          title: basename(filePath),
          content,
          savedContent: content,
          dirty: false,
          scrollInfo: null,
          cursorPos: { line: 0, ch: 0 },
          isImage: false,
          draftId: newDraftId(),
        }
        addTabAndActivate(tab)

        // 外部文件提示
        const isExternal = workspaceRoot &&
          !filePath.startsWith(workspaceRoot + '/') &&
          filePath !== workspaceRoot
        if (isExternal) {
          showToast('文件在工作区外，仅在编辑器中打开', 'info')
        }
      } catch (err) {
        showToast(`打开失败: ${err}`, 'error')
      }
    },
    [tabs, setActiveTabId, addTabAndActivate, workspaceRoot, showToast]
  )

  // ── 打开文件夹处理 ─────────────────────────────────────

  const loadWorkspace = useCallback(
    async (folderPath: string, persist = true) => {
      setWorkspaceRoot(folderPath)
      try {
        const tree = await readDirTree(folderPath)
        setFileTree(tree)
        if (persist) {
          triggerSaveSession()
        }
      } catch (err) {
        showToast(`打开文件夹失败: ${err}`, 'error')
      }
    },
    [setWorkspaceRoot, setFileTree, showToast, triggerSaveSession]
  )

  // ── CustomEvent 监听 ─────────────────────────────────────

  useEffect(() => {
    const handleOpenFile = (e: CustomEvent) => {
      const detail = e.detail
      const path = typeof detail === 'string' ? detail : detail?.path
      if (path) openFile(path)
    }

    const handleMenuAction = async (e: CustomEvent<string>) => {
      const action = e.detail

      switch (action) {
        case 'new-file':
          // 新建未命名文件
          const untitledCount = tabs.filter((t) => !t.path).length + 1
          const newTab: Tab = {
            id: nextId(),
            path: null,
            title: `未命名 ${untitledCount}`,
            content: '',
            savedContent: '',
            dirty: false,
            scrollInfo: null,
            cursorPos: { line: 0, ch: 0 },
            isImage: false,
            draftId: newDraftId(),
          }
          addTabAndActivate(newTab)
          break

        case 'new-folder':
          if (workspaceRoot) {
            showModal({
              title: '新建文件夹',
              label: '文件夹名',
              onConfirm: async (name) => {
                if (!name) return
                // TODO: 调用 IPC createDir
                showToast('新建文件夹功能待实现', 'info')
              },
            })
          } else {
            showToast('请先打开一个文件夹', 'info')
          }
          break

        case 'open-file':
          // 通过 Tauri dialog 打开文件
          try {
            const selected = await (window as any).__TAURI__.dialog.open({
              multiple: false,
              filters: [
                { name: '所有文件', extensions: ['*'] },
                { name: '文本', extensions: ['txt', 'md', 'json', 'js', 'ts', 'py', 'rs', 'html', 'css', 'sh', 'yaml', 'toml'] },
              ],
            })
            if (selected) {
              await openFile(selected)
            }
          } catch (err) {
            showToast(`打开文件对话框失败: ${err}`, 'error')
          }
          break

        case 'open-folder':
          try {
            const selected = await (window as any).__TAURI__.dialog.open({ directory: true })
            if (selected) {
              await loadWorkspace(selected)
            }
          } catch (err) {
            showToast(`打开文件夹对话框失败: ${err}`, 'error')
          }
          break

        case 'toggle-sidebar':
          setSidebarVisible(!sidebarVisible)
          break

        case 'toggle-terminal':
          setTerminalVisible(!terminalVisible)
          break

        case 'toggle-preview':
          if (activeTab?.path) {
            const ext = getExtension(activeTab.path)
            if (['md', 'markdown', 'json'].includes(ext)) {
              setPreviewVisible(!previewVisible)
              // 触发预览更新
              window.dispatchEvent(
                new CustomEvent('preview-update', {
                  detail: {
                    content: activeTab.content,
                    language: ext === 'json' ? 'json' : 'markdown',
                  },
                })
              )
            } else {
              showToast('当前文件类型不支持预览（支持 .md / .json）', 'info')
            }
          } else {
            showToast('请先打开一个文件', 'info')
          }
          break

        case 'zoom-in':
          store.setFontSize(Math.min(28, store.fontSize + 1))
          break

        case 'zoom-out':
          store.setFontSize(Math.max(8, store.fontSize - 1))
          break

        case 'zoom-reset':
          store.setFontSize(13.5)
          break

        case 'show-shortcuts':
          store.setShortcutsOpen(true)
          break

        case 'save':
          if (activeTab && !activeTab.isImage) {
            if (activeTab.path) {
              try {
                await writeFile(activeTab.path, activeTab.content)
                store.updateTab(activeTab.id, { dirty: false, savedContent: activeTab.content })
                deleteDraft(activeTab.draftId)
                showToast('已保存', 'success')
              } catch (err) {
                showToast(`保存失败: ${err}`, 'error')
              }
            } else {
              await saveAsDialog()
            }
          }
          break

        case 'save-as':
          await saveAsDialog()
          break

        case 'close-tab':
          if (store.activeTabId) {
            const tab = tabs.find((t) => t.id === store.activeTabId)
            if (tab?.dirty) {
              window.dispatchEvent(new CustomEvent('confirm-close-tab', { detail: store.activeTabId }))
            } else {
              store.removeTab(store.activeTabId)
            }
          }
          break

        case 'find': {
          const selF = editorRef.current?.getSelection() || ''
          setFindState({ isOpen: true, withReplace: false, ...(selF ? { query: selF } : {}) })
          break
        }

        case 'replace': {
          const selR = editorRef.current?.getSelection() || ''
          setFindState({ isOpen: true, withReplace: true, ...(selR ? { query: selR } : {}) })
          break
        }

        case 'file-search':
          store.setFileSearchOpen(true)
          break

        case 'format-json':
        case 'toggle-comment':
          break

        case 'run-script':
          if (activeTab?.path) {
            const ext = getExtension(activeTab.path)
            if (['py', 'js', 'mjs', 'ts'].includes(ext)) {
              if (activeTab.dirty && activeTab.path) {
                try {
                  await writeFile(activeTab.path, activeTab.content)
                  store.updateTab(activeTab.id, { dirty: false, savedContent: activeTab.content })
                  deleteDraft(activeTab.draftId)
                } catch (err) {
                  showToast(`保存失败: ${err}`, 'error')
                  break
                }
              }
              window.dispatchEvent(
                new CustomEvent('terminal-action', {
                  detail: { type: 'run-file', filePath: activeTab.path, language: ext },
                })
              )
            } else {
              showToast('只支持运行 .py / .js / .ts 文件', 'info')
            }
          }
          break

        case 'run-selection':
          window.dispatchEvent(new CustomEvent('terminal-action', { detail: { type: 'run-selection' } }))
          break

        case 'run-curl': {
          const sel = editorRef.current?.getSelection()?.trim()
          if (sel && (sel.startsWith('curl ') || sel.startsWith('curl\n'))) {
            const normalized = sel.replace(/\\\n\s*/g, ' ').replace(/\n\s*/g, ' ').trim()
            window.dispatchEvent(
              new CustomEvent('terminal-action', {
                detail: { type: 'execute-curl', curl: normalized },
              })
            )
          } else {
            showToast('请先选中 curl 命令', 'info')
          }
          break
        }

        case 'stop-process':
          showToast('停止功能需要进程 PID 管理，当前版本暂不支持强制 kill', 'info')
          break
      }
    }

    const handleSaveSession = () => {
      triggerSaveSession()
    }

    window.addEventListener('open-file', handleOpenFile as unknown as EventListener)
    window.addEventListener('menu-action', handleMenuAction as unknown as EventListener)
    window.addEventListener('save-session', handleSaveSession as unknown as EventListener)

    return () => {
      window.removeEventListener('open-file', handleOpenFile as unknown as EventListener)
      window.removeEventListener('menu-action', handleMenuAction as unknown as EventListener)
      window.removeEventListener('save-session', handleSaveSession as unknown as EventListener)
    }
  }, [
    openFile,
    loadWorkspace,
    sidebarVisible,
    terminalVisible,
    previewVisible,
    activeTab,
    workspaceRoot,
    tabs,
    store,
    setSidebarVisible,
    setTerminalVisible,
    setPreviewVisible,
    addTabAndActivate,
    setActiveTabId,
    triggerSaveSession,
    showModal,
    showToast,
    setFindState,
    saveAsDialog,
  ])

  // ── Tauri 事件监听 ───────────────────────────────────────

  // 窗口关闭请求（点击关闭按钮）
  useTauriEvent<void>(
    'tauri://close-requested',
    useCallback(async () => {
      await triggerSaveSession()
      // 销毁窗口
      ;(window as any).__TAURI__.window.getCurrentWindow().destroy()
    }, [triggerSaveSession])
  )

  // Cmd+Q 退出请求
  useTauriEvent<void>(
    'exit-requested',
    useCallback(async () => {
      await triggerSaveSession()
      await exitApp()
    }, [triggerSaveSession])
  )

  // 从 Finder 拖放文件/文件夹
  useTauriEvent<{ paths?: string[] }>(
    'tauri://drag-drop',
    useCallback(async (payload) => {
      const paths = payload?.paths
      if (!paths?.length) return
      for (const p of paths) {
        try {
          const info = await getFileInfo(p)
          if (info.is_dir) {
            await loadWorkspace(p)
          } else {
            await openFile(p)
          }
        } catch (err) {
          showToast(`拖放打开失败: ${err}`, 'error')
        }
      }
    }, [openFile, loadWorkspace, showToast])
  )

  // ── 全局键盘快捷键 ───────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      // Escape 处理
      if (e.key === 'Escape') {
        if (findState.isOpen) {
          setFindState({ isOpen: false })
        }
        return
      }

      // Cmd+Ctrl+Arrow: 循环切换标签页
      if (e.metaKey && e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        if (!tabs.length) return
        const idx = tabs.findIndex((t) => t.id === store.activeTabId)
        const next = e.key === 'ArrowLeft'
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length
        store.setActiveTabId(tabs[next].id)
        return
      }

      // 需要 Cmd/Ctrl 的快捷键
      if (!mod) return

      // Cmd+S: 保存
      if (e.key === 's' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (activeTab && !activeTab.isImage) {
          if (activeTab.path) {
            try {
              await writeFile(activeTab.path, activeTab.content)
              store.updateTab(activeTab.id, { dirty: false, savedContent: activeTab.content })
              deleteDraft(activeTab.draftId)
              showToast('已保存', 'success')
            } catch (err) {
              showToast(`保存失败: ${err}`, 'error')
            }
          } else {
            await saveAsDialog()
          }
        }
        return
      }

      // Cmd+Shift+S: 另存为
      if (e.key === 'S' && e.shiftKey) {
        e.preventDefault()
        await saveAsDialog()
        return
      }

      // Cmd+W: 关闭标签
      if (e.key === 'w') {
        e.preventDefault()
        if (store.activeTabId) {
          const tab = tabs.find((t) => t.id === store.activeTabId)
          if (tab?.dirty) {
            window.dispatchEvent(new CustomEvent('confirm-close-tab', { detail: store.activeTabId }))
          } else {
            store.removeTab(store.activeTabId)
          }
        }
        return
      }

      // Cmd+O: 打开文件
      if (e.key === 'o' && !e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('menu-action', { detail: 'open-file' }))
        return
      }

      // Cmd+Shift+O: 打开文件夹
      if (e.key.toLowerCase() === 'o' && e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('menu-action', { detail: 'open-folder' }))
        return
      }

      // Cmd+N: 新建文件
      if (e.key === 'n') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('menu-action', { detail: 'new-file' }))
        return
      }

      // Cmd+F: 查找
      if (e.key === 'f') {
        e.preventDefault()
        const sel = editorRef.current?.getSelection() || ''
        setFindState({ isOpen: true, withReplace: false, ...(sel ? { query: sel } : {}) })
        return
      }

      // Cmd+H: 查找替换
      if (e.key === 'h') {
        e.preventDefault()
        const sel = editorRef.current?.getSelection() || ''
        setFindState({ isOpen: true, withReplace: true, ...(sel ? { query: sel } : {}) })
        return
      }

      // Cmd+B: 切换侧边栏
      if (e.key === 'b') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('menu-action', { detail: 'toggle-sidebar' }))
        return
      }

      // Cmd+`: 切换终端
      if (e.key === '`') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('menu-action', { detail: 'toggle-terminal' }))
        return
      }

      // Cmd+Shift+E: Markdown 预览
      if (e.key.toLowerCase() === 'e' && e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('menu-action', { detail: 'toggle-preview' }))
        return
      }

      // Cmd+Shift+F: 全局搜索（暂时 noop）
      if (e.key.toLowerCase() === 'f' && e.shiftKey) {
        e.preventDefault()
        store.setGlobalSearchOpen(true)
        return
      }

      // Cmd+Shift+J: JSON 格式化
      if (e.key.toLowerCase() === 'j' && e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('menu-action', { detail: 'format-json' }))
        return
      }

      // Cmd+Shift+P: 命令面板
      if (e.key.toLowerCase() === 'p' && e.shiftKey) {
        e.preventDefault()
        store.setCommandPaletteOpen(true)
        return
      }

      // Cmd+P: 文件搜索
      if (e.key === 'p' && !e.shiftKey) {
        e.preventDefault()
        store.setFileSearchOpen(true)
        return
      }

      // Cmd+Alt+S: 全部保存
      if (e.key === 's' && e.altKey) {
        e.preventDefault()
        const dirtyTabs = tabs.filter((t) => t.dirty && t.path && !t.isImage)
        for (const tab of dirtyTabs) {
          try {
            await writeFile(tab.path!, tab.content)
            store.updateTab(tab.id, { dirty: false, savedContent: tab.content })
            deleteDraft(tab.draftId)
          } catch (err) {
            showToast(`保存 ${tab.title} 失败: ${err}`, 'error')
          }
        }
        if (dirtyTabs.length > 0) {
          showToast(`已保存 ${dirtyTabs.length} 个文件`, 'success')
        }
        return
      }

      // Cmd+= / Cmd++: 放大字体
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        store.setFontSize(Math.min(28, store.fontSize + 1))
        return
      }

      // Cmd+-: 缩小字体
      if (e.key === '-') {
        e.preventDefault()
        store.setFontSize(Math.max(8, store.fontSize - 1))
        return
      }

      // Cmd+0: 重置字体
      if (e.key === '0') {
        e.preventDefault()
        store.setFontSize(13.5)
        return
      }

      // Cmd+Enter: 运行当前文件
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (activeTab?.path) {
          const ext = getExtension(activeTab.path)
          if (['py', 'js', 'mjs', 'ts'].includes(ext)) {
            // 先保存（如果 dirty）
            if (activeTab.dirty) {
              try {
                await writeFile(activeTab.path, activeTab.content)
                store.updateTab(activeTab.id, { dirty: false, savedContent: activeTab.content })
                deleteDraft(activeTab.draftId)
              } catch (err) {
                showToast(`保存失败: ${err}`, 'error')
                return
              }
            }
            // 发送运行请求到 Terminal
            window.dispatchEvent(
              new CustomEvent('terminal-action', {
                detail: {
                  type: 'run-file',
                  filePath: activeTab.path,
                  language: ext,
                },
              })
            )
          } else {
            showToast('只支持运行 .py / .js / .ts 文件', 'info')
          }
        }
        return
      }

      // Cmd+Shift+Enter: 运行选中代码
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('terminal-action', { detail: { type: 'run-selection' } }))
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [
    activeTab,
    tabs,
    findState.isOpen,
    sidebarVisible,
    terminalVisible,
    previewVisible,
    store,
    setFindState,
    showToast,
    writeFile,
    saveAsDialog,
  ])

  // ── 初始化恢复 Session ─────────────────────────────────────

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  // ── Tab 切换时触发预览更新 ─────────────────────────────────

  useEffect(() => {
    if (previewVisible && activeTab && !activeTab.isImage) {
      const ext = getExtension(activeTab.path || '')
      if (['md', 'markdown', 'json'].includes(ext)) {
        window.dispatchEvent(
          new CustomEvent('preview-update', {
            detail: {
              content: activeTab.content,
              language: ext === 'json' ? 'json' : 'markdown',
            },
          })
        )
      }
    }
  }, [activeTab?.id, previewVisible])

  // ── Tab 切换/关闭时保存 Session ─────────────────────────────

  useEffect(() => {
    triggerSaveSession()
  }, [store.activeTabId, store.tabs.length, triggerSaveSession])

  // ── 自动保存草稿 ────────────────────────────────────────
  //
  // 每次 tabs 变化都重新调度一次 writeDraft;writeDraft 内部按 draftId 维护
  // debounce timer,持续输入期间只会延后,停止输入 500ms 后才真正落盘
  useEffect(() => {
    for (const tab of tabs) {
      if (tab.isImage) continue
      if (tab.path === null || tab.dirty) {
        writeDraft(tab)
      }
    }
  }, [tabs])

  // ── 渲染布局 ─────────────────────────────────────────────

  return (
    <div className={styles.app}>
      {/* 标题栏 */}
      <TitleBar />

      {/* 标签栏 */}
      <TabsBar />

      {/* 主区域 */}
      <div className={styles.mainArea}>
        {/* 侧边栏 */}
        {sidebarVisible && (
          <div className={styles.sidebar} style={{ width: `${sidebarWidth}px` }}>
            <Sidebar />
          </div>
        )}

        {/* 侧边栏分隔线 */}
        <Resizer
          type="vertical"
          visible={sidebarVisible}
          onDrag={handleSidebarResizerDrag}
          className={styles.sidebarResizer}
        />

        {/* 编辑区域 */}
        <div className={styles.editorArea}>
          {/* 查找栏 */}
          <FindBar />
          {/* 编辑器 + 预览容器 */}
          <div className={styles.editorPreview}>
            <Editor ref={editorRef} className={styles.editorWrapper} />
            {/* 预览分隔线 */}
            <Resizer
              type="vertical"
              visible={previewVisible}
              onDrag={handlePreviewResizerDrag}
              className={styles.previewResizer}
            />
            {/* 预览面板 */}
            {previewVisible && (
              <div className={styles.previewPanel} style={{ width: `${previewWidth}px` }}>
                <PreviewPanel />
              </div>
            )}
          </div>

          {/* 终端分隔线 */}
          <Resizer
            type="horizontal"
            visible={terminalVisible}
            onDrag={handleTerminalResizerDrag}
            className={styles.terminalResizer}
          />

          {/* 终端 */}
          <Terminal />
        </div>
      </div>

      {/* 状态栏 */}
      <StatusBar />

      {/* Toast 通知 */}
      <ToastContainer />

      {/* Modal 对话框 */}
      <ModalOverlay />

      {/* 确认关闭对话框 */}
      <ConfirmCloseDialog />

      {/* 文件搜索 */}
      <FileSearchOverlay />

      {/* 快捷键帮助 */}
      <ShortcutsOverlay />

      {/* 右键菜单 */}
      <ContextMenu />

      {/* Tab 右键菜单 */}
      <TabContextMenu />
    </div>
  )
}