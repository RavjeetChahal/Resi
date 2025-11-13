// src/services/vapi.js
import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

// Use the same API URL logic as api.js
const getDefaultApiUrl = () => {
  const PRODUCTION_API = "https://resi-7125.onrender.com";
  const USE_LOCAL_SERVER = false;

  if (USE_LOCAL_SERVER) {
    if (Platform.OS === "ios") {
      const debuggerHost = Constants.expoConfig?.hostUri?.split(":").shift();
      if (debuggerHost && debuggerHost !== "localhost") {
        return `http://${debuggerHost}:3000`;
      }
      return "http://localhost:3000";
    }
    if (Platform.OS === "android") {
      const debuggerHost = Constants.expoConfig?.hostUri?.split(":").shift();
      if (
        debuggerHost &&
        debuggerHost !== "localhost" &&
        debuggerHost !== "10.0.2.2"
      ) {
        return `http://${debuggerHost}:3000`;
      }
      return "http://10.0.2.2:3000";
    }
  } else {
    if (Platform.OS === "ios" || Platform.OS === "android") {
      return PRODUCTION_API;
    }
  }

  // For web, use EXPO_PUBLIC_API_BASE_URL if set, otherwise localhost:3000
  if (Platform.OS === "web") {
    if (process.env.EXPO_PUBLIC_API_BASE_URL) {
      return process.env.EXPO_PUBLIC_API_BASE_URL;
    }
    // Default to localhost:3000 for web development
    return "http://localhost:3000";
  }

  return USE_LOCAL_SERVER ? "http://localhost:3000" : PRODUCTION_API;
};

const DEFAULT_API_URL = getDefaultApiUrl();
let API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_URL;

// Remove trailing slash
API_BASE_URL = API_BASE_URL.replace(/\/$/, "");

console.log("[Vapi] API Base URL:", API_BASE_URL);

class VapiCallManager {
  constructor() {
    this.transportWs = null;
    this.listenWs = null;
    this.callId = null;
    this.isConnected = false;
    this.audioContext = null;
    this.mediaStream = null;
    this.audioProcessor = null;
    this.recording = null;
    this.sound = null;
    this.onMessage = null;
    this.onTranscript = null;
    this.onStatusUpdate = null;
    this.onError = null;
    this.onEnd = null;
    this.audioChunks = [];
    this.playbackAudioContext = null;
    this.audioPlaybackQueue = [];
    this.isSchedulingAudio = false;
    this.nextScheduledTime = null;
    // Jitter buffer for smooth playback
    this.jitterBuffer = null;
    this.jitterBufferSize = 0;
    this.isPlaying = false;
    this.playbackNode = null;
    this.audioSourceNode = null;
    this.bufferThreshold = 0.03; // 30ms buffer before starting playback (very low latency)
    this.maxBufferSize = 0.2; // 200ms max buffer (prevents excessive delay)
    this.minBufferSize = 0.01; // 10ms minimum buffer to prevent underruns
  }

