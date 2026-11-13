import { describe, expect, it } from "vitest";
import { createTempleRoofTileGeometry, createTempleRoofTileLayout } from "./TempleRoofTiles";

describe("temple roof tile assets", () => {
  it("creates a finite beveled tile geometry with usable bounds", () => {
    const geometry = createTempleRoofTileGeometry(0.62, 0.52);
    const positions = geometry.getAttribute("position");
    expect(positions.count).toBeGreaterThan(20);
    for (let index = 0; index < positions.count; index += 1) {
      expect(Number.isFinite(positions.getX(index))).toBe(true);
      expect(Number.isFinite(positions.getY(index))).toBe(true);
      expect(Number.isFinite(positions.getZ(index))).toBe(true);
    }
    expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
    geometry.dispose();
  });

  it("creates deterministic staggered tiles that stay inside the roof footprint", () => {
    const options = { width: 13.4, depth: 5.9, rise: 2.05, tileWidth: 0.64, tileDepth: 0.56 };
    const first = createTempleRoofTileLayout(options);
    const second = createTempleRoofTileLayout(options);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(100);
    for (const tile of first) {
      expect(Math.abs(tile.x)).toBeLessThan(options.width / 2);
      expect(Math.abs(tile.z)).toBeLessThan(options.depth / 2);
      expect(Number.isFinite(tile.y)).toBe(true);
      expect(Number.isFinite(tile.rotationX)).toBe(true);
      expect(Number.isFinite(tile.rotationZ)).toBe(true);
    }
  });

  it("keeps low quality tile counts below cinematic quality counts", () => {
    const dense = createTempleRoofTileLayout({
      width: 22.5, depth: 16.8, rise: 3.2, tileWidth: 0.64, tileDepth: 0.56,
    });
    const light = createTempleRoofTileLayout({
      width: 22.5, depth: 16.8, rise: 3.2, tileWidth: 1.45, tileDepth: 1.2,
    });
    expect(dense.length).toBeGreaterThan(light.length);
  });
});
