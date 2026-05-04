import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const ACCENT = '#c8f542';

const STATUS_COLOR = {
  done: ACCENT,
  pending: '#f5a442',
  error: '#f54242',
};

const STATUS_LABEL = {
  done: '●',
  pending: '◌',
  error: '✕',
};

export default function TrackRow({ track, onPress, showCompatibility, showStatus = true }) {
  const status = track.analysis_status || track.status || 'pending';

  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress?.(track)} activeOpacity={0.7}>
      <View style={styles.left}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist || 'Unknown Artist'}
        </Text>
      </View>

      <View style={styles.right}>
        {showCompatibility && track.compatibility != null && (
          <Text style={styles.compatibility}>{track.compatibility}%</Text>
        )}
        {track.bpm && (
          <Text style={styles.meta}>{track.bpm.toFixed(0)} BPM</Text>
        )}
        {track.key && (
          <Text style={styles.meta}>{track.key}</Text>
        )}
        {showStatus && (
          <Text style={[styles.statusDot, { color: STATUS_COLOR[status] || '#555' }]}>
            {STATUS_LABEL[status] || '◌'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  left: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontFamily: 'Syne_700Bold',
    fontSize: 13,
    color: '#fff',
    marginBottom: 2,
  },
  artist: {
    fontFamily: 'DMM',
    fontSize: 11,
    color: '#555',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meta: {
    fontFamily: 'DMM',
    fontSize: 11,
    color: '#444',
  },
  compatibility: {
    fontFamily: 'DMM',
    fontSize: 12,
    color: ACCENT,
    fontWeight: '700',
  },
  statusDot: {
    fontSize: 12,
    width: 14,
    textAlign: 'center',
  },
});
