# mix.ai — Product Log

AI DJ transition app. Analyzes your music library (BPM, key, song structure) and automatically handles transitions between tracks the way a skilled DJ would. Target user: casual listeners up to intermediate DJs who want smart auto-mixing without needing to know how to DJ.

---

## Status: Phase 3 in progress (auto-load + transition styles done)

---

## What's Built

### Phase 1 — Scaffold + Static UI
- Expo managed workflow project with full folder structure
- Bottom tab navigation: Mix, Library, Settings
- MixScreen: full dark-theme DJ UI (two decks, crossfader, up next, play controls)
- LibraryScreen: file picker for local audio (MP3/AAC/FLAC/WAV), analysis status indicators
- SettingsScreen: tempo tolerance, harmonic matching, server URL config
- SQLite schema: `tracks` and `analysis` tables
- Python/FastAPI microservice (`/analysis`) with Librosa for audio analysis
- `analysisService.js` wires the app to the Python endpoint

### Phase 3 — Autopilot Intelligence (in progress)
- **Deck B auto-load** — when Autopilot ON and Deck A has a track but Deck B is empty, automatically fetches the library, ranks by compatibility (Camelot + BPM), and loads the best analyzed track to Deck B silently. Shows "AUTO" badge on Deck B header. User can override by manually tapping LOAD.
- **Transition style execution** — all 5 styles now drive real audio volume curves during automated crossfade (visual crossfader still tracks linear progress):
  - *EQ Swap*: A fades quickly (simulating cut lows), B enters delayed after 20% progress
  - *Long Blend*: equal-power over 32 beats (smooth, gradual)
  - *Filter Sweep*: A fades normally, B opens with exponential power curve (simulates low-pass filter lifting)
  - *Echo Out*: A pulses 4× while fading (reverb/echo tail simulation), B enters on equal-power
  - *Hard Cut*: instant swap at ~4% progress
- Transition style pills in Crossfader are now wired to shared context — selecting a pill changes the active curve used by the next auto-crossfade
- **Continuous mix loop** — after each crossfade completes, the engine flips direction (A→B then B→A then A→B…), auto-loads the next highest-compatibility track to the paused deck, and pre-cues it for the next mix
- **Pre-cue system** — any deck loaded while the other is playing loads silently (paused). If autopilot ON: held until crossfade trigger, then seeked to mix-in point. If autopilot OFF: released immediately so the user can DJ manually
- **Analysis error surfacing** — 422/error detail from the Python server is now parsed and shown in an Alert after import and after re-analyze

### Phase 2 — Real Playback + Intelligence
- **Two-deck audio playback** via `expo-av` Audio.Sound — load, play, pause, position tracking
- **Equal-power crossfader** — drag to blend volume between decks in real time
- **Beatmatching** — when loading a track onto a deck, its playback rate is automatically adjusted (±15% max, pitch-corrected) to match the BPM of the track already playing
- **Auto-crossfade** — when Autopilot ON and Deck A reaches its mix-out cue point, crossfader animates A→B over 16 beats (ease in-out), then pauses Deck A
- **Real waveform** — bars reflect actual energy curve from analysis; played bars dim, current beat pulses lime green; falls back to random animation if no analysis data
- **Track import with analysis** — file picker copies to app documents, kicks off analysis, polls DB every 2s while pending, status dots update live
- **Re-analyze** — banner in Library when tracks are missing BPM; shows "X of Y" progress as each track completes
- **Up Next suggestions** — real tracks from library scored by Camelot wheel compatibility (55%) + BPM compatibility (45%), top 3 shown; tapping loads to Deck B
- **Browse All modal** — bottom sheet with full library sorted by compatibility score, search bar, tap-to-load
- **Track duration** — written back to DB after analysis; used for timestamp display and waveform playhead

---

## Key Decisions

**Offline-first, analyze-on-import**
Heavy analysis runs once when a track is added and results are cached in SQLite. The app works fully offline after that. Chosen over analyze-at-mix-time to keep latency near zero during an actual mix.

**Local Python microservice for analysis**
Librosa (Python) has the best open-source beat tracking and key detection. FastAPI serves it over local WiFi during development. Planned deployment to Railway or Fly.io for production. The app functions without the server — analysis just won't run until it's reachable.

**Server must bind to `0.0.0.0`, not `localhost`**
`localhost` from the phone hits the phone itself. Server must be started with `--host 0.0.0.0` to accept connections from other devices on the same WiFi. URL is configurable in Settings and persisted to a JSON config file.

**React Context for audio engine**
`AudioEngineProvider` wraps the NavigationContainer so the two `Audio.Sound` refs outlive tab switches. Screens access engine state via `useEngine()`. Avoids prop drilling and navigator-level audio state.

**Equal-power crossfade math**
`volA = cos(cf × π/2)`, `volB = sin(cf × π/2)` where cf is 0–1. At center (0.5) both decks are at ~0.707 (perceived equal loudness). Linear crossfade would make center feel quiet.

