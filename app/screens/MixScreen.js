import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Deck from '../components/Deck';
import Crossfader from '../components/Crossfader';
import TrackRow from '../components/TrackList';
import { useEngine } from '../context/AudioEngineContext';
import { getAllTracks } from '../db/database';
import { rankTracks } from '../utils/compatibility';

const ACCENT = '#c8f542';
const SUGGESTIONS_COUNT = 3;

export default function MixScreen() {
  const navigation = useNavigation();
  const {
    deckA, deckB,
    positionA, positionB,
    durationA, durationB,
    isPlaying, crossfade, autopilot,
    autoPilotLoadedB,
    togglePlay, setCrossfade, toggleAutopilot,
    beginSelectForDeck, loadTrack,
  } = useEngine();

  const [allTracks, setAllTracks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showBrowse, setShowBrowse] = useState(false);
  const [browseSearch, setBrowseSearch] = useState('');

  // Load library on mount and when returning to this tab
  const refreshTracks = useCallback(async () => {
    const tracks = await getAllTracks().catch(() => []);
    setAllTracks(tracks);
  }, []);

  useEffect(() => {
    refreshTracks();
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', refreshTracks);
    return unsub;
  }, [navigation, refreshTracks]);

  // Recompute suggestions whenever Deck A or library changes
  useEffect(() => {
    const excludeIds = [deckA?.id, deckB?.id].filter(Boolean);
    if (deckA) {
      setSuggestions(rankTracks(deckA, allTracks, excludeIds).slice(0, SUGGESTIONS_COUNT));
    } else {
      // No track on A — show highest-energy tracks as a starting point
      setSuggestions(allTracks.filter((t) => t.id !== deckB?.id).slice(0, SUGGESTIONS_COUNT));
    }
  }, [deckA, deckB, allTracks]);

  const handleLoad = (deck) => {
    beginSelectForDeck(deck);
    navigation.navigate('Library');
  };

  const handleLoadSuggestion = async (track) => {
    // Load to B if A is playing, otherwise A
    const targetDeck = deckA ? 'B' : 'A';
    await loadTrack(targetDeck, track);
    setShowBrowse(false);
    await refreshTracks();
  };

  // Browse modal — all tracks sorted by compatibility
  const browseRanked = (() => {
    const excludeIds = [deckA?.id, deckB?.id].filter(Boolean);
    const ref = deckA || deckB; // use whichever deck has a track as reference
    const ranked = ref
      ? rankTracks(ref, allTracks, excludeIds)
      : allTracks.filter((t) => !excludeIds.includes(t.id));
    if (!browseSearch) return ranked;
    const q = browseSearch.toLowerCase();
    return ranked.filter(
      (t) => t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q)
    );
  })();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Grid background */}
      <View style={styles.gridBg} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={styles.gridLine} />
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Text style={styles.logoMix}>mix</Text>
            <Text style={styles.logoDot}>.</Text>
            <Text style={styles.logoAi}>ai</Text>
          </View>
          <TouchableOpacity
            style={[styles.autopilotPill, !autopilot && styles.autopilotPillOff]}
            onPress={toggleAutopilot}
            activeOpacity={0.8}
          >
            <View style={[styles.autopilotDot, !autopilot && styles.autopilotDotOff]} />
            <Text style={[styles.autopilotText, !autopilot && styles.autopilotTextOff]}>
              AUTOPILOT {autopilot ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Decks */}
        <View style={styles.decks}>
          <Deck label="DECK A" track={deckA} isPlaying={isPlaying} isActive={crossfade < 0.8}
            position={positionA} durationMs={durationA} onLoad={() => handleLoad('A')} />
          <Deck label="DECK B" track={deckB} isPlaying={isPlaying} isActive={crossfade >= 0.2}
            isAutoPicked={autoPilotLoadedB}
            position={positionB} durationMs={durationB} onLoad={() => handleLoad('B')} />
        </View>

        {/* Crossfader */}
        <Crossfader value={crossfade} onChange={setCrossfade} />

        {/* Bottom row */}
        <View style={styles.bottomRow}>

          {/* Up Next */}
          <View style={styles.upNext}>
            <View style={styles.upNextHeader}>
              <Text style={styles.sectionLabel}>Up Next</Text>
              <TouchableOpacity onPress={() => { setBrowseSearch(''); setShowBrowse(true); }} activeOpacity={0.7}>
                <Text style={styles.browseBtn}>Browse All ›</Text>
              </TouchableOpacity>
            </View>

            {suggestions.length === 0 ? (
              <Text style={styles.noSuggestions}>
                {allTracks.length === 0
                  ? 'Import tracks to see suggestions'
                  : 'Load a track to Deck A for suggestions'}
              </Text>
            ) : (
              suggestions.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  showCompatibility={!!deckA}
                  showStatus={false}
                  onPress={handleLoadSuggestion}
                />
              ))
            )}
          </View>

          {/* Play controls */}
          <View style={styles.controls}>
            <TouchableOpacity style={styles.playButton} onPress={togglePlay} activeOpacity={0.85}>
              <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.autopilotToggle, autopilot && styles.autopilotToggleOn]}
              onPress={toggleAutopilot}
              activeOpacity={0.8}
            >
              <Text style={[styles.autopilotToggleText, autopilot && styles.autopilotToggleTextOn]}>
                AUTO
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>

      {/* Browse All modal */}
      <Modal visible={showBrowse} animationType="slide" transparent onRequestClose={() => setShowBrowse(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDismiss} onPress={() => setShowBrowse(false)} activeOpacity={1} />
          <View style={styles.modalSheet}>

            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {deckA ? 'Tracks ranked by compatibility' : 'All Tracks'}
              </Text>
              <TouchableOpacity onPress={() => setShowBrowse(false)} activeOpacity={0.7}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {deckA && (
              <Text style={styles.modalRef}>
                Matching to: {deckA.title} · {deckA.bpm?.toFixed(0)} BPM · {deckA.key}
              </Text>
            )}

            <View style={styles.modalSearch}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search…"
                placeholderTextColor="#444"
                value={browseSearch}
                onChangeText={setBrowseSearch}
                autoCapitalize="none"
              />
              {browseSearch.length > 0 && (
                <TouchableOpacity onPress={() => setBrowseSearch('')}>
                  <Text style={styles.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={browseRanked}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TrackRow
                  track={item}
                  showCompatibility={!!deckA || !!deckB}
                  showStatus={false}
                  onPress={handleLoadSuggestion}
                />
              )}
              ListEmptyComponent={
                <Text style={styles.emptyBrowse}>No tracks match your search</Text>
              }
              keyboardShouldPersistTaps="handled"
            />

          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  gridBg: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', justifyContent: 'space-between' },
  gridLine: { width: 1, flex: 1, marginHorizontal: '12.5%', backgroundColor: '#ffffff08' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoMix: { fontFamily: 'Syne_800ExtraBold', fontSize: 26, color: '#fff' },
  logoDot: { fontFamily: 'Syne_800ExtraBold', fontSize: 26, color: ACCENT },
  logoAi: { fontFamily: 'Syne_800ExtraBold', fontSize: 26, color: '#fff' },
  autopilotPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${ACCENT}18`, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: `${ACCENT}50` },
  autopilotPillOff: { backgroundColor: '#1a1a1a', borderColor: '#333' },
  autopilotDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  autopilotDotOff: { backgroundColor: '#444' },
  autopilotText: { fontFamily: 'DMM', fontSize: 10, color: ACCENT, letterSpacing: 1.5 },
  autopilotTextOff: { color: '#444' },

  decks: { flexDirection: 'row', gap: 10 },

  bottomRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },

  upNext: { flex: 1, backgroundColor: '#141414', borderRadius: 12, borderWidth: 1, borderColor: '#222', overflow: 'hidden' },
  upNextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  sectionLabel: { fontFamily: 'DMM', fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase' },
  browseBtn: { fontFamily: 'DMM', fontSize: 11, color: ACCENT },
  noSuggestions: { fontFamily: 'DMM', fontSize: 11, color: '#333', padding: 16, paddingTop: 8, lineHeight: 18 },

  controls: { width: 80, alignItems: 'center', gap: 12, paddingTop: 12 },
  playButton: { width: 60, height: 60, borderRadius: 30, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  playIcon: { fontSize: 22, color: '#000', marginLeft: 2 },
  autopilotToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#333', backgroundColor: '#0a0a0a' },
  autopilotToggleOn: { borderColor: ACCENT, backgroundColor: `${ACCENT}15` },
  autopilotToggleText: { fontFamily: 'DMM', fontSize: 10, color: '#444', letterSpacing: 1 },
  autopilotToggleTextOn: { color: ACCENT },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalDismiss: { flex: 1, backgroundColor: '#000000aa' },
  modalSheet: { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalHandle: { width: 36, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  modalTitle: { fontFamily: 'Syne_700Bold', fontSize: 16, color: '#fff' },
  modalClose: { fontFamily: 'DMM', fontSize: 14, color: '#555', padding: 4 },
  modalRef: { fontFamily: 'DMM', fontSize: 11, color: '#555', paddingHorizontal: 16, paddingBottom: 8 },
  modalSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#222', gap: 8 },
  searchIcon: { fontSize: 18, color: '#444' },
  searchInput: { flex: 1, fontFamily: 'DMM', fontSize: 14, color: '#fff', paddingVertical: 10 },
  searchClear: { fontSize: 12, color: '#444', padding: 4 },
  emptyBrowse: { fontFamily: 'DMM', fontSize: 13, color: '#333', textAlign: 'center', paddingVertical: 40 },
});
