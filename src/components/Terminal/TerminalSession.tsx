import React, { useEffect, useRef } from 'react'
import type { TerminalLine } from '../../types'
import styles from './Terminal.module.css'

const MAX_LINES = 5000

interface TerminalSessionProps {
  lines: TerminalLine[]
}

export const TerminalSession: React.FC<TerminalSessionProps> = ({ lines }) => {
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  const displayLines = lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines

  return (
    <div className={styles.terminalOutput} ref={outputRef}>
      {displayLines.map((line, idx) => (
        <div key={idx} className={`${styles.termLine} ${getLineClass(line.cls)}`}>
          <span className={styles.termText}>{parseANSI(line.text)}</span>
        </div>
      ))}
    </div>
  )
}

function getLineClass(cls: string): string {
  switch (cls) {
    case 'stderr':
      return styles.stderr
    case 'exit-ok':
      return styles.exitOk
    case 'exit-err':
      return styles.exitErr
    case 'system':
      return styles.system
    case 'info':
      return styles.info
    case 'success':
      return styles.success
    default:
      return ''
  }
}

function parseANSI(text: string): React.ReactNode {
  const ansiRegex = /\x1b\[([0-9;]+)m/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let currentStyle = ''

  while ((match = ansiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plainText = text.slice(lastIndex, match.index)
      parts.push(
        currentStyle ? (
          <span className={currentStyle}>{plainText}</span>
        ) : (
          plainText
        )
      )
    }

    const codes = match[1].split(';').map(Number)
    currentStyle = applyANSICodes(codes, currentStyle)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex)
    parts.push(
      currentStyle ? (
        <span className={currentStyle}>{remaining}</span>
      ) : (
        remaining
      )
    )
  }

  return parts.length > 0 ? parts : text
}

function applyANSICodes(codes: number[], currentStyle: string): string {
  const styleClasses: string[] = currentStyle ? currentStyle.split(' ').filter(Boolean) : []

  for (const code of codes) {
    switch (code) {
      case 0:
        return ''
      case 1:
        if (!styleClasses.includes(styles.ansiBold)) {
          styleClasses.push(styles.ansiBold)
        }
        break
      case 30:
        styleClasses.push(styles.ansiBlack)
        break
      case 31:
        styleClasses.push(styles.ansiRed)
        break
      case 32:
        styleClasses.push(styles.ansiGreen)
        break
      case 33:
        styleClasses.push(styles.ansiYellow)
        break
      case 34:
        styleClasses.push(styles.ansiBlue)
        break
      case 35:
        styleClasses.push(styles.ansiMagenta)
        break
      case 36:
        styleClasses.push(styles.ansiCyan)
        break
      case 37:
        styleClasses.push(styles.ansiWhite)
        break
      default:
        break
    }
  }

  return styleClasses.join(' ')
}