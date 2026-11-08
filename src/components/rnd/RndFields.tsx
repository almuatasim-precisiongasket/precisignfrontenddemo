import { useId } from 'react';
import type { RndFormData } from '../../types';
import { rndGroups, rndSections } from '../../utils/rndFields';

const control = 'workspace-control block w-full min-w-0 px-3 py-2 text-sm';
export function RndFields({ value, onChange, evaluation = false, disabled = false }: {
  value: RndFormData; onChange: (value: RndFormData) => void; evaluation?: boolean; disabled?: boolean;
}) {
  const prefix = useId();
  const update = (id: string, text: string) => onChange({ ...value, fields: { ...value.fields, [id]: text } });
  return <div className="space-y-5">{rndSections.filter(section => (section.id === 'H') === evaluation).map(section => <fieldset key={section.id} disabled={disabled} className="min-w-0 space-y-4 border-t border-workspace-line pt-4">
    <legend className="px-1 text-sm font-bold text-workspace-ink">{section.title}</legend>
    {section.items.map(item => {
      if (item.kind === 'text') {
        const automatic = ['inpCompany', 'inpGSubBy', 'inpGDate'].includes(item.id);
        return <label key={item.id} className="block space-y-1 text-sm"><span className="font-medium">{item.label}</span>
          {item.multiline ? <textarea id={`${prefix}-${item.id}`} className={control} rows={3} maxLength={2000} value={value.fields[item.id] ?? ''} onChange={e => update(item.id, e.target.value)} />
            : <input id={`${prefix}-${item.id}`} className={control} maxLength={2000} readOnly={automatic} value={value.fields[item.id] ?? ''} onChange={e => update(item.id, e.target.value)} />}
          {item.id === 'inpGSigText' && <span className="block text-xs text-workspace-muted">Your saved, uploaded or drawn signature is captured when you sign &amp; send.</span>}
        </label>;
      }
      if (item.kind === 'market') return <fieldset key={item.id} className="min-w-0 space-y-3"><legend className="text-sm font-medium">Market solutions</legend>
        {value.marketRows.map((row, index) => <div key={index} className="space-y-2 rounded-lg border border-workspace-line p-3">
          <p className="text-xs font-semibold">Solution {index + 1}</p>
          {(['sol', 'sup', 'web'] as const).map((key, i) => <label key={key} className="block text-xs">{['Solution / Product', 'Supplier / Company', 'Website / Reference'][i]}<input className={control} maxLength={300} value={row[key]} onChange={e => onChange({ ...value, marketRows: value.marketRows.map((r, n) => n === index ? { ...r, [key]: e.target.value } : r) })} /></label>)}
          <button type="button" className="text-xs font-semibold text-rose-700" onClick={() => onChange({ ...value, marketRows: value.marketRows.filter((_, i) => i !== index) })}>Remove solution {index + 1}</button>
        </div>)}
        <button type="button" className="workspace-control px-3 py-2 text-xs" disabled={value.marketRows.length >= 5} onClick={() => onChange({ ...value, marketRows: [...value.marketRows, { sol: '', sup: '', web: '' }] })}>Add solution (up to 5)</button>
      </fieldset>;
      const group = rndGroups.find(group => group.id === item.id)!;
      return <fieldset key={item.id} className="space-y-2"><legend className="text-sm font-medium">{item.label}</legend><div className="grid gap-2 sm:grid-cols-2">
        {group.options.map(option => <label key={option} className="flex items-start gap-2 rounded-md border border-workspace-line p-2 text-xs has-checked:border-teal-600 has-checked:bg-teal-50">
          <input type={group.singleSelect ? 'radio' : 'checkbox'} name={`${prefix}-${group.id}`} className="mt-0.5 accent-teal-700" checked={value.choices[group.id]?.includes(option) ?? false} onChange={e => onChange({ ...value, choices: { ...value.choices, [group.id]: group.singleSelect ? [option] : e.target.checked ? [...(value.choices[group.id] ?? []), option] : value.choices[group.id].filter(text => text !== option) } })} />{option}
        </label>)}
      </div></fieldset>;
    })}
  </fieldset>)}</div>;
}
