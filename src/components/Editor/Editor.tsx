/**
 * Editor 组件 - CodeMirror 6 封装，支持图片预览模式
 */

import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useActiveTab, useStore } from '../../store'
import { useCodeMirror } from '../../hooks/useCodeMirror'
import { getExtension, getLanguageName } from '../../utils/langUtils'
import styles from './Editor.module.css'

// Tauri 类型声明
declare global {
  interface Window {
    __TAURI__: {
      core: {
        invoke: (cmd: string, args?: Record<string, any>) => Promise<any>
      }
    }
  }
}

// 图片文件扩展名
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp']

/** 判断是否为图片文件 */
function isImageFile(path: string): boolean {
  return IMAGE_EXTS.some(ext => path.toLowerCase().endsWith(ext))
}

/** 从路径获取纯文件名 */
function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1]
}

// Editor 组件对外暴露的方法
export interface EditorRef {
  focus: () => void
  getSelection: () => string
}

interface EditorProps {
  className?: string
}

const Editor = forwardRef<EditorRef, EditorProps>((props, ref) => {
  const activeTab = useActiveTab()
  const store = useStore()

  // 图片预览状态
  const imagePanelRef = useRef<HTMLDivElement>(null)
  const imageImgRef = useRef<HTMLImageElement>(null)
  const imageZoomRef = useRef<HTMLDivElement>(null)
  const imageStateRef = useRef<{
    scale: number
    tx: number
    ty: number
    dragStart: { x: number; y: number } | null
    dragOrigin: { tx: number; ty: number } | null
    didDrag: boolean
    listenersAttached: boolean
  }>({
    scale: 1,
    tx: 0,
    ty: 0,
    dragStart: null,
    dragOrigin: null,
    didDrag: false,
    listenersAttached: false,
  })

  // CodeMirror hook
  const cm = useCodeMirror({
    initialValue: activeTab?.content ?? '',
    extension: activeTab?.path ? getExtension(activeTab.path) : '',
    fontSize: store.fontSize,
    onChange: (value) => {
      if (activeTab && !activeTab.isImage) {
        store.updateTab(activeTab.id, { content: value, dirty: value !== activeTab.savedContent })
      }
    },
    onCursorChange: (line, ch) => {
      if (activeTab && !activeTab.isImage) {
        store.updateTab(activeTab.id, { cursorPos: { line, ch } })
      }
    },
  })

  // 暴露 focus 方法给父组件
  useImperativeHandle(ref, () => ({
    focus: () => cm.focus(),
    getSelection: () => cm.getSelection(),
  }))

  // ── curl 选中浮窗 ──────────────────────────────────────────────
  const [curlTooltip, setCurlTooltip] = useState<{ top: number; left: number; text: string } | null>(null)

  const checkCurlSelection = useCallback(() => {
    const sel = cm.getSelection().trim()
    if (sel && (sel.startsWith('curl ') || sel.startsWith('curl\n'))) {
      const coords = cm.getCursorCoords()
      if (coords) {
        setCurlTooltip({
          top: coords.bottom + 4,
          left: coords.left,
          text: sel.length > 40 ? sel.slice(0, 40) + '…' : sel,
        })
        return
      }
    }
    setCurlTooltip(null)
  }, [cm])

  useEffect(() => {
    if (!activeTab || activeTab.isImage) {
      setCurlTooltip(null)
      return
    }
    const container = cm.containerRef.current
    if (!container) return

    const onMouseUp = () => setTimeout(checkCurlSelection, 10)
    container.addEventListener('mouseup', onMouseUp)
    return () => container.removeEventListener('mouseup', onMouseUp)
  }, [activeTab, cm, checkCurlSelection])

  const handleCurlClick = useCallback(() => {
    const sel = cm.getSelection().trim()
    if (!sel) return
    setCurlTooltip(null)
    const normalized = sel.replace(/\\\n\s*/g, ' ').replace(/\n\s*/g, ' ').trim()
    window.dispatchEvent(new CustomEvent('terminal-action', {
      detail: { type: 'execute-curl', curl: normalized },
    }))
  }, [cm])

  // Tab 切换时同步编辑器状态
  useEffect(() => {
    if (!activeTab || activeTab.isImage) return
    
    // 同步内容
    cm.setValue(activeTab.content, true)
    // 同步光标
    cm.setCursor(activeTab.cursorPos.line, activeTab.cursorPos.ch)
    // 同步语言扩展名
    if (activeTab.path) {
      cm.setExtension(getExtension(activeTab.path))
    }
    // 聚焦编辑器
    cm.focus()
  }, [activeTab?.id]) // 仅在 tab id 变化时触发

  // 字体大小变化时更新编辑器
  useEffect(() => {
    cm.setFontSize(store.fontSize)
  }, [store.fontSize])

  // ── 图片预览逻辑 ───────────────────────────────────────────────

  const ZOOM_STEP = 0.1
  const MIN_ZOOM = 0.05
  const MAX_ZOOM = 16
  const CLICK_THRESHOLD = 4
  const ZOOM_IN_SCALE = 2

  const applyTransform = useCallback(() => {
    if (!imageImgRef.current) return
    const { scale, tx, ty } = imageStateRef.current
    imageImgRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }, [])

  const fitToPanel = useCallback(() => {
    const panel = imagePanelRef.current
    const img = imageImgRef.current
    if (!panel || !img) return
    
    const pw = panel.clientWidth
    const ph = panel.clientHeight
    const iw = img.naturalWidth || img.clientWidth || 1
    const ih = img.naturalHeight || img.clientHeight || 1
    const fit = Math.min(1, pw / iw, ph / ih) * 0.9
    
    imageStateRef.current.scale = fit
    imageStateRef.current.tx = (pw - iw * fit) / 2
    imageStateRef.current.ty = (ph - ih * fit) / 2
    applyTransform()
  }, [applyTransform])

  const showZoomIndicator = useCallback(() => {
    if (!imageZoomRef.current) return
    const { scale } = imageStateRef.current
    imageZoomRef.current.textContent = Math.round(scale * 100) + '%'
    imageZoomRef.current.classList.add(styles.visible)
    window.clearTimeout((imageZoomRef.current as any)._hideTimer)
    ;(imageZoomRef.current as any)._hideTimer = window.setTimeout(() => {
      imageZoomRef.current?.classList.remove(styles.visible)
    }, 1200)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.metaKey && !e.ctrlKey) return
    e.preventDefault()

    const panel = imagePanelRef.current
    if (!panel) return

    const rect = panel.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const prevScale = imageStateRef.current.scale
    const factor = e.deltaY < 0 ? (1 + ZOOM_STEP) : (1 - ZOOM_STEP)
    imageStateRef.current.scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevScale * factor))

    const scale = imageStateRef.current.scale
    imageStateRef.current.tx = mouseX - (mouseX - imageStateRef.current.tx) * (scale / prevScale)
    imageStateRef.current.ty = mouseY - (mouseY - imageStateRef.current.ty) * (scale / prevScale)

    applyTransform()
    showZoomIndicator()
  }, [applyTransform, showZoomIndicator])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    imageStateRef.current.dragStart = { x: e.clientX, y: e.clientY }
    imageStateRef.current.dragOrigin = { 
      tx: imageStateRef.current.tx, 
      ty: imageStateRef.current.ty 
    }
    imageStateRef.current.didDrag = false
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!imageStateRef.current.dragStart) return
    const dx = e.clientX - imageStateRef.current.dragStart.x
    const dy = e.clientY - imageStateRef.current.dragStart.y
    const panel = imagePanelRef.current
    
    if (!imageStateRef.current.didDrag && Math.hypot(dx, dy) > CLICK_THRESHOLD) {
      imageStateRef.current.didDrag = true
      panel?.classList.add(styles.dragging)
      if (panel) panel.style.cursor = ''
    }
    
    if (imageStateRef.current.dragOrigin) {
      imageStateRef.current.tx = imageStateRef.current.dragOrigin.tx + dx
      imageStateRef.current.ty = imageStateRef.current.dragOrigin.ty + dy
      applyTransform()
    }
  }, [applyTransform])

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!imageStateRef.current.dragStart) return
    const panel = imagePanelRef.current
    if (!panel) return
    
    panel.classList.remove(styles.dragging)
    panel.style.cursor = Math.abs(imageStateRef.current.scale - ZOOM_IN_SCALE) < 0.05 ? 'zoom-out' : 'zoom-in'
    
    if (!imageStateRef.current.didDrag) {
      const rect = panel.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const prevScale = imageStateRef.current.scale
      
      if (Math.abs(imageStateRef.current.scale - ZOOM_IN_SCALE) < 0.05) {
        fitToPanel()
        panel.style.cursor = 'zoom-in'
      } else {
        imageStateRef.current.scale = ZOOM_IN_SCALE
        imageStateRef.current.tx = mouseX - (mouseX - imageStateRef.current.tx) * (ZOOM_IN_SCALE / prevScale)
        imageStateRef.current.ty = mouseY - (mouseY - imageStateRef.current.ty) * (ZOOM_IN_SCALE / prevScale)
        applyTransform()
        panel.style.cursor = 'zoom-out'
      }
      showZoomIndicator()
    }
    
    imageStateRef.current.dragStart = null
  }, [applyTransform, fitToPanel, showZoomIndicator])

  const handleDoubleClick = useCallback(() => {
    fitToPanel()
    if (imagePanelRef.current) {
      imagePanelRef.current.style.cursor = 'zoom-in'
    }
    showZoomIndicator()
  }, [fitToPanel, showZoomIndicator])

  const handleImageLoad = useCallback(() => {
    if (!activeTab?.imageData) return
    
    // 如果尺寸未知，从图片自然尺寸更新
    const img = imageImgRef.current
    if (img && activeTab.imageData.width === 0 && img.naturalWidth) {
      store.updateTab(activeTab.id, {
        imageData: {
          ...activeTab.imageData,
          width: img.naturalWidth,
          height: img.naturalHeight,
        }
      })
    }
    fitToPanel()
  }, [activeTab, store, fitToPanel])

  // 图片预览激活/停用时的事件监听器管理
  useEffect(() => {
    if (!activeTab?.isImage) {
      // 停用图片预览：移除全局事件监听器
      if (imageStateRef.current.listenersAttached) {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        imageStateRef.current.listenersAttached = false
      }
      return
    }

    // 激活图片预览：添加全局事件监听器
    if (!imageStateRef.current.listenersAttached) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      imageStateRef.current.listenersAttached = true
    }

    // 初始化图片预览状态
    imageStateRef.current.scale = 1
    imageStateRef.current.tx = 0
    imageStateRef.current.ty = 0
    imageStateRef.current.dragStart = null
    imageStateRef.current.didDrag = false

    // 设置初始光标样式
    if (imagePanelRef.current) {
      imagePanelRef.current.style.cursor = 'zoom-in'
    }

    // 清理函数
    return () => {
      if (imageStateRef.current.listenersAttached) {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        imageStateRef.current.listenersAttached = false
      }
    }
  }, [activeTab?.isImage, handleMouseMove, handleMouseUp])

  // ── menu-action 事件监听 ───────────────────────────────────────

  useEffect(() => {
    const handleMenuAction = async (e: CustomEvent) => {
      const action = e.detail as string
      
      // 仅处理编辑器相关命令
      switch (action) {
        case 'save':
          if (activeTab && activeTab.path && !activeTab.isImage) {
            try {
              const { invoke } = window.__TAURI__.core
              await invoke('write_file', { path: activeTab.path, content: activeTab.content })
              store.updateTab(activeTab.id, { 
                dirty: false, 
                savedContent: activeTab.content 
              })
              store.showToast(`已保存 ${basename(activeTab.path)}`, 'success')
            } catch (err) {
              store.showToast(`保存失败: ${err}`, 'error')
            }
          }
          break
        
        case 'format-json':
          if (activeTab && !activeTab.isImage) {
            const selection = cm.getSelection()
            const text = selection || activeTab.content
            try {
              const parsed = JSON.parse(text)
              const formatted = JSON.stringify(parsed, null, 2)
              if (selection) {
                cm.replaceSelection(formatted)
              } else {
                cm.setValue(formatted)
              }
              store.showToast('JSON 已格式化', 'success')
            } catch (err) {
              store.showToast(`JSON 格式错误: ${err}`, 'error')
            }
          }
          break
        
        case 'toggle-comment':
          if (activeTab && !activeTab.isImage) {
            cm.toggleComment()
          }
          break
      }
    }

    window.addEventListener('menu-action', handleMenuAction as unknown as EventListener)
    return () => {
      window.removeEventListener('menu-action', handleMenuAction as unknown as EventListener)
    }
  }, [activeTab, store, cm])

  // ── 渲染 ───────────────────────────────────────────────────────

  // 单一 return，始终渲染 CM 容器，确保 ref 挂载后 useEffect 能初始化 EditorView
  return (
    <div className={`${styles.wrapper} ${props.className ?? ''}`}>
      <div
        ref={cm.containerRef as any}
        className={styles.editorContainer}
        style={{ display: activeTab && !activeTab.isImage ? 'block' : 'none' }}
      />
      {!activeTab && (
        <div className={styles.placeholder}>
          <div className={styles.logo}>✏️</div>
          <div className={styles.tagline}>MyEdit</div>
          <div className={styles.hints}>
            <kbd>⌘O</kbd> 打开文件　<kbd>⌘N</kbd> 新建文件<br />
            <kbd>⌘⇧O</kbd> 打开文件夹　<kbd>⌘S</kbd> 保存<br />
            <kbd>⌘`</kbd> 打开终端　<kbd>⌘F</kbd> 查找
          </div>
        </div>
      )}
      {curlTooltip && (
        <div
          className={styles.curlTooltip}
          style={{ top: curlTooltip.top, left: curlTooltip.left }}
          onClick={handleCurlClick}
        >
          ⚡ 执行 curl
        </div>
      )}
      {activeTab?.isImage && (
        <div
          ref={imagePanelRef}
          className={styles.imagePanel}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
        >
          <img
            ref={imageImgRef}
            className={styles.imageImg}
            src={`data:${activeTab.imageData?.mime};base64,${activeTab.imageData?.data}`}
            alt={activeTab.title}
            onLoad={handleImageLoad}
            draggable={false}
          />
          <div ref={imageZoomRef} className={styles.zoomIndicator}>
            100%
          </div>
        </div>
      )}
    </div>
  )
})

Editor.displayName = 'Editor'

export default Editor