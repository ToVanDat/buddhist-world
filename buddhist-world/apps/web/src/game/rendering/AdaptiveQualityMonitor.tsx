import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdaptiveQualityController, type Quality } from "./quality";

export function AdaptiveQualityMonitor({
  quality, automatic, onQualityChange,
}: {
  quality: Quality;
  automatic: boolean;
  onQualityChange: (quality: Quality) => void;
}) {
  const controller = useRef(new AdaptiveQualityController());
  useEffect(() => { controller.current.reset(); }, [quality, automatic]);
  useFrame((_, delta) => {
    const next = controller.current.observe(delta * 1000, quality, performance.now(), automatic);
    if (next && next !== quality) onQualityChange(next);
  });
  return null;
}
