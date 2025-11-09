import React from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";
import { RoleCard } from "../components/RoleCard";
import { colors } from "../theme/colors";
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
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MoveMate</Text>
          <Text style={styles.title}>Choose your role</Text>
          <Text style={styles.subtitle}>
            Select how you want to use MoveMate. You’ll sign in next.
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
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 24,
  },
  header: {
    gap: 10,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  rolesGrid: {
    flex: 1,
    gap: 18,
    marginTop: 8,
  },
  footerLink: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  footerText: {
    color: colors.primary,
    fontWeight: "600",
  },
});
