// المساعد الصوتي (OpenAI Realtime عبر WebRTC) — للويب فقط.
// الحسابات كلها تتم في السيرفر عبر أداة konkan، والنموذج لا يحسب بنفسه.
import { API_BASE, callKonkan, KonkanResponse, RemoteState } from "@/src/utils/konkanSync";

export type VoiceStatus = "connecting" | "live" | "closed" | "error";

export type VoiceHandle = { stop: () => void };

// الجملة التي ينطقها المساعد بعد العملية: تُبنى هنا من أرقام السيرفر فتكون دقيقة دائمًا.
function numWord(n: number): string {
  return n < 0 ? `ناقص ${Math.abs(n)}` : `${n}`;
}

export function buildSpeech(action: string, r: KonkanResponse): string | null {
  if (!r.ok) return null; // الخطأ يشرحه المساعد بنفسه
  const sm: any = r.summary;
  if (action === "start" || action === "rename") return "تمام";
  if (action === "round" || action === "edit" || action === "undo") {
    const totals: { name: string; total: number }[] = Array.isArray(sm?.totals) ? [...sm.totals] : [];
    if (!totals.length) return "تمام";
    totals.sort((a, b) => a.total - b.total);
    let line = "تمام. " + totals.map((t) => `${t.name} ${numWord(t.total)}`).join("، ") + ".";
    if (sm?.game_over && sm?.leader_lowest_score) {
      line += ` انتهت اللعبة، والفائز ${sm.leader_lowest_score}.`;
    } else if (sm?.leader_lowest_score) {
      line += ` المتصدر ${sm.leader_lowest_score}.`;
    }
    return line;
  }
  return null; // status وغيرها: يجيب المساعد على السؤال بنفسه
}

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
    let inflight: Promise<string | null>[] = [];

    const runCall = async (callId: string, name: string, rawArgs: string): Promise<string | null> => {
      let output: unknown;
      let say: string | null = null;
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
        say = buildSpeech(String(args.action || ""), r);
        output = r.ok
          ? { ok: true, summary: r.summary, edited: r.body?.edited }
          : { error: r.error || "failed", details: r.body && typeof r.body === "object" ? r.body : undefined };
      }
      send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
      });
      return say;
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
              .catch(() => [] as (string | null)[])
              .then((says) => {
                const say = (says || []).filter((x): x is string => !!x).pop();
                if (say) {
                  // نأمر المساعد بنطق الجملة حرفيًا (أرقامها من السيرفر) ونمنعه من استدعاء أدوات أخرى
                  send({
                    type: "response.create",
                    response: {
                      tool_choice: "none",
                      instructions:
                        "انطق الجملة التالية حرفيًا بالعربية بلهجة سعودية، دون أي كلمة قبلها أو بعدها ودون أي تغيير في الأسماء أو الأرقام: «" +
                        say +
                        "»",
                    },
                  });
                } else {
                  send({ type: "response.create" });
                }
              });
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
