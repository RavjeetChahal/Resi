import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
// Determine default API URL based on platform

const getDefaultApiUrl = () => {
  // For production mobile apps, always use the deployed server
  const PRODUCTION_API = "https://resi-7125.onrender.com";

  // Toggle this for local development
  const USE_LOCAL_SERVER = false; // Set to false for production

  if (USE_LOCAL_SERVER) {
    // Local development mode
    if (Platform.OS === "ios") {
      // For physical iOS devices, use the Expo debugger host IP
      // For simulator, use localhost
      const debuggerHost = Constants.expoConfig?.hostUri?.split(":").shift();
      console.log("[API] iOS debuggerHost detected:", debuggerHost);
      console.log(
        "[API] Constants.expoConfig?.hostUri:",
        Constants.expoConfig?.hostUri
      );
      console.log(
        "[API] Constants.manifest?.debuggerHost:",
        Constants.manifest?.debuggerHost
      );

      if (debuggerHost && debuggerHost !== "localhost") {
        // Physical device - use the Mac's IP address
        const url = `http://${debuggerHost}:3000`;
        console.log("[API] Using physical device URL:", url);
        return url;
      }
      // Simulator - use localhost
      console.log("[API] Using simulator URL: http://localhost:3000");
      return "http://localhost:3000";
    }
    if (Platform.OS === "android") {
      // Android emulator uses 10.0.2.2 to reach host machine
      const debuggerHost = Constants.expoConfig?.hostUri?.split(":").shift();
      console.log("[API] Android debuggerHost detected:", debuggerHost);

      if (
        debuggerHost &&
        debuggerHost !== "localhost" &&
        debuggerHost !== "10.0.2.2"
      ) {
        // Physical device - use the actual IP
        return `http://${debuggerHost}:3000`;
      }
      return "http://10.0.2.2:3000";
    }
  } else {
    // Production mode - use deployed server
    if (Platform.OS === "ios" || Platform.OS === "android") {
      return PRODUCTION_API;
    }
  }

  if (Platform.OS === "web") {
    try {
      if (
        typeof window !== "undefined" &&
        window.location &&
        window.location.origin
      ) {
        // For web, use the same origin (Render serves both frontend and backend)
        return window.location.origin;
      }
    } catch (e) {
      console.warn("[API] Error accessing window.location:", e);
    }
  }

  return USE_LOCAL_SERVER ? "http://localhost:3000" : PRODUCTION_API;
};

const DEFAULT_API_URL = getDefaultApiUrl();

// Determine final API URL
// If EXPO_PUBLIC_API_BASE_URL points to localhost and we're on a physical device,
// ignore it and use the auto-detected IP instead
let API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_URL;

if (
  API_BASE_URL.includes("localhost") &&
  (Platform.OS === "ios" || Platform.OS === "android")
) {
  const debuggerHost = Constants.expoConfig?.hostUri?.split(":").shift();
  if (debuggerHost && debuggerHost !== "localhost") {
    // Physical device detected - use auto-detected IP instead of localhost
    console.log(
      "[API] EXPO_PUBLIC_API_BASE_URL points to localhost. Physical devices cannot reach this address."
    );
    console.log(
      "[API] Using auto-detected device URL instead:",
      DEFAULT_API_URL
    );
    API_BASE_URL = DEFAULT_API_URL;
  }
}

// Remove trailing slash to prevent double-slash in URLs
API_BASE_URL = API_BASE_URL.replace(/\/$/, "");

if (!process.env.EXPO_PUBLIC_API_BASE_URL) {
  console.warn(
    `[API] EXPO_PUBLIC_API_BASE_URL is not set. Falling back to platform default: ${DEFAULT_API_URL}`
  );
}

if (API_BASE_URL.includes("your-vercel-project")) {
  console.warn(
    `[API] Detected placeholder API URL (${API_BASE_URL}). Update EXPO_PUBLIC_API_BASE_URL to point to your running backend.`
  );
}

if (API_BASE_URL.includes("localhost")) {
  console.warn(
    "[API] EXPO_PUBLIC_API_BASE_URL points to localhost. Physical devices cannot reach this address."
  );
}

console.log("[API] Base URL resolved:", API_BASE_URL);

export const transcribeAudio = async ({
  uri,
  file,
  mimeType = "audio/m4a",
  onUploadProgress,
  conversationId,
  userId,
} = {}) => {
  if (!uri && !file) {
    throw new Error("Recording data is required for transcription.");
  }

  const formData = new FormData();

  if (file) {
    formData.append("file", file);
  } else if (uri) {
    const fileName = uri.split("/").pop() || `recording-${Date.now()}.m4a`;
    formData.append("file", {
      uri,
      name: fileName,
      type: mimeType,
    });
  }

  // Add conversation ID to track context
  formData.append("conversationId", conversationId || `conv-${Date.now()}`);

  // Add user ID to identify ticket owner
  if (userId) {
    formData.append("userId", userId);
  }

  const deviceInfo = {
    deviceName: Constants.deviceName,
    platform: Platform.OS,
    expoHost: Constants.manifest?.debuggerHost,
    appOwnership: Constants.appOwnership,
  };
  console.log("[API] Device info", deviceInfo);
  console.log("[API] Base URL resolved to", API_BASE_URL);
  console.log(
    "[API] Uploading audio for transcription",
    file
      ? { source: "web-file", size: file.size, type: file.type }
      : { source: "native-uri", uri, mimeType },
    `→ ${API_BASE_URL}/api/processInput`
  );

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/processInput`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress,
        timeout: 60000, // 60 seconds for OpenAI Whisper + GPT processing
      }
    );

    console.log("[API] Transcription response received", {
      status: response.status,
      keys: Object.keys(response.data || {}),
    });
    return response.data;
  } catch (error) {
    console.error("[API] Transcription request failed", {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      url: `${API_BASE_URL}/api/processInput`,
      readyState: error.request?.readyState,
      responseType: error.request?.responseType,
    });
    throw error;
  }
};

export const pingServer = async (timeout = 3000) => {
  try {
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const signal = controller ? controller.signal : undefined;
    if (controller) setTimeout(() => controller.abort(), timeout);

    // Do not set the Origin header manually — browsers block this. The browser
    // will set Origin automatically on cross-origin requests.
    const url = `${API_BASE_URL}/health`;
    console.log("[API] Pinging backend health:", url);
    const resp = await axios.get(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    return resp;
  } catch (err) {
    // normalize error
    const error = err?.response ? err.response : err;
    console.warn("[API] Health check failed", {
      message: error?.statusText || error?.message,
      status: error?.status,
      url: `${API_BASE_URL}/health`,
    });
    throw error;
  }
};
