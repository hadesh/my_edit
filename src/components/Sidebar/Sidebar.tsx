import React from 'react'
import { useStore } from '../../store'
import { readDirTree, renamePath } from '../../hooks/useIPC'
import { SidebarHeader } from './SidebarHeader'
import { FileTree } from './FileTree'
import styles from './Sidebar.module.css'

export const Sidebar: React.FC = () => {
  const workspaceRoot = useStore((s) => s.workspaceRoot)
  const fileTree = useStore((s) => s.fileTree)
  const fileTreeOrder = useStore((s) => s.fileTreeOrder)
  const selectedFilePath = useStore((s) => s.selectedFilePath)
  const setFileTree = useStore((s) => s.setFileTree)
  const setFileTreeOrder = useStore((s) => s.setFileTreeOrder)
  const tabs = useStore((s) => s.tabs)
  const setSelectedFilePath = useStore((s) => s.setSelectedFilePath)
  const setActiveTabId = useStore((s) => s.setActiveTabId)
  const showToast = useStore((s) => s.showToast)

  const workspaceName = workspaceRoot ? workspaceRoot.split('/').pop() || '资源管理器' : '资源管理器'

  const handleNewFile = () => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: 'new-file' }))
  }

  const handleNewFolder = () => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: 'new-folder' }))
  }

  const handleRefresh = async () => {
    if (!workspaceRoot) return
    try {
      const tree = await readDirTree(workspaceRoot)
      setFileTree(tree)
      showToast('文件树已刷新', 'success')
    } catch (err) {
      showToast(`刷新失败: ${err}`, 'error')
    }
  }

  const handleOpenFolder = () => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: 'open-folder' }))
  }

  const handleOpenFile = (path: string) => {
    window.dispatchEvent(new CustomEvent('open-file', { detail: path }))
  }

  const handleContextMenu = (entry: import('../../types').FileEntry, x: number, y: number) => {
    window.dispatchEvent(new CustomEvent('context-menu', { detail: { entry, x, y } }))
  }

  const handleDragComplete = async (newPath: string | null, srcPath: string, updatedOrder: Record<string, string[]>, srcIsDir: boolean) => {
    try {
      setFileTreeOrder(updatedOrder)

      if (newPath !== null && newPath !== srcPath) {
        await renamePath(srcPath, newPath)
        if (workspaceRoot) {
          const tree = await readDirTree(workspaceRoot)
          setFileTree(tree)
        }
      }

      const finalPath = newPath !== null && newPath !== srcPath ? newPath : srcPath
      setSelectedFilePath(finalPath)

      if (!srcIsDir) {
        const matchingTab = tabs.find((t) => t.path === finalPath)
        if (matchingTab) {
          setActiveTabId(matchingTab.id)
        } else {
          window.dispatchEvent(new CustomEvent('open-file', { detail: finalPath }))
        }
      }

      window.dispatchEvent(new CustomEvent('save-session'))
    } catch (err) {
      showToast(`移动失败: ${err}`, 'error')
    }
  }

  const handleRename = async (oldPath: string, newPath: string) => {
    try {
      await renamePath(oldPath, newPath)
      if (workspaceRoot) {
        const tree = await readDirTree(workspaceRoot)
        setFileTree(tree)
      }
      showToast('重命名成功', 'success')
    } catch (err) {
      showToast(`重命名失败: ${err}`, 'error')
    }
  }

  if (!workspaceRoot || fileTree.length === 0) {
    return (
      <div className={styles.sidebar}>
        <SidebarHeader
          workspaceName={workspaceName}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRefresh={handleRefresh}
          onOpenFolder={handleOpenFolder}
        />
        <div className={styles.fileTree}>
          <div className={styles.treeEmpty}>
            没有打开的文件夹<br />
            <a onClick={handleOpenFolder}>点击打开文件夹</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.sidebar}>
      <SidebarHeader
        workspaceName={workspaceName}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onRefresh={handleRefresh}
        onOpenFolder={handleOpenFolder}
      />
      <FileTree
        entries={fileTree}
        depth={0}
        workspaceRoot={workspaceRoot}
        fileTreeOrder={fileTreeOrder}
        parentPath={workspaceRoot}
        selectedPath={selectedFilePath}
        onToggleCollapse={() => {}}
        onOpenFile={handleOpenFile}
        onContextMenu={handleContextMenu}
        onDragComplete={handleDragComplete}
        onRename={handleRename}
      />
    </div>
  )
}