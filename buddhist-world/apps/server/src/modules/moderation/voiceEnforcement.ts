export interface VoiceMuteEnforcementSteps {
  mutePublishedTracks: () => Promise<void>;
  revokePublishPermission: () => Promise<void>;
  removeParticipant: () => Promise<void>;
}

/**
 * A participant must be disconnected even if an earlier LiveKit operation
 * fails. Redis blocks fresh publish tokens; removal is the final live-session
 * safety boundary for an already connected publisher.
 */
export async function enforceVoiceMute(steps: VoiceMuteEnforcementSteps) {
  const [trackMute, permissionUpdate] = await Promise.allSettled([
    steps.mutePublishedTracks(),
    steps.revokePublishPermission(),
  ]);

  // Do not short-circuit removal when muting a track or changing permissions
  // fails. If removal itself fails, the caller must treat enforcement as failed.
  await steps.removeParticipant();

  return {
    trackMuteFailed: trackMute.status === "rejected",
    permissionUpdateFailed: permissionUpdate.status === "rejected",
  };
}
