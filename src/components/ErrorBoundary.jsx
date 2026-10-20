import { Component } from 'react'
import { logError } from '../utils/logger'
import { t } from '../i18n'

// If a page crashes, show a friendly message instead of a blank screen.
// The rest of the app (sidebar, other pages) keeps working.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    logError(`Page crashed (${this.props.name || 'unknown'})`, `${error?.stack || error}\n${info?.componentStack || ''}`)
  }

  componentDidUpdate(prevProps) {
    // Moving to another page clears the error
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md text-center bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-xl font-bold text-yellow-400 mb-2">{t('Something went wrong')}</h2>
          <p className="text-gray-400 text-sm mb-4">
            {t('This page had a problem. Your data is safe. Try again, or go to another page.')}
          </p>
          <pre className="text-left text-xs text-red-300 bg-gray-950 border border-gray-800 rounded-lg p-3 mb-5 overflow-auto max-h-32 whitespace-pre-wrap">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-5 py-2.5 rounded-lg text-sm"
          >
            {t('Try again')}
          </button>
        </div>
      </div>
    )
  }
}
