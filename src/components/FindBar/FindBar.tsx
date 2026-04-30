import { useEffect, useRef, useCallback } from 'react'
import { useStore, useFindState } from '../../store'
import styles from './FindBar.module.css'

export function FindBar() {
  const findState = useFindState()
  const setFindState = useStore((s) => s.setFindState)

  const findInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (findState.isOpen && findInputRef.current) {
      findInputRef.current.focus()
      findInputRef.current.select()
    }
  }, [findState.isOpen, findState.withReplace])

  const dispatchFindAction = useCallback((
    action: 'find-next' | 'find-prev' | 'replace' | 'replace-all' | 'update',
    query?: string,
    replace?: string
  ) => {
    window.dispatchEvent(new CustomEvent('find-action', {
      detail: {
        action,
        query: query ?? findState.query,
        replace: replace ?? findState.replaceQuery,
        options: {
          matchCase: findState.caseSensitive,
          useRegex: findState.useRegex,
          wholeWord: findState.wholeWord,
        },
      },
    }))
  }, [findState])

  const handleFindNext = useCallback(() => {
    dispatchFindAction('find-next')
  }, [dispatchFindAction])

  const handleFindPrev = useCallback(() => {
    dispatchFindAction('find-prev')
  }, [dispatchFindAction])

  const handleReplaceOne = useCallback(() => {
    dispatchFindAction('replace')
  }, [dispatchFindAction])

  const handleReplaceAll = useCallback(() => {
    dispatchFindAction('replace-all')
  }, [dispatchFindAction])

  const handleClose = useCallback(() => {
    setFindState({ isOpen: false })
  }, [setFindState])

  const toggleRegex = useCallback(() => {
    const newValue = !findState.useRegex
    setFindState({ useRegex: newValue })
    if (findState.query) {
      dispatchFindAction('update', findState.query, findState.replaceQuery)
    }
  }, [findState, setFindState, dispatchFindAction])

  const toggleCaseSensitive = useCallback(() => {
    const newValue = !findState.caseSensitive
    setFindState({ caseSensitive: newValue })
    if (findState.query) {
      dispatchFindAction('update', findState.query, findState.replaceQuery)
    }
  }, [findState, setFindState, dispatchFindAction])

  const toggleWholeWord = useCallback(() => {
    const newValue = !findState.wholeWord
    setFindState({ wholeWord: newValue })
    if (findState.query) {
      dispatchFindAction('update', findState.query, findState.replaceQuery)
    }
  }, [findState, setFindState, dispatchFindAction])

  const handleFindInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        handleFindPrev()
      } else {
        handleFindNext()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
  }, [handleFindNext, handleFindPrev, handleClose])

  const handleReplaceInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleReplaceOne()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
  }, [handleReplaceOne, handleClose])

  const handleFindInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value
    setFindState({ query: newQuery })
    dispatchFindAction('update', newQuery, findState.replaceQuery)
  }, [findState.replaceQuery, setFindState, dispatchFindAction])

  const handleReplaceInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newReplace = e.target.value
    setFindState({ replaceQuery: newReplace })
  }, [setFindState])

  if (!findState.isOpen) {
    return null
  }

  const matchCountText = findState.matches > 0
    ? `${findState.currentMatch}/${findState.matches}`
    : findState.query ? '0/0' : ''

  return (
    <div className={styles.findBar}>
      <input
        ref={findInputRef}
        type="text"
        className={styles.input}
        placeholder="查找..."
        value={findState.query}
        onChange={handleFindInputChange}
        onKeyDown={handleFindInputKeyDown}
      />

      {findState.withReplace && (
        <>
          <span className={styles.separator}>→</span>
          <input
            ref={replaceInputRef}
            type="text"
            className={styles.input}
            placeholder="替换为..."
            value={findState.replaceQuery}
            onChange={handleReplaceInputChange}
            onKeyDown={handleReplaceInputKeyDown}
          />
        </>
      )}

      <div className={styles.optionsGroup}>
        <button
          type="button"
          className={`${styles.optionBtn} ${findState.useRegex ? styles.active : ''}`}
          onClick={toggleRegex}
          title="使用正则表达式 (.*)"
        >
          .*
        </button>

        <button
          type="button"
          className={`${styles.optionBtn} ${findState.caseSensitive ? styles.active : ''}`}
          onClick={toggleCaseSensitive}
          title="区分大小写 (Aa)"
        >
          Aa
        </button>

        <button
          type="button"
          className={`${styles.optionBtn} ${findState.wholeWord ? styles.active : ''}`}
          onClick={toggleWholeWord}
          title="全词匹配 (\b)"
        >
          \b
        </button>
      </div>

      <span className={styles.separator}>|</span>

      <div className={styles.actionsGroup}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleFindPrev}
          title="上一个 (↑)"
        >
          ↑
        </button>

        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleFindNext}
          title="下一个 (↓)"
        >
          ↓
        </button>

        {findState.withReplace && (
          <>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handleReplaceOne}
              title="替换"
            >
              Replace
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handleReplaceAll}
              title="全部替换"
            >
              Replace All
            </button>
          </>
        )}
      </div>

      <span className={styles.matchCount}>{matchCountText}</span>

      <button
        type="button"
        className={styles.closeBtn}
        onClick={handleClose}
        title="关闭 (Esc)"
      >
        ×
      </button>
    </div>
  )
}

export default FindBar
