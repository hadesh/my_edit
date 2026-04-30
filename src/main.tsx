import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'
import App from './App'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          color: '#ff6b6b',
          padding: '20px',
          fontFamily: 'monospace',
          fontSize: '13px',
          background: '#1e1e2e',
          height: '100vh',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {`渲染错误:\n${this.state.error.message}\n\n${this.state.error.stack}`}
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
