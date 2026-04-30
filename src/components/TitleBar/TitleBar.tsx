import { MenuBar } from './MenuBar'
import styles from './TitleBar.module.css'

export function TitleBar() {
  return (
    <div
      className={styles.titleBar}
      data-tauri-drag-region
    >
      <MenuBar />
    </div>
  )
}