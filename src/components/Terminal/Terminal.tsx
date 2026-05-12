import React, { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../../store'
import type { TerminalLine, TerminalSession, StreamEvent } from '../../types'
import { executeCommandStream, executeCurl, shellExec } from '../../hooks/useIPC'
import { useTauriEvent } from '../../hooks/useTauriEvent'
import { TerminalSession as TerminalSessionComponent } from './TerminalSession'
import styles from './Terminal.module.css'

let uid = 0
const nextId = () => `term_${++uid}`

export const Terminal: React.FC = () => {
  const terminalVisible = useStore((s) => s.ui.terminalVisible)
  const terminalHeight = useStore((s) => s.ui.terminalHeight)
  const terminalSessions = useStore((s) => s.terminalSessions)
  const activeTerminalId = useStore((s) => s.activeTerminalId)
  const pendingProcessIds = useStore((s) => s.pendingProcessIds)
  const workspaceRoot = useStore((s) => s.workspaceRoot)
  const addTerminalSession = useStore((s) => s.addTerminalSession)
  const removeTerminalSession = useStore((s) => s.removeTerminalSession)
  const setActiveTerminalId = useStore((s) => s.setActiveTerminalId)
  const updateTerminalSession = useStore((s) => s.updateTerminalSession)
  const addPendingProcess = useStore((s) => s.addPendingProcess)
  const removePendingProcess = useStore((s) => s.removePendingProcess)
  const setTerminalVisible = useStore((s) => s.setTerminalVisible)
  const showToast = useStore((s) => s.showToast)

  const [currentProcessId, setCurrentProcessId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  const activeSession = terminalSessions.find((s) => s.id === activeTerminalId) ?? null

  useTauriEvent<StreamEvent>(
    currentProcessId ? `process-output-${currentProcessId}` : '',
    useCallback((event: StreamEvent) => {
      if (!activeTerminalId) return

      const line: TerminalLine = {
        text: event.data,
        cls: event.stream === 'stdout' ? '' : event.stream === 'stderr' ? 'stderr' : 'info',
      }

      if (event.stream === 'exit') {
        const code = parseInt(event.data)
        const exitLine: TerminalLine = {
          text: code === 0 ? '✓ 进程退出 (0)' : `✗ 进程退出 (${code})`,
          cls: code === 0 ? 'exit-ok' : 'exit-err',
        }
        updateTerminalSession(activeTerminalId, {
          lines: [...(activeSession?.lines ?? []), exitLine],
        })
        removePendingProcess(currentProcessId ?? '')
        setCurrentProcessId(null)
      } else {
        updateTerminalSession(activeTerminalId, {
          lines: [...(activeSession?.lines ?? []), line],
        })
      }
    }, [activeTerminalId, activeSession?.lines, currentProcessId, updateTerminalSession, removePendingProcess]),
    !!currentProcessId
  )

  useTauriEvent<StreamEvent>(
    currentProcessId ? `shell-output-${currentProcessId}` : '',
    useCallback((event: StreamEvent) => {
      if (!activeTerminalId) return

      const line: TerminalLine = {
        text: event.data,
        cls: event.stream === 'stdout' ? '' : event.stream === 'stderr' ? 'stderr' : 'info',
      }

      if (event.stream === 'exit') {
        const code = parseInt(event.data)
        const exitLine: TerminalLine = {
          text: code === 0 ? '✓ 完成' : `✗ 退出码 ${code}`,
          cls: code === 0 ? 'exit-ok' : 'exit-err',
        }
        updateTerminalSession(activeTerminalId, {
          lines: [...(activeSession?.lines ?? []), exitLine],
        })
        removePendingProcess(currentProcessId ?? '')
        setCurrentProcessId(null)
      } else {
        updateTerminalSession(activeTerminalId, {
          lines: [...(activeSession?.lines ?? []), line],
        })
      }
    }, [activeTerminalId, activeSession?.lines, currentProcessId, updateTerminalSession, removePendingProcess]),
    !!currentProcessId
  )

  const createSession = useCallback(
    (label: string) => {
      const id = nextId()
      const session: TerminalSession = {
        id,
        label,
        lines: [],
        cwd: workspaceRoot,
        history: [],
        historyIdx: -1,
      }
      addTerminalSession(session)
      setActiveTerminalId(id)
      setTerminalVisible(true)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return session
    },
    [workspaceRoot, addTerminalSession, setActiveTerminalId, setTerminalVisible]
  )

  const handleNewSession = useCallback(() => {
    createSession(`终端 ${terminalSessions.length + 1}`)
  }, [terminalSessions.length, createSession])

  const handleActivateSession = useCallback(
    (id: string) => {
      setActiveTerminalId(id)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    },
    [setActiveTerminalId]
  )

  const handleCloseSession = useCallback(
    (id: string) => {
      removeTerminalSession(id)
      if (terminalSessions.length === 1) {
        setTerminalVisible(false)
      }
    },
    [removeTerminalSession, terminalSessions.length, setTerminalVisible]
  )

  const handleClear = useCallback(() => {
    if (activeTerminalId) {
      updateTerminalSession(activeTerminalId, { lines: [] })
    }
  }, [activeTerminalId, updateTerminalSession])

  const handleStopProcess = useCallback(() => {
    showToast('停止功能需要进程 PID 管理，当前版本暂不支持强制 kill', 'info')
  }, [showToast])

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!activeSession) return

      if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = inputRef.current?.value.trim() ?? ''
        if (!cmd) return

        if (inputRef.current) inputRef.current.value = ''
        const commandLine: TerminalLine = { text: `${shortCwd(activeSession.cwd)} $ ${cmd}`, cls: 'system' }
        updateTerminalSession(activeSession.id, {
          lines: [...activeSession.lines, commandLine],
          history: [cmd, ...activeSession.history.slice(0, 199)],
          historyIdx: -1,
        })

        if (cmd === 'clear' || cmd === 'cls') {
          updateTerminalSession(activeSession.id, { lines: [] })
          return
        }

        const cdMatch = cmd.match(/^cd(?:\s+(.+))?$/)
        if (cdMatch) {
          const target = cdMatch[1]?.trim() || workspaceRoot || '~'
          const resolved =
            target === '~'
              ? workspaceRoot ?? null
              : target.startsWith('/')
                ? target
                : activeSession.cwd
                  ? activeSession.cwd + '/' + target
                  : target
          updateTerminalSession(activeSession.id, { cwd: resolved })
          return
        }

        const execId = nextId()
        setCurrentProcessId(execId)
        addPendingProcess(execId)

        try {
          await shellExec(execId, cmd, activeSession.cwd ?? undefined)
        } catch (err) {
          const errorLine: TerminalLine = { text: `错误: ${err}`, cls: 'stderr' }
          updateTerminalSession(activeSession.id, {
            lines: [...activeSession.lines, errorLine],
          })
          removePendingProcess(execId)
          setCurrentProcessId(null)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (!activeSession.history.length) return
        const newIdx = Math.min(activeSession.historyIdx + 1, activeSession.history.length - 1)
        updateTerminalSession(activeSession.id, { historyIdx: newIdx })
        if (inputRef.current) {
          inputRef.current.value = activeSession.history[newIdx]
          inputRef.current.selectionStart = inputRef.current.selectionEnd = inputRef.current.value.length
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (activeSession.historyIdx <= 0) {
          updateTerminalSession(activeSession.id, { historyIdx: -1 })
          if (inputRef.current) inputRef.current.value = ''
          return
        }
        const newIdx = activeSession.historyIdx - 1
        updateTerminalSession(activeSession.id, { historyIdx: newIdx })
        if (inputRef.current) {
          inputRef.current.value = activeSession.history[newIdx]
        }
      }
    },
    [activeSession, workspaceRoot, updateTerminalSession, addPendingProcess, removePendingProcess]
  )

  useEffect(() => {
    const handleMenuAction = async (e: CustomEvent<string>) => {
      const action = e.detail

      if (action === 'run-python' || action === 'run-node') {
        window.dispatchEvent(new CustomEvent('request-code', { detail: { type: action } }))
      } else if (action === 'execute-curl') {
        window.dispatchEvent(new CustomEvent('request-curl'))
      } else if (action === 'toggle-terminal') {
        if (terminalVisible) {
          setTerminalVisible(false)
        } else {
          if (terminalSessions.length === 0) {
            createSession(`终端 1`)
          } else {
            setTerminalVisible(true)
            setTimeout(() => {
              inputRef.current?.focus()
            }, 50)
          }
        }
      }
    }

    const handleTerminalAction = async (e: CustomEvent<{ type: string; code?: string; curl?: string }>) => {
      const { type, code, curl } = e.detail

      if (type === 'run-python' && code) {
        const session = createSession('🐍 Python')
        const execId = nextId()
        setCurrentProcessId(execId)
        addPendingProcess(execId)

        const infoLine: TerminalLine = { text: `$ python3 -c "${code.slice(0, 50)}..."`, cls: 'system' }
        const cwdLine: TerminalLine = { text: `工作目录: ${session.cwd ?? '~'}`, cls: 'system' }
        updateTerminalSession(session.id, { lines: [infoLine, cwdLine, { text: '', cls: '' }] })

        try {
          await executeCommandStream(execId, 'python3', ['-c', code], session.cwd ?? undefined)
        } catch (err) {
          const errorLine: TerminalLine = { text: `启动失败: ${err}`, cls: 'stderr' }
          updateTerminalSession(session.id, { lines: [...session.lines, errorLine] })
          removePendingProcess(execId)
          setCurrentProcessId(null)
        }
      } else if (type === 'run-node' && code) {
        const session = createSession('🟢 Node')
        const execId = nextId()
        setCurrentProcessId(execId)
        addPendingProcess(execId)

        const infoLine: TerminalLine = { text: `$ node -e "${code.slice(0, 50)}..."`, cls: 'system' }
        const cwdLine: TerminalLine = { text: `工作目录: ${session.cwd ?? '~'}`, cls: 'system' }
        updateTerminalSession(session.id, { lines: [infoLine, cwdLine, { text: '', cls: '' }] })

        try {
          await executeCommandStream(execId, 'node', ['-e', code], session.cwd ?? undefined)
        } catch (err) {
          const errorLine: TerminalLine = { text: `启动失败: ${err}`, cls: 'stderr' }
          updateTerminalSession(session.id, { lines: [...session.lines, errorLine] })
          removePendingProcess(execId)
          setCurrentProcessId(null)
        }
      } else if (type === 'execute-curl' && curl) {
        const normalizedCurl = normalizeCurl(curl)
        const session = createSession('⚡ curl')
        const execId = nextId()
        setCurrentProcessId(execId)
        addPendingProcess(execId)

        const cmdLine: TerminalLine = { text: `$ ${normalizedCurl}`, cls: 'system' }
        updateTerminalSession(session.id, { lines: [cmdLine, { text: '', cls: '' }] })

        try {
          await executeCurl(execId, normalizedCurl)
        } catch (err) {
          const errorLine: TerminalLine = { text: `curl 失败: ${err}`, cls: 'stderr' }
          updateTerminalSession(session.id, { lines: [...session.lines, errorLine] })
          removePendingProcess(execId)
          setCurrentProcessId(null)
        }
      } else if (type === 'run-file') {
        const detail = e.detail as unknown as { type: string; filePath?: string; language?: string }
        const filePath = detail.filePath
        const language = detail.language
        if (!filePath || !language) return

        const program = language === 'py' ? 'python3' : 'node'
        const label = language === 'py' ? '🐍 Python' : '🟢 Node'
        const session = createSession(label)
        const execId = nextId()
        setCurrentProcessId(execId)
        addPendingProcess(execId)

        const infoLine: TerminalLine = { text: `$ ${program} ${filePath}`, cls: 'system' }
        const cwdLine: TerminalLine = { text: `工作目录: ${session.cwd ?? '~'}`, cls: 'system' }
        updateTerminalSession(session.id, { lines: [infoLine, cwdLine, { text: '', cls: '' }] })

        try {
          await executeCommandStream(execId, program, [filePath], session.cwd ?? undefined)
        } catch (err) {
          const errorLine: TerminalLine = { text: `启动失败: ${err}`, cls: 'stderr' }
          updateTerminalSession(session.id, { lines: [...session.lines, errorLine] })
          removePendingProcess(execId)
          setCurrentProcessId(null)
        }
      }
    }

    window.addEventListener('menu-action', handleMenuAction as unknown as EventListener)
    window.addEventListener('terminal-action', handleTerminalAction as unknown as EventListener)

    return () => {
      window.removeEventListener('menu-action', handleMenuAction as unknown as EventListener)
      window.removeEventListener('terminal-action', handleTerminalAction as unknown as EventListener)
    }
  }, [
    terminalVisible,
    terminalSessions.length,
    setTerminalVisible,
    createSession,
    addPendingProcess,
    removePendingProcess,
    updateTerminalSession,
  ])

  if (!terminalVisible) return null

  return (
    <div
      className={`${styles.terminalContainer} ${styles.visible}`}
      style={{ height: `${terminalHeight}px` }}
    >
      <div className={styles.terminalHeader}>
        <div className={styles.terminalTabs}>
          {terminalSessions.map((session) => (
            <div
              key={session.id}
              className={`${styles.termTab} ${session.id === activeTerminalId ? styles.active : ''}`}
              onClick={() => handleActivateSession(session.id)}
            >
              <span>{session.label}</span>
              <span className={styles.termTabClose} onClick={(e) => { e.stopPropagation(); handleCloseSession(session.id) }}>
                ×
              </span>
            </div>
          ))}
        </div>
        <button className={styles.termAddBtn} onClick={handleNewSession} title="新终端会话">
          +
        </button>
        <div className={styles.terminalActions}>
          <button className={styles.termActionBtn} onClick={handleClear} title="清空">
            ⌫
          </button>
          <button
            className={`${styles.termActionBtn} ${pendingProcessIds.size > 0 ? styles.active : ''}`}
            onClick={handleStopProcess}
            title="停止进程"
          >
            ◯
          </button>
          <button className={styles.termActionBtn} onClick={() => setTerminalVisible(false)} title="隐藏">
            ✕
          </button>
        </div>
      </div>
      <div ref={outputRef} className={styles.terminalOutput}>
        {activeSession && <TerminalSessionComponent lines={activeSession.lines} />}
      </div>
      <div className={styles.terminalInputBar}>
        <span className={styles.terminalPrompt}>{shortCwd(activeSession?.cwd)} $ </span>
        <input
          ref={inputRef}
          className={styles.terminalInput}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="输入命令…"
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  )
}

function shortCwd(cwd: string | null | undefined): string {
  if (!cwd) return '~'
  const home = window.localStorage.getItem('homeDir')
  if (home && cwd === home) return '~'
  if (home && cwd.startsWith(home + '/')) return '~/' + cwd.slice(home.length + 1)
  const parts = cwd.split('/')
  return parts[parts.length - 1] || '/'
}

function normalizeCurl(raw: string): string {
  return raw.replace(/\\\n\s*/g, ' ').replace(/\n\s*/g, ' ').trim()
}