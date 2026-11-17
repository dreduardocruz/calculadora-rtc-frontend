import { useState, useMemo } from 'react'
import {
  OperacaoForm,
  novaOperacao,
  novoItem,
  toPayload,
  formatBRL,
  UF_LIST,
} from './lib'
import { Card, SectionTitle, Field, Select, Btn, Spinner } from './ui'
import { ItemCard } from './ItemCard'
import { NfseAnalyzer, type FillPayload } from './NfseAnalyzer'
import { clsx } from 'clsx'

// ── Helpers para extrair dados da resposta ──────────────────────────
function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

function getGIBSCBS(obj: Record<string, unknown>) {
  const tribCalc = (obj as { tribCalc?: Record<string, unknown> }).tribCalc
  if (!tribCalc) return null
  const ibsCbs = tribCalc['IBSCBS'] as Record<string, unknown> | undefined
  if (!ibsCbs) return null
  const g = ibsCbs['gIBSCBS'] as Record<string, unknown> | undefined
  return { ibsCbs, g }
}

function getItemIBS(g: Record<string, unknown> | undefined) {
  if (!g) return { vIBS: 0, vIBSUF: 0, vIBSMun: 0, pIBSUF: 0, pIBSMun: 0, memoria: '' }
  const gIBS = g['gIBS'] as Record<string, unknown> | undefined
  const gIBSUF = gIBS?.['gIBSUF'] as Record<string, unknown> | undefined
  const gIBSMun = gIBS?.['gIBSMun'] as Record<string, unknown> | undefined
  return {
    vIBS: num(gIBS?.['vIBS']),
    vIBSUF: num(gIBSUF?.['vIBSUF']),
    vIBSMun: num(gIBSMun?.['vIBSMun']),
    pIBSUF: num(gIBSUF?.['pIBSUF']),
    pIBSMun: num(gIBSMun?.['pIBSMun']),
    memoria: (gIBSUF?.['memoriaCalculo'] || '') as string,
  }
}

function getItemCBS(g: Record<string, unknown> | undefined) {
  if (!g) return { vCBS: 0, pCBS: 0, memoria: '' }
  const gCBS = g['gCBS'] as Record<string, unknown> | undefined
  return {
    vCBS: num(gCBS?.['vCBS']),
    pCBS: num(gCBS?.['pCBS']),
    memoria: (gCBS?.['memoriaCalculo'] || '') as string,
  }
}

function getItemIS(tribCalc: Record<string, unknown> | undefined) {
  if (!tribCalc) return { vIS: 0, pIS: 0, memoria: '' }
  const is = tribCalc['IS'] as Record<string, unknown> | undefined
  if (!is) return { vIS: 0, pIS: 0, memoria: '' }
  const gIS = is['gIS'] as Record<string, unknown> | undefined
  return {
    vIS: num(gIS?.['vIS']),
    pIS: num(gIS?.['pIS']),
    memoria: (gIS?.['memoriaCalculo'] || '') as string,
  }
}

function getTotal(result: Record<string, unknown>) {
  const total = result['total'] as Record<string, unknown> | undefined
  if (!total) return { vBC: 0, vIBS: 0, vCBS: 0, vIS: 0, vTotal: 0 }
  const tribCalc = total['tribCalc'] as Record<string, unknown> | undefined
  if (!tribCalc) return { vBC: 0, vIBS: 0, vCBS: 0, vIS: 0, vTotal: 0 }
  const ibsCbsTot = tribCalc['IBSCBSTot'] as Record<string, unknown> | undefined
  const vBC = num(ibsCbsTot?.['vBCIBSCBS'])
  const gIBS = ibsCbsTot?.['gIBS'] as Record<string, unknown> | undefined
  const gCBS = ibsCbsTot?.['gCBS'] as Record<string, unknown> | undefined
  const vIBS = num(gIBS?.['vIBS'])
  const vCBS = num(gCBS?.['vCBS'])
  // IS
  const isTot = tribCalc['ISTot'] as Record<string, unknown> | undefined
  const gISTot = isTot?.['gIS'] as Record<string, unknown> | undefined
  const vIS = num(gISTot?.['vIS'])
  const vTotal = vIBS + vCBS + vIS
  return { vBC, vIBS, vCBS, vIS, vTotal }
}

