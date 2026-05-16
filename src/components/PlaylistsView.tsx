import { useState, useEffect, useRef } from 'react'
import type { Playlist, Song } from '../lib/types'
import { pathToBlobUrl } from '../lib/coverArt'

interface Props {
  playlists: Playlist[]
  songs: Song[]
  onOpen: (id: string) => void
  onNew: () => void
  onAddSongs: () => void
  mainTab: 'songs' | 'playlists'
  setMainTab: (t: 'songs' | 'playlists') => void
  isDragOver: boolean
  onReorderPlaylists: (newIds: string[]) => void
}

function PlaylistThumb({ playlist, songs }: { playlist: Playlist; songs: Song[] }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const coverPath = playlist.cover_art ?? songs.find(s => playlist.song_ids.includes(s.id) && s.cover_art)?.cover_art ?? null
    if (!coverPath) { setUrl(null); return }
    let blobUrl: string | null = null
    let cancelled = false
    pathToBlobUrl(coverPath).then(u => {
      if (cancelled) return
      blobUrl = u
      setUrl(u)
    })
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [playlist.cover_art, playlist.song_ids.join(','), songs])

  return (
    <div style={{ width: 40, height: 40, borderRadius: 5, background: 'var(--border)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {url
        ? <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: 15, color: 'var(--faint)' }}>♪</span>}
    </div>
  )
}

export default function PlaylistsView({ playlists, songs, onOpen, onNew, onAddSongs, mainTab, setMainTab, isDragOver, onReorderPlaylists }: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragSrcRef = useRef<number | null>(null)
  const dragOverRef = useRef<number | null>(null)

  const tabBtn = (t: 'songs' | 'playlists'): React.CSSProperties => ({
    background: 'none', border: 'none', padding: '6px 14px', fontSize: 13,
    fontWeight: mainTab === t ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit',
    color: mainTab === t ? 'var(--text)' : 'var(--muted)',
    borderBottom: `2px solid ${mainTab === t ? 'var(--text)' : 'transparent'}`,
    marginBottom: -1,
  })

  function onHandleDown(e: React.PointerEvent, idx: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragSrcRef.current = idx
    dragOverRef.current = idx
    setDragIdx(idx)
    setDragOverIdx(idx)
  }
  function onHandleMove(e: React.PointerEvent) {
    if (dragSrcRef.current === null) return
    const els = document.elementsFromPoint(e.clientX, e.clientY)
    for (const el of els) {
      const attr = (el as HTMLElement).getAttribute('data-pl-idx')
      if (attr !== null) {
        const i = parseInt(attr)
        if (!isNaN(i) && dragOverRef.current !== i) {
          dragOverRef.current = i
          setDragOverIdx(i)
        }
        break
      }
    }
  }
  function onHandleUp() {
    const src = dragSrcRef.current
    const over = dragOverRef.current
    dragSrcRef.current = null
    dragOverRef.current = null
    setDragIdx(null)
    setDragOverIdx(null)
    if (src !== null && over !== null && src !== over) {
      const ids = playlists.map(p => p.id)
      const [moved] = ids.splice(src, 1)
      ids.splice(over, 0, moved)
      onReorderPlaylists(ids)
    }
  }

  return (
    <div style={{ padding: '28px 44px', outline: isDragOver ? '2px dashed var(--muted)' : 'none', outlineOffset: -8, borderRadius: 8, minHeight: '100%', transition: 'outline-color .15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex' }}>
          <button style={tabBtn('songs')} onClick={() => setMainTab('songs')}>Songs</button>
          <button style={tabBtn('playlists')} onClick={() => setMainTab('playlists')}>Playlists</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onNew}
            style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + New playlist
          </button>
          <button onClick={onAddSongs}
            style={{ background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + New song
          </button>
        </div>
      </div>

      {playlists.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          No playlists yet — click "+ New playlist" above
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {playlists.map((pl, idx) => (
            <div key={pl.id}
              data-pl-idx={idx}
              onClick={() => onOpen(pl.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: dragOverIdx === idx && dragIdx !== null && dragIdx !== idx ? 'var(--hover)' : 'transparent', opacity: dragIdx === idx ? 0.4 : 1, transition: 'background .1s', userSelect: 'none' }}
              onMouseEnter={e => { if (dragIdx === null) e.currentTarget.style.background = 'var(--hover)' }}
              onMouseLeave={e => { if (dragIdx === null) e.currentTarget.style.background = 'transparent' }}>
              <span
                data-pl-idx={idx}
                onPointerDown={e => { e.stopPropagation(); onHandleDown(e, idx) }}
                onPointerMove={onHandleMove}
                onPointerUp={e => { e.stopPropagation(); onHandleUp() }}
                style={{ color: 'var(--faint)', fontSize: 13, cursor: dragIdx !== null ? 'grabbing' : 'grab', flexShrink: 0, padding: '0 2px', touchAction: 'none' }}
                onClick={e => e.stopPropagation()}>⠿</span>
              <PlaylistThumb playlist={pl} songs={songs} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {pl.name || 'Untitled playlist'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {(() => { const c = pl.song_ids.filter(id => songs.some(s => s.id === id)).length; return `${c} track${c !== 1 ? 's' : ''}` })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
