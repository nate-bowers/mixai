import * as FileSystem from 'expo-file-system/legacy';

const CONFIG_PATH = `${FileSystem.documentDirectory}config.json`;
const DEFAULT_URL = 'http://192.168.1.153:8000';

export async function getServerUrl() {
  try {
    const raw = await FileSystem.readAsStringAsync(CONFIG_PATH);
    return JSON.parse(raw).serverUrl || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

export async function saveServerUrl(url) {
  await FileSystem.writeAsStringAsync(CONFIG_PATH, JSON.stringify({ serverUrl: url }));
}
