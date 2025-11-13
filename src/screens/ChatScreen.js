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
import vapiCallManager from "../services/vapi";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, shadows } from "../theme/colors";
import { ChatBubble } from "../components/ChatBubble";

const ChatScreen = ({ navigation }) => {
  const { conversationState, updateConversationState } = useConversation();
  const { user, logout } = useAuth();
  const messages = conversationState.messages || [];
  const [isCallActive, setIsCallActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [vapiCallId, setVapiCallId] = useState(null);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const vapiCallRef = useRef(null);
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
      toValue: isCallActive ? 1 : 0,
      duration: isCallActive ? 260 : 420,
      easing: isCallActive ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isCallActive, recordIntensity]);

  // Cleanup Vapi call on unmount
  useEffect(() => {
    return () => {
      if (vapiCallRef.current) {
        vapiCallManager.endCall().catch(console.error);
      }
    };
  }, []);

  // Permission check for microphone (still needed for Vapi)
  useEffect(() => {
    log("Checking microphone permissions for", Platform.OS);

    if (Platform.OS === "web") {
      if (
        !navigator?.mediaDevices?.getUserMedia ||
        typeof window.WebSocket === "undefined"
      ) {
        setPermissionGranted(false);
        setError(
          "This browser does not support real-time voice calls. Try a different browser or the mobile app."
        );
        log("WebSocket or getUserMedia not supported in this browser");
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
  }, []);


  // Vapi call management
  const startVapiCall = useCallback(async () => {
    try {
      setIsCallActive(true);
      setError(null);
      setIsProcessing(true);

      // Set up event handlers
      vapiCallManager.setOnTranscript((message) => {
        console.log("[ChatScreen] Transcript:", message);
        
        // Add transcript to messages
        if (message.role === "user" || message.role === "user-interim") {
          const userMessage = {
            id: `msg-${Date.now()}-${Math.random()}`,
            sender: "Resident",
            text: message.transcript || message.text || "",
            timestamp: Date.now(),
          };
          
          // Only add if it's a final transcript (not interim)
          if (message.role === "user" && message.transcript) {
            updateConversationState({
              messages: [...messages, userMessage],
            });
          }
        } else if (message.role === "assistant" || message.role === "assistant-interim") {
          const aiMessage = {
            id: `msg-${Date.now()}-${Math.random()}`,
            sender: "Resi",
            text: message.transcript || message.text || "",
            timestamp: Date.now(),
          };
          
          // Only add if it's a final transcript (not interim)
          if (message.role === "assistant" && message.transcript) {
            updateConversationState({
              messages: [...messages, aiMessage],
            });
            setSpeakingMessageId(aiMessage.id);
          }
        }
      });

      vapiCallManager.setOnStatusUpdate((message) => {
        console.log("[ChatScreen] Status update:", message);
        if (message.call?.status === "ended") {
          setIsCallActive(false);
          setIsProcessing(false);
          // Ticket creation is handled by webhook
        }
      });

      vapiCallManager.setOnError((error) => {
        console.error("[ChatScreen] Vapi error:", error);
        setError("Call failed. Please try again.");
        setIsCallActive(false);
        setIsProcessing(false);
      });

      vapiCallManager.setOnEnd(() => {
        console.log("[ChatScreen] Call ended");
        setIsCallActive(false);
        setIsProcessing(false);
        setVapiCallId(null);
        setSpeakingMessageId(null);
        vapiCallRef.current = null;
      });

      // Get assistant ID from environment or use default
      const assistantId = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID || "";

      if (!assistantId) {
        throw new Error("VAPI_ASSISTANT_ID not configured");
      }

      // Create call
      const callData = await vapiCallManager.createCall(
        assistantId,
        user?.uid,
        conversationIdRef.current
      );

      setVapiCallId(callData.callId);
      vapiCallRef.current = callData;
      setIsProcessing(false);

      log("Vapi call started:", callData.callId);
    } catch (error) {
      console.error("[ChatScreen] Failed to start Vapi call:", error);
      setError(error.message || "Failed to start call. Please try again.");
      setIsCallActive(false);
      setIsProcessing(false);
    }
  }, [messages, updateConversationState, user]);

  const endVapiCall = useCallback(async () => {
    try {
      setIsProcessing(true);
      await vapiCallManager.endCall();
      setIsCallActive(false);
      setVapiCallId(null);
      vapiCallRef.current = null;
      setIsProcessing(false);
      log("Vapi call ended");
    } catch (error) {
      console.error("[ChatScreen] Failed to end call:", error);
      setError("Failed to end call. Please try again.");
      setIsProcessing(false);
    }
  }, []);

  const handleMicPress = useCallback(async () => {
    log("Mic button pressed", {
      isProcessing,
      isCallActive,
      platform: Platform.OS,
    });

    if (isProcessing) {
      log("Ignoring mic press while processing");
      return;
    }

    if (isCallActive) {
      // End the call
      await endVapiCall();
    } else {
      // Start the call
      await startVapiCall();
    }
  }, [isCallActive, isProcessing, startVapiCall, endVapiCall]);

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
            <>
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
              {isCallActive && (
                <View style={styles.callStatus}>
                  <Text style={styles.callStatusText}>
                    🎤 Speaking with Resi...
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.actions}>
          <View style={styles.recordGlowWrapper}>
            <TouchableOpacity
              testID="mic-button"
              accessibilityLabel="Start voice recording"
              style={[
                styles.recordButton,
                isCallActive && styles.recordButtonActive,
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
                {isCallActive ? "End Call" : "Start Voice Report"}
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
  callStatus: {
    padding: 16,
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderRadius: 12,
    marginTop: 12,
  },
  callStatusText: {
    color: colors.primary,
    fontWeight: "600",
    textAlign: "center",
    fontSize: 14,
  },
});

export default ChatScreen;
