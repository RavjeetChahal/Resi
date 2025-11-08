import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { ChatBubble } from '../components/ChatBubble';
import { MicButton } from '../components/MicButton';
import { colors } from '../theme/colors';
import { mockConversation } from '../assets/data/issues';
import { useAuth } from '../context/AuthContext';
import { transcribeAudio } from '../services/api';

const HomeScreen = ({ navigation }) => {
  const [messages, setMessages] = useState(mockConversation);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const recordingRef = useRef(null);
  const { resetRole } = useAuth();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      setPermissionGranted(granted);
      if (!granted) {
        Alert.alert('Microphone access needed', 'Please enable microphone permissions to record voice reports.');
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
    if (!recording) {
      return null;
    }

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
      console.error('Failed to stop recording', err);
      recordingRef.current = null;
      return null;
    }
  }, []);

  const startRecordingAsync = useCallback(async () => {
    if (permissionGranted === false) {
      Alert.alert('Microphone blocked', 'Enable microphone access in settings to submit voice reports.');
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
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      setTranscript('');
    } catch (err) {
      console.error('Failed to start recording', err);
      setError('Unable to access microphone. Please try again.');
    }
  }, [permissionGranted]);

  const handleTranscription = useCallback(
    async (uri) => {
      if (!uri) return;
      setIsProcessing(true);
      try {
        const response = await transcribeAudio({ uri });
        const transcriptText = response?.transcript ?? '';

        if (!transcriptText) {
          setError('No speech detected. Try speaking closer to your device.');
          return;
        }

        setTranscript(transcriptText);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${prev.length + 1}`,
            sender: 'Resident',
            text: transcriptText,
            timestamp: Date.now(),
          },
          {
            id: `msg-${prev.length + 2}`,
            sender: 'MoveMate',
            text:
              response?.reply ||
              'Thanks! I’m routing this to the right team and will update you once it’s picked up.',
            timestamp: Date.now(),
          },
        ]);
      } catch (err) {
        console.error('Transcription failed', err);
        setError('Upload failed. Check your connection and try again.');
      } finally {
        setIsProcessing(false);
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch (cleanupError) {
          console.warn('Failed to delete temp recording', cleanupError);
        }
      }
    },
    [setMessages],
  );

  const handleMicPress = useCallback(async () => {
    if (isProcessing) {
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      const uri = await stopRecordingAsync();
      await handleTranscription(uri);
    } else {
      await startRecordingAsync();
    }
  }, [handleTranscription, isProcessing, isRecording, startRecordingAsync, stopRecordingAsync]);

  const handleLogout = () => {
    resetRole();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{greeting}</Text>
            <Text style={styles.title}>Let’s get that fixed</Text>
            <Text style={styles.subtitle}>Use your voice to tell MoveMate what’s going on.</Text>
            <TouchableOpacity style={styles.dashboardLink} onPress={() => navigation.navigate('Dashboard')}>
              <Text style={styles.dashboardLinkText}>Preview worker dashboard →</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble sender={item.sender} text={item.text} />}
          contentContainerStyle={styles.chatList}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.transcriptContainer}>
          <Text style={styles.transcriptLabel}>Latest transcript</Text>
          <Text style={styles.transcriptText}>
            {transcript || 'Tap the mic to start a new report and see the text live.'}
          </Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <View style={styles.footer}>
          <MicButton
            isRecording={isRecording}
            isProcessing={isProcessing}
            onPress={handleMicPress}
            label={isRecording ? 'Tap again to submit your report' : 'Tap to record your voice note'}
          />
        </View>
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
    fontWeight: '600',
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
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
    fontWeight: '600',
    color: colors.primary,
  },
  logoutButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFFAA',
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
    fontWeight: '700',
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

