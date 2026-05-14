import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches JavaScript errors in child components
 * and displays a user-friendly fallback UI instead of a white screen.
 *
 * Uses React class component lifecycle methods:
 * - getDerivedStateFromError: updates state to render fallback UI
 * - componentDidCatch: logs error details for debugging
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error with stack trace for debugging
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
  }

  handleTryAgain = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full w-full bg-gray-800 text-gray-100 p-6">
          <div className="text-center max-w-lg">
            <h2 className="text-xl font-semibold mb-2 text-red-400">
              Something went wrong
            </h2>
            <p className="text-sm text-gray-400 mb-4 font-mono break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={this.handleTryAgain}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
