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

  useEffect(() => {
    if (!role) {
      // If user somehow lands on Login without selecting a role, send them back
      navigation.replace("RoleSelect");
    }
  }, [role, navigation]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      Alert.alert("Login failed", err.message || "Could not log in.");
    } finally {
      setLoading(false);
    }
  };

  // Navigate after login if user and role are set
  React.useEffect(() => {
    if (user && role) {
      if (role === "resident") {
        navigation.replace("Home");
      } else {
        navigation.replace("Dashboard");
      }
    }
  }, [user, role, navigation]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MoveMate</Text>
          <Text style={styles.title}>Sign in to MoveMate</Text>
          <Text style={styles.subtitle}>
            Enter your email and password to continue.
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
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.loginButtonText}>
            {loading ? "Signing in..." : "Sign In"}
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
