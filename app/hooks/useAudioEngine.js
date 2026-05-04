import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { getAllTracks } from '../db/database';
import { rankTracks } from '../utils/compatibility';

const BEATSYNC_MAX_RATE = 1.15;
const BEATSYNC_MIN_RATE = 0.85;

// ─── Transition style definitions ────────────────────────────────────────────
// Each curve: (progress 0→1) → { volA, volB }
// volA = outgoing deck volume, volB = incoming deck volume
// Manual crossfader always uses EQUAL_POWER regardless of style.

const EQUAL_POWER = (p) => ({
  volA: Math.cos(p * Math.PI * 0.5),
  volB: Math.sin(p * Math.PI * 0.5),
});

const TRANSITION_CURVES = {
  eq_swap: (p) => {
    const volA = Math.max(0, Math.cos(Math.min(1, p * 1.4) * Math.PI * 0.5));
    const delayed = Math.max(0, (p - 0.2) / 0.8);
    const volB = Math.sin(delayed * Math.PI * 0.5);
    return { volA, volB };
  },
  long_blend: EQUAL_POWER,
  filter_sweep: (p) => ({
    volA: Math.cos(p * Math.PI * 0.5),
    volB: Math.pow(p, 2.2),
  }),
  echo_out: (p) => ({
    volA: Math.cos(p * Math.PI * 0.5) * (0.65 + 0.35 * Math.abs(Math.cos(p * Math.PI * 4))),
    volB: Math.sin(p * Math.PI * 0.5),
  }),
  hard_cut: (p) => ({
    volA: p < 0.04 ? 1 : 0,
    volB: p < 0.04 ? 0 : 1,
  }),
};

const TRANSITION_BEATS = {
  eq_swap: 16,
  long_blend: 32,
  filter_sweep: 20,
  echo_out: 16,
  hard_cut: 1,
};

// ─────────────────────────────────────────────────────────────────────────────

