import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { clsx } from 'clsx'

export const PALETTE = {
  ibsUf: '#38bdf8',
  ibsMun: '#818cf8',
  cbs: '#34d399',
  is: '#fbbf24',
  valor: '#71717a',
  iss: '#f472b6',
  rtc: '#22d3ee',
  forecast: '#fb923c',
  band: '#fb923c',
}

const W = 760
const PAD = { top: 16, right: 18, bottom: 30, left: 58 }

function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1
  const exp = Math.floor(Math.log10(max))
  const base = Math.pow(10, exp)
  const norm = max / base
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return step * base
}

function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max * i) / count)
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span
            className="inline-block h-0 w-3.5 rounded-full"
            style={{ borderTop: `2.5px ${it.dashed ? 'dashed' : 'solid'} ${it.color}` }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

export function ChartCard({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

interface Series {
  name: string
  color: string
  values: (number | null)[]
  dashed?: boolean
  area?: boolean
}

interface TooltipState {
  index: number
  x: number
}

function useHover(total: number, ref: React.RefObject<HTMLDivElement | null>) {
  const [tip, setTip] = useState<TooltipState | null>(null)
  function onMove(e: React.MouseEvent) {
    const el = ref.current
    if (!el || total === 0) return
    const rect = el.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / rect.width
    const vbX = rel * W
    const plotW = W - PAD.left - PAD.right
    const idx = Math.round(((vbX - PAD.left) / plotW) * (total - 1))
    setTip({ index: Math.max(0, Math.min(total - 1, idx)), x: rel * 100 })
  }
  return { tip, onMove, onLeave: () => setTip(null) }
}

function Tooltip({ top, series, index, format }: { top: TooltipState; series: Series[]; index: number; format: (n: number) => string }) {
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[9rem] -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900/95 px-2.5 py-2 text-[11px] shadow-xl backdrop-blur"
      style={{ left: `${top.x}%`, top: 6 }}
    >
      {series.map((s) => (
        <div key={s.name} className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-zinc-400">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
          <span className="font-mono text-zinc-200">{s.values[index] == null ? '—' : format(s.values[index] as number)}</span>
        </div>
      ))}
    </div>
  )
}

function Grid({ max, h }: { max: number; h: number }) {
  const plotH = h - PAD.top - PAD.bottom
  const plotW = W - PAD.left - PAD.right
  const tks = ticks(max)
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  return (
    <g>
      {tks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="#27272a" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" className="fill-zinc-600" style={{ fontSize: 10 }}>
            {fmtAxis(t)}
          </text>
        </g>
      ))}
    </g>
  )
}

