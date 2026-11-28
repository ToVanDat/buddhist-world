/** Close a stale voice AudioContext without clearing a newer connection's context. */
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
