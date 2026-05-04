import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { initDatabase, insertTrack, getAllTracks } from '../db/database';
import { analyzeTrack } from '../services/analysisService';
import TrackRow from '../components/TrackList';
import { useEngine } from '../context/AudioEngineContext';

const ACCENT = '#c8f542';

const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-flac',
  'audio/flac',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'public.audio',
];

export default function LibraryScreen() {
  const navigation = useNavigation();
  const { selectingForDeck, loadTrack, cancelSelect } = useEngine();
  const isSelectMode = selectingForDeck !== null;

  const [tracks, setTracks] = useState([]);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ done: 0, total: 0 });
  const [dbReady, setDbReady] = useState(false);
  const pollRef = useRef(null);
  // Accumulates error messages from async import-time analysis failures
  const analysisErrorsRef = useRef({});

  useEffect(() => {
    initDatabase()
      .then(() => { setDbReady(true); return loadTracks(); })
      .catch((err) => console.error('DB init error:', err));
    return () => stopPolling();
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (dbReady) loadTracks();
    });
    return unsub;
  }, [navigation, dbReady]);

  const loadTracks = useCallback(async () => {
    const all = await getAllTracks();
    setTracks(all);
    return all;
  }, []);

  // Poll DB every 2s while any track is still pending analysis
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const all = await getAllTracks();
      setTracks(all);
      const stillPending = all.some((t) => t.analysis_status === 'pending');
      if (!stillPending) {
        stopPolling();
        const errored = all.filter((t) => t.analysis_status === 'error');
        if (errored.length > 0) {
          const lines = errored.map((t) => {
            const msg = analysisErrorsRef.current[t.id];
            return msg ? `• ${t.title}: ${msg}` : `• ${t.title}`;
          });
          analysisErrorsRef.current = {};
          Alert.alert(
            `${errored.length} track${errored.length !== 1 ? 's' : ''} failed`,
            lines.join('\n')
          );
        }
      }
    }, 2000);
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_TYPES,
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled) return;

      for (const asset of result.assets) {
        await importSingleTrack(asset);
      }

      const all = await loadTracks();
      if (all.some((t) => t.analysis_status === 'pending')) startPolling();
    } catch (err) {
      Alert.alert('Import failed', err.message);
    } finally {
      setImporting(false);
    }
  };

  const importSingleTrack = async (asset) => {
    const filename = asset.name.replace(/\.[^.]+$/, '');
    let title = filename;
    let artist = null;

    if (filename.includes(' - ')) {
      const parts = filename.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    const destDir = `${FileSystem.documentDirectory}tracks/`;
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
    const destUri = `${destDir}${asset.name}`;
    await FileSystem.copyAsync({ from: asset.uri, to: destUri });

    const trackId = await insertTrack({ title, artist, file_uri: destUri, duration: null });
    if (!trackId) return;

    analyzeTrack(trackId, destUri).catch((err) => {
      analysisErrorsRef.current[trackId] = err.message;
      console.warn('Analysis failed for', title, err.message);
    });
  };

  // Re-analyze all tracks missing BPM data
  const handleReanalyze = async () => {
    const unanalyzed = tracks.filter((t) => !t.bpm);
    if (unanalyzed.length === 0) {
      Alert.alert('All done', 'All tracks already have analysis data.');
      return;
    }

    setAnalyzing(true);
    setAnalyzeProgress({ done: 0, total: unanalyzed.length });
    const errors = [];

    for (const track of unanalyzed) {
      try {
        await analyzeTrack(track.id, track.file_uri);
      } catch (err) {
        errors.push(`• ${track.title}: ${err.message}`);
      }
      setAnalyzeProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      await loadTracks();
    }

    setAnalyzing(false);
    setAnalyzeProgress({ done: 0, total: 0 });

    if (errors.length > 0) {
      Alert.alert(
        `${errors.length} track${errors.length !== 1 ? 's' : ''} failed`,
        errors.join('\n')
      );
    }
  };

  const handleTrackPress = async (track) => {
    if (!isSelectMode) return;
    await loadTrack(selectingForDeck, track);
    navigation.navigate('Mix');
  };

  const handleCancel = () => {
    cancelSelect();
    navigation.navigate('Mix');
  };

  const filtered = tracks.filter((t) => {
    const q = search.toLowerCase();
    return t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q);
  });

  const unanalyzedCount = tracks.filter((t) => !t.bpm).length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        {isSelectMode ? (
          <>
            <Text style={styles.selectHeading}>
              Select for Deck <Text style={styles.deckHighlight}>{selectingForDeck}</Text>
            </Text>
            <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
              <Text style={styles.cancelBtn}>✕ Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.heading}>Library</Text>
            <TouchableOpacity
              style={[styles.importBtn, importing && styles.importBtnDisabled]}
              onPress={handleImport}
              disabled={importing || !dbReady}
              activeOpacity={0.8}
            >
              <Text style={styles.importBtnText}>
                {importing ? 'Importing…' : '+ Import'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Re-analyze banner — shown when tracks are missing BPM */}
      {!isSelectMode && unanalyzedCount > 0 && (
        <TouchableOpacity
          style={[styles.analyzeBanner, analyzing && styles.analyzeBannerDisabled]}
          onPress={handleReanalyze}
          disabled={analyzing}
          activeOpacity={0.8}
        >
          <View style={styles.analyzeBannerLeft}>
            <Text style={styles.analyzeBannerTitle}>
              {analyzing
                ? `Analyzing ${analyzeProgress.done + 1} of ${analyzeProgress.total}…`
                : `${unanalyzedCount} track${unanalyzedCount !== 1 ? 's' : ''} not analyzed`}
            </Text>
            <Text style={styles.analyzeBannerSub}>
              {analyzing
                ? `${analyzeProgress.done} done — BPM, key, cue points`
                : 'Tap to analyze — server must be running'}
            </Text>
          </View>
          {!analyzing && (
            <Text style={styles.analyzeBannerAction}>Analyze ›</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Search */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tracks…"
          placeholderTextColor="#444"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.trackCount}>
        {filtered.length} {filtered.length === 1 ? 'track' : 'tracks'}
        {isSelectMode ? ' — tap a track to load it' : ''}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            showStatus={!isSelectMode}
            onPress={isSelectMode ? handleTrackPress : undefined}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>♫</Text>
            <Text style={styles.emptyTitle}>No tracks yet</Text>
            <Text style={styles.emptyText}>
              Tap Import to add MP3, AAC, FLAC, or WAV files
            </Text>
          </View>
        }
        contentContainerStyle={filtered.length === 0 && styles.emptyContainer}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  heading: { fontFamily: 'Syne_800ExtraBold', fontSize: 28, color: '#fff' },
  selectHeading: { fontFamily: 'Syne_700Bold', fontSize: 20, color: '#fff' },
  deckHighlight: { color: ACCENT },
  cancelBtn: { fontFamily: 'DMM', fontSize: 13, color: '#555' },
  importBtn: {
    backgroundColor: ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  importBtnDisabled: { opacity: 0.5 },
  importBtnText: { fontFamily: 'DMM', fontSize: 13, color: '#000', fontWeight: '700' },
  analyzeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${ACCENT}40`,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  analyzeBannerDisabled: { opacity: 0.6 },
  analyzeBannerLeft: { flex: 1 },
  analyzeBannerTitle: {
    fontFamily: 'Syne_700Bold',
    fontSize: 13,
    color: ACCENT,
    marginBottom: 2,
  },
  analyzeBannerSub: { fontFamily: 'DMM', fontSize: 11, color: '#555' },
  analyzeBannerAction: { fontFamily: 'DMM', fontSize: 13, color: ACCENT, marginLeft: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#222',
    gap: 8,
  },
  searchIcon: { fontSize: 18, color: '#444' },
  searchInput: {
    flex: 1,
    fontFamily: 'DMM',
    fontSize: 14,
    color: '#fff',
    paddingVertical: 11,
  },
  clearBtn: { fontSize: 12, color: '#444', padding: 4 },
  trackCount: {
    fontFamily: 'DMM',
    fontSize: 11,
    color: '#333',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  emptyContainer: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyIcon: { fontSize: 40, color: '#222', marginBottom: 8 },
  emptyTitle: { fontFamily: 'Syne_700Bold', fontSize: 18, color: '#333' },
  emptyText: {
    fontFamily: 'DMM',
    fontSize: 13,
    color: '#333',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
