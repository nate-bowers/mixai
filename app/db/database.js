import * as SQLite from 'expo-sqlite';

let db;

export async function getDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync('mixai.db');
  }
  return db;
}

export async function initDatabase() {
  const database = await getDb();

  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      file_uri TEXT NOT NULL UNIQUE,
      duration REAL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL UNIQUE,
      bpm REAL,
      key TEXT,
      energy_curve TEXT,
      beat_times TEXT,
      mix_in_point REAL,
      mix_out_point REAL,
      status TEXT DEFAULT 'pending',
      analyzed_at INTEGER,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );
  `);
}

export async function insertTrack(track) {
  const database = await getDb();
  const result = await database.runAsync(
    'INSERT OR IGNORE INTO tracks (title, artist, file_uri, duration) VALUES (?, ?, ?, ?)',
    [track.title, track.artist || null, track.file_uri, track.duration || null]
  );
  return result.lastInsertRowId;
}

export async function getAllTracks() {
  const database = await getDb();
  return database.getAllAsync(`
    SELECT t.*,
           a.bpm, a.key, a.status as analysis_status,
           a.energy_curve, a.beat_times,
           a.mix_in_point, a.mix_out_point
    FROM tracks t
    LEFT JOIN analysis a ON a.track_id = t.id
    ORDER BY t.created_at DESC
  `);
}

export async function getTrackById(id) {
  const database = await getDb();
  return database.getFirstAsync(
    'SELECT t.*, a.* FROM tracks t LEFT JOIN analysis a ON a.track_id = t.id WHERE t.id = ?',
    [id]
  );
}

export async function updateTrackDuration(trackId, duration) {
  const database = await getDb();
  await database.runAsync(
    'UPDATE tracks SET duration = ? WHERE id = ?',
    [duration, trackId]
  );
}

export async function upsertAnalysis(trackId, data) {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO analysis (track_id, bpm, key, energy_curve, beat_times, mix_in_point, mix_out_point, status, analyzed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'done', strftime('%s', 'now'))
     ON CONFLICT(track_id) DO UPDATE SET
       bpm = excluded.bpm,
       key = excluded.key,
       energy_curve = excluded.energy_curve,
       beat_times = excluded.beat_times,
       mix_in_point = excluded.mix_in_point,
       mix_out_point = excluded.mix_out_point,
       status = 'done',
       analyzed_at = excluded.analyzed_at`,
    [
      trackId,
      data.bpm,
      data.key,
      JSON.stringify(data.energy_curve),
      JSON.stringify(data.beat_times),
      data.suggested_mix_in,
      data.suggested_mix_out,
    ]
  );
}

export async function setAnalysisStatus(trackId, status) {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO analysis (track_id, status) VALUES (?, ?)
     ON CONFLICT(track_id) DO UPDATE SET status = excluded.status`,
    [trackId, status]
  );
}
