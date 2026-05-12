import { useActiveTab, useWorkspaceRoot, useStore } from '../../store'
import { getLanguageName } from '../../utils/langUtils'
import styles from './StatusBar.module.css'

/**
 * 状态栏组件 - 显示文件信息、光标位置、语言、编码等
 * 参考 main.js.bak updateStatusBar 函数（行 196-243）
 */
export function StatusBar() {
  const activeTab = useActiveTab()
  const workspaceRoot = useWorkspaceRoot()
  const fontSize = useStore((s) => s.fontSize)
  const setFontSize = useStore((s) => s.setFontSize)

  // 获取文件路径信息
  const filePath = activeTab?.path
  const fileName = activeTab?.title || ''

  // 外部文件判断：工作区外且不是工作区根目录
  const isExternal = filePath && workspaceRoot &&
    !filePath.startsWith(workspaceRoot + '/') &&
    filePath !== workspaceRoot

  // 显示的文件名/路径
  const displayFileName = isExternal
    ? `↗ ${filePath}`
    : fileName

  // 获取语言名称
  const languageName = activeTab?.path
    ? getLanguageName(activeTab.path)
    : 'Plain Text'

  // 光标位置 / 图片元信息
  let positionText: string
  if (activeTab?.isImage && activeTab?.imageData) {
    const d = activeTab.imageData
    const sizeStr = d.size < 1024 * 1024
      ? `${(d.size / 1024).toFixed(1)} KB`
      : `${(d.size / (1024 * 1024)).toFixed(2)} MB`
    const dimStr = (d.width && d.height) ? `${d.width} × ${d.height}` : '尺寸未知'
    positionText = `${dimStr}  ${sizeStr}  ${d.extension.toUpperCase()}`
  } else {
    const cursorPos = activeTab?.cursorPos
    positionText = cursorPos
      ? `行 ${cursorPos.line + 1}，列 ${cursorPos.ch + 1}`
      : '行 1，列 1'
  }

  // 字体缩放处理
  const handleZoomOut = () => {
    const newSize = fontSize - 0.5
    if (newSize >= 8) {
      setFontSize(newSize)
    }
  }

  const handleZoomIn = () => {
    const newSize = fontSize + 0.5
    if (newSize <= 32) {
      setFontSize(newSize)
    }
  }

  // 点击语言名称（暂时 noop，后续扩展）
  const handleLanguageClick = () => {
    // TODO: 触发语言选择器
  }

  return (
    <div className={styles.statusBar}>
      {/* 左侧：语言 + 文件路径 */}
      <span
        className={`${styles.statusItem} ${styles.clickable}`}
        onClick={handleLanguageClick}
        title="点击切换语言"
      >
        {languageName}
      </span>

      <span
        className={`${styles.statusItem} ${styles.statusFile} ${isExternal ? styles.external : ''}`}
        title={filePath || '未打开文件'}
      >
        {displayFileName || '未打开文件'}
      </span>

      {/* 右侧：光标 + 编码 + 行尾 + 字体缩放 */}
      <div className={styles.statusRight}>
        <span className={styles.statusItem}>
          {positionText}
        </span>

        <span className={`${styles.statusItem} ${styles.clickable}`}>
          UTF-8
        </span>

        <span className={`${styles.statusItem} ${styles.clickable}`}>
          LF
        </span>

        {/* 字体缩放按钮 */}
        <span className={styles.statusItem}>
          <button
            className={styles.zoomBtn}
            onClick={handleZoomOut}
            title="缩小字体"
            disabled={fontSize <= 8}
          >
            A-
          </button>
          <span className={styles.fontSizeText}>
            {fontSize.toFixed(1)}
          </span>
          <button
            className={styles.zoomBtn}
            onClick={handleZoomIn}
            title="放大字体"
            disabled={fontSize >= 32}
          >
            A+
          </button>
        </span>
      </div>
    </div>
  )
}