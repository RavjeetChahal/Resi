import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { CommonActions } from "@react-navigation/native";
import { useConversation } from "../context/ConversationContext";
import { useAuth } from "../context/AuthContext";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { transcribeAudio } from "../services/api";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, shadows } from "../theme/colors";
import { ChatBubble } from "../components/ChatBubble";

const ChatScreen = ({ navigation }) => {
  const { conversationState, updateConversationState } = useConversation();
  const { user, logout } = useAuth();
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
  const recordShimmer = useRef(new Animated.Value(0)).current;
  const recordIntensity = useRef(new Animated.Value(0)).current;
  const recordLoopRef = useRef(null);
  const AnimatedLinearGradient = useMemo(
    () => Animated.createAnimatedComponent(LinearGradient),
    []
  );
  const buttonGradientColors = useMemo(
    () => ["#8b5cf6", "#6366f1", "#3b82f6", "#6366f1", "#8b5cf6"],
    []
  );
  const buttonGradientTranslate = useMemo(
    () =>
      recordShimmer.interpolate({
        inputRange: [0, 1],
        outputRange: [-80, 80],
      }),
    [recordShimmer]
  );
  const buttonGradientOpacity = useMemo(
    () =>
      recordIntensity.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1],
      }),
    [recordIntensity]
  );
  const haloOpacity = useMemo(
    () =>
      recordIntensity.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.75],
      }),
    [recordIntensity]
  );
  const haloScale = useMemo(
    () =>
      recordIntensity.interpolate({
        inputRange: [0, 1],
        outputRange: [0.97, 1.08],
      }),
    [recordIntensity]
  );

  const log = (...args) => console.log("[Voice]", ...args);

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

  useEffect(() => {
    recordShimmer.setValue(0);
    const loop = Animated.loop(
      Animated.timing(recordShimmer, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    recordLoopRef.current = loop;
    loop.start();

    return () => {
      recordLoopRef.current?.stop();
      recordLoopRef.current = null;
    };
  }, [recordShimmer]);

  useEffect(() => {
    Animated.timing(recordIntensity, {
      toValue: isRecording ? 1 : 0,
      duration: isRecording ? 260 : 420,
      easing: isRecording ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isRecording, recordIntensity]);

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
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      log("Preparing recorder…");
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      log("Native recording started");
    } catch (err) {
      console.error("Failed to start recording", err);
      setError("Recording failed to start. Try again.");
    }
  }, [permissionGranted]);

  const startWebRecordingAsync = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      webStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      webChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          webChunksRef.current.push(event.data);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      log("Web recording started");
    } catch (err) {
      console.error("Failed to start web recording", err);
      setError("Could not start recording. Check your device permissions.");
    }
  }, []);

  const handleTranscription = useCallback(
    async ({ uri, file }) => {
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
          userId: user?.uid,
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

        const residentMessage = {
          id: `msg-${messages.length + 1}`,
          sender: "Resident",
          text: transcriptText,
          timestamp: Date.now(),
        };
        const aiMessage = {
          id: `msg-${messages.length + 2}`,
          sender: "Resi",
          text: response?.reply || "Thanks! We'll get back to you soon.",
          timestamp: Date.now(),
        };
        const newMessages = [...messages, residentMessage, aiMessage];
        updateConversationState({ messages: newMessages });

        // Server handles ticket creation via persistTicket() in server/index.js
        // No need to create tickets on the frontend
        if (response?.classification?.needs_more_info) {
          log("Ticket NOT saved - more info needed from user");
        } else if (response?.ticket) {
          log("Ticket created by server:", response.ticket.id);
        }

        const activeMessageId = aiMessage.id;
        if (response?.audio?.data) {
          setSpeakingMessageId(activeMessageId);
          const contentType = response.audio.contentType || "audio/mpeg";
          const base64 = response.audio.data;
          try {
            if (Platform.OS === "web") {
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
                setError("Audio playback failed. Try again or check your browser.");
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
              log("Playing TTS audio on native");
              
              // Set audio mode for playback
              try {
                await Audio.setAudioModeAsync({
                  allowsRecordingIOS: false,
                  playsInSilentModeIOS: true,
                  staysActiveInBackground: false,
                });
                log("Audio mode set for TTS playback");
              } catch (modeErr) {
                log("Failed to set audio mode for playback:", modeErr);
              }
              
              const filename = `resi-reply-${Date.now()}.mp3`;
              const fileUri = FileSystem.cacheDirectory + filename;
              await FileSystem.writeAsStringAsync(fileUri, base64, {
                encoding: FileSystem.EncodingType.Base64,
              });
              log("TTS audio written to file:", fileUri);
              
              const { sound } = await Audio.Sound.createAsync(
                { uri: fileUri },
                { shouldPlay: true },
                (status) => {
                  log("TTS playback status:", status);
                  if (status.didJustFinish) {
                    log("TTS playback finished");
                    sound.unloadAsync().catch((e) => log("Failed to unload:", e));
                    // Clean up the temp audio file
                    try {
                      const file = FileSystem.getInfoAsync(fileUri);
                      if (file && file.exists) {
                        FileSystem.deleteAsync(fileUri).catch((e) => log("Failed to delete:", e));
                      }
                    } catch (e) {
                      log("Failed to clean up audio file:", e);
                    }
                    setSpeakingMessageId(null);
                  }
                  if (status.error) {
                    log("TTS playback error:", status.error);
                    setSpeakingMessageId(null);
                  }
                }
              );
              log("TTS audio playback started on native");
            }
          } catch (playbackError) {
            console.warn("Failed to play audio response", playbackError);
            setError("Audio playback failed. Try again or check your device.");
            setSpeakingMessageId(null);
          }
        } else {
          log("No audio data returned from backend");
          setSpeakingMessageId(null);
        }
      } catch (err) {
        setError("Upload failed. Try again.");
        console.error("Transcription failed", err);
        setSpeakingMessageId(null);
      } finally {
        setIsProcessing(false);
        setIsRecording(false);
        // Clean up temp recording file
        if (uri && Platform.OS !== "web") {
          try {
            await FileSystem.deleteAsync(uri);
          } catch (cleanupErr) {
            log("Failed to delete temp recording", cleanupErr);
          }
        }
      }
    },
    [messages, updateConversationState, user]
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

  const handleLogout = async () => {
    log("Signing out user from ChatScreen");
    const newConversationId = `conv-${Date.now()}`;
    conversationIdRef.current = newConversationId;
    updateConversationState({ messages: [], conversationId: newConversationId });
    setSpeakingMessageId(null);
    await logout();
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
    updateConversationState({ messages: [], conversationId: newConversationId });
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
        <Text style={styles.headerTitle}>Resi Voice</Text>
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
          <Text style={styles.chatKicker}>Start a voice report</Text>
          <Text style={styles.chatHeadline}>
            Speak naturally—Resi will triage it for you
          </Text>
          <Text style={styles.chatSubhead}>
            Tap record, describe the issue, and our assistant routes it to the
            right campus team instantly.
          </Text>
        </View>

        <View style={styles.chatSurface}>
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>
                Tap the microphone below to start a voice report for your hall.
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
            ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <View style={styles.actions}>
          <View style={styles.recordGlowWrapper}>
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
              <AnimatedLinearGradient
                colors={buttonGradientColors}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                pointerEvents="none"
                style={[
                  styles.buttonGradient,
                  {
                    opacity: buttonGradientOpacity,
                    transform: [
                      {
                        translateX: buttonGradientTranslate,
                      },
                    ],
                  },
                ]}
              />
              <Text style={styles.recordButtonText}>
                {isRecording ? "Stop & Submit" : "Start Voice Report"}
              </Text>
            </TouchableOpacity>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.recordGlowHalo,
                {
                  opacity: haloOpacity,
                  transform: [
                    {
                      scale: haloScale,
                    },
                  ],
                },
              ]}
            >
            </Animated.View>
          </View>
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
    right: -160,
    height: 420,
    opacity: 0.3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  headerButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: "rgba(127,92,255,0.18)",
  },
  headerButtonText: {
    color: colors.primary,
    fontWeight: "600",
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
    backgroundColor: "rgba(8,12,26,0.82)",
  },
  headerButtonDarkText: {
    color: colors.text,
    fontWeight: "600",
  },
  container: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 36,
    gap: 24,
  },
  chatIntro: {
    gap: 12,
  },
  chatKicker: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent,
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
    padding: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(127,92,255,0.18)",
    ...shadows.card,
  },
  chatList: {
    paddingVertical: 12,
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
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 280,
  },
  actions: {
    alignItems: "center",
    gap: 12,
  },
  recordGlowWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  recordButton: {
    position: "relative",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
    backgroundColor: colors.primaryDark,
    overflow: "hidden",
    ...shadows.card,
    shadowColor: "rgba(18, 20, 40, 0.55)",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 26,
  },
  recordButtonActive: {
    shadowColor: "rgba(124,58,237,0.6)",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 34,
  },
  recordGlowHalo: {
    position: "absolute",
    top: -6,
    bottom: -6,
    left: -12,
    right: -12,
    borderRadius: 999,
    backgroundColor: "rgba(123, 97, 255, 0.18)",
    shadowColor: "rgba(139,92,246,0.6)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 28,
  },
  buttonGradient: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "-50%",
    width: "200%",
  },
  recordButtonText: {
    color: "#F8FAFF",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.3,
    textShadowColor: "rgba(10,12,24,0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
  },
});

export default ChatScreen;
