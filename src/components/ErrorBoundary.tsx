import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence: a render error anywhere below this shows a readable
 * page instead of an empty document.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No error-reporting service is wired up; the console is where this goes.
    console.error('Unhandled render error', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
        <div className="panel p-6 sm:p-8">
          <h1 className="text-xl text-red-300">Something broke</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            The page failed to render. Reloading usually clears it; if it does not, the message
            below is the place to start.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-ink-750 bg-ink-950 p-3 font-mono text-xs text-ink-400">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
