import { Component, ErrorInfo, ReactNode } from 'react'
interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('POS Error:', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
          <div className="bg-slate-800 rounded-xl p-8 max-w-lg w-full">
            <div className="text-red-400 text-2xl font-bold mb-3">⚠ System Error</div>
            <div className="text-slate-300 text-sm mb-4">{this.state.error?.message}</div>
            <div className="text-slate-500 text-xs mb-6">Your data is safe in the local database.</div>
            <div className="flex gap-3">
              <button onClick={() => window.location.reload()}
                className="px-4 py-2 bg-brand-700 hover:bg-brand-500 text-white rounded font-semibold">Reload</button>
              <button onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">Try Again</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
