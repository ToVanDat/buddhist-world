export function matchesAnimationAlias(animationName: string, aliases: readonly string[]): boolean;
export function findMissingAnimationMotions(animationNames: readonly string[], profile: Record<string, readonly string[]>): string[];

export interface AnimationContractClip {
  name: string;
  channelCount: number;
}
export function findMissingOrEmptyAnimationMotions(
  animations: readonly AnimationContractClip[],
  profile: Record<string, readonly string[]>,
): string[];
