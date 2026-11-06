import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { Company } from '../../types';
import type { IAccountAdministrationRepository } from '../../services/repository';

export function CompanyBrandingView({ repository }: { repository: IAccountAdministrationRepository }) {
  const [companies, setCompanies] = useState<Company[]>();
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    repository.listCompanyBranding().then(result => {
      if (!cancelled) setCompanies(result);
    }).catch(() => {
      if (!cancelled) setLoadError(true);
    });
    return () => { cancelled = true; };
  }, [repository, attempt]);

  return (
    <section className="mx-auto max-w-4xl space-y-5 px-4 py-7 sm:px-8">
      <header>
        <h1 className="text-2xl font-bold">Company branding</h1>
        <p className="mt-2 text-sm text-workspace-muted">Manage the logo used on new requests for each legal company. Submitted requests keep their original branding.</p>
      </header>
      {loadError ? <div className="workspace-panel space-y-2 p-5">
        <p role="alert">Could not load company branding.</p>
        <button type="button" className="workspace-control px-3 py-2" onClick={() => { setLoadError(false); setAttempt(value => value + 1); }}>Retry</button>
      </div> : !companies ? <p role="status">Loading companiesâ€¦</p> : companies.map(company =>
        <CompanyLogoEditor key={company.id} company={company} repository={repository} />
      )}
    </section>
  );
}

function CompanyLogoEditor({ company, repository }: { company: Company; repository: IAccountAdministrationRepository }) {
  const [logo, setLogo] = useState(company.logoDataUrl ?? null);
  const [file, setFile] = useState<File>();
  const [inputKey, setInputKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function save(remove: boolean) {
    if (saving || (!remove && !file)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const dataUrl = remove ? null : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the image.'));
        reader.readAsDataURL(file!);
      });
      setLogo(await repository.updateCompanyLogo(company.id, dataUrl));
      setFile(undefined);
      setInputKey(value => value + 1);
      setMessage(remove ? 'Logo removed.' : 'Logo saved.');
    } catch {
      setError('Could not save the change. Use a readable PNG or JPEG up to 2 MiB and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="workspace-panel grid gap-4 p-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <div className="grid h-20 w-32 place-items-center rounded-lg border border-slate-200 bg-white p-2">
        {logo ? <img className="max-h-full max-w-full object-contain" src={logo} alt={`${company.code} logo`} />
          : <span className="text-center text-xs text-workspace-muted"><ImageIcon aria-hidden="true" className="mx-auto mb-1 size-5" /> No logo</span>}
      </div>
      <div className="min-w-0 space-y-3">
        <h2 className="font-semibold">{company.fullName}</h2>
        <label className="block text-sm">
          <span className="block font-medium">Choose a logo for {company.code}</span>
          <input key={inputKey} type="file" accept="image/png,image/jpeg" disabled={saving} className="mt-1 block max-w-full text-sm"
            onChange={event => {
              const selected = event.currentTarget.files?.[0];
              setMessage('');
              const invalid = selected && (!['image/png', 'image/jpeg'].includes(selected.type) || selected.size > 2 * 1024 * 1024);
              setError(invalid ? 'Choose a PNG or JPEG up to 2 MiB.' : '');
              setFile(invalid ? undefined : selected);
              if (invalid) event.currentTarget.value = '';
            }} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!file || saving} onClick={() => void save(false)} className="workspace-control px-3 py-2 text-sm font-semibold disabled:opacity-50">Save logo</button>
          {logo && <button type="button" disabled={saving} onClick={() => void save(true)} className="workspace-control px-3 py-2 text-sm">Remove logo</button>}
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {(saving || message) && <p role="status" className="text-sm text-workspace-muted">{saving ? 'Savingâ€¦' : message}</p>}
      </div>
    </article>
  );
}
