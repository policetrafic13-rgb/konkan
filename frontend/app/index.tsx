import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";

// ---------------- Theme ----------------
type ThemeMode = "dark" | "light";
const PALETTES = {
  dark: {
    bg: "#07100D",
    surface: "#131D18",
    surface2: "#1A2822",
    primary: "#D4AF37",
    primarySoft: "rgba(212,175,55,0.14)",
    danger: "#E63946",
    dangerSoft: "rgba(230,57,70,0.14)",
    text: "#E8ECEA",
    subtext: "#9AA5A0",
    border: "#22332B",
  },
  light: {
    bg: "#F7F9F8",
    surface: "#FFFFFF",
    surface2: "#EEF2F0",
    primary: "#1C4E40",
    primarySoft: "rgba(28,78,64,0.10)",
    danger: "#D62828",
    dangerSoft: "rgba(214,40,40,0.10)",
    text: "#1A1D1C",
    subtext: "#5A6560",
    border: "#DBE3DF",
  },
};

// ---------------- Types & Storage ----------------
type Player = { id: string; name: string };
type Round = { id: string; scores: Record<string, number> };
type GameState = {
  players: Player[];
  rounds: Round[];
  threshold: 700 | 1000;
  started: boolean;
};
const STORAGE_KEY = "konkan_state_v1";
const THEME_KEY = "konkan_theme_v1";
const SAVED_PLAYERS_KEY = "konkan_saved_players_v1";

const QUICK_SCORES = [-30, -60, 25, 100, 125, 200];

// Arabic-Indic digits helper (optional). Keep Latin so negatives render clearly.
const fmt = (n: number) => `${n}`;

