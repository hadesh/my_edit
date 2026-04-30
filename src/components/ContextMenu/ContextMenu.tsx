import React, { useEffect, useRef } from 'react'
import { useStore } from '../../store'
import type { FileEntry } from '../../types'
import styles from './ContextMenu.module.css'

interface ContextMenuItem {
  label: string
  action: string
  danger?: boolean
  separator?: boolean
}

const MENU_ITEMS: ContextMenuItem[] = [
  { label: '打开', action: 'open' },
  { label: '重命名', action: 'rename' },
  { separator: true } as ContextMenuItem,
  { label: '新建文件', action: 'new-file' },
  { label: '新建文件夹', action: 'new-folder' },
  { separator: true } as ContextMenuItem,
  { label: '在访达中显示', action: 'reveal' },
  { separator: true } as ContextMenuItem,
  { label: '删除', action: 'delete', danger: true },
]

export function ContextMenu() {
  const contextMenuTarget = useStore((s) => s.contextMenuTarget)
  const setContextMenuTarget = useStore((s) => s.setContextMenuTarget)
  const showModal = useStore((s) => s.showModal)
  const showToast = useStore((s) => s.showToast)
  const workspaceRoot = useStore((s) => s.workspaceRoot)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contextMenuTarget) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenuTarget(null)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuTarget(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenuTarget, setContextMenuTarget])

  if (!contextMenuTarget) return null

  const { entry, x, y } = contextMenuTarget

  const handleAction = async (action: string) => {
    setContextMenuTarget(null)

    switch (action) {
      case 'open':
        if (!entry.is_dir) {
          window.dispatchEvent(new CustomEvent('open-file', { detail: entry.path }))
        }
        break

      case 'rename':
        const oldName = entry.name
        showModal({
          title: '重命名',
          label: '新名称',
          defaultVal: oldName,
          onConfirm: async (newName) => {
            if (!newName || newName === oldName) return
            const parentPath = entry.path.substring(0, entry.path.lastIndexOf('/'))
            const newPath = `${parentPath}/${newName}`
            window.dispatchEvent(
              new CustomEvent('rename-file', { detail: { oldPath: entry.path, newPath } })
            )
          },
        })
        break

      case 'new-file':
        const parentForFile = entry.is_dir ? entry.path : entry.path.substring(0, entry.path.lastIndexOf('/'))
        showModal({
          title: '新建文件',
          label: '文件名',
          onConfirm: async (name) => {
            if (!name) return
            const newPath = `${parentForFile}/${name}`
            window.dispatchEvent(new CustomEvent('create-file', { detail: newPath }))
          },
        })
        break

      case 'new-folder':
        const parentForFolder = entry.is_dir ? entry.path : entry.path.substring(0, entry.path.lastIndexOf('/'))
        showModal({
          title: '新建文件夹',
          label: '文件夹名',
          onConfirm: async (name) => {
            if (!name) return
            const newPath = `${parentForFolder}/${name}`
            window.dispatchEvent(new CustomEvent('create-folder', { detail: newPath }))
          },
        })
        break

      case 'reveal':
        if (workspaceRoot) {
          try {
            const { invoke } = window.__TAURI__.core
            await invoke('execute_command', {
              cmd: 'open',
              args: ['-R', entry.path],
              cwd: workspaceRoot,
            })
          } catch (err) {
            showToast(`打开访达失败: ${err}`, 'error')
          }
        }
        break

      case 'delete':
        window.dispatchEvent(new CustomEvent('delete-path', { detail: entry.path }))
        break
    }
  }

  const isDir = entry.is_dir
  const filteredItems = MENU_ITEMS.filter((item) => {
    if (item.separator) return true
    if (item.action === 'open') return !isDir
    if (item.action === 'new-file' || item.action === 'new-folder') return isDir
    return true
  })

  const adjustPosition = () => {
    const menuWidth = 160
    const menuHeight = 200
    let adjustedX = x
    let adjustedY = y

    if (typeof window !== 'undefined') {
      if (x + menuWidth > window.innerWidth) {
        adjustedX = window.innerWidth - menuWidth - 10
      }
      if (y + menuHeight > window.innerHeight) {
        adjustedY = window.innerHeight - menuHeight - 10
      }
    }

    return { left: adjustedX, top: adjustedY }
  }

  const position = adjustPosition()

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ left: position.left, top: position.top }}
    >
      {filteredItems.map((item, index) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className={styles.ctxSep} />
        }

        return (
          <div
            key={item.action}
            className={item.danger ? styles.ctxItemDanger : styles.ctxItem}
            onClick={() => handleAction(item.action)}
          >
            {item.label}
          </div>
        )
      })}
    </div>
  )
}
