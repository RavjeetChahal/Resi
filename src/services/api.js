import axios from 'axios';
import { Platform } from 'react-native';

const DEFAULT_API_URL = Platform.select({
  ios: 'http://localhost:3000',
  android: 'http://10.0.2.2:3000',
  default: 'http://localhost:3000',
});

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_URL;

if (!process.env.EXPO_PUBLIC_API_BASE_URL) {
  console.warn(
    `[API] EXPO_PUBLIC_API_BASE_URL is not set. Falling back to platform default: ${DEFAULT_API_URL}`,
  );
}

if (API_BASE_URL.includes('your-vercel-project')) {
  console.warn(
    `[API] Detected placeholder API URL (${API_BASE_URL}). Update EXPO_PUBLIC_API_BASE_URL to point to your running backend.`,
  );
}

export const transcribeAudio = async ({ uri, file, mimeType = 'audio/m4a', onUploadProgress } = {}) => {
  if (!uri && !file) {
    throw new Error('Recording data is required for transcription.');
  }

  const formData = new FormData();

  if (file) {
    formData.append('file', file);
  } else if (uri) {
    const fileName = uri.split('/').pop() || `recording-${Date.now()}.m4a`;
    formData.append('file', {
      uri,
      name: fileName,
      type: mimeType,
    });
  }

  console.log(
    '[API] Uploading audio for transcription',
    file
      ? { source: 'web-file', size: file.size, type: file.type }
      : { source: 'native-uri', uri, mimeType },
    `→ ${API_BASE_URL}/api/processInput`,
  );

  try {
    const response = await axios.post(`${API_BASE_URL}/api/processInput`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });

    console.log('[API] Transcription response received', response.data);
    return response.data;
  } catch (error) {
    console.error('[API] Transcription request failed', {
      message: error.message,
      code: error.code,
      url: `${API_BASE_URL}/api/processInput`,
    });
    throw error;
  }
};

