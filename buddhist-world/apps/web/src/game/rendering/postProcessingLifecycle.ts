export interface DisposablePostProcessingResources {
  passes: Array<{ dispose?: () => void }>;
  renderTarget1: { depthTexture?: { dispose: () => void } | null };
  renderTarget2: { depthTexture?: { dispose: () => void } | null };
  dispose: () => void;
}

/** Releases pass-owned resources and depth attachments before the composer targets. */
export function disposePostProcessingResources(composer: DisposablePostProcessingResources): void {
  for (const pass of composer.passes) pass.dispose?.();
  composer.renderTarget1.depthTexture?.dispose();
  composer.renderTarget2.depthTexture?.dispose();
  composer.dispose();
}
