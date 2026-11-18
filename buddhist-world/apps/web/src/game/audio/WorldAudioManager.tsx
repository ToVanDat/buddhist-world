import { useEffect, useRef } from "react";
import { WorldAudioSession } from "./WorldAudioSession";

export interface WorldAudioManagerProps {
  src?: string;
  volume?: number;
}

/**
 * Optional world ambience adapter. It never attempts autoplay before a user
 * gesture and pauses/resumes with page visibility. No bundled audio is assumed.
 */
export function WorldAudioManager({ src, volume = 0.22 }: WorldAudioManagerProps) {
  const sessionRef = useRef<WorldAudioSession | null>(null);
  useEffect(() => {
    const source = src?.trim();
    if (!source || typeof Audio === "undefined") return;

    const audio = new Audio(source);
    audio.preload = "none";
    const session = new WorldAudioSession(audio, volume);
    sessionRef.current = session;
    const activate = () => { void session.activate(); };
    const visibility = () => { void session.setVisible(document.visibilityState === "visible"); };

    window.addEventListener("pointerdown", activate);
    window.addEventListener("keydown", activate);
    document.addEventListener("visibilitychange", visibility);
    visibility();

    return () => {
      window.removeEventListener("pointerdown", activate);
      window.removeEventListener("keydown", activate);
      document.removeEventListener("visibilitychange", visibility);
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    sessionRef.current?.setVolume(volume);
  }, [volume]);

  return null;
}
