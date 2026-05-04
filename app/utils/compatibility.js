/**
 * Camelot wheel + BPM compatibility scoring.
 * Returns a 0–100 integer where 100 = perfect match.
 */

// Camelot key → { num: 1-12, mode: 'A'|'B' }
function parseKey(key) {
  if (!key || typeof key !== 'string') return null;
  const match = key.match(/^(\d+)([AB])$/);
  if (!match) return null;
  return { num: parseInt(match[1], 10), mode: match[2] };
}

function camelotScore(keyA, keyB) {
  const a = parseKey(keyA);
  const b = parseKey(keyB);
  if (!a || !b) return 50; // unknown — neutral

  if (a.num === b.num && a.mode === b.mode) return 100; // identical key

  const diff = Math.abs(a.num - b.num);
  const circDiff = Math.min(diff, 12 - diff); // Camelot is circular

  if (a.num === b.num && a.mode !== b.mode) return 88; // relative major/minor
  if (circDiff === 1 && a.mode === b.mode) return 85;  // perfect 4th/5th
  if (circDiff === 1 && a.mode !== b.mode) return 65;
  if (circDiff === 2 && a.mode === b.mode) return 45;
  if (circDiff === 2 && a.mode !== b.mode) return 30;
  return Math.max(5, 25 - circDiff * 5);
}

function bpmScore(bpmA, bpmB) {
  if (!bpmA || !bpmB) return 50; // unknown — neutral

  const ratio = bpmA / bpmB;

  // Double / half time are also compatible
  const deltas = [
    Math.abs(ratio - 1),
    Math.abs(ratio - 2),
    Math.abs(ratio - 0.5),
  ];
  const closest = Math.min(...deltas);

  if (closest <= 0.02) return 100;  // <2% — perfect
  if (closest <= 0.06) return 85;   // <6% — beatmatchable
  if (closest <= 0.12) return 60;   // within our ±15% cap
  if (closest <= 0.20) return 35;
  return Math.max(5, 20 - closest * 40);
}

/**
 * Combined score: key weighted 55%, BPM 45%.
 * Returns integer 0–100.
 */
export function scoreCompatibility(refTrack, candidate) {
  if (!refTrack) return 0;
  const key = camelotScore(refTrack.key, candidate.key);
  const bpm = bpmScore(refTrack.bpm, candidate.bpm);
  return Math.round(key * 0.55 + bpm * 0.45);
}

/**
 * Given a reference track and a list of all tracks, return all candidates
 * (excluding `excludeIds`) sorted by compatibility score descending,
 * with `compatibility` property added to each.
 */
export function rankTracks(refTrack, allTracks, excludeIds = []) {
  const excludeSet = new Set(excludeIds.map(String));
  return allTracks
    .filter((t) => !excludeSet.has(String(t.id)))
    .map((t) => ({ ...t, compatibility: scoreCompatibility(refTrack, t) }))
    .sort((a, b) => b.compatibility - a.compatibility);
}
