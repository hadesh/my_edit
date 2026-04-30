// 图片数据（对应 Rust ImageData 结构体）
export interface ImageData {
  data: string        // base64 编码的图片数据
  mime: string        // MIME 类型，如 image/png
  size: number        // 文件字节数
  width: number       // 图片宽度（像素），0 表示未知
  height: number      // 图片高度（像素），0 表示未知
  extension: string   // 文件扩展名（小写）
}

// 标签页
export interface Tab {
  id: string
  path: string | null
  title: string
  content: string
  savedContent: string
  dirty: boolean
  scrollInfo: { left: number; top: number } | null
  cursorPos: { line: number; ch: number }
  isImage: boolean
  imageData?: ImageData
}

// 终端输出行
export interface TerminalLine {
  text: string
  cls: string  // 'stdout' | 'stderr' | 'exit-ok' | 'exit-err' | 'system'
}

// 终端会话
export interface TerminalSession {
  id: string
  label: string
  lines: TerminalLine[]
  cwd: string | null
  history: string[]
  historyIdx: number
}

// 文件树条目（对应 Rust FileEntry 结构体，字段名必须完全匹配）
export interface FileEntry {
  name: string
  path: string
  is_dir: boolean  // 注意：下划线，不能改为 isDir
  children?: FileEntry[]
  size: number
  extension: string
}

// 查找栏状态
export interface FindState {
  query: string
  replaceQuery: string
  matches: number
  currentMatch: number
  isOpen: boolean
  withReplace: boolean
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
}

// Session 持久化数据
export interface SessionData {
  workspaceRoot: string | null
  activeFilePath: string | null
  openFiles: Array<{
    path: string
    cursorPos: { line: number; ch: number }
    scrollInfo: { left: number; top: number } | null
  }>
  fileTreeOrder: Record<string, string[]>
}

// 右键菜单目标
export interface ContextMenuTarget {
  entry: FileEntry
  x: number
  y: number
}

// 保存结果（对应 Rust SaveResult 结构体，字段名必须完全匹配）
export interface SaveResult {
  success: boolean
  message: string
}

// 进程输出（对应 Rust ProcessOutput 结构体）
export interface ProcessOutput {
  stdout: string
  stderr: string
  exit_code: number
}

// 流式输出事件（对应 Rust StreamEvent 结构体，字段名必须完全匹配）
export interface StreamEvent {
  id: string
  stream: string  // 'stdout' | 'stderr' | 'exit'
  data: string
}