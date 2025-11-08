import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const mediaRecorderRef = useRef(null);
  const webStreamRef = useRef(null);
  const webChunksRef = useRef([]);
  const { resetRole } = useAuth();

  const log = (...args) => console.log('[Voice]', ...args);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  useEffect(() => {
    log('Initializing microphone permissions for', Platform.OS);

    if (Platform.OS === 'web') {
      if (!navigator?.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
        setPermissionGranted(false);
        setError('This browser does not support in-browser voice recording. Try a different browser or the mobile app.');
        log('MediaRecorder not supported in this browser');
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
          setPermissionGranted(true);
          log('Web microphone permission granted');
        })
        .catch(() => {
          setPermissionGranted(false);
          setError('Microphone access blocked. Check browser permissions and reload.');
          log('Web microphone permission denied');
        });
      return;
    }

    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      setPermissionGranted(granted);
      if (!granted) {
        Alert.alert('Microphone access needed', 'Please enable microphone permissions to record voice reports.');
        log('Native microphone permission denied');
      } else {
        log('Native microphone permission granted');
      }
    })();

    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
      }
      if (recordingRef.current) {
        log('Cleaned up native recording instance');
      }
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop();
          log('Stopped active web recorder during cleanup');
        } catch (err) {
          // ignore
        }
      }
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach((track) => track.stop());
        webStreamRef.current = null;
        log('Closed web media stream during cleanup');
      }
    };
  }, []);

  const stopRecordingAsync = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      log('stopRecordingAsync called but no recording instance found');
      return null;
    }

    try {
      log('Stopping native recording…');
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      log('Native recording stopped. File saved at', uri);
      return uri;
    } catch (err) {
      console.error('Failed to stop recording', err);
      recordingRef.current = null;
      log('Native recording stop failed', err);
      return null;
    }
  }, []);

  const stopWebRecordingAsync = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = webStreamRef.current;
    if (!recorder) {
      log('stopWebRecordingAsync called with no active recorder');
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        try {
          const blob = new Blob(webChunksRef.current, { type: 'audio/webm' });
          webChunksRef.current = [];
          mediaRecorderRef.current = null;
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            webStreamRef.current = null;
          }
          const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
          log('Web recording stopped. Blob assembled', { size: blob.size, type: blob.type });
          resolve(file);
        } catch (err) {
          log('Failed to assemble web recording blob', err);
          reject(err);
        }
      };

      try {
        log('Stopping web MediaRecorder…');
        recorder.stop();
      } catch (err) {
        log('Stopping MediaRecorder failed', err);
        reject(err);
      }
    });
  }, []);

  const startRecordingAsync = useCallback(async () => {
    if (permissionGranted === false) {
      Alert.alert('Microphone blocked', 'Enable microphone access in settings to submit voice reports.');
      log('Attempted to start native recording without permission');
      return;
    }

    setError(null);
    try {
      log('Configuring Audio mode for native recording…');
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
      log('Native recording started');
    } catch (err) {
      console.error('Failed to start recording', err);
      setError('Unable to access microphone. Please try again.');
      log('Native recording failed to start', err);
    }
  }, [permissionGranted]);

  const startWebRecordingAsync = useCallback(async () => {
    if (permissionGranted === false) {
      setError('Microphone access blocked in browser settings.');
      log('Attempted to start web recording without permission');
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setError('Browser does not support voice recording. Try the mobile app instead.');
      log('Web recording attempted without MediaRecorder support');
      return;
    }

    setError(null);
    try {
      log('Requesting browser audio stream…');
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
      setTranscript('');
      log('Web recording started', { mimeType: recorder.mimeType });
    } catch (err) {
      console.error('Failed to start web recording', err);
      setError('Unable to access microphone. Check browser permissions.');
      log('Web recording failed to start', err);
    }
  }, [permissionGranted]);

  const handleTranscription = useCallback(
    async ({ uri, file }) => {
      if (!uri && !file) {
        log('handleTranscription called with no recording payload');
        return;
      }
      log('Submitting recording for transcription', uri ? { uri } : { file });
      setIsProcessing(true);
      try {
        const response = await transcribeAudio({ uri, file });
        const transcriptText = response?.transcript ?? '';

        if (!transcriptText) {
          setError('No speech detected. Try speaking closer to your device.');
          log('Transcription returned empty text');
          return;
        }

        setTranscript(transcriptText);
        log('Transcription succeeded', { transcript: transcriptText });
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
        log('Transcription request errored', err);
      } finally {
        setIsProcessing(false);
        try {
          if (uri && Platform.OS !== 'web') {
            await FileSystem.deleteAsync(uri, { idempotent: true });
          }
        } catch (cleanupError) {
          console.warn('Failed to delete temp recording', cleanupError);
          log('Temp recording cleanup failed', cleanupError);
        }
      }
    },
    [setMessages],
  );

  const handleMicPress = useCallback(async () => {
    log('Mic button pressed', { isProcessing, isRecording, platform: Platform.OS });

    if (isProcessing) {
      log('Ignoring mic press while processing');
      return;
    }

    if (Platform.OS === 'web') {
      if (isRecording) {
        setIsRecording(false);
        try {
          const file = await stopWebRecordingAsync();
          await handleTranscription({ file });
        } catch (err) {
          console.error('Failed to stop web recording', err);
          setError('Recording failed. Please try again.');
          log('Web recording stop failed', err);
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
    log('Signing out user');
    resetRole();
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

