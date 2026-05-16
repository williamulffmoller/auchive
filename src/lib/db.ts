import Database from '@tauri-apps/plugin-sql'

let _db: Database | null = null

export async function getDb(): Promise<Database> {
  if (_db) return _db
  _db = await Database.load('sqlite:auchive.db')
  await migrate(_db)
  return _db
}

async function migrate(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT,
      project_name TEXT,
      daw TEXT,
      bpm REAL,
      key TEXT,
      notes TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT '[]',
      cover_art TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      duration REAL,
      waveform_data TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS statuses (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `)
  // migrations for existing databases
  try { await db.execute('ALTER TABLE songs ADD COLUMN cover_art TEXT') } catch { /* already exists */ }
  try { await db.execute('ALTER TABLE songs ADD COLUMN project_file TEXT') } catch { /* already exists */ }
  try { await db.execute('ALTER TABLE playlists ADD COLUMN cover_art TEXT') } catch { /* already exists */ }
  try { await db.execute('ALTER TABLE playlists ADD COLUMN sort_order INTEGER DEFAULT 0') } catch { /* already exists */ }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      song_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `)
}

export async function loadAll() {
  const db = await getDb()
  const [songs, versions, statuses, playlists] = await Promise.all([
    db.select<any[]>('SELECT * FROM songs ORDER BY created_at DESC'),
    db.select<any[]>('SELECT * FROM versions ORDER BY sort_order DESC'),
    db.select<any[]>('SELECT * FROM statuses ORDER BY sort_order'),
    db.select<any[]>('SELECT * FROM playlists ORDER BY sort_order ASC, created_at DESC'),
  ])
  return {
    songs: songs.map(parseSong),
    versions: versions.map(parseVersion),
    statuses: statuses as import('./types').Status[],
    playlists: playlists.map(parsePlaylist),
  }
}

function parseSong(row: any): import('./types').Song {
  return { ...row, tags: JSON.parse(row.tags || '[]'), status: JSON.parse(row.status || '[]'), cover_art: row.cover_art ?? null, project_file: row.project_file ?? null }
}

function parseVersion(row: any): import('./types').Version {
  return { ...row, waveform_data: row.waveform_data ? JSON.parse(row.waveform_data) : null }
}

function parsePlaylist(row: any): import('./types').Playlist {
  return { ...row, song_ids: JSON.parse(row.song_ids || '[]'), cover_art: row.cover_art ?? null, sort_order: row.sort_order ?? 0 }
}
