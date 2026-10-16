export function LiveIndicator({ isStale }: { isStale: boolean }) {
  return (
    <span data-state={isStale ? "stale" : "live"} className="inline-flex items-center gap-1.5 text-[13px] text-muted">
      <i aria-hidden="true" className={`size-2 rounded-full ${isStale ? "bg-stale" : "bg-done"}`} />
      live
    </span>
  );
}
