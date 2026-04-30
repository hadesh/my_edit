/**
 * Session 持久化 Hook
 *
 * 封装 restoreSession 和 saveSession 逻辑，与原版 main.js 行为一致
 */

import { useCallback, useRef } from 'react'
import { useStore } from '../store'
import { saveSession as ipcSaveSession, loadSession as ipcLoadSession, readFile, readDirTree } from './useIPC'
import type { Tab, SessionData } from '../types'

let uid = 0
const nextId = () => `id_${++uid}`

function basename(path: string): string {
  return path.split('/').pop() || path
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'tiff', 'tif', 'avif'])
function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTS.has(ext)
}

export interface UseSessionReturn {
  restoreSession: () => Promise<void>
  triggerSaveSession: () => void
}

export function useSession(): UseSessionReturn {
  const store = useStore()
  const storeRef = useRef(store)
  storeRef.current = store

  const triggerSaveSession = useCallback(() => {
    const state = storeRef.current
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

    const session: SessionData = {
      workspaceRoot: state.workspaceRoot,
      activeFilePath: activeTab?.path ?? null,
      fileTreeOrder: state.fileTreeOrder,
      openFiles: state.tabs
        .filter((t) => t.path && !t.dirty)
        .map((t) => ({
          path: t.path!,
          cursorPos: t.cursorPos,
          scrollInfo: t.scrollInfo,
        })),
    }

    ipcSaveSession(session).catch((err) => {
      console.error('保存 session 失败:', err)
    })
  }, [])

  const restoreSession = useCallback(async () => {
    try {
      const session = await ipcLoadSession()
      if (!session) return

      const state = storeRef.current

      if (session.workspaceRoot) {
        if (session.fileTreeOrder) {
          state.setFileTreeOrder(session.fileTreeOrder)
        }

        try {
          const tree = await readDirTree(session.workspaceRoot)
          state.setWorkspaceRoot(session.workspaceRoot)
          state.setFileTree(tree)
        } catch (err) {
          console.error('恢复工作区失败:', err)
        }
      }

      if (session.openFiles?.length) {
        let firstTabId: string | null = null
        let activeTabId: string | null = null

        for (const entry of session.openFiles) {
          try {
            const existing = state.tabs.find((t) => t.path === entry.path)
            if (existing) {
              existing.cursorPos = entry.cursorPos ?? { line: 0, ch: 0 }
              existing.scrollInfo = entry.scrollInfo ?? null
              if (!firstTabId) firstTabId = existing.id
              if (entry.path === session.activeFilePath) activeTabId = existing.id
              continue
            }

            if (isImageFile(entry.path)) {
              continue
            }

            const content = await readFile(entry.path)

            const tab: Tab = {
              id: nextId(),
              path: entry.path,
              title: basename(entry.path),
              content,
              savedContent: content,
              dirty: false,
              scrollInfo: entry.scrollInfo ?? null,
              cursorPos: entry.cursorPos ?? { line: 0, ch: 0 },
              isImage: false,
            }

            state.addTab(tab)

            if (!firstTabId) firstTabId = tab.id
            if (entry.path === session.activeFilePath) activeTabId = tab.id
          } catch (err) {
            console.error(`恢复文件失败: ${entry.path}`, err)
          }
        }

        const targetId = activeTabId ?? firstTabId
        if (targetId) {
          state.setActiveTabId(targetId)
        }
      }
    } catch (err) {
      console.error('恢复 session 失败:', err)
    }
  }, [])

  return {
    restoreSession,
    triggerSaveSession,
  }
}
