// المساعد الصوتي (OpenAI Realtime عبر WebRTC) — للويب فقط.
// الحسابات كلها تتم في السيرفر عبر أداة konkan، والنموذج لا يحسب بنفسه.
import { API_BASE, callKonkan, RemoteState } from "@/src/utils/konkanSync";

export type VoiceStatus = "connecting" | "live" | "closed" | "error";

export type VoiceHandle = { stop: () => void };

export function voiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).RTCPeerConnection !== "undefined" &&
    !!(typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia)
  );
}

export async function startKonkanVoice(opts: {
  secret: string;
  onStatus: (s: VoiceStatus, msg?: string) => void;
  onAssistantText: (t: string) => void;
  onState: (state: RemoteState) => void;
}): Promise<VoiceHandle> {
  const { secret, onStatus, onAssistantText, onState } = opts;
  onStatus("connecting");

  let pc: RTCPeerConnection | null = null;
  let mic: MediaStream | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let stopped = false;

  const stop = (silent = false) => {
    if (stopped) return;
    stopped = true;
    try {
      mic?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      pc?.close();
    } catch {}
    try {
      if (audioEl) audioEl.srcObject = null;
    } catch {}
    if (!silent) onStatus("closed");
  };

  try {
    // 1) مفتاح جلسة مؤقت من السيرفر
    const sres = await fetch(`${API_BASE}/api/konkan-session`, {
      method: "POST",
      headers: { "x-konkan-secret": secret },
    });
    const sjson: any = await sres.json().catch(() => null);
    if (!sres.ok || !sjson?.value) {
      throw new Error(sjson?.error ? String(sjson.error) : `session_${sres.status}`);
    }
    const ephemeral: string = sjson.value;

    // 2) المايك والصوت
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc = new RTCPeerConnection();
    audioEl = new Audio();
    audioEl.autoplay = true;
    pc.ontrack = (e) => {
      if (audioEl) audioEl.srcObject = e.streams[0];
    };
    mic.getTracks().forEach((t) => pc!.addTrack(t, mic!));

    const dc = pc.createDataChannel("oai-events");
    const send = (obj: unknown) => {
      if (dc.readyState === "open") dc.send(JSON.stringify(obj));
    };

    const seenCalls = new Set<string>();
    let inflight: Promise<void>[] = [];

    const runCall = async (callId: string, name: string, rawArgs: string) => {
      let output: unknown;
      if (name !== "konkan") {
        output = { error: "unknown_tool" };
      } else {
        let args: Record<string, unknown> = {};
        try {
          args = rawArgs ? JSON.parse(rawArgs) : {};
        } catch {
          args = {};
        }
        const r = await callKonkan(secret, args);
        if (r.state) onState(r.state);
        output = r.ok
          ? { ok: true, summary: r.summary, edited: r.body?.edited }
          : { error: r.error || "failed", details: r.body && typeof r.body === "object" ? r.body : undefined };
      }
      send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
      });
    };

    dc.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "response.function_call_arguments.done": {
          const id = String(msg.call_id || "");
          if (!id || seenCalls.has(id)) break;
          seenCalls.add(id);
          inflight.push(runCall(id, String(msg.name || ""), String(msg.arguments || "")));
          break;
        }
        case "response.done": {
          if (inflight.length) {
            const batch = inflight;
            inflight = [];
            Promise.all(batch)
              .catch(() => {})
              .then(() => send({ type: "response.create" }));
          }
          break;
        }
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": {
          if (msg.transcript) onAssistantText(String(msg.transcript));
          break;
        }
        case "error": {
          onStatus("error", msg?.error?.message || "realtime_error");
          break;
        }
      }
    };
    dc.onopen = () => onStatus("live");
    dc.onclose = () => {
      if (!stopped) stop();
    };
    pc.onconnectionstatechange = () => {
      const s = pc?.connectionState;
      if (s === "failed" || s === "disconnected" || s === "closed") {
        if (!stopped) stop();
      }
    };

    // 3) اتفاق الاتصال مع OpenAI
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const ares = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${ephemeral}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
    });
    if (!ares.ok) throw new Error(`calls_${ares.status}`);
    await pc.setRemoteDescription({ type: "answer", sdp: await ares.text() });
  } catch (e: any) {
    onStatus("error", e?.message || String(e));
    stop(true);
    throw e;
  }

  return { stop: () => stop() };
}
