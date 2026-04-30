import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../../store'
import type { FileEntry } from '../../types'
import styles from './FileSearchOverlay.module.css'

interface SearchResult {
  path: string
  name: string
  line?: number
  content?: string
  isDir: boolean
}

export function FileSearchOverlay() {
  const fileSearchOpen = useStore((s) => s.ui.fileSearchOpen)
  const setFileSearchOpen = useStore((s) => s.setFileSearchOpen)
  const workspaceRoot = useStore((s) => s.workspaceRoot)
  const showToast = useStore((s) => s.showToast)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (fileSearchOpen) {
      inputRef.current?.focus()
    }
  }, [fileSearchOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!fileSearchOpen) return

      if (e.key === 'Escape') {
        setFileSearchOpen(false)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fileSearchOpen, results, selectedIndex, setFileSearchOpen])

  const searchFiles = useCallback(async () => {
    if (!workspaceRoot || !query.trim()) {
      setResults([])
      return
    }

    setIsSearching(true)
    try {
      const { invoke } = window.__TAURI__.core

      let searchPattern = query
      if (useRegex) {
      } else if (wholeWord) {
        searchPattern = `\\b${query}\\b`
      }

      const result = await invoke('execute_command', {
        cmd: 'grep',
        args: [
          '-r',
          '-n',
          caseSensitive ? '' : '-i',
          useRegex ? '-E' : '-F',
          '--include=*.{js,ts,tsx,jsx,py,rs,go,java,c,cpp,h,hpp,md,json,yaml,yml,toml,txt,html,css,scss,sh,bash,zsh,sql}',
          searchPattern,
          '.',
        ],
        cwd: workspaceRoot,
      })

      const lines = (result as { stdout: string }).stdout.split('\n').filter(Boolean)
      const fileResults: SearchResult[] = []

      for (const line of lines.slice(0, 50)) {
        const match = line.match(/^(.+?):(\d+):(.*)$/)
        if (match) {
          const [, filePath, lineNum, content] = match
          fileResults.push({
            path: `${workspaceRoot}/${filePath}`,
            name: filePath.split('/').pop() || filePath,
            line: parseInt(lineNum, 10),
            content: content.trim().slice(0, 60),
            isDir: false,
          })
        }
      }

      setResults(fileResults)
      setSelectedIndex(0)
    } catch (err) {
      const { stdout = '' } = (err as { stdout?: string }) || {}
      if (!stdout) {
        setResults([])
      }
    } finally {
      setIsSearching(false)
    }
  }, [workspaceRoot, query, caseSensitive, useRegex, wholeWord])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        searchFiles()
      } else {
        setResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, searchFiles])

  const handleSelect = (result: SearchResult) => {
    setFileSearchOpen(false)
    window.dispatchEvent(
      new CustomEvent('open-file', {
        detail: { path: result.path, line: result.line },
      })
    )
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setFileSearchOpen(false)
    }
  }

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, useRegex ? 'gi' : 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i}>{part}</mark>
      ) : (
        part
      )
    )
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
            placeholder="搜索文件内容..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className={styles.options}>
          <button
            className={`${styles.option} ${caseSensitive ? styles.active : ''}`}
            onClick={() => setCaseSensitive(!caseSensitive)}
          >
            区分大小写
          </button>
          <button
            className={`${styles.option} ${wholeWord ? styles.active : ''}`}
            onClick={() => setWholeWord(!wholeWord)}
          >
            全词匹配
          </button>
          <button
            className={`${styles.option} ${useRegex ? styles.active : ''}`}
            onClick={() => setUseRegex(!useRegex)}
          >
            正则表达式
          </button>
        </div>

        <div className={styles.results} ref={resultsRef}>
          {isSearching ? (
            <div className={styles.resultsEmpty}>搜索中...</div>
          ) : results.length === 0 ? (
            <div className={styles.resultsEmpty}>
              {query.trim() ? '无匹配结果' : '输入关键词开始搜索'}
            </div>
          ) : (
            results.map((result, index) => (
              <div
                key={`${result.path}:${result.line}`}
                className={`${styles.item} ${index === selectedIndex ? styles.active : ''}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className={styles.itemName}>{highlightMatch(result.name, query)}</span>
                <span className={styles.itemPath}>{result.path.replace(workspaceRoot || '', '')}</span>
                {result.line && <span className={styles.resultLine}>L{result.line}</span>}
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> 导航
          </span>
          <span>
            <kbd>Enter</kbd> 打开
          </span>
          <span>
            <kbd>Esc</kbd> 关闭
          </span>
          <span>{results.length} 结果</span>
        </div>
      </div>
    </div>
  )
}
