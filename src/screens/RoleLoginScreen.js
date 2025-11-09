import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TextInput,
  Button,
  Alert,
  TouchableOpacity,
} from "react-native";
import { colors } from "../theme/colors";
import { useAuth } from "../context/AuthContext";
import { getFirebaseAuth } from "../services/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { getFirebaseDatabase } from "../services/firebase";
import { ref, set, get } from "firebase/database";

const RoleLoginScreen = ({ route, navigation }) => {
  const { setRole, setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [userInfo, setUserInfo] = useState(null);
  // Removed debugLogs state
  const { roleKey } = route.params || {};

  // Helper to log to both console and UI
  const logDebug = (...args) => {
    // Helper to log to console only
    console.log("[RoleLoginScreen]", ...args);
  };

  useEffect(() => {
    logDebug("Mounted", { routeParams: route.params });
    if (!route.params || !route.params.roleKey) {
      logDebug("Missing roleKey in route params", route.params);
    }
  }, [route.params]);

  // Helper to create user in DB
  const createUserInDatabase = async (user, roleKey) => {
    try {
      const db = getFirebaseDatabase();
      if (!db) return;
      const userRef = ref(db, `users/${user.uid}`);
      await set(userRef, {
        email: user.email,
        role: roleKey,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      logDebug("Error creating user in DB", err);
    }
  };

  // Helper to fetch user info from DB
  const fetchUserInfo = async (uid) => {
    try {
      const db = getFirebaseDatabase();
      if (!db) return null;
      const userRef = ref(db, `users/${uid}`);
      const snapshot = await get(userRef);
      return snapshot.exists() ? snapshot.val() : null;
    } catch (err) {
      logDebug("Error fetching user info", err);
      return null;
    }
  };

  const handleLogin = async () => {
    logDebug("Attempting login:", { email, roleKey });
    // Accept any .edu domain
    const eduEmailRegex = /^[^@\s]+@[^@\s]+\.edu$/i;
    if (!eduEmailRegex.test(email)) {
      Alert.alert(
        "Invalid Email",
        "Please use your school .edu email address."
      );
      logDebug("Invalid email domain");
      return;
    }

    // Password requirements: length > 7, 1 uppercase, 1 lowercase, 1 number, 1 special character
    const passwordRequirements = [
      { regex: /.{8,}/, message: "at least 8 characters" },
      { regex: /[A-Z]/, message: "an uppercase letter" },
      { regex: /[a-z]/, message: "a lowercase letter" },
      { regex: /[0-9]/, message: "a number" },
      { regex: /[^A-Za-z0-9]/, message: "a special character" },
    ];
    setLoading(true);
    const auth = getFirebaseAuth();
    logDebug("Firebase Auth object:", auth);
    if (!auth) {
      logDebug("Firebase Auth is null. Check config.");
      Alert.alert("Auth Error", "Firebase Auth is not initialized.");
      setLoading(false);
      return;
    }
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, email, password);
      logDebug("Login success:", userCredential);
    } catch (err) {
      logDebug("Login error:", err);
      if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/invalid-credential"
      ) {
        // Register new user for both error codes
        try {
          userCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );
          logDebug("User registered:", userCredential);
          await createUserInDatabase(userCredential.user, roleKey);
          Alert.alert("Account Created", "Your account has been created.");
        } catch (regErr) {
          Alert.alert("Registration Failed", regErr.message);
          logDebug("Registration error:", regErr);
          setLoading(false);
          return;
        }
      } else {
        Alert.alert("Login Failed", err.message);
        setLoading(false);
        return;
      }
    }
    setRole(roleKey);
    setUser(userCredential.user);
    // Fetch user info from DB and show it
    const info = await fetchUserInfo(userCredential.user.uid);
    setUserInfo(info);
    navigation.navigate(roleKey === "resident" ? "Home" : "Dashboard", {
      userInfo: info,
    });
    setLoading(false);
  };
  // ...existing code...

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            logDebug("Back button pressed");
            navigation.goBack();
          }}
        >
          <Text style={styles.backText}>{"< Back"}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          Login as{" "}
          {roleKey
            ? roleKey.charAt(0).toUpperCase() + roleKey.slice(1)
            : "Unknown"}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="School Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(val) => {
            setEmail(val);
            logDebug("Email input changed:", val);
          }}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={(val) => {
            setPassword(val);
            logDebug("Password input changed:", val);
            // Live password validation
            const passwordRequirements = [
              { regex: /.{8,}/, message: "at least 8 characters" },
              { regex: /[A-Z]/, message: "an uppercase letter" },
              { regex: /[a-z]/, message: "a lowercase letter" },
              { regex: /[0-9]/, message: "a number" },
              { regex: /[^A-Za-z0-9]/, message: "a special character" },
            ];
            const failedReqs = passwordRequirements.filter(
              (r) => !r.regex.test(val)
            );
            if (failedReqs.length > 0) {
              setPasswordError(
                `Password must contain ${failedReqs
                  .map((r) => r.message)
                  .join(", ")}.`
              );
            } else {
              setPasswordError("");
            }
          }}
        />
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: "#888" }}>
            Password must contain:
          </Text>
          <Text style={{ fontSize: 13, color: "#888" }}>
            • At least 8 characters
          </Text>
          <Text style={{ fontSize: 13, color: "#888" }}>
            • An uppercase letter
          </Text>
          <Text style={{ fontSize: 13, color: "#888" }}>
            • A lowercase letter
          </Text>
          <Text style={{ fontSize: 13, color: "#888" }}>• A number</Text>
          <Text style={{ fontSize: 13, color: "#888" }}>
            • A special character
          </Text>
        </View>
        {passwordError ? (
          <Text style={{ color: "#d00", fontSize: 13, marginBottom: 8 }}>
            {passwordError}
          </Text>
        ) : null}
        <Button
          title={loading ? "Logging in..." : "Login"}
          onPress={handleLogin}
          disabled={loading}
        />
        {/* Display user info after login/registration (for demo) */}
        {userInfo && (
          <View
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: "#f5f5f5",
              borderRadius: 8,
            }}
          >
            <Text style={{ fontWeight: "bold", marginBottom: 4 }}>
              User Info:
            </Text>
            <Text>Email: {userInfo.email}</Text>
            <Text>Role: {userInfo.role}</Text>
            <Text>Created: {userInfo.createdAt}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 18,
    justifyContent: "center",
  },
  backButton: {
    marginBottom: 12,
    alignSelf: "flex-start",
    padding: 6,
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 18,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
});

export default RoleLoginScreen;
