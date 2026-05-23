import { useRef, useState, useEffect } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { Song, Version, Status } from '../lib/types'
import { DAW_EXT_DEFAULTS } from '../lib/constants'

type Theme = 'system' | 'light' | 'dark'

interface Props {
  songs: Song[]
  versions: Version[]
  statuses: Status[]
  filters: { daw: string; status: string[]; period: string }
  setFilters: (f: { daw: string; status: string[]; period: string }) => void
  sortMode: 'latest' | 'original'
  setSortMode: (m: 'latest' | 'original') => void
  showTags: boolean
  setShowTags: (v: boolean) => void
  showBpmKey: boolean
  setShowBpmKey: (v: boolean) => void
  showProjectFile: boolean
  setShowProjectFile: (v: boolean) => void
  showWaveforms: boolean
  setShowWaveforms: (v: boolean) => void
  showCovers: boolean
  setShowCovers: (v: boolean) => void
  showStatus: boolean
  setShowStatus: (v: boolean) => void
  theme: Theme
  setTheme: (t: Theme) => void
  zoom: number
  setZoom: (z: number) => void
  font: string
  setFont: (f: string) => void
  trackHeight: number
  setTrackHeight: (h: number) => void
  playlistCount: number
  daws: string[]
  playerVisible: boolean
  onAddStatus: (label: string, color: string) => void
  onEditStatus: (id: string, label: string, color: string) => void
  onDeleteStatus: (id: string) => void
  onReorderStatuses: (ids: string[]) => void
  onFactoryReset: () => void
  onBackup: () => void
  onRestore: () => void
  dawExts: Record<string, string>
  onUpdateDawExts: (m: Record<string, string>) => void
  onNavigate: (tab: 'songs' | 'playlists') => void
  onGoHome: () => void
}

