import axios from 'axios';
import { Platform } from 'react-native';

const DEFAULT_API_URL = Platform.select({
  ios: 'http://localhost:3000',
  android: 'http://10.0.2.2:3000',
  default: 'http://localhost:3000',
});

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_URL;

export const transcribeAudio = async ({ uri, mimeType = 'audio/m4a', onUploadProgress } = {}) => {
  if (!uri) {
    throw new Error('Recording URI is required for transcription.');
  }

  const fileName = uri.split('/').pop() || `recording-${Date.now()}.m4a`;

  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName,
    type: mimeType,
  });

  const response = await axios.post(`${API_BASE_URL}/api/processInput`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  });

  return response.data;
};

