/**
 * Extração de texto de PDF (DANFSe/NFS-e) via PDF.js.
 * O módulo é carregado sob demanda (dynamic import), mantendo o PDF.js fora do
 * bundle inicial. Nenhum dado sai do navegador além da própria API local.
 *
 * A saída preserva a estrutura em linhas e separa colunas por " § " (gap
 * horizontal grande entre fragmentos), o que torna o parsing dos campos
 * confiável — ver `parseNfsePdf` em nfse.ts.
 */

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

function carregarPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      // Worker empacotado pelo Vite (?url) — necessário para não travar a UI.
      mod.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      return mod
    })
  }
  return pdfjsPromise
}

interface ItemTexto {
  str: string
  x: number
  y: number
  w: number
}

const TOL_LINHA = 3
const GAP_COLUNA = 10
export const SEP_COLUNA = ' § '

/** Agrupa fragmentos de texto em linhas (por Y) e colunas (por gap em X). */
function montarLinhas(itens: ItemTexto[]): string {
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x)
  const linhas: string[] = []
  let atual: ItemTexto[] = []
  let yRef: number | null = null

  const descarregar = () => {
    if (!atual.length) return
    let out = ''
    for (let i = 0; i < atual.length; i++) {
      const it = atual[i]
      if (i > 0) {
        const prev = atual[i - 1]
        out += it.x - (prev.x + prev.w) > GAP_COLUNA ? SEP_COLUNA : ' '
      }
      out += it.str
    }
    linhas.push(out.replace(/\s+/g, ' ').trim())
    atual = []
  }

  for (const it of ordenados) {
    if (yRef === null || Math.abs(it.y - yRef) <= TOL_LINHA) {
      atual.push(it)
      if (yRef === null) yRef = it.y
    } else {
      descarregar()
      atual = [it]
      yRef = it.y
    }
  }
  descarregar()

  return linhas.filter(Boolean).join('\n')
}

/** Extrai o texto de um PDF, preservando a estrutura de linhas/colunas do DANFSe. */
export async function extrairTextoPdf(arquivo: File): Promise<string> {
  const pdfjs = await carregarPdfjs()
  const dados = new Uint8Array(await arquivo.arrayBuffer())
  const doc = await pdfjs.getDocument({ data: dados, isEvalSupported: false }).promise
  try {
    const paginas: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const conteudo = await page.getTextContent()
      const itens: ItemTexto[] = conteudo.items
        .filter((i): i is { str: string; transform: number[]; width: number } => 'str' in i && i.str.trim() !== '')
        .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))
      paginas.push(montarLinhas(itens))
      page.cleanup()
    }
    return paginas.join('\n')
  } finally {
    await doc.destroy()
  }
}