  async createCall(assistantId, userId, conversationId) {
    try {
      console.log("[Vapi] Creating call...", {
        apiBaseUrl: API_BASE_URL,
        assistantId,
        userId,
        conversationId,
        fullUrl: `${API_BASE_URL}/api/vapi/create-call`,
      });

      const response = await axios.post(
        `${API_BASE_URL}/api/vapi/create-call`,
        {
          assistantId,
          userId,
          conversationId,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 second timeout
        }
      );

      console.log("[Vapi] Server response status:", response.status);
      console.log(
        "[Vapi] Server response data:",
        JSON.stringify(response.data, null, 2)
      );

      // Check if response has data
      if (!response.data) {
        console.error("[Vapi] Server response has no data:", response);
        throw new Error("Server returned empty response");
      }

      this.callId = response.data.callId;
      const transportUrl = response.data.transportUrl;
      const listenUrl = response.data.listenUrl;

      console.log("[Vapi] Extracted values:", {
        callId: this.callId,
        transportUrl,
        listenUrl,
        hasCallId: !!this.callId,
        hasTransportUrl: !!transportUrl,
        hasListenUrl: !!listenUrl,
      });

      if (!this.callId || !transportUrl) {
        console.error(
          "[Vapi] Missing required fields in server response:",
          response.data
        );
        console.error("[Vapi] Response structure:", {
          keys: Object.keys(response.data || {}),
          data: response.data,
        });
        throw new Error(
          `Missing required fields: callId=${!!this
            .callId}, transportUrl=${!!transportUrl}`
        );
      }

      console.log("[Vapi] Call created:", this.callId);

      // Connect to WebSockets
      await this.connectWebSockets(transportUrl, listenUrl);

      return {
        callId: this.callId,
        transportUrl,
        listenUrl,
      };
    } catch (error) {
      console.error("[Vapi] Failed to create call:", error);
      console.error("[Vapi] Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
      });
      throw error;
    }
  }

  async connectWebSockets(transportUrl, listenUrl) {
    return new Promise((resolve, reject) => {
      try {
        // For web, use native WebSocket
        // For React Native, WebSocket is available globally
        const WebSocketClass =
          Platform.OS === "web"
            ? window.WebSocket
            : WebSocket || require("react-native").WebSocket;

        if (!WebSocketClass) {
          throw new Error("WebSocket is not available");
        }

        // Vapi uses a single bidirectional WebSocket
        // Use transportUrl (listenUrl is the same for vapi.websocket)
        const wsUrl = transportUrl || listenUrl;

        if (!wsUrl) {
          throw new Error("WebSocket URL is required");
        }

        console.log("[Vapi] Connecting to WebSocket:", wsUrl);

        // Create single bidirectional WebSocket connection
        this.transportWs = new WebSocketClass(wsUrl);
        this.listenWs = this.transportWs; // Same connection for both

        this.transportWs.onopen = () => {
          console.log("[Vapi] WebSocket connected");
          this.isConnected = true;
          this.startAudioCapture();
          resolve();
        };

        this.transportWs.onmessage = async (event) => {
          try {
            if (event.data instanceof ArrayBuffer) {
              // Binary audio data - process immediately (no delays)
              this.handleAudioData(event.data).catch((err) => {
                console.warn("[Vapi] Audio playback error (non-fatal):", err);
              });
            } else if (event.data instanceof Blob) {
              // Blob audio data - convert to ArrayBuffer first
              event.data.arrayBuffer().then((buffer) => {
                this.handleAudioData(buffer).catch((err) => {
                  console.warn("[Vapi] Audio playback error (non-fatal):", err);
                });
              });
            } else if (typeof event.data === "string") {
              // Text message (status updates, transcripts, etc.)
              try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
              } catch (e) {
                // Not JSON - might be plain text transcript
                console.log("[Vapi] Received text message:", event.data);
              }
            }
          } catch (error) {
            console.warn("[Vapi] Error handling WebSocket message:", error);
          }
        };

        this.transportWs.onerror = (error) => {
          console.error("[Vapi] WebSocket error:", error);
          this.onError?.(error);
          if (!this.isConnected) {
            reject(error);
          }
        };

        this.transportWs.onclose = () => {
          console.log("[Vapi] WebSocket closed");
          this.isConnected = false;
          this.stopAudioCapture();
          this.onEnd?.();
        };
      } catch (error) {
        console.error("[Vapi] Failed to connect WebSocket:", error);
        reject(error);
      }
    });
  }

  async startAudioCapture() {
    if (Platform.OS === "web") {
      await this.startWebAudioCapture();
    } else {
      await this.startNativeAudioCapture();
    }
  }

  async startWebAudioCapture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.mediaStream = stream;

      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass({
        sampleRate: 16000,
        latencyHint: "interactive", // Low latency
      });

      // Resume audio context if suspended (browser autoplay policy)
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Try to use AudioWorklet (better performance), fallback to ScriptProcessor if not supported
      try {
        await this.setupAudioWorklet(stream);
      } catch (workletError) {
        console.warn(
          "[Vapi] AudioWorklet not supported, falling back to ScriptProcessor:",
          workletError
        );
        await this.setupScriptProcessor(stream);
      }

      console.log("[Vapi] Web audio capture started", {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state,
        processor: this.audioProcessor ? "AudioWorklet" : "ScriptProcessor",
      });
    } catch (error) {
      console.error("[Vapi] Failed to start web audio capture:", error);
      throw error;
    }
  }

  async setupAudioWorklet(stream) {
    // Create AudioWorklet processor code as a string
    // AudioWorklet runs on a dedicated audio thread for better performance
    const workletProcessorCode = `
      class VapiAudioProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (!input || input.length === 0 || input[0].length === 0) {
            return true; // Keep processor alive
          }
          
          const inputChannel = input[0];
          const frameCount = inputChannel.length;
          
          // Quick silence check (optimized)
          let hasAudio = false;
          let maxSample = 0;
          for (let i = 0; i < frameCount; i++) {
            const abs = Math.abs(inputChannel[i]);
            if (abs > 0.001) {
              hasAudio = true;
              if (abs > maxSample) maxSample = abs;
            }
          }
          
          // Only process and send non-silent audio (reduces overhead)
          if (hasAudio) {
            // Convert Float32 to Int16 PCM (optimized conversion)
            const int16Array = new Int16Array(frameCount);
            for (let i = 0; i < frameCount; i++) {
              // Clamp to [-1, 1] and convert to 16-bit signed integer
              const sample = inputChannel[i];
              const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
              // Convert to 16-bit signed integer (little-endian)
              int16Array[i] = clamped < 0
                ? Math.max(-32768, Math.floor(clamped * 32768))
                : Math.min(32767, Math.floor(clamped * 32767));
            }
            
            // Send audio data to main thread (transfer ownership for zero-copy)
            this.port.postMessage({
              type: 'audio',
              data: int16Array.buffer,
              frameCount: frameCount
            }, [int16Array.buffer]);
          }
          
          return true; // Keep processor alive
        }
      }

      registerProcessor('vapi-audio-processor', VapiAudioProcessor);
    `;

    // Create a blob URL from the worklet code
    const blob = new Blob([workletProcessorCode], {
      type: "application/javascript",
    });
    const workletUrl = URL.createObjectURL(blob);

    try {
      // Load the AudioWorklet processor
      await this.audioContext.audioWorklet.addModule(workletUrl);

      // Create the source
      const source = this.audioContext.createMediaStreamSource(stream);

      // Create AudioWorkletNode
      this.audioProcessor = new AudioWorkletNode(
        this.audioContext,
        "vapi-audio-processor"
      );

      // Handle messages from the worklet processor
      // AudioWorklet runs on a separate thread, so messages arrive asynchronously
      this.audioProcessor.port.onmessage = (event) => {
        if (
          event.data.type === "audio" &&
          this.isConnected &&
          this.transportWs
        ) {
          if (this.transportWs.readyState === WebSocket.OPEN) {
            try {
              const bufferedAmount = this.transportWs.bufferedAmount;

              // Aggressive sending for low latency - send immediately
              // Only drop if buffer is extremely full (network congestion)
              if (bufferedAmount > 262144) {
                // 256KB - buffer extremely full, likely network congestion
                // Drop chunk to prevent excessive lag
                if (Math.random() < 0.05) {
                  // Log occasionally
                  console.warn(
                    "[Vapi] Dropping audio chunk - network congestion:",
                    bufferedAmount,
                    "bytes"
                  );
                }
                return;
              } else {
                // Send immediately for lowest latency
                this.transportWs.send(event.data.data);
              }
            } catch (err) {
              console.error("[Vapi] Error sending audio:", err);
            }
          }
        }
      };

      // Connect source to processor
      source.connect(this.audioProcessor);

      // Don't connect processor output (prevents feedback)
      // AudioWorkletNode doesn't need to be connected to destination

      // Clean up blob URL
      URL.revokeObjectURL(workletUrl);

      console.log("[Vapi] AudioWorklet setup complete");
    } catch (error) {
      // Clean up blob URL on error
      URL.revokeObjectURL(workletUrl);
      throw error;
    }
  }

  async setupScriptProcessor(stream) {
    // Fallback to ScriptProcessorNode (deprecated but still works)
    const source = this.audioContext.createMediaStreamSource(stream);
    const bufferSize = 512; // Smaller buffer for lower latency
    const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!this.isConnected || !this.transportWs) return;
      if (this.transportWs.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const length = inputData.length;

      // Skip empty or silent chunks
      let maxSample = 0;
      for (let i = 0; i < length; i++) {
        maxSample = Math.max(maxSample, Math.abs(inputData[i]));
      }
      if (maxSample < 0.001) {
        return;
      }

      // Convert Float32Array to Int16Array (PCM)
      const pcmData = this.convertToPCM16(inputData);

      // Send immediately for lowest latency
      try {
        const bufferedAmount = this.transportWs.bufferedAmount;
        if (bufferedAmount > 262144) {
          // 256KB - buffer extremely full, drop chunk
          if (Math.random() < 0.05) {
            console.warn(
              "[Vapi] Dropping audio chunk - network congestion:",
              bufferedAmount
            );
          }
          return;
        } else {
          // Send immediately
          this.transportWs.send(pcmData.buffer);
        }
      } catch (err) {
        console.error("[Vapi] Error sending audio:", err);
      }
    };

    source.connect(processor);
    // Don't connect processor to destination (prevents feedback)
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0; // Mute to prevent feedback
    processor.connect(gainNode);
    this.audioProcessor = processor;

    console.log("[Vapi] ScriptProcessor fallback setup complete");
  }

  async startNativeAudioCapture() {
    try {
      // Request permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        throw new Error("Audio recording permission not granted");
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Create recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        sampleRate: 16000,
        numberOfChannels: 1,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      });

      await recording.startAsync();
      this.recording = recording;

      // Start streaming audio chunks
      this.startNativeAudioStreaming();

      console.log("[Vapi] Native audio capture started");
    } catch (error) {
      console.error("[Vapi] Failed to start native audio capture:", error);
      throw error;
    }
  }

  async startNativeAudioStreaming() {
    // For React Native, we need to read audio data from the recording
    // This is a simplified implementation - you may need to adjust based on expo-av capabilities
    // In production, you might want to use a different library for real-time audio streaming

    // Polling approach: read audio data periodically
    this.audioStreamInterval = setInterval(async () => {
      if (!this.recording || !this.isConnected || !this.transportWs) return;

      try {
        // Note: expo-av doesn't provide direct access to raw audio data
        // For a production implementation, consider using:
        // - react-native-audio-recorder-player
        // - @react-native-community/audio-toolkit
        // - Or a native module for real-time audio streaming

        // For now, we'll use a workaround: record in chunks and send them
        // This is not ideal for real-time, but works as a starting point
        console.warn(
          "[Vapi] Native real-time audio streaming needs native module support"
        );
      } catch (error) {
        console.error("[Vapi] Error streaming audio:", error);
      }
    }, 100); // Poll every 100ms
  }

  convertToPCM16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp and convert to 16-bit PCM (little-endian)
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to signed 16-bit integer
      int16Array[i] =
        sample < 0
          ? Math.max(-32768, Math.floor(sample * 32768))
          : Math.min(32767, Math.floor(sample * 32767));
    }
    return int16Array;
  }

  async handleAudioData(audioData) {
    // Play received audio
    if (Platform.OS === "web") {
      await this.playWebAudio(audioData);
    } else {
      await this.playNativeAudio(audioData);
    }
  }

  async playWebAudio(audioData) {
    try {
      // Convert PCM to AudioBuffer and add to jitter buffer
      const arrayBuffer =
        audioData instanceof Blob ? await audioData.arrayBuffer() : audioData;

      // Initialize playback audio context if needed
      if (!this.playbackAudioContext) {
        await this.initializePlaybackContext();
      }

      const audioContext = this.playbackAudioContext;

      // Ensure audio context is running
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const int16Array = new Int16Array(arrayBuffer);
      const length = int16Array.length;

      if (length === 0) return; // Skip empty chunks

      // Convert PCM16 to Float32
      const float32Array = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        float32Array[i] = Math.max(-1, Math.min(1, int16Array[i] / 32768.0));
      }

      // Add to jitter buffer
      this.addToJitterBuffer(float32Array);

      // Start or resume continuous playback if buffer is ready
      if (!this.isPlaying) {
        // Start playback if buffer has enough data
        if (this.jitterBufferSize >= this.bufferThreshold) {
          this.startContinuousPlayback();
        }
      } else {
        // Playback is active - resume if it was paused due to empty buffer
        if (this.jitterBufferSize >= this.minBufferSize) {
          // Buffer has data again - ensure playback is running
          this.resumePlaybackIfReady();
        }
      }
    } catch (error) {
      console.error("[Vapi] Failed to play web audio:", error);
      // Don't throw - just log, so audio playback errors don't break the call
    }
  }

  async initializePlaybackContext() {
    this.playbackAudioContext = new (window.AudioContext ||
      window.webkitAudioContext)({
      sampleRate: 16000,
      latencyHint: "interactive", // Low latency
    });

    // Resume if suspended (browser autoplay policy)
    if (this.playbackAudioContext.state === "suspended") {
      await this.playbackAudioContext.resume();
    }

    // Initialize jitter buffer
    this.jitterBuffer = [];
    this.jitterBufferSize = 0;
    this.isPlaying = false;
    this.playbackNode = null;
    this.audioSourceNode = null;

    console.log("[Vapi] Playback context initialized", {
      sampleRate: this.playbackAudioContext.sampleRate,
      state: this.playbackAudioContext.state,
    });
  }

  addToJitterBuffer(float32Array) {
    if (!this.jitterBuffer) {
      this.jitterBuffer = [];
      this.jitterBufferSize = 0;
    }

    // Add chunk to buffer
    this.jitterBuffer.push(float32Array);

    // Calculate buffer size in seconds
    const chunkDuration = float32Array.length / 16000;
    this.jitterBufferSize += chunkDuration;

    // Limit buffer size to prevent memory buildup
    if (this.jitterBufferSize > this.maxBufferSize) {
      // Remove oldest chunks
      while (
        this.jitterBufferSize > this.maxBufferSize &&
        this.jitterBuffer.length > 0
      ) {
        const removed = this.jitterBuffer.shift();
        this.jitterBufferSize -= removed.length / 16000;
      }

      if (Math.random() < 0.01) {
        // Log occasionally
        console.warn("[Vapi] Jitter buffer full, dropping chunks");
      }
    }
  }

  startContinuousPlayback() {
    if (this.isPlaying || !this.playbackAudioContext) {
      // If already playing, don't create a new processor
      if (this.isPlaying && this.playbackNode) {
        return;
      }
    }

    // Disconnect existing processor if any
    if (this.playbackNode) {
      try {
        this.playbackNode.disconnect();
      } catch (e) {
        // Ignore errors
      }
      this.playbackNode = null;
    }

    this.isPlaying = true;
    console.log("[Vapi] Starting continuous playback", {
      bufferSize: this.jitterBufferSize.toFixed(3) + "s",
      chunks: this.jitterBuffer.length,
    });

    // Use ScriptProcessorNode for continuous playback
    // This allows us to pull from the buffer continuously
    // Smaller buffer size for lower latency (but smoother with jitter buffer)
    const bufferSize = 2048; // 2048 samples = ~128ms at 16kHz
    const processor = this.playbackAudioContext.createScriptProcessor(
      bufferSize,
      0, // No input channels
      1 // One output channel
    );

    processor.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      const outputLength = output.length;

      // Always output something - don't pause playback
      // If buffer is empty, output silence temporarily
      if (!this.jitterBuffer || this.jitterBuffer.length === 0) {
        // Buffer empty - output silence but keep playing
        output.fill(0);

        // Mark as not playing if buffer is completely empty for too long
        if (this.jitterBufferSize < 0.001) {
          // Buffer completely empty - will resume when audio arrives
          this.isPlaying = false;
        }
        return;
      }

      // Ensure playback is active if buffer has data
      if (!this.isPlaying && this.jitterBufferSize >= this.minBufferSize) {
        this.isPlaying = true;
      }

      // Fill output buffer from jitter buffer
      let outputIndex = 0;

      // Fill output buffer from jitter buffer
      while (
        outputIndex < outputLength &&
        this.jitterBuffer &&
        this.jitterBuffer.length > 0
      ) {
        const chunk = this.jitterBuffer[0];
        if (!chunk || chunk.length === 0) {
          // Empty chunk - remove it
          this.jitterBuffer.shift();
          continue;
        }

        const chunkLength = chunk.length;
        const remaining = outputLength - outputIndex;
        const toCopy = Math.min(remaining, chunkLength);

        // Copy audio data efficiently
        output.set(chunk.subarray(0, toCopy), outputIndex);

        outputIndex += toCopy;

        // Remove used portion from chunk
        if (toCopy === chunkLength) {
          // Entire chunk used - remove it
          this.jitterBuffer.shift();
          this.jitterBufferSize -= chunkLength / 16000;
        } else {
          // Partial chunk used - keep remaining portion
          this.jitterBuffer[0] = chunk.subarray(toCopy);
          this.jitterBufferSize -= toCopy / 16000;
        }
      }

      // Fill remaining with silence if buffer is empty
      if (outputIndex < outputLength) {
        output.fill(0, outputIndex);
      }

      // Monitor buffer health (but don't pause aggressively)
      if (
        this.jitterBufferSize < this.minBufferSize &&
        this.jitterBuffer &&
        this.jitterBuffer.length === 0
      ) {
        // Buffer completely empty - mark as not playing
        // Playback will resume automatically when new audio arrives
        this.isPlaying = false;
      }
    };

    // Connect processor to destination
    processor.connect(this.playbackAudioContext.destination);
    this.playbackNode = processor;

    console.log("[Vapi] Continuous playback started");
  }

  // Resume playback if paused and buffer has enough data
  resumePlaybackIfReady() {
    if (!this.isPlaying && this.jitterBuffer && this.jitterBuffer.length > 0) {
      // Resume if buffer has minimum required data
      if (this.jitterBufferSize >= this.minBufferSize) {
        // Restart playback if node was disconnected
        if (
          !this.playbackNode ||
          this.playbackNode.context.state === "closed"
        ) {
          this.startContinuousPlayback();
        } else {
          // Just mark as playing - the processor will continue
          this.isPlaying = true;
        }
      }
    }
  }

  async playNativeAudio(audioData) {
    try {
      // Convert audio data to a playable format
      const arrayBuffer =
        audioData instanceof Blob ? await audioData.arrayBuffer() : audioData;

      // Save to temporary file
      const filename = `vapi-audio-${Date.now()}.pcm`;
      const fileUri = FileSystem.cacheDirectory + filename;

      // Write PCM data to file
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // Create and play sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true }
      );

      this.sound = sound;

      // Clean up after playback
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(console.error);
          FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(
            console.error
          );
          this.sound = null;
        }
      });
    } catch (error) {
      console.error("[Vapi] Failed to play native audio:", error);
    }
  }

  handleMessage(message) {
    console.log("[Vapi] Received message:", message);

    switch (message.type) {
      case "transcript":
        this.onTranscript?.(message);
        break;
      case "status-update":
        this.onStatusUpdate?.(message);
        break;
      default:
        this.onMessage?.(message);
    }
  }

  stopAudioCapture() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      this.mediaStream = null;
    }
    if (this.audioProcessor) {
      try {
        // Handle both AudioWorkletNode and ScriptProcessorNode
        if (this.audioProcessor.port) {
          // AudioWorkletNode - close port and disconnect
          this.audioProcessor.port.close();
        }
        this.audioProcessor.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.audioProcessor = null;
    }
    // Don't close audio context - reuse it for better performance
    // Only close if we're ending the call completely
    if (this.recording) {
      this.recording.stopAndUnloadAsync().catch(console.error);
      this.recording = null;
    }
    if (this.audioStreamInterval) {
      clearInterval(this.audioStreamInterval);
      this.audioStreamInterval = null;
    }
  }

  async endCall() {
    console.log("[Vapi] Ending call...");

    this.stopAudioCapture();

    if (this.sound) {
      await this.sound.unloadAsync().catch(console.error);
      this.sound = null;
    }

    // Close WebSocket (single connection for both transport and listen)
    if (this.transportWs) {
      try {
        this.transportWs.close();
      } catch (e) {
        // Ignore close errors
      }
      this.transportWs = null;
      this.listenWs = null; // Same reference
    }

    // Close audio contexts to free resources
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        await this.audioContext.close();
      } catch (e) {
        // Ignore close errors
      }
      this.audioContext = null;
    }

    if (
      this.playbackAudioContext &&
      this.playbackAudioContext.state !== "closed"
    ) {
      try {
        // Stop playback
        this.isPlaying = false;

        // Disconnect playback node
        if (this.playbackNode) {
          try {
            this.playbackNode.disconnect();
          } catch (e) {
            // Ignore disconnect errors
          }
          this.playbackNode = null;
        }

        // Clear jitter buffer
        if (this.jitterBuffer) {
          this.jitterBuffer = [];
          this.jitterBufferSize = 0;
        }

        // Clear old playback queue (legacy)
        if (this.audioPlaybackQueue) {
          this.audioPlaybackQueue = [];
        }
        this.isSchedulingAudio = false;
        this.nextScheduledTime = null;

        await this.playbackAudioContext.close();
      } catch (e) {
        // Ignore close errors
      }
      this.playbackAudioContext = null;
    }

    this.isConnected = false;
    this.callId = null;
  }

  // Set event handlers
  setOnMessage(handler) {
    this.onMessage = handler;
  }

  setOnTranscript(handler) {
    this.onTranscript = handler;
  }

  setOnStatusUpdate(handler) {
    this.onStatusUpdate = handler;
  }

  setOnError(handler) {
    this.onError = handler;
  }

  setOnEnd(handler) {
    this.onEnd = handler;
  }
}

export const vapiCallManager = new VapiCallManager();
export default vapiCallManager;
