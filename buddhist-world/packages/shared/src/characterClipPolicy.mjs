/** Match animation aliases as complete name tokens, not arbitrary substrings. */
export function matchesAnimationAlias(animationName, aliases) {
  const tokens = animationName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return aliases.some((alias) => tokens.includes(alias));
}

/** Return required motions without a directly-authored matching animation clip. */
export function findMissingAnimationMotions(animationNames, profile) {
  return Object.entries(profile)
    .filter(([, aliases]) => !animationNames.some((name) => matchesAnimationAlias(name, aliases)))
    .map(([motion]) => motion);
}
