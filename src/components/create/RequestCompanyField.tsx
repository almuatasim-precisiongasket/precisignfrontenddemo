import { EditorSelect } from './RequestEditorControls';
import { useId } from 'react';
import { useApp } from '../../context/AppContext';
import type { CompanyId } from '../../types';
import { canUserStartForm } from '../../utils/companyAccess';

export function RequestCompanyField({ form, value, onChange, fieldProps }: {
  form: string;
  value: CompanyId | '';
  fieldProps?: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string };
  onChange?: (company: CompanyId) => void;
}) {
  const generatedId = useId();
  const id = fieldProps?.id ?? generatedId;
  const description = [`${id}-hint`, fieldProps?.['aria-describedby']].filter(Boolean).join(' ');
  const { companies, currentUser, workflows } = useApp();
  const options = companies.filter(company => canUserStartForm(currentUser, company.id, form));
  const company = options.find(option => option.id === value);
  const hasRoute = (companyId: CompanyId) => workflows.some(route => route.companyId === companyId && route.formType === form && route.stages.length > 0);

  return <div className="rounded-lg border border-workspace-line bg-workspace-tint/40 p-3.5 text-sm">
    {onChange ? (
      <>
        <label htmlFor={id} className="block font-semibold text-workspace-ink">Request company</label>
        <EditorSelect {...fieldProps} id={id} aria-describedby={description} className="workspace-control mt-2 min-h-11 w-full px-3" value={company?.id ?? ''} onChange={event => onChange(event.target.value as CompanyId)}>
          <option value="" disabled>Select a legal company</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.fullName}{hasRoute(option.id) ? '' : ' · Route needed'}</option>)}
        </EditorSelect>
      </>
    ) : <div {...fieldProps} tabIndex={-1} aria-describedby={description}>
      <p className="font-semibold text-workspace-ink">Request company</p>
      <p className="mt-1 text-workspace-ink">{company?.fullName ?? 'Unavailable'}</p>
    </div>}
    <p id={`${id}-hint`} className="mt-2 text-xs text-slate-600" aria-live="polite">
      {options.length ? 'The company determines who can sign and where the request is filed.' : 'You do not have access to start this form in any company.'}
    </p>
  </div>;
}