// ---------------- Component ----------------
export default function Index() {
  const system = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    system === "light" ? "light" : "dark"
  );
  const C = PALETTES[themeMode];

  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<GameState>({
    players: [
      { id: p(), name: "" },
      { id: p(), name: "" },
      { id: p(), name: "" },
      { id: p(), name: "" },
    ],
    rounds: [],
    threshold: 700,
    started: false,
  });

  // Modal for score entry
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryPlayer, setEntryPlayer] = useState<string | null>(null);
  const [entryValue, setEntryValue] = useState<string>("");
  const [roundDraft, setRoundDraft] = useState<Record<string, number>>({});

  // Confirm modal for reset
  const [confirmReset, setConfirmReset] = useState(false);

  // Saved players directory (permanent)
  const [savedPlayers, setSavedPlayers] = useState<string[]>([]);
  const [newSavedName, setNewSavedName] = useState("");

  // Load state
  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(STORAGE_KEY, "");
      const th = await storage.getItem<string>(THEME_KEY, "");
      const sp = await storage.getItem<string>(SAVED_PLAYERS_KEY, "");
      if (th === "light" || th === "dark") setThemeMode(th);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed.players)) setState(parsed);
        } catch {}
      }
      if (sp) {
        try {
          const parsed = JSON.parse(sp);
          if (Array.isArray(parsed)) setSavedPlayers(parsed.filter((x) => typeof x === "string"));
        } catch {}
      }
      setHydrated(true);
    })();
  }, []);

  // Persist state
  useEffect(() => {
    if (!hydrated) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    storage.setItem(THEME_KEY, themeMode);
  }, [themeMode, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    storage.setItem(SAVED_PLAYERS_KEY, JSON.stringify(savedPlayers));
  }, [savedPlayers, hydrated]);

  // Totals
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    state.players.forEach((pl) => (t[pl.id] = 0));
    state.rounds.forEach((r) => {
      Object.entries(r.scores).forEach(([pid, v]) => {
        t[pid] = (t[pid] || 0) + v;
      });
    });
    return t;
  }, [state.players, state.rounds]);

  const gameOver = useMemo(() => {
    return Object.values(totals).some((v) => v >= state.threshold);
  }, [totals, state.threshold]);

  const leaderId = useMemo(() => {
    if (state.players.length === 0) return null;
    return state.players.reduce((min, pl) =>
      (totals[pl.id] ?? 0) < (totals[min.id] ?? 0) ? pl : min
    , state.players[0]).id;
  }, [state.players, totals]);

  const loserId = useMemo(() => {
    if (state.players.length === 0) return null;
    return state.players.reduce((max, pl) =>
      (totals[pl.id] ?? 0) > (totals[max.id] ?? 0) ? pl : max
    , state.players[0]).id;
  }, [state.players, totals]);

  // ---------------- Actions ----------------
  const toggleTheme = () => {
    haptic();
    setThemeMode((m) => (m === "dark" ? "light" : "dark"));
  };

  const addPlayer = () => {
    if (state.players.length >= 8) return;
    haptic();
    setState((s) => ({ ...s, players: [...s.players, { id: p(), name: "" }] }));
  };

  const removePlayer = (id: string) => {
    if (state.players.length <= 4) return;
    haptic();
    setState((s) => ({ ...s, players: s.players.filter((x) => x.id !== id) }));
  };

  const setPlayerName = (id: string, name: string) => {
    setState((s) => ({
      ...s,
      players: s.players.map((x) => (x.id === id ? { ...x, name } : x)),
    }));
  };

  const setThreshold = (t: 700 | 1000) => {
    haptic();
    setState((s) => ({ ...s, threshold: t }));
  };

  const startGame = () => {
    const valid = state.players.every((pl) => pl.name.trim().length > 0);
    if (!valid) return;
    haptic();
    setState((s) => ({ ...s, started: true, rounds: [] }));
  };

  const resetGame = () => {
    haptic();
    setConfirmReset(false);
    setState({
      players: [
        { id: p(), name: "" },
        { id: p(), name: "" },
        { id: p(), name: "" },
        { id: p(), name: "" },
      ],
      rounds: [],
      threshold: state.threshold,
      started: false,
    });
  };

  const undoLastRound = () => {
    if (state.rounds.length === 0) return;
    haptic();
    setState((s) => ({ ...s, rounds: s.rounds.slice(0, -1) }));
  };

  // ---- Saved Players Directory ----
  const addSavedPlayer = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    const exists = savedPlayers.some((n) => n.toLowerCase() === name.toLowerCase());
    if (exists) {
      setNewSavedName("");
      return;
    }
    haptic();
    setSavedPlayers((s) => [...s, name]);
    setNewSavedName("");
  };

  const removeSavedPlayer = (name: string) => {
    haptic();
    setSavedPlayers((s) => s.filter((n) => n !== name));
  };

  const togglePlayerInGame = (name: string) => {
    haptic();
    const idx = state.players.findIndex(
      (pl) => pl.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (idx !== -1) {
      // Remove from game
      setState((s) => {
        if (s.players.length > 4) {
          return { ...s, players: s.players.filter((_, i) => i !== idx) };
        }
        // Cannot remove below 4 — clear the slot instead
        return {
          ...s,
          players: s.players.map((pl, i) => (i === idx ? { ...pl, name: "" } : pl)),
        };
      });
      return;
    }
    // Add to game: fill first empty slot; else append if < 8
    setState((s) => {
      const emptyIdx = s.players.findIndex((pl) => pl.name.trim() === "");
      if (emptyIdx !== -1) {
        return {
          ...s,
          players: s.players.map((pl, i) => (i === emptyIdx ? { ...pl, name } : pl)),
        };
      }
      if (s.players.length < 8) {
        return { ...s, players: [...s.players, { id: p(), name }] };
      }
      return s;
    });
  };

  const advanceToNextPlayer = (currentId: string) => {
    const idx = state.players.findIndex((pl) => pl.id === currentId);
    const next = state.players[idx + 1];
    if (next) {
      setEntryPlayer(next.id);
      setEntryValue(String(roundDraft[next.id] ?? ""));
    } else {
      setEntryOpen(false);
      setEntryPlayer(null);
      setEntryValue("");
    }
  };

  const openEntry = (pid: string) => {
    haptic();
    setEntryPlayer(pid);
    setEntryValue(String(roundDraft[pid] ?? ""));
    setEntryOpen(true);
  };

  const applyEntry = (val: number) => {
    if (!entryPlayer) return;
    haptic();
    const current = entryPlayer;
    setRoundDraft((d) => ({ ...d, [current]: val }));
    advanceToNextPlayer(current);
  };

  const saveEntry = () => {
    if (!entryPlayer) return;
    const n = parseInt(entryValue, 10);
    const current = entryPlayer;
    setRoundDraft((d) => ({
      ...d,
      [current]: isNaN(n) ? 0 : n,
    }));
    haptic();
    advanceToNextPlayer(current);
  };

  const clearEntry = () => {
    if (!entryPlayer) return;
    setRoundDraft((d) => {
      const nd = { ...d };
      delete nd[entryPlayer];
      return nd;
    });
    setEntryValue("");
  };

  const submitRound = () => {
    const anyEntered = Object.keys(roundDraft).length > 0;
    if (!anyEntered) return;
    haptic();
    // Fill missing players with 0
    const full: Record<string, number> = {};
    state.players.forEach((pl) => {
      full[pl.id] = roundDraft[pl.id] ?? 0;
    });
    setState((s) => ({
      ...s,
      rounds: [...s.rounds, { id: p(), scores: full }],
    }));
    setRoundDraft({});
  };

  // ---------------- Render ----------------
  const styles = getStyles(C);

  if (!hydrated) {
    return (
      <SafeAreaView style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={toggleTheme}
          style={styles.themeBtn}
          testID="theme-toggle-button"
        >
          <Ionicons
            name={themeMode === "dark" ? "sunny" : "moon"}
            size={20}
            color={C.primary}
          />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.title}>حاسبة الكونكان السعودية</Text>
          <Text style={styles.subtitle}>
            {state.started ? `الحد: ${state.threshold} نقطة` : "لعبة الورق الملكية"}
          </Text>
        </View>
      </View>

      {!state.started ? (
        <SetupScreen
          C={C}
          state={state}
          onAdd={addPlayer}
          onRemove={removePlayer}
          onSetName={setPlayerName}
          onThreshold={setThreshold}
          onStart={startGame}
          savedPlayers={savedPlayers}
          newSavedName={newSavedName}
          setNewSavedName={setNewSavedName}
          onAddSaved={addSavedPlayer}
          onRemoveSaved={removeSavedPlayer}
          onTogglePlayerInGame={togglePlayerInGame}
        />
      ) : (
        <ScoreboardScreen
          C={C}
          state={state}
          totals={totals}
          leaderId={leaderId}
          loserId={loserId}
          gameOver={gameOver}
          roundDraft={roundDraft}
          onOpenEntry={openEntry}
          onSubmit={submitRound}
          onUndo={undoLastRound}
          onReset={() => setConfirmReset(true)}
        />
      )}

      {/* Score Entry Modal */}
      <Modal visible={entryOpen} transparent animationType="slide" onRequestClose={() => setEntryOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEntryOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {entryPlayer
                ? `إدخال نقاط: ${state.players.find((x) => x.id === entryPlayer)?.name}`
                : "إدخال نقاط"}
            </Text>
            {entryPlayer && (() => {
              const idx = state.players.findIndex((x) => x.id === entryPlayer);
              return (
                <Text style={[styles.label, { marginTop: -8, marginBottom: 12 }]}>
                  {`لاعب ${idx + 1} من ${state.players.length} — سيتم الانتقال تلقائياً`}
                </Text>
              );
            })()}

            <View style={styles.chipGrid}>
              {QUICK_SCORES.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.chip,
                    v < 0 ? styles.chipNeg : styles.chipPos,
                  ]}
                  onPress={() => applyEntry(v)}
                  testID={`quick-score-${v}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      v < 0 ? { color: C.primary } : { color: C.text },
                    ]}
                  >
                    {fmt(v)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>نقاط مخصصة</Text>
            <TextInput
              value={entryValue}
              onChangeText={setEntryValue}
              keyboardType="numeric"
              placeholder="مثال: 75 أو -15"
              placeholderTextColor={C.subtext}
              style={styles.input}
              testID="custom-score-input"
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={clearEntry}
                testID="clear-entry-button"
              >
                <Text style={[styles.btnText, { color: C.subtext }]}>مسح</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={saveEntry}
                testID="save-entry-button"
              >
                <Text style={[styles.btnText, { color: themeMode === "dark" ? "#0B120F" : "#FFFFFF" }]}>
                  حفظ
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confirm Reset */}
      <Modal visible={confirmReset} transparent animationType="fade" onRequestClose={() => setConfirmReset(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmBox}>
            <Text style={styles.sheetTitle}>إعادة اللعبة</Text>
            <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 16 }]}>
              هل تريد فعلاً بدء لعبة جديدة؟ سيتم حذف كل السجل.
            </Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setConfirmReset(false)}
                testID="cancel-reset-button"
              >
                <Text style={[styles.btnText, { color: C.subtext }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: C.danger }]}
                onPress={resetGame}
                testID="confirm-reset-button"
              >
                <Text style={[styles.btnText, { color: "#fff" }]}>إعادة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Game Over Overlay */}
      {gameOver && state.started && (
        <View style={[styles.gameOverBadge, { pointerEvents: "none" }]}>
          <View style={styles.gameOverInner}>
            <Ionicons name="trophy" size={22} color={C.primary} />
            <Text style={styles.gameOverText}>
              {`انتهت اللعبة! الفائز: ${state.players.find((pl) => pl.id === leaderId)?.name ?? ""}`}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ---------------- Setup Screen ----------------
function SetupScreen({
  C,
  state,
  onAdd,
  onRemove,
  onSetName,
  onThreshold,
  onStart,
  savedPlayers,
  newSavedName,
  setNewSavedName,
  onAddSaved,
  onRemoveSaved,
  onTogglePlayerInGame,
}: {
  C: typeof PALETTES.dark;
  state: GameState;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSetName: (id: string, name: string) => void;
  onThreshold: (t: 700 | 1000) => void;
  onStart: () => void;
  savedPlayers: string[];
  newSavedName: string;
  setNewSavedName: (v: string) => void;
  onAddSaved: (v: string) => void;
  onRemoveSaved: (v: string) => void;
  onTogglePlayerInGame: (name: string) => void;
}) {
  const styles = getStyles(C);
  const canStart =
    state.players.length >= 4 &&
    state.players.length <= 8 &&
    state.players.every((pl) => pl.name.trim().length > 0);

  const isSelected = (name: string) =>
    state.players.some(
      (pl) => pl.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الحد الأقصى للنقاط</Text>
          <View style={styles.segment}>
            {[700, 1000].map((v) => {
              const active = state.threshold === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.segmentItem,
                    active && { backgroundColor: C.primary },
                  ]}
                  onPress={() => onThreshold(v as 700 | 1000)}
                  testID={`threshold-${v}`}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? (C.bg === "#07100D" ? "#0B120F" : "#FFFFFF") : C.text },
                    ]}
                  >
                    {v} نقطة
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.sectionTitle}>الأصدقاء المحفوظون ({savedPlayers.length})</Text>
            {savedPlayers.length > 0 && (
              <Text style={styles.hint}>اضغط لإضافة/إزالة من اللعبة</Text>
            )}
          </View>

          {savedPlayers.length === 0 ? (
            <Text style={[styles.hint, { marginTop: 4 }]}>
              أضف أسماء أصدقائك الدائمين هنا لتختارهم بضغطة زر في كل لعبة.
            </Text>
          ) : (
            <View style={styles.savedGrid}>
              {savedPlayers.map((name) => {
                const selected = isSelected(name);
                return (
                  <View key={name} style={styles.savedPillWrap}>
                    <TouchableOpacity
                      onPress={() => onTogglePlayerInGame(name)}
                      style={[
                        styles.savedPill,
                        selected && {
                          backgroundColor: C.primary,
                          borderColor: C.primary,
                        },
                      ]}
                      testID={`saved-player-pill-${name}`}
                    >
                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={C.bg === "#07100D" ? "#0B120F" : "#FFFFFF"}
                        />
                      )}
                      <Text
                        style={[
                          styles.savedPillText,
                          {
                            color: selected
                              ? C.bg === "#07100D"
                                ? "#0B120F"
                                : "#FFFFFF"
                              : C.text,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onRemoveSaved(name)}
                      style={styles.savedPillDelete}
                      testID={`saved-player-delete-${name}`}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="close-circle" size={18} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.savedAddRow}>
            <TextInput
              value={newSavedName}
              onChangeText={setNewSavedName}
              onSubmitEditing={() => onAddSaved(newSavedName)}
              placeholder="أضف اسم صديق دائم"
              placeholderTextColor={C.subtext}
              style={[styles.playerInput, { flex: 1 }]}
              returnKeyType="done"
              testID="saved-player-name-input"
            />
            <TouchableOpacity
              onPress={() => onAddSaved(newSavedName)}
              disabled={newSavedName.trim().length === 0}
              style={[
                styles.addBtn,
                newSavedName.trim().length === 0 && { opacity: 0.4 },
              ]}
              testID="saved-player-add-button"
            >
              <Ionicons name="bookmark" size={16} color={C.primary} />
              <Text style={[styles.addBtnText, { color: C.primary }]}>حفظ</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.sectionTitle}>اللاعبون ({state.players.length}/8)</Text>
            <TouchableOpacity
              onPress={onAdd}
              disabled={state.players.length >= 8}
              style={[
                styles.addBtn,
                state.players.length >= 8 && { opacity: 0.4 },
              ]}
              testID="add-player-button"
            >
              <Ionicons name="add" size={18} color={C.primary} />
              <Text style={[styles.addBtnText, { color: C.primary }]}>إضافة</Text>
            </TouchableOpacity>
          </View>

          {state.players.map((pl, idx) => (
            <View key={pl.id} style={styles.playerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{idx + 1}</Text>
              </View>
              <TextInput
                value={pl.name}
                onChangeText={(t) => onSetName(pl.id, t)}
                placeholder={`اسم اللاعب ${idx + 1}`}
                placeholderTextColor={C.subtext}
                style={styles.playerInput}
                testID={`player-name-input-${idx}`}
              />
              <TouchableOpacity
                onPress={() => onRemove(pl.id)}
                disabled={state.players.length <= 4}
                style={[
                  styles.removeBtn,
                  state.players.length <= 4 && { opacity: 0.3 },
                ]}
                testID={`remove-player-${idx}`}
              >
                <Ionicons name="close" size={18} color={C.danger} />
              </TouchableOpacity>
            </View>
          ))}

          <Text style={[styles.hint, { marginTop: 8 }]}>الحد الأدنى 4 لاعبين والحد الأقصى 8.</Text>
        </View>

        <TouchableOpacity
          onPress={onStart}
          disabled={!canStart}
          style={[
            styles.startBtn,
            { backgroundColor: canStart ? C.primary : C.surface2 },
          ]}
          testID="start-game-button"
        >
          <Ionicons name="play" size={20} color={canStart ? (C.bg === "#07100D" ? "#0B120F" : "#FFFFFF") : C.subtext} />
          <Text style={[styles.startBtnText, { color: canStart ? (C.bg === "#07100D" ? "#0B120F" : "#FFFFFF") : C.subtext }]}>
            ابدأ اللعبة
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------- Scoreboard Screen ----------------
function ScoreboardScreen({
  C,
  state,
  totals,
  leaderId,
  loserId,
  gameOver,
  roundDraft,
  onOpenEntry,
  onSubmit,
  onUndo,
  onReset,
}: {
  C: typeof PALETTES.dark;
  state: GameState;
  totals: Record<string, number>;
  leaderId: string | null;
  loserId: string | null;
  gameOver: boolean;
  roundDraft: Record<string, number>;
  onOpenEntry: (pid: string) => void;
  onSubmit: () => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const styles = getStyles(C);
  const hasDraft = Object.keys(roundDraft).length > 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 220 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Player Totals Grid */}
        <Text style={styles.sectionTitle}>النتائج الحالية</Text>
        <View style={styles.playersGrid}>
          {state.players.map((pl) => {
            const isLeader = pl.id === leaderId && state.rounds.length > 0;
            const isLoser = pl.id === loserId && state.rounds.length > 0 && leaderId !== loserId;
            const total = totals[pl.id] ?? 0;
            const draft = roundDraft[pl.id];
            const hasDraftVal = draft !== undefined;
            return (
              <TouchableOpacity
                key={pl.id}
                onPress={() => onOpenEntry(pl.id)}
                style={[
                  styles.playerCard,
                  isLeader && { borderColor: C.primary, backgroundColor: C.primarySoft },
                  isLoser && { borderColor: C.danger, backgroundColor: C.dangerSoft },
                ]}
                testID={`player-card-${pl.id}`}
              >
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={styles.playerName} numberOfLines={1}>{pl.name}</Text>
                  {isLeader && <Ionicons name="trophy" size={14} color={C.primary} />}
                  {isLoser && <Ionicons name="warning" size={14} color={C.danger} />}
                </View>
                <Text style={[
                  styles.playerTotal,
                  isLeader && { color: C.primary },
                  isLoser && { color: C.danger },
                ]}>{fmt(total)}</Text>
                {hasDraftVal ? (
                  <View style={styles.draftPill}>
                    <Text style={[styles.draftText, { color: draft < 0 ? C.primary : C.text }]}>
                      {`جولة: ${fmt(draft)}`}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.tapHint}>اضغط لإدخال النقاط</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Round History */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
          سجل الجولات ({state.rounds.length})
        </Text>
        {state.rounds.length === 0 ? (
          <View style={[styles.card, { alignItems: "center" }]}>
            <Ionicons name="time-outline" size={28} color={C.subtext} />
            <Text style={[styles.hint, { marginTop: 8 }]}>لا توجد جولات مسجلة بعد.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {state.rounds.slice().reverse().map((r, idx) => {
              const roundNum = state.rounds.length - idx;
              return (
                <View key={r.id} style={styles.historyRow}>
                  <Text style={styles.historyBadge}>{`ج${roundNum}`}</Text>
                  <View style={{ flex: 1 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {state.players.map((pl) => (
                        <View key={pl.id} style={styles.historyChip}>
                          <Text style={styles.historyChipName} numberOfLines={1}>{pl.name}</Text>
                          <Text style={[
                            styles.historyChipScore,
                            { color: (r.scores[pl.id] ?? 0) < 0 ? C.primary : C.text },
                          ]}>
                            {fmt(r.scores[pl.id] ?? 0)}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Sticky Actions */}
      <View style={styles.stickyBar}>
        <TouchableOpacity
          onPress={onSubmit}
          disabled={!hasDraft || gameOver}
          style={[
            styles.submitBtn,
            { backgroundColor: hasDraft && !gameOver ? C.primary : C.surface2 },
          ]}
          testID="submit-round-button"
        >
          <Ionicons name="checkmark-circle" size={20} color={hasDraft && !gameOver ? (C.bg === "#07100D" ? "#0B120F" : "#FFFFFF") : C.subtext} />
          <Text style={[
            styles.submitBtnText,
            { color: hasDraft && !gameOver ? (C.bg === "#07100D" ? "#0B120F" : "#FFFFFF") : C.subtext },
          ]}>
            حفظ الجولة
          </Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row-reverse", gap: 10 }}>
          <TouchableOpacity
            onPress={onUndo}
            disabled={state.rounds.length === 0}
            style={[
              styles.smallBtn,
              { borderColor: C.border, opacity: state.rounds.length === 0 ? 0.4 : 1 },
            ]}
            testID="undo-round-button"
          >
            <Ionicons name="arrow-undo" size={16} color={C.text} />
            <Text style={[styles.smallBtnText, { color: C.text }]}>تراجع</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onReset}
            style={[styles.smallBtn, { borderColor: C.danger }]}
            testID="reset-game-button"
          >
            <Ionicons name="refresh" size={16} color={C.danger} />
            <Text style={[styles.smallBtnText, { color: C.danger }]}>إعادة اللعبة</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ---------------- helpers ----------------
function p() {
  return Math.random().toString(36).slice(2, 10);
}
function haptic() {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

// ---------------- Styles ----------------
function getStyles(C: typeof PALETTES.dark) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    themeBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: C.surface, alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: C.border,
    },
    title: {
      fontSize: 20, fontWeight: "800", color: C.text,
      textAlign: "right", writingDirection: "rtl",
    },
    subtitle: {
      fontSize: 12, color: C.subtext, marginTop: 2,
      textAlign: "right", writingDirection: "rtl",
    },
    card: {
      backgroundColor: C.surface, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: C.border,
    },
    sectionTitle: {
      fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 12,
      textAlign: "right", writingDirection: "rtl",
    },
    segment: {
      flexDirection: "row-reverse", backgroundColor: C.surface2,
      borderRadius: 12, padding: 4, gap: 4,
    },
    segmentItem: {
      flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center",
    },
    segmentText: { fontSize: 15, fontWeight: "700" },
    addBtn: {
      flexDirection: "row-reverse", alignItems: "center", gap: 4,
      paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: C.primarySoft, borderRadius: 20,
    },
    addBtnText: { fontSize: 13, fontWeight: "700" },
    playerRow: {
      flexDirection: "row-reverse", alignItems: "center", gap: 10,
      marginTop: 12,
    },
    avatar: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: C.primarySoft,
      alignItems: "center", justifyContent: "center",
    },
    avatarText: { color: C.primary, fontWeight: "800", fontSize: 14 },
    playerInput: {
      flex: 1, backgroundColor: C.surface2, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 14 : 10,
      color: C.text, fontSize: 15, textAlign: "right", writingDirection: "rtl",
      borderWidth: 1, borderColor: C.border,
    },
    removeBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: C.dangerSoft, alignItems: "center", justifyContent: "center",
    },
    hint: {
      fontSize: 12, color: C.subtext, textAlign: "right", writingDirection: "rtl",
    },
    savedGrid: {
      flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 4,
    },
    savedPillWrap: {
      flexDirection: "row-reverse", alignItems: "center",
    },
    savedPill: {
      flexDirection: "row-reverse", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: C.surface2, borderRadius: 20,
      borderWidth: 1, borderColor: C.border, maxWidth: 160,
    },
    savedPillText: { fontSize: 13, fontWeight: "700" },
    savedPillDelete: {
      marginStart: -6, marginEnd: 2,
      width: 22, height: 22, alignItems: "center", justifyContent: "center",
    },
    savedAddRow: {
      flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 12,
    },
    startBtn: {
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
      gap: 8, marginTop: 20, paddingVertical: 16, borderRadius: 14,
    },
    startBtnText: { fontSize: 16, fontWeight: "800" },

    playersGrid: {
      flexDirection: "row-reverse", flexWrap: "wrap", gap: 10,
    },
    playerCard: {
      width: "48%", backgroundColor: C.surface, borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: C.border, minHeight: 100,
    },
    playerName: { color: C.text, fontSize: 14, fontWeight: "700", flex: 1, textAlign: "right" },
    playerTotal: {
      color: C.text, fontSize: 28, fontWeight: "900", marginTop: 6,
      textAlign: "right",
    },
    draftPill: {
      marginTop: 6, alignSelf: "flex-start",
      backgroundColor: C.primarySoft, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    draftText: { fontSize: 12, fontWeight: "700" },
    tapHint: {
      fontSize: 11, color: C.subtext, marginTop: 6, textAlign: "right",
    },
    historyRow: {
      flexDirection: "row-reverse", alignItems: "center", gap: 10,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    historyBadge: {
      backgroundColor: C.primarySoft, color: C.primary,
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
      fontSize: 12, fontWeight: "800", overflow: "hidden",
    },
    historyChip: {
      backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 10,
      paddingVertical: 6, minWidth: 80, alignItems: "center",
    },
    historyChipName: { color: C.subtext, fontSize: 11 },
    historyChipScore: { fontSize: 14, fontWeight: "800", marginTop: 2 },

    stickyBar: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border,
      padding: 12, gap: 10,
    },
    submitBtn: {
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 14, borderRadius: 12,
    },
    submitBtnText: { fontSize: 15, fontWeight: "800" },
    smallBtn: {
      flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
      gap: 6, paddingVertical: 10, borderRadius: 10,
      borderWidth: 1, backgroundColor: C.surface,
    },
    smallBtnText: { fontSize: 13, fontWeight: "700" },

    modalBackdrop: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 20, paddingBottom: 30,
    },
    sheetHandle: {
      width: 40, height: 4, borderRadius: 2, backgroundColor: C.border,
      alignSelf: "center", marginBottom: 12,
    },
    sheetTitle: {
      fontSize: 17, fontWeight: "800", color: C.text, marginBottom: 16,
      textAlign: "right", writingDirection: "rtl",
    },
    chipGrid: {
      flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginBottom: 16,
    },
    chip: {
      width: "31%", paddingVertical: 16, borderRadius: 12, alignItems: "center",
      borderWidth: 1,
    },
    chipPos: { backgroundColor: C.surface2, borderColor: C.border },
    chipNeg: { backgroundColor: C.primarySoft, borderColor: C.primary },
    chipText: { fontSize: 17, fontWeight: "800" },
    label: {
      fontSize: 13, color: C.subtext, marginBottom: 8,
      textAlign: "right", writingDirection: "rtl",
    },
    input: {
      backgroundColor: C.surface2, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 14 : 12,
      color: C.text, fontSize: 16, textAlign: "right",
      borderWidth: 1, borderColor: C.border,
    },
    sheetActions: {
      flexDirection: "row-reverse", gap: 10, marginTop: 16,
    },
    btn: {
      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center",
    },
    btnPrimary: { backgroundColor: C.primary },
    btnGhost: { backgroundColor: C.surface2 },
    btnText: { fontSize: 15, fontWeight: "800" },

    confirmBox: {
      margin: 20, backgroundColor: C.surface, borderRadius: 20, padding: 24,
      alignSelf: "center", width: "88%",
    },

    gameOverBadge: {
      position: "absolute", top: 80, left: 20, right: 20, alignItems: "center",
    },
    gameOverInner: {
      flexDirection: "row-reverse", alignItems: "center", gap: 8,
      backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10,
      borderRadius: 20,
    },
    gameOverText: {
      color: C.bg === "#07100D" ? "#0B120F" : "#FFFFFF",
      fontWeight: "800", fontSize: 13,
    },
  });
}
