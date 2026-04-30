import type { FileEntry } from '../types'

export function parentOf(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

export function currentDirOrder(
  dirPath: string,
  fileTreeOrder: Record<string, string[]>,
  treeItems?: HTMLElement[]
): string[] {
  if (fileTreeOrder[dirPath]) {
    return fileTreeOrder[dirPath]
  }

  if (treeItems && treeItems.length > 0) {
    const order = treeItems
      .filter(el => el.parentElement === (treeItems[0]?.parentElement || null))
      .map(el => el.dataset.path || '')
      .filter(p => p !== '')
    fileTreeOrder[dirPath] = order
    return order
  }

  return []
}

export function applyTreeOrder(
  srcPath: string,
  targetPath: string,
  targetIsDir: boolean,
  fileTreeOrder: Record<string, string[]>
): string | null {
  const srcParent = parentOf(srcPath)
  let destParent: string

  if (targetIsDir) {
    destParent = targetPath
  } else {
    destParent = parentOf(targetPath)
  }

  if (srcParent === destParent && !targetIsDir) {
    const order = currentDirOrder(srcParent, fileTreeOrder)
    const withoutSrc = order.filter(p => p !== srcPath)
    const tgtIdx = withoutSrc.indexOf(targetPath)

    if (tgtIdx === -1) {
      withoutSrc.push(srcPath)
    } else {
      withoutSrc.splice(tgtIdx, 0, srcPath)
    }

    fileTreeOrder[srcParent] = withoutSrc
    return null
  }

  const fileName = srcPath.split('/').pop() || ''
  const newDestPath = destParent + '/' + fileName

  fileTreeOrder[srcParent] = currentDirOrder(srcParent, fileTreeOrder).filter(p => p !== srcPath)

  const destOrder = currentDirOrder(destParent, fileTreeOrder).filter(p => p !== newDestPath)
  destOrder.push(newDestPath)
  fileTreeOrder[destParent] = destOrder

  return newDestPath
}

export function fileIcon(extension: string): string {
  const iconMap: Record<string, string> = {
    js: '📜',
    jsx: '⚛️',
    ts: '📘',
    tsx: '⚛️',
    py: '🐍',
    rs: '⚙️',
    go: '🔵',
    html: '🌐',
    css: '🎨',
    json: '📋',
    md: '📝',
    yaml: '⚙️',
    yml: '⚙️',
    sql: '🗃️',
    sh: '💻',
    txt: '📄',
    pdf: '📕',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    svg: '🖼️',
    zip: '📦',
    tar: '📦',
    gz: '📦',
  }
  return iconMap[extension] || '📄'
}