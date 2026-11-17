import { useMemo, useRef, useState, Fragment } from 'react'
import { clsx } from 'clsx'
import { Card, SectionTitle, Field, Btn, Spinner, Toggle } from './ui'
import { formatBRL } from './lib'
import type { ItemForm } from './lib'
import {
  parseNfseXml,
  parseNfsePdf,
  fetchClassificacoes,
  fetchNbsLista,
  calcRegimeRegular,
  extractTaxes,
  NBS_PRESETS,
  TP_DOC_NFSE,
  toOffsetIso,
  type ParsedNfse,
  type TaxBreakdown,
  type NbsOption,
  type ClassificacaoTributaria,
  type AliquotasNominais,
  type CalcItem,
} from './nfse'
import { aggregateByMonth, forecast, histogram, stats, type MonthRow } from './nfse-eda'
import { extrairTextoPdf } from './pdf-text'
import { ChartCard, Legend, LineChart, StackedBarChart, GroupedBarChart, HistogramChart, DonutChart, PALETTE } from './Charts'

export interface FillPayload {
  uf?: string
  municipio?: string
  dhFatoGerador?: string
  dataHoraEmissao?: string
  tpDoc?: string
  item?: Partial<ItemForm>
}

interface AnalyzedNote {
  nota: ParsedNfse
  nbsUsado?: string
  classificacao?: ClassificacaoTributaria
  cst: string
  cClassTrib: string
  atual?: TaxBreakdown
  erroAtual?: string
  futuro?: TaxBreakdown
  erroFuturo?: string
}

interface Params {
  nbsModo: 'nota' | 'custom'
  nbsCustom: string
  classModo: 'auto' | 'manual'
  cstManual: string
  cClassTribManual: string
  usarFuturo: boolean
  nominais: AliquotasNominais
}

const CORES_RTC = [
  { key: 'ibsUf' as const, name: 'IBS Estadual', color: PALETTE.ibsUf },
  { key: 'ibsMun' as const, name: 'IBS Municipal', color: PALETTE.ibsMun },
  { key: 'cbs' as const, name: 'CBS', color: PALETTE.cbs },
  { key: 'is' as const, name: 'IS', color: PALETTE.is },
]

const ZERO_NOTAIS: AliquotasNominais = { cbs: 8.8, ibsEstadual: 0.1, ibsMunicipal: 0 }

