/**
 * NFS-e → Calculadora RTC
 * -----------------------------------------------------------------------------
 * Leitura de XML de NFS-e (leiautes ABRASF 2.04 e SPED/DPS 1.00) e integração com
 * a API da calculadora do Regime Regular (IBS · CBS · IS).
 */

export type NfseLayout = 'abrasf-2.04' | 'sped-dps-1.00' | 'danfse-pdf'

export interface ParsedNfse {
  id: string
  layout: NfseLayout
  arquivo: string
  numero: string
  codigoVerificacao?: string
  /** ISO com offset quando disponível (ex.: 2026-03-17T19:52:20-03:00) */
  dataEmissao: string
  /** ISO date (yyyy-MM-dd) da competência */
  competencia: string
  valorServicos: number
  baseCalculo: number
  aliquotaIss: number | null
  valorIss: number | null
  valorLiquido: number | null
  itemListaServico?: string
  cTribNac?: string
  cnae?: string
  codigoTributacaoMunicipio?: string
  nbs?: string
  descricaoServico?: string
  prestadorNome?: string
  prestadorCnpj?: string
  tomadorNome?: string
  municipio: number | null
  uf: string
  optanteSimples: boolean | null
  cancelada: boolean
}

export interface NbsOption {
  codigo: string
  descricao: string
}

export interface ClassificacaoTributaria {
  codigoSituacaoTributaria: string
  descricaoSituacaoTributaria: string
  codigoClassificacaoTributaria: string
  descricaoClassificacaoTributaria: string
}

export interface AliquotasNominais {
  cbs: number
  ibsEstadual: number
  ibsMunicipal: number
}

export interface TaxBreakdown {
  vBC: number
  vIBS: number
  vIBSUF: number
  vIBSMun: number
  vCBS: number
  vIS: number
  vTotal: number
  pIBSUF: number
  pIBSMun: number
  pCBS: number
  pReducao: number | null
  memoria: string[]
}

export interface CalcOk {
  ok: true
  tax: TaxBreakdown
}
export interface CalcErr {
  ok: false
  erro: string
}
export type CalcResult = CalcOk | CalcErr

export const API_BASE = '/api/calculadora'

/** NBS presentes nas notas deste projeto — usados como atalho no seletor. */
export const NBS_PRESETS: NbsOption[] = [
  { codigo: '123012200', descricao: 'Serviços médicos especializados (NBS do prestador)' },
  { codigo: '123012100', descricao: 'Serviços de clínica médica' },
]

export const TP_DOC_NFSE = 91

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de XML
// ─────────────────────────────────────────────────────────────────────────────

function localName(el: Element): string {
  return el.localName || el.tagName.replace(/^.*:/, '')
}

function descendants(parent: Element | null): Element[] {
  if (!parent) return []
  return Array.from(parent.getElementsByTagName('*'))
}

function allByLocal(parent: Element | null, name: string): Element[] {
  return descendants(parent).filter((el) => localName(el) === name)
}

function one(parent: Element | null, name: string): Element | null {
  return descendants(parent).find((el) => localName(el) === name) ?? null
}

function anyByLocalMatch(parent: Element | null, re: RegExp): Element | null {
  return descendants(parent).find((el) => re.test(localName(el))) ?? null
}

function txt(parent: Element | null, name: string): string | undefined {
  const el = one(parent, name)
  const v = el?.textContent?.trim()
  return v ? v : undefined
}

