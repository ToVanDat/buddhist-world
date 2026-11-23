import { useEffect, useState } from "react";

/**
 * A short, non-blocking cinematic reveal layered over the real-time temple scene.
 * The world remains interactive underneath; this is intentionally not a video
 * substitute and can later be replaced by an approved rendered sequence.
 */
export function CinematicOpening() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 5200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="bw-cinematic-opening" aria-hidden="true">
      <div className="bw-opening-curtain" />
      <div className="bw-opening-copy">
        <span className="bw-opening-symbol">法</span>
        <span className="bw-opening-kicker">A LIVING WORLD OF STILLNESS</span>
        <span className="bw-opening-title">BUDDHIST WORLD</span>
        <span className="bw-opening-rule" />
        <span className="bw-opening-caption">A JOURNEY INTO STILLNESS</span>
      </div>
      <div className="bw-opening-grain" />
    </div>
  );
}
