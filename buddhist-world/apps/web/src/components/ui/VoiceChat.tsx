import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_RADIUS_M, SOCKET_EVENTS as E } from "@bw/shared";
import { useAuth } from "../../stores/auth";
import { useGame } from "../../stores/game";
import { getSocket, remoteTargets } from "../../game/multiplayer/socket";

type VoiceSignal = { fromId: string; type: "offer" | "answer" | "candidate"; sdp?: string; candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
type VoiceActivity = { userId: string; active: boolean };
type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; polite: boolean; makingOffer: boolean; ignoreOffer: boolean; settingRemoteAnswer: boolean; pendingCandidates: RTCIceCandidateInit[] };

export function VoiceChat() {
  const userId = useAuth((state) => state.user?.id);
  const accessToken = useAuth((state) => state.accessToken);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const [enabled, setEnabled] = useState(false);
  const [talking, setTalkingState] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(() => new Set());
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("Micro đang tắt");
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, Peer>());
  const userIdRef = useRef(userId);
  const enabledRef = useRef(false);
  const talkingRef = useRef(false);
  const speakingRef = useRef(false);
  const activityRef = useRef(false);
  const voicePeerIdsRef = useRef(new Set<string>());
  const peerVolumesRef = useRef<Record<string, number>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const userIdLatest = useRef(userId);
  userIdRef.current = userId;
  userIdLatest.current = userId;

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void fetch("/api/voice/ice-servers", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled && Array.isArray(data?.iceServers) && data.iceServers.length) setIceServers(data.iceServers); })
      .catch(() => { /* STUN fallback remains available when TURN is not configured. */ });
    return () => { cancelled = true; };
  }, [accessToken]);

  const sendSignal = useCallback((targetId: string, signal: Record<string, unknown>) => {
    getSocket()?.emit(E.clientVoiceSignal, { targetId, ...signal });
  }, []);
  const sendActivity = useCallback((active: boolean) => {
    if (activityRef.current === active) return;
    activityRef.current = active;
    getSocket()?.emit(E.clientVoiceActivity, { active });
  }, []);
  const setTalking = useCallback((next: boolean) => {
    if (next && !enabledRef.current) return;
    talkingRef.current = next;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    setTalkingState(next);
    if (!next) {
      speakingRef.current = false;
      setIsSpeaking(false);
      sendActivity(false);
    }
  }, [sendActivity]);

  const createPeer = useCallback((peerId: string): Peer => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers });
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    const stream = streamRef.current;
    stream?.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      sendSignal(peerId, { type: "candidate", candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex });
    };
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        audio.srcObject = remoteStream;
        void audio.play().catch(() => setMessage("Chạm vào trang để cho phép phát âm thanh."));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") audio.srcObject = null;
    };
    const peer = { pc, audio, polite: (userIdRef.current ?? "").localeCompare(peerId) > 0, makingOffer: false, ignoreOffer: false, settingRemoteAnswer: false, pendingCandidates: [] };
    peersRef.current.set(peerId, peer);
    setPeerCount(peersRef.current.size);
    return peer;
  }, [iceServers, sendSignal]);

  const closePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.close();
    peer.audio.pause();
    peer.audio.srcObject = null;
    peersRef.current.delete(peerId);
    setPeerCount(peersRef.current.size);
    setPeerVolumes((previous) => {
      const next = { ...previous };
      delete next[peerId];
      peerVolumesRef.current = next;
      return next;
    });
    setSpeakingIds((previous) => {
      const next = new Set(previous);
      next.delete(peerId);
      return next;
    });
  }, []);

  const makeOffer = useCallback(async (peerId: string, peer: Peer) => {
    if (peer.pc.signalingState !== "stable") return;
    peer.makingOffer = true;
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      if (offer.sdp) sendSignal(peerId, { type: "offer", sdp: offer.sdp });
    } finally { peer.makingOffer = false; }
  }, [sendSignal]);

  const offerTo = useCallback(async (peerId: string) => {
    if (!userIdRef.current || userIdRef.current.localeCompare(peerId) >= 0 || peersRef.current.has(peerId)) return;
    const peer = createPeer(peerId);
    try { await makeOffer(peerId, peer); }
    catch { closePeer(peerId); setMessage("Không thể thiết lập kết nối thoại."); }
  }, [createPeer, makeOffer, closePeer]);

  useEffect(() => {
    let attached: ReturnType<typeof getSocket> = null;
    const onPeers = (ids: string[]) => {
      const next = ids.filter((id) => id !== userId);
      voicePeerIdsRef.current = new Set(next);
      for (const id of [...peersRef.current.keys()]) if (!voicePeerIdsRef.current.has(id)) closePeer(id);
      setSpeakingIds((previous) => new Set([...previous].filter((id) => voicePeerIdsRef.current.has(id))));
      for (const id of next) void offerTo(id);
    };
    const onSignal = async (signal: VoiceSignal) => {
      if (!signal.fromId || signal.fromId === userId) return;
      const peer = createPeer(signal.fromId);
      try {
        if (signal.type === "offer" && signal.sdp) {
          const collision = peer.makingOffer || (peer.pc.signalingState !== "stable" && !peer.settingRemoteAnswer);
          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;
          if (collision) await peer.pc.setLocalDescription({ type: "rollback" });
          await peer.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          for (const candidate of peer.pendingCandidates.splice(0)) await peer.pc.addIceCandidate(candidate);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          if (answer.sdp) sendSignal(signal.fromId, { type: "answer", sdp: answer.sdp });
        } else if (signal.type === "answer" && signal.sdp) {
          peer.settingRemoteAnswer = true;
          await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          peer.settingRemoteAnswer = false;
          for (const candidate of peer.pendingCandidates.splice(0)) await peer.pc.addIceCandidate(candidate);
        } else if (signal.type === "candidate" && signal.candidate) {
          const candidate: RTCIceCandidateInit = { candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex };
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate);
          else peer.pendingCandidates.push(candidate);
        }
      } catch {
        closePeer(signal.fromId);
        setMessage("Kết nối thoại với một người chơi bị gián đoạn.");
      }
    };
    const onActivity = (activity: VoiceActivity) => {
      if (!activity?.userId || activity.userId === userIdLatest.current) return;
      if (activity.active && !voicePeerIdsRef.current.has(activity.userId)) return;
      setSpeakingIds((previous) => {
        const next = new Set(previous);
        if (activity.active) next.add(activity.userId);
        else next.delete(activity.userId);
        return next;
      });
    };
    const onDisconnect = () => {
      for (const id of [...peersRef.current.keys()]) closePeer(id);
      voicePeerIdsRef.current.clear();
      setSpeakingIds(new Set());
      sendActivity(false);
    };
    const attach = () => {
      const socket = getSocket();
      if (!socket || socket === attached) return;
      attached = socket;
      socket.on(E.serverVoicePeers, onPeers);
      socket.on(E.serverVoiceSignal, onSignal);
      socket.on(E.serverVoiceActivity, onActivity);
      socket.on("disconnect", onDisconnect);
    };
    attach();
    const retry = window.setInterval(attach, 200);
    return () => {
      window.clearInterval(retry);
      attached?.off(E.serverVoicePeers, onPeers);
      attached?.off(E.serverVoiceSignal, onSignal);
      attached?.off(E.serverVoiceActivity, onActivity);
      attached?.off("disconnect", onDisconnect);
    };
  }, [userId, closePeer, createPeer, offerTo, sendSignal, sendActivity]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const local = useGame.getState().playerPosition;
      if (!local) return;
      for (const [id, peer] of peersRef.current) {
        const remote = remoteTargets.get(id);
        if (!remote) continue;
        const distance = Math.hypot(local[0] - remote.p[0], local[2] - remote.p[2]);
        const attenuation = Math.max(0, Math.min(1, 1 - distance / VOICE_RADIUS_M));
        peer.audio.volume = attenuation * (peerVolumesRef.current[id] ?? 1);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const buffer = new Float32Array(512);
    let lastVoiceAt = 0;
    const timer = window.setInterval(() => {
      const analyser = analyserRef.current;
      if (!analyser || !talkingRef.current) {
        if (speakingRef.current) {
          speakingRef.current = false;
          setIsSpeaking(false);
          sendActivity(false);
        }
        return;
      }
      analyser.getFloatTimeDomainData(buffer);
      let energy = 0;
      for (const sample of buffer) energy += sample * sample;
      const rms = Math.sqrt(energy / buffer.length);
      if (rms > 0.035) lastVoiceAt = Date.now();
      const active = Date.now() - lastVoiceAt < 280;
      if (active !== speakingRef.current) {
        speakingRef.current = active;
        setIsSpeaking(active);
        sendActivity(active);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [sendActivity]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyV" || event.repeat || isTypingTarget(event.target)) return;
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

  const toggleMic = async () => {
    if (enabledRef.current) {
      setTalking(false);
      enabledRef.current = false;
      streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
      setEnabled(false);
      setMessage("Micro đang tắt");
      return;
    }
    try {
      const stream = streamRef.current ?? await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
      });
      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => { track.enabled = false; });
      if (!audioContextRef.current) {
        const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          const context = new AudioContextCtor();
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          context.createMediaStreamSource(stream).connect(analyser);
          audioContextRef.current = context;
          analyserRef.current = analyser;
        }
      }
      await audioContextRef.current?.resume();
      enabledRef.current = true;
      for (const [peerId, peer] of peersRef.current) {
        const hasAudioSender = peer.pc.getSenders().some((sender) => sender.track?.kind === "audio");
        if (!hasAudioSender) stream.getAudioTracks().forEach((track) => peer.pc.addTrack(track, stream));
        if (peer.pc.signalingState === "stable") await makeOffer(peerId, peer);
      }
      setEnabled(true);
      setMessage("Mic sẵn sàng · giữ V để nói");
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setMessage(denied ? "Bạn chưa cấp quyền sử dụng micro." : "Không thể truy cập micro trên thiết bị này.");
    }
  };

  const setPeerVolume = (peerId: string, value: number) => {
    const next = { ...peerVolumesRef.current, [peerId]: value };
    peerVolumesRef.current = next;
    setPeerVolumes(next);
  };

  useEffect(() => () => {
    getSocket()?.emit(E.clientVoiceActivity, { active: false });
    for (const [id, peer] of peersRef.current) {
      peer.pc.close();
      peer.audio.pause();
      peer.audio.srcObject = null;
      peersRef.current.delete(id);
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  return <section data-ui className="voice-panel" aria-label="Trò chuyện thoại">
    <div className="voice-controls">
      <button type="button" className={enabled ? "voice-toggle is-on" : "voice-toggle"} onClick={() => void toggleMic()} aria-pressed={enabled}>
        <span aria-hidden="true">{enabled ? "🎙" : "🔇"}</span>{enabled ? "Tắt mic" : "Bật mic"}
      </button>
      <button type="button" className={talking ? "voice-ptt is-talking" : "voice-ptt"} disabled={!enabled}
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setTalking(true); }}
        onPointerUp={() => setTalking(false)} onPointerCancel={() => setTalking(false)} onLostPointerCapture={() => setTalking(false)}
        aria-pressed={talking} title="Giữ nút hoặc giữ phím V để nói">
        {isSpeaking ? "Đang nói" : talking ? "Đang giữ…" : "Giữ để nói · V"}
      </button>
      <span className="voice-count">{peerCount} người</span>
    </div>
    <span className="voice-status" role="status">{message}{isSpeaking ? " · Bạn đang nói" : ""}</span>
    <div className="voice-peer-list" aria-label="Âm lượng người chơi gần bạn">
      {[...peersRef.current.keys()].map((id) => {
        const playerName = remoteTargets.get(id)?.name ?? `Người chơi ${id.slice(0, 6)}`;
        const volume = peerVolumes[id] ?? 1;
        const speaking = speakingIds.has(id);
        return <div className="voice-peer" key={id}>
          <div className="voice-peer-heading">
            <span className={speaking ? "voice-speaking-dot is-speaking" : "voice-speaking-dot"} aria-hidden="true"/>
            <strong>{playerName}</strong>
            <span>{speaking ? "Đang nói" : "Đã kết nối"}</span>
          </div>
          <label>
            <span>Âm lượng</span><input type="range" min="0" max="1" step="0.05" value={volume}
              aria-label={`Âm lượng của ${playerName}`} onChange={(event) => setPeerVolume(id, Number(event.target.value))}/>
            <output>{Math.round(volume * 100)}%</output>
          </label>
        </div>;
      })}
      {peerCount === 0 && <span className="voice-empty">Chưa có người chơi trong phạm vi thoại.</span>}
    </div>
  </section>;
}