function toNumber(v: string | undefined | null): number | null {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/\s+/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Normaliza uma data/hora para o formato exigido pela API: yyyy-MM-dd'T'HH:mm:ssXXX */
export function toOffsetIso(value: string | undefined, fallbackTime = '12:00:00'): string {
  if (!value) return ''
  let s = value.trim().replace(' ', 'T')
  s = s.replace(/\.\d+/, '')
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(s)
  if (hasTz) {
    if (/[+-]\d{4}$/.test(s)) s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    return s
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T' + fallbackTime
  if (/T\d{2}:\d{2}$/.test(s)) s += ':00'
  if (/T\d{2}$/.test(s)) s += ':00:00'
  return s + '-03:00'
}

export function dateOnly(value: string | undefined): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

export function parseNfseXml(xmlText: string, arquivo = 'nota.xml'): ParsedNfse[] {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error(`XML inválido: ${arquivo}`)
  }
  const root = doc.documentElement
  const comps = allByLocal(root, 'CompNfse')
  const nodes = comps.length ? comps : [root]
  const out: ParsedNfse[] = []
  for (const node of nodes) {
    const parsed = parseCompNfse(node, arquivo)
    if (parsed) out.push(parsed)
  }
  return out
}

function isCancelada(comp: Element): boolean {
  if (one(comp, 'NFSeCancelamento') || one(comp, 'NfseCancelamento')) return true
  if (anyByLocalMatch(comp, /cancel/i)) return true
  const cStat = txt(comp, 'cStat')
  return cStat === '101' || cStat === '135' || cStat === '155'
}

function parseCompNfse(comp: Element, arquivo: string): ParsedNfse | null {
  const infAbrasf = one(comp, 'InfNfse')
  if (infAbrasf) return parseAbrasf(comp, infAbrasf, arquivo)
  const infSped = one(comp, 'infNFSe')
  if (infSped) return parseSped(comp, infSped, arquivo)
  return null
}

function parseAbrasf(comp: Element, inf: Element, arquivo: string): ParsedNfse {
  const valoresNfse = one(inf, 'ValoresNfse')
  const decl = one(inf, 'DeclaracaoPrestacaoServico')
  const servico = one(decl, 'Servico')
  const valorServ = one(servico, 'Valores')
  const prestador = one(inf, 'PrestadorServico')
  const tomador = one(decl, 'TomadorServico')

  const valorServicos = toNumber(txt(valorServ, 'ValorServicos')) ?? 0
  const opt = txt(inf, 'OptanteSimplesNacional')

  return {
    id: `abrasf-${txt(prestador, 'Cnpj') ?? ''}-${txt(inf, 'Numero') ?? arquivo}`,
    layout: 'abrasf-2.04',
    arquivo,
    numero: txt(inf, 'Numero') ?? '',
    codigoVerificacao: txt(inf, 'CodigoVerificacao'),
    dataEmissao: toOffsetIso(txt(inf, 'DataEmissao')),
    competencia: dateOnly(txt(decl, 'Competencia') ?? txt(inf, 'DataEmissao')),
    valorServicos,
    baseCalculo: toNumber(txt(valoresNfse, 'BaseCalculo')) ?? valorServicos,
    aliquotaIss: toNumber(txt(valoresNfse, 'Aliquota')) ?? toNumber(txt(valorServ, 'Aliquota')),
    valorIss: toNumber(txt(valoresNfse, 'ValorIss')) ?? toNumber(txt(valorServ, 'ValorIss')),
    valorLiquido: toNumber(txt(valoresNfse, 'ValorLiquidoNfse')) ?? valorServicos,
    itemListaServico: txt(servico, 'ItemListaServico'),
    cnae: txt(servico, 'CodigoCnae'),
    codigoTributacaoMunicipio: txt(servico, 'CodigoTributacaoMunicipio'),
    nbs: txt(servico, 'CodigoNbs'),
    descricaoServico: txt(servico, 'Discriminacao'),
    prestadorNome: txt(prestador, 'RazaoSocial'),
    prestadorCnpj: txt(prestador, 'Cnpj'),
    tomadorNome: txt(tomador, 'RazaoSocial'),
    municipio: toNumber(txt(prestador, 'CodigoMunicipio')),
    uf: txt(prestador, 'Uf') ?? 'GO',
    optanteSimples: opt == null ? null : opt === '1',
    cancelada: isCancelada(comp),
  }
}

function parseSped(comp: Element, inf: Element, arquivo: string): ParsedNfse {
  const dps = one(inf, 'infDPS')
  const emit = one(inf, 'emit')
  const toma = one(inf, 'toma')
  const serv = one(inf, 'cServ')
  const valores = one(inf, 'valores')
  const valorServPrest = one(inf, 'vServPrest')
  const regTrib = one(inf, 'regTrib')
  const opSimpNac = txt(regTrib, 'opSimpNac')
  const valorServicos = toNumber(txt(valorServPrest, 'vServ')) ?? toNumber(txt(valores, 'vBC')) ?? 0

  return {
    id: `sped-${txt(emit, 'CNPJ') ?? ''}-${txt(inf, 'nNFSe') ?? arquivo}`,
    layout: 'sped-dps-1.00',
    arquivo,
    numero: txt(inf, 'nNFSe') ?? '',
    codigoVerificacao: txt(inf, 'nDFSe'),
    dataEmissao: toOffsetIso(txt(inf, 'dhProc') ?? txt(dps, 'dhEmi')),
    competencia: dateOnly(txt(dps, 'dCompet') ?? txt(inf, 'dhProc')),
    valorServicos,
    baseCalculo: toNumber(txt(valores, 'vBC')) ?? valorServicos,
    aliquotaIss: toNumber(txt(valores, 'pAliqAplic')) ?? toNumber(txt(one(inf, 'tribMun'), 'pAliq')),
    valorIss: toNumber(txt(valores, 'vISSQN')),
    valorLiquido: toNumber(txt(valores, 'vLiq')) ?? valorServicos,
    itemListaServico: txt(serv, 'cTribNac'),
    cTribNac: txt(serv, 'cTribNac'),
    nbs: txt(serv, 'cNBS'),
    descricaoServico: txt(serv, 'xDescServ') ?? txt(one(inf, 'infoCompl'), 'xInfComp'),
    prestadorNome: txt(emit, 'xNome'),
    prestadorCnpj: txt(emit, 'CNPJ'),
    tomadorNome: txt(toma, 'xNome'),
    municipio: toNumber(txt(emit, 'cMun')),
    uf: txt(emit, 'UF') ?? 'GO',
    optanteSimples: opSimpNac == null ? null : opSimpNac === '1',
    cancelada: isCancelada(comp),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing de PDF (DANFSe v2.0)
// ─────────────────────────────────────────────────────────────────────────────

const SEP_COLUNA_PDF = ' § '
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Para cada linha de cabeçalho que casa com `reCabecalho`, retorna a próxima
 * linha não vazia (o valor correspondente). Alguns cabeçalhos aparecem 2x
 * (prestador/tomador), por isso retornamos uma lista.
 */
function valoresAposCabecalho(linhas: string[], reCabecalho: RegExp): string[] {
  const out: string[] = []
  for (let i = 0; i < linhas.length; i++) {
    if (reCabecalho.test(semAcento(linhas[i]))) {
      for (let j = i + 1; j < linhas.length; j++) {
        if (linhas[j].trim()) {
          out.push(linhas[j])
          break
        }
      }
    }
  }
  return out
}

function partesPdf(linha: string | undefined): string[] {
  return (linha ?? '').split(SEP_COLUNA_PDF).map((p) => p.trim())
}

function dataBrParaIso(s: string): string {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

function dataHoraBrParaIso(s: string): string {
  const m = /(\d{2})\/(\d{2})\/(\d{4})[^\d]*(\d{2}):(\d{2}):(\d{2})/.exec(s)
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-03:00` : ''
}

function moedaBr(s: string | undefined): number | null {
  if (!s) return null
  const m = /([\d.]+),(\d{2})/.exec(s)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '') + '.' + m[2])
  return Number.isFinite(n) ? n : null
}

/**
 * Lê o texto extraído de um DANFSe v2.0 (ver `extrairTextoPdf` em pdf-text.ts) e
 * devolve a NFS-e no mesmo formato dos leiautes XML.
 */
export function parseNfsePdf(texto: string, arquivo = 'nota.pdf'): ParsedNfse[] {
  const t = texto.replace(/\r/g, '')
  const linhas = t.split('\n').map((l) => l.trim()).filter(Boolean)

  const chave = /\b(\d{40,50})\b/.exec(t)?.[1]

  const pNum = partesPdf(valoresAposCabecalho(linhas, /NUMERO DA NFS-E.*EMISSAO DA NFS-E/i)[0])
  const pServ = partesPdf(valoresAposCabecalho(linhas, /CODIGO DE TRIBUTACAO NACIONAL.*CODIGO DA NBS/i)[0])
  const pIbscbs = partesPdf(valoresAposCabecalho(linhas, /CST \/ CCLASSTRIB/i)[0])
  const pBase = partesPdf(valoresAposCabecalho(linhas, /BASE DE CALCULO APOS EXCLUSOES/i)[0])
  const pOper = partesPdf(valoresAposCabecalho(linhas, /VALOR DA OPERACAO.*SERVICO/i)[0])
  const pLiq = partesPdf(valoresAposCabecalho(linhas, /VALOR LIQUIDO DA NFS-E/i)[0])

  const cnpjs = valoresAposCabecalho(linhas, /CNPJ \/ CPF \/ NIF/i)
  const pPrestC = partesPdf(cnpjs[0])
  const pTomaC = partesPdf(cnpjs[1])

  const nomes = valoresAposCabecalho(linhas, /NOME \/ NOME EMPRESARIAL/i)
  const pPrestN = partesPdf(nomes[0])
  const pTomaN = partesPdf(nomes[1])

  const descricao = valoresAposCabecalho(linhas, /DESCRICAO DO SERVICO/i)[0]
  const simples = valoresAposCabecalho(linhas, /SIMPLES NACIONAL NA DATA DE COMPETENCIA/i)[0]
  const situacao = valoresAposCabecalho(linhas, /SITUACAO DA NFS-E/i)[0]

  // "000 / 000001 § 050102 / 5208707 / Goiânia / GO"
  const incidencia = (pIbscbs[1] ?? '').split('/').map((s) => s.trim())
  const municipioIncidencia = Number.parseInt(incidencia[1] ?? '', 10)
  const municipioPrestador = Number.parseInt((pPrestN[2] ?? '').split('/')[0] ?? '', 10)
  const municipio = Number.isFinite(municipioIncidencia) ? municipioIncidencia : Number.isFinite(municipioPrestador) ? municipioPrestador : null
  const uf = incidencia[3] || pPrestN[1]?.split('/')[1]?.trim() || 'GO'

  const numero = pNum[0] ?? ''
  const nbs = pServ[1] ? pServ[1].replace(/\D/g, '') : undefined
  if (!numero && !chave) throw new Error(`PDF sem NFS-e reconhecível: ${arquivo}`)

  return [
    {
      id: `danfse-${chave ?? numero}`,
      layout: 'danfse-pdf',
      arquivo,
      numero,
      codigoVerificacao: chave,
      dataEmissao: dataHoraBrParaIso(pNum[2] ?? ''),
      competencia: dataBrParaIso(pNum[1] ?? ''),
      valorServicos: moedaBr(pOper[0]) ?? 0,
      baseCalculo: moedaBr(pBase[1]) ?? moedaBr(pOper[0]) ?? 0,
      aliquotaIss: null,
      valorIss: null,
      valorLiquido: moedaBr(pLiq[1]) ?? moedaBr(pOper[0]),
      itemListaServico: pServ[0] || undefined,
      cTribNac: pServ[0] || undefined,
      codigoTributacaoMunicipio: pServ[0] || undefined,
      nbs,
      descricaoServico: descricao || undefined,
      prestadorNome: pPrestN[0] || undefined,
      prestadorCnpj: pPrestC[0] || undefined,
      tomadorNome: pTomaN[0] || undefined,
      municipio,
      uf,
      optanteSimples: simples ? /optante/i.test(simples) && !/nao optante/i.test(semAcento(simples)) : null,
      cancelada: /cancelad/i.test(situacao ?? ''),
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

async function messageOf(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const j = JSON.parse(text)
    return j?.detail || j?.title || res.statusText
  } catch {
    return text || res.statusText
  }
}

export async function fetchClassificacoes(nbs: string, data: string): Promise<ClassificacaoTributaria[]> {
  const url = `${API_BASE}/nfse/situacoes-classificacoes-tributarias?nbs=${encodeURIComponent(nbs)}&data=${encodeURIComponent(data)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(await messageOf(res))
  return (await res.json()) as ClassificacaoTributaria[]
}

export async function fetchNbsLista(data: string): Promise<NbsOption[]> {
  const res = await fetch(`${API_BASE}/dados-abertos/nbs/lista?data=${encodeURIComponent(data)}`)
  if (!res.ok) throw new Error(await messageOf(res))
  return (await res.json()) as NbsOption[]
}

export interface CalcItem {
  numero: number
  nbs?: string
  ncm?: string
  cst: string
  cClassTrib: string
  baseCalculo: number
  unidade: string
  aliquotasNominais?: AliquotasNominais
}

export interface CalcPayload {
  id: string
  versao: string
  dhFatoGerador: string
  dataHoraEmissao?: string
  uf: string
  municipio: number
  tpDoc: number
  itens: CalcItem[]
}

export async function calcRegimeRegular(payload: CalcPayload): Promise<unknown> {
  const res = await fetch(`${API_BASE}/regime-geral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(text || 'Resposta inválida da API')
  }
  if (!res.ok) {
    const d = data as { detail?: string; title?: string }
    throw new Error(d?.detail || d?.title || res.statusText)
  }
  return data
}

function n(v: unknown): number {
  if (v === null || v === undefined) return 0
  const x = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(x) ? x : 0
}

export function extractTaxes(res: unknown): TaxBreakdown {
  const r = res as Record<string, any>
  const t = r?.total?.tribCalc ?? {}
  const ibsCbsTot = t.IBSCBSTot ?? {}
  const gIBS = ibsCbsTot.gIBS ?? {}
  const gCBS = ibsCbsTot.gCBS ?? {}
  const vIBSUF = n(gIBS.gIBSUF?.vIBSUF)
  const vIBSMun = n(gIBS.gIBSMun?.vIBSMun)
  const vIBS = n(gIBS.vIBS) || vIBSUF + vIBSMun
  const vCBS = n(gCBS.vCBS)
  const vIS = n(t.ISTot?.gIS?.vIS)

  const obj = r?.objetos?.[0]?.tribCalc?.IBSCBS?.gIBSCBS ?? {}
  const gIBSUF = obj.gIBSUF ?? {}
  const gIBSMun = obj.gIBSMun ?? {}
  const gCBSItem = obj.gCBS ?? {}
  const pReducao = gIBSUF.gRed?.pRedAliq ?? null
  const memoria = [gIBSUF.memoriaCalculo, gIBSMun.memoriaCalculo, gCBSItem.memoriaCalculo, t.ISTot?.gIS?.memoriaCalculo].filter(
    (m: unknown): m is string => typeof m === 'string' && m.length > 0,
  )

  return {
    vBC: n(ibsCbsTot.vBCIBSCBS),
    vIBSUF,
    vIBSMun,
    vIBS,
    vCBS,
    vIS,
    vTotal: vIBS + vCBS + vIS,
    pIBSUF: n(gIBSUF.pIBSUF),
    pIBSMun: n(gIBSMun.pIBSMun),
    pCBS: n(gCBS.pCBS),
    pReducao,
    memoria,
  }
}
