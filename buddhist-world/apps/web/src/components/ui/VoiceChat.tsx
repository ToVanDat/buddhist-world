import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_RADIUS_M, SOCKET_EVENTS as E } from "@bw/shared";
import { useAuth } from "../../stores/auth";
import { useGame } from "../../stores/game";
import { getSocket, remoteTargets } from "../../game/multiplayer/socket";

type VoiceSignal = { fromId: string; type: "offer" | "answer" | "candidate"; sdp?: string; candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; polite: boolean; makingOffer: boolean; ignoreOffer: boolean; settingRemoteAnswer: boolean; pendingCandidates: RTCIceCandidateInit[] };

export function VoiceChat() {
  const userId = useAuth((state) => state.user?.id);
  const accessToken = useAuth((state) => state.accessToken);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const [enabled, setEnabled] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [message, setMessage] = useState("Mic đang tắt");
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, Peer>());
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

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
      if (remoteStream) { audio.srcObject = remoteStream; void audio.play().catch(() => setMessage("Chạm vào trang để cho phép phát âm thanh.")); }
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed" || pc.connectionState === "closed") audio.srcObject = null; };
    const peer = { pc, audio, polite: (userIdRef.current ?? "").localeCompare(peerId) > 0, makingOffer: false, ignoreOffer: false, settingRemoteAnswer: false, pendingCandidates: [] };
    peersRef.current.set(peerId, peer);
    setPeerCount(peersRef.current.size);
    return peer;
  }, [iceServers, sendSignal]);
  const closePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    peer.pc.onicecandidate = null; peer.pc.ontrack = null; peer.pc.close();
    peer.audio.pause(); peer.audio.srcObject = null;
    peersRef.current.delete(peerId);
    setPeerCount(peersRef.current.size);
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
    const { pc } = createPeer(peerId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (offer.sdp) sendSignal(peerId, { type: "offer", sdp: offer.sdp });
    } catch { closePeer(peerId); setMessage("Không thể thiết lập kết nối thoại."); }
  }, [createPeer, sendSignal, closePeer]);

  useEffect(() => {
    let attached: ReturnType<typeof getSocket> = null;
    const onPeers = (ids: string[]) => {
      const next = ids.filter((id) => id !== userId);
      for (const id of [...peersRef.current.keys()]) if (!next.includes(id)) closePeer(id);
      for (const id of next) void offerTo(id);
    };
    const onSignal = async (signal: VoiceSignal) => {
      if (!signal.fromId || signal.fromId === userId) return;
      const peer = createPeer(signal.fromId);
      try {
        if (signal.type === "offer" && signal.sdp) {
          await peer.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          if (answer.sdp) sendSignal(signal.fromId, { type: "answer", sdp: answer.sdp });
        } else if (signal.type === "answer" && signal.sdp) {
          await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        } else if (signal.type === "candidate" && signal.candidate) {
          await peer.pc.addIceCandidate({ candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex });
        }
      } catch { closePeer(signal.fromId); setMessage("Kết nối thoại với một người chơi bị gián đoạn."); }
    };
    const onDisconnect = () => { for (const id of [...peersRef.current.keys()]) closePeer(id); };
    const attach = () => {
      const socket = getSocket();
      if (!socket || socket === attached) return;
      attached = socket;
      socket.on(E.serverVoicePeers, onPeers);
      socket.on(E.serverVoiceSignal, onSignal);
      socket.on("disconnect", onDisconnect);
    };
    attach();
    const retry = window.setInterval(attach, 200);
    return () => {
      window.clearInterval(retry);
      attached?.off(E.serverVoicePeers, onPeers);
      attached?.off(E.serverVoiceSignal, onSignal);
      attached?.off("disconnect", onDisconnect);
    };
  }, [userId, closePeer, createPeer, offerTo, sendSignal]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const local = useGame.getState().playerPosition;
      if (!local) return;
      for (const [id, peer] of peersRef.current) {
        const remote = remoteTargets.get(id);
        if (!remote) continue;
        const distance = Math.hypot(local[0] - remote.p[0], local[2] - remote.p[2]);
        peer.audio.volume = Math.max(0, Math.min(1, 1 - distance / VOICE_RADIUS_M));
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const toggleMic = async () => {
    if (enabled) {
      streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
      setEnabled(false); setMessage("Mic đang tắt"); return;
    }
    try {
      const stream = streamRef.current ?? await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
      });
      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => { track.enabled = true; });
      for (const [peerId, peer] of peersRef.current) {
        const hasAudioSender = peer.pc.getSenders().some((sender) => sender.track?.kind === "audio");
        if (!hasAudioSender) stream.getAudioTracks().forEach((track) => peer.pc.addTrack(track, stream));
        if (peer.pc.signalingState === "stable") {
          const offer = await peer.pc.createOffer();
          await peer.pc.setLocalDescription(offer);
          if (offer.sdp) sendSignal(peerId, { type: "offer", sdp: offer.sdp });
        }
      }
      setEnabled(true); setMessage("Mic đang bật · phạm vi 35 m");
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setMessage(denied ? "Bạn chưa cấp quyền sử dụng micro." : "Không thể truy cập micro trên thiết bị này.");
    }
  };
  useEffect(() => () => {
    for (const [id, peer] of peersRef.current) { peer.pc.close(); peer.audio.pause(); peer.audio.srcObject = null; peersRef.current.delete(id); }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  return <section data-ui className="voice-panel" aria-label="Trò chuyện thoại">
    <button type="button" className={enabled ? "voice-toggle is-on" : "voice-toggle"} onClick={() => void toggleMic()} aria-pressed={enabled}>
      <span aria-hidden="true">{enabled ? "🎙" : "🔇"}</span>{enabled ? "Tắt mic" : "Bật mic"}
    </button>
    <span className="voice-status" role="status">{message}</span>
    <span className="voice-count">{peerCount} kết nối thoại</span>
  </section>;
}
