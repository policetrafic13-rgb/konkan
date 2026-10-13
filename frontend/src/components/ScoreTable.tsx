import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";

type Palette = {
  surface: string;
  surface2: string;
  primary: string;
  danger: string;
  text: string;
  subtext: string;
  border: string;
};

type Props = {
  C: Palette;
  players: { id: string; name: string }[];
  rounds: { id: string; scores: Record<string, number> }[];
  totals: Record<string, number>;
  leaderId: string | null;
  loserId: string | null;
  onEditCell?: (roundId: string, playerId: string) => void;
  onRenamePlayer?: (playerId: string) => void;
};

const COL = 72;
const LABEL = 44;

// جدول الجولات: صف لكل جولة، عمود لكل لاعب، وصف المجموع في الأسفل
export function ScoreTable({ C, players, rounds, totals, leaderId, loserId, onEditCell, onRenamePlayer }: Props) {
  const cell = (extra?: object) => ({
    width: COL,
    paddingVertical: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...extra,
  });
  const showMarks = rounds.length > 0 && leaderId !== loserId;

  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row-reverse" }}>
          {/* عمود أرقام الجولات */}
          <View style={{ width: LABEL, backgroundColor: C.surface2 }}>
            <View style={{ paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ color: C.subtext, fontSize: 11 }}>#</Text>
            </View>
            {rounds.map((r, i) => (
              <View key={r.id} style={{ paddingVertical: 10, alignItems: "center", borderTopWidth: 1, borderTopColor: C.border }}>
                <Text style={{ color: C.subtext, fontSize: 12, fontWeight: "700" }}>{`ج${i + 1}`}</Text>
              </View>
            ))}
            <View style={{ paddingVertical: 12, alignItems: "center", borderTopWidth: 2, borderTopColor: C.primary }}>
              <Text style={{ color: C.text, fontSize: 12, fontWeight: "800" }}>المجموع</Text>
            </View>
          </View>

          {/* أعمدة اللاعبين */}
          {players.map((pl) => {
            const isLeader = showMarks && pl.id === leaderId;
            const isLoser = showMarks && pl.id === loserId;
            const tint = isLeader ? C.primary : isLoser ? C.danger : C.text;
            return (
              <View key={pl.id} style={{ width: COL, borderRightWidth: 1, borderRightColor: C.border }}>
                <TouchableOpacity
                  disabled={!onRenamePlayer}
                  onPress={() => onRenamePlayer?.(pl.id)}
                  style={cell({ backgroundColor: C.surface2 })}
                  testID={`rename-${pl.id}`}
                >
                  <Text numberOfLines={1} style={{ color: tint, fontSize: 12, fontWeight: "800", paddingHorizontal: 4 }}>
                    {pl.name}
                  </Text>
                </TouchableOpacity>
                {rounds.map((r) => {
                  const v = r.scores[pl.id] ?? 0;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      disabled={!onEditCell}
                      onPress={() => onEditCell?.(r.id, pl.id)}
                      style={cell({ borderTopWidth: 1, borderTopColor: C.border })}
                      testID={`cell-${r.id}-${pl.id}`}
                    >
                      <Text style={{ color: v < 0 ? C.primary : C.text, fontSize: 14, fontVariant: ["tabular-nums"] }}>{`${v}`}</Text>
                    </TouchableOpacity>
                  );
                })}
                <View style={cell({ paddingVertical: 12, borderTopWidth: 2, borderTopColor: C.primary })}>
                  <Text style={{ color: tint, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
                    {`${totals[pl.id] ?? 0}`}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