function getPeriods(songs: Song[], versions: Version[], sortMode: 'latest' | 'original') {
  const seen = new Map<string, string>()
  songs.forEach(s => {
    const vers = versions.filter(v => v.song_id === s.id)
    if (!vers.length) return
    const sorted = [...vers].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))
    const ver = sortMode === 'original' ? sorted[sorted.length - 1] : sorted[0]
    const d = new Date(ver.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!seen.has(key)) seen.set(key, d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
  })
  return [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

export default function Sidebar({ songs, versions, statuses, filters, setFilters, sortMode, setSortMode, showTags, setShowTags, showBpmKey, setShowBpmKey, showProjectFile, setShowProjectFile, showWaveforms, setShowWaveforms, showCovers, setShowCovers, showStatus, setShowStatus, theme, setTheme, zoom, setZoom, font, setFont, trackHeight, setTrackHeight, playlistCount, daws, onAddStatus, onEditStatus, onDeleteStatus, onReorderStatuses, onFactoryReset, onBackup, onRestore, dawExts, onUpdateDawExts, onNavigate, onGoHome }: Props) {
  const periods = getPeriods(songs, versions, sortMode)
  const [showHelp, setShowHelp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [addingStatus, setAddingStatus] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hoveredStatusId, setHoveredStatusId] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#a78bfa')
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null)
  const [dragInsertIdx, setDragInsertIdx] = useState<number | null>(null)
  const dragSrcRef = useRef<number | null>(null)
  const dragInsertRef = useRef<number | null>(null)
  const dragStartXRef = useRef(0)
  const dragStartYRef = useRef(0)
  const dragActiveRef = useRef(false)
  const suppressStatusClickRef = useRef(false)
  const ghostSbRef = useRef<HTMLDivElement>(null)
  const ghostSbTitleRef = useRef<HTMLSpanElement>(null)
  const newLabelRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey && e.key === ',') { e.preventDefault(); setShowSettings(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sel: React.CSSProperties = { background: 'var(--side)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 22px 6px 8px', fontSize: 12, color: 'var(--text)', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b6760'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center', width: '100%' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }

  function startEdit(st: Status) { setEditingId(st.id); setEditLabel(st.label); setEditColor(st.color); setAddingStatus(false) }
  function saveEdit(id: string) { if (!editLabel.trim()) return; onEditStatus(id, editLabel.trim(), editColor); setEditingId(null) }
  function saveNew() { if (!newLabel.trim()) return; onAddStatus(newLabel.trim(), newColor); setNewLabel(''); setNewColor('#a78bfa'); setAddingStatus(false) }

  function onRowDown(e: React.PointerEvent, idx: number, label: string) {
    if ((e.target as HTMLElement).closest('button, input')) return
    document.body.style.userSelect = 'none'
    document.onselectstart = () => false
    dragSrcRef.current = idx
    dragInsertRef.current = idx
    dragStartXRef.current = e.clientX
    dragStartYRef.current = e.clientY
    dragActiveRef.current = false

    function calcInsert(clientY: number): number {
      const rows = document.querySelectorAll('[data-status-idx]')
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
        setDragSrcIdx(dragSrcRef.current)
        if (ghostSbTitleRef.current) ghostSbTitleRef.current.textContent = label
        if (ghostSbRef.current) ghostSbRef.current.style.display = 'block'
      }
      if (ghostSbRef.current) ghostSbRef.current.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY - 12}px)`
      const insertAt = calcInsert(ev.clientY)
      if (dragInsertRef.current !== insertAt) { dragInsertRef.current = insertAt; setDragInsertIdx(insertAt) }
    }

    function onUp() {
      document.body.style.userSelect = ''
      document.onselectstart = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (ghostSbRef.current) ghostSbRef.current.style.display = 'none'
      const src = dragSrcRef.current, insertAt = dragInsertRef.current, wasActive = dragActiveRef.current
      dragSrcRef.current = null; dragInsertRef.current = null; dragActiveRef.current = false
      setDragSrcIdx(null); setDragInsertIdx(null)
      if (wasActive) suppressStatusClickRef.current = true
      if (wasActive && src !== null && insertAt !== null) {
        const ids = statuses.map(s => s.id)
        const adjustedInsert = insertAt > src ? insertAt - 1 : insertAt
        if (adjustedInsert !== src) {
          const [moved] = ids.splice(src, 1)
          ids.splice(adjustedInsert, 0, moved)
          onReorderStatuses(ids)
        }
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const sortBtn = (mode: 'latest' | 'original'): React.CSSProperties => ({
    flex: 1, padding: '5px 4px', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
    borderRadius: 5, cursor: 'pointer', transition: 'background .12s, color .12s',
    border: sortMode === mode ? '1px solid var(--text)' : '1px solid var(--border)',
    background: sortMode === mode ? 'var(--text)' : 'transparent',
    color: sortMode === mode ? 'var(--bg)' : 'var(--muted)',
  })

  return (
    <div style={{ width: 210, background: 'var(--side)', borderRight: '1px solid var(--border)', padding: '32px 18px 24px', flexShrink: 0, overflowY: 'auto', height: '100vh', display: 'flex', flexDirection: 'column', gap: 22, userSelect: 'none' }}>

      <div>
        <div onClick={onGoHome} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4, cursor: 'pointer', display: 'inline-block' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>Auchive</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          <span onClick={() => onNavigate('songs')} style={{ cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>{songs.length} song{songs.length !== 1 ? 's' : ''}</span>
          {' / '}
          <span onClick={() => onNavigate('playlists')} style={{ cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>{playlistCount} playlist{playlistCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Sort by version date */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={lbl}>Sort by version date</span>
        <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
          <button style={sortBtn('latest')} onClick={() => setSortMode('latest')}>Latest</button>
          <button style={sortBtn('original')} onClick={() => setSortMode('original')}>Original</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={lbl}>Status</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2 }}>
          {statuses.map((st, idx) => {
            if (editingId === st.id) return (
              <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '2px 0' }}>
                <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                  style={{ width: 20, height: 20, border: '1px solid var(--border)', borderRadius: 4, padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0, WebkitAppearance: 'none' }} />
                <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(st.id); if (e.key === 'Escape') setEditingId(null) }}
                  style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', fontFamily: 'inherit', outline: 'none', padding: '2px 0' }} />
                <button onClick={() => saveEdit(st.id)} style={{ background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>✓</button>
                <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0, lineHeight: 1 }}>✕</button>
              </div>
            )
            const on = filters.status.includes(st.id)
            return (
              <div key={st.id} style={{ display: 'contents' }}>
                {dragSrcIdx !== null && dragInsertIdx === idx && (
                  <div style={{ height: 2, background: 'var(--text)', borderRadius: 1, margin: '1px 0' }} />
                )}
                <div
                  data-status-idx={idx}
                  onPointerDown={e => onRowDown(e, idx, st.label)}
                  onClick={() => {
                    if (suppressStatusClickRef.current) { suppressStatusClickRef.current = false; return }
                    setFilters({ ...filters, status: on ? filters.status.filter(x => x !== st.id) : [...filters.status, st.id] })
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 2px', borderRadius: 6, cursor: dragSrcIdx !== null ? 'grabbing' : 'pointer', userSelect: 'none', background: on ? `${st.color}12` : 'transparent', border: on ? `1.5px solid ${st.color}55` : '1.5px solid transparent', opacity: dragSrcIdx === idx ? 0.2 : 1, touchAction: 'none', transition: 'background .12s, border-color .12s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = on ? `${st.color}20` : 'var(--hover)'; setHoveredStatusId(st.id) }}
                  onMouseLeave={e => { e.currentTarget.style.background = on ? `${st.color}12` : 'transparent'; setHoveredStatusId(null) }}>
                  <span style={{ color: 'var(--faint)', fontSize: 10, opacity: hoveredStatusId === st.id || dragSrcIdx === idx ? 1 : 0, width: hoveredStatusId === st.id || dragSrcIdx === idx ? 14 : 0, overflow: 'hidden', transition: 'opacity .1s, width .1s', flexShrink: 0, lineHeight: 1, cursor: 'grab' }}>⠿</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0, fontSize: 12, color: on ? 'var(--text)' : 'var(--muted)', fontWeight: on ? 600 : 400 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, flexShrink: 0, opacity: on ? 1 : 0.45 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 1, flexShrink: 0, opacity: hoveredStatusId === st.id ? 1 : 0, width: hoveredStatusId === st.id ? 'auto' : 0, overflow: 'hidden', transition: 'opacity .1s, width .1s' }}>
                    <button onClick={e => { e.stopPropagation(); startEdit(st) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'inherit', borderRadius: 3, fontSize: 12, color: 'var(--muted)', lineHeight: 1 }}>✎</button>
                    <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${st.label}"?`)) onDeleteStatus(st.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'inherit', borderRadius: 3, fontSize: 14, color: 'var(--muted)', lineHeight: 1 }}>×</button>
                  </div>
                </div>
              </div>
            )
          })}
          {dragSrcIdx !== null && dragInsertIdx === statuses.length && (
            <div style={{ height: 2, background: 'var(--text)', borderRadius: 1, margin: '1px 0' }} />
          )}
        </div>
        {addingStatus ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
              style={{ width: 20, height: 20, border: '1px solid var(--border)', borderRadius: 4, padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0, WebkitAppearance: 'none' }} />
            <input ref={newLabelRef} autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Name…"
              onKeyDown={e => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') setAddingStatus(false) }}
              style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', fontFamily: 'inherit', outline: 'none', padding: '2px 0' }} />
            <button onClick={saveNew} style={{ background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Add</button>
            <button onClick={() => setAddingStatus(false)} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0, lineHeight: 1 }}>✕</button>
          </div>
        ) : (
          <button onClick={() => { setAddingStatus(true); setEditingId(null) }}
            style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--muted)', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit', marginTop: 2, textAlign: 'left' }}>
            + Add status
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={lbl}>DAW</span>
        <select style={sel} value={filters.daw} onChange={e => setFilters({ ...filters, daw: e.target.value })}>
          <option value="">All DAWs</option>
          {daws.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={lbl}>Period</span>
        <select style={sel} value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })}>
          <option value="">All time</option>
          {periods.map(([key, lbl]) => <option key={key} value={key}>{lbl}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={lbl}>View</span>
        <Toggle label="Show waveforms" value={showWaveforms} onChange={setShowWaveforms} />
        <Toggle label="Show status" value={showStatus} onChange={setShowStatus} />
        <Toggle label="Show tags" value={showTags} onChange={setShowTags} />
        <Toggle label="Show project file" value={showProjectFile} onChange={setShowProjectFile} />
        <Toggle label="Show BPM & key" value={showBpmKey} onChange={setShowBpmKey} />
        <Toggle label="Show covers" value={showCovers} onChange={setShowCovers} />
      </div>

      {/* Bottom buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        <button onClick={() => setShowSettings(true)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--muted)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>⚙</span>
          Settings
        </button>
        <button onClick={() => setShowHelp(true)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--muted)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>?</span>
          Help & FAQ
        </button>
        <button onClick={() => openUrl('https://auchive.io').catch(() => window.open('https://auchive.io', '_blank'))}
          style={{ background: 'none', border: 'none', padding: '2px 0', fontSize: 11, color: 'var(--faint)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--muted)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
          auchive.io
        </button>
      </div>

      {showSettings && <SettingsModal theme={theme} setTheme={setTheme} zoom={zoom} setZoom={setZoom} font={font} setFont={setFont} trackHeight={trackHeight} setTrackHeight={setTrackHeight} onFactoryReset={onFactoryReset} onBackup={onBackup} onRestore={onRestore} dawExts={dawExts} onUpdateDawExts={onUpdateDawExts} onClose={() => setShowSettings(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      <div ref={ghostSbRef} style={{ position: 'fixed', top: 0, left: 0, display: 'none', pointerEvents: 'none', zIndex: 9999, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', willChange: 'transform' }}>
        <span ref={ghostSbTitleRef} />
      </div>
    </div>
  )
}

function SettingsModal({ theme, setTheme, zoom, setZoom, font, setFont, trackHeight, setTrackHeight, onFactoryReset, onBackup, onRestore, dawExts, onUpdateDawExts, onClose }: {
  theme: Theme; setTheme: (t: Theme) => void
  zoom: number; setZoom: (z: number) => void
  font: string; setFont: (f: string) => void
  trackHeight: number; setTrackHeight: (h: number) => void
  onFactoryReset: () => void
  onBackup: () => void
  onRestore: () => void
  dawExts: Record<string, string>
  onUpdateDawExts: (m: Record<string, string>) => void
  onClose: () => void
}) {
  const [showReset, setShowReset] = useState(false)
  const [resetInput, setResetInput] = useState('')
  const [newExt, setNewExt] = useState('')
  const [newDaw, setNewDaw] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { if (showReset) { setShowReset(false); setResetInput('') } else onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showReset])

  const themeOpts: { value: Theme; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]
  const btnBase: React.CSSProperties = { flex: 1, padding: '7px 8px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', border: 'none', borderRadius: 7, transition: 'all .12s' }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, width: 380, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Settings</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--muted)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>

        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 16 }}>Appearance</div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>Theme</div>
            <div style={{ display: 'flex', gap: 3, background: 'var(--side)', borderRadius: 9, padding: 3 }}>
              {themeOpts.map(opt => (
                <button key={opt.value} onClick={() => setTheme(opt.value)}
                  style={{ ...btnBase, background: theme === opt.value ? 'var(--bg)' : 'transparent', color: theme === opt.value ? 'var(--text)' : 'var(--muted)', fontWeight: theme === opt.value ? 600 : 400, boxShadow: theme === opt.value ? '0 1px 4px rgba(0,0,0,0.12)' : 'none' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>Font</div>
            <div style={{ display: 'flex', gap: 3, background: 'var(--side)', borderRadius: 9, padding: 3 }}>
              {([['sans', 'Sans-serif'], ['serif', 'Optima'], ['mono', 'Mono']] as [string, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setFont(val)}
                  style={{ ...btnBase, flex: 1, background: font === val ? 'var(--bg)' : 'transparent', color: font === val ? 'var(--text)' : 'var(--muted)', fontWeight: font === val ? 600 : 400, boxShadow: font === val ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', fontFamily: val === 'serif' ? "'Optima', 'Optima Nova', 'Candara', sans-serif" : val === 'mono' ? "ui-monospace, 'SF Mono', 'Menlo', monospace" : 'inherit' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>Zoom</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setZoom(Math.round(Math.max(zoom * 10 - 1, 7)) / 10)}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'none', fontSize: 16, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</div>
              <button onClick={() => setZoom(Math.round(Math.min(zoom * 10 + 1, 15)) / 10)}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'none', fontSize: 16, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
              {zoom !== 1 && (
                <button onClick={() => setZoom(1)}
                  style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
              )}
              <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 4 }}>⌘+ / ⌘−</span>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>Track height</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setTrackHeight(Math.max(trackHeight - 4, 20))}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'none', fontSize: 16, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{trackHeight}px</div>
              <button onClick={() => setTrackHeight(Math.min(trackHeight + 4, 96))}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'none', fontSize: 16, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
              {trackHeight !== 38 && (
                <button onClick={() => setTrackHeight(38)}
                  style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
              )}
              <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 4 }}>⌥↑ / ⌥↓</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 14 }}>DAW Detection</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
            When you pick a project file, the DAW is set automatically based on the file extension.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
            {Object.entries(DAW_EXT_DEFAULTS).map(([ext, daw]) => (
              <div key={ext} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace', background: 'var(--side)', borderRadius: 3, padding: '1px 5px', color: 'var(--text)', flexShrink: 0 }}>.{ext}</span>
                <span style={{ color: 'var(--muted)', flex: 1 }}>{daw}</span>
                <span style={{ fontSize: 10, color: 'var(--faint)' }}>built-in</span>
              </div>
            ))}
            {Object.entries(dawExts).map(([ext, daw]) => (
              <div key={ext} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace', background: 'var(--side)', borderRadius: 3, padding: '1px 5px', color: 'var(--text)', flexShrink: 0 }}>.{ext}</span>
                <span style={{ color: 'var(--text)', flex: 1, fontWeight: 500 }}>{daw}</span>
                <button onClick={() => { const next = { ...dawExts }; delete next[ext]; onUpdateDawExts(next) }}
                  style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--faint)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input value={newExt} onChange={e => setNewExt(e.target.value.replace(/^\./, '').toLowerCase())} placeholder=".ext"
              style={{ width: 64, border: '1px solid var(--border)', borderRadius: 5, padding: '4px 6px', fontSize: 12, fontFamily: 'monospace', color: 'var(--text)', background: 'var(--bg)', outline: 'none' }} />
            <span style={{ color: 'var(--faint)', fontSize: 12 }}>→</span>
            <input value={newDaw} onChange={e => setNewDaw(e.target.value)} placeholder="DAW name"
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 5, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--bg)', outline: 'none' }} />
            <button
              onClick={() => {
                const ext = newExt.trim().replace(/^\./, '').toLowerCase()
                const daw = newDaw.trim()
                if (!ext || !daw) return
                onUpdateDawExts({ ...dawExts, [ext]: daw })
                setNewExt(''); setNewDaw('')
              }}
              style={{ background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              Add
            </button>
          </div>
        </div>

        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 14 }}>Backup & Restore</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Export all your tracks, playlists, statuses, and settings to a file. Restore from a backup to replace your current data.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={onBackup}
              style={{ width: '100%', background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              Export backup…
            </button>
            <button onClick={onRestore}
              style={{ width: '100%', background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              Restore from backup…
            </button>
          </div>
        </div>

        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 14 }}>About</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Auchive</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Version 1.1</span>
          </div>
        </div>

        {/* Danger zone */}
        <div style={{ padding: '18px 22px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 14 }}>Danger Zone</div>
          {!showReset ? (
            <button onClick={() => setShowReset(true)}
              style={{ width: '100%', background: 'none', border: '1px solid #ef4444', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
              Factory Reset
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }}>
                This will permanently delete <strong style={{ color: 'var(--text)' }}>all tracks, versions, playlists, statuses, and settings</strong>. This action cannot be undone. Only do this if you are absolutely certain.
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                Type <strong style={{ color: '#ef4444', fontFamily: 'monospace' }}>factoryreset</strong> to confirm:
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input autoFocus value={resetInput} onChange={e => setResetInput(e.target.value)}
                  placeholder="factoryreset"
                  style={{ flex: 1, border: `1px solid ${resetInput === 'factoryreset' ? '#ef4444' : 'var(--border)'}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'monospace', outline: 'none', transition: 'border-color .15s' }} />
                <button
                  disabled={resetInput !== 'factoryreset'}
                  onClick={() => { onFactoryReset(); onClose() }}
                  style={{ background: resetInput === 'factoryreset' ? '#ef4444' : 'var(--border)', color: resetInput === 'factoryreset' ? '#fff' : 'var(--muted)', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: resetInput === 'factoryreset' ? 'pointer' : 'default', fontFamily: 'inherit', transition: 'all .15s', flexShrink: 0 }}>Delete</button>
              </div>
              <button onClick={() => { setShowReset(false); setResetInput('') }}
                style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0 0', display: 'block' }}>
                Cancel
              </button>
            </div>
          )}
        </div>
        </div> {/* end scrollable content */}
      </div>
    </div>
  )
}

const FAQ: { q: string; a: string }[] = [
  { q: 'How do I add tracks?', a: 'Drop audio files anywhere on the screen, or click "+ New song" in the top right.' },
  { q: 'How do I add a new version of a track?', a: 'Open the track, then click "+ Upload new version" or drag a file onto the detail view.' },
  { q: 'How do I reorder things?', a: 'Drag the ⠿ handle on any row. Works for versions on a track, songs inside a playlist, and statuses in the sidebar.' },
  { q: 'How do I add a status to a track?', a: 'Open the track, go to the Details tab, and select one or more statuses. Hit Save.' },
  { q: 'What audio formats are supported?', a: 'MP3, WAV, AIFF, M4A, FLAC, OGG, and AAC.' },
  { q: 'How do I add a new DAW to the list?', a: 'Go to Settings → DAW Detection. Add the file extension for your DAW (e.g. .cpr for Cubase) and the DAW name. The next time you pick a project file with that extension, Auchive will automatically fill in the DAW field for you.' },
  { q: 'Is it possible to backup the app?', a: 'Yes! Go to Settings → Backup & Restore. Click "Export backup…" to save all your tracks, playlists, statuses, and settings to a JSON file you can keep somewhere safe. To restore, click "Restore from backup…" and select your backup file — it will replace your current data with the backup.' },
]

function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Help & FAQ</div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--muted)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 0 0' }}>
          {FAQ.map((item, i) => (
            <div key={i} style={{ padding: '12px 22px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{item.q}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>{item.a}</div>
            </div>
          ))}
          <div style={{ padding: '16px 22px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Need help with anything else?</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
              Reach out at{' '}
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>auchivesoftware@gmail.com</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: '3px 0', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
      <span>{label}</span>
      <span style={{ width: 28, height: 16, borderRadius: 8, background: value ? 'var(--text)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background .15s', display: 'inline-block' }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: 'var(--bg)', transition: 'left .15s', display: 'block' }} />
      </span>
    </button>
  )
}
