import React, { useEffect, useRef } from 'react'
import { useStore } from '../../store'
import styles from './Modal.module.css'

export function Modal() {
  const modalState = useStore((s) => s.ui.modalState)
  const closeModal = useStore((s) => s.closeModal)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (modalState.isOpen && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [modalState.isOpen])

  if (!modalState.isOpen) return null

  const handleConfirm = () => {
    const value = inputRef.current?.value.trim() || ''
    if (modalState.onConfirm) {
      modalState.onConfirm(value)
    }
    closeModal()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      closeModal()
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeModal()
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <h3>{modalState.title}</h3>
        <label>{modalState.label}</label>
        <input
          ref={inputRef}
          type="text"
          defaultValue={modalState.defaultVal}
          onKeyDown={handleKeyDown}
          onBlur={(e) => e.target.focus()}
        />
        <div className={styles.modalBtns}>
          <button className={styles.btnGhost} onClick={closeModal}>
            取消
          </button>
          <button className={styles.btnPrimary} onClick={handleConfirm}>
            {modalState.confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
