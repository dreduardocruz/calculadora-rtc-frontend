/**
 * EDA (análise exploratória) e previsão sobre os tributos apurados das NFS-e.
 * Sem dependências externas — apenas estatística descritiva e regressão linear.
 */

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

export function monthKeyOf(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(isoDate ?? '')
  return m ? `${m[1]}-${m[2]}` : 'sem-data'
}

export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return key
  return `${MESES_CURTOS[Number(m[2]) - 1]}/${m[1].slice(2)}`
}

export function addMonths(key: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return key
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta
  const y = Math.floor(total / 12)
  const mo = (total % 12) + 1
  return `${y}-${String(mo).padStart(2, '0')}`
}

export interface MonthRow {
  competencia: string
  valor: number
  iss: number
  ibs: number
  cbs: number
  is: number
  rtc: number
}

export interface MonthAgg {
  key: string
  label: string
  notas: number
  valor: number
  iss: number
  ibs: number
  cbs: number
  is: number
  rtc: number
}

export function aggregateByMonth(rows: MonthRow[]): MonthAgg[] {
  const map = new Map<string, MonthAgg>()
  for (const r of rows) {
    const key = monthKeyOf(r.competencia)
    let agg = map.get(key)
    if (!agg) {
      agg = { key, label: monthLabel(key), notas: 0, valor: 0, iss: 0, ibs: 0, cbs: 0, is: 0, rtc: 0 }
      map.set(key, agg)
    }
    agg.notas += 1
    agg.valor += r.valor
    agg.iss += r.iss
    agg.ibs += r.ibs
    agg.cbs += r.cbs
    agg.is += r.is
    agg.rtc += r.rtc
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

export interface Stats {
  n: number
  soma: number
  media: number
  mediana: number
  min: number
  max: number
  desvio: number
  p25: number
  p75: number
  cv: number
}

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function stats(values: number[]): Stats {
  const vals = values.filter((v) => Number.isFinite(v))
  if (!vals.length) {
    return { n: 0, soma: 0, media: 0, mediana: 0, min: 0, max: 0, desvio: 0, p25: 0, p75: 0, cv: 0 }
  }
  const sorted = [...vals].sort((a, b) => a - b)
  const soma = vals.reduce((s, v) => s + v, 0)
  const media = soma / vals.length
  const variance = vals.reduce((s, v) => s + (v - media) ** 2, 0) / vals.length
  const desvio = Math.sqrt(variance)
  return {
    n: vals.length,
    soma,
    media,
    mediana: quantile(sorted, 0.5),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    desvio,
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    cv: media ? desvio / media : 0,
  }
}

/** Regressão linear simples y = a + b·x sobre x = 0..n-1 */
export function linreg(values: number[]): { a: number; b: number; r2: number } {
  const n = values.length
  if (n < 2) return { a: values[0] ?? 0, b: 0, r2: 0 }
  const xs = values.map((_, i) => i)
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = values.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (values[i] - my)
    sxx += (xs[i] - mx) ** 2
  }
  const b = sxx === 0 ? 0 : sxy / sxx
  const a = my - b * mx
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    const pred = a + b * xs[i]
    ssTot += (values[i] - my) ** 2
    ssRes += (values[i] - pred) ** 2
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot
  return { a, b, r2 }
}

export interface ForecastPoint {
  key: string
  label: string
  media: number
  mediana: number
  tendencia: number
}

export interface ForecastResult {
  historyKeys: string[]
  historyLabels: string[]
  points: ForecastPoint[]
  media: number
  mediana: number
  minimo: number
  maximo: number
  desvio: number
  tendenciaPorMes: number
  r2: number
}

/**
 * Projeta os próximos `horizon` meses usando média e mediana dos meses
 * históricos e, adicionalmente, a tendência linear observada.
 */
export function forecast(monthly: MonthAgg[], metric: (m: MonthAgg) => number, horizon = 6): ForecastResult {
  const values = monthly.map(metric)
  const s = stats(values)
  const { a, b, r2 } = linreg(values)
  const lastKey = monthly.length ? monthly[monthly.length - 1].key : monthKeyOf(new Date().toISOString())
  const points: ForecastPoint[] = []
  for (let i = 1; i <= horizon; i++) {
    const key = addMonths(lastKey, i)
    const tendencia = Math.max(0, a + b * (values.length - 1 + i))
    points.push({
      key,
      label: monthLabel(key),
      media: s.media,
      mediana: s.mediana,
      tendencia,
    })
  }
  return {
    historyKeys: monthly.map((m) => m.key),
    historyLabels: monthly.map((m) => m.label),
    points,
    media: s.media,
    mediana: s.mediana,
    minimo: s.min,
    maximo: s.max,
    desvio: s.desvio,
    tendenciaPorMes: b,
    r2,
  }
}

export interface HistBin {
  x0: number
  x1: number
  count: number
  label: string
}

export function histogram(values: number[], nbins = 10): HistBin[] {
  const vals = values.filter((v) => Number.isFinite(v))
  if (!vals.length) return []
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (min === max) return [{ x0: min, x1: max, count: vals.length, label: fmtNum(min) }]
  const nb = Math.max(1, Math.min(nbins, Math.ceil(Math.sqrt(vals.length)) + 2))
  const width = (max - min) / nb
  const bins: HistBin[] = Array.from({ length: nb }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
    label: '',
  }))
  for (const v of vals) {
    let idx = Math.floor((v - min) / width)
    if (idx >= nb) idx = nb - 1
    bins[idx].count += 1
  }
  bins.forEach((b) => (b.label = `${fmtNum(b.x0)}–${fmtNum(b.x1)}`))
  return bins
}

export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000) return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 10) return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}
