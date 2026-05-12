import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../../store'
import { readDirTree } from '../../hooks/useIPC'
import type { FileEntry } from '../../types'
import styles from './FileSearchOverlay.module.css'

interface FileItem {
  path: string
  name: string
  open: boolean
}

function flattenEntries(entries: FileEntry[]): string[] {
  const result: string[] = []
  for (const e of entries) {
    if (!e.is_dir) result.push(e.path)
    if (e.is_dir && e.children) result.push(...flattenEntries(e.children))
  }
  return result
}

function fuzzyMatch(name: string, query: string): { match: boolean; highlights: number[] } {
  if (!query) return { match: true, highlights: [] }
  const lName = name.toLowerCase()
  const lQuery = query.toLowerCase()
  let qi = 0
  const highlights: number[] = []
  for (let ni = 0; ni < name.length && qi < lQuery.length; ni++) {
    if (lName[ni] === lQuery[qi]) {
      highlights.push(ni)
      qi++
    }
  }
  return { match: qi === lQuery.length, highlights }
}

function renderHighlighted(name: string, highlights: number[]) {
  if (!highlights.length) return name
  const set = new Set(highlights)
  return name.split('').map((ch, i) =>
    set.has(i) ? <mark key={i}>{ch}</mark> : ch
  )
}

function basename(p: string) {
  return p.split('/').pop() || p
}

export function FileSearchOverlay() {
  const fileSearchOpen = useStore((s) => s.ui.fileSearchOpen)
  const setFileSearchOpen = useStore((s) => s.setFileSearchOpen)
  const workspaceRoot = useStore((s) => s.workspaceRoot)
  const tabs = useStore((s) => s.tabs)

  const [query, setQuery] = useState('')
  const [allFiles, setAllFiles] = useState<FileItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // 打开时加载文件列表
  useEffect(() => {
    if (!fileSearchOpen) {
      setQuery('')
      setAllFiles([])
      setSelectedIndex(0)
      return
    }

    inputRef.current?.focus()

    const openPaths = new Set(tabs.map((t) => t.path).filter(Boolean) as string[])
    const files: FileItem[] = []

    // 已打开文件排在前面
    tabs.forEach((t) => {
      if (t.path) files.push({ path: t.path, name: basename(t.path), open: true })
    })

    if (workspaceRoot) {
      readDirTree(workspaceRoot)
        .then((entries) => {
          const allPaths = flattenEntries(entries)
          allPaths.forEach((p) => {
            if (!openPaths.has(p)) files.push({ path: p, name: basename(p), open: false })
          })
          setAllFiles([...files])
        })
        .catch(() => {
          setAllFiles([...files])
        })
    } else {
      setAllFiles(files)
    }
  }, [fileSearchOpen, workspaceRoot, tabs])

  // 过滤结果
  const filtered = allFiles
    .map((f) => {
      const { match, highlights } = fuzzyMatch(f.name, query)
      return { ...f, match, highlights }
    })
    .filter((f) => f.match)

  // 键盘导航
  useEffect(() => {
    if (!fileSearchOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFileSearchOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex].path)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fileSearchOpen, filtered, selectedIndex, setFileSearchOpen])

  // query 变化时重置选中
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // 选中项滚动到可见区域
  useEffect(() => {
    if (!resultsRef.current) return
    const active = resultsRef.current.querySelector(`.${styles.active}`) as HTMLElement | null
    active?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleSelect = (path: string) => {
    setFileSearchOpen(false)
    window.dispatchEvent(new CustomEvent('open-file', { detail: path }))
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setFileSearchOpen(false)
  }

  const relPath = (p: string) => {
    if (workspaceRoot && p.startsWith(workspaceRoot + '/')) {
      return p.slice(workspaceRoot.length + 1)
    }
    return p
  }

  if (!fileSearchOpen) return null

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.searchBox}>
        <div className={styles.inputWrap}>
          <span className={styles.fsIcon}>🔍</span>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            placeholder="搜索文件..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className={styles.results} ref={resultsRef}>
          {filtered.length === 0 ? (
            <div className={styles.resultsEmpty}>
              {query.trim() ? '无匹配结果' : '输入文件名开始搜索'}
            </div>
          ) : (
            filtered.map((f, index) => (
              <div
                key={f.path}
                className={`${styles.item} ${index === selectedIndex ? styles.active : ''}`}
                onClick={() => handleSelect(f.path)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className={styles.itemName}>
                  {renderHighlighted(f.name, f.highlights)}
                </span>
                <span className={styles.itemPath}>{relPath(f.path)}</span>
                {f.open && <span className={styles.itemBadge}>已打开</span>}
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <span><kbd>↑</kbd> <kbd>↓</kbd> 导航</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
          <span>{filtered.length} 个文件</span>
        </div>
      </div>
    </div>
  )
}
