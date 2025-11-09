import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
} from "react-native";
import { CommonActions } from "@react-navigation/native";
import { useConversation } from "../context/ConversationContext";
import { useAuth } from "../context/AuthContext";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { transcribeAudio } from "../services/api";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, shadows } from "../theme/colors";
import { ChatBubble } from "../components/ChatBubble";
import { getFirebaseDatabase } from "../services/firebase";
import { ref, push } from "firebase/database";

const ChatScreen = ({ navigation }) => {
  const { conversationState, updateConversationState } = useConversation();
  const { user, logout } = useAuth();
  // Use messages from conversation context instead of local state
  const messages = conversationState.messages || [];
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState("");
  const recordingRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const webStreamRef = useRef(null);
  const webChunksRef = useRef([]);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const conversationIdRef = useRef(
    conversationState.conversationId || `conv-${Date.now()}`
  );

  const log = (...args) => console.log("[Voice]", ...args);

  // Initialize conversation ID if needed
  useEffect(() => {
    if (!conversationState.conversationId) {
      log("Initializing new conversation ID:", conversationIdRef.current);
      updateConversationState({ conversationId: conversationIdRef.current });
    }
  }, [conversationState.conversationId, updateConversationState]);

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
        setError("Microphone access needed. Please enable permissions.");
        log("Native microphone permission denied");
      } else {
        log("Native microphone permission granted");
      }
    })();

    return () => {
      if (recordingRef.current) {
        recordingRef.current
          .stopAndUnloadAsync()
          .then(() => log("Cleaned up native recording instance on unmount"))
          .catch(() => undefined);
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
      recordingRef.current = null;
      log("Failed to stop recording", err);
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
      setError("Microphone blocked. Enable access in settings.");
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
      setError("Unable to access microphone. Please try again.");
      console.error("Failed to start recording", err);
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

  const handleTranscription = useCallback(async ({ uri, file }) => {
    if (!uri && !file) {
      setIsProcessing(false);
      setIsRecording(false);
      log("handleTranscription called with no recording payload");
      return;
    }
    setIsProcessing(true);
    log("Submitting recording for transcription", uri ? { uri } : { file });
    log("Using conversation ID:", conversationIdRef.current);
    let transcriptText = "";
    try {
      const response = await transcribeAudio({
        uri,
        file,
        conversationId: conversationIdRef.current,
      });
      transcriptText = response?.transcript ?? "";
      if (!transcriptText) {
        setError("No speech detected. Try again.");
        setIsProcessing(false);
        setIsRecording(false);
        log("Transcription returned empty text");
        return;
      }
      setTranscript(transcriptText);
      log("Transcription succeeded", { transcript: transcriptText });
      if (response?.context) {
        console.log("[Voice] Server conversation context", response.context);
      }
      
      // Add messages to conversation context
      const residentMessage = {
        id: `msg-${messages.length + 1}`,
        sender: "Resident",
        text: transcriptText,
        timestamp: Date.now(),
      };
      const aiMessage = {
        id: `msg-${messages.length + 2}`,
        sender: "MoveMate",
        text: response?.reply || "Thanks! We'll get back to you soon.",
        timestamp: Date.now(),
      };
      const newMessages = [...messages, residentMessage, aiMessage];
      updateConversationState({ messages: newMessages });
      // Store ticket in Firebase ONLY if schema is complete (needs_more_info = false)
      if (
        response?.classification &&
        !response.classification.needs_more_info &&
        user
      ) {
        try {
          const db = getFirebaseDatabase();
          if (db) {
            const ticketsRef = ref(db, "tickets");
            await push(ticketsRef, {
              ...response.classification,
              transcript: transcriptText,
              owner: user.uid,
              createdAt: new Date().toISOString(),
            });
            log("Ticket pushed to Firebase DB (schema complete)");
          }
        } catch (dbErr) {
          // non-fatal
          log("Failed to push ticket to Firebase DB", dbErr);
        }
      } else if (response?.classification?.needs_more_info) {
        log("Ticket NOT saved - more info needed from user");
      }

      // Play the TTS audio reply if the server returned it
      const activeMessageId = aiMessage.id;
      if (response?.audio?.data) {
        setSpeakingMessageId(activeMessageId);
        const contentType = response.audio.contentType || "audio/mpeg";
        const base64 = response.audio.data;
        try {
          if (Platform.OS === "web") {
            // Convert base64 to binary and play via browser Audio
            log("Playing TTS audio on web");
            const binary = atob(base64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: contentType });
            const audioUrl = URL.createObjectURL(blob);
            const audioEl = new window.Audio(audioUrl);
            try {
              await audioEl.play();
              log("TTS audio playback started");
            } catch (playErr) {
              console.warn("Audio playback failed (web):", playErr);
              setError(
                "Audio playback failed. Try again or check your browser."
              );
              log("TTS playback failed", playErr);
            }
            audioEl.onended = () => {
              URL.revokeObjectURL(audioUrl);
              log("TTS audio playback completed");
              setSpeakingMessageId(null);
            };
            audioEl.onerror = () => {
              setSpeakingMessageId(null);
            };
          } else {
            // Native: write the base64 to a temp file and play using expo-av
            log("Playing TTS audio on native");
            const filename = `movemate-reply-${Date.now()}.mp3`;
            const fileUri = FileSystem.cacheDirectory + filename;
            await FileSystem.writeAsStringAsync(fileUri, base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const { sound } = await Audio.Sound.createAsync(
              { uri: fileUri },
              { shouldPlay: true }
            );
            log("TTS audio playback started");
            sound.setOnPlaybackStatusUpdate(async (status) => {
              if (status?.didJustFinish) {
                try {
                  await sound.unloadAsync();
                  log("TTS sound unloaded");
                } catch (e) {}
                try {
                  await FileSystem.deleteAsync(fileUri, { idempotent: true });
                  log("TTS temp file deleted");
                } catch (e) {}
                setSpeakingMessageId(null);
              }
            });
          }
        } catch (playbackError) {
          console.warn("Failed to play audio response", playbackError);
          setError("Audio playback failed. Try again or check your device.");
          log("TTS playback error", playbackError);
          setSpeakingMessageId(null);
        }
      } else {
        log("No audio data returned from backend");
        setSpeakingMessageId(null);
      }
    } catch (err) {
      setError("Upload failed. Try again.");
      console.error("Transcription failed", err);
      log("Transcription request errored", err);
    } finally {
      setIsProcessing(false);
      setIsRecording(false);
      try {
        if (uri && Platform.OS !== "web") {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      } catch (cleanupErr) {
        log("Failed to delete temp recording", cleanupErr);
      }
    }
  }, [user, messages, updateConversationState]);

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
    isProcessing,
    isRecording,
    startRecordingAsync,
    startWebRecordingAsync,
    stopRecordingAsync,
    stopWebRecordingAsync,
    handleTranscription,
  ]);

  const handleLogout = async () => {
    log("Signing out user from ChatScreen");
    const newConversationId = `conv-${Date.now()}`;
    conversationIdRef.current = newConversationId;
    updateConversationState({
      messages: [],
      conversationId: newConversationId,
    }); // Clear messages and reset conversation ID on logout
    setSpeakingMessageId(null);
    await logout();
    // Reset navigation stack to RoleSelect screen
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "RoleSelect" }],
      })
    );
  };

  const handleBackPress = () => {
    log("User leaving chat, clearing messages and resetting conversation");
    const newConversationId = `conv-${Date.now()}`;
    conversationIdRef.current = newConversationId;
    // Clear messages and reset conversation ID when user leaves chat
    updateConversationState({
      messages: [],
      conversationId: newConversationId,
    });
    setSpeakingMessageId(null);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroOverlay}
      />
      <View style={styles.headerRow}>
        <TouchableOpacity
          accessibilityLabel="Back to Home"
          testID="back-from-chat"
          style={styles.headerButton}
          onPress={handleBackPress}
        >
          <Text style={styles.headerButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MoveMate Voice</Text>
        <TouchableOpacity
          onPress={handleLogout}
          style={styles.headerButtonDark}
          accessibilityLabel="Sign out"
        >
          <Text style={styles.headerButtonDarkText}>Sign out</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.container}>
        <View style={styles.chatIntro}>
          <Text style={styles.chatKicker}>Start a fresh report</Text>
          <Text style={styles.chatHeadline}>
            Tell us what’s happening in your space
          </Text>
          <Text style={styles.chatSubhead}>
            When you speak, MoveMate transcribes, summarizes, and routes the
            request to the right campus team instantly.
          </Text>
        </View>

        <View style={styles.chatSurface}>
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>You haven’t said anything yet</Text>
              <Text style={styles.emptyText}>
                Tap the mic below and share what’s going on. We’ll take it from
                there.
              </Text>
            </View>
          ) : (
            <FlatList
              data={messages}
              keyExtractor={(item) => item.id?.toString()}
              renderItem={({ item }) => (
                <ChatBubble
                  {...item}
                  isSpeaking={item.id === speakingMessageId}
                />
              )}
              contentContainerStyle={styles.chatList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            testID="mic-button"
            accessibilityLabel="Start voice recording"
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonActive,
              isProcessing && { opacity: 0.7 },
            ]}
            onPress={handleMicPress}
            disabled={isProcessing}
          >
            <Text style={styles.recordButtonText}>
              {isRecording ? "Stop & Submit" : "Start Voice Report"}
            </Text>
          </TouchableOpacity>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  heroOverlay: {
    position: "absolute",
    top: -240,
    left: -160,
    right: -140,
    height: 420,
    opacity: 0.28,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 20,
  },
  headerButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: "rgba(99,102,241,0.12)",
  },
  headerButtonText: {
    color: colors.primaryDark,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  headerButtonDark: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: "rgba(15,23,42,0.78)",
  },
  headerButtonDarkText: {
    color: "#E2E8FE",
    fontWeight: "600",
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 24,
  },
  chatIntro: {
    gap: 12,
  },
  chatKicker: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primaryDark,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  chatHeadline: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
  },
  chatSubhead: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  chatSurface: {
    flex: 1,
    borderRadius: 28,
    padding: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.12)",
    ...shadows.card,
  },
  chatList: {
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  emptyText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 280,
  },
  actions: {
    alignItems: "center",
    gap: 12,
  },
  recordButton: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 48,
    backgroundColor: colors.primary,
    ...shadows.card,
  },
  recordButtonActive: {
    backgroundColor: colors.danger,
  },
  recordButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
  },
});

export default ChatScreen;
