import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useFileDrop } from "../lib/useFileDrop";
import type { MovieEntry, RecentProject } from "../lib/types";

type Props = {
  onOpen: (videoPath: string) => void;
};

export default function Home({ onOpen }: Props) {
  const [movies, setMovies] = useState<MovieEntry[]>([]);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, r] = await Promise.all([
          api.listMoviesVideos(),
          api.listRecentProjects(),
        ]);
        if (!cancelled) {
          setMovies(m);
          setRecents(r);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recentPaths = useMemo(
    () => new Set(recents.map((r) => r.project.sources[0]?.path).filter(Boolean)),
    [recents],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return movies;
    return movies.filter((m) => m.name.toLowerCase().includes(q));
  }, [movies, query]);

  const onDropped = useCallback((paths: string[]) => onOpen(paths[0]), [onOpen]);
  const hovering = useFileDrop(onDropped);

  return (
    <div className="relative mx-auto flex h-full max-w-4xl flex-col gap-6 px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your videos</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="w-56 rounded-md border border-border bg-bg-raised px-3 py-1.5 text-sm placeholder:text-text-faint focus:border-border-strong"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {recents.length > 0 && (
        <Section title="Recent">
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-raised">
            {recents.map((r) => {
              const src = r.project.sources[0];
              if (!src) return null;
              const name = src.path.split("/").pop() ?? src.path;
              const editCount = Math.max(0, r.project.segments.length - 1);
              return (
                <Row
                  key={r.project.sources[0]?.path + r.modifiedMs}
                  primary={name}
                  secondary={
                    [
                      formatDuration(src.durationSec),
                      editCount > 0 ? `${editCount} cut${editCount === 1 ? "" : "s"}` : "no cuts",
                      r.project.transcript ? "transcribed" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }
                  onClick={() => onOpen(src.path)}
                />
              );
            })}
          </div>
        </Section>
      )}

      {hovering && <DropOverlay label="Drop to open" />}

      <Section
        title={`Movies folder (${filtered.length})`}
        subtitle={loading ? "Loading…" : "~/Movies"}
      >
        {filtered.length === 0 && !loading ? (
          <p className="text-sm text-text-dim">No videos in ~/Movies yet.</p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-raised">
            {filtered.map((m) => (
              <Row
                key={m.path}
                primary={m.name}
                secondary={`${formatBytes(m.sizeBytes)} · ${formatRelative(m.modifiedMs)}${
                  recentPaths.has(m.path) ? " · edited" : ""
                }`}
                onClick={() => onOpen(m.path)}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-text-dim">{title}</h2>
        {subtitle && <span className="text-xs text-text-faint">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Row({
  primary,
  secondary,
  onClick,
}: {
  primary: string;
  secondary: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-bg-elevated"
    >
      <span className="truncate font-mono text-sm">{primary}</span>
      <span className="ml-4 shrink-0 text-xs text-text-dim">{secondary}</span>
    </button>
  );
}

function DropOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-sm">
      <div className="rounded-xl border-2 border-dashed border-accent bg-bg-raised/80 px-8 py-6 text-lg font-medium text-accent">
        {label}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec: number) {
  if (!sec || !isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatRelative(ms: number) {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const date = new Date(ms);
  return date.toLocaleDateString();
}
