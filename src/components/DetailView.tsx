import { useState, useEffect, useRef } from 'react'
import type { Song, Version, Status, Playlist } from '../lib/types'
import { pathToBlobUrl } from '../lib/coverArt'
import { DAWS } from '../lib/constants'
import Waveform from './Waveform'

interface Props {
  song: Song
  versions: Version[]
  statuses: Status[]
  songs: Song[]
  playlists: Playlist[]
  playingVerId: string | null
  isPlaying: boolean
  progress: number
  duration: number
  onPlay: (ver: Version, seekPct?: number) => void
  onSeek: (t: number) => void
  backLabel: string
  onBack: () => void
  onUpdateSong: (id: string, updates: Partial<Song>) => Promise<void>
  onDeleteSong: (id: string) => void
  onDeleteVersion: (ver: Version) => void
  onAddVersion: () => void
  onReorderVersions: (songId: string, orderedIds: string[]) => void
  onPickCoverArt: () => void
  onRemoveCoverArt: () => void
  onPickProjectFile: () => void
  onOpenProjectFolder: () => void
  onUpdateVersion: (id: string, updates: Partial<Version>) => Promise<void>
  onAddToPlaylist: (playlistId: string, songId: string) => void
  onRemoveFromPlaylist: (playlistId: string, songId: string) => void
  onOpenPlaylist: (id: string) => void
  isDragOver: boolean
  daws?: string[]
  zoom?: number
}

function fmt(s?: number | null) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}


