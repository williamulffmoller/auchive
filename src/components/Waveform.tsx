import { useEffect, useRef } from 'react'

interface Props {
  peaks: number[]
  progress?: number
  height?: number
  zoom?: number
  onClick?: (pct: number) => void
}

const BAR_W = 2    // px at 100% zoom
const GAP = 0.5   // px at 100% zoom

export default function Waveform({ peaks, progress = 0, height = 34, zoom = 1, onClick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  function draw(canvas: HTMLCanvasElement) {
    if (!peaks.length) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (!rect.width) return

    // Compensate for CSS zoom so bars always appear the same physical size
    const barW = BAR_W / zoom
    const gap = GAP / zoom
    const slot = barW + gap

    const w = rect.width, h = height
    const nBars = Math.max(1, Math.floor(w / slot))

    // Downsample peaks to exactly nBars using max in each segment
    const n = peaks.length
    const bars: number[] = new Array(nBars)
    for (let i = 0; i < nBars; i++) {
      const start = Math.floor(i * n / nBars)
      const end = Math.max(start + 1, Math.floor((i + 1) * n / nBars))
      let max = 0
      for (let j = start; j < end && j < n; j++) {
        if (peaks[j] > max) max = peaks[j]
      }
      bars[i] = max
    }

    // Render at effective physical resolution (dpr × cssZoom) so the bitmap maps
    // 1:1 to screen pixels after the GPU zoom upscale, keeping bars crisp.
    const effectiveDpr = dpr * zoom
    canvas.width = Math.round(w * effectiveDpr)
    canvas.height = Math.round(h * effectiveDpr)
    const ctx = canvas.getContext('2d')!
    ctx.scale(effectiveDpr, effectiveDpr)
    ctx.clearRect(0, 0, w, h)

    const style = getComputedStyle(canvas)
    const playedCol = style.getPropertyValue('--faint').trim() || '#b0ada8'
    const unplayedCol = style.getPropertyValue('--text').trim() || '#141311'
    const maxPeak = Math.max(...bars, 0.0001)
    const mid = h / 2

    for (let i = 0; i < nBars; i++) {
      const x = i * slot
      const barH = Math.max(1, (bars[i] / maxPeak) * h * 0.9)
      const col = i / nBars < progress ? playedCol : unplayedCol
      ctx.globalAlpha = 1
      ctx.fillStyle = col
      ctx.fillRect(x, mid - barH / 2, barW, barH / 2)
      ctx.globalAlpha = 0.35
      ctx.fillRect(x, mid, barW, barH / 2)
      ctx.globalAlpha = 1
    }
  }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    draw(canvas)

    const ro = new ResizeObserver(() => draw(canvas))
    ro.observe(canvas)

    const mo = new MutationObserver(() => draw(canvas))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => { ro.disconnect(); mo.disconnect() }
  }, [peaks, progress, height, zoom])

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height, display: 'block', cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick ? e => {
        const rect = e.currentTarget.getBoundingClientRect()
        onClick((e.clientX - rect.left) / rect.width)
      } : undefined}
    />
  )
}
