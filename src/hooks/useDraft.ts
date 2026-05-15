/**
 * 草稿(自动保存)缓存层
 *
 * 设计要点:
 * - 每个 Tab 有一个跨会话稳定的 draftId(UUID),对应后端 drafts/{draftId}.json
 * - writeDraft 内部 debounce 500ms —— 用 Map<draftId, timeoutId> 维护,
 *   不同 tab 的 timer 互不干扰
 * - 用户停止输入 500ms 后才真正写盘,持续输入期间不写
 */

import type { Tab } from '../types'

const invoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  if (!(window as any).__TAURI__?.core) {
    return Promise.reject(new Error(`Tauri 未就绪,无法调用命令: ${cmd}`))
  }
  return (window as any).__TAURI__.core.invoke(cmd, args)
}

const DEBOUNCE_MS = 500

// draftId → 待执行的 setTimeout id
const pendingTimers = new Map<string, number>()

/** 草稿文件 JSON schema(后端不解析,前端读写) */
export interface DraftPayload {
  draftId: string
  path: string | null
  title: string
  content: string
  savedAt: number
}

/**
 * Debounce 写入草稿。同一个 draftId 在 500ms 内的多次调用只会触发一次写盘。
 * 不同 draftId 各自独立计时,互不影响。
 */
export function writeDraft(tab: Tab): void {
  if (!tab.draftId) return

  const prev = pendingTimers.get(tab.draftId)
  if (prev !== undefined) {
    clearTimeout(prev)
  }

  const snapshot: DraftPayload = {
    draftId: tab.draftId,
    path: tab.path,
    title: tab.title,
    content: tab.content,
    savedAt: Date.now(),
  }

  const timerId = window.setTimeout(() => {
    pendingTimers.delete(tab.draftId)
    invoke<void>('write_draft', {
      draftId: snapshot.draftId,
      payload: JSON.stringify(snapshot),
    }).catch((err) => {
      console.error(`写入草稿失败 (${snapshot.draftId}):`, err)
    })
  }, DEBOUNCE_MS)

  pendingTimers.set(tab.draftId, timerId)
}

/** 立即取消该 draftId 的待执行写入(用于关闭/删除前避免写孤儿草稿) */
export function cancelDraft(draftId: string): void {
  const t = pendingTimers.get(draftId)
  if (t !== undefined) {
    clearTimeout(t)
    pendingTimers.delete(draftId)
  }
}

export async function readDraft(draftId: string): Promise<DraftPayload | null> {
  const raw = await invoke<string | null>('read_draft', { draftId })
  if (!raw) return null
  try {
    return JSON.parse(raw) as DraftPayload
  } catch (err) {
    console.error(`解析草稿失败 (${draftId}):`, err)
    return null
  }
}

export async function deleteDraft(draftId: string): Promise<void> {
  cancelDraft(draftId)
  try {
    await invoke<void>('delete_draft', { draftId })
  } catch (err) {
    console.error(`删除草稿失败 (${draftId}):`, err)
  }
}

export async function listDrafts(): Promise<string[]> {
  return invoke<string[]>('list_drafts')
}

/** 生成新 draftId(crypto.randomUUID 在 macOS WKWebView 可用) */
export function newDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