function FeaturedPlaylistRow({ playlist, songs, onOpen, onRemove }: { playlist: Playlist; songs: Song[]; onOpen: () => void; onRemove: () => void }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  useEffect(() => {
    const coverPath = playlist.cover_art ?? songs.find(s => playlist.song_ids.includes(s.id) && s.cover_art)?.cover_art ?? null
    if (!coverPath) { setThumbUrl(null); return }
    let blobUrl: string | null = null
    let cancelled = false
    pathToBlobUrl(coverPath).then(u => {
      if (cancelled) return
      blobUrl = u; setThumbUrl(u)
    })
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [playlist.cover_art, playlist.song_ids.join(','), songs])

  return (
    <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 4px', borderRadius: 5, cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <div style={{ width: 36, height: 36, borderRadius: 5, background: 'var(--border)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {thumbUrl ? <img src={thumbUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 12, color: 'var(--faint)' }}>♪</span>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {playlist.name || 'Untitled playlist'}
      </div>
      <button onClick={e => { e.stopPropagation(); onRemove() }}
        style={{ background: 'none', border: 'none', fontSize: 16, color: 'var(--faint)', cursor: 'pointer', padding: '0 3px', lineHeight: 1, flexShrink: 0, fontFamily: 'inherit' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>×</button>
    </div>
  )
}

export default function DetailView({ song, versions, statuses, songs, playlists, playingVerId, isPlaying, progress, duration, onPlay, onSeek, backLabel, onBack, onUpdateSong, onDeleteSong, onDeleteVersion, onAddVersion, onUpdateVersion, onReorderVersions, onPickCoverArt, onRemoveCoverArt, onPickProjectFile, onOpenProjectFolder, onAddToPlaylist, onRemoveFromPlaylist, onOpenPlaylist, isDragOver, daws = DAWS, zoom = 1 }: Props) {
  const [tab, setTab] = useState<'versions' | 'details'>('details')
  const [activeVerId, setActiveVerId] = useState<string | null>(versions[0]?.id ?? null)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const playlistPickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showPlaylistPicker) return
    function onDown(e: MouseEvent) {
      if (playlistPickerRef.current && !playlistPickerRef.current.contains(e.target as Node)) {
        setShowPlaylistPicker(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showPlaylistPicker])
  const [dragVerIdx, setDragVerIdx] = useState<number | null>(null)
  const [dragVerInsertIdx, setDragVerInsertIdx] = useState<number | null>(null)
  const dragVerSrcRef = useRef<number | null>(null)
  const dragVerInsertRef = useRef<number | null>(null)
  const dragVerStartXRef = useRef(0)
  const dragVerStartYRef = useRef(0)
  const dragVerActiveRef = useRef(false)
  const suppressVerClickRef = useRef(false)
  const ghostVerRef = useRef<HTMLDivElement>(null)
  const ghostVerTitleRef = useRef<HTMLSpanElement>(null)
  const [confirmDeleteTrack, setConfirmDeleteTrack] = useState(false)
  const [confirmDeleteVerId, setConfirmDeleteVerId] = useState<string | null>(null)

  const sorted = [...versions].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))
  const activeVer = sorted.find(v => v.id === activeVerId) ?? sorted[0]

  const [title, setTitle] = useState(song.title || '')
  const projectName = song.project_name || ''
  const [daw, setDaw] = useState(song.daw || '')
  const [bpm, setBpm] = useState(song.bpm !== null ? String(song.bpm) : '')
  const [key, setKey] = useState(song.key ?? '')
  const [notes, setNotes] = useState(song.notes || '')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(song.tags || [])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(song.status || [])
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [editingDateVerId, setEditingDateVerId] = useState<string | null>(null)
  const [editingDateValue, setEditingDateValue] = useState('')
  const [coverArtUrl, setCoverArtUrl] = useState<string | null>(null)
  const coverArtBlobRef = useRef<string | null>(null)
  useEffect(() => {
    const path = song.cover_art
    if (!path) {
      if (coverArtBlobRef.current) { URL.revokeObjectURL(coverArtBlobRef.current); coverArtBlobRef.current = null }
      setCoverArtUrl(null)
      return
    }
    let cancelled = false
    pathToBlobUrl(path).then(url => {
      if (cancelled) return
      if (coverArtBlobRef.current) URL.revokeObjectURL(coverArtBlobRef.current)
      coverArtBlobRef.current = url
      setCoverArtUrl(url)
    })
    return () => { cancelled = true }
  }, [song.cover_art])
  useEffect(() => () => { if (coverArtBlobRef.current) URL.revokeObjectURL(coverArtBlobRef.current) }, [])

  useEffect(() => {
    setDaw(song.daw || '')
  }, [song.daw])

  useEffect(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [notes])

  function onVerRowDown(e: React.PointerEvent, idx: number, filename: string) {
    if ((e.target as HTMLElement).closest('button, input')) return
    document.body.style.userSelect = 'none'
    document.onselectstart = () => false
    dragVerSrcRef.current = idx
    dragVerInsertRef.current = idx
    dragVerStartXRef.current = e.clientX
    dragVerStartYRef.current = e.clientY
    dragVerActiveRef.current = false

    function calcInsert(clientY: number): number {
      const rows = document.querySelectorAll('[data-ver-idx]')
      let insertAt = rows.length
      for (let i = 0; i < rows.length; i++) {
        const rect = (rows[i] as HTMLElement).getBoundingClientRect()
        if (clientY <= rect.top + rect.height / 2) { insertAt = i; break }
      }
      return insertAt
    }

    function onMove(ev: PointerEvent) {
      if (dragVerSrcRef.current === null) return
      if (!dragVerActiveRef.current) {
        const dx = ev.clientX - dragVerStartXRef.current, dy = ev.clientY - dragVerStartYRef.current
        if (Math.hypot(dx, dy) < 4) return
        dragVerActiveRef.current = true
        setDragVerIdx(dragVerSrcRef.current)
        setDragVerInsertIdx(dragVerSrcRef.current)
        if (ghostVerTitleRef.current) ghostVerTitleRef.current.textContent = filename
        if (ghostVerRef.current) ghostVerRef.current.style.display = 'block'
      }
      if (ghostVerRef.current) {
        ghostVerRef.current.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY - 12}px)`
      }
      const insertAt = calcInsert(ev.clientY)
      if (dragVerInsertRef.current !== insertAt) {
        dragVerInsertRef.current = insertAt
        setDragVerInsertIdx(insertAt)
      }
    }

    function onUp() {
      document.body.style.userSelect = ''
      document.onselectstart = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (ghostVerRef.current) ghostVerRef.current.style.display = 'none'
      const src = dragVerSrcRef.current, insertAt = dragVerInsertRef.current, wasActive = dragVerActiveRef.current
      dragVerSrcRef.current = null; dragVerInsertRef.current = null; dragVerActiveRef.current = false
      setDragVerIdx(null); setDragVerInsertIdx(null)
      if (wasActive) suppressVerClickRef.current = true
      if (wasActive && src !== null && insertAt !== null) {
        const adjustedInsert = insertAt > src ? insertAt - 1 : insertAt
        if (adjustedInsert !== src) {
          const newOrder = sorted.map(v => v.id)
          const [moved] = newOrder.splice(src, 1)
          newOrder.splice(adjustedInsert, 0, moved)
          onReorderVersions(song.id, newOrder)
        }
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startEditDate(ver: Version) {
    const d = new Date(ver.created_at)
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    setEditingDateVerId(ver.id)
    setEditingDateValue(`${y}-${mo}-${day}`)
  }

  async function commitDateEdit(ver: Version) {
    setEditingDateVerId(null)
    if (!editingDateValue) return
    const [y, mo, d] = editingDateValue.split('-').map(Number)
    const orig = new Date(ver.created_at)
    orig.setFullYear(y, mo - 1, d)
    await onUpdateVersion(ver.id, { created_at: orig.toISOString() })
  }

  function displayTitle() {
    if (song.title?.trim()) return song.title.trim()
    const latest = sorted[0]
    if (latest?.filename) return latest.filename.replace(/\.[^.]+$/, '')
    if (song.project_name?.trim()) return song.project_name.trim()
    return 'Untitled'
  }

  const isActiveVerPlaying = activeVer?.id === playingVerId
  const activeWfProgress = isActiveVerPlaying && duration > 0 ? progress / duration : 0

  useEffect(() => {
    const isUnchanged =
      title === (song.title || '') &&
      daw === (song.daw || '') &&
      bpm === (song.bpm !== null ? String(song.bpm) : '') &&
      key === (song.key ?? '') &&
      notes === (song.notes || '') &&
      JSON.stringify(tags) === JSON.stringify(song.tags || []) &&
      JSON.stringify(selectedStatuses) === JSON.stringify(song.status || [])
    if (isUnchanged) return
    const t = setTimeout(async () => {
      await onUpdateSong(song.id, { title: title || null, project_name: projectName || null, daw: daw || null, bpm: bpm ? Number(bpm) : null, key: key || null, notes: notes || null, tags, status: selectedStatuses })
      setSavedFlash(true)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setSavedFlash(false), 2500)
    }, 300)
    saveTimerRef.current = t
    return () => clearTimeout(t)
  }, [title, daw, bpm, key, notes, tags, selectedStatuses])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
  }, [])

  function addTag(val: string) {
    const t = val.trim()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  const tabBtn = (t: 'versions' | 'details'): React.CSSProperties => ({
    padding: '8px 20px', border: 'none', background: 'none', fontSize: 13, fontWeight: tab === t ? 600 : 500,
    cursor: 'pointer', fontFamily: 'inherit', color: tab === t ? 'var(--text)' : 'var(--muted)',
    borderBottom: `2px solid ${tab === t ? 'var(--text)' : 'transparent'}`, marginBottom: -1
  })

  return (
    <div style={{ padding: '36px 44px 32px', outline: isDragOver ? '2px dashed var(--muted)' : 'none', outlineOffset: -8, borderRadius: 8, minHeight: '100%', transition: 'outline-color .15s' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', padding: 0, marginBottom: 28, display: 'block', fontFamily: 'inherit' }}>
        ← {backLabel}
      </button>

      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
        {/* Left column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: status dots + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, minWidth: 0 }}>
            {statuses.filter(st => (song.status || []).includes(st.id)).map(st => (
              <span key={st.id} style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
            ))}
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{displayTitle()}</div>
          </div>

          {/* Row 2: tags */}
          {(song.tags || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              {(song.tags || []).map(t => (
                <span key={t} style={{ background: 'var(--border)', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: 'var(--text)' }}>{t}</span>
              ))}
            </div>
          )}

          {/* Row 3: DAW · N versions */}
          {(song.daw || sorted.length > 0) && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              {song.daw && <span>{song.daw}</span>}
              {song.daw && sorted.length > 0 && <span style={{ opacity: 0.4 }}>·</span>}
              {sorted.length > 0 && <span>{sorted.length} version{sorted.length !== 1 ? 's' : ''}</span>}
            </div>
          )}

          {/* Row 4: Original / Latest dates */}
          {sorted.length > 0 && (() => {
            const origVer = sorted[sorted.length - 1]
            const latVer = sorted[0]
            return (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--faint)', fontSize: 11 }}>Original –</span>
                <span>{new Date(origVer.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                {origVer.id !== latVer.id && (
                  <>
                    <span style={{ opacity: 0.4, margin: '0 2px' }}>·</span>
                    <span style={{ color: 'var(--faint)', fontSize: 11 }}>Latest –</span>
                    <span>{new Date(latVer.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </>
                )}
              </div>
            )
          })()}

          {/* Active version player */}
          {activeVer && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <button onClick={() => { setActiveVerId(activeVer.id); onPlay(activeVer) }}
                  style={{ width: 34, height: 34, borderRadius: '50%', border: `1.5px solid ${isActiveVerPlaying ? 'var(--text)' : 'var(--border)'}`, background: 'transparent', cursor: 'pointer', fontSize: 11, color: isActiveVerPlaying ? 'var(--text)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' }}>
                  {isActiveVerPlaying && isPlaying ? '⏸' : '▶'}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{activeVer.filename}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{new Date(activeVer.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {isActiveVerPlaying ? `${fmt(progress)} / ${fmt(duration)}` : fmt(activeVer.duration)}
                </div>
              </div>
              {activeVer.waveform_data && (
                <Waveform peaks={activeVer.waveform_data} progress={activeWfProgress} height={64} zoom={zoom}
                  onClick={pct => { if (isActiveVerPlaying) onSeek(pct * duration); else onPlay(activeVer, pct) }} />
              )}
            </div>
          )}

          {/* Tab bar — Details first, Versions second */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', margin: '26px 0 20px' }}>
            <button style={tabBtn('details')} onClick={() => setTab('details')}>Details</button>
            <button style={tabBtn('versions')} onClick={() => setTab('versions')}>Versions</button>
          </div>

          {/* Details tab */}
          {tab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6, display: 'block' }}>Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Song title"
                  style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--border)', padding: '6px 0', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', background: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 8, display: 'block' }}>Project file</label>
                {song.project_file ? (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{song.project_file.split('/').pop()}</div>
                    <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 8, lineHeight: 1.4, wordBreak: 'break-all' }}>{song.project_file.split('/').slice(0, -1).join('/')}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={onPickProjectFile} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--muted)' }}>Change</button>
                      <button onClick={onOpenProjectFolder} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--muted)' }}>Show in Finder</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={onPickProjectFile}
                    style={{ background: 'none', border: '1.5px dashed var(--border)', borderRadius: 6, padding: '9px 12px', fontSize: 12, color: 'var(--faint)', cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left', transition: 'border-color .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>+ Pick project file</button>
                )}
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6, display: 'block' }}>DAW</label>
                <select value={daw} onChange={e => setDaw(e.target.value)}
                  style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--border)', padding: '6px 0', fontSize: 14, color: daw ? 'var(--text)' : 'var(--muted)', outline: 'none', fontFamily: 'inherit', background: 'none', cursor: 'pointer', appearance: 'none' as const }}>
                  <option value="">Auto-detect from project file</option>
                  {daws.map(d => <option key={d} value={d}>{d}</option>)}
                  {daw && !daws.includes(daw) && <option value={daw}>{daw}</option>}
                </select>
                <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 5 }}>
                  Can't find your DAW? Add a file extension mapping in Settings.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6, display: 'block' }}>BPM</label>
                  <input type="number" value={bpm} onChange={e => setBpm(e.target.value)} placeholder="—"
                    min={1} max={999} step={1}
                    style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--border)', padding: '6px 0', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', background: 'none', appearance: 'textfield' as const }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6, display: 'block' }}>Key</label>
                  <input value={key} onChange={e => setKey(e.target.value)} placeholder="—"
                    style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--border)', padding: '6px 0', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', background: 'none' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6, display: 'block' }}>Status</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {[...statuses, { id: '', label: 'No status', color: '' }].map(st => {
                    const on = st.id === '' ? selectedStatuses.length === 0 : selectedStatuses.includes(st.id)
                    return (
                      <label key={st.id || 'none'} onClick={() => {
                        if (st.id === '') setSelectedStatuses([])
                        else setSelectedStatuses(prev => prev.includes(st.id) ? prev.filter(x => x !== st.id) : [...prev, st.id])
                      }} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: on ? 'var(--text)' : 'var(--muted)', fontWeight: on ? 600 : 400 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, ...(st.color ? { background: st.color, opacity: on ? 1 : 0.45 } : { border: '1.5px solid var(--border)' }) }} />
                        {st.label}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6, display: 'block' }}>Tags</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  {tags.map(t => (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--border)', borderRadius: 4, padding: '2px 7px 2px 8px', fontSize: 11, color: 'var(--text)' }}>
                      {t}
                      <button onClick={() => setTags(prev => prev.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--muted)', lineHeight: 1, padding: 0, fontFamily: 'inherit' }}>×</button>
                    </span>
                  ))}
                </div>
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) } }}
                  onBlur={() => { if (tagInput.trim()) addTag(tagInput) }}
                  placeholder="Add tag — Enter or comma"
                  style={{ border: 'none', borderBottom: '1px solid var(--border)', padding: '5px 0', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', background: 'none', width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6, display: 'block' }}>Notes</label>
                <textarea ref={notesRef} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes…"
                  style={{ width: '100%', border: 'none', padding: '6px 0', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', background: 'none', resize: 'none', overflow: 'hidden', display: 'block', minHeight: '2em' }} />
              </div>
              <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                {confirmDeleteTrack ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Delete track and all versions?</span>
                    <button onClick={() => onDeleteSong(song.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Yes, delete</button>
                    <button onClick={() => setConfirmDeleteTrack(false)} style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDeleteTrack(true)} style={{ background: 'none', border: 'none', fontSize: 12, color: '#b03a2e', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Delete track</button>
                )}
              </div>
            </div>
          )}

          {/* Versions tab */}
          {tab === 'versions' && (
            <div>
              <button onClick={onAddVersion}
                style={{ display: 'block', width: '100%', border: '1.5px dashed var(--border)', borderRadius: 7, padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--faint)', cursor: 'pointer', marginBottom: 16, background: 'none', fontFamily: 'inherit', transition: 'border-color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--muted)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                + Upload new version
              </button>
              {sorted.map((ver, i) => {
                const isThisPlaying = playingVerId === ver.id
                const isActive = ver.id === activeVerId
                const wfProg = isThisPlaying && duration > 0 ? progress / duration : 0
                return (
                  <div key={ver.id} style={{ display: 'contents' }}>
                    {dragVerIdx !== null && dragVerInsertIdx === i && (
                      <div style={{ height: 2, background: 'var(--text)', borderRadius: 1, margin: '1px 0' }} />
                    )}
                  <div
                    data-ver-idx={i}
                    onClick={() => {
                      if (suppressVerClickRef.current) { suppressVerClickRef.current = false; return }
                      setActiveVerId(ver.id); onPlay(ver)
                    }}
                    onPointerDown={e => onVerRowDown(e, i, ver.filename)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: dragVerIdx !== null ? 'grabbing' : 'grab', opacity: dragVerIdx === i ? 0.2 : isActive ? 1 : 0.4, transition: 'opacity .12s', userSelect: 'none', touchAction: 'none' }}
                    onMouseEnter={e => { if (dragVerIdx === null) e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { if (dragVerIdx === null) e.currentTarget.style.opacity = isActive ? '1' : '0.4' }}>
                    <span style={{ color: 'var(--faint)', fontSize: 13, flexShrink: 0, padding: '0 2px' }}>⠿</span>
                    <span style={{ fontSize: 10, color: 'var(--faint)', width: 20, textAlign: 'right', flexShrink: 0 }}>v{sorted.length - i}</span>
                    <button onClick={e => { e.stopPropagation(); setActiveVerId(ver.id); onPlay(ver) }}
                      style={{ width: 26, height: 26, borderRadius: '50%', border: `1.5px solid ${isThisPlaying ? 'var(--text)' : 'var(--border)'}`, background: 'transparent', cursor: 'pointer', fontSize: 9, color: isThisPlaying ? 'var(--text)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' }}>
                      {isThisPlaying && isPlaying ? '⏸' : '▶'}
                    </button>
                    <div style={{ width: 148, flexShrink: 0, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ver.filename}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                        {editingDateVerId === ver.id
                          ? <input type="date" autoFocus value={editingDateValue}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setEditingDateValue(e.target.value)}
                              onBlur={() => commitDateEdit(ver)}
                              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commitDateEdit(ver) } if (e.key === 'Escape') setEditingDateVerId(null) }}
                              style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', padding: 0, width: 100 }} />
                          : <span onClick={e => { e.stopPropagation(); startEditDate(ver) }}
                              style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}
                              title="Click to edit date">
                              {new Date(ver.created_at).toLocaleDateString()}
                            </span>
                        }
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {ver.waveform_data && <Waveform peaks={ver.waveform_data} progress={wfProg} height={34} zoom={zoom}
                        onClick={pct => { setActiveVerId(ver.id); if (isThisPlaying) onSeek(pct * duration); else onPlay(ver, pct) }} />}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, minWidth: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {isThisPlaying ? fmt(progress) : fmt(ver.duration)}
                    </div>
                    {i === 0 && <span style={{ fontSize: 9, background: 'var(--border)', borderRadius: 3, padding: '2px 5px', color: 'var(--muted)', flexShrink: 0 }}>latest</span>}
                    {confirmDeleteVerId === ver.id ? (
                      <>
                        <button onClick={e => { e.stopPropagation(); onDeleteVersion(ver); setConfirmDeleteVerId(null) }}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Delete</button>
                        <button onClick={e => { e.stopPropagation(); setConfirmDeleteVerId(null) }}
                          style={{ background: 'none', color: 'var(--muted)', border: 'none', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px', flexShrink: 0 }}>✕</button>
                      </>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteVerId(ver.id) }}
                        style={{ background: 'none', border: 'none', fontSize: 16, color: 'var(--faint)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0, fontFamily: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>×</button>
                    )}
                  </div>
                  </div>
                )
              })}
              {dragVerIdx !== null && dragVerInsertIdx === sorted.length && (
                <div style={{ height: 2, background: 'var(--text)', borderRadius: 1, margin: '1px 0' }} />
              )}
            </div>
          )}
        </div>

        {/* Right column — cover art + add to playlist */}
        <div style={{ flexShrink: 0, width: 220 }}>
          <div onClick={coverArtUrl ? undefined : onPickCoverArt}
            style={{ width: 220, height: 220, borderRadius: 10, border: coverArtUrl ? 'none' : '1.5px dashed var(--border)', background: coverArtUrl ? 'transparent' : 'var(--side)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: coverArtUrl ? 'default' : 'pointer', position: 'relative', overflow: 'hidden', transition: 'border-color .15s' }}
            onMouseEnter={e => { if (!coverArtUrl) (e.currentTarget.style.borderColor = 'var(--muted)') }}
            onMouseLeave={e => { if (!coverArtUrl) (e.currentTarget.style.borderColor = 'var(--border)') }}>
            {coverArtUrl
              ? <>
                  <img src={coverArtUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0, transition: 'opacity .15s', background: 'rgba(0,0,0,0.35)' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
                    <button onClick={onPickCoverArt} style={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#141311' }}>Change</button>
                    <button onClick={onRemoveCoverArt} style={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#ef4444' }}>Remove</button>
                  </div>
                </>
              : <span style={{ fontSize: 12, color: 'var(--muted)' }}>+ Add cover art</span>
            }
          </div>

          <div ref={playlistPickerRef} style={{ marginTop: 12, position: 'relative' }}>
            <button onClick={() => setShowPlaylistPicker(v => !v)}
              style={{ width: '100%', background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--muted)', textAlign: 'left' }}>
              + Add to playlist
            </button>
            {showPlaylistPicker && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--side)', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'hidden', overflowY: 'auto', zIndex: 50, maxHeight: 185 }}>
                {playlists.length === 0
                  ? <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>No playlists yet</div>
                  : playlists.map(pl => (
                      <div key={pl.id} onClick={() => { onAddToPlaylist(pl.id, song.id); setShowPlaylistPicker(false) }}
                        style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        {pl.name || 'Untitled playlist'}
                      </div>
                    ))
                }
              </div>
            )}
          </div>

          {(() => {
            const featuredIn = playlists.filter(pl => pl.song_ids.includes(song.id))
            if (!featuredIn.length) return null
            return (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6 }}>Featured in</div>
                {featuredIn.map(pl => (
                  <FeaturedPlaylistRow key={pl.id} playlist={pl} songs={songs}
                    onOpen={() => onOpenPlaylist(pl.id)}
                    onRemove={() => onRemoveFromPlaylist(pl.id, song.id)} />
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {savedFlash && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--text)', color: 'var(--bg)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, zIndex: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', pointerEvents: 'none' }}>
          Saved
        </div>
      )}
      <div ref={ghostVerRef} style={{ position: 'fixed', top: 0, left: 0, display: 'none', pointerEvents: 'none', zIndex: 9999, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', maxWidth: 280, fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', willChange: 'transform' }}>
        <span ref={ghostVerTitleRef} />
      </div>
    </div>
  )
}
