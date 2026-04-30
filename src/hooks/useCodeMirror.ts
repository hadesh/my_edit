/**
 * useCodeMirror — CodeMirror 6 React hook
 * 
 * 功能：
 * - 语法高亮（15+ 语言，根据文件扩展名自动切换）
 * - One Dark 主题
 * - 代码折叠（foldGutter）
 * - 括号匹配与自动闭合
 * - 行号
 * - 当前行高亮
 * - 查找/替换（SearchPanel）
 * - suppressChange 机制（Tab 切换时不触发 onChange）
 */

import { useEffect, useRef, useCallback } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  LanguageSupport,
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'

// 语言支持（按需导入）
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { xml } from '@codemirror/lang-xml'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { go } from '@codemirror/lang-go'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { StreamLanguage } from '@codemirror/language'

// ─── 语言检测 ────────────────────────────────────────────────

/** 根据文件扩展名返回对应的 CM6 语言支持 */
function getLanguageExtension(ext: string): LanguageSupport | ReturnType<typeof StreamLanguage.define> | null {
  switch (ext.toLowerCase()) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript()
    case 'jsx':
      return javascript({ jsx: true })
    case 'ts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'py':
      return python()
    case 'rs':
      return rust()
    case 'md':
    case 'markdown':
      return markdown()
    case 'json':
    case 'jsonc':
      return json()
    case 'html':
    case 'htm':
      return html()
    case 'css':
      return css()
    case 'sql':
      return sql()
    case 'yaml':
    case 'yml':
      return yaml()
    case 'xml':
    case 'svg':
      return xml()
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'c':
    case 'h':
    case 'hpp':
      return cpp()
    case 'java':
      return java()
    case 'go':
      return go()
    case 'sh':
    case 'bash':
    case 'zsh':
      return StreamLanguage.define(shell)
    case 'toml':
      return StreamLanguage.define(toml)
    default:
      return null
  }
}

// ─── Hook 接口 ───────────────────────────────────────────────

export interface UseCodeMirrorOptions {
  /** 初始内容 */
  initialValue?: string
  /** 文件扩展名（用于语言检测） */
  extension?: string
  /** 字体大小（px） */
  fontSize?: number
  /** 是否只读 */
  readOnly?: boolean
  /** 内容变化回调（suppressChange 为 true 时不触发） */
  onChange?: (value: string) => void
  /** 光标变化回调 */
  onCursorChange?: (line: number, ch: number) => void
}

export interface UseCodeMirrorReturn {
  /** 挂载编辑器的容器 ref */
  containerRef: React.RefObject<HTMLDivElement>
  /** EditorView 实例（可能为 null） */
  view: EditorView | null
  /** 设置编辑器内容（suppressChange=true 时不触发 onChange） */
  setValue: (value: string, suppressChange?: boolean) => void
  /** 获取当前内容 */
  getValue: () => string
  /** 设置光标位置 */
  setCursor: (line: number, ch: number) => void
  /** 获取光标位置 */
  getCursor: () => { line: number; ch: number }
  /** 获取选中文本 */
  getSelection: () => string
  /** 替换选中文本 */
  replaceSelection: (text: string) => void
  /** 设置文件扩展名（切换语言高亮） */
  setExtension: (ext: string) => void
  /** 设置字体大小 */
  setFontSize: (size: number) => void
  /** 聚焦编辑器 */
  focus: () => void
}

// ─── Hook 实现 ───────────────────────────────────────────────

export function useCodeMirror(options: UseCodeMirrorOptions = {}): UseCodeMirrorReturn {
  const {
    initialValue = '',
    extension = '',
    fontSize = 13.5,
    readOnly = false,
    onChange,
    onCursorChange,
  } = options

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const suppressChangeRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onCursorChangeRef = useRef(onCursorChange)
  const languageCompartment = useRef(new Compartment())
  const fontSizeCompartment = useRef(new Compartment())
  const readOnlyCompartment = useRef(new Compartment())

  // 保持回调引用最新
  onChangeRef.current = onChange
  onCursorChangeRef.current = onCursorChange

  // 字体大小样式
  const fontSizeTheme = (size: number) =>
    EditorView.theme({
      '&': { fontSize: `${size}px` },
      '.cm-content': { fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, Consolas, monospace' },
      '.cm-gutters': { fontSize: `${size}px` },
    })

  useEffect(() => {
    if (!containerRef.current) return

    const langExt = getLanguageExtension(extension)

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        // 基础功能
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),

        // 键绑定
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),

        // 主题
        oneDark,

        // 动态 compartments
        languageCompartment.current.of(langExt ? [langExt] : []),
        fontSizeCompartment.current.of(fontSizeTheme(fontSize)),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),

        // 变化监听
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !suppressChangeRef.current) {
            onChangeRef.current?.(update.state.doc.toString())
          }
          if (update.selectionSet) {
            const cursor = update.state.selection.main.head
            const line = update.state.doc.lineAt(cursor)
            onCursorChangeRef.current?.(line.number - 1, cursor - line.from)
          }
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 仅初始化一次

  // ─── 暴露的方法 ──────────────────────────────────────────

  const setValue = useCallback((value: string, suppressChange = false) => {
    const view = viewRef.current
    if (!view) return
    suppressChangeRef.current = suppressChange
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
    suppressChangeRef.current = false
  }, [])

  const getValue = useCallback((): string => {
    return viewRef.current?.state.doc.toString() ?? ''
  }, [])

  const setCursor = useCallback((line: number, ch: number) => {
    const view = viewRef.current
    if (!view) return
    const lineCount = view.state.doc.lines
    const safeLine = Math.max(1, Math.min(line + 1, lineCount))
    const docLine = view.state.doc.line(safeLine)
    const pos = Math.min(docLine.from + ch, docLine.to)
    view.dispatch({ selection: { anchor: pos } })
    view.scrollDOM.scrollTop = view.lineBlockAt(pos).top - view.scrollDOM.clientHeight / 2
  }, [])

  const getCursor = useCallback((): { line: number; ch: number } => {
    const view = viewRef.current
    if (!view) return { line: 0, ch: 0 }
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    return { line: line.number - 1, ch: cursor - line.from }
  }, [])

  const getSelection = useCallback((): string => {
    const view = viewRef.current
    if (!view) return ''
    const { from, to } = view.state.selection.main
    return view.state.doc.sliceString(from, to)
  }, [])

  const replaceSelection = useCallback((text: string) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch(view.state.replaceSelection(text))
  }, [])

  const setExtension = useCallback((ext: string) => {
    const view = viewRef.current
    if (!view) return
    const langExt = getLanguageExtension(ext)
    view.dispatch({
      effects: languageCompartment.current.reconfigure(langExt ? [langExt] : []),
    })
  }, [])

  const setFontSize = useCallback((size: number) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: fontSizeCompartment.current.reconfigure(fontSizeTheme(size)),
    })
  }, [])

  const focus = useCallback(() => {
    viewRef.current?.focus()
  }, [])

  return {
    containerRef,
    view: viewRef.current,
    setValue,
    getValue,
    setCursor,
    getCursor,
    getSelection,
    replaceSelection,
    setExtension,
    setFontSize,
    focus,
  }
}