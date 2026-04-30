// 语言颜色映射和工具函数
// 从 main.js.bak 提取 EXT_TO_COLOR 常量

export const EXT_TO_COLOR: Record<string, string> = {
  js: '#f7df1e',
  ts: '#3178c6',
  jsx: '#61dafb',
  tsx: '#3178c6',
  py: '#3572a5',
  rs: '#dea584',
  md: '#083fa1',
  json: '#cbcb41',
  html: '#e34c26',
  css: '#563d7c',
  scss: '#c6538c',
  less: '#1d365d',
  sh: '#89e051',
  bash: '#89e051',
  zsh: '#89e051',
  sql: '#e38c00',
  yaml: '#cb171e',
  yml: '#cb171e',
  toml: '#9c4121',
  xml: '#0060ac',
  svg: '#ff9900',
  go: '#00add8',
  java: '#b07219',
  kt: '#a97bff',
  swift: '#ffac45',
  c: '#555555',
  cpp: '#f34b7d',
  h: '#555555',
  hpp: '#f34b7d',
  vue: '#41b883',
  svelte: '#ff3e00',
  php: '#4f5d95',
  rb: '#701516',
  rust: '#dea584',
  r: '#198ce7',
  dart: '#00b4ab',
  lua: '#000080',
  vim: '#199f4b',
  dockerfile: '#384d54',
  make: '#427819',
  cmake: '#da3434',
  ps1: '#012456',
  bat: '#c1f12e',
  cmd: '#c1f12e',
}

// 语言名称映射
export const EXT_TO_LANG: Record<string, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  py: 'Python',
  rs: 'Rust',
  rust: 'Rust',
  md: 'Markdown',
  markdown: 'Markdown',
  json: 'JSON',
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  sql: 'SQL',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  svg: 'SVG',
  go: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  cpp: 'C++',
  h: 'C Header',
  hpp: 'C++ Header',
  vue: 'Vue',
  svelte: 'Svelte',
  php: 'PHP',
  rb: 'Ruby',
  r: 'R',
  dart: 'Dart',
  lua: 'Lua',
  vim: 'Vim',
  dockerfile: 'Dockerfile',
  make: 'Makefile',
  cmake: 'CMake',
  ps1: 'PowerShell',
  bat: 'Batch',
  cmd: 'Batch',
  txt: 'Plain Text',
}

/**
 * 从路径中获取文件扩展名
 */
export function getExtension(path: string): string {
  const parts = path.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

/**
 * 根据路径获取文件扩展名对应的颜色
 * @param path 文件路径
 * @returns 颜色代码（未匹配返回 '#6c7086'）
 */
export function getTabColor(path: string): string {
  const ext = getExtension(path)
  return EXT_TO_COLOR[ext] || '#6c7086'
}

/**
 * 根据路径获取语言名称（用于 StatusBar）
 * @param path 文件路径
 * @returns 语言名称（未匹配返回 'Plain Text'）
 */
export function getLanguageName(path: string): string {
  const ext = getExtension(path)
  return EXT_TO_LANG[ext] || 'Plain Text'
}
