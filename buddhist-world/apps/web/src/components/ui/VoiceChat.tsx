import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type RemoteTrack,
} from "livekit-client";
import { VOICE_RADIUS_M, SOCKET_EVENTS as E } from "@bw/shared";
import { useAuth } from "../../stores/auth";
import { useGame } from "../../stores/game";
import { getSocket, remoteTargets } from "../../game/multiplayer/socket";
import { isGameplayInputBlocked } from "../../game/core/input";
import { closeAudioContextIfCurrent } from "./voiceAudioLifecycle";

const ACTIVITY_LABELS: Record<string, string> = {
  guided_tour: "Tham quan có hướng dẫn", world_visit: "Tham quan tự do",
  meditation: "Thiền tập", dharma_talk: "Pháp thoại", ceremony: "Nghi lễ",
};

type SpatialVoiceNode = {
  source: MediaStreamAudioSourceNode;
  panner: PannerNode;
  gain: GainNode;
};

export function VoiceChat() {
  const userId = useAuth((state) => state.user?.id);
  const accessToken = useAuth((state) => state.accessToken);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [activityType, setActivityType] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [talking, setTalkingState] = useState(false);
  const [peerIds, setPeerIds] = useState<string[]>([]);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(() => new Set());
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("Chưa kết nối trò chuyện thoại");
  const roomRef = useRef<Room | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const localTrackRef = useRef<LocalAudioTrack | null>(null);
  const spatialNodesRef = useRef(new Map<string, SpatialVoiceNode>());
  const peerVolumesRef = useRef<Record<string, number>>({});
  const peerIdsRef = useRef<string[]>([]);
  const allowedListenersRef = useRef<string[]>([]);
  const partyRoomRef = useRef(false);
  const connectedRoomRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const connectionAttemptRef = useRef(0);
  const enabledRef = useRef(false);
  const talkingRef = useRef(false);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const removeSpatialNode = useCallback((identity: string) => {
    const node = spatialNodesRef.current.get(identity);
    if (!node) return;
    node.source.disconnect();
    node.panner.disconnect();
    node.gain.disconnect();
    spatialNodesRef.current.delete(identity);
  }, []);

  const attachSpatialTrack = useCallback((track: RemoteTrack, identity: string) => {
    const context = audioContextRef.current;
    if (!context || track.kind !== Track.Kind.Audio || !track.mediaStreamTrack) return;
    removeSpatialNode(identity);
    const source = context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = VOICE_RADIUS_M;
    panner.rolloffFactor = 1;
    const gain = context.createGain();
    gain.gain.value = peerVolumesRef.current[identity] ?? 1;
    source.connect(panner);
    panner.connect(gain);
    gain.connect(context.destination);
    spatialNodesRef.current.set(identity, { source, panner, gain });
  }, [removeSpatialNode]);

  const disconnectVoice = useCallback(async () => {
    connectionAttemptRef.current += 1;
    connectingRef.current = false;
    setConnecting(false);
    enabledRef.current = false;
    talkingRef.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    connectedRoomRef.current = null;
    partyRoomRef.current = false;
    const localTrack = localTrackRef.current;
    localTrackRef.current = null;
    if (room && localTrack) {
      try { await room.localParticipant.unpublishTrack(localTrack); } catch { /* Room may already be disconnected. */ }
      localTrack.stop();
    }
    room?.disconnect();
    for (const identity of [...spatialNodesRef.current.keys()]) removeSpatialNode(identity);
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context) await context.close().catch(() => {});
    setConnected(false);
    setEnabled(false);
    setCanPublish(false);
    setActivityType(null);
    setTalkingState(false);
    peerIdsRef.current = [];
    setPeerIds([]);
    setSpeakingIds(new Set());
    setMessage("Chưa kết nối trò chuyện thoại");
  }, [removeSpatialNode]);

  const connectVoice = useCallback(async () => {
    if (roomRef.current) {
      await disconnectVoice();
      return;
    }
    if (connectingRef.current) return;
    if (!accessToken) {
      setMessage("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      return;
    }
    const attempt = ++connectionAttemptRef.current;
    let pendingRoom: Room | null = null;
    let pendingContext: AudioContext | null = null;
    connectingRef.current = true;
    setConnecting(true);
    setMessage("Đang kết nối trò chuyện thoại…");
    try {
      const response = await fetch("/api/voice/token", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await response.json() as { url?: string; token?: string; room?: string; error?: string; canPublish?: boolean; activityType?: string | null; subscriptionMode?: "publisher-acl" | "party" };
      if (!response.ok || !payload.url || !payload.token) {
        throw new Error(payload.error ?? "Không thể cấp quyền trò chuyện thoại.");
      }

      // The click is a user gesture: unlock audio playback even when the player
      // chooses to listen without granting microphone access.
      const context = new AudioContext();
      pendingContext = context;
      audioContextRef.current = context;
      await context.resume();
      if (connectionAttemptRef.current !== attempt) {
        await closeAudioContextIfCurrent(context, audioContextRef.current, () => {
          audioContextRef.current = null;
        });
        pendingContext = null;
        return;
      }

      partyRoomRef.current = payload.subscriptionMode === "party";
      const room = new Room({ adaptiveStream: false, dynacast: false });
      pendingRoom = room;
      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        publication.setSubscribed(partyRoomRef.current || peerIdsRef.current.includes(participant.identity));
      });
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        attachSpatialTrack(track, participant.identity);
      });
      room.on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant) => {
        removeSpatialNode(participant.identity);
      });
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        removeSpatialNode(participant.identity);
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setSpeakingIds(new Set(speakers.map((speaker) => speaker.identity).filter((id) => id !== userIdRef.current)));
      });
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room) void disconnectVoice();
      });

      // Server-side RoomServiceClient selectively subscribes only to tracks
      // whose owners are currently within the authoritative proximity radius.
      await room.connect(payload.url, payload.token, { autoSubscribe: false });
      if (connectionAttemptRef.current !== attempt) {
        room.disconnect();
        await closeAudioContextIfCurrent(context, audioContextRef.current, () => {
          audioContextRef.current = null;
        });
        pendingRoom = null;
        pendingContext = null;
        return;
      }
      roomRef.current = room;
      pendingRoom = null;
      pendingContext = null;
      connectedRoomRef.current = payload.room ?? null;
      setCanPublish(payload.canPublish === true);
      setActivityType(payload.activityType ?? null);
      if (partyRoomRef.current) room.localParticipant.setTrackSubscriptionPermissions(true);
      else room.localParticipant.setTrackSubscriptionPermissions(false, allowedListenersRef.current.map((participantIdentity) => ({
        participantIdentity, allowAll: true,
      })));
      const nearby = new Set(peerIdsRef.current);
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          publication.setSubscribed(partyRoomRef.current || nearby.has(participant.identity));
        }
      }
      setConnected(true);
      setMessage(payload.canPublish === true
        ? "Đã kết nối thế giới · micro đang tắt"
        : "Đã kết nối · hoạt động này đang giới hạn quyền phát micro");
    } catch (error) {
      pendingRoom?.disconnect();
      pendingRoom = null;
      if (pendingContext) {
        await closeAudioContextIfCurrent(pendingContext, audioContextRef.current, () => {
          audioContextRef.current = null;
        });
        pendingContext = null;
      }
      if (connectionAttemptRef.current === attempt) {
        await disconnectVoice();
        setMessage(error instanceof Error ? error.message : "Không thể kết nối trò chuyện thoại.");
      }
    } finally {
      if (connectionAttemptRef.current === attempt) {
        connectingRef.current = false;
        setConnecting(false);
      }
    }
  }, [accessToken, attachSpatialTrack, disconnectVoice, removeSpatialNode]);

  const setTalking = useCallback((next: boolean) => {
    const track = localTrackRef.current;
    if (!track || !enabledRef.current) return;
    talkingRef.current = next;
    setTalkingState(next);
    if (next) void track.unmute().catch(() => setMessage("Không thể bật micro."));
    else void track.mute().catch(() => setMessage("Không thể tắt micro."));
  }, []);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room || !canPublish) return;
    if (localTrackRef.current) {
      setTalking(false);
      enabledRef.current = false;
      const track = localTrackRef.current;
      localTrackRef.current = null;
      try { await room.localParticipant.unpublishTrack(track); } catch { /* Continue cleanup. */ }
      track.stop();
      setEnabled(false);
      setMessage("Micro đang tắt");
      return;
    }
    let track: LocalAudioTrack | null = null;
    try {
      track = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      if (roomRef.current !== room) {
        track.stop();
        return;
      }
      await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
      if (roomRef.current !== room) {
        await room.localParticipant.unpublishTrack(track).catch(() => {});
        track.stop();
        return;
      }
      await track.mute();
      localTrackRef.current = track;
      enabledRef.current = true;
      setEnabled(true);
      setMessage("Micro sẵn sàng · giữ V hoặc nút nói để trò chuyện");
    } catch (error) {
      track?.stop();
      setMessage(error instanceof Error && error.name === "NotAllowedError"
        ? "Bạn chưa cấp quyền sử dụng micro."
        : "Không thể truy cập hoặc phát micro.");
    }
  };

  const setPeerVolume = (peerId: string, value: number) => {
    const next = { ...peerVolumesRef.current, [peerId]: value };
    peerVolumesRef.current = next;
    setPeerVolumes(next);
    const node = spatialNodesRef.current.get(peerId);
    if (node) node.gain.gain.value = value;
  };

  useEffect(() => {
    let attached: ReturnType<typeof getSocket> = null;
    const onPeers = (ids: string[]) => {
      const next = ids.filter((id) => id !== userIdRef.current);
      if (next.length === peerIdsRef.current.length && next.every((id, index) => id === peerIdsRef.current[index])) return;
      peerIdsRef.current = next;
      setPeerIds(next);
      const nearby = new Set(next);
      const room = roomRef.current;
      if (room) {
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            publication.setSubscribed(partyRoomRef.current || nearby.has(participant.identity));
          }
        }
      }
    };
    const onAllowedListeners = (ids: string[]) => {
      allowedListenersRef.current = ids.filter((id) => id !== userIdRef.current);
      if (partyRoomRef.current) return;
      roomRef.current?.localParticipant.setTrackSubscriptionPermissions(false, allowedListenersRef.current.map((participantIdentity) => ({
        participantIdentity, allowAll: true,
      })));
    };
    const onJoined = (payload: { regionId: string }) => {
      const expectedRoom = "bw-world-" + payload.regionId;
      if (connectedRoomRef.current && connectedRoomRef.current !== expectedRoom) {
        void disconnectVoice();
        setMessage("Bạn đã chuyển khu vực. Hãy kết nối trò chuyện lại.");
      }
    };
    const onDisconnect = () => {
      peerIdsRef.current = [];
      allowedListenersRef.current = [];
      setPeerIds([]);
      void disconnectVoice();
    };
    const attach = () => {
      const socket = getSocket();
      if (!socket || socket === attached) return;
      attached = socket;
      socket.on(E.serverVoicePeers, onPeers);
      socket.on(E.serverVoiceAllowedListeners, onAllowedListeners);
      socket.on(E.serverJoined, onJoined);
      socket.on("disconnect", onDisconnect);
    };
    attach();
    const retry = window.setInterval(attach, 200);
    return () => {
      window.clearInterval(retry);
      attached?.off(E.serverVoicePeers, onPeers);
      attached?.off(E.serverVoiceAllowedListeners, onAllowedListeners);
      attached?.off(E.serverJoined, onJoined);
      attached?.off("disconnect", onDisconnect);
    };
  }, [canPublish, disconnectVoice]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const context = audioContextRef.current;
      const local = useGame.getState().playerPosition;
      if (!context || !local) return;
      const listener = context.listener;
      listener.positionX.value = local[0];
      listener.positionY.value = local[1];
      listener.positionZ.value = local[2];
      const yaw = useGame.getState().playerYaw;
      listener.forwardX.value = Math.sin(yaw);
      listener.forwardY.value = 0;
      listener.forwardZ.value = Math.cos(yaw);
      for (const [identity, node] of spatialNodesRef.current) {
        const remote = remoteTargets.get(identity);
        if (!remote) {
          node.gain.gain.value = 0;
          continue;
        }
        node.panner.positionX.value = remote.p[0];
        node.panner.positionY.value = remote.p[1];
        node.panner.positionZ.value = remote.p[2];
        node.gain.gain.value = peerVolumesRef.current[identity] ?? 1;
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyV" || event.repeat || isTypingTarget(event.target) || isGameplayInputBlocked()) return;
      event.preventDefault();
      setTalking(true);
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === "KeyV") setTalking(false); };
    const onBlur = () => setTalking(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [setTalking]);

  useEffect(() => () => {
    connectionAttemptRef.current += 1;
    connectingRef.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    const track = localTrackRef.current;
    localTrackRef.current = null;
    if (room && track) {
      void room.localParticipant.unpublishTrack(track).catch(() => {});
      track.stop();
    }
    room?.disconnect();
    for (const node of spatialNodesRef.current.values()) {
      node.source.disconnect();
      node.panner.disconnect();
      node.gain.disconnect();
    }
    spatialNodesRef.current.clear();
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  return <section data-ui className={`voice-panel bw-voice-panel${collapsed ? " is-collapsed" : ""}`} aria-label="Trò chuyện thoại cùng khách tham quan">
    <header className="bw-social-panel-heading">
      <strong>Trò chuyện bằng giọng nói</strong>
      <button type="button" className="ghost" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "Mở" : "Thu gọn"}</button>
    </header>
    {!collapsed && <>
      <div className="voice-controls">
        <button type="button" className={connected ? "voice-toggle is-on" : "voice-toggle"} onClick={() => void connectVoice()} aria-pressed={connected} disabled={connecting}>
          {connecting ? "Đang kết nối…" : connected ? "Ngắt kết nối" : "Kết nối trò chuyện"}
        </button>
        <button type="button" className={enabled ? "voice-toggle is-on" : "voice-toggle"} onClick={() => void toggleMic()} disabled={!connected || !canPublish} aria-pressed={enabled}>
          {enabled ? "Tắt mic" : "Bật mic"}
        </button>
        <button type="button" className={talking ? "voice-ptt is-talking" : "voice-ptt"} disabled={!enabled}
          onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setTalking(true); }}
          onPointerUp={() => setTalking(false)} onPointerCancel={() => setTalking(false)} onLostPointerCapture={() => setTalking(false)}
          aria-pressed={talking} title="Giữ nút hoặc giữ phím V để nói">
          {talking ? "Đang phát biểu" : "Giữ để nói · V"}
        </button>
        <span className="voice-count">{activityType ? `Hoạt động: ${ACTIVITY_LABELS[activityType] ?? "Cùng tham quan"}` : `${peerIds.length} khách tham quan ở gần`}</span>
      </div>
      <span className="voice-status" role="status">{message}</span>
      <div className="voice-peer-list" aria-label="Âm lượng khách tham quan ở gần">
        {peerIds.map((id) => {
          const playerName = remoteTargets.get(id)?.name ?? `Người chơi ${id.slice(0, 6)}`;
          const volume = peerVolumes[id] ?? 1;
          const speaking = speakingIds.has(id);
          return <div className="voice-peer" key={id}>
            <div className="voice-peer-heading">
              <span className={speaking ? "voice-speaking-dot is-speaking" : "voice-speaking-dot"} aria-hidden="true"/>
              <strong>{playerName}</strong>
              <span>{speaking ? "Đang nói" : "Ở gần"}</span>
            </div>
            <label>
              <span>Âm lượng</span><input type="range" min="0" max="1" step="0.05" value={volume}
                aria-label={`Âm lượng của ${playerName}`} onChange={(event) => setPeerVolume(id, Number(event.target.value))}/>
              <output>{Math.round(volume * 100)}%</output>
            </label>
          </div>;
        })}
        {peerIds.length === 0 && <span className="voice-empty">Chưa có khách tham quan ở gần.</span>}
      </div>
      <small className="voice-status">Âm thanh không gian · Phạm vi tối đa {VOICE_RADIUS_M} m · Giữ V để nói</small>
    </>}
  </section>;
}
