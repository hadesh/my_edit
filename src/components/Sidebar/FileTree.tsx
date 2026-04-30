import React, { useState, useRef } from 'react'
import type { FileEntry } from '../../types'
import { TreeItem } from './TreeItem'
import styles from './Sidebar.module.css'

interface FileTreeProps {
  entries: FileEntry[]
  depth: number
  workspaceRoot: string
  fileTreeOrder: Record<string, string[]>
  parentPath: string | null
  selectedPath: string | null
  onToggleCollapse: (path: string) => void
  onOpenFile: (path: string) => void
  onContextMenu: (entry: FileEntry, x: number, y: number) => void
  onDragComplete: (newPath: string | null, srcPath: string, updatedOrder: Record<string, string[]>, srcIsDir: boolean) => Promise<void>
  onRename: (oldPath: string, newPath: string) => Promise<void>
}

export const FileTree: React.FC<FileTreeProps> = ({
  entries,
  depth,
  workspaceRoot,
  fileTreeOrder,
  parentPath,
  selectedPath,
  onToggleCollapse,
  onOpenFile,
  onContextMenu,
  onDragComplete,
  onRename,
}) => {
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

  const handleToggleCollapse = (path: string) => {
    const next = new Set(collapsedDirs)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    setCollapsedDirs(next)
  }

  if (entries.length === 0 && depth === 0) {
    return (
      <div className={styles.fileTree}>
        <div className={styles.treeEmpty}>
          没有打开的文件夹<br />
          <a onClick={() => window.dispatchEvent(new CustomEvent('menu-action', { detail: 'open-folder' }))}>
            点击打开文件夹
          </a>
        </div>
      </div>
    )
  }

  const order = parentPath ? fileTreeOrder[parentPath] : null
  const sorted = order
    ? [...entries].sort((a, b) => {
        const ia = order.indexOf(a.path)
        const ib = order.indexOf(b.path)
        if (ia === -1 && ib === -1) return 0
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
    : entries

  return (
    <div
      ref={containerRef}
      className={`${styles.fileTree} ${depth > 0 ? styles.childContainer : ''}`}
      data-path={parentPath || undefined}
    >
      {sorted.map((entry) => (
        <React.Fragment key={entry.path}>
          <TreeItem
            entry={entry}
            depth={depth}
            workspaceRoot={workspaceRoot}
            fileTreeOrder={fileTreeOrder}
            collapsedDirs={collapsedDirs}
            selectedPath={selectedPath}
            onToggleCollapse={handleToggleCollapse}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
            onDragComplete={onDragComplete}
            onRename={onRename}
            childContainerRef={null}
          />
          {entry.is_dir && entry.children && !collapsedDirs.has(entry.path) && (
            <div
              className={styles.childContainer}
              data-path={entry.path}
            >
              <FileTree
                entries={entry.children}
                depth={depth + 1}
                workspaceRoot={workspaceRoot}
                fileTreeOrder={fileTreeOrder}
                parentPath={entry.path}
                selectedPath={selectedPath}
                onToggleCollapse={handleToggleCollapse}
                onOpenFile={onOpenFile}
                onContextMenu={onContextMenu}
                onDragComplete={onDragComplete}
                onRename={onRename}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}