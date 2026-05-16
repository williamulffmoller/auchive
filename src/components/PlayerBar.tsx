import { useRef } from 'react'
import type { Song, Version } from '../lib/types'

interface Props {
  version: Version
  song: Song | null
  coverArtUrl: string | null
  isPlaying: boolean
  isLoading: boolean
  progress: number
  duration: number
  volume: number
  playMode: 'stop' | 'next' | 'repeat'
  onPlayPause: () => void
  onSeek: (t: number) => void
  onVolume: (v: number) => void
  onSkipNext: () => void
  onSkipBack: () => void
  onCycleMode: () => void
  onGoToSong: () => void
}

function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function modeIcon(m: string) {
  if (m === 'next') return '⇉'
  if (m === 'repeat') return '↻'
  return '→|'
}

function VolFader({ volume, onVolume }: { volume: number; onVolume: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const savedVolumeRef = useRef(volume > 0 ? volume : 0.8)
  const didDragRef = useRef(false)

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    didDragRef.current = false
    const startY = e.clientY

    const onMove = (ev: MouseEvent) => {
      const track = trackRef.current
      if (!track) return
      if (Math.abs(ev.clientY - startY) > 3) didDragRef.current = true
      if (!didDragRef.current) return
      const rect = track.getBoundingClientRect()
      const v = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height))
      if (v > 0) savedVolumeRef.current = v
      onVolume(v)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!didDragRef.current) {
        // click — toggle mute
        if (volume > 0) { savedVolumeRef.current = volume; onVolume(0) }
        else onVolume(savedVolumeRef.current || 0.8)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const pct = volume * 100

  return (
    <div onMouseDown={handleMouseDown}
      style={{ width: 24, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}
      title={volume === 0 ? 'Click to unmute' : 'Click to mute · Drag to adjust'}>
      <div ref={trackRef}
        style={{ width: 3, height: 40, background: 'var(--border)', borderRadius: 2, position: 'relative', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: 'var(--muted)', borderRadius: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: `calc(${pct}% - 4px)`, transform: 'translateX(-50%)', width: 11, height: 4, background: volume === 0 ? 'var(--faint)' : 'var(--text)', borderRadius: 1, pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

export default function PlayerBar({ version, song, coverArtUrl, isPlaying, isLoading, progress, duration, volume, playMode, onPlayPause, onSeek, onVolume, onSkipNext, onSkipBack, onCycleMode, onGoToSong }: Props) {
  const pct = duration ? (progress / duration) * 100 : 0
  const title = song?.title?.trim() || song?.project_name?.trim() || version.filename.replace(/\.[^.]+$/, '')
  const sub = song?.project_name && song?.title ? song.project_name : version.filename

  const btnStyle: React.CSSProperties = { width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' }
  const smallBtnStyle: React.CSSProperties = { ...btnStyle, width: 28, height: 28, fontSize: 10, color: 'var(--muted)' }

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 210, right: 0, height: 68, background: 'var(--side)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, zIndex: 200 }}>
      {/* Cover art + title — click to go to track page */}
      <div onClick={onGoToSong} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0, minWidth: 0 }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
        <div style={{ width: 44, height: 44, borderRadius: 4, background: 'var(--border)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {coverArtUrl
            ? <img src={coverArtUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 16, color: 'var(--faint)' }}>♪</span>}
        </div>
        <div style={{ minWidth: 0, maxWidth: 160 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
        </div>
      </div>

      {/* Controls + progress */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onSkipBack} style={smallBtnStyle} title="Previous">⏮</button>
        <button onClick={onPlayPause} style={btnStyle}>
          {isLoading ? <span style={{ fontSize: 10, letterSpacing: 1 }}>···</span> : isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={onSkipNext} style={smallBtnStyle} title="Next">⏭</button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * duration) }}
            style={{ height: 3, background: 'var(--border)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}>
            <div style={{ height: '100%', background: 'var(--text)', borderRadius: 2, width: `${pct}%`, pointerEvents: 'none', transition: 'width 0.1s linear' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            <span>{fmt(progress)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      </div>

      <button onClick={onCycleMode}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: playMode !== 'stop' ? 'var(--text)' : 'var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit', padding: 4, borderRadius: 4 }}
        title={playMode === 'next' ? 'Play next' : playMode === 'repeat' ? 'Repeat' : 'Stop after'}>
        {modeIcon(playMode)}
      </button>

      <VolFader volume={volume} onVolume={onVolume} />
    </div>
  )
}
