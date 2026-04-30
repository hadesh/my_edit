import { useRef, useCallback, useState, useEffect } from 'react'
import { useStore, useTabs, useActiveTab } from '../../store'
import { getTabColor, getExtension } from '../../utils/langUtils'
import styles from './TabsBar.module.css'

interface DragState {
  tabId: string
  startX: number
  ghost: HTMLDivElement | null
  dragging: boolean
}

interface DropTarget {
  tabId: string
  position: 'before' | 'after'
}

export function TabsBar() {
  const store = useStore()
  const tabs = useTabs()
  const activeTab = useActiveTab()
  const tabsListRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)

  useEffect(() => {
    if (!activeTab || !tabsListRef.current) return
    const el = tabsListRef.current.querySelector<HTMLElement>(`[data-tab-id="${activeTab.id}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTab?.id])

  const setDropTargetSync = (val: DropTarget | null) => {
    dropTargetRef.current = val
    setDropTarget(val)
  }

  const handleTabClick = useCallback(
    (tabId: string) => {
      store.setActiveTabId(tabId)
    },
    [store]
  )

  const handleCloseClick = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation()
      const tab = tabs.find((t) => t.id === tabId)
      if (tab?.dirty) {
        window.dispatchEvent(new CustomEvent('confirm-close-tab', { detail: tabId }))
      } else {
        store.removeTab(tabId)
      }
    },
    [store, tabs]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.preventDefault()
      window.dispatchEvent(
        new CustomEvent('tab-context-menu', {
          detail: { tabId, x: e.clientX, y: e.clientY },
        })
      )
    },
    []
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      if (e.button !== 0) return
      e.preventDefault()

      const startX = e.clientX
      dragStateRef.current = {
        tabId,
        startX,
        ghost: null,
        dragging: false,
      }

      const handleMouseMove = (me: MouseEvent) => {
        const dragState = dragStateRef.current
        if (!dragState) return

        const DRAG_THRESHOLD = 5

        if (!dragState.dragging) {
          if (Math.abs(me.clientX - startX) < DRAG_THRESHOLD) return
          dragState.dragging = true
          document.body.style.userSelect = 'none'

          const ghost = document.createElement('div')
          const tab = tabs.find((t) => t.id === dragState.tabId)
          if (tab) {
            ghost.className = styles.tabGhost
            ghost.textContent = tab.title
            ghost.style.left = `${me.clientX + 12}px`
            ghost.style.top = `${me.clientY + 4}px`
            document.body.appendChild(ghost)
            dragState.ghost = ghost
          }
        }

        if (dragState.ghost) {
          dragState.ghost.style.left = `${me.clientX + 12}px`
          dragState.ghost.style.top = `${me.clientY + 4}px`
        }

        dragState.ghost?.style.setProperty('display', 'none')
        const below = document.elementFromPoint(me.clientX, me.clientY)
        dragState.ghost?.style.setProperty('display', '')

        const targetTab = below?.closest('[data-tab-id]') as HTMLElement | null
        if (targetTab && targetTab.dataset.tabId !== dragState.tabId) {
          const rect = targetTab.getBoundingClientRect()
          const position = me.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
          setDropTargetSync({ tabId: targetTab.dataset.tabId!, position })
        } else {
          setDropTargetSync(null)
        }
      }

      const handleMouseUp = () => {
        const dragState = dragStateRef.current
        if (!dragState) return

        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.userSelect = ''

        if (dragState.ghost) {
          dragState.ghost.remove()
        }

        const currentDropTarget = dropTargetRef.current
        if (dragState.dragging && currentDropTarget) {
          const srcIdx = tabs.findIndex((t) => t.id === dragState.tabId)
          const dstIdx = tabs.findIndex((t) => t.id === currentDropTarget.tabId)

          if (srcIdx !== -1 && dstIdx !== -1 && srcIdx !== dstIdx) {
            const newTabs = [...tabs]
            const [moved] = newTabs.splice(srcIdx, 1)
            const adjustedDstIdx = currentDropTarget.position === 'before' ? dstIdx : dstIdx + 1
            const insertIndex = adjustedDstIdx > srcIdx ? adjustedDstIdx - 1 : adjustedDstIdx
            newTabs.splice(insertIndex, 0, moved)
            store.setTabs(newTabs)
          }
        }

        dragStateRef.current = null
        setDropTargetSync(null)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [tabs, store]
  )

  if (tabs.length === 0) {
    return (
      <div className={styles.tabsBar}>
        <div className={styles.tabsList} ref={tabsListRef}>
          <div className={styles.emptyState}>未打开文件</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.tabsBar}>
      <div className={styles.tabsList} ref={tabsListRef}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab?.id
          const color = getTabColor(tab.title)
          const isDropBefore = dropTarget?.tabId === tab.id && dropTarget.position === 'before'
          const isDropAfter = dropTarget?.tabId === tab.id && dropTarget.position === 'after'

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={[
                styles.tab,
                isActive && styles.tabActive,
                tab.dirty && styles.tabDirty,
                isDropBefore && styles.tabDropBefore,
                isDropAfter && styles.tabDropAfter,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleTabClick(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
            >
              <span
                className={styles.tabLangDot}
                style={{ backgroundColor: color }}
              />
              <span className={styles.tabName} title={tab.path || tab.title}>
                {tab.title}
              </span>
              {tab.dirty ? (
                <span className={styles.tabDirtyIndicator} />
              ) : (
                <button
                  className={styles.tabClose}
                  onClick={(e) => handleCloseClick(e, tab.id)}
                  title="关闭"
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
