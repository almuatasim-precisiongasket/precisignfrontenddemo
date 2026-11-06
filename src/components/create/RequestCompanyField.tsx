import { useId } from 'react';
import { useApp } from '../../context/AppContext';
import type { CompanyId } from '../../types';
import { canUserStartForm } from '../../utils/companyAccess';

export function RequestCompanyField({ form, value, onChange }: {
  form: string;
  value: CompanyId | '';
  onChange?: (company: CompanyId) => void;
}) {
  const id = useId();
  const { companies, currentUser, workflows } = useApp();
  const options = companies.filter(company => canUserStartForm(currentUser, company.id, form));
  const company = options.find(option => option.id === value);
  const hasRoute = (companyId: CompanyId) => workflows.some(route => route.companyId === companyId && route.formType === form && route.stages.length > 0);

  return <div className="rounded-lg border border-workspace-line bg-workspace-tint/40 p-3.5 text-sm">
    {onChange ? (
      <>
        <label htmlFor={id} className="block font-semibold text-workspace-ink">Request company</label>
        <select id={id} aria-describedby={`${id}-hint`} className="workspace-control mt-2 min-h-11 w-full px-3" value={company?.id ?? ''} onChange={event => onChange(event.target.value as CompanyId)}>
          <option value="" disabled>Select a legal company</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.fullName}{hasRoute(option.id) ? '' : ' · Route needed'}</option>)}
        </select>
      </>
    ) : <>
      <p className="font-semibold text-workspace-ink">Request company</p>
      <p className="mt-1 text-workspace-ink">{company?.fullName ?? 'Unavailable'}</p>
    </>}
    <p id={`${id}-hint`} className="mt-2 text-xs text-slate-600" aria-live="polite">
      {company ? (hasRoute(company.id) ? 'Signing route configured.' : 'A workflow administrator needs to configure a signing route before you can send this form.') : options.length ? 'This company determines who signs and where the request is filed.' : 'You do not have access to start this form in any company.'}
    </p>
  </div>;
}
