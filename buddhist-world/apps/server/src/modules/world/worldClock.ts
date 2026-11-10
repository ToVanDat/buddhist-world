/** Vietnam-local world clock, independent of the server host timezone. */
export function getWorldClockMinute(date: Date = new Date()): number {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid world clock date.");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error("Unable to resolve the world clock.");
  }
  return hour * 60 + minute;
}