// ── Componente principal ─────────────────────────────────────────────
export default function App() {
  const [op, setOp] = useState<OperacaoForm>(novaOperacao)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [aba, setAba] = useState<'calc' | 'nfse'>('calc')

  const isPost2027 = useMemo(() => {
    const d = new Date(op.dhFatoGerador)
    return d >= new Date('2027-01-01T00:00:00-03:00')
  }, [op.dhFatoGerador])

  function updateItem(idx: number, patch: Record<string, unknown>) {
    setOp((prev) => {
      const itens = [...prev.itens]
      itens[idx] = { ...itens[idx], ...patch }
      return { ...prev, itens }
    })
  }

  function addItens() {
    setOp((prev) => {
      const nextNum = prev.itens.length ? Math.max(...prev.itens.map((i) => i.numero)) + 1 : 1
      return { ...prev, itens: [...prev.itens, novoItem(nextNum)] }
    })
  }

  function removeItens(idx: number) {
    setOp((prev) => {
      if (prev.itens.length <= 1) return prev
      return { ...prev, itens: prev.itens.filter((_, i) => i !== idx) }
    })
  }

  async function calcular() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const payload = toPayload(op)
      const res = await fetch('/api/calculadora/regime-geral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await res.text()
      let data: Record<string, unknown>
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(text || 'Resposta inválida da API')
      }
      if (!res.ok) throw new Error((data['detail'] as string) || (data['title'] as string) || res.statusText)
      setResult(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setOp(novaOperacao())
    setResult(null)
    setError(null)
    setShowJson(false)
  }

  // Preenche a calculadora a partir de uma nota analisada (aba "Análise NFS-e")
  function aplicarFill(p: FillPayload) {
    setOp((prev) => {
      const itens = [...prev.itens]
      itens[0] = { ...itens[0], ...(p.item ?? {}) }
      return {
        ...prev,
        uf: p.uf ?? prev.uf,
        municipio: p.municipio ?? prev.municipio,
        dhFatoGerador: p.dhFatoGerador ?? prev.dhFatoGerador,
        dataHoraEmissao: p.dataHoraEmissao ?? prev.dataHoraEmissao,
        tpDoc: p.tpDoc ?? prev.tpDoc,
        itens,
      }
    })
    setResult(null)
    setError(null)
    setAba('calc')
  }

  // Extrair dados
  const total = result ? getTotal(result) : { vBC: 0, vIBS: 0, vCBS: 0, vIS: 0, vTotal: 0 }
  const objetos = (result as { objetos?: Record<string, unknown>[] })?.objetos || []

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7.5v15M15 7.5v15M9 4.5v15m6-15v15m-9 1.5h12M4.5 4.5h15" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">Calculadora RTC</h1>
              <p className="text-[11px] text-zinc-500">Regime Regular · IBS · CBS · IS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium',
              isPost2027 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400',
            )}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', isPost2027 ? 'bg-amber-400' : 'bg-emerald-400')} />
              {isPost2027 ? 'Pós-2027 (alíquotas manuais)' : 'Pré-2027 (alíquotas automáticas)'}
            </span>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-5 pb-2">
          <TabBtn active={aba === 'calc'} onClick={() => setAba('calc')}>
            Calculadora
          </TabBtn>
          <TabBtn active={aba === 'nfse'} onClick={() => setAba('nfse')}>
            Análise NFS-e
          </TabBtn>
        </nav>
      </header>

      <div className={aba === 'calc' ? undefined : 'hidden'}>
      <main className="mx-auto max-w-5xl px-5 py-6 grid gap-6 lg:grid-cols-[1fr,1fr]">
        {/* ── Formulário ── */}
        <div className="flex flex-col gap-5">
          {/* operação */}
          <Card>
            <SectionTitle icon={<span className="text-sm">📋</span>}>Operação</SectionTitle>
            <div className="grid grid-cols-2 gap-3 px-5 pb-5">
              <Field
                label="Fato gerador"
                type="datetime-local"
                value={op.dhFatoGerador}
                onChange={(v) => setOp({ ...op, dhFatoGerador: v })}
                className="col-span-2"
              />
              <Field
                label="Emissão"
                type="datetime-local"
                value={op.dataHoraEmissao}
                onChange={(v) => setOp({ ...op, dataHoraEmissao: v })}
                className="col-span-2"
              />
              <Select
                label="UF"
                value={op.uf}
                onChange={(v) => setOp({ ...op, uf: v })}
                options={UF_LIST}
              />
              <Field
                label="Município (IBGE)"
                type="number"
                value={op.municipio}
                onChange={(v) => setOp({ ...op, municipio: v })}
                placeholder="3550308"
              />
            </div>
          </Card>

          {/* itens */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-300 uppercase">
                <span className="text-sky-400 text-sm">📦</span> Itens
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-normal text-zinc-400">
                  {op.itens.length}
                </span>
              </h2>
              <Btn variant="ghost" onClick={addItens} className="!px-2.5 !py-1.5 !text-xs">
                + Adicionar item
              </Btn>
            </div>
            <div className="flex flex-col gap-3">
              {op.itens.map((item, i) => (
                <ItemCard
                  key={item.numero}
                  item={item}
                  index={i}
                  onUpdate={(patch) => updateItem(i, patch)}
                  onRemove={() => removeItens(i)}
                  canRemove={op.itens.length > 1}
                />
              ))}
            </div>
          </div>

          {/* ação */}
          <div className="flex items-center gap-3">
            <Btn onClick={calcular} disabled={loading} className="flex-1 justify-center !py-3 !text-base">
              {loading ? <Spinner /> : '⚡'}
              {loading ? 'Calculando…' : 'Calcular tributos'}
            </Btn>
            <Btn variant="ghost" onClick={reset}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004 8m12 0a8 8 0 01-12 0m12 12v-5h-.58M8 20a8 8 0 0112 0" />
              </svg>
              Resetar
            </Btn>
          </div>
        </div>

        {/* ── Resultado ── */}
        <div className="flex flex-col gap-4">
          {error && (
            <Card className="border-red-500/30 bg-red-500/5">
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 text-red-400 font-medium text-sm mb-1">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Erro da API
                </div>
                <p className="text-xs text-red-300/80 font-mono break-all">{error}</p>
              </div>
            </Card>
          )}

          {result && (
            <>
              {/* totais */}
              <Card className="bg-gradient-to-br from-sky-500/10 to-emerald-500/5 border-sky-500/20">
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-zinc-500 uppercase font-medium mb-1">Base de Cálculo</p>
                      <p className="text-2xl font-bold text-white tracking-tight">{formatBRL(total.vBC)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500 uppercase font-medium mb-1">Total Tributos</p>
                      <p className="text-2xl font-bold text-emerald-400 tracking-tight">{formatBRL(total.vTotal)}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800">
                    <div>
                      <p className="text-[10px] text-zinc-600 uppercase">IBS</p>
                      <p className="text-sm font-semibold text-sky-400">{formatBRL(total.vIBS)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-600 uppercase">CBS</p>
                      <p className="text-sm font-semibold text-sky-400">{formatBRL(total.vCBS)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-600 uppercase">IS</p>
                      <p className="text-sm font-semibold text-sky-400">{formatBRL(total.vIS)}</p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* itens detalhados com memória de cálculo */}
              {objetos.length > 0 && (
                <Card>
                  <SectionTitle icon={<span>📄</span>}>Detalhamento por item</SectionTitle>
                  <div className="divide-y divide-zinc-800/60">
                    {objetos.map((obj, i) => {
                      const { ibsCbs, g } = getGIBSCBS(obj) || { ibsCbs: null, g: null }
                      const ibs = getItemIBS(g)
                      const cbs = getItemCBS(g)
                      const is = getItemIS(ibsCbs ? (obj as Record<string, unknown>)['tribCalc'] as Record<string, unknown> : undefined)
                      return (
                        <div key={i} className="px-5 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-zinc-400">
                              Item {(obj as { nObj?: number }).nObj ?? i + 1}
                            </span>
                            <span className="text-[10px] text-zinc-600 font-mono">
                              {(obj as Record<string, unknown>)['cst'] as string} / {(obj as Record<string, unknown>)['cClassTrib'] as string}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {/* IBS */}
                            <div className={clsx(
                              'rounded-lg px-3 py-2.5',
                              ibs.vIBS > 0 ? 'bg-sky-500/8 border border-sky-500/15' : 'bg-zinc-900/60',
                            )}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-semibold text-zinc-500 uppercase">IBS</span>
                                <span className="text-[10px] text-zinc-600 font-mono">
                                  {ibs.pIBSUF.toFixed(2)}% + {ibs.pIBSMun.toFixed(2)}%
                                </span>
                              </div>
                              <p className={clsx('text-sm font-bold', ibs.vIBS > 0 ? 'text-sky-300' : 'text-zinc-500')}>
                                {formatBRL(ibs.vIBS)}
                              </p>
                              <div className="mt-1 space-y-0.5">
                                <p className="text-[10px] text-zinc-600">UF: {formatBRL(ibs.vIBSUF)} · Mun: {formatBRL(ibs.vIBSMun)}</p>
                              </div>
                            </div>

                            {/* CBS */}
                            <div className={clsx(
                              'rounded-lg px-3 py-2.5',
                              cbs.vCBS > 0 ? 'bg-sky-500/8 border border-sky-500/15' : 'bg-zinc-900/60',
                            )}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-semibold text-zinc-500 uppercase">CBS</span>
                                <span className="text-[10px] text-zinc-600 font-mono">{cbs.pCBS.toFixed(2)}%</span>
                              </div>
                              <p className={clsx('text-sm font-bold', cbs.vCBS > 0 ? 'text-sky-300' : 'text-zinc-500')}>
                                {formatBRL(cbs.vCBS)}
                              </p>
                            </div>

                            {/* IS */}
                            <div className={clsx(
                              'rounded-lg px-3 py-2.5',
                              is.vIS > 0 ? 'bg-sky-500/8 border border-sky-500/15' : 'bg-zinc-900/60',
                            )}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-semibold text-zinc-500 uppercase">IS</span>
                                <span className="text-[10px] text-zinc-600 font-mono">{is.pIS.toFixed(2)}%</span>
                              </div>
                              <p className={clsx('text-sm font-bold', is.vIS > 0 ? 'text-sky-300' : 'text-zinc-500')}>
                                {formatBRL(is.vIS)}
                              </p>
                            </div>
                          </div>

                          {/* memória de cálculo */}
                          {(ibs.memoria || cbs.memoria || is.memoria) && (
                            <div className="mt-2 rounded-lg bg-zinc-900/50 border border-zinc-800/60 px-3 py-2">
                              <p className="text-[10px] font-semibold text-zinc-600 uppercase mb-1">Memória de cálculo</p>
                              <div className="space-y-1">
                                {ibs.memoria && <p className="text-[11px] text-zinc-400 leading-relaxed"><span className="text-sky-500 font-medium">IBS:</span> {ibs.memoria}</p>}
                                {cbs.memoria && <p className="text-[11px] text-zinc-400 leading-relaxed"><span className="text-sky-500 font-medium">CBS:</span> {cbs.memoria}</p>}
                                {is.memoria && <p className="text-[11px] text-zinc-400 leading-relaxed"><span className="text-sky-500 font-medium">IS:</span> {is.memoria}</p>}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )}

              {/* JSON bruto (colapsável) */}
              <Card>
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60 cursor-pointer select-none" onClick={() => setShowJson(!showJson)}>
                  <span className="text-xs font-medium text-zinc-500 uppercase flex items-center gap-2">
                    <svg className={clsx('h-3 w-3 transition-transform', showJson ? 'rotate-90' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Resposta JSON completa
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(JSON.stringify(result, null, 2))
                    }}
                    className="text-xs text-sky-400 hover:text-sky-300 transition"
                  >
                    Copiar
                  </button>
                </div>
                {showJson && (
                  <pre className="px-5 py-4 text-[11px] leading-relaxed font-mono text-zinc-400 overflow-auto max-h-96">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </Card>
            </>
          )}

          {!result && !error && (
            <Card className="border-dashed">
              <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-600 mb-4">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7.5v15m6-15v15m-9 1.5h12M4.5 4.5h15M9 4.5v3m6-3v3" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-zinc-400">Preencha o formulário e clique em <span className="text-sky-400">Calcular</span></p>
                <p className="mt-1 text-xs text-zinc-600">O resultado aparecerá aqui com a memória de cálculo</p>
              </div>
            </Card>
          )}
        </div>
      </main>
      </div>
      <div className={aba === 'nfse' ? undefined : 'hidden'}>
        <main className="mx-auto max-w-5xl px-5 py-6">
          <NfseAnalyzer onFill={aplicarFill} />
        </main>
      </div>

      <footer className="mx-auto max-w-5xl px-5 pb-6 mt-4">
        <p className="text-center text-[11px] text-zinc-700">
          Calculadora RTC — Receita Federal · API v1.6 · Frontend React + Vite + Tailwind v4
        </p>
      </footer>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-lg px-3.5 py-1.5 text-xs font-medium transition',
        active ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200',
      )}
    >
      {children}
    </button>
  )
}
