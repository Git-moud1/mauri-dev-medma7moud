'use client';

/**
 * The dashboard's read path throws instead of quietly serving bundled data,
 * so this is where an unreachable or unseeded content store surfaces.
 *
 * Worth a real screen rather than the default overlay: the owner sees this when
 * something is wrong with the deploy's configuration, and the two things that
 * actually cause it are both fixable in a minute if you know which they are.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[42rem] px-5 py-20 sm:px-8">
      <h1 className="text-2xl font-medium text-fg">The content store is unreachable.</h1>

      <p className="mt-4 text-sm text-muted">
        Nothing was lost — the admin could not read from Netlify Blobs, so it is not
        showing you a stale copy of your projects instead.
      </p>

      <ul className="mt-6 list-disc space-y-2 pl-5 text-sm text-muted">
        <li>
          Locally: plain <span className="font-mono text-fg">next dev</span> has no Blobs
          store. Run <span className="font-mono text-fg">npm run blobs:local</span> and
          start the app with the variable it prints.
        </li>
        <li>
          On a deploy preview: its <span className="font-mono text-fg">staging-</span>{' '}
          stores may not have been seeded yet.
        </li>
        <li>
          On production: check the function log for this digest — a missing or invalid{' '}
          <span className="font-mono text-fg">projects.json</span> or{' '}
          <span className="font-mono text-fg">settings.json</span> is named there.
        </li>
      </ul>

      {/*
        Useful locally, thin in production: Next redacts server-side error
        messages before they cross to the client, so a deploy shows a generic
        string and a digest rather than the store's own error. That is why the list
        above carries the actual guidance instead of relying on this line — the
        real message is in the Netlify function log, found by the digest.
      */}
      <p className="mt-6 rounded-xl border border-border bg-surface-2 px-4 py-3 font-mono text-xs text-muted">
        {error.message}
        {error.digest ? ` (${error.digest})` : null}
      </p>

      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg border border-border px-4 py-2 text-sm text-fg transition-colors hover:bg-surface-2"
      >
        Try again
      </button>
    </div>
  );
}
