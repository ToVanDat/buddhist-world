import { describe, expect, it, vi } from "vitest";
import { enforceVoiceMute } from "./voiceEnforcement.js";

describe("LiveKit voice mute enforcement", () => {
  it("always removes the participant even when track mute and permission update fail", async () => {
    const mutePublishedTracks = vi.fn().mockRejectedValue(new Error("track mute failed"));
    const revokePublishPermission = vi.fn().mockRejectedValue(new Error("permission update failed"));
    const removeParticipant = vi.fn().mockResolvedValue(undefined);

    await expect(enforceVoiceMute({
      mutePublishedTracks,
      revokePublishPermission,
      removeParticipant,
    })).resolves.toEqual({
      trackMuteFailed: true,
      permissionUpdateFailed: true,
    });

    expect(mutePublishedTracks).toHaveBeenCalledOnce();
    expect(revokePublishPermission).toHaveBeenCalledOnce();
    expect(removeParticipant).toHaveBeenCalledOnce();
  });

  it("surfaces participant removal failure so the route cannot report a successful mute", async () => {
    const removeParticipant = vi.fn().mockRejectedValue(new Error("remove failed"));

    await expect(enforceVoiceMute({
      mutePublishedTracks: vi.fn().mockResolvedValue(undefined),
      revokePublishPermission: vi.fn().mockResolvedValue(undefined),
      removeParticipant,
    })).rejects.toThrow("remove failed");
  });

  it("reports no enforcement warnings when all LiveKit operations succeed", async () => {
    await expect(enforceVoiceMute({
      mutePublishedTracks: vi.fn().mockResolvedValue(undefined),
      revokePublishPermission: vi.fn().mockResolvedValue(undefined),
      removeParticipant: vi.fn().mockResolvedValue(undefined),
    })).resolves.toEqual({
      trackMuteFailed: false,
      permissionUpdateFailed: false,
    });
  });
});
