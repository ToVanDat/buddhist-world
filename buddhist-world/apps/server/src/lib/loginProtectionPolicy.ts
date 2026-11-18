export const LOGIN_FAILURE_WINDOW_SECONDS = 24 * 60 * 60;

export function progressiveCooldownSeconds(failures: number): number {
  if (failures >= 12) return 30 * 60;
  if (failures >= 10) return 15 * 60;
  if (failures >= 8) return 5 * 60;
  if (failures >= 6) return 60;
  if (failures >= 4) return 30;
  return 0;
}