function toLocalInput(iso: string, fallbackTime = '12:00'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso ?? '')
  if (!m) return ''
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? fallbackTime.slice(0, 2)}:${m[5] ?? fallbackTime.slice(3, 5)}`
}

function pct(v: number): string {
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let i = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx])
    }
  })
  await Promise.all(runners)
}

export function NfseAnalyzer({ onFill }: { onFill: (p: FillPayload) => void }) {
  const [arquivos, setArquivos] = useState<File[]>([])
  const [notas, setNotas] = useState<ParsedNfse[]>([])
  const [analisadas, setAnalisadas] = useState<AnalyzedNote[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [carregando, setCarregando] = useState(false)
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 })
  const [drag, setDrag] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  const [nbsModo, setNbsModo] = useState<'nota' | 'custom'>('nota')
  const [nbsCustom, setNbsCustom] = useState('')
  const [classModo, setClassModo] = useState<'auto' | 'manual'>('auto')
  const [cstManual, setCstManual] = useState('200')
  const [cClassTribManual, setCClassTribManual] = useState('200029')
  const [usarFuturo, setUsarFuturo] = useState(true)
  const [cbs, setCbs] = useState(String(ZERO_NOTAIS.cbs))
  const [ibsUf, setIbsUf] = useState(String(ZERO_NOTAIS.ibsEstadual))
  const [ibsMun, setIbsMun] = useState(String(ZERO_NOTAIS.ibsMunicipal))
  const [incluirCanceladas, setIncluirCanceladas] = useState(false)
  const [nbsLista, setNbsLista] = useState<NbsOption[]>([])
  const [nbsListaErro, setNbsListaErro] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)

  const paramsAtuais = (): Params => ({
    nbsModo,
    nbsCustom,
    classModo,
    cstManual,
    cClassTribManual,
    usarFuturo,
    nominais: { cbs: Number(cbs) || 0, ibsEstadual: Number(ibsUf) || 0, ibsMunicipal: Number(ibsMun) || 0 },
  })

  function resolveNbs(nota: ParsedNfse, p: Params): string | undefined {
    if (p.nbsModo === 'custom') return p.nbsCustom.trim() || undefined
    return nota.nbs
  }

  async function callCalc(nota: ParsedNfse, cst: string, cClassTrib: string, nbs: string | undefined, p: Params, cenario: 'atual' | 'futuro'): Promise<TaxBreakdown> {
    const futuro = cenario === 'futuro'
    const dh = futuro ? '2027-01-15T12:00:00-03:00' : toOffsetIso(nota.competencia, '12:00:00')
    const item: CalcItem = { numero: 1, cst, cClassTrib, baseCalculo: nota.valorServicos, unidade: 'UN' }
    if (nbs) item.nbs = nbs
    const post2027 = futuro || dh >= '2027-01-01'
    if (post2027) item.aliquotasNominais = p.nominais
    const res = await calcRegimeRegular({
      id: `nfse-${nota.numero || 'x'}-${cenario}`,
      versao: '1.0.0',
      dhFatoGerador: dh,
      dataHoraEmissao: nota.dataEmissao || dh,
      uf: nota.uf || 'GO',
      municipio: nota.municipio ?? 5208707,
      tpDoc: TP_DOC_NFSE,
      itens: [item],
    })
    return extractTaxes(res)
  }

  async function processar(lista: ParsedNfse[], p: Params) {
    setCarregando(true)
    setErro(null)
    setAnalisadas([])
    setExpandida(null)
    setProgresso({ feito: 0, total: lista.length })
    try {
      const cache = new Map<string, ClassificacaoTributaria[]>()
      const out: AnalyzedNote[] = []
      let feito = 0
      await runPool(lista, 6, async (nota) => {
        const nbs = resolveNbs(nota, p)
        let classificacao: ClassificacaoTributaria | undefined
        if (p.classModo === 'auto' && nbs) {
          const key = `${nbs}|${nota.competencia}`
          let list = cache.get(key)
          if (!list) {
            try {
              list = await fetchClassificacoes(nbs, nota.competencia || '2026-01-01')
            } catch {
              list = []
            }
            cache.set(key, list)
          }
          classificacao = list[0]
        }
        const cst = p.classModo === 'manual' ? p.cstManual : classificacao?.codigoSituacaoTributaria ?? '000'
        const cClassTrib = p.classModo === 'manual' ? p.cClassTribManual : classificacao?.codigoClassificacaoTributaria ?? '000001'

        const entry: AnalyzedNote = { nota, nbsUsado: nbs, classificacao, cst, cClassTrib }
        try {
          entry.atual = await callCalc(nota, cst, cClassTrib, nbs, p, 'atual')
        } catch (e) {
          entry.erroAtual = e instanceof Error ? e.message : String(e)
        }
        if (p.usarFuturo) {
          try {
            entry.futuro = await callCalc(nota, cst, cClassTrib, nbs, p, 'futuro')
          } catch (e) {
            entry.erroFuturo = e instanceof Error ? e.message : String(e)
          }
        }
        out.push(entry)
        feito += 1
        setProgresso({ feito, total: lista.length })
      })
      out.sort((a, b) => Number(a.nota.numero || 0) - Number(b.nota.numero || 0))
      setAnalisadas(out)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => {
      const n = f.name.toLowerCase()
      return n.endsWith('.xml') || n.endsWith('.pdf')
    })
    if (!arr.length) {
      setErro('Nenhum arquivo .xml ou .pdf selecionado.')
      return
    }
    setErro(null)
    const parsed: ParsedNfse[] = []
    const falhas: string[] = []
    for (const f of arr) {
      try {
        if (f.name.toLowerCase().endsWith('.pdf')) {
          parsed.push(...parseNfsePdf(await extrairTextoPdf(f), f.name))
        } else {
          parsed.push(...parseNfseXml(await f.text(), f.name))
        }
      } catch (e) {
        falhas.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setArquivos(arr)
    setAvisos(falhas)
    setNotas(parsed)
    if (parsed.length) await processar(parsed, paramsAtuais())
  }

  async function carregarNbsDaApi() {
    setNbsListaErro(null)
    try {
      const data = notas.reduce((acc, n) => (n.competencia > acc ? n.competencia : acc), '2026-01-01')
      const lista = await fetchNbsLista(data || '2026-01-01')
      setNbsLista(lista)
      if (!lista.length) setNbsListaErro('Lista de NBS vazia.')
    } catch (e) {
      setNbsListaErro(e instanceof Error ? e.message : String(e))
    }
  }

  // ── Série de dados para o EDA ──────────────────────────────────────────────
  const visiveis = useMemo(
    () => analisadas.filter((a) => incluirCanceladas || !a.nota.cancelada),
    [analisadas, incluirCanceladas],
  )
  const comDados = useMemo(() => visiveis.filter((a) => a.atual), [visiveis])

  const rows: MonthRow[] = useMemo(
    () =>
      comDados.map((a) => ({
        competencia: a.nota.competencia,
        valor: a.nota.valorServicos,
        iss: a.nota.valorIss ?? 0,
        ibs: a.atual!.vIBS,
        cbs: a.atual!.vCBS,
        is: a.atual!.vIS,
        rtc: a.atual!.vTotal,
      })),
    [comDados],
  )

  const mensal = useMemo(() => aggregateByMonth(rows), [rows])
  const rotulos = mensal.map((m) => m.label)

  const totValor = rows.reduce((s, r) => s + r.valor, 0)
  const totIss = rows.reduce((s, r) => s + r.iss, 0)
  const totIbs = rows.reduce((s, r) => s + r.ibs, 0)
  const totCbs = rows.reduce((s, r) => s + r.cbs, 0)
  const totIs = rows.reduce((s, r) => s + r.is, 0)
  const totRtc = totIbs + totCbs + totIs
  const aliqEfetiva = totValor ? (totRtc / totValor) * 100 : 0
  const aliqIss = totValor ? (totIss / totValor) * 100 : 0

  const totFuturo = comDados.reduce((s, a) => s + (a.futuro?.vTotal ?? 0), 0)
  const deltaFuturo = totRtc ? ((totFuturo - totRtc) / totRtc) * 100 : 0

  const previsao = useMemo(() => forecast(mensal, (m) => m.rtc, 6), [mensal])
  const histAliq = useMemo(() => histogram(comDados.map((a) => (a.nota.valorServicos ? (a.atual!.vTotal / a.nota.valorServicos) * 100 : 0)), 10), [comDados])
  const stValor = useMemo(() => stats(mensal.map((m) => m.valor)), [mensal])

  const canceladas = analisadas.filter((a) => a.nota.cancelada).length
  const errosCalc = visiveis.filter((a) => !a.atual).length

  // ── Previsão: séries para o gráfico ────────────────────────────────────────
  const fcLabels = [...previsao.historyLabels, ...previsao.points.map((p) => p.label)]
  const fcRtc = [...mensal.map((m) => m.rtc), ...previsao.points.map(() => null)]
  const fcMedia = [...mensal.map(() => null), ...previsao.points.map((p) => p.media)]
  const fcMediana = [...mensal.map(() => null), ...previsao.points.map((p) => p.mediana)]
  const fcTend = [...mensal.map(() => null), ...previsao.points.map((p) => p.tendencia)]
  const bandLo: (number | null)[] = [...mensal.map(() => null), ...previsao.points.map(() => previsao.minimo)]
  const bandHi: (number | null)[] = [...mensal.map(() => null), ...previsao.points.map(() => previsao.maximo)]

  function fillCalculadora(a: AnalyzedNote) {
    onFill({
      uf: a.nota.uf,
      municipio: a.nota.municipio ? String(a.nota.municipio) : '',
      dhFatoGerador: toLocalInput(a.nota.competencia, '12:00'),
      dataHoraEmissao: toLocalInput(a.nota.dataEmissao, '12:00'),
      tpDoc: String(TP_DOC_NFSE),
      item: {
        nbs: a.nbsUsado ?? a.nota.nbs ?? '',
        cst: a.cst,
        cClassTrib: a.cClassTrib,
        baseCalculo: String(a.nota.valorServicos),
        unidade: 'UN',
      },
    })
  }

  function exportarCSV() {
    const head = [
      'numero',
      'layout',
      'competencia',
      'cancelada',
      'valor_servicos',
      'nbs',
      'cst',
      'cClassTrib',
      'iss',
      'ibs_uf',
      'ibs_mun',
      'ibs',
      'cbs',
      'is',
      'rtc_total',
      'aliq_efetiva_pct',
      'rtc_pos2027',
    ]
    const linhas = visiveis.map((a) => {
      const t = a.atual
      const aliq = t && a.nota.valorServicos ? ((t.vTotal / a.nota.valorServicos) * 100).toFixed(4) : ''
      return [
        a.nota.numero,
        a.nota.layout,
        a.nota.competencia,
        a.nota.cancelada ? 'sim' : 'nao',
        a.nota.valorServicos.toFixed(2),
        a.nbsUsado ?? a.nota.nbs ?? '',
        a.cst,
        a.cClassTrib,
        (a.nota.valorIss ?? 0).toFixed(2),
        (t?.vIBSUF ?? 0).toFixed(2),
        (t?.vIBSMun ?? 0).toFixed(2),
        (t?.vIBS ?? 0).toFixed(2),
        (t?.vCBS ?? 0).toFixed(2),
        (t?.vIS ?? 0).toFixed(2),
        (t?.vTotal ?? 0).toFixed(2),
        aliq,
        (a.futuro?.vTotal ?? 0).toFixed(2),
      ].join(';')
    })
    baixar('nfse-tributos.csv', '\ufeff' + [head.join(';'), ...linhas].join('\n'), 'text/csv;charset=utf-8')
  }

  function exportarJSON() {
    const payload = {
      geradoEm: new Date().toISOString(),
      premissas: { nominais: paramsAtuais().nominais, classModo, nbsModo },
      resumo: { notas: comDados.length, canceladas, valorTotal: totValor, iss: totIss, ibs: totIbs, cbs: totCbs, is: totIs, rtc: totRtc, rtc_pos2027: totFuturo },
      mensal,
      previsao: {
        horizonte: 6,
        media: previsao.media,
        mediana: previsao.mediana,
        minimo: previsao.minimo,
        maximo: previsao.maximo,
        tendenciaPorMes: previsao.tendenciaPorMes,
        r2: previsao.r2,
        meses: previsao.points,
      },
      notas: visiveis.map((a) => ({
        numero: a.nota.numero,
        layout: a.nota.layout,
        competencia: a.nota.competencia,
        cancelada: a.nota.cancelada,
        valorServicos: a.nota.valorServicos,
        nbs: a.nbsUsado ?? a.nota.nbs,
        cst: a.cst,
        cClassTrib: a.cClassTrib,
        atual: a.atual ?? null,
        futuro: a.futuro ?? null,
      })),
    }
    baixar('nfse-eda.json', JSON.stringify(payload, null, 2), 'application/json')
  }

  const saturacao = stValor.cv

  return (
    <div className="flex flex-col gap-5">
      {/* Upload */}
      <Card>
        <SectionTitle icon={<span>📥</span>} right={<span className="text-[11px] text-zinc-500">XML NFS-e · ABRASF 2.04 e SPED/DPS 1.00</span>}>
          Importar notas fiscais de serviço
        </SectionTitle>
        <div className="px-5 pb-5">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
            }}
            onClick={() => inputRef.current?.click()}
            className={clsx(
              'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-9 text-center transition',
              drag ? 'border-sky-500/70 bg-sky-500/5' : 'border-zinc-700/70 hover:border-zinc-600 hover:bg-zinc-800/20',
            )}
          >
            <span className="text-2xl">🗂️</span>
            <p className="text-sm font-medium text-zinc-300">Arraste as NFS-e (XML ou PDF) aqui ou clique para selecionar</p>
            <p className="text-[11px] text-zinc-500">Aceita seleção múltipla. Nada é enviado para fora — só a API local de cálculo.</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xml,.pdf,application/xml,text/xml,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {arquivos.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
              <span>
                <strong className="text-zinc-200">{arquivos.length}</strong> arquivo(s)
              </span>
              <span>
                <strong className="text-zinc-200">{notas.length}</strong> nota(s) lida(s)
              </span>
              {canceladas > 0 && <span className="text-amber-400/90">{canceladas} cancelada(s)</span>}
              {errosCalc > 0 && <span className="text-red-400/90">{errosCalc} com erro de cálculo</span>}
            </div>
          )}
          {avisos.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {avisos.map((a) => (
                <li key={a} className="text-[11px] text-red-400/80">
                  {a}
                </li>
              ))}
            </ul>
          )}
          {erro && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{erro}</p>}
        </div>
      </Card>

      {notas.length > 0 && (
        <>
          {/* Parâmetros */}
          <Card>
            <SectionTitle icon={<span>⚙️</span>} right={carregando ? <Spinner /> : undefined}>
              Parâmetros de cálculo
            </SectionTitle>
            <div className="grid gap-4 px-5 pb-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <p className="mb-2 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Código NBS</p>
                  <div className="mb-2 flex gap-2">
                    <SegBtn selected={nbsModo === 'nota'} onClick={() => setNbsModo('nota')}>
                      Usar NBS da nota
                    </SegBtn>
                    <SegBtn selected={nbsModo === 'custom'} onClick={() => setNbsModo('custom')}>
                      Selecionar outro NBS
                    </SegBtn>
                  </div>
                  {nbsModo === 'custom' && (
                    <div className="flex flex-col gap-2">
                      <input
                        list="nbs-datalist"
                        value={nbsCustom}
                        onChange={(e) => setNbsCustom(e.target.value)}
                        placeholder="ex.: 123012200"
                        className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-500/60"
                      />
                      <datalist id="nbs-datalist">
                        {[...NBS_PRESETS, ...nbsLista].map((o) => (
                          <option key={o.codigo} value={o.codigo}>
                            {o.descricao}
                          </option>
                        ))}
                      </datalist>
                      <div className="flex flex-wrap items-center gap-2">
                        <Btn variant="ghost" onClick={carregarNbsDaApi} className="!px-2.5 !py-1 !text-[11px]">
                          {nbsLista.length ? `${nbsLista.length} NBS carregados` : 'Carregar lista de NBS da API'}
                        </Btn>
                        {NBS_PRESETS.map((p) => (
                          <button
                            key={p.codigo}
                            onClick={() => setNbsCustom(p.codigo)}
                            className="rounded-full border border-zinc-700 px-2.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:border-sky-500/50 hover:text-sky-300"
                          >
                            {p.codigo}
                          </button>
                        ))}
                      </div>
                      {nbsListaErro && <p className="text-[11px] text-red-400/80">{nbsListaErro}</p>}
                    </div>
                  )}
                  {nbsModo === 'nota' && (
                    <p className="text-[11px] text-zinc-500">
                      NBS da própria nota: {Array.from(new Set(notas.map((n) => n.nbs).filter(Boolean))).join(', ') || 'não informado'}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <p className="mb-2 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Classificação tributária (CST / cClassTrib)</p>
                  <div className="mb-2 flex gap-2">
                    <SegBtn selected={classModo === 'auto'} onClick={() => setClassModo('auto')}>
                      Automática (API)
                    </SegBtn>
                    <SegBtn selected={classModo === 'manual'} onClick={() => setClassModo('manual')}>
                      Manual
                    </SegBtn>
                  </div>
                  {classModo === 'manual' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="CST" value={cstManual} onChange={setCstManual} placeholder="200" />
                      <Field label="cClassTrib" value={cClassTribManual} onChange={setCClassTribManual} placeholder="200029" />
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-500">
                      Busca CST/cClassTrib por NBS e data na API (ex.: saúde humana → <span className="font-mono text-sky-300">200 / 200029</span>).
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Cenário pós-2027 (alíquotas nominais)</p>
                  <Toggle label="projetar" checked={usarFuturo} onChange={setUsarFuturo} />
                </div>
                <div className={clsx('grid gap-3 transition-opacity sm:grid-cols-3', !usarFuturo && 'pointer-events-none opacity-40')}>
                  <Field label="CBS (%)" type="number" step="0.0001" value={cbs} onChange={setCbs} />
                  <Field label="IBS Estadual (%)" type="number" step="0.0001" value={ibsUf} onChange={setIbsUf} />
                  <Field label="IBS Municipal (%)" type="number" step="0.0001" value={ibsMun} onChange={setIbsMun} />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                  Premissas editáveis — a base offline não possui tabela de referência para 2027+. Padrão: CBS 8,8% / IBS-UF 0,1% / IBS-Mun 0% (fase 2027). A redução de 60% da saúde (Anexo III) é aplicada automaticamente pela API.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Toggle label="incluir notas canceladas" checked={incluirCanceladas} onChange={setIncluirCanceladas} />
                <Btn onClick={() => processar(notas, paramsAtuais())} disabled={carregando} className="justify-center">
                  {carregando ? <Spinner /> : '⚡'} {carregando ? `Processando ${progresso.feito}/${progresso.total}` : 'Reprocessar'}
                </Btn>
              </div>
            </div>
          </Card>

          {/* KPIs */}
          {comDados.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Faturamento total" value={formatBRL(totValor)} hint={`${comDados.length} notas · ${mensal.length} meses`} />
              <Kpi label="ISS atual (notas)" value={formatBRL(totIss)} hint={`alíquota média ${pct(aliqIss)}`} tone="amber" />
              <Kpi label="RTC — IBS + CBS + IS" value={formatBRL(totRtc)} hint={`alíquota efetiva ${pct(aliqEfetiva)}`} tone="sky" />
              <Kpi
                label="Pós-2027 (projeção)"
                value={usarFuturo ? formatBRL(totFuturo) : '—'}
                hint={usarFuturo ? `${deltaFuturo >= 0 ? '+' : ''}${deltaFuturo.toFixed(1)}% vs regime atual` : 'desativado'}
                tone="emerald"
              />
            </div>
          )}

          {/* Gráficos */}
          {comDados.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title="Faturamento e tributos por mês"
                subtitle={`Faturamento mensal (total ${formatBRL(totValor)})`}
                right={<Legend items={[{ label: 'Faturamento', color: PALETTE.valor }]} />}
                className="lg:col-span-2"
              >
                <LineChart
                  labels={rotulos}
                  series={[{ name: 'Faturamento', color: PALETTE.valor, values: mensal.map((m) => m.valor), area: true }]}
                  format={(v) => formatBRL(v)}
                />
              </ChartCard>

              <ChartCard
                title="Composição dos tributos do RTC por mês"
                subtitle="IBS · CBS · IS sobre as notas emitidas"
                right={<Legend items={CORES_RTC.map((c) => ({ label: c.name, color: c.color }))} />}
              >
                <StackedBarChart
                  labels={rotulos}
                  series={CORES_RTC.map((c) => ({ name: c.name, color: c.color, values: mensal.map((m) => m[c.key]) }))}
                  format={(v) => formatBRL(v)}
                />
              </ChartCard>

              <ChartCard
                title="Comparativo: ISS das notas × RTC do regime regular"
                subtitle="Migração Simples Nacional → Regime Regular"
                right={
                  <Legend
                    items={[
                      { label: 'ISS (notas)', color: PALETTE.iss },
                      { label: 'RTC (IBS+CBS+IS)', color: PALETTE.rtc },
                    ]}
                  />
                }
              >
                <GroupedBarChart
                  labels={rotulos}
                  series={[
                    { name: 'ISS (notas)', color: PALETTE.iss, values: mensal.map((m) => m.iss) },
                    { name: 'RTC (IBS+CBS+IS)', color: PALETTE.rtc, values: mensal.map((m) => m.rtc) },
                  ]}
                  format={(v) => formatBRL(v)}
                />
              </ChartCard>

              <ChartCard title="Composição total do RTC" subtitle={`Carga total ${formatBRL(totRtc)}`}>
                <DonutChart
                  slices={[
                    { label: 'IBS Estadual', value: comDados.reduce((s, a) => s + a.atual!.vIBSUF, 0), color: PALETTE.ibsUf },
                    { label: 'IBS Municipal', value: comDados.reduce((s, a) => s + a.atual!.vIBSMun, 0), color: PALETTE.ibsMun },
                    { label: 'CBS', value: totCbs, color: PALETTE.cbs },
                    { label: 'IS', value: totIs, color: PALETTE.is },
                  ]}
                  format={(v) => formatBRL(v)}
                />
              </ChartCard>

              <ChartCard
                title="Distribuição da alíquota efetiva por nota"
                subtitle="RTC (IBS+CBS+IS) ÷ valor do serviço"
                right={<Legend items={[{ label: 'nº de notas', color: PALETTE.rtc }]} />}
              >
                <HistogramChart bins={histAliq} color={PALETTE.rtc} />
                <p className="mt-2 text-[10px] text-zinc-600">
                  Faixa: {histAliq.length ? `${histAliq[0].x0.toFixed(3)}% – ${histAliq[histAliq.length - 1].x1.toFixed(3)}%` : '—'} · alíquota efetiva média {pct(aliqEfetiva)}
                </p>
              </ChartCard>

              <ChartCard
                title="Previsão — próximos 6 meses"
                subtitle={`Carga RTC mensal · média ${formatBRL(previsao.media)} · mediana ${formatBRL(previsao.mediana)} · tendência ${previsao.tendenciaPorMes >= 0 ? '+' : ''}${formatBRL(previsao.tendenciaPorMes)}/mês (R² ${previsao.r2.toFixed(2)})`}
                right={
                  <Legend
                    items={[
                      { label: 'Realizado', color: PALETTE.rtc },
                      { label: 'Média', color: PALETTE.cbs, dashed: true },
                      { label: 'Mediana', color: PALETTE.ibsMun, dashed: true },
                      { label: 'Tendência', color: PALETTE.forecast, dashed: true },
                    ]}
                  />
                }
                className="lg:col-span-2"
              >
                <LineChart
                  labels={fcLabels}
                  series={[
                    { name: 'Realizado', color: PALETTE.rtc, values: fcRtc, area: true },
                    { name: 'Média (6m)', color: PALETTE.cbs, values: fcMedia, dashed: true },
                    { name: 'Mediana (6m)', color: PALETTE.ibsMun, values: fcMediana, dashed: true },
                    { name: 'Tendência linear', color: PALETTE.forecast, values: fcTend, dashed: true },
                  ]}
                  band={{ lo: bandLo, hi: bandHi }}
                  format={(v) => formatBRL(v)}
                  height={260}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="Mín. histórico" value={formatBRL(previsao.minimo)} />
                  <MiniStat label="Máx. histórico" value={formatBRL(previsao.maximo)} />
                  <MiniStat label="Desvio padrão" value={formatBRL(previsao.desvio)} />
                  <MiniStat label="Variabilidade" value={`${(saturacao * 100).toFixed(1)}%`} />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                  A faixa sombreada representa o intervalo mínimo–máximo observado nos meses analisados. A média e a mediana são constantes no horizonte; a tendência usa regressão linear sobre os meses históricos.
                </p>
              </ChartCard>

              {usarFuturo && (
                <ChartCard
                  title="Regime atual × cenário pós-2027"
                  subtitle="Carga total apurada sobre a mesma base de notas"
                  right={
                    <Legend
                      items={[
                        { label: 'IBS', color: PALETTE.ibsUf },
                        { label: 'CBS', color: PALETTE.cbs },
                        { label: 'IS', color: PALETTE.is },
                      ]}
                    />
                  }
                >
                  <GroupedBarChart
                    labels={['Regime atual', `Pós-2027 (${pct(Number(cbs) || 0)} CBS)`]}
                    series={[
                      { name: 'IBS', color: PALETTE.ibsUf, values: [totIbs, comDados.reduce((s, a) => s + (a.futuro?.vIBS ?? 0), 0)] },
                      { name: 'CBS', color: PALETTE.cbs, values: [totCbs, comDados.reduce((s, a) => s + (a.futuro?.vCBS ?? 0), 0)] },
                      { name: 'IS', color: PALETTE.is, values: [totIs, comDados.reduce((s, a) => s + (a.futuro?.vIS ?? 0), 0)] },
                    ]}
                    format={(v) => formatBRL(v)}
                  />
                </ChartCard>
              )}
            </div>
          )}

          {/* Tabela */}
          {analisadas.length > 0 && (
            <Card>
              <SectionTitle
                icon={<span>📄</span>}
                right={
                  <div className="flex gap-2">
                    <Btn variant="ghost" onClick={exportarCSV} className="!px-2.5 !py-1 !text-[11px]">
                      CSV
                    </Btn>
                    <Btn variant="ghost" onClick={exportarJSON} className="!px-2.5 !py-1 !text-[11px]">
                      JSON
                    </Btn>
                  </div>
                }
              >
                Notas e tributos apurados
              </SectionTitle>
              <div className="max-h-[30rem] overflow-auto px-2 pb-3">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 z-10 bg-zinc-900/95 text-zinc-500 backdrop-blur">
                    <tr className="text-left">
                      <Th>Nº</Th>
                      <Th>Layout</Th>
                      <Th>Comp.</Th>
                      <Th right>Valor</Th>
                      <Th>NBS</Th>
                      <Th>CST/cClassTrib</Th>
                      <Th right>ISS</Th>
                      <Th right>IBS</Th>
                      <Th right>CBS</Th>
                      <Th right>IS</Th>
                      <Th right>Total RTC</Th>
                      <Th right>Alíq.</Th>
                      <Th right>Ação</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((a) => {
                      const aliq = a.atual && a.nota.valorServicos ? (a.atual.vTotal / a.nota.valorServicos) * 100 : 0
                      const aberta = expandida === a.nota.id
                      return (
                        <Fragment key={a.nota.id}>
                          <tr
                            key={a.nota.id}
                            className={clsx('border-t border-zinc-800/60 hover:bg-zinc-800/20', a.nota.cancelada && 'opacity-60')}
                          >
                            <Td>
                              <button className="flex items-center gap-1 font-mono text-zinc-300 hover:text-sky-400" onClick={() => setExpandida(aberta ? null : a.nota.id)}>
                                <span className={clsx('inline-block transition-transform', aberta ? 'rotate-90' : '')}>▸</span>
                                {a.nota.numero}
                              </button>
                              {a.nota.cancelada && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[9px] text-amber-400">cancelada</span>}
                            </Td>
                            <Td>
                              <span className="text-zinc-500">{a.nota.layout === 'abrasf-2.04' ? 'ABRASF' : a.nota.layout === 'danfse-pdf' ? 'DANFSe (PDF)' : 'SPED/DPS'}</span>
                            </Td>
                            <Td>
                              <span className="font-mono text-zinc-400">{a.nota.competencia}</span>
                            </Td>
                            <Td right>{formatBRL(a.nota.valorServicos)}</Td>
                            <Td>
                              <span className="font-mono text-zinc-400">{a.nbsUsado ?? a.nota.nbs ?? '—'}</span>
                            </Td>
                            <Td>
                              <span className="font-mono text-zinc-400">{a.cst}/{a.cClassTrib}</span>
                              {a.classificacao && <span className="ml-1 text-zinc-600" title={a.classificacao.descricaoClassificacaoTributaria}>✓</span>}
                            </Td>
                            <Td right>{formatBRL(a.nota.valorIss ?? 0)}</Td>
                            <Td right>{a.atual ? formatBRL(a.atual.vIBS) : '—'}</Td>
                            <Td right>{a.atual ? formatBRL(a.atual.vCBS) : '—'}</Td>
                            <Td right>{a.atual ? formatBRL(a.atual.vIS) : '—'}</Td>
                            <Td right strong>{a.atual ? formatBRL(a.atual.vTotal) : a.erroAtual ? 'erro' : '—'}</Td>
                            <Td right>{a.atual ? pct(aliq) : '—'}</Td>
                            <Td right>
                              <button
                                onClick={() => fillCalculadora(a)}
                                className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-sky-500/50 hover:text-sky-300"
                                title="Preencher a calculadora com esta nota"
                              >
                                usar
                              </button>
                            </Td>
                          </tr>
                          {aberta && (
                            <tr key={a.nota.id + '-det'} className="border-t border-zinc-800/60 bg-zinc-950/40">
                              <td colSpan={13} className="px-4 py-3">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-1 text-[11px] text-zinc-400">
                                    <p><span className="text-zinc-600">Tomador:</span> {a.nota.tomadorNome ?? '—'}</p>
                                    <p><span className="text-zinc-600">Prestador:</span> {a.nota.prestadorNome ?? '—'} {a.nota.prestadorCnpj ? `(${a.nota.prestadorCnpj})` : ''}</p>
                                    <p><span className="text-zinc-600">Serviço:</span> {a.nota.descricaoServico ?? '—'}</p>
                                    <p><span className="text-zinc-600">Emissão:</span> {a.nota.dataEmissao || '—'}</p>
                                    <p><span className="text-zinc-600">Município/UF:</span> {a.nota.municipio ?? '—'} / {a.nota.uf}</p>
                                    <p><span className="text-zinc-600">Simples Nacional:</span> {a.nota.optanteSimples == null ? '—' : a.nota.optanteSimples ? 'sim' : 'não'}</p>
                                    {a.classificacao && (
                                      <p>
                                        <span className="text-zinc-600">Classificação:</span> {a.classificacao.descricaoSituacaoTributaria} — {a.classificacao.descricaoClassificacaoTributaria}
                                      </p>
                                    )}
                                    {a.erroAtual && <p className="text-red-400">Erro (atual): {a.erroAtual}</p>}
                                    {a.erroFuturo && <p className="text-red-400">Erro (pós-2027): {a.erroFuturo}</p>}
                                  </div>
                                  <div className="space-y-2">
                                    {a.atual && (
                                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                                        <p className="mb-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">Memória de cálculo — atual</p>
                                        <p className="mb-1 text-[11px] text-zinc-300">
                                          BC {formatBRL(a.atual.vBC)} · alíquotas nominais {a.atual.pIBSUF.toFixed(2)}% + {a.atual.pIBSMun.toFixed(2)}% (IBS) e {a.atual.pCBS.toFixed(2)}% (CBS)
                                          {a.atual.pReducao != null && ` · redução ${a.atual.pReducao}%`}
                                        </p>
                                        <ul className="space-y-0.5">
                                          {a.atual.memoria.map((m, i) => (
                                            <li key={i} className="text-[11px] leading-relaxed text-zinc-500">
                                              {m}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {a.futuro && (
                                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                                        <p className="mb-1 text-[10px] font-semibold tracking-wide text-amber-400/80 uppercase">Cenário pós-2027</p>
                                        <p className="text-[11px] text-zinc-300">
                                          BC {formatBRL(a.futuro.vBC)} · RTC {formatBRL(a.futuro.vTotal)} ({formatBRL(a.futuro.vIBS)} IBS + {formatBRL(a.futuro.vCBS)} CBS + {formatBRL(a.futuro.vIS)} IS)
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function baixar(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

function SegBtn({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition',
        selected ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50',
      )}
    >
      {children}
    </button>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'sky' | 'amber' | 'emerald' }) {
  const tones = {
    sky: 'text-sky-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
  }
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <p className="text-[11px] font-medium uppercase text-zinc-500">{label}</p>
      <p className={clsx('mt-1 text-lg font-bold tracking-tight', tone ? tones[tone] : 'text-zinc-100')}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-zinc-500">{hint}</p>}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-900/60 px-3 py-2">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="font-mono text-xs text-zinc-200">{value}</p>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={clsx('px-2 py-2 font-medium', right && 'text-right')}>{children}</th>
}

function Td({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) {
  return <td className={clsx('px-2 py-1.5', right && 'text-right', strong ? 'font-semibold text-zinc-100' : 'text-zinc-300')}>{children}</td>
}
