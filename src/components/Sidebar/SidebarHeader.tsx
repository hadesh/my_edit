import React from 'react'
import styles from './Sidebar.module.css'

interface SidebarHeaderProps {
  workspaceName: string
  onNewFile: () => void
  onNewFolder: () => void
  onRefresh: () => void
  onOpenFolder: () => void
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  workspaceName,
  onNewFile,
  onNewFolder,
  onRefresh,
  onOpenFolder,
}) => {
  return (
    <div className={styles.sidebarHeader}>
      <span className={styles.sidebarTitle}>{workspaceName || '资源管理器'}</span>
      <div className={styles.sidebarActions}>
        <button
          className={styles.sidebarBtn}
          title="新建文件"
          onClick={onNewFile}
        >
          +
        </button>
        <button
          className={styles.sidebarBtn}
          title="新建文件夹"
          onClick={onNewFolder}
        >
          📁
        </button>
        <button
          className={styles.sidebarBtn}
          title="刷新"
          onClick={onRefresh}
        >
          ↻
        </button>
        <button
          className={styles.sidebarBtn}
          title="打开文件夹"
          onClick={onOpenFolder}
        >
          ⌘
        </button>
      </div>
    </div>
  )
}