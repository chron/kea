import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const VIDEO_EXTS = new Set(["mp4", "mov", "mkv", "m4v"]);

function isVideo(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && VIDEO_EXTS.has(ext);
}

/**
 * Subscribes to the Tauri webview's native drag-drop events and invokes
 * `onDrop` with the video paths from the drop. Returns whether a drag is
 * currently hovering the window so callers can render an overlay.
 */
export function useFileDrop(onDrop: (paths: string[]) => void): boolean {
  const [hovering, setHovering] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          const paths = payload.type === "enter" ? payload.paths : null;
          if (paths && !paths.some(isVideo)) return;
          setHovering(true);
        } else if (payload.type === "leave") {
          setHovering(false);
        } else if (payload.type === "drop") {
          setHovering(false);
          const videos = payload.paths.filter(isVideo);
          if (videos.length > 0) onDropRef.current(videos);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return hovering;
}
