import { useState } from 'react'
import type { ItemForm } from './lib'
import { UNIDADES } from './lib'
import { Field, Select, Toggle } from './ui'
import { clsx } from 'clsx'

export function ItemCard({ item, index, onUpdate, onRemove, canRemove }: {
  item: ItemForm
  index: number
  onUpdate: (patch: Partial<ItemForm>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const [showAliq, setShowAliq] = useState(false)

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 transition-colors hover:border-zinc-700">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-400">
            {item.numero}
          </span>
          <span className="text-sm font-medium text-zinc-300">Item</span>
        </div>
        <div className="flex items-center gap-3">
          <Toggle
            label="alíquotas"
            checked={item.incluirAliquotas}
            onChange={(v) => onUpdate({ incluirAliquotas: v })}
          />
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-zinc-600 transition hover:text-red-400"
              title="Remover item"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* campos principais */}
      <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4">
        <Field label="NCM" value={item.ncm} onChange={(v) => onUpdate({ ncm: v })} placeholder="10063021" />
        <Field label="NBS" value={item.nbs} onChange={(v) => onUpdate({ nbs: v })} placeholder="opcional" />
        <Field label="CST" value={item.cst} onChange={(v) => onUpdate({ cst: v })} placeholder="200" />
        <Field label="cClassTrib" value={item.cClassTrib} onChange={(v) => onUpdate({ cClassTrib: v })} placeholder="opcional" />
        <Field label="Base de Cálculo (R$)" type="number" step="0.01" min="0"
               value={item.baseCalculo} onChange={(v) => onUpdate({ baseCalculo: v })} placeholder="0,00" />
        <Field label="Qtd" type="number" step="0.01" min="0"
               value={item.quantidade} onChange={(v) => onUpdate({ quantidade: v })} placeholder="1" />
        <Select label="Unidade" value={item.unidade} onChange={(v) => onUpdate({ unidade: v })}
                options={UNIDADES.map((u) => ({ code: u }))} />
        <div className="hidden sm:block" />
      </div>

      {/* alíquotas nominais (após 01/01/2027) */}
      <div className={clsx(
        'grid transition-all duration-300',
        item.incluirAliquotas ? 'grid-rows-[1fr] opacity-100 pb-4' : 'grid-rows-[0fr] opacity-0',
      )}>
        <div className="overflow-hidden">
          <div className="mx-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="mb-2 text-[11px] text-amber-400/80">
              ⚠️ Alíquotas nominais — apenas para fato gerador em ou após 01/01/2027
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="CBS" type="number" step="0.0001" value={item.cbs}
                     onChange={(v) => onUpdate({ cbs: v })} placeholder="0.90" />
              <Field label="IBS Estadual" type="number" step="0.0001" value={item.ibsEstadual}
                     onChange={(v) => onUpdate({ ibsEstadual: v })} placeholder="0.10" />
              <Field label="IBS Municipal" type="number" step="0.0001" value={item.ibsMunicipal}
                     onChange={(v) => onUpdate({ ibsMunicipal: v })} placeholder="0.10" />
              <Field label="IS alíq." type="number" step="0.0001" value={item.isAl}
                     onChange={(v) => onUpdate({ isAl: v })} placeholder="opcional" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
