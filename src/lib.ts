export interface ItemForm {
  numero: number
  ncm: string
  nbs: string
  cst: string
  cClassTrib: string
  baseCalculo: string
  quantidade: string
  unidade: string
  cbs: string
  ibsEstadual: string
  ibsMunicipal: string
  isAl: string
  isAlMx: string
  incluirAliquotas: boolean
}

export interface OperacaoForm {
  dhFatoGerador: string
  dataHoraEmissao: string
  uf: string
  municipio: string
  tpDoc: string
  id: string
  itens: ItemForm[]
}

export const UF_LIST: { code: string; name: string }[] = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
]

export const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'M2', 'M3', 'DZ', 'CX', 'PCT', 'PAR', 'DOZ']

export function novoItem(numero: number): ItemForm {
  return {
    numero,
    ncm: '',
    nbs: '',
    cst: '',
    cClassTrib: '',
    baseCalculo: '',
    quantidade: '',
    unidade: 'UN',
    cbs: '',
    ibsEstadual: '',
    ibsMunicipal: '',
    isAl: '',
    isAlMx: '',
    incluirAliquotas: false,
  }
}

export function novaOperacao(): OperacaoForm {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const id = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Math.random().toString(36).slice(2, 10)}`
  return {
    id,
    dhFatoGerador: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T15:00`,
    dataHoraEmissao: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T15:00`,
    uf: 'SP',
    municipio: '',
    tpDoc: '1',
    itens: [novoItem(1)],
  }
}

/** Normaliza um valor de <input type="datetime-local"> (yyyy-MM-ddTHH:mm) para o
 *  formato exigido pela API: yyyy-MM-dd'T'HH:mm:ssXXX (ex.: 2026-01-05T13:45:00-03:00) */
function toApiDateTime(value: string): string {
  if (!value) return value
  let s = value.trim().replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00'
  if (/T\d{2}:\d{2}$/.test(s)) s += ':00'
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s
  return s + '-03:00'
}

export function toPayload(op: OperacaoForm): Record<string, unknown> {
  const itens = op.itens.map((it) => {
    const item: Record<string, unknown> = { numero: it.numero }
    if (it.ncm) item.ncm = it.ncm
    if (it.nbs) item.nbs = it.nbs
    if (it.cst) item.cst = it.cst
    if (it.cClassTrib) item.cClassTrib = it.cClassTrib
    if (!it.cst) item.cst = '000'
    if (!it.cClassTrib) item.cClassTrib = '000001'
    if (it.baseCalculo) item.baseCalculo = Number(it.baseCalculo)
    if (it.quantidade) item.quantidade = Number(it.quantidade)
    item.unidade = it.unidade
    if (it.incluirAliquotas) {
      const a: Record<string, unknown> = {}
      if (it.cbs) a.cbs = Number(it.cbs)
      if (it.ibsEstadual) a.ibsEstadual = Number(it.ibsEstadual)
      if (it.ibsMunicipal) a.ibsMunicipal = Number(it.ibsMunicipal)
      if (it.isAl) { a.impostoSeletivo = { al: Number(it.isAl) } }
      if (Object.keys(a).length) item.aliquotasNominais = a
    }
    return item
  })

  const payload: Record<string, unknown> = {
    id: op.id,
    versao: '1.0.0',
    dhFatoGerador: toApiDateTime(op.dhFatoGerador),
    uf: op.uf,
    municipio: op.municipio ? Number(op.municipio) : 3550308,
  }
  if (op.dataHoraEmissao) payload.dataHoraEmissao = toApiDateTime(op.dataHoraEmissao)
  if (op.municipio) payload.municipio = Number(op.municipio)
  if (op.tpDoc) payload.tpDoc = Number(op.tpDoc)
  payload.itens = itens
  return payload
}

export function formatBRL(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
