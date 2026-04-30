import { useState, useEffect, useRef } from 'react'
import styles from './TitleBar.module.css'

interface MenuCommand {
  action: string
  label: string
  shortcut?: string
  disabled?: boolean
}

type MenuCommandOrSep = MenuCommand | { type: 'sep' }

interface MenuItemConfig {
  menuId: string
  label: string
  commands: MenuCommandOrSep[]
}

const menuConfig: MenuItemConfig[] = [
  {
    menuId: 'file',
    label: '文件',
    commands: [
      { action: 'open-folder', label: '打开文件夹', shortcut: '⌘⇧O' },
      { action: 'open-file', label: '打开文件', shortcut: '⌘O' },
      { type: 'sep' },
      { action: 'file-search', label: '搜索文件', shortcut: '⌘P' },
      { type: 'sep' },
      { action: 'new-file', label: '新建文件', shortcut: '⌘N' },
      { type: 'sep' },
      { action: 'save', label: '保存', shortcut: '⌘S' },
      { action: 'save-as', label: '另存为', shortcut: '⌘⇧S' },
      { type: 'sep' },
      { action: 'close-tab', label: '关闭标签', shortcut: '⌘W' },
    ],
  },
  {
    menuId: 'edit',
    label: '编辑',
    commands: [
      { action: 'find', label: '查找', shortcut: '⌘F' },
      { action: 'replace', label: '查找替换', shortcut: '⌘H' },
      { type: 'sep' },
      { action: 'format-json', label: '格式化 JSON', shortcut: '⌘⇧J' },
      { action: 'toggle-comment', label: '切换注释', shortcut: '⌘/' },
    ],
  },
  {
    menuId: 'view',
    label: '视图',
    commands: [
      { action: 'toggle-preview', label: 'Markdown 预览', shortcut: '⌘⇧E' },
      { action: 'toggle-terminal', label: '终端', shortcut: '⌘`' },
      { action: 'toggle-sidebar', label: '侧边栏', shortcut: '⌘B' },
      { type: 'sep' },
      { action: 'zoom-in', label: '放大字体', shortcut: '⌘+' },
      { action: 'zoom-out', label: '缩小字体', shortcut: '⌘-' },
      { action: 'zoom-reset', label: '重置字体', shortcut: '⌘0' },
    ],
  },
  {
    menuId: 'run',
    label: '运行',
    commands: [
      { action: 'run-script', label: '运行脚本', shortcut: '⌘↵' },
      { action: 'run-selection', label: '运行选中', shortcut: '⌘⇧↵' },
      { type: 'sep' },
      { action: 'run-curl', label: '执行 curl', shortcut: '⌘⇧C' },
      { type: 'sep' },
      { action: 'stop-process', label: '停止', shortcut: '⌘.' },
    ],
  },
  {
    menuId: 'help',
    label: '帮助',
    commands: [
      { action: 'show-shortcuts', label: '快捷键参考' },
    ],
  },
]

function triggerMenuAction(cmd: string) {
  window.dispatchEvent(new CustomEvent('menu-action', { detail: cmd }))
}

function isMenuCommand(item: MenuCommandOrSep): item is MenuCommand {
  return 'action' in item
}

export function MenuBar() {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)

  const handleItemClick = (menuId: string) => {
    setOpenMenuId(prev => prev === menuId ? null : menuId)
  }

  const handleCommandClick = (action: string) => {
    triggerMenuAction(action)
    setOpenMenuId(null)
  }

  const handleItemMouseEnter = (menuId: string) => {
    if (openMenuId !== null) {
      setOpenMenuId(menuId)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div ref={menuBarRef} className={styles.menuBar}>
      {menuConfig.map(menu => (
        <div
          key={menu.menuId}
          className={styles.menuItem}
          onClick={() => handleItemClick(menu.menuId)}
          onMouseEnter={() => handleItemMouseEnter(menu.menuId)}
        >
          {menu.label}
          <div
            className={`${styles.dropdownMenu} ${
              openMenuId === menu.menuId ? styles.dropdownMenuOpen : ''
            }`}
          >
            {menu.commands.map((cmd, idx) =>
              isMenuCommand(cmd) ? (
                <div
                  key={cmd.action}
                  className={`${styles.menuCmd} ${
                    cmd.disabled ? styles.menuCmdDisabled : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCommandClick(cmd.action)
                  }}
                >
                  <span>{cmd.label}</span>
                  {cmd.shortcut && (
                    <span className={styles.shortcut}>{cmd.shortcut}</span>
                  )}
                </div>
              ) : (
                <div key={idx} className={styles.menuSep} />
              )
            )}
          </div>
        </div>
      ))}
    </div>
  )
}