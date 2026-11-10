/** Vietnam-local world clock, independent of the server host timezone. */
function getVietnamClockParts(date: Date): { hour: number; minute: number; second: number } {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid world clock date.");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);
  if (![hour, minute, second].every(Number.isInteger)) throw new Error("Unable to resolve the world clock.");
  return { hour, minute, second };
}

export function getWorldClockMinute(date: Date = new Date()): number {
  const { hour, minute } = getVietnamClockParts(date);
  return hour * 60 + minute;
}

export function getWorldClockSecond(date: Date = new Date()): number {
  return getVietnamClockParts(date).second;
}
