interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

const BUTTON =
  "h-8 min-w-[34px] cursor-pointer rounded-lg border border-border bg-surface px-2.5 text-inherit hover:border-recent";

export function MapControls({ onZoomIn, onZoomOut, onFit }: MapControlsProps) {
  return (
    <div className="absolute right-3 bottom-3 flex gap-1.5">
      <button type="button" aria-label="Zoom out" className={BUTTON} onClick={onZoomOut}>
        −
      </button>
      <button type="button" aria-label="Zoom in" className={BUTTON} onClick={onZoomIn}>
        +
      </button>
      <button type="button" className={BUTTON} onClick={onFit}>
        Fit
      </button>
    </div>
  );
}
