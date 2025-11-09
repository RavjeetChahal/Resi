import React from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { RoleCard } from "../components/RoleCard";
import { colors, gradients } from "../theme/colors";
import { useAuth } from "../context/AuthContext";

const roleOptions = [
  {
    key: "resident",
    title: "Resident",
    description:
      "Report maintenance or residential life issues quickly using your voice.",
    primary: true,
  },
  {
    key: "maintenance",
    title: "Maintenance",
    description:
      "Review, prioritize, and resolve maintenance tickets in real time.",
  },
  {
    key: "ra",
    title: "Resident Assistant",
    description:
      "Stay on top of student-life issues and coordinate follow-ups.",
  },
];

const RoleSelectScreen = ({ navigation }) => {
  const { setRole } = useAuth();
  // Removed auto-redirect logic - LoginScreen handles post-login navigation

  const handleSelect = (roleKey) => {
    console.log(`[RoleSelect] Role selected: ${roleKey}`);
    setRole(roleKey);
    navigation.navigate("Login");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroOverlay}
      />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Set your perspective</Text>
          <Text style={styles.title}>How will you use MoveMate?</Text>
          <Text style={styles.subtitle}>
            Residents submit voice reports. Maintenance and RA teams triage and
            act instantly. Pick the workspace that matches you.
          </Text>
        </View>

        <View style={styles.rolesGrid}>
          {roleOptions.map((role) => (
            <RoleCard
              key={role.key}
              title={role.title}
              description={role.description}
              isPrimary={role.primary}
              onPress={() => handleSelect(role.key)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.footerLink}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.footerText}>
            Already selected a role? Continue to sign in
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default RoleSelectScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    position: "relative",
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 32,
    gap: 24,
  },
  heroOverlay: {
    position: "absolute",
    top: -260,
    left: -160,
    right: -160,
    height: 480,
    opacity: 0.32,
  },
  header: {
    gap: 16,
    maxWidth: 620,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primaryDark,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 42,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 48,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    lineHeight: 24,
  },
  rolesGrid: {
    flex: 1,
    gap: 18,
    marginTop: 16,
  },
  footerLink: {
    alignSelf: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  footerText: {
    color: colors.primary,
    fontWeight: "600",
  },
});
