import type { Quality } from "../rendering/quality";

export function resolveRoofTileSpacing(quality: Quality): readonly [number, number] {
  switch (quality) {
    case "ULTRA": return [0.64, 0.56];
    case "HIGH": return [0.78, 0.68];
    case "MEDIUM": return [1.05, 0.9];
    case "LOW":
    case "MOBILE": return [1.45, 1.2];
  }
}
