import { useState, useEffect, useRef } from 'react'
import type { Playlist, Song, Status, Version } from '../lib/types'
import { pathToBlobUrl } from '../lib/coverArt'
import Waveform from './Waveform'

type SortMode = 'custom' | 'dateAdded'

interface Props {
  playlist: Playlist
  songs: Song[]
  statuses: Status[]
  playingVerId: string | null
  isPlaying: boolean
  progress: number
  duration: number
  onPlay: (ver: Version, seekPct?: number) => void
  onSeek: (t: number) => void
  onBack: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onAddSong: (playlistId: string, songId: string) => void
  onRemoveSong: (playlistId: string, songId: string) => void
  onReorder: (playlistId: string, newOrder: string[]) => void
  latestVer: (songId: string) => Version | null
  onPickCoverArt: () => void
  onRemoveCoverArt: () => void
  onOpenSong?: (id: string) => void
  backLabel: string
  filters?: { daw: string; status: string[]; period: string }
  zoom?: number
  showTags?: boolean
  showWaveforms?: boolean
  showStatus?: boolean
  showBpmKey?: boolean
  showProjectFile?: boolean
  trackHeight?: number
  missingVerIds?: Set<string>
}

function fmt(s?: number | null) {
  if (!s || isNaN(s)) return ''
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function displayProjectName(s: Song): string | null {
  if (s.project_file) return s.project_file.split('/').pop()?.replace(/\.[^.]+$/, '') || null
  return s.project_name || null
}

export default function PlaylistDetail({ playlist, songs, statuses, playingVerId, isPlaying, progress, duration, onPlay, onSeek, backLabel, onBack, onRename, onDelete, onAddSong, onRemoveSong, onReorder, latestVer, onPickCoverArt, onRemoveCoverArt, onOpenSong, filters, zoom = 1, showTags = true, showWaveforms = true, showStatus = true, showBpmKey = true, showProjectFile = true, trackHeight = 38, missingVerIds = new Set<string>() }: Props) {
  const [name, setName] = useState(playlist.name)
  const [addingTracks, setAddingTracks] = useState(false)
  const [search, setSearch] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragInsertIdx, setDragInsertIdx] = useState<number | null>(null)
  const dragSrcRef = useRef<number | null>(null)
  const dragInsertRef = useRef<number | null>(null)
  const dragStartXRef = useRef(0)
  const dragStartYRef = useRef(0)
  const dragActiveRef = useRef(false)
  const ghostRef = useRef<HTMLDivElement>(null)
  const ghostTitleRef = useRef<HTMLSpanElement>(null)
  const addingTracksRef = useRef<HTMLDivElement>(null)
  const addTracksButtonRef = useRef<HTMLButtonElement>(null)
  const suppressSongClickRef = useRef(false)
  const [sortMode, setSortMode] = useState<SortMode>('custom')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [coverArtUrl, setCoverArtUrl] = useState<string | null>(null)
  const coverArtBlobRef = useRef<string | null>(null)
  useEffect(() => {
    const path = playlist.cover_art
    if (!path) {
      if (coverArtBlobRef.current) { URL.revokeObjectURL(coverArtBlobRef.current); coverArtBlobRef.current = null }
      setCoverArtUrl(null); return
    }
    let cancelled = false
    pathToBlobUrl(path).then(url => {
      if (cancelled) return
      if (coverArtBlobRef.current) URL.revokeObjectURL(coverArtBlobRef.current)
      coverArtBlobRef.current = url; setCoverArtUrl(url)
    })
    return () => { cancelled = true }
  }, [playlist.cover_art])
  useEffect(() => () => { if (coverArtBlobRef.current) URL.revokeObjectURL(coverArtBlobRef.current) }, [])

  useEffect(() => {
    if (!addingTracks) return
    function onDown(e: MouseEvent) {
      if (addingTracksRef.current?.contains(e.target as Node)) return
      if (addTracksButtonRef.current?.contains(e.target as Node)) return
      setAddingTracks(false); setSearch('')
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { setAddingTracks(false); setSearch('') } }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [addingTracks])

  const playlistSongs = playlist.song_ids.map(id => songs.find(s => s.id === id)).filter(Boolean) as Song[]

  function getSorted(): Song[] {
    if (sortMode === 'dateAdded') return [...playlistSongs].reverse()
    return playlistSongs
  }

  const sortedSongs = getSorted()
  const visibleSongs = filters?.status.length
    ? sortedSongs.filter(s => filters!.status.some(id => (s.status || []).includes(id)))
    : sortedSongs

  const notInPlaylist = songs.filter(s => !playlist.song_ids.includes(s.id))
  const filteredAdd = search.trim()
    ? notInPlaylist.filter(s => [s.title, s.project_name, s.bpm ? String(s.bpm) : null, s.key, ...(s.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()))
    : notInPlaylist

  function displayTitle(s: Song) {
    if (s.title?.trim()) return s.title.trim()
    const v = latestVer(s.id)
    if (v?.filename) return v.filename.replace(/\.[^.]+$/, '')
    const proj = displayProjectName(s)
    return proj || 'Untitled'
  }

  function onTrackRowDown(e: React.PointerEvent, idx: number, title: string) {
    if (!canDrag) return
    if ((e.target as HTMLElement).closest('button, input')) return
    e.preventDefault()
    document.body.style.userSelect = 'none'
    document.onselectstart = () => false
    dragSrcRef.current = idx
    dragInsertRef.current = idx
    dragStartXRef.current = e.clientX
    dragStartYRef.current = e.clientY
    dragActiveRef.current = false

    function calcInsert(clientY: number): number {
      const rows = document.querySelectorAll('[data-track-idx]')
      let insertAt = rows.length
      for (let i = 0; i < rows.length; i++) {
        const rect = (rows[i] as HTMLElement).getBoundingClientRect()
        if (clientY <= rect.top + rect.height / 2) { insertAt = i; break }
      }
      return insertAt
    }

    function onMove(ev: PointerEvent) {
      if (dragSrcRef.current === null) return
      if (!dragActiveRef.current) {
        const dx = ev.clientX - dragStartXRef.current, dy = ev.clientY - dragStartYRef.current
        if (Math.hypot(dx, dy) < 4) return
        dragActiveRef.current = true
        setDragIdx(dragSrcRef.current)
        setDragInsertIdx(dragSrcRef.current)
        if (ghostTitleRef.current) ghostTitleRef.current.textContent = title
        if (ghostRef.current) ghostRef.current.style.display = 'block'
      }
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY - 12}px)`
      }
      const insertAt = calcInsert(ev.clientY)
      if (dragInsertRef.current !== insertAt) {
        dragInsertRef.current = insertAt
        setDragInsertIdx(insertAt)
      }
    }

    function onUp() {
      document.body.style.userSelect = ''
      document.onselectstart = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (ghostRef.current) ghostRef.current.style.display = 'none'
      const src = dragSrcRef.current, insertAt = dragInsertRef.current, wasActive = dragActiveRef.current
      dragSrcRef.current = null; dragInsertRef.current = null; dragActiveRef.current = false
      setDragIdx(null); setDragInsertIdx(null)
      if (wasActive) suppressSongClickRef.current = true
      if (wasActive && src !== null && insertAt !== null) {
        const adjustedInsert = insertAt > src ? insertAt - 1 : insertAt
        if (adjustedInsert !== src) {
          const ids = playlistSongs.map(s => s.id)
          const [moved] = ids.splice(src, 1)
          ids.splice(adjustedInsert, 0, moved)
          onReorder(playlist.id, ids)
        }
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const canDrag = sortMode === 'custom'

  const sortBtn = (m: SortMode, label: string) => (
    <button key={m} onClick={() => setSortMode(m)}
      style={{ background: sortMode === m ? 'var(--border)' : 'none', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: sortMode === m ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', color: sortMode === m ? 'var(--text)' : 'var(--muted)' }}>
      {label}
    </button>
  )

  return (
    <div style={{ padding: '36px 44px 100px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', padding: 0, marginBottom: 28, display: 'block', fontFamily: 'inherit' }}>
        ← {backLabel}
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: addingTracks ? 8 : 24 }}>
        {/* Cover art — larger */}
        <div onClick={coverArtUrl ? undefined : onPickCoverArt}
          style={{ width: 130, height: 130, borderRadius: 10, border: coverArtUrl ? 'none' : '1.5px dashed var(--border)', background: coverArtUrl ? 'transparent' : 'var(--side)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: coverArtUrl ? 'default' : 'pointer', flexShrink: 0, overflow: 'hidden', position: 'relative', transition: 'border-color .15s' }}
          onMouseEnter={e => { if (!coverArtUrl) e.currentTarget.style.borderColor = 'var(--muted)' }}
          onMouseLeave={e => { if (!coverArtUrl) e.currentTarget.style.borderColor = 'var(--border)' }}>
          {coverArtUrl
            ? <>
                <img src={coverArtUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: 0, transition: 'opacity .15s', background: 'rgba(0,0,0,0.4)' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
                  <button onClick={onPickCoverArt} style={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#141311' }}>Change</button>
                  <button onClick={onRemoveCoverArt} style={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#ef4444' }}>Remove</button>
                </div>
              </>
            : <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>+ Cover<br/>art</span>
          }
        </div>

        {/* Right column: title, delete, order, add tracks */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2 }}>
          <input value={name} onChange={e => setName(e.target.value)}
            onBlur={() => onRename(playlist.id, name)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            placeholder="Untitled playlist"
            style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.4px', background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'inherit', width: '100%' }} />

          {confirmDelete ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Delete playlist?</span>
              <button onClick={() => onDelete(playlist.id)}
                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Yes</button>
              <button onClick={() => setConfirmDelete(false)}
                style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              style={{ background: 'none', border: 'none', fontSize: 12, color: '#b03a2e', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#b03a2e')}>
              Delete
            </button>
          )}

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 5 }}>Order</div>
            <div style={{ display: 'inline-flex', gap: 2, background: 'var(--side)', borderRadius: 7, padding: 2 }}>
              {sortBtn('custom', 'Custom')}
              {sortBtn('dateAdded', 'Date Added')}
            </div>
          </div>

          <button ref={addTracksButtonRef} onClick={() => setAddingTracks(v => !v)}
            style={{ background: addingTracks ? 'var(--text)' : 'none', color: addingTracks ? 'var(--bg)' : 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
            + Add tracks
          </button>
        </div>
      </div>

      {addingTracks && (
        <div ref={addingTracksRef} style={{ marginTop: 6, marginBottom: 14, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--side)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tracks…" autoFocus
              style={{ flex: 1, border: 'none', padding: '10px 14px', fontSize: 13, color: 'var(--text)', background: 'transparent', fontFamily: 'inherit', outline: 'none' }} />
            <button onClick={() => { setAddingTracks(false); setSearch('') }}
              style={{ border: 'none', background: 'none', padding: '0 14px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, height: 42, display: 'flex', alignItems: 'center' }}>Done</button>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filteredAdd.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--muted)' }}>All tracks already added</div>
            ) : filteredAdd.map(s => (
              <div key={s.id} onClick={() => onAddSong(playlist.id, s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: 13, flex: 1 }}>{displayTitle(s)}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>+ Add</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        {visibleSongs.length !== playlistSongs.length
          ? `${visibleSongs.length} of ${playlistSongs.length} track${playlistSongs.length !== 1 ? 's' : ''}`
          : `${playlistSongs.length} track${playlistSongs.length !== 1 ? 's' : ''}`}
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }}>
        {visibleSongs.map((song, sortedIdx) => {
          const ver = latestVer(song.id)
          const isThis = !!(ver && playingVerId === ver.id)
          const wfProgress = isThis && duration > 0 ? progress / duration : 0
          const originalIdx = playlistSongs.indexOf(song)
          const proj = displayProjectName(song)
          return (
            <div key={song.id} style={{ display: 'contents' }}>
              {dragIdx !== null && dragInsertIdx === sortedIdx && (
                <div style={{ height: 2, background: 'var(--text)', borderRadius: 1, margin: '1px 0' }} />
              )}
            <div
              data-track-idx={originalIdx}
              onPointerDown={e => onTrackRowDown(e, originalIdx, displayTitle(song))}
              onMouseEnter={e => { if (dragIdx === null) e.currentTarget.style.background = 'var(--hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: canDrag ? (dragIdx !== null ? 'grabbing' : 'grab') : 'default', opacity: dragIdx === originalIdx ? 0.2 : 1, transition: 'opacity .1s', userSelect: 'none', touchAction: 'none' }}>
              <span style={{ color: 'var(--faint)', fontSize: 13, flexShrink: 0, padding: '0 4px', opacity: canDrag ? 1 : 0.3 }}>⠿</span>
              <button onClick={e => { e.stopPropagation(); if (ver) onPlay(ver) }}
                style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${isThis ? 'var(--text)' : 'var(--border)'}`, background: 'transparent', cursor: 'pointer', fontSize: 9, color: isThis ? 'var(--text)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' }}>
                {isThis && isPlaying ? '⏸' : '▶'}
              </button>
              <div style={{ width: 200, flexShrink: 0, minWidth: 0, cursor: onOpenSong ? 'pointer' : 'default' }}
                onClick={() => {
                  if (suppressSongClickRef.current) { suppressSongClickRef.current = false; return }
                  onOpenSong?.(song.id)
                }}
                onMouseEnter={e => { if (onOpenSong) e.currentTarget.style.opacity = '0.75' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {showStatus && statuses.filter(st => (song.status || []).includes(st.id)).map(st => (
                    <span key={st.id} style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                  ))}
                  {displayTitle(song)}
                </div>
                {showProjectFile && song.project_file && proj && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{proj}</div>
                )}
                {showBpmKey && (song.bpm || song.key) && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
                    {[song.bpm ? `${song.bpm} BPM` : null, song.key || null].filter(Boolean).join(' · ')}
                  </div>
                )}
                {showTags && (song.tags || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                    {(song.tags || []).map(t => (
                      <span key={t} style={{ background: 'var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 9, color: 'var(--text)' }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }} onClick={e => e.stopPropagation()}>
                {showWaveforms && ver?.waveform_data
                  ? <Waveform peaks={ver.waveform_data} progress={wfProgress} height={trackHeight} zoom={zoom}
                      onClick={pct => { if (isThis) onSeek(pct * duration); else if (ver) onPlay(ver, pct) }} />
                  : null}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {isThis && duration > 0 ? fmt(progress) : ver && missingVerIds.has(ver.id) ? <span style={{ color: '#f59e0b', fontSize: 10 }}>missing</span> : fmt(ver?.duration)}
              </div>
              <button onClick={() => onRemoveSong(playlist.id, song.id)}
                style={{ background: 'none', border: 'none', fontSize: 16, color: 'var(--faint)', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0, fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>×</button>
            </div>
            </div>
          )
        })}
        {dragIdx !== null && dragInsertIdx === sortedSongs.length && (
          <div style={{ height: 2, background: 'var(--text)', borderRadius: 1, margin: '1px 0' }} />
        )}
        {visibleSongs.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            {playlistSongs.length === 0 ? 'No tracks — click "+ Add tracks" above' : 'No tracks match filter'}
          </div>
        )}
      </div>

      <div ref={ghostRef} style={{ position: 'fixed', top: 0, left: 0, display: 'none', pointerEvents: 'none', zIndex: 9999, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', maxWidth: 260, fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', willChange: 'transform' }}>
        <span ref={ghostTitleRef} />
      </div>
    </div>
  )
}
