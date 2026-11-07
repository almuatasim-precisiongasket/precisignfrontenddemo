import { useId } from 'react';
import { Paperclip, X } from 'lucide-react';
import type { AttachmentItem } from '../../types';

const MiB = 1024 * 1024;
const types = ['application/pdf', 'image/png', 'image/jpeg'];

export function checkSupportingFiles(selected: File[], existing: AttachmentItem[], maxFiles: number) {
  if (existing.length + selected.length > maxFiles) return `Choose up to ${maxFiles} files.`;
  const invalid = selected.find(file => !types.includes(file.type) || !file.size || file.size > 5 * MiB || file.name.length > 200);
  if (invalid) return `${invalid.name}: choose a readable PDF, PNG, or JPEG up to 5 MiB with a name up to 200 characters.`;
  const total = [...existing.map(file => file.sizeBytes), ...selected.map(file => file.size)].reduce((sum, size) => sum + size, 0);
  if (total > 10 * MiB) return 'Keep the combined file size at or below 10 MiB.';
}

export function SupportingFiles({ title, files, maxFiles, busy, error, onSelect, onRemove, numbered }: {
  title: string; files: AttachmentItem[]; maxFiles: number; busy: boolean; error?: string;
  onSelect: (files: FileList) => void; onRemove: (index: number) => void; numbered?: boolean;
}) {
  const id = useId();
  return <section className="min-w-0 space-y-2 border-t border-workspace-line pt-3" aria-labelledby={id}>
    <h2 id={id} className="text-sm font-bold">{title} ({files.length})</h2>
    <p id={`${id}-help`} className="text-xs text-workspace-muted">PDF, PNG or JPEG. Up to {maxFiles} files, 5 MiB each and 10 MiB total.</p>
    <input type="file" multiple accept={types.join(',')} aria-label={`Add ${title.toLowerCase()}`}
      aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} disabled={busy}
      className="workspace-control block w-full min-w-0 p-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-workspace-tint file:px-2 file:py-1 file:font-semibold file:text-workspace-teal"
      onChange={event => {
        if (event.currentTarget.files?.length) onSelect(event.currentTarget.files);
        event.currentTarget.value = '';
      }} />
    {busy && <p role="status" className="text-xs text-workspace-muted">Reading files…</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-rose-700 [overflow-wrap:anywhere]">{error}</p>}
    {files.length > 0 && <ul className="divide-y divide-workspace-line">
      {files.map((file, index) => <li key={file.id} className="flex items-center gap-2 py-1 text-xs">
        <Paperclip aria-hidden="true" className="size-4 shrink-0 text-workspace-teal" />
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="font-semibold">{numbered && `${index + 1}. `}{file.name}</span> <span className="text-workspace-muted">· {file.sizeFormatted}</span>
        </div>
        <button type="button" aria-label={`Remove ${file.name}`} disabled={busy} className="workspace-control grid size-9 shrink-0 place-items-center"
          onClick={() => onRemove(index)}><X aria-hidden="true" className="size-4" /></button>
      </li>)}
    </ul>}
  </section>;
}
