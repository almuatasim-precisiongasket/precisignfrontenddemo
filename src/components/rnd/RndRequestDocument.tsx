import type { AdminWorkFormData } from '../../types';
import { rndGroups } from '../../utils/rndFields';
import { rndDocumentTemplate } from './documentTemplate';
import './rndDocument.css';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
function image(src?: string, label = '') {
  // Only local image bytes enter this trusted, static template, never remote URLs or user HTML.
  return src && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src)
    ? `<img alt="${escape(label)}" src="${src}" style="max-width:100%;max-height:9mm;object-fit:contain" />` : '';
}

export function RndRequestDocument({ data }: { data: AdminWorkFormData }) {
  const rnd = data.rnd;
  const values: Record<string, string> = {};
  for (const [id, value] of Object.entries(rnd?.fields ?? {})) values[id.replace(/^inp/, 'out')] = escape(value);
  values.outCompany = escape(data.companyName);
  values.companyName = escape(data.companyName);
  values.companyLogo = image(data.companyLogoDataUrl, 'Company logo');
  values.runningRefDisplay = values.outSubRef ?? '';
  values.outGSubBy = escape(data.requesterSignatureName ?? rnd?.fields.inpGSubBy ?? data.requesterName);
  values.outGDate = escape(data.requesterSignatureDate?.slice(0, 10) ?? rnd?.fields.inpGDate ?? '');
  values.outGSigImg = image(data.requesterSignatureDataUrl, 'Submitter signature');
  values.outHSigImg = image(data.approvalAuthoritySignatureDataUrl, 'Final approver signature');
  values.outHRevBy = escape(rnd?.fields.inpHRevBy || data.approvalAuthoritySignatureName || '');
  values.outHDate = escape(rnd?.fields.inpHDate || data.approvalAuthoritySignatureDate?.slice(0, 10) || '');
  if (data.rndEvaluationUpdatedAfterSigning) values.outHSigImg += '<span style="display:block;font-size:6.5pt;font-weight:bold">Evaluation updated after signing. See signed copy in history.</span>';
  for (const group of rndGroups) {
    values[group.docContainer] = group.options.map(option => `<span class="print-chk"><span class="box-sq">${rnd?.choices[group.id]?.includes(option) ? '✓' : ''}</span><span>${escape(option)}</span></span>`).join('');
    const other = ({ q3Freq: 'inpQ3FreqOther', q5Areas: 'inpQ5Other', q9Barriers: 'inpQ9Other', q12Goals: 'inpQ12Other', fAttach: 'inpFOther' } as Record<string, string>)[group.id];
    if (other && rnd?.fields[other]) values[group.docContainer] += `<span>${escape(rnd.fields[other])}</span>`;
  }
  values.docMktTableBody = (rnd?.marketRows.length ? rnd.marketRows : [{ sol: '', sup: '', web: '' }, { sol: '', sup: '', web: '' }]).map(row => `<tr>${[row.sol, row.sup, row.web].map(value => `<td><div class="doc-editable">${escape(value)}</div></td>`).join('')}</tr>`).join('');
  const markup = rndDocumentTemplate.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
  return <div className="rnd-document" dangerouslySetInnerHTML={{ __html: markup }} />;
}
