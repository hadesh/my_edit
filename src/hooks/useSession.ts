/**
 * Session 持久化 Hook
 *
 * 封装 restoreSession 和 saveSession 逻辑，与原版 main.js 行为一致
 */

import { useCallback, useRef } from 'react'
import { useStore } from '../store'
import { saveSession as ipcSaveSession, loadSession as ipcLoadSession, readFile, readDirTree } from './useIPC'
import { readDraft, listDrafts, deleteDraft, newDraftId } from './useDraft'
import type { Tab, SessionData } from '../types'

let uid = 0
const nextId = () => `id_${++uid}`

// 模块级标志:跨 React 组件重挂载持久(useRef 在 StrictMode 双挂载时
// 会创建新实例,无法防重入)
//
// hasStartedRestore — restoreSession 已开始(不论是否完成);用于防止 StrictMode
//                     开发模式下 effect 双跑导致文件被打开两次
// isSessionRestored — restoreSession 完全结束;在此之前 triggerSaveSession 都跳过,
//                     避免初始空 tabs 覆盖 session 文件
let hasStartedRestore = false
let isSessionRestored = false

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
  triggerSaveSession: () => Promise<void>
}

export function useSession(): UseSessionReturn {
  const store = useStore()
  const storeRef = useRef(store)
  storeRef.current = store

  const triggerSaveSession = useCallback(async (): Promise<void> => {
    if (!isSessionRestored) return

    const state = storeRef.current
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

    const session: SessionData = {
      workspaceRoot: state.workspaceRoot,
      activeFilePath: activeTab?.path ?? null,
      fileTreeOrder: state.fileTreeOrder,
      // 保留所有非图片 tab —— 包含临时文件(path=null)和 dirty 文件,
      // 它们的内容由草稿缓存(drafts/{draftId}.json)兜底,启动时合并恢复
      // 按 draftId 去重(防御任何来源的重复 tab,避免污染 session 文件)
      openFiles: (() => {
        const seen = new Set<string>()
        return state.tabs
          .filter((t) => !t.isImage)
          .filter((t) => {
            if (seen.has(t.draftId)) return false
            seen.add(t.draftId)
            return true
          })
          .map((t) => ({
            path: t.path,
            cursorPos: t.cursorPos,
            scrollInfo: t.scrollInfo,
            draftId: t.draftId,
            isUntitled: t.path === null,
            title: t.title,
          }))
      })(),
    }

    try {
      await ipcSaveSession(session)
    } catch (err) {
      console.error('保存 session 失败:', err)
    }
  }, [])

  const restoreSession = useCallback(async () => {
    if (hasStartedRestore) return
    hasStartedRestore = true
    try {
      const session = await ipcLoadSession()
      if (!session) {
        isSessionRestored = true  // 没有 session 文件,直接放行后续保存
        return
      }

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

      const referencedDraftIds = new Set<string>()
      // 本地去重 —— state.tabs 是闭包快照,无法反映 addTab 后的最新状态,
      // 必须用本地集合追踪已恢复过的 path / draftId,
      // 防止污染过的 session 文件中包含的重复 entries 把同一个文件打开多次
      const restoredPaths = new Set<string>()
      const restoredDraftIds = new Set<string>()

      if (session.openFiles?.length) {
        let firstTabId: string | null = null
        let activeTabId: string | null = null

        for (const entry of session.openFiles) {
          try {
            // 读草稿(可能不存在)
            const draftId = entry.draftId
            const draft = draftId ? await readDraft(draftId) : null
            if (draftId) referencedDraftIds.add(draftId)

            // draftId 重复 —— 直接跳过(同一草稿不能恢复成两个 tab)
            if (draftId && restoredDraftIds.has(draftId)) {
              continue
            }

            // 临时文件(无路径) —— 必须依赖草稿恢复内容
            if (entry.isUntitled || entry.path === null) {
              if (!draft) continue  // 没草稿就无法恢复临时文件
              const tab: Tab = {
                id: nextId(),
                path: null,
                title: entry.title || draft.title || '未命名',
                content: draft.content,
                savedContent: '',  // 临时文件无"已保存"基线
                dirty: draft.content.length > 0,
                scrollInfo: entry.scrollInfo ?? null,
                cursorPos: entry.cursorPos ?? { line: 0, ch: 0 },
                isImage: false,
                draftId: draftId!,
              }
              state.addTab(tab)
              restoredDraftIds.add(draftId!)
              if (!firstTabId) firstTabId = tab.id
              continue
            }

            // 同路径已恢复过 —— 跳过(防御 session 重复 entries)
            if (restoredPaths.has(entry.path)) {
              continue
            }

            if (isImageFile(entry.path)) {
              continue
            }

            // 磁盘文本文件:读盘 + 合并草稿
            const savedContent = await readFile(entry.path)
            const hasUnsavedDraft = draft !== null && draft.content !== savedContent

            const tab: Tab = {
              id: nextId(),
              path: entry.path,
              title: basename(entry.path),
              content: hasUnsavedDraft ? draft!.content : savedContent,
              savedContent,
              dirty: hasUnsavedDraft,
              scrollInfo: entry.scrollInfo ?? null,
              cursorPos: entry.cursorPos ?? { line: 0, ch: 0 },
              isImage: false,
              draftId: draftId || newDraftId(),
            }

            state.addTab(tab)
            restoredPaths.add(entry.path)
            if (draftId) restoredDraftIds.add(draftId)

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

      // 清理孤儿草稿(session 中未引用的)
      try {
        const allDraftIds = await listDrafts()
        for (const id of allDraftIds) {
          if (!referencedDraftIds.has(id)) {
            await deleteDraft(id)
          }
        }
      } catch (err) {
        console.error('清理孤儿草稿失败:', err)
      }
    } catch (err) {
      console.error('恢复 session 失败:', err)
    } finally {
      // 无论成功失败,放行后续 saveSession;放在最末尾确保 restoreSession
      // 真正完成(包括 addTab 触发的 re-render)再允许写盘
      isSessionRestored = true
    }
  }, [])

  return {
    restoreSession,
    triggerSaveSession,
  }
}
