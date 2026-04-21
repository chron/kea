import type { Segment } from "../../lib/types";
import { editedDuration, formatTime } from "../../lib/timeline";

type Props = {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onJumpStart: () => void;
  onJumpEnd: () => void;
  onSetIn: () => void;
  onSetOut: () => void;
  onClearMarkers: () => void;
  onCutSelection: () => void;
  onExport: () => void;
  canCut: boolean;
  exporting: boolean;
  segments: Segment[];
  sourceDuration: number;
};

export default function Toolbar({
  isPlaying,
  onTogglePlay,
  onJumpStart,
  onJumpEnd,
  onSetIn,
  onSetOut,
  onClearMarkers,
  onCutSelection,
  onExport,
  canCut,
  exporting,
  segments,
  sourceDuration,
}: Props) {
  const edited = editedDuration(segments);
  const cutCount = Math.max(0, segments.length - 1);

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-bg-raised px-4 py-2">
      <div className="flex items-center gap-1">
        <IconButton title="Jump to start (Home)" onClick={onJumpStart}>
          ⏮
        </IconButton>
        <IconButton
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          onClick={onTogglePlay}
          primary
        >
          {isPlaying ? "⏸" : "▶"}
        </IconButton>
        <IconButton title="Jump to end (End)" onClick={onJumpEnd}>
          ⏭
        </IconButton>
      </div>

      <Divider />

      <div className="flex items-center gap-1">
        <TextButton title="Mark in (I)" onClick={onSetIn}>
          Mark in
        </TextButton>
        <TextButton title="Mark out (O)" onClick={onSetOut}>
          Mark out
        </TextButton>
        <TextButton title="Clear selection (Esc)" onClick={onClearMarkers}>
          Clear
        </TextButton>
      </div>

      <Divider />

      <TextButton
        title="Cut selection (Delete)"
        onClick={onCutSelection}
        disabled={!canCut}
        danger
      >
        Cut
      </TextButton>

      <div className="ml-auto flex items-center gap-3 font-mono text-xs text-text-dim">
        <span>
          {formatTime(edited)} / {formatTime(sourceDuration)}
        </span>
        {cutCount > 0 && (
          <span>
            {cutCount} cut{cutCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <button
        onClick={onExport}
        disabled={exporting || segments.length === 0}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {exporting ? "Exporting…" : "Export"}
      </button>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  primary?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={
        "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors " +
        (primary
          ? "bg-bg-elevated text-text hover:bg-border"
          : "text-text-dim hover:bg-bg-elevated hover:text-text")
      }
    >
      {children}
    </button>
  );
}

function TextButton({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={
        "rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-40 " +
        (danger
          ? "text-danger hover:bg-danger/10"
          : "text-text-dim hover:bg-bg-elevated hover:text-text")
      }
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-border" />;
}
