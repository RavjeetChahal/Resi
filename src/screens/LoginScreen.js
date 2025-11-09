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
import { colors } from "../theme/colors";
import { useAuth } from "../context/AuthContext";

const LoginScreen = ({ navigation }) => {
  const { role, login, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const hasNavigatedRef = React.useRef(false);
  const safetyTimeoutRef = React.useRef(null);

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

  const clearSafetyTimeout = React.useCallback(() => {
    if (safetyTimeoutRef.current) {
      console.log("[LoginScreen] Clearing safety timeout");
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, []);

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
    clearSafetyTimeout();
    setLoading(false);
    navigation.replace(targetScreen);
  }, [role, navigation, clearSafetyTimeout]);

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
      Alert.alert("Invalid password", "Password must be at least 6 characters.");
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
    
    clearSafetyTimeout();
    // Safety timeout: if navigation doesn't happen within 15 seconds, reset loading
    safetyTimeoutRef.current = setTimeout(() => {
      console.log("[LoginScreen] Safety timeout: resetting loading after 15s");
      setLoading(false);
      hasNavigatedRef.current = false;
      safetyTimeoutRef.current = null;
    }, 15000);
    
    try {
      console.log("[LoginScreen] Attempting login for:", email);
      await login(email, password);
      console.log("[LoginScreen] Login promise resolved, attempting navigation");
      navigateToTarget();
    } catch (err) {
      console.error("[LoginScreen] Login failed:", err);
      clearSafetyTimeout();
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
    
    if (user && role) {
      if (!hasNavigatedRef.current) {
        navigateToTarget();
      } else {
        console.log("[LoginScreen] Navigation already performed for this session");
      }
    } else if (!user) {
      if (hasNavigatedRef.current) {
        console.log("[LoginScreen] User logged out, resetting navigation guard");
      }
      hasNavigatedRef.current = false;
      clearSafetyTimeout();
      setLoading(false);
    }
  }, [user, role, loading, navigateToTarget, clearSafetyTimeout]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MoveMate</Text>
          <Text style={styles.title}>Welcome to MoveMate</Text>
          <Text style={styles.subtitle}>
            Enter your email and password to sign in or create a new account.
          </Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.loginButton, loading && { opacity: 0.6 }]}
          onPress={() => {
            console.log("[LoginScreen] Button pressed");
            handleLogin();
          }}
          disabled={loading}
        >
          <Text style={styles.loginButtonText}>
            {loading ? "Please wait..." : "Continue"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ alignSelf: "center", marginTop: 12 }}
          onPress={() => navigation.replace("RoleSelect")}
        >
          <Text style={{ color: colors.primary, fontWeight: "600" }}>
            Choose a different role
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 28,
  },
  header: {
    gap: 12,
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    alignSelf: "center",
    marginTop: 24,
    minWidth: 200,
  },
  loginButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
