import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { convertFileSrc } from '@tauri-apps/api/core'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { extractAndSaveCoverArt } from '../lib/coverArtExtract'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { DragDropEvent } from '@tauri-apps/api/webview'
import { pathToBlobUrl } from '../lib/coverArt'
import { getDb, loadAll } from '../lib/db'
import { DAWS, DAW_EXT_DEFAULTS } from '../lib/constants'
import type { Song, Version, Status, Playlist } from '../lib/types'
import TrackList from './TrackList'
import DetailView from './DetailView'
import PlayerBar from './PlayerBar'
import Sidebar from './Sidebar'
import PlaylistsView from './PlaylistsView'
import PlaylistDetail from './PlaylistDetail'

const DEFAULT_STATUSES: Status[] = [
  { id: 'status-default-1', label: 'Done', color: '#07ac0b', sort_order: 0 },
  { id: 'status-default-2', label: 'Almost done', color: '#3ce1a8', sort_order: 1 },
  { id: 'status-default-3', label: 'To finish', color: '#3b82f6', sort_order: 2 },
  { id: 'status-default-4', label: 'Potential', color: '#f59e0b', sort_order: 3 },
  { id: 'status-default-5', label: 'Unsure', color: '#f43f5e', sort_order: 4 },
  { id: 'status-default-6', label: 'Cancelled', color: '#374151', sort_order: 5 },
]

const AUDIO_EXTS = /\.(mp3|wav|aiff?|m4a|ogg|flac|aac)$/i


