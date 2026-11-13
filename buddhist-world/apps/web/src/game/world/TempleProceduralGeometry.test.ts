import { describe, expect, it } from "vitest";
import {
  createCurvedRoofGeometry,
  createOrganicCanopyGeometry,
  createOrganicRockGeometry,
  createOrganicTrunkGeometry,
  createMountainGeometry,
  createSurfaceNoiseTexture,
  createSurfaceNormalTexture,
  createGrassPatchGeometry,
} from "./TempleProceduralGeometry";

describe("procedural temple geometry", () => {
  it("creates deterministic organic foliage and a gently irregular trunk", () => {
    const canopyA = createOrganicCanopyGeometry(1, 2, 7);
    const canopyB = createOrganicCanopyGeometry(1, 2, 7);
    const a = canopyA.getAttribute("position");
    const b = canopyB.getAttribute("position");
    expect(a.count).toBe(b.count);
    for (let index = 0; index < a.count; index += 1) {
      expect(a.getX(index)).toBe(b.getX(index));
      expect(a.getY(index)).toBe(b.getY(index));
      expect(a.getZ(index)).toBe(b.getZ(index));
    }
    const radii = Array.from({ length: a.count }, (_, index) => Math.hypot(a.getX(index), a.getY(index), a.getZ(index)));
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.01);
    const trunk = createOrganicTrunkGeometry(6.2, 0.34, 0.72, 3);
    expect(trunk.getAttribute("position").count).toBeGreaterThan(100);
    expect(trunk.boundingSphere?.radius).toBeGreaterThan(0);
    canopyA.dispose();
    canopyB.dispose();
    trunk.dispose();
  });

  it("creates deterministic weathered rock geometry with a bounded base", () => {
    const first = createOrganicRockGeometry(13, 2);
    const second = createOrganicRockGeometry(13, 2);
    const a = first.getAttribute("position");
    const b = second.getAttribute("position");
    expect(a.count).toBe(b.count);
    for (let index = 0; index < a.count; index += 1) {
      expect(a.getX(index)).toBe(b.getX(index));
      expect(a.getY(index)).toBe(b.getY(index));
      expect(a.getZ(index)).toBe(b.getZ(index));
      expect(a.getY(index)).toBeGreaterThanOrEqual(-0.62);
    }
    first.dispose();
    second.dispose();
  });

  it("creates a curved roof with finite vertices and an upward center normal", () => {
    const geometry = createCurvedRoofGeometry({ width: 12, depth: 5, rise: 2.2 });
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    expect(positions.count).toBeGreaterThan(100);
    for (let i = 0; i < positions.count; i += 1) {
      expect(Number.isFinite(positions.getX(i))).toBe(true);
      expect(Number.isFinite(positions.getY(i))).toBe(true);
      expect(Number.isFinite(positions.getZ(i))).toBe(true);
    }
    const center = Math.floor(positions.count / 2);
    expect(normals.getY(center)).toBeGreaterThan(0);
    geometry.dispose();
  });

  it("sanitizes invalid roof dimensions and still returns a valid mesh", () => {
    const geometry = createCurvedRoofGeometry({
      width: Number.NaN,
      depth: Number.POSITIVE_INFINITY,
      rise: Number.NaN,
      segmentsX: 1,
      segmentsZ: 1,
    });
    expect(geometry.getAttribute("position").count).toBe(9);
    expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
    geometry.dispose();
  });

  it("creates crossed, tapered grass blades with consistent vertex attributes", () => {
    const geometry = createGrassPatchGeometry(8, 6, 12, 9);
    expect(geometry.getAttribute("position").count).toBe(12 * 2 * 4);
    expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
    expect(geometry.getIndex()?.count).toBe(12 * 2 * 6);
    geometry.dispose();
  });

  it("creates deterministic, bounded mountain terrain", () => {
    const first = createMountainGeometry(80, 60, 24, 7);
    const second = createMountainGeometry(80, 60, 24, 7);
    const a = first.getAttribute("position");
    const b = second.getAttribute("position");
    expect(a.count).toBe(b.count);
    for (let i = 0; i < a.count; i += 1) {
      expect(a.getX(i)).toBe(b.getX(i));
      expect(a.getY(i)).toBe(b.getY(i));
      expect(a.getZ(i)).toBe(b.getZ(i));
      expect(a.getY(i)).toBeGreaterThanOrEqual(0);
      expect(a.getY(i)).toBeLessThanOrEqual(24);
    }
    first.dispose();
    second.dispose();
  });

  it("generates repeatable surface noise textures", () => {
    const first = createSurfaceNoiseTexture(11, 16);
    const second = createSurfaceNoiseTexture(11, 16);
    expect(Array.from(first.image.data)).toEqual(Array.from(second.image.data));
    expect(first.wrapS).toBe(second.wrapS);
    first.dispose();
    second.dispose();
  });

  it("creates a deterministic tangent-space normal map with valid encoded channels", () => {
    const first = createSurfaceNormalTexture(31, 32, 2.2);
    const second = createSurfaceNormalTexture(31, 32, 2.2);
    const pixels = first.image.data as Uint8Array;
    expect(Array.from(pixels)).toEqual(Array.from(second.image.data as Uint8Array));
    expect(first.image.width).toBe(32);
    expect(first.image.height).toBe(32);
    for (let index = 0; index < pixels.length; index += 4) {
      expect(pixels[index]).toBeGreaterThanOrEqual(0);
      expect(pixels[index]).toBeLessThanOrEqual(255);
      expect(pixels[index + 1]).toBeGreaterThanOrEqual(0);
      expect(pixels[index + 1]).toBeLessThanOrEqual(255);
      expect(pixels[index + 2]).toBeGreaterThan(127);
      expect(pixels[index + 3]).toBe(255);
    }
    first.dispose();
    second.dispose();
  });
});
