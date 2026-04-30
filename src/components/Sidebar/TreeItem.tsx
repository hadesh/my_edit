import React, { useState, useRef, useEffect } from 'react'
import type { FileEntry } from '../../types'
import { fileIcon, applyTreeOrder } from '../../utils/treeUtils'
import styles from './Sidebar.module.css'

interface TreeItemProps {
  entry: FileEntry
  depth: number
  workspaceRoot: string
  fileTreeOrder: Record<string, string[]>
  collapsedDirs: Set<string>
  selectedPath: string | null
  onToggleCollapse: (path: string) => void
  onOpenFile: (path: string) => void
  onContextMenu: (entry: FileEntry, x: number, y: number) => void
  onDragComplete: (newPath: string | null, srcPath: string, updatedOrder: Record<string, string[]>, srcIsDir: boolean) => Promise<void>
  onRename: (oldPath: string, newName: string) => Promise<void>
  childContainerRef?: HTMLElement | null
}

let _treeDragSrcPath: string | null = null
let _treeDragGhost: HTMLElement | null = null
let _treeDragDidMove = false

function clearDragOverAttrs() {
  document.querySelectorAll<HTMLElement>('[data-drag-over]').forEach((el) => {
    el.removeAttribute('data-drag-over')
  })
}

export const TreeItem: React.FC<TreeItemProps> = ({
  entry,
  depth,
  workspaceRoot,
  fileTreeOrder,
  collapsedDirs,
  selectedPath,
  onToggleCollapse,
  onOpenFile,
  onContextMenu,
  onDragComplete,
  onRename,
  childContainerRef,
}) => {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(entry.name)
  const itemRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isDir = entry.is_dir
  const isCollapsed = collapsedDirs.has(entry.path)
  const isSelected = selectedPath === entry.path
  const indentPx = depth * 14 + 8

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const handleClick = (e: React.MouseEvent) => {
    if (_treeDragDidMove) return
    if (isRenaming) return
    if (isDir) {
      onToggleCollapse(entry.path)
    } else {
      onOpenFile(entry.path)
    }
  }

  const handleDoubleClick = () => {
    if (isDir) return
    setIsRenaming(true)
    setRenameValue(entry.name)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    onContextMenu(entry, e.clientX, e.clientY)
  }

  const handleRenameKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (renameValue.trim() && renameValue !== entry.name) {
        const oldPath = entry.path
        const parentPath = entry.path.split('/').slice(0, -1).join('/')
        const newPath = parentPath + '/' + renameValue.trim()
        await onRename(oldPath, newPath)
      }
      setIsRenaming(false)
    } else if (e.key === 'Escape') {
      setIsRenaming(false)
      setRenameValue(entry.name)
    }
  }

  const handleRenameBlur = () => {
    setIsRenaming(false)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (isRenaming) return
    e.preventDefault()

    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    const onMouseMove = (mv: MouseEvent) => {
      if (!dragging) {
        if (Math.abs(mv.clientX - startX) < 4 && Math.abs(mv.clientY - startY) < 4) return
        dragging = true
        _treeDragDidMove = true
        _treeDragSrcPath = entry.path
        document.body.style.userSelect = 'none'

        _treeDragGhost = document.createElement('div')
        _treeDragGhost.className = styles.treeDragGhost
        _treeDragGhost.textContent = entry.name
        document.body.appendChild(_treeDragGhost)

        itemRef.current?.setAttribute('data-dragging', 'true')
        itemRef.current?.classList.add(styles.dragging)
      }

      if (_treeDragGhost) {
        _treeDragGhost.style.left = mv.clientX + 12 + 'px'
        _treeDragGhost.style.top = mv.clientY + 4 + 'px'
      }

      clearDragOverAttrs()

      if (_treeDragGhost) {
        _treeDragGhost.style.display = 'none'
        const below = document.elementFromPoint(mv.clientX, mv.clientY)
        _treeDragGhost.style.display = ''

        const target = below?.closest<HTMLDivElement>('[data-path][data-is-dir]')
        if (target && target !== itemRef.current) {
          const targetIsDir = target.dataset.isDir === 'true'
          if (targetIsDir) {
            const rect = target.getBoundingClientRect()
            target.setAttribute(
              'data-drag-over',
              mv.clientY < rect.top + rect.height / 2 ? 'before' : 'into'
            )
          } else {
            target.setAttribute('data-drag-over', 'before')
          }
        }
      }
    }

    const onMouseUp = async (mu: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      if (!dragging) return

      itemRef.current?.classList.remove(styles.dragging)
      itemRef.current?.removeAttribute('data-dragging')
      document.body.style.userSelect = ''

      if (_treeDragGhost) {
        _treeDragGhost.remove()
        _treeDragGhost = null
      }

      const srcPath = _treeDragSrcPath
      _treeDragSrcPath = null
      clearDragOverAttrs()
      setTimeout(() => { _treeDragDidMove = false }, 0)

      if (!srcPath) return

      const below = document.elementFromPoint(mu.clientX, mu.clientY)
      const targetItem = below?.closest<HTMLDivElement>('[data-path][data-is-dir]')

      if (!targetItem || targetItem === itemRef.current) return

      let targetPath: string = targetItem.dataset.path ?? ''
      let targetIsDir = targetItem.dataset.isDir === 'true'

      if (targetIsDir) {
        const rect = targetItem.getBoundingClientRect()
        if (mu.clientY < rect.top + rect.height / 2) {
          targetIsDir = false
        }
      }

      const orderCopy = { ...fileTreeOrder }
      const newPath = applyTreeOrder(srcPath, targetPath, targetIsDir, orderCopy)

      await onDragComplete(newPath, srcPath, orderCopy, entry.is_dir)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      ref={itemRef}
      className={`${styles.treeItem} ${isSelected ? styles.active : ''} ${isRenaming ? styles.renaming : ''}`}
      data-path={entry.path}
      data-is-dir={isDir ? 'true' : 'false'}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
    >
      <span className={styles.itemIndent} style={{ width: indentPx }}></span>
      {isDir ? (
        <span className={styles.collapseIcon}>{isCollapsed ? '▶' : '▼'}</span>
      ) : (
        <span className={styles.collapseIcon} style={{ visibility: 'hidden' }}>▶</span>
      )}
      <span className={styles.itemIcon}>{isDir ? '📁' : fileIcon(entry.extension)}</span>
      {isRenaming ? (
        <input
          ref={inputRef}
          className={styles.itemNameInput}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameBlur}
        />
      ) : (
        <span className={styles.itemName}>{entry.name}</span>
      )}
    </div>
  )
}
