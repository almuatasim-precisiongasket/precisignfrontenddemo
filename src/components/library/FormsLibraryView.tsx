import { ArrowRight, CreditCard, FileText, Monitor, Receipt, Sliders } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { canAdministerWorkflows } from '../../utils/workflowAdministration';
import { canUserStartForm } from '../../utils/companyAccess';
import { FinancialRequestView } from '../create/FinancialRequestView';
import { ITRequestPreviewView } from '../create/ITRequestPreviewView';

export const companyForms = [
  {
    name: 'Administrative & Payment Request',
    department: 'Administration / Accounts',
    description: 'Request administrative work and include company payment details when needed.',
    icon: FileText,
  },
  {
    name: 'IT Request',
    department: 'Information Technology',
    description: 'Describe the equipment, software, access or other IT support you need and why.',
    icon: Monitor,
  },
  {
    name: 'Cash Voucher',
    department: 'Administration / Accounts',
    description: 'Document a cash payout from Admin petty cash or Accounts.',
    icon: CreditCard,
  },
  {
    name: 'Expense Claim',
    department: 'Finance & Accounts',
    description: 'Submit itemized expenses and link receipts or no-bill reasons.',
    icon: Receipt,
  },
] as const;

type FormName = typeof companyForms[number]['name'];
export type LibraryEditorForm = Exclude<FormName, 'Administrative & Payment Request'>;

export function FormsLibraryView({ initialForm }: { initialForm?: LibraryEditorForm } = {}) {
  const { setSelectedRequestFormType, setActiveView, selectedCompany, selectedScope, currentUser, workflows, companies, readOnly: connected } = useApp();
  const openForm = initialForm;
  const scopedCompanies = companies.filter(company => selectedScope === 'PEG' || company.id === selectedScope);
  const visibleForms = companyForms.filter(form => !connected || scopedCompanies.some(company => canUserStartForm(currentUser, company.id, form.name)));
  const editorKey = [currentUser.id, selectedScope, openForm].join(':');
  const closeForm = () => setActiveView('forms-library');

  function launch(form: FormName) {
    setSelectedRequestFormType(form);
    setActiveView('create-request');
  }

  if (openForm === 'IT Request') return <ITRequestPreviewView key={editorKey} onBack={closeForm} />;
  if (openForm === 'Cash Voucher' || openForm === 'Expense Claim') {
    return <FinancialRequestView key={editorKey} form={openForm} onBack={closeForm} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-workspace-line pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-workspace-ink sm:text-3xl">Forms Library</h1>
          <p className="mt-1 text-sm text-slate-600">{selectedScope === 'PEG' ? 'Group View · Choose a form, then select the legal company it belongs to.' : selectedCompany.fullName}</p>
        </div>
        {(!connected || canAdministerWorkflows(currentUser)) && <button type="button" onClick={() => setActiveView('workflow-settings')} className="workspace-control inline-flex min-h-10 items-center gap-2 px-4 text-sm font-semibold">
          <Sliders className="size-4" aria-hidden="true" /> Signing routes
        </button>}
      </header>
      {visibleForms.length === 0 && <div className="workspace-panel p-6">
        <h2 className="font-semibold text-workspace-ink">No forms available in this view</h2>
        <p className="mt-1 text-sm text-slate-600">Switch company or ask your account administrator for form access.</p>
      </div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleForms.map(({ name, department, description, icon: Icon }) => {
          const readyCompanies = scopedCompanies.filter(company => canUserStartForm(currentUser, company.id, name)
            && workflows.some(route => route.companyId === company.id && route.formType === name && route.stages.length > 0));
          const configured = readyCompanies.length > 0;
          return (
            <article key={name} className="workspace-panel flex min-w-0 flex-col gap-3 p-5 transition-colors hover:border-workspace-steel focus-within:border-workspace-steel">
              <div className="inline-flex size-10 items-center justify-center rounded-lg bg-workspace-tint text-workspace-teal"><Icon className="size-4" aria-hidden="true" /></div>
              <h2 className="text-base font-semibold leading-tight text-[#192B3C]">{name}</h2>
              <p className="flex-1 text-sm text-slate-600">{description}</p>
              <div className="border-t border-workspace-line pt-3 text-xs text-workspace-muted">
                <p className="font-medium">{department}</p>
                <p className={`mt-1 ${configured ? 'font-medium text-teal-800' : 'text-slate-600'}`}>
                  {configured ? (selectedScope === 'PEG' ? `Ready in ${readyCompanies.map(company => company.id).join(', ')}` : 'Signing route configured') : 'Signing route required to send'}
                </p>
              </div>
              <button type="button" aria-label={`Open form: ${name}`} onClick={() => launch(name)} className="workspace-control inline-flex min-h-10 items-center justify-between gap-2 px-3 text-sm font-semibold">
                Open form <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
