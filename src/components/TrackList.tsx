import { useState, useEffect, useRef, useCallback } from 'react'
import type { Song, Version, Status, Playlist } from '../lib/types'
import { pathToBlobUrl } from '../lib/coverArt'
import Waveform from './Waveform'

interface Props {
  songs: Song[]
  versions: Version[]
  statuses: Status[]
  playlists: Playlist[]
  filters: { daw: string; status: string[]; period: string }
  sortMode: 'latest' | 'original'
  searchQuery: string
  setSearchQuery: (q: string) => void
  playingVerId: string | null
  isPlaying: boolean
  progress: number
  duration: number
  onPlay: (ver: Version, seekPct?: number) => void
  onSeek: (t: number) => void
  onOpenSong: (id: string) => void
  onAddSongs: () => void
  latestVer: (songId: string) => Version | null
  showTags: boolean
  showBpmKey: boolean
  showProjectFile: boolean
  showWaveforms: boolean
  showCovers: boolean
  mainTab: 'songs' | 'playlists'
  setMainTab: (t: 'songs' | 'playlists') => void
  onNewPlaylist: () => void
  isDragOver: boolean
  onSetStatus: (songId: string, statusIds: string[]) => void
  showStatus: boolean
  trackHeight: number
  zoom: number
}

function fmtDur(s?: number | null) {
  if (!s) return ''
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function CoverThumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const blobRef = useRef<string | null>(null)
  useEffect(() => {
    if (!path) { setUrl(null); return }
    let cancelled = false
    pathToBlobUrl(path).then(u => {
      if (cancelled) return
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
      blobRef.current = u; setUrl(u)
    })
    return () => { cancelled = true }
  }, [path])
  useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current) }, [])
  return (
    <div style={{ width: 34, height: 34, borderRadius: 4, background: 'var(--border)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {url ? <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: 'var(--faint)' }}>♪</span>}
    </div>
  )
}

export default function TrackList({ songs, versions, statuses, playlists, filters, sortMode, searchQuery, setSearchQuery, playingVerId, isPlaying, progress, duration, onPlay, onSeek, onOpenSong, onAddSongs, latestVer, showTags, showBpmKey, showProjectFile, showWaveforms, showCovers, showStatus, trackHeight, zoom, mainTab, setMainTab, onNewPlaylist, isDragOver, onSetStatus }: Props) {
  const [ctxMenu, setCtxMenu] = useState<{ songId: string; x: number; y: number } | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctxMenu) return
    function onDown(e: MouseEvent) {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [ctxMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent, songId: string) => {
    e.preventDefault()
    setCtxMenu({ songId, x: e.clientX, y: e.clientY })
  }, [])

  function getDisplayed() {
    const q = searchQuery.trim().toLowerCase()
    return songs.filter(s => {
      if (filters.daw && s.daw !== filters.daw) return false
      if (filters.status.length && !filters.status.some(f => (s.status || []).includes(f))) return false
      if (filters.period) {
        const [y, m] = filters.period.split('-').map(Number)
        const vers = versions.filter(v => v.song_id === s.id)
        if (!vers.length) return false
        const sorted = vers.sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))
        const ver = sortMode === 'original' ? sorted[sorted.length - 1] : sorted[0]
        const d = new Date(ver.created_at)
        if (d.getFullYear() !== y || d.getMonth() !== m) return false
      }
      if (q) {
        const ver = latestVer(s.id)
        const haystack = [s.title, s.project_name, s.daw, ver?.filename, s.bpm ? String(s.bpm) : null, s.key, ...(s.tags || [])].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    }).sort((a, b) => {
      let va: Version | null, vb: Version | null
      if (sortMode === 'original') {
        const allA = [...versions.filter(v => v.song_id === a.id)].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
        const allB = [...versions.filter(v => v.song_id === b.id)].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
        va = allA[0] ?? null
        vb = allB[0] ?? null
      } else {
        va = latestVer(a.id); vb = latestVer(b.id)
      }
      if (!va) return 1; if (!vb) return -1
      return new Date(vb.created_at).getTime() - new Date(va.created_at).getTime()
    })
  }

  function displayTitle(s: Song) {
    if (s.title?.trim()) return s.title.trim()
    const v = latestVer(s.id)
    if (v?.filename) return v.filename.replace(/\.[^.]+$/, '')
    if (s.project_name?.trim()) return s.project_name.trim()
    return 'Untitled'
  }

  const displayed = getDisplayed()

  const tabBtn = (t: 'songs' | 'playlists'): React.CSSProperties => ({
    background: 'none', border: 'none', padding: '6px 14px', fontSize: 13,
    fontWeight: mainTab === t ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit',
    color: mainTab === t ? 'var(--text)' : 'var(--muted)',
    borderBottom: `2px solid ${mainTab === t ? 'var(--text)' : 'transparent'}`,
    marginBottom: -1,
  })

  return (
    <div style={{ padding: '28px 44px', outline: isDragOver ? '2px dashed var(--muted)' : 'none', outlineOffset: -8, borderRadius: 8, minHeight: '100%', transition: 'outline-color .15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex' }}>
          <button style={tabBtn('songs')} onClick={() => setMainTab('songs')}>Songs</button>
          <button style={tabBtn('playlists')} onClick={() => setMainTab('playlists')}>Playlists</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onNewPlaylist}
            style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + New playlist
          </button>
          <button onClick={onAddSongs}
            style={{ background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + New song
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search songs…"
          style={{ flex: 1, border: 'none', background: 'transparent', padding: '8px 0', fontSize: 14, color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }} />
        {displayed.length < songs.length && (
          <span style={{ fontSize: 12, color: 'var(--faint)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', paddingLeft: 8 }}>
            {displayed.length} / {songs.length}
          </span>
        )}
      </div>

      <div style={{ marginTop: 4 }}>
        {displayed.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            {songs.length === 0 ? 'Drop audio files anywhere or click "+ New song"' : 'No tracks match filters'}
          </div>
        )}
        {displayed.map(song => {
          const ver = latestVer(song.id)
          const isThis = !!(ver && playingVerId === ver.id)
          const wfProgress = isThis && duration > 0 ? progress / duration : 0
          const coverPath = song.cover_art ?? (
            playlists
              .filter(p => p.song_ids.includes(song.id) && p.cover_art)
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]?.cover_art ?? null
          )

          return (
            <div key={song.id}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={() => onOpenSong(song.id)}
              onContextMenu={e => handleContextMenu(e, song.id)}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--hover)'
                const info = e.currentTarget.querySelector<HTMLElement>('[data-track-info]')
                if (info) info.style.opacity = '0.75'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                const info = e.currentTarget.querySelector<HTMLElement>('[data-track-info]')
                if (info) info.style.opacity = '1'
              }}>

              <button onClick={e => { e.stopPropagation(); if (ver) onPlay(ver) }}
                style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${isThis ? 'var(--text)' : 'var(--border)'}`, background: 'transparent', cursor: 'pointer', fontSize: 9, color: isThis ? 'var(--text)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' }}>
                {isThis && isPlaying ? '⏸' : '▶'}
              </button>

              {showCovers && <CoverThumb path={coverPath} />}

              <div data-track-info style={showWaveforms ? { width: 240, flexShrink: 0, minWidth: 0 } : { flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {showStatus && statuses.filter(st => (song.status || []).includes(st.id)).map(st => (
                    <span key={st.id} style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                  ))}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayTitle(song)}</span>
                </div>
                {showProjectFile && song.project_file && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                    {song.project_file.split('/').pop()?.replace(/\.[^.]+$/, '')}
                  </div>
                )}
                {showBpmKey && (song.bpm || song.key) && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
                    {[song.bpm ? `${song.bpm} BPM` : null, song.key || null].filter(Boolean).join(' · ')}
                  </div>
                )}
                {showTags && (song.tags || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                    {(song.tags || []).map(t => (
                      <span key={t} style={{ background: 'var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--text)' }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>

              {showWaveforms && (
                <div style={{ flex: 1, minWidth: 0 }} onClick={e => e.stopPropagation()}>
                  {ver?.waveform_data
                    ? <Waveform peaks={ver.waveform_data} progress={wfProgress} height={trackHeight} zoom={zoom}
                        onClick={pct => { if (isThis) onSeek(pct * duration); else if (ver) onPlay(ver, pct) }} />
                    : null}
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {isThis && duration > 0 ? fmtDur(progress) : fmtDur(ver?.duration)}
              </div>
            </div>
          )
        })}
      </div>

      {ctxMenu && (() => {
        const ctxSong = songs.find(s => s.id === ctxMenu.songId)
        if (!ctxSong) return null
        const current = ctxSong.status || []
        return (
          <div ref={ctxMenuRef} style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, background: 'var(--side)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 0', zIndex: 1000, minWidth: 160, boxShadow: '0 4px 20px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', padding: '4px 12px 6px' }}>Status</div>
            {statuses.map(st => {
              const on = current.includes(st.id)
              return (
                <div key={st.id}
                  onClick={() => {
                    const next = on ? current.filter(x => x !== st.id) : [...current, st.id]
                    onSetStatus(ctxMenu.songId, next)
                    setCtxMenu(null)
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontWeight: on ? 600 : 400, color: on ? 'var(--text)' : 'var(--muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0, opacity: on ? 1 : 0.5 }} />
                  {st.label}
                  {on && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>✓</span>}
                </div>
              )
            })}
            {current.length > 0 && (
              <>
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <div
                  onClick={() => { onSetStatus(ctxMenu.songId, []); setCtxMenu(null) }}
                  style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  Clear status
                </div>
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}