export default function Player() {
  const [songs, setSongs] = useState<Song[]>([])
  const [versions, setVersions] = useState<Version[]>([])
  const [statuses, setStatuses] = useState<Status[]>(DEFAULT_STATUSES)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)

  const [mainTab, setMainTab] = useState<'songs' | 'playlists'>('songs')
  const [filters, setFilters] = useState<{ daw: string; status: string[]; period: string }>({ daw: '', status: [], period: '' })
  const [sortMode, setSortMode] = useState<'latest' | 'original'>('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const [openSongId, setOpenSongId] = useState<string | null>(null)
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null)
  const [prevSongId, setPrevSongId] = useState<string | null>(null)
  const [showTags, setShowTags] = useState(true)
  const [showProjectFile, setShowProjectFile] = useState(() => localStorage.getItem('auchive-showProjectFile') !== 'false')
  const [showWaveforms, setShowWaveforms] = useState(true)
  const [showCovers, setShowCovers] = useState(() => localStorage.getItem('auchive-covers') === 'true')
  const [showStatus, setShowStatus] = useState(() => localStorage.getItem('auchive-showStatus') !== 'false')
  const [showBpmKey, setShowBpmKey] = useState(() => localStorage.getItem('auchive-showBpmKey') === 'true')
  const [font, setFont] = useState(() => localStorage.getItem('auchive-font') || 'sans')
  const [trackHeight, setTrackHeight] = useState(() => parseInt(localStorage.getItem('auchive-trackHeight') || '38'))
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => (localStorage.getItem('auchive-theme') as 'system' | 'light' | 'dark') || 'system')
  const [zoom, setZoom] = useState<number>(() => parseFloat(localStorage.getItem('auchive-zoom') || '1'))
  const [isDragOver, setIsDragOver] = useState(false)
  const [dawExts, setDawExts] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('auchive-dawExts') || '{}') } catch { return {} }
  })

  const openSong = songs.find(s => s.id === openSongId) ?? null
  const openPlaylist = playlists.find(p => p.id === openPlaylistId) ?? null
  const openSongIdRef = useRef(openSongId)
  useEffect(() => { openSongIdRef.current = openSongId }, [openSongId])

  const [playingVerId, setPlayingVerId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [playMode, setPlayMode] = useState<'stop' | 'next' | 'repeat'>('stop')
  const [trackLoading, setTrackLoading] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const rafRef = useRef(0)
  const playReqRef = useRef(0)
  const songsRef = useRef(songs)
  const versionsRef = useRef(versions)
  const playModeRef = useRef(playMode)
  const internalDragRef = useRef(false)
  useEffect(() => { songsRef.current = songs }, [songs])
  useEffect(() => { versionsRef.current = versions }, [versions])
  useEffect(() => { playModeRef.current = playMode }, [playMode])
  useEffect(() => {
    const validIds = new Set(statuses.map(s => s.id))
    setFilters(prev => {
      const cleaned = prev.status.filter(id => validIds.has(id))
      return cleaned.length === prev.status.length ? prev : { ...prev, status: cleaned }
    })
  }, [statuses])
  useEffect(() => {
    localStorage.setItem('auchive-theme', theme)
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const apply = () => document.documentElement.classList.toggle('dark', mq.matches)
      apply()
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }
  }, [theme])
  useEffect(() => {
    localStorage.setItem('auchive-zoom', String(zoom))
    document.documentElement.style.zoom = String(zoom)
  }, [zoom])
  useEffect(() => {
    localStorage.setItem('auchive-showStatus', String(showStatus))
  }, [showStatus])
  useEffect(() => {
    localStorage.setItem('auchive-font', font)
    document.body.style.fontFamily = font === 'serif'
      ? "'Optima', 'Optima Nova', 'Candara', sans-serif"
      : font === 'mono'
      ? "ui-monospace, 'SF Mono', 'Menlo', 'Courier New', monospace"
      : "-apple-system, 'Inter', ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
  }, [font])
  useEffect(() => {
    localStorage.setItem('auchive-trackHeight', String(trackHeight))
  }, [trackHeight])
  useEffect(() => {
    localStorage.setItem('auchive-dawExts', JSON.stringify(dawExts))
  }, [dawExts])
  useEffect(() => {
    const onDragStart = () => { internalDragRef.current = true }
    const onDragEnd = () => { internalDragRef.current = false }
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragend', onDragEnd)
    return () => {
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('dragend', onDragEnd)
    }
  }, [])

  const latestVer = useCallback((songId: string) => {
    const vers = versions.filter(v => v.song_id === songId)
    if (!vers.length) return null
    return vers.sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))[0]
  }, [versions])

  useEffect(() => {
    if (!openSongId) return
    const playingVerSongId = versions.find(v => v.id === playingVerId)?.song_id
    if (playingVerSongId !== openSongId) {
      const latest = latestVer(openSongId)
      if (latest) setPlayingVerId(latest.id)
    }
  }, [openSongId])

  useEffect(() => {
    async function load() {
      try {
        const data = await loadAll()
        setSongs(data.songs)
        setVersions(data.versions)
        setPlaylists(data.playlists)
        if (data.statuses.length > 0) {
          setStatuses(data.statuses)
        } else {
          const db = await getDb()
          for (const s of DEFAULT_STATUSES) {
            await db.execute('INSERT OR IGNORE INTO statuses (id, label, color, sort_order) VALUES (?, ?, ?, ?)',
              [s.id, s.label, s.color, s.sort_order])
          }
        }
      } catch (e) {
        console.error('DB load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Global file drop via Tauri v2 webview drag events
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event: { payload: DragDropEvent }) => {
      const payload = event.payload
      if (internalDragRef.current) return
      if (payload.type === 'enter') {
        if ((payload.paths as string[]).length > 0) setIsDragOver(true)
      } else if (payload.type === 'leave') {
        setIsDragOver(false)
      } else if (payload.type === 'drop') {
        setIsDragOver(false)
        const audioPaths = payload.paths.filter((p: string) => AUDIO_EXTS.test(p))
        if (!audioPaths.length) return
        if (openSongIdRef.current) {
          audioPaths.forEach((p: string) => addVersionByPath(p, openSongIdRef.current!))
        } else {
          addSongsByPath(audioPaths)
        }
      }
    })
    return () => { unlisten.then((f: () => void) => f()) }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' && e.target instanceof Element && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault()
        if (!audioRef.current) return
        if (audioRef.current.paused) { audioRef.current.play(); setIsPlaying(true) }
        else { audioRef.current.pause(); setIsPlaying(false) }
      }
      if (e.metaKey && e.code === 'KeyR') {
        e.preventDefault()
        void invoke('reload_window')
      }
      if (e.metaKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setZoom(z => Math.round(Math.min(z * 10 + 1, 15)) / 10)
      }
      if (e.metaKey && e.key === '-') {
        e.preventDefault()
        setZoom(z => Math.round(Math.max(z * 10 - 1, 7)) / 10)
      }
      if (e.metaKey && e.key === '0') {
        e.preventDefault()
        setZoom(1)
      }
      if (e.altKey && e.code === 'ArrowUp') {
        e.preventDefault()
        setTrackHeight(h => Math.min(h + 4, 96))
      }
      if (e.altKey && e.code === 'ArrowDown') {
        e.preventDefault()
        setTrackHeight(h => Math.max(h - 4, 20))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function cleanupAudio() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    cancelAnimationFrame(rafRef.current)
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
  }

  async function playVersion(ver: Version, seekPct?: number) {
    if (playingVerId === ver.id && seekPct === undefined) {
      if (audioRef.current?.paused) { audioRef.current.play(); setIsPlaying(true) }
      else { audioRef.current?.pause(); setIsPlaying(false) }
      return
    }
    cleanupAudio()
    const reqId = ++playReqRef.current
    setPlayingVerId(ver.id)
    setProgress(0); setDuration(0); setTrackLoading(true)
    try {
      // convertFileSrc is synchronous — no async gap before audio.play(), preserving user gesture context
      const src = convertFileSrc(ver.file_path)
      const audio = new Audio(src)
      audio.volume = volume
      audioRef.current = audio
      audio.addEventListener('loadedmetadata', () => {
        if (reqId !== playReqRef.current) return
        setDuration(audio.duration); setTrackLoading(false)
        if (seekPct !== undefined) audio.currentTime = seekPct * audio.duration
      }, { once: true })
      audio.addEventListener('ended', () => {
        setIsPlaying(false); setProgress(0); cancelAnimationFrame(rafRef.current)
        const mode = playModeRef.current
        if (mode === 'repeat') playVersion(ver)
        else if (mode === 'next') skipNext(ver)
      })
      const tick = () => { setProgress(audio.currentTime); rafRef.current = requestAnimationFrame(tick) }
      await audio.play()
      if (reqId !== playReqRef.current) { audio.pause(); return }
      setIsPlaying(true); rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      if (reqId !== playReqRef.current) return
      console.error('Playback error:', err); setTrackLoading(false); setPlayingVerId(null)
    }
  }

  function skipNext(fromVer: Version) {
    const song = songsRef.current.find(s => s.id === fromVer.song_id)
    if (!song) return
    const idx = songsRef.current.findIndex(s => s.id === song.id)
    if (idx === -1 || idx >= songsRef.current.length - 1) return
    const nextSong = songsRef.current[idx + 1]
    const vers = versionsRef.current.filter(v => v.song_id === nextSong.id)
    if (!vers.length) return
    playVersion(vers.sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))[0])
  }

  function skipBack() {
    if (audioRef.current && audioRef.current.currentTime > 3) { audioRef.current.currentTime = 0; return }
    const playingVer = versionsRef.current.find(v => v.id === playingVerId)
    if (!playingVer) return
    const song = songsRef.current.find(s => s.id === playingVer.song_id)
    if (!song) return
    const idx = songsRef.current.findIndex(s => s.id === song.id)
    if (idx <= 0) return
    const prevSong = songsRef.current[idx - 1]
    const vers = versionsRef.current.filter(v => v.song_id === prevSong.id)
    if (!vers.length) return
    playVersion(vers.sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))[0])
  }

  function seek(t: number) { if (audioRef.current) { audioRef.current.currentTime = t; setProgress(t) } }
  function changeVolume(v: number) { setVolume(v); if (audioRef.current) audioRef.current.volume = v }

  async function openFilePicker() {
    const result = await open({ multiple: true, filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'aiff', 'aif', 'm4a', 'ogg', 'flac', 'aac'] }] })
    if (!result) return
    await addSongsByPath(Array.isArray(result) ? result : [result])
  }

  async function addSongsByPath(paths: string[]) {
    const db = await getDb()
    for (const filePath of paths) {
      const filename = filePath.split('/').pop() || filePath
      const now = new Date().toISOString()
      const songId = crypto.randomUUID(), verId = crypto.randomUUID()
      const [dur, waveform, coverPath] = await Promise.all([getAudioDuration(filePath), extractPeaks(filePath), extractAndSaveCoverArt(filePath)])
      await db.execute('INSERT INTO songs (id, title, project_name, daw, bpm, key, notes, tags, status, cover_art, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [songId, null, filename.replace(/\.[^.]+$/, ''), null, null, null, null, '[]', '[]', coverPath, now, now])
      await db.execute('INSERT INTO versions (id, song_id, filename, file_path, duration, waveform_data, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [verId, songId, filename, filePath, dur, JSON.stringify(waveform), 0, now])
      setSongs(prev => [{ id: songId, title: null, project_name: filename.replace(/\.[^.]+$/, ''), daw: null, bpm: null, key: null, notes: null, tags: [], status: [], cover_art: coverPath, project_file: null, created_at: now, updated_at: now }, ...prev])
      setVersions(prev => [{ id: verId, song_id: songId, filename, file_path: filePath, duration: dur, waveform_data: waveform, sort_order: 0, created_at: now }, ...prev])
    }
  }

  async function addVersionByPath(filePath: string, songId: string) {
    const db = await getDb()
    const filename = filePath.split('/').pop() || filePath
    const now = new Date().toISOString()
    const verId = crypto.randomUUID()
    const existingSong = songsRef.current.find(s => s.id === songId)
    const [dur, waveform, coverPath] = await Promise.all([
      getAudioDuration(filePath),
      extractPeaks(filePath),
      existingSong?.cover_art ? Promise.resolve(null) : extractAndSaveCoverArt(filePath),
    ])
    const existing = versionsRef.current.filter(v => v.song_id === songId)
    const maxOrder = existing.length ? Math.max(...existing.map(v => v.sort_order ?? 0)) : -1
    await db.execute('INSERT INTO versions (id, song_id, filename, file_path, duration, waveform_data, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [verId, songId, filename, filePath, dur, JSON.stringify(waveform), maxOrder + 1, now])
    setVersions(prev => [...prev, { id: verId, song_id: songId, filename, file_path: filePath, duration: dur, waveform_data: waveform, sort_order: maxOrder + 1, created_at: now }])
    if (coverPath && existingSong && !existingSong.cover_art) {
      await updateCoverArt(songId, coverPath)
    }
  }

  async function openVersionPicker(songId: string) {
    const result = await open({ multiple: false, filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'aiff', 'aif', 'm4a', 'ogg', 'flac', 'aac'] }] })
    if (!result) return
    await addVersionByPath(Array.isArray(result) ? result[0] : result, songId)
  }

  async function deleteVersion(ver: Version) {
    const db = await getDb()
    await db.execute('DELETE FROM versions WHERE id = ?', [ver.id])
    setVersions(prev => prev.filter(v => v.id !== ver.id))
    if (playingVerId === ver.id) { cleanupAudio(); setPlayingVerId(null); setIsPlaying(false) }
  }

  async function deleteSong(songId: string) {
    const db = await getDb()
    await db.execute('DELETE FROM songs WHERE id = ?', [songId])
    setVersions(prev => prev.filter(v => v.song_id !== songId))
    setSongs(prev => prev.filter(s => s.id !== songId))
    const affected = playlists.filter(p => p.song_ids.includes(songId))
    for (const pl of affected) {
      const newIds = pl.song_ids.filter(id => id !== songId)
      await db.execute('UPDATE playlists SET song_ids=? WHERE id=?', [JSON.stringify(newIds), pl.id])
    }
    if (affected.length) setPlaylists(prev => prev.map(p => p.song_ids.includes(songId) ? { ...p, song_ids: p.song_ids.filter(id => id !== songId) } : p))
    if (openSongId === songId) setOpenSongId(null)
    if (versionsRef.current.filter(v => v.song_id === songId).some(v => v.id === playingVerId)) {
      cleanupAudio(); setPlayingVerId(null); setIsPlaying(false)
    }
  }

  async function updateSong(songId: string, updates: Partial<Song>) {
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute('UPDATE songs SET title=?, project_name=?, daw=?, bpm=?, key=?, notes=?, tags=?, status=?, updated_at=? WHERE id=?',
      [updates.title ?? null, updates.project_name ?? null, updates.daw ?? null, updates.bpm ?? null, updates.key ?? null, updates.notes ?? null, JSON.stringify(updates.tags ?? []), JSON.stringify(updates.status ?? []), now, songId])
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, ...updates, updated_at: now } : s))
  }

  async function addStatus(label: string, color: string) {
    const db = await getDb()
    const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
    const sort_order = statuses.length
    await db.execute('INSERT INTO statuses (id, label, color, sort_order) VALUES (?, ?, ?, ?)', [id, label, color, sort_order])
    setStatuses(prev => [...prev, { id, label, color, sort_order }])
  }

  async function editStatus(id: string, label: string, color: string) {
    const db = await getDb()
    await db.execute('UPDATE statuses SET label=?, color=? WHERE id=?', [label, color, id])
    setStatuses(prev => prev.map(s => s.id === id ? { ...s, label, color } : s))
  }

  async function reorderStatuses(ids: string[]) {
    const db = await getDb()
    for (let i = 0; i < ids.length; i++) {
      await db.execute('UPDATE statuses SET sort_order=? WHERE id=?', [i, ids[i]])
    }
    setStatuses(prev => ids.map((id, i) => ({ ...prev.find(s => s.id === id)!, sort_order: i })))
  }

  async function deleteStatus(id: string) {
    const db = await getDb()
    await db.execute('DELETE FROM statuses WHERE id=?', [id])
    setStatuses(prev => prev.filter(s => s.id !== id))
    setFilters(prev => prev.status.includes(id) ? { ...prev, status: prev.status.filter(s => s !== id) } : prev)
  }

  async function updateCoverArt(songId: string, path: string | null) {
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute('UPDATE songs SET cover_art=?, updated_at=? WHERE id=?', [path, now, songId])
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, cover_art: path, updated_at: now } : s))
  }

  async function pickCoverArt(songId: string) {
    const result = await open({ multiple: false, filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] })
    if (!result) return
    const path = Array.isArray(result) ? result[0] : result
    await updateCoverArt(songId, path)
  }

  async function updatePlaylistCoverArt(playlistId: string, path: string | null) {
    const db = await getDb()
    await db.execute('UPDATE playlists SET cover_art=? WHERE id=?', [path, playlistId])
    setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, cover_art: path } : p))
  }

  async function pickPlaylistCoverArt(playlistId: string) {
    const result = await open({ multiple: false, filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] })
    if (!result) return
    await updatePlaylistCoverArt(playlistId, Array.isArray(result) ? result[0] : result)
  }

  async function updateProjectFile(songId: string, path: string | null) {
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute('UPDATE songs SET project_file=?, updated_at=? WHERE id=?', [path, now, songId])
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, project_file: path, updated_at: now } : s))
  }

  async function pickProjectFile(songId: string) {
    const result = await open({ multiple: false })
    if (!result) return
    const path = Array.isArray(result) ? result[0] : result
    await updateProjectFile(songId, path)
    const ext = path.split('.').pop()?.toLowerCase()
    const detectedDaw = ext ? (dawExts[ext] || DAW_EXT_DEFAULTS[ext] || null) : null
    if (detectedDaw) {
      const song = songs.find(s => s.id === songId)
      if (song) await updateSong(songId, { title: song.title, project_name: song.project_name, daw: detectedDaw, notes: song.notes, tags: song.tags, status: song.status })
    }
  }

  async function openProjectFolder(songId: string) {
    const song = songs.find(s => s.id === songId)
    if (!song?.project_file) return
    await revealItemInDir(song.project_file)
  }

  async function reorderPlaylistsOrder(orderedIds: string[]) {
    const db = await getDb()
    for (let i = 0; i < orderedIds.length; i++) {
      await db.execute('UPDATE playlists SET sort_order=? WHERE id=?', [i, orderedIds[i]])
    }
    setPlaylists(prev => {
      const map = new Map(prev.map(p => [p.id, p]))
      return orderedIds.map((id, i) => ({ ...map.get(id)!, sort_order: i }))
    })
  }

  async function newPlaylist() {
    const db = await getDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const sort_order = 0
    await db.execute('UPDATE playlists SET sort_order = sort_order + 1')
    await db.execute('INSERT INTO playlists (id, name, song_ids, sort_order, created_at) VALUES (?, ?, ?, ?, ?)', [id, '', '[]', sort_order, now])
    const pl: Playlist = { id, name: '', song_ids: [], cover_art: null, sort_order, created_at: now }
    setPlaylists(prev => [pl, ...prev.map(p => ({ ...p, sort_order: p.sort_order + 1 }))])
    setMainTab('playlists')
    setOpenPlaylistId(id)
  }

  async function renamePlaylist(id: string, name: string) {
    const db = await getDb()
    await db.execute('UPDATE playlists SET name=? WHERE id=?', [name, id])
    setPlaylists(prev => prev.map(p => p.id === id ? { ...p, name } : p))
  }

  async function deletePlaylist(id: string) {
    const db = await getDb()
    await db.execute('DELETE FROM playlists WHERE id=?', [id])
    setPlaylists(prev => prev.filter(p => p.id !== id))
    if (openPlaylistId === id) setOpenPlaylistId(null)
  }

  async function addSongToPlaylist(playlistId: string, songId: string) {
    const pl = playlists.find(p => p.id === playlistId)
    if (!pl || pl.song_ids.includes(songId)) return
    const newIds = [...pl.song_ids, songId]
    const db = await getDb()
    await db.execute('UPDATE playlists SET song_ids=? WHERE id=?', [JSON.stringify(newIds), playlistId])
    setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, song_ids: newIds } : p))
  }

  async function removeSongFromPlaylist(playlistId: string, songId: string) {
    const pl = playlists.find(p => p.id === playlistId)
    if (!pl) return
    const newIds = pl.song_ids.filter(id => id !== songId)
    const db = await getDb()
    await db.execute('UPDATE playlists SET song_ids=? WHERE id=?', [JSON.stringify(newIds), playlistId])
    setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, song_ids: newIds } : p))
  }

  async function setStatusQuick(songId: string, statusIds: string[]) {
    const song = songs.find(s => s.id === songId)
    if (!song) return
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute('UPDATE songs SET status=?, updated_at=? WHERE id=?', [JSON.stringify(statusIds), now, songId])
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, status: statusIds, updated_at: now } : s))
  }

  async function updateVersion(verId: string, updates: Partial<Version>) {
    const db = await getDb()
    if (updates.created_at !== undefined) {
      await db.execute('UPDATE versions SET created_at=? WHERE id=?', [updates.created_at, verId])
    }
    setVersions(prev => prev.map(v => v.id === verId ? { ...v, ...updates } : v))
  }

  async function reorderVersions(_songId: string, orderedIds: string[]) {
    const db = await getDb()
    for (let i = 0; i < orderedIds.length; i++) {
      await db.execute('UPDATE versions SET sort_order=? WHERE id=?', [orderedIds.length - 1 - i, orderedIds[i]])
    }
    setVersions(prev => prev.map(v => {
      const idx = orderedIds.indexOf(v.id)
      return idx === -1 ? v : { ...v, sort_order: orderedIds.length - 1 - idx }
    }))
  }

  async function reorderPlaylist(playlistId: string, newOrder: string[]) {
    const db = await getDb()
    await db.execute('UPDATE playlists SET song_ids=? WHERE id=?', [JSON.stringify(newOrder), playlistId])
    setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, song_ids: newOrder } : p))
  }

  async function factoryReset() {
    const db = await getDb()
    await db.execute('DELETE FROM songs')
    await db.execute('DELETE FROM versions')
    await db.execute('DELETE FROM statuses')
    await db.execute('DELETE FROM playlists')
    for (const s of DEFAULT_STATUSES) {
      await db.execute('INSERT INTO statuses (id, label, color, sort_order) VALUES (?, ?, ?, ?)', [s.id, s.label, s.color, s.sort_order])
    }
    cleanupAudio()
    setSongs([])
    setVersions([])
    setStatuses(DEFAULT_STATUSES)
    setPlaylists([])
    setFilters({ daw: '', status: [], period: '' })
    setOpenSongId(null)
    setOpenPlaylistId(null)
    setSearchQuery('')
    setPlayingVerId(null)
    setIsPlaying(false)
    setTheme('system')
    setZoom(1)
    localStorage.removeItem('auchive-theme')
    localStorage.removeItem('auchive-zoom')
  }

  async function backupData() {
    const settingsData = { theme, font, zoom, trackHeight, dawExts, showStatus, showCovers, showTags, showWaveforms }
    const json = JSON.stringify({ version: 1, timestamp: new Date().toISOString(), songs, versions, statuses, playlists, settings: settingsData }, null, 2)
    const savePath = await save({
      defaultPath: `auchive-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Auchive Backup', extensions: ['json'] }],
    })
    if (!savePath) return
    await writeFile(savePath, new TextEncoder().encode(json))
  }

  async function restoreData() {
    const result = await open({ multiple: false, filters: [{ name: 'Auchive Backup', extensions: ['json'] }] })
    if (!result) return
    const filePath = Array.isArray(result) ? result[0] : result
    let backup: { version?: number; songs: Song[]; versions: Version[]; statuses: Status[]; playlists: Playlist[]; settings?: Record<string, unknown> }
    try {
      const bytes = await readFile(filePath)
      backup = JSON.parse(new TextDecoder().decode(bytes))
      if (!Array.isArray(backup.songs) || !Array.isArray(backup.versions)) throw new Error('Invalid')
    } catch {
      alert('Failed to read backup file. It may be corrupted or invalid.')
      return
    }
    if (!window.confirm(`Restore from backup? This will replace your current ${backup.songs.length} song(s) and all playlists. This cannot be undone.`)) return
    try {
      const db = await getDb()
      await db.execute('DELETE FROM songs')
      await db.execute('DELETE FROM versions')
      await db.execute('DELETE FROM statuses')
      await db.execute('DELETE FROM playlists')
      for (const s of backup.songs) {
        await db.execute('INSERT INTO songs (id, title, project_name, daw, bpm, key, notes, tags, status, cover_art, project_file, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [s.id, s.title ?? null, s.project_name ?? null, s.daw ?? null, s.bpm ?? null, s.key ?? null, s.notes ?? null, JSON.stringify(s.tags ?? []), JSON.stringify(s.status ?? []), s.cover_art ?? null, s.project_file ?? null, s.created_at, s.updated_at])
      }
      for (const v of backup.versions) {
        await db.execute('INSERT INTO versions (id, song_id, filename, file_path, duration, waveform_data, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [v.id, v.song_id, v.filename, v.file_path, v.duration ?? null, JSON.stringify(v.waveform_data ?? []), v.sort_order ?? 0, v.created_at])
      }
      for (const st of backup.statuses) {
        await db.execute('INSERT INTO statuses (id, label, color, sort_order) VALUES (?, ?, ?, ?)', [st.id, st.label, st.color, st.sort_order ?? 0])
      }
      for (const pl of backup.playlists) {
        await db.execute('INSERT INTO playlists (id, name, song_ids, cover_art, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [pl.id, pl.name ?? '', JSON.stringify(pl.song_ids ?? []), pl.cover_art ?? null, pl.sort_order ?? 0, pl.created_at])
      }
      const s = backup.settings ?? {}
      if (typeof s.theme === 'string') setTheme(s.theme as 'system' | 'light' | 'dark')
      if (typeof s.font === 'string') setFont(s.font)
      if (typeof s.zoom === 'number') setZoom(s.zoom)
      if (typeof s.trackHeight === 'number') setTrackHeight(s.trackHeight)
      if (s.dawExts && typeof s.dawExts === 'object') setDawExts(s.dawExts as Record<string, string>)
      if (typeof s.showStatus === 'boolean') setShowStatus(s.showStatus)
      if (typeof s.showCovers === 'boolean') setShowCovers(s.showCovers)
      if (typeof s.showTags === 'boolean') setShowTags(s.showTags)
      if (typeof s.showWaveforms === 'boolean') setShowWaveforms(s.showWaveforms)
      cleanupAudio()
      setSongs(backup.songs)
      setVersions(backup.versions)
      setStatuses(backup.statuses.length > 0 ? backup.statuses : DEFAULT_STATUSES)
      setPlaylists(backup.playlists)
      setPlayingVerId(null); setIsPlaying(false)
      setOpenSongId(null); setOpenPlaylistId(null)
      setFilters({ daw: '', status: [], period: '' })
    } catch (e) {
      console.error('Restore error:', e)
      alert('Restore failed. ' + String(e))
    }
  }

  const allDaws = [...DAWS, ...Object.values(dawExts).filter(d => !DAWS.includes(d))]

  const playingVer = versions.find(v => v.id === playingVerId) ?? null
  const playingSong = playingVer ? songs.find(s => s.id === playingVer.song_id) ?? null : null

  const playingCoverArtPath = (() => {
    if (!playingSong) return null
    if (playingSong.cover_art) return playingSong.cover_art
    const eligible = playlists
      .filter(p => p.song_ids.includes(playingSong.id) && p.cover_art)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return eligible[0]?.cover_art ?? null
  })()

  const [playingCoverArtUrl, setPlayingCoverArtUrl] = useState<string | null>(null)
  const coverArtBlobRef = useRef<string | null>(null)
  useEffect(() => {
    const path = playingCoverArtPath
    if (!path) {
      if (coverArtBlobRef.current) { URL.revokeObjectURL(coverArtBlobRef.current); coverArtBlobRef.current = null }
      setPlayingCoverArtUrl(null)
      return
    }
    let cancelled = false
    pathToBlobUrl(path).then(url => {
      if (cancelled) return
      if (coverArtBlobRef.current) URL.revokeObjectURL(coverArtBlobRef.current)
      coverArtBlobRef.current = url
      setPlayingCoverArtUrl(url)
    })
    return () => { cancelled = true }
  }, [playingCoverArtPath])

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontSize: 13, color: 'var(--muted)' }}>Loading…</div>
  )

  function getSongDisplayTitle(s: Song) {
    if (s.title?.trim()) return s.title.trim()
    const v = latestVer(s.id)
    if (v?.filename) return v.filename.replace(/\.[^.]+$/, '')
    return s.project_name?.trim() || 'Untitled'
  }

  function renderMain() {
    const prevSong = prevSongId ? songs.find(s => s.id === prevSongId) ?? null : null

    if (openSong) {
      const backLabel = openPlaylist ? (openPlaylist.name?.trim() || 'Untitled playlist') : 'Songs'
      return (
        <DetailView
          song={openSong} versions={versions.filter(v => v.song_id === openSong.id)}
          statuses={statuses} songs={songs} playlists={playlists}
          playingVerId={playingVerId} isPlaying={isPlaying}
          progress={progress} duration={duration} onPlay={playVersion} onSeek={seek}
          backLabel={backLabel}
          onBack={() => setOpenSongId(null)} onUpdateSong={updateSong}
          onDeleteSong={deleteSong} onDeleteVersion={deleteVersion}
          onAddVersion={() => openVersionPicker(openSong.id)}
          onUpdateVersion={updateVersion}
          onReorderVersions={reorderVersions}
          onPickCoverArt={() => pickCoverArt(openSong.id)}
          onRemoveCoverArt={() => updateCoverArt(openSong.id, null)}
          onPickProjectFile={() => pickProjectFile(openSong.id)}
          onOpenProjectFolder={() => openProjectFolder(openSong.id)}
          onAddToPlaylist={addSongToPlaylist}
          onRemoveFromPlaylist={removeSongFromPlaylist}
          onOpenPlaylist={id => { setPrevSongId(openSongId); setOpenPlaylistId(id); setOpenSongId(null); setMainTab('playlists') }}
          isDragOver={isDragOver}
          daws={allDaws}
          zoom={zoom}
        />
      )
    }
    if (mainTab === 'playlists') {
      if (openPlaylist) {
        const backLabel = prevSong ? getSongDisplayTitle(prevSong) : 'Playlists'
        return (
          <PlaylistDetail
            playlist={openPlaylist} songs={songs} statuses={statuses}
            playingVerId={playingVerId} isPlaying={isPlaying} progress={progress} duration={duration}
            onPlay={playVersion} onSeek={seek}
            backLabel={backLabel}
            onBack={() => {
              if (prevSongId) { setOpenSongId(prevSongId); setPrevSongId(null) }
              else setOpenPlaylistId(null)
            }}
            onRename={renamePlaylist} onDelete={deletePlaylist}
            onAddSong={addSongToPlaylist} onRemoveSong={removeSongFromPlaylist}
            onReorder={reorderPlaylist} latestVer={latestVer}
            onPickCoverArt={() => pickPlaylistCoverArt(openPlaylist.id)}
            onRemoveCoverArt={() => updatePlaylistCoverArt(openPlaylist.id, null)}
            onOpenSong={id => setOpenSongId(id)}
            filters={filters}
            zoom={zoom}
            showTags={showTags} showWaveforms={showWaveforms} showStatus={showStatus}
            showBpmKey={showBpmKey} showProjectFile={showProjectFile}
            trackHeight={trackHeight}
          />
        )
      }
      return (
        <PlaylistsView playlists={playlists} songs={songs}
          onOpen={id => { setPrevSongId(null); setOpenPlaylistId(id) }} onNew={newPlaylist} onAddSongs={openFilePicker}
          mainTab={mainTab} setMainTab={t => { setMainTab(t); setOpenSongId(null); setOpenPlaylistId(null) }}
          onReorderPlaylists={reorderPlaylistsOrder}
          isDragOver={isDragOver} />
      )
    }
    return (
      <TrackList
        songs={songs} versions={versions} statuses={statuses}
        filters={filters} sortMode={sortMode}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        playingVerId={playingVerId} isPlaying={isPlaying}
        progress={progress} duration={duration}
        onPlay={playVersion} onSeek={seek}
        onOpenSong={id => { setOpenSongId(id); setOpenPlaylistId(null) }}
        onAddSongs={openFilePicker} latestVer={latestVer}
        playlists={playlists}
        showTags={showTags} showProjectFile={showProjectFile} showWaveforms={showWaveforms} showCovers={showCovers} showStatus={showStatus} showBpmKey={showBpmKey}
        trackHeight={trackHeight} zoom={zoom}
        mainTab={mainTab} setMainTab={t => { setMainTab(t); setOpenSongId(null); setOpenPlaylistId(null) }}
        onNewPlaylist={newPlaylist} isDragOver={isDragOver} onSetStatus={setStatusQuick}
      />
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar
        songs={songs} versions={versions} statuses={statuses}
        filters={filters} setFilters={setFilters}
        sortMode={sortMode} setSortMode={setSortMode}
        showTags={showTags} setShowTags={setShowTags}
        showBpmKey={showBpmKey} setShowBpmKey={v => { setShowBpmKey(v); localStorage.setItem('auchive-showBpmKey', String(v)) }}
        showProjectFile={showProjectFile} setShowProjectFile={v => { setShowProjectFile(v); localStorage.setItem('auchive-showProjectFile', String(v)) }}
        showWaveforms={showWaveforms} setShowWaveforms={setShowWaveforms}
        showCovers={showCovers} setShowCovers={v => { setShowCovers(v); localStorage.setItem('auchive-covers', String(v)) }}
        showStatus={showStatus} setShowStatus={setShowStatus}
        theme={theme} setTheme={setTheme}
        zoom={zoom} setZoom={setZoom}
        font={font} setFont={setFont}
        trackHeight={trackHeight} setTrackHeight={setTrackHeight}
        playlistCount={playlists.length} daws={allDaws} playerVisible={!!playingVer}
        onAddStatus={addStatus} onEditStatus={editStatus} onDeleteStatus={deleteStatus} onReorderStatuses={reorderStatuses}
        onFactoryReset={factoryReset}
        onBackup={backupData} onRestore={restoreData}
        dawExts={dawExts} onUpdateDawExts={setDawExts}
        onNavigate={tab => { setMainTab(tab); setOpenSongId(null); setOpenPlaylistId(null) }}
        onGoHome={() => { setOpenSongId(null); setOpenPlaylistId(null); setMainTab('songs') }}
      />
      <div style={{ flex: 1, overflowY: 'auto', height: '100vh', background: 'var(--bg)', paddingBottom: playingVer ? 88 : 24 }}>
        {renderMain()}
      </div>
      {isDragOver && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-card">
            <div style={{ fontSize: 32, marginBottom: 10 }}>♪</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {openSongId ? 'Drop to add version' : 'Drop files to add tracks'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              {openSongId ? 'Will be added to this song' : 'mp3, wav, aiff, m4a, flac…'}
            </div>
          </div>
        </div>
      )}
      {(playingVer || trackLoading) && (
        <PlayerBar
          version={playingVer!} song={playingSong} coverArtUrl={playingCoverArtUrl}
          isPlaying={isPlaying} isLoading={trackLoading}
          progress={progress} duration={duration} volume={volume} playMode={playMode}
          onPlayPause={() => { if (audioRef.current?.paused) { audioRef.current.play(); setIsPlaying(true) } else { audioRef.current?.pause(); setIsPlaying(false) } }}
          onSeek={seek} onVolume={changeVolume}
          onSkipNext={() => { if (playingVer) skipNext(playingVer) }}
          onSkipBack={skipBack}
          onCycleMode={() => setPlayMode(m => m === 'stop' ? 'next' : m === 'next' ? 'repeat' : 'stop')}
          onGoToSong={() => { if (playingVer) { setOpenSongId(playingVer.song_id); setOpenPlaylistId(null) } }}
        />
      )}
    </div>
  )
}

async function readFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  const bytes = await readFile(filePath)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise(async res => {
    try {
      const buf = await readFileAsArrayBuffer(filePath)
      const ctx = new AudioContext()
      const decoded = await ctx.decodeAudioData(buf)
      res(decoded.duration); ctx.close()
    } catch { res(0) }
  })
}

async function extractPeaks(filePath: string): Promise<number[]> {
  try {
    const buf = await readFileAsArrayBuffer(filePath)
    const ctx = new AudioContext()
    const decoded = await ctx.decodeAudioData(buf)
    const data = decoded.getChannelData(0)
    const samples = 800
    const blockSize = Math.floor(data.length / samples)
    const peaks: number[] = []
    for (let i = 0; i < samples; i++) {
      let max = 0
      for (let j = 0; j < blockSize; j++) max = Math.max(max, Math.abs(data[i * blockSize + j]))
      peaks.push(Math.round(max * 1000) / 1000)
    }
    ctx.close(); return peaks
  } catch { return [] }
}
