import { useEffect, useRef, useState } from "react";
import { setGameplayInputBlocked } from "../core/input";

type IntroOverlayPhase = "loading" | "ready" | "playing" | "failed" | "closed";

/** Optional video intro overlay. The media file is supplied later through VITE_WORLD_INTRO_VIDEO_URL. */
export function WorldIntroVideo({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<IntroOverlayPhase>("loading");

  useEffect(() => {
    setGameplayInputBlocked(true);
    return () => setGameplayInputBlocked(false);
  }, []);

  const close = () => {
    video.current?.pause();
    setPhase("closed");
    setGameplayInputBlocked(false);
  };

  const play = () => {
    const element = video.current;
    if (!element) return;
    setPhase("playing");
    void element.play().catch(() => setPhase("failed"));
  };

  if (phase === "closed") return null;

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
          onCanPlay={() => setPhase((current) => current === "loading" ? "ready" : current)}
          onEnded={close}
          onError={() => setPhase("failed")}
          aria-label="Video giới thiệu Buddhist World"
          style={{ display: "block", width: "100%", maxHeight: "72vh", background: "#000", objectFit: "contain" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <p role="status" aria-live="polite" style={{ margin: 0, color: "#d5cdbd" }}>
            {phase === "loading" ? "Đang chuẩn bị video giới thiệu…" :
              phase === "ready" ? "Video đã sẵn sàng." :
              phase === "playing" ? "Đang phát video giới thiệu." :
              "Không thể phát video. Bạn có thể tiếp tục vào thế giới."}
          </p>
          <div style={{ display: "flex", gap: "0.65rem" }}>
            {phase === "ready" && <button type="button" onClick={play}>Phát giới thiệu</button>}
            <button type="button" onClick={close}>{phase === "failed" ? "Tiếp tục vào thế giới" : "Bỏ qua"}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
