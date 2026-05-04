import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Waveform from './Waveform';

const ACCENT = '#c8f542';

export default function Deck({ label, track, isPlaying, isActive, isAutoPicked, position = 0, durationMs = 0, onLoad }) {
  const hasTrack = !!track;

  // Parse JSON fields from DB (stored as strings)
  const energyCurve = useMemo(() => {
    if (!track?.energy_curve) return null;
    try { return JSON.parse(track.energy_curve); } catch { return null; }
  }, [track?.energy_curve]);

  // Prefer DB-stored duration, fall back to live value from playback status
  const effectiveDurationMs = useMemo(
    () => (track?.duration || 0) * 1000 || durationMs,
    [track?.duration, durationMs]
  );

  // How far through the song (0–1)
  const playheadFraction = useMemo(() => {
    if (!effectiveDurationMs || !position) return 0;
    return Math.min(1, position / effectiveDurationMs);
  }, [position, effectiveDurationMs]);

  // Cue point fractions (0–1) for waveform markers
  const mixInFraction = useMemo(() => {
    if (!track?.mix_in_point || !track?.duration) return 0;
    return Math.min(1, track.mix_in_point / track.duration);
  }, [track?.mix_in_point, track?.duration]);

  const mixOutFraction = useMemo(() => {
    if (!track?.mix_out_point || !track?.duration) return 0;
    return Math.min(1, track.mix_out_point / track.duration);
  }, [track?.mix_out_point, track?.duration]);

  return (
    <View style={[styles.container, isActive && styles.activeContainer]}>
      <View style={styles.header}>
        <Text style={styles.deckLabel}>{label}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.loadBtn} onPress={onLoad} activeOpacity={0.7}>
            <Text style={styles.loadBtnText}>LOAD</Text>
          </TouchableOpacity>
          {isAutoPicked && (
            <View style={styles.autoBadge}>
              <Text style={styles.autoBadgeText}>AUTO</Text>
            </View>
          )}
          {isActive && <View style={styles.activeDot} />}
        </View>
      </View>

      <Text style={styles.trackTitle} numberOfLines={1}>
        {hasTrack ? track.title : 'No track loaded'}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {hasTrack ? (track.artist || 'Unknown Artist') : '—'}
      </Text>

      <View style={styles.timestamp}>
        <Text style={styles.timestampText}>
          {hasTrack ? formatMs(position) : '--:--'}
        </Text>
        <Text style={styles.durationText}>
          {hasTrack && track.duration ? `/ ${formatSec(track.duration)}` : ''}
        </Text>
      </View>

      <View style={styles.waveformContainer}>
        <Waveform
          isPlaying={isPlaying && hasTrack}
          energyCurve={energyCurve}
          playheadFraction={playheadFraction}
          mixInFraction={mixInFraction}
          mixOutFraction={mixOutFraction}
        />
      </View>

      <View style={styles.badges}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>BPM</Text>
          <Text style={styles.badgeValue}>
            {hasTrack && track.bpm ? Number(track.bpm).toFixed(1) : '—'}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>KEY</Text>
          <Text style={styles.badgeValue}>
            {hasTrack && track.key ? track.key : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function formatMs(ms) {
  const totalSec = Math.floor((ms || 0) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSec(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
  },
  activeContainer: {
    borderColor: '#c8f54240',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  deckLabel: {
    fontFamily: 'DMM',
    fontSize: 10,
    color: '#555',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loadBtn: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  loadBtnText: {
    fontFamily: 'DMM',
    fontSize: 8,
    color: '#444',
    letterSpacing: 1,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  autoBadge: {
    backgroundColor: `${ACCENT}20`,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: `${ACCENT}50`,
  },
  autoBadgeText: {
    fontFamily: 'DMM',
    fontSize: 8,
    color: ACCENT,
    letterSpacing: 1,
  },
  trackTitle: {
    fontFamily: 'Syne_700Bold',
    fontSize: 14,
    color: '#fff',
    marginBottom: 2,
  },
  artist: {
    fontFamily: 'DMM',
    fontSize: 11,
    color: '#666',
    marginBottom: 8,
  },
  timestamp: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 10,
  },
  timestampText: {
    fontFamily: 'DMM',
    fontSize: 13,
    color: ACCENT,
  },
  durationText: {
    fontFamily: 'DMM',
    fontSize: 11,
    color: '#444',
  },
  waveformContainer: {
    marginBottom: 12,
    overflow: 'hidden',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    backgroundColor: '#0a0a0a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
  },
  badgeLabel: {
    fontFamily: 'DMM',
    fontSize: 8,
    color: '#444',
    letterSpacing: 1,
  },
  badgeValue: {
    fontFamily: 'DMM',
    fontSize: 13,
    color: '#fff',
    marginTop: 1,
  },
});
