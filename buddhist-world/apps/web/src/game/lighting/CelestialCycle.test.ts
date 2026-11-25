import { describe, expect, it } from "vitest";
import { resolveCelestialDirections, resolveWorldMinute } from "./CelestialCycle";

describe("world celestial cycle", () => {
  it("normalizes the authoritative clock and extrapolates seconds", () => {
    expect(resolveWorldMinute({ worldMinute: 1439, worldSecond: 50 }, 1_000, 11_000)).toBeCloseTo(0);
    expect(resolveWorldMinute(null, null, Date.UTC(2026, 10, 25, 14, 0, 0))).toBe(1260);
    expect(resolveWorldMinute(null, null, Date.UTC(2026, 10, 25, 5, 0, 0))).toBe(720);
  });

  it("moves the sun from east at dawn through zenith to west at dusk", () => {
    const dawn = resolveCelestialDirections(360);
    const noon = resolveCelestialDirections(720);
    const dusk = resolveCelestialDirections(1080);
    expect(dawn.sun[0]).toBeGreaterThan(0.9);
    expect(Math.abs(dawn.sun[1])).toBeLessThan(0.01);
    expect(noon.sun[1]).toBeGreaterThan(0.9);
    expect(dusk.sun[0]).toBeLessThan(-0.9);
    expect(Math.abs(dusk.sun[1])).toBeLessThan(0.01);
  });

  it("keeps the moon in the same coordinate frame opposite the sun", () => {
    for (const minute of [0, 360, 720, 1080, 1439]) {
      const { sun, moon } = resolveCelestialDirections(minute);
      expect(sun[0] + moon[0]).toBeCloseTo(0, 10);
      expect(sun[1] + moon[1]).toBeCloseTo(0, 10);
      expect(sun[2] + moon[2]).toBeCloseTo(0, 10);
      expect(Math.hypot(...sun)).toBeCloseTo(1, 10);
      expect(Math.hypot(...moon)).toBeCloseTo(1, 10);
    }
  });

  it("keeps all 1,440 minute samples finite and directionally continuous", () => {
    let previous = resolveCelestialDirections(0).sun;
    for (let minute = 1; minute <= 1440; minute += 1) {
      const current = resolveCelestialDirections(minute).sun;
      expect(current.every(Number.isFinite)).toBe(true);
      const delta = Math.hypot(
        current[0] - previous[0],
        current[1] - previous[1],
        current[2] - previous[2],
      );
      expect(delta).toBeLessThan(0.01);
      previous = current;
    }
  });

  it("keeps daylight and night factors complementary across the full day", () => {
    for (let minute = 0; minute < 1440; minute += 1) {
      const { daylight, night } = resolveCelestialDirections(minute);
      expect(daylight).toBeGreaterThanOrEqual(0);
      expect(daylight).toBeLessThanOrEqual(1);
      expect(night).toBeCloseTo(1 - daylight, 12);
    }
  });

  it("transitions daylight and night smoothly at the horizon", () => {
    const beforeSunrise = resolveCelestialDirections(340);
    const sunrise = resolveCelestialDirections(360);
    const noon = resolveCelestialDirections(720);
    const sunset = resolveCelestialDirections(1080);
    expect(beforeSunrise.night).toBeGreaterThan(sunrise.night);
    expect(noon.daylight).toBeGreaterThan(0.99);
    expect(sunset.night).toBeGreaterThan(0.5);
    expect(sunrise.daylight).toBeGreaterThan(0);
    expect(sunrise.daylight).toBeLessThan(1);
  });
});
