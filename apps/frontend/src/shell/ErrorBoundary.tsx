import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Human label for the region this boundary protects (shown in the header). */
  label?: string;
  /** When the boundary resets, this callback runs (e.g. close a modal). */
  onReset?: () => void;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Catches render/runtime errors in its subtree and shows the error + stack
 * instead of unmounting to a white screen. Without this, an uncaught throw in
 * any descendant (e.g. the component-parameters modal) blanks the whole app and
 * forces a restart.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info });
    // Surface to the console for dev tooling / e2e logs as well.
    console.error("[ErrorBoundary] caught render error:", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null, info: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    const { error, info } = this.state;
    if (!error) {
      return this.props.children;
    }
    const region = this.props.label ?? "the application";
    return (
      <div className="error-boundary" role="alert" data-testid="error-boundary">
        <div className="error-boundary__panel">
          <header className="error-boundary__header">
            <strong>Something broke in {region}.</strong>
            <button
              type="button"
              className="error-boundary__dismiss"
              onClick={this.reset}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </header>
          <p className="error-boundary__message">{error.message || String(error)}</p>
          {error.stack ? (
            <details className="error-boundary__details" open>
              <summary>Stack trace</summary>
              <pre className="error-boundary__stack">{error.stack}</pre>
            </details>
          ) : null}
          {info?.componentStack ? (
            <details className="error-boundary__details">
              <summary>Component stack</summary>
              <pre className="error-boundary__stack">{info.componentStack}</pre>
            </details>
          ) : null}
          <footer className="error-boundary__footer">
            <button type="button" className="error-boundary__retry" onClick={this.reset}>
              Dismiss & continue
            </button>
          </footer>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
