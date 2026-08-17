import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Catches render-time exceptions in the subtree.
 *
 * The charts already handle `loading` and `error` props, but those only cover
 * failed requests. A malformed row reaching Recharts throws during render,
 * and without a boundary React unmounts the whole tree — which previously
 * turned one bad chart into a blank dashboard.
 *
 * Must be a class component: there is no hook equivalent of
 * componentDidCatch / getDerivedStateFromError.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary] ${this.props.label || 'component'} failed to render`,
      error,
      info,
    );
  }

  handleRetry() {
    this.setState({ hasError: false });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="error-boundary" role="alert">
        <span className="error-boundary-icon" aria-hidden="true">
          <AlertTriangle />
        </span>
        <p className="error-boundary-title">
          {this.props.title || 'Something went wrong here'}
        </p>
        <p className="error-boundary-body">
          {this.props.body ||
            'This section could not be displayed. The rest of the page is unaffected.'}
        </p>
        <button
          type="button"
          className="secondary-button error-boundary-retry"
          onClick={this.handleRetry}
        >
          Try again
        </button>
      </div>
    );
  }
}