**Beatmatching via playback rate, not pitch shift**
`setRateAsync(rate, true)` — the `true` flag enables pitch correction so tempo changes don't chipmunk. Rate is clamped to ±15% (BEATSYNC_MIN_RATE / BEATSYNC_MAX_RATE) to keep the sound natural.

**Auto-crossfade: 16-beat duration**
`durationMs = (60 / bpm) × 16 × 1000`. At 128 BPM that's ~7.5 seconds. Long enough to feel smooth, short enough to stay in the mix. Uses ease-in-out quad curve.

**Analysis speed optimizations**
Original Librosa pipeline at 44100Hz + full beat_track was ~30s/track. Optimized to ~2-5s/track by:
- Load only first 60s at 22050Hz for BPM + key (`duration=60, sr=22050`)
- Load full track at 8000Hz for energy curve + duration (tiny array)
- Replace `beat_track` with `onset_strength` + `tempo()` (10× faster, no full beat grid needed)
- `res_type='soxr_qq'` (fastest available resampler)
- Beat grid synthesized from tempo instead of computed frame-by-frame

**Camelot wheel compatibility scoring**
Key: 55% weight. Same key = 100, relative major/minor = 88, perfect 4th/5th = 85, adjacent = 65, farther away scales down to minimum 5. BPM: 45% weight. Within 2% = 100, within 6% (beatmatchable range) = 85, double/half time also scores high, drops off beyond ±20%.

**No streaming APIs**
Spotify/Apple Music ToS prohibit third-party mixing of streamed audio. Local files only for now. Future: user-uploaded library sync.

---

## File Structure

```
mixai/
├── App.js                          # Root — font loading, AudioEngineProvider, Navigation
├── app.json                        # Expo config (dark theme, plugins)
├── index.js                        # registerRootComponent
├── PRODUCT.md                      # This file
│
├── app/
│   ├── index.js                    # Bottom tab navigator (Mix / Library / Settings)
│   │
│   ├── context/
│   │   └── AudioEngineContext.js   # React Context wrapping useAudioEngine
│   │
│   ├── screens/
│   │   ├── MixScreen.js            # Main DJ view — decks, crossfader, up next, browse modal
│   │   ├── LibraryScreen.js        # Track library, import, re-analyze, select-for-deck mode
│   │   └── SettingsScreen.js       # Tempo tolerance, smart matching, server URL + ping
│   │
│   ├── components/
│   │   ├── Deck.js                 # Single deck: track info, waveform, BPM/key badges, LOAD btn
│   │   ├── Waveform.js             # Energy-curve bars with playhead; fallback random animation
│   │   ├── Crossfader.js           # PanResponder slider + transition style pills
│   │   └── TrackList.js            # Reusable track row (title/artist, BPM/key, status/compat %)
│   │
│   ├── hooks/
│   │   └── useAudioEngine.js       # All playback logic: load, play, crossfade, beatmatch, autopilot
│   │
│   ├── services/
│   │   ├── analysisService.js      # HTTP upload to Python server, result → SQLite
│   │   └── serverConfig.js         # Read/write server URL from config.json in documentDirectory
│   │
│   ├── db/
│   │   └── database.js             # SQLite init, CRUD for tracks + analysis
│   │
│   └── utils/
│       └── compatibility.js        # Camelot + BPM scoring, rankTracks()
│
├── analysis/                       # Python microservice (separate from RN app)
│   ├── main.py                     # FastAPI — POST /analyze, GET /health
│   └── requirements.txt            # librosa, fastapi, uvicorn, soxr, resampy, soundfile
│
└── assets/                         # Icons, splash
```

---

## Design System

| Token | Value |
|---|---|
| Background | `#0a0a0a` |
| Surface | `#141414` |
| Border | `#222` |
| Accent | `#c8f542` (lime green) |
| Font — display | Syne 700/800 (alias: `Syne_700Bold`, `Syne_800ExtraBold`) |
| Font — mono/labels | DM Mono 400 (alias: `DMM`) |

Accent used for: play button, autopilot indicator, active waveform bar, compatibility scores, analysis banner, LOAD deck button highlight, crossfader fill.

---

## Running Locally

```bash
# React Native app
cd mixai
npx expo start

# Python analysis server (must bind to 0.0.0.0 for phone access)
cd mixai/analysis
pip install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --reload --port 8000
```

Set server URL in app: **Settings → Analysis Server → tap to edit → `http://<your-mac-ip>:8000`**

Find your Mac IP: System Settings → Wi-Fi → Details

---

## Phase 3 — Remaining

**Personalization / mix history**
Track which transitions sounded good (user didn't override), feed back into suggestion ranking over time.

**Deployment**
Move Python microservice from local dev to Railway or Fly.io so analysis works without a Mac running nearby.

**Freemium gate**
Basic auto-mix free. Advanced transitions + personalization + cloud analysis as paid tier.
```
