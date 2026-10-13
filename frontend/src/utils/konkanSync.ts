// اتصال الحاسبة بسيرفر الكونكان (حسابات دقيقة + مزامنة مع المساعد الصوتي).
import { storage } from "@/src/utils/storage";

export const API_BASE = "https://musaidi-telegram-bot.vercel.app";
const SECRET_KEY = "konkan_secret_v1";

export type RemotePlayer = { id: string; name: string };
export type RemoteRound = { id: string; scores: Record<string, number> };
export type RemoteState = {
  players: RemotePlayer[];
  rounds: RemoteRound[];
  threshold: 700 | 1000;
  started: boolean;
  version?: number;
  updatedAt?: number;
};

export type KonkanResponse = {
  status: number;
  ok: boolean;
  state?: RemoteState;
  summary?: unknown;
  version?: number;
  error?: string;
  body: any;
};

// ---- المفتاح (يُحفظ في الجهاز فقط) ----
export async function loadSecret(): Promise<string> {
  const v = await storage.getItem<string>(SECRET_KEY, "");
  return typeof v === "string" ? v : "";
}

export async function saveSecret(secret: string): Promise<void> {
  await storage.setItem(SECRET_KEY, secret.trim());
}

// على الويب: الرابط  ...konkan/#k=المفتاح  يحفظ المفتاح ثم يُمسح من الرابط.
export function takeSecretFromUrl(): string | null {
  try {
    if (typeof window === "undefined" || !window.location) return null;
    const m = /[#&]k=([^&]+)/.exec(window.location.hash || "");
    if (!m) return null;
    const secret = decodeURIComponent(m[1]).trim();
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return secret || null;
  } catch {
    return null;
  }
}

// ---- الاستدعاء ----
export async function callKonkan(secret: string, body?: Record<string, unknown>): Promise<KonkanResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}/api/konkan`, {
      method: body ? "POST" : "GET",
      headers: {
        "x-konkan-secret": secret,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {}
    return {
      status: res.status,
      ok: res.ok && !json?.error,
      state: json?.state,
      summary: json?.summary,
      version: json?.version,
      error: json?.error || (res.ok ? undefined : `http_${res.status}`),
      body: json,
    };
  } catch (e: any) {
    return { status: 0, ok: false, error: e?.name === "AbortError" ? "timeout" : "network", body: null };
  } finally {
    clearTimeout(timer);
  }
}
