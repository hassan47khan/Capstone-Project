/**
 * One error boundary per tab (11 §3.3, "Unexpected crash").
 *
 * A render error in one tab replaces that tab only with a recoverable
 * fallback: the tab bar and the other tabs keep working, and "Try again"
 * remounts the tab from scratch. The boundary sits in the tab navigator's
 * `screenLayout`, so a tab that is a stack (Calendar, Settings) is covered
 * as a whole, pushed screens included.
 *
 * Data errors never get here: screens show those inline with ErrorState.
 * This is only for a bug that throws while rendering.
 */
import { Component, type ErrorInfo, Fragment, type ReactNode } from 'react';

import { ErrorState } from '@/components';
import { Screen } from '@/components/Screen';

export interface TabErrorBoundaryProps {
  /** The tab's name, for the log line and the fallback's test id. */
  tab: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** Bumped by "Try again" so the tab remounts with fresh state. */
  attempt: number;
}

export class TabErrorBoundary extends Component<TabErrorBoundaryProps, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No crash reporter yet; the console is where a developer will look.
    console.error(`The ${this.props.tab} tab crashed`, error, info.componentStack);
  }

  private retry = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <Screen edges={['top']} testID={`tab-crash-${this.props.tab}`}>
          <ErrorState variant="error" onRetry={this.retry} />
        </Screen>
      );
    }
    // The key remounts the whole tab after a retry, so no broken state survives.
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
