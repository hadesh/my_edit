/**
 * Toast.tsx - Toast 通知组件
 * 显示短暂通知消息（成功/错误/信息），自动消失
 */

import React, { useEffect } from 'react'
import { useStore } from '../../store'
import styles from './Toast.module.css'

interface ToastItem {
  id: string
  msg: string
  type: 'success' | 'error' | 'info'
  duration: number
}

function ToastItemComponent({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id)
    }, toast.duration)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  return (
    <div className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}>
      {toast.msg}
    </div>
  )
}

export function Toast() {
  const toastQueue = useStore((s) => s.ui.toastQueue)
  const dismissToast = useStore((s) => s.dismissToast)

  if (toastQueue.length === 0) return null

  return (
    <div className={styles.toastContainer}>
      {toastQueue.map((toast) => (
        <ToastItemComponent key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  )
}
