import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { KonkanAssistant } from "@/src/hooks/useKonkanAssistant";

type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  primary: string;
  primarySoft: string;
  danger: string;
  text: string;
  subtext: string;
  border: string;
};

// أزرار الترويسة: المايك (ويب فقط) + إعدادات الاتصال
export function AssistantHeaderButtons({
  C,
  a,
  onOpenSettings,
}: {
  C: Palette;
  a: KonkanAssistant;
  onOpenSettings: () => void;
}) {
  const live = a.voice === "live";
  const connecting = a.voice === "connecting";
  const syncColor = a.sync === "ok" ? C.primary : a.sync === "error" ? C.danger : C.subtext;
  const btn = {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: C.border,
  };
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <TouchableOpacity onPress={onOpenSettings} style={btn} testID="assistant-settings-button">
        <Ionicons
          name={a.hasSecret ? "cloud-done-outline" : "cloud-offline-outline"}
          size={20}
          color={a.hasSecret ? syncColor : C.subtext}
        />
      </TouchableOpacity>
      {a.canVoice && a.hasSecret && (
        <TouchableOpacity
          onPress={a.toggleVoice}
          style={[btn, live && { backgroundColor: C.danger, borderColor: C.danger }]}
          testID="assistant-voice-button"
        >
          <Ionicons
            name={live ? "stop" : connecting ? "ellipsis-horizontal" : "mic"}
            size={20}
            color={live ? "#fff" : C.primary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

// شريط حالة الصوت تحت الترويسة
export function AssistantBanner({ C, a }: { C: Palette; a: KonkanAssistant }) {
  if (a.voice === "idle" || a.voice === "closed") return null;
  const text =
    a.voice === "connecting"
      ? "جارٍ الاتصال بالمساعد…"
      : a.voice === "error"
      ? `تعذّر تشغيل الصوت: ${a.voiceNote || ""}`
      : a.voiceNote || "المساعد يسمعك… قل مثلاً: ابدأ لعبة مع أحمد وخالد وسعد وفهد";
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: a.voice === "error" ? C.danger + "22" : C.primarySoft,
        borderWidth: 1,
        borderColor: a.voice === "error" ? C.danger : C.primary,
      }}
    >
      <Text style={{ color: C.text, textAlign: "right", writingDirection: "rtl", fontSize: 13 }}>{text}</Text>
    </View>
  );
}

// نافذة إدخال مفتاح الاتصال
export function AssistantSettingsModal({
  C,
  a,
  visible,
  onClose,
}: {
  C: Palette;
  a: KonkanAssistant;
  visible: boolean;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (visible) setValue("");
  }, [visible]);

  const statusText = !a.hasSecret
    ? "غير متصل"
    : a.sync === "ok"
    ? "متصل ومتزامن"
    : a.sync === "syncing"
    ? "جارٍ الاتصال…"
    : "تعذّر الاتصال (تحقق من المفتاح أو الإنترنت)";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 }}>
        <View
          style={{
            backgroundColor: C.surface,
            borderRadius: 18,
            padding: 18,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={{ color: C.text, fontSize: 18, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }}>
              المساعد الصوتي
            </Text>
            <Text style={{ color: C.subtext, fontSize: 13, marginTop: 6, textAlign: "right", writingDirection: "rtl" }}>
              {`الحالة: ${statusText}`}
            </Text>
            <Text style={{ color: C.subtext, fontSize: 12, marginTop: 10, textAlign: "right", writingDirection: "rtl" }}>
              أدخل مفتاح الكونكان لربط الحاسبة بالمساعد. يُحفظ في هذا الجهاز فقط.
            </Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={a.hasSecret ? "مفتاح جديد (اتركه فارغًا للإبقاء)" : "المفتاح"}
              placeholderTextColor={C.subtext}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 12,
                padding: 12,
                color: C.text,
                backgroundColor: C.surface2,
                textAlign: "left",
              }}
              testID="assistant-secret-input"
            />
            <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                onPress={async () => {
                  if (value.trim()) await a.setSecret(value);
                  onClose();
                }}
                style={{ flex: 1, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: C.bg, fontWeight: "800" }}>حفظ</Text>
              </TouchableOpacity>
              {a.hasSecret && (
                <TouchableOpacity
                  onPress={async () => {
                    await a.setSecret("");
                    onClose();
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: C.danger,
                    borderRadius: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: C.danger, fontWeight: "700" }}>فصل</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                style={{
                  borderWidth: 1,
                  borderColor: C.border,
                  borderRadius: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: C.subtext, fontWeight: "700" }}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
