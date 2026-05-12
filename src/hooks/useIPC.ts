/**
 * IPC hooks 层 — 封装所有 Tauri invoke 调用
 *
 * 重要约束：
 * - withGlobalTauri: true，通过 window.__TAURI__.core.invoke 访问
 * - 参数名必须与 Rust 命令签名完全一致（JSON 序列化）
 * - 所有函数返回 Promise，错误通过 throw 传递
 */

import type {
  FileEntry,
  SaveResult,
  ProcessOutput,
  ImageData,
  SessionData,
} from '../types'

const invoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  if (!(window as any).__TAURI__?.core) {
    return Promise.reject(new Error(`Tauri 未就绪，无法调用命令: ${cmd}`))
  }
  return (window as any).__TAURI__.core.invoke(cmd, args)
}

// ─── 文件操作 ───────────────────────────────────────────────

/** 读取文本文件内容 */
export const readFile = (path: string): Promise<string> =>
  invoke('read_file', { path })

/** 读取图片文件（base64 编码） */
export const readFileBase64 = (path: string): Promise<ImageData> =>
  invoke('read_file_base64', { path })

/** 写入文件（自动创建父目录） */
export const writeFile = (path: string, content: string): Promise<SaveResult> =>
  invoke('write_file', { path, content })

/** 递归读取目录树（最深 5 层） */
export const readDirTree = (path: string): Promise<FileEntry[]> =>
  invoke('read_dir_tree', { path })

/** 创建空文件 */
export const createFile = (path: string): Promise<void> =>
  invoke('create_file', { path })

/** 创建目录（递归） */
export const createDir = (path: string): Promise<void> =>
  invoke('create_dir', { path })

/** 删除文件或目录 */
export const deletePath = (path: string): Promise<void> =>
  invoke('delete_path', { path })

/** 重命名/移动文件或目录 */
export const renamePath = (oldPath: string, newPath: string): Promise<void> =>
  invoke('rename_path', { old_path: oldPath, new_path: newPath })

/** 检查路径是否存在 */
export const pathExists = (path: string): Promise<boolean> =>
  invoke('path_exists', { path })

/** 获取文件元信息 */
export const getFileInfo = (path: string): Promise<FileEntry> =>
  invoke('get_file_info', { path })

// ─── 进程执行 ───────────────────────────────────────────────

/** 同步执行命令，返回完整输出 */
export const executeCommand = (
  program: string,
  args: string[],
  cwd?: string,
): Promise<ProcessOutput> =>
  invoke('execute_command', { program, args, cwd: cwd ?? null })

/**
 * 流式执行命令
 * 输出通过 listen(`process-output-${id}`, handler) 接收
 * StreamEvent: { id, stream: 'stdout'|'stderr'|'exit', data }
 */
export const executeCommandStream = (
  id: string,
  program: string,
  args: string[],
  cwd?: string,
): Promise<void> =>
  invoke('execute_command_stream', { id, program, args, cwd: cwd ?? null })

/**
 * 执行 shell 命令（/bin/bash -l -c）
 * 输出通过 listen(`shell-output-${id}`, handler) 接收
 * StreamEvent: { id, stream: 'stdout'|'stderr'|'exit', data }
 */
export const shellExec = (
  id: string,
  cmd: string,
  cwd?: string,
): Promise<void> =>
  invoke('shell_exec', { id, cmd, cwd: cwd ?? null })

/**
 * 执行 curl 命令（流式）
 * 输出通过 listen(`process-output-${id}`, handler) 接收
 */
export const executeCurl = (id: string, curlCommand: string): Promise<void> =>
  invoke('execute_curl', { id, curlCommand })

// ─── 系统操作 ───────────────────────────────────────────────

/** 在 Finder 中显示文件 */
export const revealInFinder = (path: string): Promise<void> =>
  invoke('reveal_in_finder', { path })

/** 退出应用 */
export const exitApp = (): Promise<void> =>
  invoke('exit_app')

// ─── Session 持久化 ─────────────────────────────────────────

/** 保存 session 到 ~/.myedit_session.json */
export const saveSession = (data: SessionData): Promise<void> =>
  invoke('save_session', { data: JSON.stringify(data) })

/** 读取 session，不存在时返回 null */
export const loadSession = async (): Promise<SessionData | null> => {
  const raw: string = await invoke('load_session')
  if (raw === 'null' || !raw) return null
  try {
    return JSON.parse(raw) as SessionData
  } catch {
    return null
  }
}
