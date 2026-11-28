import { worldEnvironmentSnapshotSchema, type WorldEnvironmentSnapshot } from "@bw/shared";
import { getWorldClockTime } from "./worldClock.js";

export type WorldWeather = WorldEnvironmentSnapshot["weather"];
export type WorldLightingPreset = WorldEnvironmentSnapshot["preset"];

export function resolveWorldLightingBlend(minute: number): Pick<WorldEnvironmentSnapshot, "fromPreset" | "toPreset" | "transition" | "preset"> {
  if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) {
    throw new RangeError("World minute must be an integer from 0 to 1439.");
  }

  const transitions: Array<{ start: number; end: number; fromPreset: WorldLightingPreset; toPreset: WorldLightingPreset }> = [
    { start: 270, end: 330, fromPreset: "night", toPreset: "dawn" },
    { start: 390, end: 450, fromPreset: "dawn", toPreset: "day" },
    { start: 990, end: 1050, fromPreset: "day", toPreset: "sunset" },
    { start: 1110, end: 1170, fromPreset: "sunset", toPreset: "night" },
  ];
  const active = transitions.find((item) => minute >= item.start && minute <= item.end);
  if (active) {
    const transition = (minute - active.start) / (active.end - active.start);
    return {
      fromPreset: active.fromPreset,
      toPreset: active.toPreset,
      transition,
      preset: transition < 0.5 ? active.fromPreset : active.toPreset,
    };
  }

  const preset: WorldLightingPreset =
    minute >= 330 && minute < 390 ? "dawn"
      : minute >= 450 && minute < 990 ? "day"
        : minute >= 1050 && minute < 1110 ? "sunset"
          : "night";
  return { fromPreset: preset, toPreset: preset, transition: 0, preset };
}

export function createWorldEnvironmentSnapshot(
  date: Date = new Date(),
  weather: WorldWeather = "clear",
  weatherIntensity = 0,
): WorldEnvironmentSnapshot {
  const worldTime = getWorldClockTime(date);
  const blend = resolveWorldLightingBlend(worldTime.minute);
  return worldEnvironmentSnapshotSchema.parse({
    serverTimeMs: date.getTime(),
    worldMinute: worldTime.minute,
    worldSecond: worldTime.second,
    ...blend,
    weather,
    weatherIntensity,
  });
}