function fmtAxis(v: number): string {
  if (v >= 1000) return (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k'
  if (v >= 1 || v === 0) return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function XLabels({ labels, h }: { labels: string[]; h: number }) {
  const plotW = W - PAD.left - PAD.right
  const n = labels.length
  const bw = plotW / Math.max(1, n)
  return (
    <g>
      {labels.map((l, i) => (
        <text
          key={i}
          x={PAD.left + bw * (i + 0.5)}
          y={h - 10}
          textAnchor="middle"
          className="fill-zinc-500"
          style={{ fontSize: 10 }}
        >
          {l}
        </text>
      ))}
    </g>
  )
}

export function LineChart({
  labels,
  series,
  height = 240,
  format = (v) => v.toLocaleString('pt-BR'),
  band,
}: {
  labels: string[]
  series: Series[]
  height?: number
  format?: (n: number) => string
  band?: { lo: (number | null)[]; hi: (number | null)[] }
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { tip, onMove, onLeave } = useHover(labels.length, ref)
  const n = labels.length
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const max = niceMax(
    Math.max(
      ...series.flatMap((s) => s.values.map((v) => v ?? 0)),
      ...(band ? band.hi.map((v) => v ?? 0) : [0]),
    ),
  )
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1))
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH

  function pathOf(values: (number | null)[]): string {
    let d = ''
    let open = false
    values.forEach((v, i) => {
      if (v == null) {
        open = false
        return
      }
      d += `${open ? 'L' : 'M'}${x(i)},${y(v)} `
      open = true
    })
    return d.trim()
  }

  let bandPath = ''
  if (band) {
    const up = band.hi.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean)
    const down = band.lo
      .map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
      .filter(Boolean)
      .reverse()
    if (up.length && down.length) bandPath = `M${up.join(' L')} L${down.join(' L')} Z`
  }

  return (
    <div ref={ref} className="relative" onMouseMove={onMove} onMouseLeave={onLeave}>
      {tip && <Tooltip top={tip} series={series} index={tip.index} format={format} />}
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" preserveAspectRatio="none">
        <Grid max={max} h={height} />
        {bandPath && <path d={bandPath} fill={PALETTE.band} opacity={0.12} />}
        <XLabels labels={labels} h={height} />
        {series.map((s) => (
          <g key={s.name}>
            {s.area && (
              <path
                d={`${pathOf(s.values)} L${x(n - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`}
                fill={s.color}
                opacity={0.12}
              />
            )}
            <path
              d={pathOf(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {s.values.map((v, i) =>
              v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} />,
            )}
          </g>
        ))}
        {tip && <line x1={x(tip.index)} x2={x(tip.index)} y1={PAD.top} y2={PAD.top + plotH} stroke="#52525b" strokeDasharray="3 3" />}
      </svg>
    </div>
  )
}

export function StackedBarChart({
  labels,
  series,
  height = 240,
  format = (v) => v.toLocaleString('pt-BR'),
}: {
  labels: string[]
  series: Series[]
  height?: number
  format?: (n: number) => string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { tip, onMove, onLeave } = useHover(labels.length, ref)
  const n = labels.length
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const totals = labels.map((_, i) => series.reduce((s, sr) => s + (sr.values[i] ?? 0), 0))
  const max = niceMax(Math.max(...totals, 0))
  const bw = plotW / Math.max(1, n)
  const barW = Math.min(46, bw * 0.62)
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH

  return (
    <div ref={ref} className="relative" onMouseMove={onMove} onMouseLeave={onLeave}>
      {tip && <Tooltip top={tip} series={series} index={tip.index} format={format} />}
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" preserveAspectRatio="none">
        <Grid max={max} h={height} />
        <XLabels labels={labels} h={height} />
        {labels.map((_, i) => {
          let acc = 0
          const cx = PAD.left + bw * (i + 0.5)
          return (
            <g key={i} opacity={tip && tip.index !== i ? 0.55 : 1}>
              {series.map((s) => {
                const v = s.values[i] ?? 0
                if (v <= 0) return null
                const y0 = y(acc)
                const y1 = y(acc + v)
                acc += v
                return <rect key={s.name} x={cx - barW / 2} y={y1} width={barW} height={Math.max(0, y0 - y1)} fill={s.color} />
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function GroupedBarChart({
  labels,
  series,
  height = 240,
  format = (v) => v.toLocaleString('pt-BR'),
}: {
  labels: string[]
  series: Series[]
  height?: number
  format?: (n: number) => string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { tip, onMove, onLeave } = useHover(labels.length, ref)
  const n = labels.length
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const max = niceMax(Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0)), 0))
  const bw = plotW / Math.max(1, n)
  const groupW = Math.min(56, bw * 0.72)
  const barW = groupW / series.length
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH

  return (
    <div ref={ref} className="relative" onMouseMove={onMove} onMouseLeave={onLeave}>
      {tip && <Tooltip top={tip} series={series} index={tip.index} format={format} />}
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" preserveAspectRatio="none">
        <Grid max={max} h={height} />
        <XLabels labels={labels} h={height} />
        {labels.map((_, i) => {
          const cx = PAD.left + bw * (i + 0.5)
          return (
            <g key={i} opacity={tip && tip.index !== i ? 0.55 : 1}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0
                const x0 = cx - groupW / 2 + si * barW
                return <rect key={s.name} x={x0} y={y(v)} width={Math.max(0, barW - 2)} height={Math.max(0, plotH - (y(v) - PAD.top))} fill={s.color} rx={1.5} />
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function HistogramChart({
  bins,
  height = 220,
  color = PALETTE.rtc,
  format = (v) => v.toLocaleString('pt-BR'),
}: {
  bins: { x0: number; x1: number; count: number; label: string }[]
  height?: number
  color?: string
  format?: (n: number) => string
}) {
  const n = bins.length
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const max = niceMax(Math.max(...bins.map((b) => b.count), 1))
  const bw = plotW / Math.max(1, n)
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" preserveAspectRatio="none">
      <Grid max={max} h={height} />
      {bins.map((b, i) => {
        const cx = PAD.left + bw * (i + 0.5)
        return (
          <g key={i}>
            <rect x={cx - bw * 0.42} y={y(b.count)} width={bw * 0.84} height={Math.max(0, plotH - (y(b.count) - PAD.top))} fill={color} rx={2} />
            {n <= 12 && (
              <text x={cx} y={height - 10} textAnchor="middle" className="fill-zinc-500" style={{ fontSize: 9 }}>
                {b.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function DonutChart({
  slices,
  size = 190,
  format = (v) => v.toLocaleString('pt-BR'),
}: {
  slices: { label: string; value: number; color: string }[]
  size?: number
  format?: (n: number) => string
}) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = 70
  const cx = 90
  const cy = 90
  const thickness = 26
  let acc = -Math.PI / 2
  const arcs = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0
    const a0 = acc
    const a1 = acc + frac * Math.PI * 2
    acc = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const d = total === 0 ? '' : `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`
    return { ...s, d, frac }
  })
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 180 180" style={{ width: size, height: size }} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#27272a" strokeWidth={thickness} />
        {arcs.map((a) => (
          <path key={a.label} d={a.d} fill="none" stroke={a.color} strokeWidth={thickness} />
        ))}
      </svg>
      <div className="flex flex-col gap-1.5">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[11px]">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-zinc-400">{s.label}</span>
            <span className="font-mono text-zinc-200">{format(s.value)}</span>
            <span className="text-zinc-600">{total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
