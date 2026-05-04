import * as FileSystem from 'expo-file-system/legacy';
import { upsertAnalysis, setAnalysisStatus, updateTrackDuration } from '../db/database';
import { getServerUrl } from './serverConfig';

export async function analyzeTrack(trackId, fileUri) {
  const baseUrl = await getServerUrl();

  try {
    await setAnalysisStatus(trackId, 'pending');

    const result = await FileSystem.uploadAsync(
      `${baseUrl}/analyze`,
      fileUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
      }
    );

    if (result.status !== 200) {
      let detail = `Analysis server returned ${result.status}`;
      try {
        const errBody = JSON.parse(result.body);
        if (errBody.detail) detail = `Analysis failed: ${errBody.detail}`;
      } catch {}
      throw new Error(detail);
    }

    const data = JSON.parse(result.body);

    if (!data.bpm || !data.key) {
      throw new Error('Invalid response from analysis server');
    }

    await upsertAnalysis(trackId, data);
    if (data.duration) await updateTrackDuration(trackId, data.duration);
    return data;
  } catch (err) {
    await setAnalysisStatus(trackId, 'error');
    throw err;
  }
}

export async function checkServerHealth(url) {
  try {
    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
