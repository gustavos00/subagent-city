export function EmptyState() {
  return (
    <div className="absolute inset-0 grid place-content-center gap-1.5 p-6 text-center text-muted">
      <strong className="text-base text-text">No open Claude Code sessions</strong>
      <span>
        Start one with <code>claude</code> in a terminal or in the Claude app; it shows up here within a few seconds.
      </span>
    </div>
  );
}
