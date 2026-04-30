/**
 * Tauri 事件 hooks — 封装 listen/unlisten
 *
 * withGlobalTauri: true，通过 window.__TAURI__.event.listen 访问
 */

import { useEffect, useRef } from 'react'
import type { StreamEvent } from '../types'

type UnlistenFn = () => void

const listen = <T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> => {
  if (!(window as any).__TAURI__?.event) {
    return Promise.resolve(() => {})
  }
  return (window as any).__TAURI__.event.listen(event, (e: { payload: T }) =>
    handler(e.payload),
  )
}

/**
 * 订阅 Tauri 事件，组件卸载时自动取消订阅
 *
 * @param event 事件名
 * @param handler 事件处理函数（需稳定引用，建议用 useCallback）
 * @param enabled 是否启用订阅（默认 true）
 */
export function useTauriEvent<T>(
  event: string,
  handler: (payload: T) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    let unlisten: UnlistenFn | null = null

    listen<T>(event, (payload) => handlerRef.current(payload)).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [event, enabled])
}

/**
 * 订阅进程流式输出事件
 * 事件名格式：`process-output-${id}` 或 `shell-output-${id}`
 *
 * @param processId 进程 ID
 * @param handler StreamEvent 处理函数
 * @param eventPrefix 事件前缀（默认 'process-output'）
 */
export function useProcessOutput(
  processId: string | null,
  handler: (event: StreamEvent) => void,
  eventPrefix = 'process-output',
): void {
  useTauriEvent<StreamEvent>(
    processId ? `${eventPrefix}-${processId}` : '',
    handler,
    !!processId,
  )
}

/**
 * 订阅 shell 输出事件（shell_exec 命令）
 */
export function useShellOutput(
  processId: string | null,
  handler: (event: StreamEvent) => void,
): void {
  useProcessOutput(processId, handler, 'shell-output')
}

/**
 * 一次性订阅 Tauri 事件（触发一次后自动取消）
 */
export function listenOnce<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, handler)
}

/**
 * 直接订阅（非 hook，用于非组件上下文）
 */
export { listen }
