/** Close a pending voice AudioContext only if it is still the active connection's context. */
export async function closeAudioContextIfCurrent(
  candidate: Pick<AudioContext, "close">,
  current: Pick<AudioContext, "close"> | null,
  clearCurrent: () => void,
): Promise<boolean> {
  const isCurrent = current === candidate;
  if (isCurrent) clearCurrent();
  await candidate.close().catch(() => {});
  return isCurrent;
}
