import React from 'react';

const RELOADED_KEY = 'unigo_reloaded_for_chunk';

// After a new deploy, an open tab still asks for the old file names and the download fails
const isChunkLoadError = (error) =>
  /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk/i.test(
    String(error?.message || error)
  );

// Keeps one broken piece (a page, the 3D map) from blanking the whole app. A failed download from
// an old deploy reloads the page once; anything else shows a small card with a way to retry.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (!isChunkLoadError(error)) return;
    // Reload at most once a minute, so a file that is really missing can't cause a reload loop
    try {
      const last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
      if (Date.now() - last < 60000) return;
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkLoadError(this.state.error);
    return (
      <div role="alert" className={`w-full h-full flex items-center justify-center p-6 ${this.props.compact ? 'bg-paper' : 'min-h-[50vh]'}`}>
        <div className="max-w-sm text-center">
          <p className="heading text-[22px]">{chunk ? "Couldn't load this part of UniGo" : 'Something went wrong here'}</p>
          <p className="mt-2 text-[15px] text-body">
            {chunk ? 'Check your connection, then reload the page.' : 'Reload the page to try again. Your bookings are safe.'}
          </p>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-primary mt-5">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