export function useAudioEngine() {
  const soundARef = useRef(null);
  const soundBRef = useRef(null);

  const [deckA, setDeckA] = useState(null);
  const [deckB, setDeckB] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [crossfade, setCrossfadeState] = useState(0.0);
  const [autopilot, setAutopilot] = useState(false);
  const [positionA, setPositionA] = useState(0);
  const [positionB, setPositionB] = useState(0);
  const [durationA, setDurationA] = useState(0);
  const [durationB, setDurationB] = useState(0);
  const [selectingForDeck, setSelectingForDeck] = useState(null);
  const [transitionStyle, setTransitionStyle] = useState('eq_swap');
  const [autoPilotLoadedB, setAutoPilotLoadedB] = useState(false);

  // Pre-cue: deck is loaded silently, waiting for crossfade trigger.
  // State drives the release-on-autopilot-off effect; ref is read inside intervals/callbacks.
  const [deckAPreCued, setDeckAPreCued] = useState(false);
  const [deckBPreCued, setDeckBPreCued] = useState(false);
  const deckAPreCuedRef = useRef(false);
  const deckBPreCuedRef = useRef(false);

  const crossfadeRef = useRef(0.0);
  const isPlayingRef = useRef(false);
  const autopilotRef = useRef(false);
  const deckARef = useRef(null);
  const deckBRef = useRef(null);
  const transitionStyleRef = useRef('eq_swap');
  const crossfadeIntervalRef = useRef(null);
  const crossfadeTriggeredRef = useRef(false);
  // Which direction the next auto-crossfade runs: 'AtoB' or 'BtoA'
  const crossfadeDirectionRef = useRef('AtoB');
  // Stable ref to loadTrack so the crossfade interval can call it
  const loadTrackRef = useRef(null);

  useEffect(() => { deckARef.current = deckA; }, [deckA]);
  useEffect(() => { deckBRef.current = deckB; }, [deckB]);
  useEffect(() => { transitionStyleRef.current = transitionStyle; }, [transitionStyle]);
  useEffect(() => { autopilotRef.current = autopilot; }, [autopilot]);

  // ─── Audio mode + cleanup ─────────────────────────────────────────────────
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((e) => console.warn('Audio mode error:', e));

    return () => {
      soundARef.current?.unloadAsync().catch(() => {});
      soundBRef.current?.unloadAsync().catch(() => {});
      if (crossfadeIntervalRef.current) clearInterval(crossfadeIntervalRef.current);
    };
  }, []);

  // ─── Release pre-cued decks when autopilot turns OFF ─────────────────────
  // When the user disables autopilot, any silently waiting deck should start playing.
  useEffect(() => {
    if (autopilot) return;
    if (deckAPreCuedRef.current) {
      deckAPreCuedRef.current = false;
      setDeckAPreCued(false);
      if (isPlayingRef.current) soundARef.current?.playAsync().catch(() => {});
    }
    if (deckBPreCuedRef.current) {
      deckBPreCuedRef.current = false;
      setDeckBPreCued(false);
      if (isPlayingRef.current) soundBRef.current?.playAsync().catch(() => {});
    }
  }, [autopilot]);

  // ─── Autopilot: auto-load Deck B when A gets a track (first mix setup) ───
  useEffect(() => {
    if (!autopilot || !deckA || deckB) return;

    let active = true;
    getAllTracks()
      .then((tracks) => {
        if (!active) return;
        const ranked = rankTracks(deckA, tracks, [deckA.id]);
        const pick = ranked.find((t) => t.bpm && t.key) ?? ranked[0];
        if (pick) loadTrackRef.current?.('B', pick, { isAutoLoad: true });
      })
      .catch(() => {});

    return () => { active = false; };
  }, [deckA?.id, autopilot, !!deckB]);

  // ─── Autopilot: crossfade trigger (handles both A→B and B→A directions) ──
  useEffect(() => {
    if (!autopilot || !isPlaying) return;
    if (crossfadeTriggeredRef.current || crossfadeIntervalRef.current) return;

    const direction = crossfadeDirectionRef.current;
    const outgoing  = direction === 'AtoB' ? deckARef.current : deckBRef.current;
    const incomingRef  = direction === 'AtoB' ? deckBRef : deckARef;
    const outgoingPos  = direction === 'AtoB' ? positionA : positionB;
    const incomingSoundRef  = direction === 'AtoB' ? soundBRef : soundARef;
    const outgoingSoundRef  = direction === 'AtoB' ? soundARef : soundBRef;
    const incomingPreCuedRef = direction === 'AtoB' ? deckBPreCuedRef : deckAPreCuedRef;
    const setIncomingPreCued = direction === 'AtoB' ? setDeckBPreCued : setDeckAPreCued;

    if (!outgoing?.mix_out_point || !incomingRef.current) return;
    if (outgoingPos / 1000 < outgoing.mix_out_point) return;

    crossfadeTriggeredRef.current = true;

    // Seek incoming deck to its mix-in point and start it
    if (incomingPreCuedRef.current && incomingSoundRef.current) {
      const mixInMs = (incomingRef.current?.mix_in_point ?? 0) * 1000;
      incomingSoundRef.current.setPositionAsync(mixInMs).catch(() => {});
      incomingSoundRef.current.playAsync().catch(() => {});
      incomingPreCuedRef.current = false;
      setIncomingPreCued(false);
    }

    const bpm = outgoing.bpm || 120;
    const style = transitionStyleRef.current;
    const beats = TRANSITION_BEATS[style] ?? 16;
    const fadeDurationMs = (60 / bpm) * beats * 1000;
    const curve = TRANSITION_CURVES[style] ?? EQUAL_POWER;
    const targetCf = direction === 'AtoB' ? 1 : 0;

    const startTime = Date.now();
    const startCf = crossfadeRef.current;

    crossfadeIntervalRef.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startTime) / fadeDurationMs);

      // Visual crossfader moves linearly toward target
      const visualVal = startCf + (targetCf - startCf) * progress;
      crossfadeRef.current = visualVal;
      setCrossfadeState(visualVal);

      // Volumes follow the style curve.
      // curve volA = outgoing track, volB = incoming track.
      // For AtoB: outgoing=A, incoming=B — apply directly.
      // For BtoA: outgoing=B, incoming=A — swap.
      const { volA: volOut, volB: volIn } = curve(progress);
      const realVolA = direction === 'AtoB' ? volOut : volIn;
      const realVolB = direction === 'AtoB' ? volIn : volOut;
      soundARef.current?.setVolumeAsync(Math.max(0, Math.min(1, realVolA))).catch(() => {});
      soundBRef.current?.setVolumeAsync(Math.max(0, Math.min(1, realVolB))).catch(() => {});

      if (progress >= 1) {
        clearInterval(crossfadeIntervalRef.current);
        crossfadeIntervalRef.current = null;
        outgoingSoundRef.current?.pauseAsync().catch(() => {});

        // Flip direction and reset trigger for the next mix
        const nextDirection = direction === 'AtoB' ? 'BtoA' : 'AtoB';
        crossfadeDirectionRef.current = nextDirection;
        crossfadeTriggeredRef.current = false;

        // Auto-load the next suggested track to the just-paused deck
        if (autopilotRef.current) {
          const pausedDeck = direction === 'AtoB' ? 'A' : 'B';
          const playingTrack = direction === 'AtoB' ? deckBRef.current : deckARef.current;
          const excludeIds = [deckARef.current?.id, deckBRef.current?.id].filter(Boolean);
          getAllTracks()
            .then((allTracks) => {
              if (!autopilotRef.current) return;
              const ranked = rankTracks(playingTrack, allTracks, excludeIds);
              const pick = ranked.find((t) => t.bpm && t.key) ?? ranked[0];
              if (pick) loadTrackRef.current?.(pausedDeck, pick, { isAutoLoad: true });
            })
            .catch(() => {});
        }
      }
    }, 50);
  }, [positionA, positionB, autopilot, isPlaying]);

  // Reset trigger when either deck's track changes
  useEffect(() => {
    crossfadeTriggeredRef.current = false;
    if (crossfadeIntervalRef.current) {
      clearInterval(crossfadeIntervalRef.current);
      crossfadeIntervalRef.current = null;
    }
  }, [deckA?.id, deckB?.id]);

  // ─── Internal helpers ─────────────────────────────────────────────────────

  const _applyCrossfade = (value) => {
    crossfadeRef.current = value;
    setCrossfadeState(value);
    soundARef.current?.setVolumeAsync(Math.max(0, Math.min(1, Math.cos(value * Math.PI * 0.5)))).catch(() => {});
    soundBRef.current?.setVolumeAsync(Math.max(0, Math.min(1, Math.sin(value * Math.PI * 0.5)))).catch(() => {});
  };

  // ─── Public API ───────────────────────────────────────────────────────────

  const loadTrack = useCallback(async (deck, track, { isAutoLoad = false } = {}) => {
    const isA = deck === 'A';
    const soundRef      = isA ? soundARef : soundBRef;
    const otherSoundRef = isA ? soundBRef : soundARef;
    const otherDeckRef  = isA ? deckBRef  : deckARef;
    const setDeck       = isA ? setDeckA  : setDeckB;
    const setPosition   = isA ? setPositionA : setPositionB;
    const precuedRef    = isA ? deckAPreCuedRef : deckBPreCuedRef;
    const setPrecued    = isA ? setDeckAPreCued : setDeckBPreCued;

    // Interrupt any in-progress crossfade when loading onto the outgoing deck
    if (crossfadeIntervalRef.current) {
      clearInterval(crossfadeIntervalRef.current);
      crossfadeIntervalRef.current = null;
      crossfadeTriggeredRef.current = false;
    }

    if (!isAutoLoad && !isA) setAutoPilotLoadedB(false);

    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }

    const initialVolume = isA
      ? Math.cos(crossfadeRef.current * Math.PI * 0.5)
      : Math.sin(crossfadeRef.current * Math.PI * 0.5);

    // Pre-cue whenever the other deck is actively in use and we're playing.
    // If autopilot is OFF, the pre-cue releases immediately after loading.
    const otherInUse = !!otherSoundRef.current || !!otherDeckRef.current;
    const precue = isPlayingRef.current && otherInUse;
    const shouldPlay = precue ? false : isPlayingRef.current;

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.file_uri },
        { shouldPlay, volume: initialVolume, progressUpdateIntervalMillis: 250 }
      );

      // Beatmatching
      const otherTrack = otherDeckRef.current;
      if (track.bpm && otherTrack?.bpm) {
        const rate = Math.min(BEATSYNC_MAX_RATE, Math.max(BEATSYNC_MIN_RATE, otherTrack.bpm / track.bpm));
        if (Math.abs(rate - 1.0) > 0.001) {
          await sound.setRateAsync(rate, true).catch((e) => console.warn('Beatmatch error:', e));
        }
      }

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        setPosition(status.positionMillis ?? 0);
        if (status.durationMillis) {
          if (isA) setDurationA(status.durationMillis);
          else setDurationB(status.durationMillis);
        }
        if (status.didJustFinish && isA) setIsPlaying(false);
      });

      soundRef.current = sound;
      setDeck(track);
      precuedRef.current = precue;
      setPrecued(precue);
      if (isAutoLoad && !isA) setAutoPilotLoadedB(true);

      // If autopilot is off, release the pre-cue immediately so the deck starts playing
      if (precue && !autopilotRef.current) {
        precuedRef.current = false;
        setPrecued(false);
        if (isPlayingRef.current) sound.playAsync().catch(() => {});
      }
    } catch (e) {
      console.error(`Failed to load track onto deck ${deck}:`, e);
    }

    setSelectingForDeck(null);
  }, []);

  // Keep ref in sync so the crossfade interval can call loadTrack
  loadTrackRef.current = loadTrack;

  const togglePlay = useCallback(async () => {
    const next = !isPlayingRef.current;
    isPlayingRef.current = next;
    setIsPlaying(next);
    const ops = [];
    // Skip pre-cued decks — they wait for the crossfade trigger
    if (soundARef.current && !deckAPreCuedRef.current) {
      ops.push(next ? soundARef.current.playAsync() : soundARef.current.pauseAsync());
    }
    if (soundBRef.current && !deckBPreCuedRef.current) {
      ops.push(next ? soundBRef.current.playAsync() : soundBRef.current.pauseAsync());
    }
    await Promise.all(ops).catch((e) => console.warn('Play/pause error:', e));
  }, []);

  const setCrossfade = useCallback((value) => {
    if (crossfadeIntervalRef.current) {
      clearInterval(crossfadeIntervalRef.current);
      crossfadeIntervalRef.current = null;
      crossfadeTriggeredRef.current = false;
    }
    _applyCrossfade(value);
  }, []);

  const toggleAutopilot = useCallback(() => setAutopilot((p) => !p), []);
  const beginSelectForDeck = useCallback((deck) => setSelectingForDeck(deck), []);
  const cancelSelect = useCallback(() => setSelectingForDeck(null), []);

  return {
    deckA, deckB,
    positionA, positionB,
    durationA, durationB,
    isPlaying, crossfade, autopilot,
    transitionStyle, autoPilotLoadedB,
    deckAPreCued, deckBPreCued,
    selectingForDeck,
    loadTrack, togglePlay, setCrossfade,
    setTransitionStyle,
    toggleAutopilot, beginSelectForDeck, cancelSelect,
  };
}
