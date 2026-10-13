import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  callKonkan,
  loadSecret,
  RemoteState,
  saveSecret,
  takeSecretFromUrl,
} from "@/src/utils/konkanSync";
import { startKonkanVoice, VoiceHandle, voiceSupported, VoiceStatus } from "@/src/utils/konkanVoice";

type GameState = {
  players: { id: string; name: string }[];
  rounds: { id: string; scores: Record<string, number> }[];
  threshold: 700 | 1000;
  started: boolean;
};

export type SyncStatus = "off" | "syncing" | "ok" | "error";

// الجزء الذي نقارنه بين الجهاز والسيرفر (بدون version/updatedAt)
const core = (s: { players: any; rounds: any; threshold: any; started: any }) =>
  JSON.stringify({ players: s.players, rounds: s.rounds, threshold: s.threshold, started: s.started });

export function useKonkanAssistant(params: {
  state: GameState;
  setState: (s: GameState) => void;
  hydrated: boolean;
  savedPlayers: string[];
  setSavedPlayers: (v: string[]) => void;
}) {
  const { state, setState, hydrated, savedPlayers, setSavedPlayers } = params;

  const [secret, setSecretState] = useState("");
  const [secretLoaded, setSecretLoaded] = useState(false);
  const [sync, setSync] = useState<SyncStatus>("off");
  const [voice, setVoice] = useState<VoiceStatus | "idle">("idle");
  const [voiceNote, setVoiceNote] = useState("");

  const stateRef = useRef(state);
  stateRef.current = state;
  const namesRef = useRef(savedPlayers);
  namesRef.current = savedPlayers;
  // آخر قائمة أسماء محفوظة نعرف أنها مطابقة للسيرفر ("" = لم نسحب بعد)
  const lastNamesRef = useRef<string>("");
  const secretRef = useRef(secret);
  secretRef.current = secret;

  const versionRef = useRef<number>(0);
  const lastCoreRef = useRef<string>("");
  const serverStartedRef = useRef(false);
  const busyRef = useRef(false);
  const voiceRef = useRef<VoiceHandle | null>(null);

  // ---- تحميل المفتاح ----
  useEffect(() => {
    (async () => {
      const fromUrl = Platform.OS === "web" ? takeSecretFromUrl() : null;
      if (fromUrl) await saveSecret(fromUrl);
      const s = fromUrl || (await loadSecret());
      setSecretState(s);
      setSecretLoaded(true);
    })();
  }, []);

  const setSecret = useCallback(async (s: string) => {
    const clean = s.trim();
    await saveSecret(clean);
    versionRef.current = 0;
    lastCoreRef.current = "";
    lastNamesRef.current = "";
    setSecretState(clean);
  }, []);

  // ---- تبنّي حالة السيرفر ----
  const adopt = useCallback(
    (r: RemoteState) => {
      if (!r || !Array.isArray(r.players) || !Array.isArray(r.rounds)) return;
      const next: GameState = {
        players: r.players,
        rounds: r.rounds,
        threshold: r.threshold === 1000 ? 1000 : 700,
        started: !!r.started,
      };
      const initial = lastCoreRef.current === "";
      versionRef.current = r.version ?? versionRef.current;
      serverStartedRef.current = next.started;
      lastCoreRef.current = core(next);
      if (core(stateRef.current) === lastCoreRef.current) return;
      // أول اتصال: لعبة محلية بدأت والسيرفر فارغ -> نرفع المحلية للسيرفر ولا نمسحها
      if (initial && stateRef.current.started && !next.started) return;
      // لا نستبدل إعدادًا محليًا قيد التحضير بلعبة سيرفر غير مبدوءة
      if (next.started || stateRef.current.started) setState(next);
    },
    [setState]
  );

  // ---- سحب أولي ثم استطلاع دوري ----
  const pull = useCallback(async () => {
    if (!secretRef.current || busyRef.current) return;
    // تعديل محلي لم يُرسل بعد؟ لا نكتب فوقه
    if (core(stateRef.current) !== lastCoreRef.current && lastCoreRef.current !== "") return;
    const r = await callKonkan(secretRef.current);
    if (!r.ok || !r.state) {
      setSync("error");
      return;
    }
    setSync("ok");
    if (lastCoreRef.current === "" || (r.state.version ?? 0) !== versionRef.current) adopt(r.state);

    // الأسماء المحفوظة
    const server: string[] | null = Array.isArray(r.body?.saved_names)
      ? r.body.saved_names.filter((x: unknown) => typeof x === "string")
      : null;
    if (server) {
      const serverJson = JSON.stringify(server);
      const local = namesRef.current;
      if (lastNamesRef.current === "") {
        // أول اتصال: ندمج المحلي مع السيرفر (اتحاد)
        const seen = new Set(server.map((n) => n.trim().toLowerCase()));
        const merged = [...server, ...local.filter((n) => !seen.has(n.trim().toLowerCase()))];
        lastNamesRef.current = serverJson;
        if (JSON.stringify(merged) !== JSON.stringify(local)) setSavedPlayers(merged);
        // إن كان المدموج يختلف عن السيرفر فسيدفعه تأثير الدفع أدناه
      } else if (serverJson !== lastNamesRef.current && JSON.stringify(local) === lastNamesRef.current) {
        // السيرفر تغيّر (مثلًا من المساعد) ولا تعديل محلي معلّق
        lastNamesRef.current = serverJson;
        setSavedPlayers(server);
      }
    }
  }, [adopt, setSavedPlayers]);

  useEffect(() => {
    if (!hydrated || !secretLoaded || !secret) {
      setSync("off");
      return;
    }
    setSync("syncing");
    pull();
    const id = setInterval(pull, 4000);
    return () => clearInterval(id);
  }, [hydrated, secretLoaded, secret, pull]);

  // ---- دفع التعديلات المحلية للسيرفر ----
  useEffect(() => {
    if (!hydrated || !secret) return;
    if (lastCoreRef.current === "") return; // لم نسحب من السيرفر بعد
    if (core(state) === lastCoreRef.current) return;
    const t = setTimeout(async () => {
      const cur = stateRef.current;
      if (core(cur) === lastCoreRef.current) return;
      busyRef.current = true;
      try {
        if (cur.started) {
          const r = await callKonkan(secretRef.current, {
            action: "set",
            baseVersion: versionRef.current,
            state: {
              players: cur.players,
              rounds: cur.rounds,
              threshold: cur.threshold,
              started: cur.started,
            },
          });
          if (r.ok && r.state) {
            versionRef.current = r.state.version ?? versionRef.current;
            serverStartedRef.current = true;
            lastCoreRef.current = core(cur);
            setSync("ok");
          } else if (r.status === 409) {
            const g = await callKonkan(secretRef.current);
            if (g.ok && g.state) {
              lastCoreRef.current = "";
              adopt(g.state);
            }
          } else {
            setSync("error");
          }
        } else if (serverStartedRef.current) {
          const r = await callKonkan(secretRef.current, { action: "reset" });
          if (r.ok) {
            serverStartedRef.current = false;
            versionRef.current = r.state?.version ?? versionRef.current;
            lastCoreRef.current = core(cur);
            setSync("ok");
          } else setSync("error");
        } else {
          // لعبة محلية قيد الإعداد: لا شيء يُرسل
          lastCoreRef.current = core(cur);
        }
      } finally {
        busyRef.current = false;
      }
    }, 700);
    return () => clearTimeout(t);
  }, [state, hydrated, secret, adopt]);

  // ---- دفع الأسماء المحفوظة للسيرفر ----
  useEffect(() => {
    if (!hydrated || !secret) return;
    if (lastNamesRef.current === "") return; // لم نسحب بعد
    if (JSON.stringify(savedPlayers) === lastNamesRef.current) return;
    const t = setTimeout(async () => {
      const cur = namesRef.current;
      if (JSON.stringify(cur) === lastNamesRef.current) return;
      const r = await callKonkan(secretRef.current, { action: "names", names: cur });
      if (r.ok && Array.isArray(r.body?.saved_names)) {
        const saved: string[] = r.body.saved_names;
        lastNamesRef.current = JSON.stringify(saved);
        if (JSON.stringify(saved) !== JSON.stringify(namesRef.current)) setSavedPlayers(saved);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [savedPlayers, hydrated, secret, setSavedPlayers]);

  // ---- الصوت ----
  const canVoice = Platform.OS === "web" && voiceSupported();

  const stopVoice = useCallback(() => {
    voiceRef.current?.stop();
    voiceRef.current = null;
  }, []);

  const startVoice = useCallback(async () => {
    if (!secretRef.current || voiceRef.current) return;
    setVoiceNote("");
    try {
      voiceRef.current = await startKonkanVoice({
        secret: secretRef.current,
        onStatus: (s, msg) => {
          setVoice(s);
          if (s === "error") setVoiceNote(msg || "خطأ");
          if (s === "closed" || s === "error") voiceRef.current = null;
        },
        onAssistantText: (t) => setVoiceNote(t),
        onState: (st) => adopt(st),
      });
    } catch {
      voiceRef.current = null;
    }
  }, [adopt]);

  const toggleVoice = useCallback(() => {
    if (voiceRef.current) stopVoice();
    else startVoice();
  }, [startVoice, stopVoice]);

  useEffect(() => () => stopVoice(), [stopVoice]);

  return {
    secret,
    hasSecret: !!secret,
    setSecret,
    sync,
    canVoice,
    voice,
    voiceNote,
    toggleVoice,
  };
}

export type KonkanAssistant = ReturnType<typeof useKonkanAssistant>;
