import { useEffect, useReducer, useRef } from "react";
import { setGameplayInputBlocked } from "../core/input";
import { INITIAL_INTRO_SEQUENCE_STATE, transitionIntroSequence } from "./introSequence";

/** Optional video intro overlay. The media file is supplied later through VITE_WORLD_INTRO_VIDEO_URL. */
export function WorldIntroVideo({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [sequence, dispatch] = useReducer(transitionIntroSequence, INITIAL_INTRO_SEQUENCE_STATE);
  const phase = sequence.phase;

  useEffect(() => {
    setGameplayInputBlocked(true);
    dispatch({ type: "LOAD" });
    return () => setGameplayInputBlocked(false);
  }, []);

  const skip = () => {
    video.current?.pause();
    dispatch({ type: "SKIP" });
    setGameplayInputBlocked(false);
  };

  const finish = () => {
    video.current?.pause();
    dispatch({ type: "ENDED" });
    setGameplayInputBlocked(false);
  };

  const play = () => {
    const element = video.current;
    if (!element) return;
    dispatch({ type: "PLAY" });
    void element.play().catch((error: unknown) => {
      dispatch({ type: "ERROR", message: error instanceof Error ? error.message : "Video playback was blocked" });
    });
  };

  if (phase === "completed" || phase === "skipped") return null;

  return (
    <section
      aria-label="Giới thiệu thế giới Buddhist World"
      aria-modal="true"
      role="dialog"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        padding: "clamp(1rem, 4vw, 3rem)",
        background: "rgba(8, 10, 10, 0.96)",
        color: "#f3eee2",
      }}
    >
      <div style={{ width: "min(1100px, 100%)", display: "grid", gap: "1rem" }}>
        <video
          ref={video}
          src={src}
          playsInline
          controls
          preload="metadata"
          onCanPlay={() => dispatch({ type: "READY" })}
          onPlay={() => dispatch({ type: "PLAY" })}
          onEnded={finish}
          onError={() => dispatch({ type: "ERROR", message: "Intro media could not be loaded" })}
          aria-label="Video giới thiệu Buddhist World"
          style={{ display: "block", width: "100%", maxHeight: "72vh", background: "#000", objectFit: "contain" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <p role="status" aria-live="polite" style={{ margin: 0, color: "#d5cdbd" }}>
            {phase === "idle" || phase === "loading" ? "Đang chuẩn bị video giới thiệu…" :
              phase === "ready" ? "Video đã sẵn sàng." :
              phase === "playing" ? "Đang phát video giới thiệu." :
              sequence.error ?? "Không thể phát video. Bạn có thể tiếp tục vào thế giới."}
          </p>
          <div style={{ display: "flex", gap: "0.65rem" }}>
            {phase === "ready" && <button type="button" onClick={play}>Phát giới thiệu</button>}
            <button type="button" onClick={skip}>{phase === "failed" ? "Tiếp tục vào thế giới" : "Bỏ qua"}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
