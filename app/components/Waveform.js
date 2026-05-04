import React, { useEffect, useRef, useMemo } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const BAR_COUNT = 24;
const ACCENT = '#c8f542';
const MIX_OUT_COLOR = '#ff7040'; // orange — where crossfade triggers
const MIX_IN_COLOR  = '#40c8ff'; // cyan   — where incoming track starts

// Downsample or upsample an energy curve array to exactly `count` bars
function resample(curve, count) {
  if (!curve || curve.length === 0) return null;
  const result = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i / count) * curve.length);
    const end = Math.floor(((i + 1) / count) * curve.length);
    const slice = curve.slice(start || 0, end || 1);
    const avg = slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0.3;
    result.push(avg);
  }
  return result;
}

export default function Waveform({
  isPlaying,
  energyCurve,
  playheadFraction = 0,
  mixInFraction = 0,
  mixOutFraction = 0,
}) {
  const bars = useMemo(() => resample(energyCurve, BAR_COUNT), [energyCurve]);
  const hasRealData = bars !== null;

  // Pulse animation for the "now playing" bar
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Random animation refs for fallback mode
  const randomAnims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.2))
  ).current;

  // Pulse the current-position bar when playing
  useEffect(() => {
    if (!hasRealData || !isPlaying) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 300, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 300, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasRealData, isPlaying]);

  // Random animation for fallback (no analysis data)
  useEffect(() => {
    if (hasRealData) return;

    if (!isPlaying) {
      randomAnims.forEach((a) => Animated.spring(a, { toValue: 0.2, useNativeDriver: true }).start());
      return;
    }

    const loops = randomAnims.map((anim) => {
      const dur = 400 + Math.random() * 600;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 0.2 + Math.random() * 0.8, duration: dur, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.1 + Math.random() * 0.3, duration: dur, useNativeDriver: true }),
        ])
      );
    });

    loops.forEach((loop, i) => setTimeout(() => loop.start(), i * 30));
    return () => loops.forEach((l) => l.stop());
  }, [hasRealData, isPlaying]);

  const currentBar = Math.floor(playheadFraction * BAR_COUNT);

  const renderOverlays = () => (
    <>
      {/* Mix-out marker — orange, crossfade fires here */}
      {mixOutFraction > 0 && (
        <View
          style={[styles.cueMarker, { left: `${mixOutFraction * 100}%`, backgroundColor: MIX_OUT_COLOR }]}
          pointerEvents="none"
        >
          <View style={[styles.cueDot, { backgroundColor: MIX_OUT_COLOR }]} />
        </View>
      )}
      {/* Mix-in marker — cyan, incoming track starts here */}
      {mixInFraction > 0 && (
        <View
          style={[styles.cueMarker, { left: `${mixInFraction * 100}%`, backgroundColor: MIX_IN_COLOR }]}
          pointerEvents="none"
        >
          <View style={[styles.cueDot, { backgroundColor: MIX_IN_COLOR }]} />
        </View>
      )}
    </>
  );

  if (hasRealData) {
    return (
      <View style={styles.container}>
        {bars.map((energy, i) => {
          const isPast = i < currentBar;
          const isCurrent = i === currentBar;
          const height = Math.max(0.08, energy) * 40;

          const barColor = isCurrent ? ACCENT : isPast ? '#2a2a2a' : '#3a3a3a';
          const opacity = isCurrent ? 1 : isPast ? 0.5 : 0.75;

          return isCurrent ? (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  height,
                  backgroundColor: barColor,
                  opacity,
                  transform: [{ scaleY: pulseAnim }],
                },
              ]}
            />
          ) : (
            <View
              key={i}
              style={[styles.bar, { height, backgroundColor: barColor, opacity }]}
            />
          );
        })}
        {renderOverlays()}
      </View>
    );
  }

  // Fallback: random animated bars
  return (
    <View style={styles.container}>
      {randomAnims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: 40,
              backgroundColor: ACCENT,
              transform: [{ scaleY: anim }],
              opacity: 0.9,
            },
          ]}
        />
      ))}
      {renderOverlays()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
  // Cue marker — thin line with a dot at the top
  cueMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    opacity: 0.85,
  },
  cueDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    position: 'absolute',
    top: -3,
    left: -1.75,
  },
});
