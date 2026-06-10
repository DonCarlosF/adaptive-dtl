import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. A rendering error anywhere in the tree —
 * a malformed cached AI set, a bad gaze rect, a broken lazy chunk —
 * should never leave a student or teacher staring at a white screen.
 * We catch it, keep the calm palette, and offer a one-tap reload.
 *
 * No telemetry: per the privacy model nothing leaves the device, so we
 * log to the console only.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only — see the privacy model in README.
    console.error("Unhandled error:", error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 bg-canvas text-ink flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-semibold mb-2">Something went wrong.</h1>
            <p className="text-muted mb-6">
              The app hit an unexpected error. Your data is saved on this
              device — reloading will pick up where you left off.
            </p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center h-11 px-5 rounded-tile font-medium bg-sage text-white hover:bg-sage-500 transition-colors"
            >
              Reload
            </button>
            {import.meta.env.DEV && (
              <pre className="mt-6 text-left text-xs text-coral whitespace-pre-wrap break-words">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
