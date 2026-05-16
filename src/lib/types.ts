export interface Song {
  id: string
  title: string | null
  project_name: string | null
  daw: string | null
  bpm: number | null
  key: string | null
  notes: string | null
  tags: string[]
  status: string[]
  cover_art: string | null
  project_file: string | null
  created_at: string
  updated_at: string
}

export interface Version {
  id: string
  song_id: string
  filename: string
  file_path: string
  duration: number | null
  waveform_data: number[] | null
  sort_order: number
  created_at: string
}

export interface Status {
  id: string
  label: string
  color: string
  sort_order: number
}

export interface Playlist {
  id: string
  name: string
  song_ids: string[]
  cover_art: string | null
  sort_order: number
  created_at: string
}
