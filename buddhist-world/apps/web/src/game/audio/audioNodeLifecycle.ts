/** Release a short-lived spatial output after every source connected to it has ended. */
export function createAudioNodeRelease(
  node: Pick<AudioNode, "disconnect">,
  sourceCount: number,
): () => void {
  let remaining = Number.isFinite(sourceCount) ? Math.max(0, Math.floor(sourceCount)) : 0;
  let released = false;
  return () => {
    if (released) return;
    if (remaining > 0) remaining -= 1;
    if (remaining === 0) {
      released = true;
      node.disconnect();
    }
  };
}
