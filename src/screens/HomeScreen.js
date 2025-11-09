import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConversation } from "../context/ConversationContext";
import {
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { ChatBubble } from "../components/ChatBubble";
import { MicButton } from "../components/MicButton";
import { colors } from "../theme/colors";
import { mockConversation } from "../assets/data/issues";
import { useAuth } from "../context/AuthContext";
import { getFirebaseDatabase } from "../services/firebase";
import { ref, push, onValue } from "firebase/database";
import { transcribeAudio, pingServer } from "../services/api";
// Home screen component for resident users

const HomeScreen = ({ navigation }) => {
  const [messages, setMessages] = useState(mockConversation);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const recordingRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const webStreamRef = useRef(null);
  const webChunksRef = useRef([]);
  const { resetRole, user } = useAuth();
  const { conversationState, updateConversationState } = useConversation();
  const conversationIdRef = useRef(
    conversationState.conversationId || `conv-${Date.now()}`
  );

  // Initialize conversation if needed
  useEffect(() => {
    if (!conversationState.conversationId) {
      updateConversationState({ conversationId: conversationIdRef.current });
    }
  }, [conversationState.conversationId, updateConversationState]);

  // Fetch resident's previous tickets from Firebase
  useEffect(() => {
    if (!user?.uid) return;
    setLoadingTickets(true);
    try {
      const db = getFirebaseDatabase();
      if (!db) return;
      const ticketsRef = ref(db, "tickets");
      const unsubscribe = onValue(ticketsRef, (snapshot) => {
        const data = snapshot.val() || {};
        let userTickets = Object.entries(data)
          .map(([id, ticket]) => ({ id, ...ticket }))
          .filter((t) => t.owner === user.uid);
        // Sort tickets by createdAt descending (latest first)
        userTickets = userTickets.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        setTickets(userTickets);
        setLoadingTickets(false);
        // If there are no tickets, redirect to chat page
        if (userTickets.length === 0) {
          navigation.replace("Chat");
        }
      });
      return () => unsubscribe();
    } catch (err) {
      setLoadingTickets(false);
    }
  }, [user?.uid, navigation]);

  const log = (...args) => console.log("[Voice]", ...args);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  useEffect(() => {
    log("Initializing microphone permissions for", Platform.OS);

    if (Platform.OS === "web") {
      if (
        !navigator?.mediaDevices?.getUserMedia ||
        typeof window.MediaRecorder === "undefined"
      ) {
        setPermissionGranted(false);
        setError(
          "This browser does not support in-browser voice recording. Try a different browser or the mobile app."
        );
        log("MediaRecorder not supported in this browser");
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
          setPermissionGranted(true);
          log("Web microphone permission granted");
          // Check backend connectivity immediately after microphone permission
          pingServer()
            .then((r) => log("[API] Backend healthy", r.status))
            .catch((e) => {
              console.warn("[API] Backend unreachable", e?.message || e);
              setError((prev) => prev || "Backend unreachable. Check server.");
            });
        })
        .catch(() => {
          setPermissionGranted(false);
          setError(
            "Microphone access blocked. Check browser permissions and reload."
          );
          log("Web microphone permission denied");
        });
      return;
    }

    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      setPermissionGranted(granted);
      if (!granted) {
        Alert.alert(
          "Microphone access needed",
          "Please enable microphone permissions to record voice reports."
        );
        log("Native microphone permission denied");
      } else {
        log("Native microphone permission granted");
      }
    })();

    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
      }
      if (recordingRef.current) {
        log("Cleaned up native recording instance");
      }
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop();
          log("Stopped active web recorder during cleanup");
        } catch (err) {
          // ignore
        }
      }
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach((track) => track.stop());
        webStreamRef.current = null;
        log("Closed web media stream during cleanup");
      }
    };
  }, []);

  const stopRecordingAsync = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      log("stopRecordingAsync called but no recording instance found");
      return null;
    }

    try {
      log("Stopping native recording…");
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      log("Native recording stopped. File saved at", uri);
      return uri;
    } catch (err) {
      console.error("Failed to stop recording", err);
      recordingRef.current = null;
      log("Native recording stop failed", err);
      return null;
    }
  }, []);

  const stopWebRecordingAsync = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = webStreamRef.current;
    if (!recorder) {
      log("stopWebRecordingAsync called with no active recorder");
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        try {
          const blob = new Blob(webChunksRef.current, { type: "audio/webm" });
          webChunksRef.current = [];
          mediaRecorderRef.current = null;
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            webStreamRef.current = null;
          }
          const file = new File([blob], `recording-${Date.now()}.webm`, {
            type: "audio/webm",
          });
          log("Web recording stopped. Blob assembled", {
            size: blob.size,
            type: blob.type,
          });
          resolve(file);
        } catch (err) {
          log("Failed to assemble web recording blob", err);
          reject(err);
        }
      };

      try {
        log("Stopping web MediaRecorder…");
        recorder.stop();
      } catch (err) {
        log("Stopping MediaRecorder failed", err);
        reject(err);
      }
    });
  }, []);

  const startRecordingAsync = useCallback(async () => {
    if (permissionGranted === false) {
      Alert.alert(
        "Microphone blocked",
        "Enable microphone access in settings to submit voice reports."
      );
      log("Attempted to start native recording without permission");
      return;
    }

    setError(null);
    try {
      log("Configuring Audio mode for native recording…");
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      setTranscript("");
      log("Native recording started");
    } catch (err) {
      console.error("Failed to start recording", err);
      setError("Unable to access microphone. Please try again.");
      log("Native recording failed to start", err);
    }
  }, [permissionGranted]);

  const startWebRecordingAsync = useCallback(async () => {
    if (permissionGranted === false) {
      setError("Microphone access blocked in browser settings.");
      log("Attempted to start web recording without permission");
      return;
    }

    if (
      !navigator?.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setError(
        "Browser does not support voice recording. Try the mobile app instead."
      );
      log("Web recording attempted without MediaRecorder support");
      return;
    }

    setError(null);
    try {
      log("Requesting browser audio stream…");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.start();
      webChunksRef.current = chunks;
      mediaRecorderRef.current = recorder;
      webStreamRef.current = stream;
      setIsRecording(true);
      setTranscript("");
      log("Web recording started", { mimeType: recorder.mimeType });
    } catch (err) {
      console.error("Failed to start web recording", err);
      setError("Unable to access microphone. Check browser permissions.");
      log("Web recording failed to start", err);
    }
  }, [permissionGranted]);

  const handleTranscription = useCallback(
    async ({ uri, file }) => {
      if (!uri && !file) {
        log("handleTranscription called with no recording payload");
        setIsProcessing(false);
        setIsRecording(false);
        return;
      }
      log("Submitting recording for transcription", uri ? { uri } : { file });
      setIsProcessing(true);

      const conversationId = conversationIdRef.current;
      let transcriptText = "";
      try {
        const response = await transcribeAudio({
          uri,
          file,
          conversationId: conversationIdRef.current,
        });
        transcriptText = response?.transcript ?? "";

        if (!transcriptText) {
          setError("No speech detected. Try speaking closer to your device.");
          log("Transcription returned empty text");
          setIsProcessing(false);
          setIsRecording(false);
          return;
        }

        setTranscript(transcriptText);
        log("Transcription succeeded", { transcript: transcriptText });
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${prev.length + 1}`,
            sender: "Resident",
            text: transcriptText,
            timestamp: Date.now(),
          },
          {
            id: `msg-${prev.length + 2}`,
            sender: "MoveMate",
            text:
              response?.reply ||
              "Thanks! I'm routing this to the right team and will update you once it's picked up.",
            timestamp: Date.now(),
          },
        ]);

        // If schema is complete, push ticket to Firebase DB
        if (response?.classification && user) {
          try {
            const db = getFirebaseDatabase();
            const ticketsRef = ref(db, "tickets");
            await push(ticketsRef, {
              ...response.classification,
              transcript: transcriptText,
              owner: user.uid,
              createdAt: new Date().toISOString(),
            });
            log("Ticket pushed to Firebase DB");
          } catch (dbError) {
            log("Failed to push ticket to Firebase DB", dbError);
          }
        }

        // Play the TTS audio reply if the server returned it
        if (response?.audio?.data) {
          const contentType = response.audio.contentType || "audio/mpeg";
          const base64 = response.audio.data;
          try {
            if (Platform.OS === "web") {
              // Convert base64 to binary and play via browser Audio
              const binary = atob(base64);
              const len = binary.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
              const blob = new Blob([bytes], { type: contentType });
              const audioUrl = URL.createObjectURL(blob);
              const audioEl = new window.Audio(audioUrl);
              try {
                await audioEl.play();
              } catch (playErr) {
                console.warn("Audio playback failed (web):", playErr);
                setError(
                  "Audio playback failed. Try again or check your browser."
                );
              }
              audioEl.onended = () => URL.revokeObjectURL(audioUrl);
            } else {
              // Native: write the base64 to a temp file and play using expo-av
              const filename = `movemate-reply-${Date.now()}.mp3`;
              const fileUri = FileSystem.cacheDirectory + filename;
              await FileSystem.writeAsStringAsync(fileUri, base64, {
                encoding: FileSystem.EncodingType.Base64,
              });
              const { sound } = await Audio.Sound.createAsync(
                { uri: fileUri },
                { shouldPlay: true }
              );
              sound.setOnPlaybackStatusUpdate(async (status) => {
                if (status?.didJustFinish) {
                  try {
                    await sound.unloadAsync();
                  } catch (e) {}
                  try {
                    await FileSystem.deleteAsync(fileUri, { idempotent: true });
                  } catch (e) {}
                }
              });
            }
          } catch (playbackError) {
            console.warn("Failed to play audio response", playbackError);
            setError("Audio playback failed. Try again or check your device.");
          }
        } else {
          log("No audio data returned from backend");
          setError("No audio reply from agent. Try again or contact support.");
        }
      } catch (err) {
        console.error("Transcription failed", err);
        setError("Upload failed. Check your connection and try again.");
        log("Transcription request errored", err);
      } finally {
        setIsProcessing(false);
        setIsRecording(false);
        try {
          if (uri && Platform.OS !== "web") {
            await FileSystem.deleteAsync(uri, { idempotent: true });
          }
        } catch (cleanupError) {
          console.warn("Failed to delete temp recording", cleanupError);
          log("Temp recording cleanup failed", cleanupError);
        }
      }
    },
    [setMessages, conversationIdRef, user]
  );

  const handleMicPress = useCallback(async () => {
    log("Mic button pressed", {
      isProcessing,
      isRecording,
      platform: Platform.OS,
    });

    if (isProcessing) {
      log("Ignoring mic press while processing");
      return;
    }

    if (Platform.OS === "web") {
      if (isRecording) {
        setIsRecording(false);
        try {
          const file = await stopWebRecordingAsync();
          await handleTranscription({ file });
        } catch (err) {
          console.error("Failed to stop web recording", err);
          setError("Recording failed. Please try again.");
          log("Web recording stop failed", err);
        }
      } else {
        await startWebRecordingAsync();
      }
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      const uri = await stopRecordingAsync();
      await handleTranscription({ uri });
    } else {
      await startRecordingAsync();
    }
  }, [
    handleTranscription,
    isProcessing,
    isRecording,
    startRecordingAsync,
    startWebRecordingAsync,
    stopRecordingAsync,
    stopWebRecordingAsync,
  ]);

  const handleLogout = () => {
    log("Signing out user");
    conversationIdRef.current = `conv-${Date.now()}`;
    updateConversationState({});
    resetRole();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{greeting}</Text>
            <Text style={styles.title}>Your Requests</Text>
            <Text style={styles.subtitle}>
              Here are your previous requests. Tap any to view details or start
              a new chat.
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {loadingTickets ? (
          <Text style={{ textAlign: "center", marginTop: 24 }}>
            Loading your requests…
          </Text>
        ) : tickets.length > 0 ? (
          <>
            <FlatList
              data={tickets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontWeight: "bold",
                      color: colors.primary,
                      marginBottom: 2,
                    }}
                  >
                    Request #{item.id}
                  </Text>
                  <Text style={{ color: colors.text }}>
                    {item.summary || item.transcript}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    Status: {item.status || "Open"}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    Urgency: {item.urgency || "Unknown"}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    Reported:{" "}
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString()
                      : ""}
                  </Text>
                </View>
              )}
              contentContainerStyle={styles.chatList}
              showsVerticalScrollIndicator={false}
            />
            {/* Only show Start New Chat button if tickets exist */}
            <TouchableOpacity
              style={{
                marginTop: 32,
                alignSelf: "center",
                padding: 16,
                borderRadius: 999,
                backgroundColor: colors.primary,
                minWidth: 200,
              }}
              accessibilityLabel="Start a new chat with the agent"
              testID="start-new-chat"
              onPress={() => navigation.navigate("Chat")}
            >
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                Start New Chat
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    marginTop: 6,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 8,
  },
  dashboardLink: {
    marginTop: 12,
  },
  dashboardLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  logoutButton: {
    position: "absolute",
    right: 0,
    top: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFFAA",
  },
  logoutText: {
    fontSize: 13,
    color: colors.muted,
  },
  chatList: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  transcriptContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  transcriptLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 6,
  },
  transcriptText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: colors.danger,
  },
  footer: {
    marginBottom: 24,
  },
});
