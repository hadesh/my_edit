import React, { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { revealInFinder } from '../../hooks/useIPC'
import styles from './TabContextMenu.module.css'

interface MenuState {
  tabId: string
  x: number
  y: number
}

export function TabContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const tabs = useStore((s) => s.tabs)
  const removeTab = useStore((s) => s.removeTab)
  const closeOtherTabs = useStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useStore((s) => s.closeTabsToRight)

  useEffect(() => {
    const handler = (e: CustomEvent<{ tabId: string; x: number; y: number }>) => {
      setMenu(e.detail)
    }
    window.addEventListener('tab-context-menu', handler as EventListener)
    return () => window.removeEventListener('tab-context-menu', handler as EventListener)
  }, [])

  const close = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return
    const handleClick = () => close()
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    setTimeout(() => document.addEventListener('click', handleClick), 0)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menu, close])

  if (!menu) return null

  const tab = tabs.find((t) => t.id === menu.tabId)
  if (!tab) return null

  const handleClose = () => {
    if (tab.dirty) {
      window.dispatchEvent(new CustomEvent('confirm-close-tab', { detail: menu.tabId }))
    } else {
      removeTab(menu.tabId)
    }
    close()
  }

  const handleCloseOthers = () => {
    closeOtherTabs(menu.tabId)
    close()
  }

  const handleCloseRight = () => {
    closeTabsToRight(menu.tabId)
    close()
  }

  const handleReveal = async () => {
    if (tab.path) {
      await revealInFinder(tab.path)
    }
    close()
  }

  return (
    <div className={styles.contextMenu} style={{ left: menu.x, top: menu.y }}>
      <div className={styles.ctxItem} onClick={handleClose}>关闭</div>
      <div className={styles.ctxItem} onClick={handleCloseOthers}>关闭其他</div>
      <div className={styles.ctxItem} onClick={handleCloseRight}>关闭右侧</div>
      {tab.path && (
        <>
          <div className={styles.ctxSep} />
          <div className={styles.ctxItem} onClick={handleReveal}>在 Finder 中显示</div>
        </>
      )}
    </div>
  )
}
