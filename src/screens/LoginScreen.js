import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, shadows } from "../theme/colors";
import { useAuth } from "../context/AuthContext";

const LoginScreen = ({ navigation }) => {
  const { role, login, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); 
  const [loading, setLoading] = useState(false);
  const hasNavigatedRef = React.useRef(false);

  console.log("[LoginScreen] ===== RENDER =====", {
    hasUser: !!user,
    userEmail: user?.email,
    hasRole: !!role,
    role,
    loading,
    hasNavigated: hasNavigatedRef.current,
  });

  // Track when user changes
  useEffect(() => {
    console.log("[LoginScreen] 👤 user changed:", {
      hasUser: !!user,
      email: user?.email,
    });
  }, [user]);

  useEffect(() => {
    console.log("[LoginScreen] Role check useEffect", { role });
    if (!role) {
      // If user somehow lands on Login without selecting a role, send them back
      console.log("[LoginScreen] No role, redirecting to RoleSelect");
      navigation.replace("RoleSelect");
    }
  }, [role, navigation]);

  // Reset navigation guard when screen is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      console.log("[LoginScreen] Screen focused, resetting navigation guard");
      hasNavigatedRef.current = false;
    });
    return unsubscribe;
  }, [navigation]);

  const navigateToTarget = React.useCallback(() => {
    if (!role) {
      console.log("[LoginScreen] Cannot navigate - role missing");
      return;
    }
    if (hasNavigatedRef.current) {
      console.log("[LoginScreen] Navigation already handled, skipping");
      return;
    }
    const targetScreen = role === "resident" ? "Home" : "Dashboard";
    console.log(`[LoginScreen] Navigating to ${targetScreen}`);
    hasNavigatedRef.current = true;
    setLoading(false);
    navigation.replace(targetScreen);
  }, [role, navigation, hasNavigatedRef]);

  const handleLogin = async () => {
    console.log("[LoginScreen] handleLogin called", {
      hasEmail: !!email,
      hasPassword: !!password,
      loading,
    });

    if (!email || !password) {
      console.log("[LoginScreen] Missing email or password");
      Alert.alert("Missing info", "Please enter your email and password.");
      return;
    }
    if (password.length < 6) {
      console.log("[LoginScreen] Password too short");
      Alert.alert(
        "Invalid password",
        "Password must be at least 6 characters."
      );
      return;
    }

    // Prevent multiple simultaneous login attempts
    if (loading) {
      console.log("[LoginScreen] Login already in progress, ignoring");
      return;
    }

    console.log("[LoginScreen] Setting loading to true");
    setLoading(true);
    console.log("[LoginScreen] Flags set, proceeding with login");

    try {
      console.log("[LoginScreen] Attempting login for:", email);
      await login(email, password);
      console.log(
        "[LoginScreen] Login promise resolved, attempting navigation"
      );
      navigateToTarget();
    } catch (err) {
      console.error("[LoginScreen] Login failed:", err);
      const errorMessage =
        err.message ||
        err.code ||
        "Could not sign in. Please check your credentials.";
      Alert.alert("Sign in failed", errorMessage);
      console.log("[LoginScreen] Resetting loading to false after error");
      setLoading(false);
    }
  };

  // Navigate after login - simply replace to Home/Dashboard
  // Only navigate if we have an authenticated user and a selected role
  React.useEffect(() => {
    console.log("[LoginScreen] Navigation useEffect", {
      hasUser: !!user,
      hasRole: !!role,
      loading,
      hasNavigated: hasNavigatedRef.current,
    });

    if (user && role && !hasNavigatedRef.current) {
      const targetScreen = role === "resident" ? "Home" : "Dashboard";
      console.log(`[LoginScreen] Auto-navigating to ${targetScreen}`);
      hasNavigatedRef.current = true;
      setLoading(false);
      navigation.replace(targetScreen);
    } else if (!user) {
      if (hasNavigatedRef.current) {
        console.log(
          "[LoginScreen] User logged out, resetting navigation guard"
        );
      }
      hasNavigatedRef.current = false;
      setLoading(false);
    }
  }, [user, role, navigation]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroOverlay}
      />
      <View style={styles.container}>
        <View style={styles.copyColumn}>
          <Text style={styles.kicker}>Resi Access</Text>
          <Text style={styles.title}>Sign in with your campus credentials</Text>
          <Text style={styles.subtitle}>
            Secure voice reporting for residents, plus real-time dashboards for
            your team. Use your campus email to continue.
          </Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>
              {role ? `Continue as ${role}` : "Select a role first"}
            </Text>
            <TouchableOpacity onPress={() => navigation.replace("RoleSelect")}>
              <Text style={styles.switchRole}>Change role</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fieldStack}>
            <Text style={styles.label}>Campus email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@umass.edu"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholderTextColor="rgba(99,102,241,0.6)"
            />
          </View>

          <View style={styles.fieldStack}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholderTextColor="rgba(99,102,241,0.6)"
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && { opacity: 0.7 }]}
            onPress={() => {
              console.log("[LoginScreen] Button pressed");
              handleLogin();
            }}
            disabled={loading}
          >
            <Text style={styles.loginButtonText}>
              {loading ? "Signing you in…" : "Continue"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            By continuing you agree to Resi’s community guidelines.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    position: "relative",
  },
  container: {
    flex: 1,
    paddingHorizontal: 40,
    paddingVertical: 48,
    gap: 36,
    justifyContent: "center",
  },
  heroOverlay: {
    position: "absolute",
    top: -260,
    left: -160,
    right: -160,
    height: 480,
    opacity: 0.32,
  },
  copyColumn: {
    maxWidth: 520,
    gap: 18,
  },
  kicker: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 42,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 48,
    letterSpacing: -0.9,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    lineHeight: 24,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 30,
    padding: 32,
    gap: 22,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    maxWidth: 440,
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  switchRole: {
    color: colors.accent,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(127,92,255,0.25)",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    fontSize: 16,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  fieldStack: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 10,
  },
  loginButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  disclaimer: {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(199,206,232,0.65)",
    textAlign: "center",
  },
});
