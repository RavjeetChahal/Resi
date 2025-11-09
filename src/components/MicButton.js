import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, shadows } from "../theme/colors";

export const MicButton = ({
  isRecording,
  isProcessing = false,
  onPress,
  label = "Tap to record",
}) => {
  const showSpinner = isRecording || isProcessing;
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      disabled={isProcessing}
    >
      <View
        style={[
          styles.iconWrapper,
          (isRecording || isProcessing) && styles.iconWrapperActive,
        ]}
      >
        <Ionicons
          name={
            isRecording
              ? "mic"
              : isProcessing
              ? "cloud-upload-outline"
              : "mic-outline"
          }
          size={26}
          color={isRecording || isProcessing ? "#FFFFFF" : colors.primary}
        />
      </View>
      <View style={styles.textWrapper}>
        <Text style={styles.title}>
          {isProcessing
            ? "Uploading..."
            : isRecording
            ? "Listening..."
            : "Start voice report"}
        </Text>
        <Text style={styles.subtitle}>{label}</Text>
      </View>
      {showSpinner && <ActivityIndicator color={colors.primary} />}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: "0px 2px 4px rgba(0,0,0,0.2)",
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E8F2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  iconWrapperActive: {
    backgroundColor: colors.primary,
  },
  textWrapper: {
    flex: 1,
    marginLeft: 16,
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
});
