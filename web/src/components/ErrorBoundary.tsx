import React, { Component, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
                    <div className="max-w-md w-full p-6 bg-card border border-destructive/30 rounded-lg shadow-lg">
                        <h1 className="text-2xl font-bold text-destructive mb-4">
                            Something went wrong
                        </h1>
                        <p className="text-muted-foreground mb-6">
                            We encountered an unexpected error. Please try reloading the page.
                        </p>
                        {this.state.error && (
                            <pre className="text-xs bg-muted p-3 rounded mb-4 overflow-x-auto">
                                {this.state.error.message}
                            </pre>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
