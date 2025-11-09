import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { useConversation } from "../context/ConversationContext";
import { useAuth } from "../context/AuthContext";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { transcribeAudio } from "../services/api";
import { colors } from "../theme/colors";
import { ChatBubble } from "../components/ChatBubble";
import { getFirebaseDatabase } from "../services/firebase";
import { ref, push } from "firebase/database";

const ChatScreen = ({ navigation }) => {
  const { conversationState, updateConversationState } = useConversation();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState("");
  const recordingRef = useRef(null);
  const conversationIdRef = useRef(
    conversationState.conversationId || `conv-${Date.now()}`
  );

  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      setPermissionGranted(granted);
      if (!granted) {
        setError("Microphone access needed. Please enable permissions.");
      }
    })();
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, []);

  const stopRecordingAsync = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return null;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      return uri;
    } catch (err) {
      recordingRef.current = null;
      return null;
    }
  }, []);

  const startRecordingAsync = useCallback(async () => {
    if (permissionGranted === false) {
      setError("Microphone blocked. Enable access in settings.");
      return;
    }
    setError(null);
    try {
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
    } catch (err) {
      setError("Unable to access microphone. Please try again.");
    }
  }, [permissionGranted]);

  const handleTranscription = useCallback(async (uri) => {
    if (!uri) {
      setIsProcessing(false);
      setIsRecording(false);
      return;
    }
    setIsProcessing(true);
    let transcriptText = "";
    try {
      const response = await transcribeAudio({
        uri,
        conversationId: conversationIdRef.current,
      });
      transcriptText = response?.transcript ?? "";
      if (!transcriptText) {
        setError("No speech detected. Try again.");
        setIsProcessing(false);
        setIsRecording(false);
        return;
      }
      setTranscript(transcriptText);
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
          text: response?.reply || "Thanks! We'll get back to you soon.",
          timestamp: Date.now(),
        },
      ]);
      // Store ticket in Firebase if backend returned structured classification
      if (response?.classification && user) {
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
          }
        } catch (dbErr) {
          // non-fatal
        }
      }
    } catch (err) {
      setError("Upload failed. Try again.");
    } finally {
      setIsProcessing(false);
      setIsRecording(false);
      try {
        if (uri) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      } catch {}
    }
  }, []);

  const handleMicPress = useCallback(async () => {
    if (isProcessing) return;
    if (isRecording) {
      setIsRecording(false);
      const uri = await stopRecordingAsync();
      await handleTranscription(uri);
    } else {
      await startRecordingAsync();
    }
  }, [
    isProcessing,
    isRecording,
    startRecordingAsync,
    stopRecordingAsync,
    handleTranscription,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Back to Home"
          testID="back-from-chat"
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>{"< Back"}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Chat</Text>
      </View>
      <View style={styles.container}>
        {messages.length === 0 ? (
          <Text style={styles.emptyText}>
            No messages yet. Start a conversation!
          </Text>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id?.toString()}
            renderItem={({ item }) => <ChatBubble {...item} />}
            contentContainerStyle={styles.chatList}
          />
        )}
        <View style={{ marginTop: 24 }}>
          <TouchableOpacity
            testID="mic-button"
            accessibilityLabel="Start voice recording"
            style={{
              backgroundColor: isRecording ? colors.danger : colors.primary,
              borderRadius: 999,
              paddingVertical: 16,
              paddingHorizontal: 32,
              alignItems: "center",
              alignSelf: "center",
              opacity: isProcessing ? 0.6 : 1,
            }}
            onPress={handleMicPress}
            disabled={isProcessing}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              {isRecording ? "Stop & Submit" : "Start Voice Report"}
            </Text>
          </TouchableOpacity>
          {error ? (
            <Text
              style={{
                color: colors.danger,
                marginTop: 12,
                textAlign: "center",
              }}
            >
              {error}
            </Text>
          ) : null}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  backButton: {
    marginRight: 12,
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backText: {
    color: colors.primary,
    fontWeight: "600",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
  },
  container: {
    flex: 1,
    padding: 24,
  },
  chatList: {
    flexGrow: 1,
    marginBottom: 16,
  },
  emptyText: {
    textAlign: "center",
    color: colors.muted,
    marginTop: 32,
  },
});

export default ChatScreen;
