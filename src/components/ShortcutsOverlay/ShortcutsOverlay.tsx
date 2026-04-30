import React, { useEffect } from 'react'
import { useStore } from '../../store'
import styles from './ShortcutsOverlay.module.css'

interface ShortcutGroup {
  title: string
  items: { name: string; key: string }[]
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: '文件',
    items: [
      { name: '新建文件', key: '⌘N' },
      { name: '打开文件', key: '⌘O' },
      { name: '打开文件夹', key: '⌘⇧O' },
      { name: '搜索文件', key: '⌘P' },
      { name: '保存', key: '⌘S' },
      { name: '另存为', key: '⌘⇧S' },
      { name: '关闭标签页', key: '⌘W' },
    ],
  },
  {
    title: '编辑',
    items: [
      { name: '查找', key: '⌘F' },
      { name: '查找替换', key: '⌘H' },
      { name: '格式化 JSON', key: '⌘⇧J' },
      { name: '切换注释', key: '⌘/' },
    ],
  },
  {
    title: '视图',
    items: [
      { name: 'Markdown 预览', key: '⌘⇧E' },
      { name: '终端', key: '⌘`' },
      { name: '侧边栏', key: '⌘B' },
      { name: '放大字体', key: '⌘+' },
      { name: '缩小字体', key: '⌘-' },
      { name: '重置字体', key: '⌘0' },
    ],
  },
  {
    title: '运行',
    items: [
      { name: '运行脚本', key: '⌘↵' },
      { name: '运行选中代码', key: '⌘⇧↵' },
      { name: '执行 curl', key: '⌘⇧C' },
      { name: '停止', key: '⌘.' },
    ],
  },
  {
    title: '搜索',
    items: [
      { name: '全局搜索', key: '⌘⇧F' },
      { name: '命令面板', key: '⌘⇧P' },
      { name: '快捷键帮助', key: '?' },
    ],
  },
]

export function ShortcutsOverlay() {
  const shortcutsOpen = useStore((s) => s.ui.shortcutsOpen)
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)

  useEffect(() => {
    if (!shortcutsOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShortcutsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcutsOpen, setShortcutsOpen])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setShortcutsOpen(false)
    }
  }

  if (!shortcutsOpen) return null

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.box}>
        <div className={styles.header}>
          <span>快捷键参考</span>
          <button className={styles.closeBtn} onClick={() => setShortcutsOpen(false)}>
            ✕
          </button>
        </div>
        <div className={styles.body}>
          {SHORTCUTS.map((group) => (
            <div key={group.title}>
              <div className={styles.groupTitle}>{group.title}</div>
              <table className={styles.table}>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.name}>
                      <td>{item.name}</td>
                      <td>
                        <kbd>{item.key}</kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
