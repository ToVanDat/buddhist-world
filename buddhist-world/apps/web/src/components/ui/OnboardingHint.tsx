import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const STORAGE_KEY = "bw.player.onboarding-dismissed.v1";
export function OnboardingHint({ touch }: { touch: boolean }) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(STORAGE_KEY) !== "1"; }
    catch { return true; }
  });
  const dismiss = () => {
    setVisible(false);
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* Session dismissal still works without storage. */ }
  };
  return <AnimatePresence>
    {visible && <motion.aside className="bw-onboarding-hint" data-ui aria-label="Hướng dẫn điều khiển nhanh"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
      transition={{ duration: reduceMotion ? .01 : .2 }}>
      <span className="bw-onboarding-mark" aria-hidden="true">✦</span>
      <div><strong>Bắt đầu khám phá</strong><p>{touch ? "Dùng cần điều hướng để đi bộ · chạm công trình để tìm hiểu · kéo màn hình để quan sát." : "WASD để đi bộ · E để tìm hiểu kiến trúc · kéo chuột để quan sát xung quanh."}</p></div>
      <button type="button" onClick={dismiss} aria-label="Đóng hướng dẫn">×</button>
    </motion.aside>}
  </AnimatePresence>;
}
