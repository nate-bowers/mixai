import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder } from 'react-native';
import { useEngine } from '../context/AudioEngineContext';

const ACCENT = '#c8f542';

const TRANSITION_STYLES = [
  { id: 'eq_swap', label: 'EQ Swap' },
  { id: 'long_blend', label: 'Long Blend' },
  { id: 'filter_sweep', label: 'Filter Sweep' },
  { id: 'echo_out', label: 'Echo Out' },
  { id: 'hard_cut', label: 'Hard Cut' },
];

export default function Crossfader({ value, onChange }) {
  const { transitionStyle, setTransitionStyle } = useEngine();
  const trackWidth = useRef(0);
  const startX = useRef(0);
  const startValue = useRef(value);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, g) => {
        startX.current = g.x0;
        startValue.current = value;
      },
      onPanResponderMove: (_, g) => {
        if (trackWidth.current === 0) return;
        const delta = g.dx / trackWidth.current;
        const newVal = Math.min(1, Math.max(0, startValue.current + delta));
        onChange?.(newVal);
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View style={styles.sliderRow}>
        <Text style={styles.deckTag}>A</Text>
        <View
          style={styles.sliderTrack}
          onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
          {...panResponder.panHandlers}
        >
          <View style={[styles.sliderFill, { width: `${value * 100}%` }]} />
          <View style={[styles.thumb, { left: `${value * 100}%`, marginLeft: -9 }]} />
        </View>
        <Text style={styles.deckTag}>B</Text>
      </View>

      <View style={styles.pills}>
        {TRANSITION_STYLES.map((ts) => (
          <TouchableOpacity
            key={ts.id}
            style={[styles.pill, transitionStyle === ts.id && styles.pillActive]}
            onPress={() => setTransitionStyle(ts.id)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.pillText,
                transitionStyle === ts.id && styles.pillTextActive,
              ]}
            >
              {ts.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
    gap: 14,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deckTag: {
    fontFamily: 'DMM',
    fontSize: 12,
    color: '#555',
    width: 14,
    textAlign: 'center',
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: ACCENT,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    top: -6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#0a0a0a',
  },
  pillActive: {
    borderColor: ACCENT,
    backgroundColor: `${ACCENT}15`,
  },
  pillText: {
    fontFamily: 'DMM',
    fontSize: 11,
    color: '#555',
  },
  pillTextActive: {
    color: ACCENT,
  },
});
