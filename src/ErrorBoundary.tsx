import { Component, Fragment, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  resetKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, resetKey: 0 };

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true, resetKey: 0 };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (Bun.env.NODE_ENV !== "production") {
      console.error("Uncaught error:", error, info.componentStack);
    } else {
      console.error("Uncaught error:", error);
    }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div>
          Something went wrong.{" "}
          <button onClick={() => this.setState(s => ({ hasError: false, resetKey: s.resetKey + 1 }))}>Try again</button>
        </div>
      );
    }
    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}
