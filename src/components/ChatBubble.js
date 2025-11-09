import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

export const ChatBubble = ({ sender, text, isSpeaking }) => {
  const isResident = sender === "Resident";
  return (
    <View style={[styles.wrapper, isResident && styles.wrapperResident]}>
      <View
        style={[
          styles.container,
          isResident ? styles.resident : styles.movemate,
        ]}
      >
        <Text style={[styles.sender, isResident && styles.senderResident]}>
          {sender}
        </Text>
        <Text style={[styles.text, isResident && styles.textResident]}>
          {text}
        </Text>
        {!isResident && isSpeaking && (
          <LinearGradient
            colors={["rgba(99,102,241,0)", colors.glow, "rgba(236,72,153,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.glowUnderline}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  wrapperResident: {
    alignItems: "flex-end",
  },
  container: {
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
    maxWidth: "82%",
    position: "relative",
    overflow: "hidden",
  },
  movemate: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(99,102,241,0.08)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.16)",
  },
  resident: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  sender: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 4,
  },
  senderResident: {
    color: "#D0E6FF",
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  textResident: {
    color: "#FFFFFF",
  },
  glowUnderline: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 6,
    height: 4,
    borderRadius: 4,
  },
});

