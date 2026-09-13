import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Client-side replacement for the root route's `errorComponent`.
 * Same copy and same actions as before the SPA conversion.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
    reportLovableError(error, { boundary: "app_error_boundary" });
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            This page didn't load
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong on our end. You can try refreshing or head back home.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={this.reset}>Try again</Button>
            <Button variant="outline" asChild>
              <Link to="/">Go home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
