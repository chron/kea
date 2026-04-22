import { useCallback, useEffect, useState } from "react";
import Home from "./components/Home";
import SettingsView from "./components/Settings";
import Editor from "./components/editor/Editor";
import { api } from "./lib/api";

export type View =
  | { kind: "home" }
  | { kind: "settings" }
  | { kind: "editor"; videoPath: string };

export default function App() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null);

  useEffect(() => {
    api.ffmpegAvailable().then(setFfmpegOk).catch(() => setFfmpegOk(false));
  }, []);

  const navigate = useCallback((next: View) => setView(next), []);

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <TopBar view={view} onNavigate={navigate} />
      {ffmpegOk === false && <FfmpegMissingBanner />}
      <main className="flex-1 overflow-hidden">
        {view.kind === "home" && <Home onOpen={(path) => navigate({ kind: "editor", videoPath: path })} />}
        {view.kind === "settings" && <SettingsView />}
        {view.kind === "editor" && (
          <Editor videoPath={view.videoPath} onClose={() => navigate({ kind: "home" })} />
        )}
      </main>
    </div>
  );
}

function TopBar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-bg-raised px-4 pl-20"
    >
      <div className="flex items-center gap-3 text-sm">
        <span className="text-text-dim">Kea</span>
        {view.kind === "editor" && (
          <>
            <span className="text-text-faint">/</span>
            <button
              onClick={() => onNavigate({ kind: "home" })}
              className="text-text-dim hover:text-text"
            >
              Home
            </button>
            <span className="text-text-faint">/</span>
            <span className="font-mono text-xs text-text">
              {view.videoPath.split("/").pop()}
            </span>
          </>
        )}
      </div>
      <nav className="flex items-center gap-1 text-xs">
        <NavButton active={view.kind === "home"} onClick={() => onNavigate({ kind: "home" })}>
          Home
        </NavButton>
        <NavButton
          active={view.kind === "settings"}
          onClick={() => onNavigate({ kind: "settings" })}
        >
          Settings
        </NavButton>
      </nav>
    </header>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-md px-3 py-1.5 transition-colors " +
        (active
          ? "bg-bg-elevated text-text"
          : "text-text-dim hover:bg-bg-elevated hover:text-text")
      }
    >
      {children}
    </button>
  );
}

function FfmpegMissingBanner() {
  const [copied, setCopied] = useState(false);
  const cmd = "brew install ffmpeg";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — nothing useful to do
    }
  };
  return (
    <div className="border-b border-border bg-danger/10 px-4 py-2 text-sm text-danger">
      <span className="font-medium">FFmpeg not found on PATH.</span>{" "}
      Install it with{" "}
      <button
        type="button"
        onClick={copy}
        title="Click to copy"
        className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs text-text hover:bg-border"
      >
        {copied ? "Copied!" : cmd}
      </button>{" "}
      and restart Kea.
    </div>
  );
}
