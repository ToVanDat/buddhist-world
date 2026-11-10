/** Vietnam-local world clock, independent of the server host timezone. */
export interface VietnamWorldTime {
  minute: number;
  second: number;
}

export function getWorldClockTime(date: Date = new Date()): VietnamWorldTime {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid world clock date.");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);
  if (![hour, minute, second].every(Number.isInteger)) throw new Error("Unable to resolve the world clock.");
  return { minute: hour * 60 + minute, second };
}

export function getWorldClockMinute(date: Date = new Date()): number {
  return getWorldClockTime(date).minute;
}

export function getWorldClockSecond(date: Date = new Date()): number {
  return getWorldClockTime(date).second;
}
