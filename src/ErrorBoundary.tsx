import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
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
          <button onClick={() => this.setState({ hasError: false })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
