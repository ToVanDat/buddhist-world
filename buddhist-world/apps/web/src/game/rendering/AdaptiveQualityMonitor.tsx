import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdaptiveQualityController, type Quality } from "./quality";

export function AdaptiveQualityMonitor({
  quality, automatic, maximumQuality, onQualityChange,
}: {
  quality: Quality;
  automatic: boolean;
  maximumQuality: Quality;
  onQualityChange: (quality: Quality) => void;
}) {
  const controller = useRef(new AdaptiveQualityController());
  useEffect(() => { controller.current.reset(); }, [quality, automatic]);
  useFrame((_, delta) => {
    const next = controller.current.observe(delta * 1000, quality, performance.now(), automatic, maximumQuality);
    if (next && next !== quality) onQualityChange(next);
  });
  return null;
}
