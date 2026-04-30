import { useEffect, useRef, useState } from 'react'
import { useStore, useActiveTab } from '../../store'
import { marked } from 'marked'
import styles from './PreviewPanel.module.css'

// JSON 语法高亮函数
// 字符串→绿色，数字→蓝色，布尔/null→橙色，键名→紫色
function syntaxHighlightJSON(json: string): string {
  // 转义 HTML 特殊字符
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped.replace(
    /(".*?"|\b\d+\.?\d*\b|\b(true|false|null)\b|[{}\[\],:])/g,
    (match) => {
      if (match.match(/^".*?"$/)) {
        // 检查是否是键名（后面跟着冒号）
        if (match.match(/^"[^"]+"\s*:$/)) {
          return `<span class="${styles.jsonKey}">${match}</span>`
        }
        return `<span class="${styles.jsonString}">${match}</span>`
      }
      if (match.match(/^\d+\.?\d*$/)) {
        return `<span class="${styles.jsonNumber}">${match}</span>`
      }
      if (match === 'true' || match === 'false') {
        return `<span class="${styles.jsonBool}">${match}</span>`
      }
      if (match === 'null') {
        return `<span class="${styles.jsonNull}">${match}</span>`
      }
      return match
    }
  )
}

// 检测文件类型
function getFileLanguage(path: string | null): string {
  if (!path) return 'unknown'
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (ext === 'json') return 'json'
  return 'unknown'
}

export const PreviewPanel: React.FC = () => {
  const previewVisible = useStore((s) => s.ui.previewVisible)
  const setPreviewVisible = useStore((s) => s.setPreviewVisible)
  const activeTab = useActiveTab()

  const [content, setContent] = useState<string>('')
  const [language, setLanguage] = useState<string>('unknown')
  const [htmlContent, setHtmlContent] = useState<string>('')
  const [jsonContent, setJsonContent] = useState<string>('')

  // debounce 定时器
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 监听 preview-update 事件
  useEffect(() => {
    const handlePreviewUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return

      const { content: newContent, language: newLanguage } = detail

      // 清除之前的定时器
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }

      // debounce 300ms
      debounceTimer.current = setTimeout(() => {
        setContent(newContent || '')
        setLanguage(newLanguage || 'unknown')
      }, 300)
    }

    window.addEventListener('preview-update', handlePreviewUpdate)

    return () => {
      window.removeEventListener('preview-update', handlePreviewUpdate)
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [])

  // 当 activeTab 变化时，根据文件类型更新预览
  useEffect(() => {
    if (!activeTab) {
      setLanguage('unknown')
      setContent('')
      return
    }

    const lang = getFileLanguage(activeTab.path)
    setLanguage(lang)

    if (lang === 'json') {
      // 尝试格式化 JSON
      try {
        const parsed = JSON.parse(activeTab.content)
        const formatted = JSON.stringify(parsed, null, 2)
        setContent(formatted)
      } catch {
        // JSON 解析失败，显示原始内容
        setContent(activeTab.content)
      }
    } else if (lang === 'markdown') {
      setContent(activeTab.content)
    } else {
      setContent('')
      setLanguage('unknown')
    }
  }, [activeTab])

  // 渲染 Markdown 或 JSON
  useEffect(() => {
    if (!content) {
      setHtmlContent('')
      setJsonContent('')
      return
    }

    if (language === 'markdown') {
      const html = marked(content) as string
      setHtmlContent(html)
      setJsonContent('')
    } else if (language === 'json') {
      const highlighted = syntaxHighlightJSON(content)
      setJsonContent(highlighted)
      setHtmlContent('')
    } else {
      setHtmlContent('')
      setJsonContent('')
    }
  }, [content, language])

  // 关闭预览面板
  const handleClose = () => {
    setPreviewVisible(false)
  }

  // 如果没有打开预览或没有内容可预览，不显示
  if (!previewVisible) {
    return null
  }

  // 如果没有可预览的内容，显示空状态
  if (language === 'unknown' || (!htmlContent && !jsonContent)) {
    return (
      <div className={styles.previewPanel}>
        <div className={styles.previewHeader}>
          <span>👁</span>
          <span>预览</span>
          <button className={styles.closeBtn} onClick={handleClose} title="关闭">
            ×
          </button>
        </div>
        <div className={styles.previewContent}>
          <div className={styles.emptyState}>
            当前文件不支持预览
            <br />
            <span className={styles.emptyHint}>仅支持 Markdown 和 JSON 文件</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewHeader}>
        <span>👁</span>
        <span>预览</span>
        {language === 'json' && <span className={styles.fileType}>JSON</span>}
        {language === 'markdown' && <span className={styles.fileType}>Markdown</span>}
        <button className={styles.closeBtn} onClick={handleClose} title="关闭">
          ×
        </button>
      </div>
      <div className={styles.previewContent}>
        {language === 'markdown' && htmlContent && (
          <div
            className={styles.markdownContent}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
        {language === 'json' && jsonContent && (
          <pre className={styles.jsonContent}>
            <code dangerouslySetInnerHTML={{ __html: jsonContent }} />
          </pre>
        )}
      </div>
    </div>
  )
}
