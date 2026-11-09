import type { AdminWorkFormData, AttachmentItem, CompanyId, RequestRecord, UserProfile, WorkflowConfig } from '../types';
import { createNewRequestRecord, approveRequestStage, returnRequestForCorrection, completePreciRoute } from '../utils/workflowEngine';
import { proposeSignerReplacement } from '../utils/routeReplacement';
import { routeDraft, type RouteForm } from '../utils/routeForms';
import { saveRndEvaluation } from '../utils/rndWorkflow';
import { INITIAL_COMPANIES } from './companies';
import assets from './showcaseAssets.json';

export interface DemoDataset {
  namespace?: string;
  companies: typeof INITIAL_COMPANIES;
  users: UserProfile[];
  workflows: WorkflowConfig[];
  requests: RequestRecord[];
  session: { companyId: CompanyId | 'PEG'; userId: string };
}

const forms: RouteForm[] = ['Administrative & Payment Request', 'IT Request', 'Cash Voucher', 'Expense Claim', 'R&D Initiative'];
const companyIds: CompanyId[] = ['PEW', 'ICCL', 'FSG'];
const checklist = { onlineDocumentChamber: false, physicalDocumentChamber: false, companyDocumentAjeer: false, employeeSalaryCertificate: false, permanentEmploymentVisa: false, workVisitVisa: false, businessVisitVisa: false, agencyWakala: false, others: false, othersDescription: '' };

/** Names are demonstration personas; accounts, document content, attachments and signature marks are synthetic. */
export function createShowcaseDataset(now = new Date()): DemoDataset {
  const day = now.toISOString().slice(0, 10);
  const names = ['Anzar', 'Shekhar', 'Afzal Kazi', 'Farida', 'Taqvi', 'Muatasim', 'Shanid'] as const;
  const roles: UserProfile['role'][] = ['Admin', 'General Manager', 'Director', 'Finance', 'IT', 'Admin', 'IT'];
  const departments = ['Operations', 'Management', 'Leadership', 'Finance', 'IT', 'People & Administration', 'IT Support'];
  const users: UserProfile[] = names.map((name, i) => ({
    id: `showcase-user-${i}`, name, email: `demo-${i}@example.test`, role: roles[i], department: departments[i],
    initials: name.split(' ').map(part => part[0]).join(''), avatarColor: ['#0f766e', '#345c78', '#6366f1', '#b45309', '#0369a1', '#7c3aed', '#2563eb'][i],
    companyId: 'PEW', companyGrants: [...companyIds], formGrants: Object.fromEntries(companyIds.map(id => [id, [...forms]])),
    signatureStyleText: name, signatureDataUrl: assets.signatures[name as keyof typeof assets.signatures], isSuperAdmin: i === 5,
    canReplaceFinalApprover: i === 5,
  }));
  const [requester, manager, final, backup, it, administrator] = users;
  const workflows = companyIds.flatMap(companyId => forms.map(form => {
    const route = routeDraft(companyId, form);
    route.id = `showcase-${companyId}-${forms.indexOf(form)}`;
    route.version = 1;
    route.processingUserIds = form === 'IT Request' ? [it.id, users[6].id] : form === 'R&D Initiative' ? [] : [administrator.id, backup.id];
    route.stages = route.stages.map((stage, index) => ({ ...stage, id: `${route.id}-step-${index}`, assignedUserId: stage.isFinalApproval ? final.id : manager.id, assignedRole: stage.isFinalApproval ? final.role : manager.role, backupSignerIds: [backup.id] }));
    return route;
  }));
  const fileBytes = Math.floor(assets.attachment.split(',')[1].length * 3 / 4);
  const attachment: AttachmentItem = { id: 'showcase-attachment', name: 'DEMO-supporting-document.png', mimeType: 'image/png', sizeBytes: fileBytes, sizeFormatted: `${Math.ceil(fileBytes / 1024)} KB`, uploadedAt: `${day}T08:00:00.000Z`, uploadedBy: requester.name, dataUrl: assets.attachment };
  let sequence = 0;
  function create(form: RouteForm, companyId: CompanyId, title: string, stageIds?: string[]) {
    const configured = structuredClone(workflows.find(route => route.companyId === companyId && route.formType === form)!);
    if (stageIds) configured.stages = configured.stages.filter(stage => stage.isFinalApproval || stageIds.includes(stage.id)).map((stage, i) => ({ ...stage, stageNumber: i + 1 }));
    const company = INITIAL_COMPANIES.find(company => company.id === companyId)!;
    const data: AdminWorkFormData = { companyId, companyName: company.fullName, requesterId: requester.id, requesterName: requester.name, dateOfRequest: day, department: requester.department, priority: 'Medium', workDescription: title, documents: { ...checklist } };
    if (form === 'Administrative & Payment Request') data.administrativePayment = { documentDescription: 'Replace the PEW workshop air conditioner; supplier quotation included.', payment: { amount: '3500', transferMode: 'Bank', purpose: 'Other', otherPurpose: 'Workshop air conditioner replacement' } };
    if (form === 'IT Request') data.itRequest = { requestType: 'Laptop, Microsoft 365 and network access', justification: 'Shanid will prepare the laptop, account and network access for a new employee.' };
    if (form === 'Cash Voucher') data.cashVoucher = { payee: requester.name, recipientUserId: requester.id, amount: '450', amountInWords: 'Four hundred and fifty Saudi Riyals only', source: 'Accounts cash' };
    if (form === 'Expense Claim') data.expenseClaim = { designation: 'Operations coordinator', project: 'Dammam site visit', lines: [{ date: day, particulars: 'Mileage to Dammam', amount: '220', receiptIndex: 0 }, { date: day, particulars: 'Parking', amount: '30', receiptIndex: 0 }, { date: day, particulars: 'Meals', amount: '75', receiptIndex: 0 }] };
    if (form === 'R&D Initiative') data.rnd = { fields: { inpSubRef: 'DEMO-RND-001', inpSubDate: day, inpDept: requester.department, inpEmpName: `${requester.name} · Operations coordinator`, inpContact: requester.email, inpProbTitle: title, inpQ1: 'Gasket cutting layouts leave reusable material as waste.', inpQ2: 'A sample cutting run produced excess offcuts from standard sheet sizes.', inpQ3Occur: 'Three times per sample shift', inpImpTime: 'Approximately 30 minutes per shift', inpImpManpower: 'Two operators', inpImpFinance: 'To be evaluated', inpImpProd: 'Delayed restart', inpQ7: 'Operators currently record checks manually.', inpQ11Desc: 'Compare cutting layouts to reduce material waste.', inpGSubBy: requester.name, inpGDate: day }, choices: { q3Freq: ['Daily'], q3Rec: ['Yes'], q4Dur: ['1–6 months'], q5Areas: ['Equipment downtime', 'Productivity'], q8Mkt: ['Yes'], q9Barriers: ['Not yet evaluated'], q10Prev: ['No'], q11Prop: ['Yes'], q12Goals: ['Save time', 'Improve safety / accuracy'], q13Domains: ['Process Improvement', 'Automation / Robotics'], fAttach: ['Reports / Historical Records'] }, marketRows: [{ sol: 'Demonstration monitoring kit', sup: 'Fictional supplier', web: 'example.test' }] };
    sequence++;
    return createNewRequestRecord({ id: `${companyId}-${['AP', 'IT', 'CV', 'EC', 'RD'][forms.indexOf(form)]}-${now.getFullYear()}-${String(sequence).padStart(4, '0')}`, formType: form, requester, users, workflowConfig: configured, formData: data, attachments: [{ ...attachment, id: `showcase-file-${sequence}` }], comment: 'Fictional request for exploring the PreciSign showcase.', signatureDataUrl: requester.signatureDataUrl });
  }
  function checked(result: { success: boolean; error?: string; updatedRequest?: RequestRecord }) {
    if (!result.success || !result.updatedRequest) throw new Error(`Invalid showcase fixture: ${result.error}`);
    return result.updatedRequest;
  }
  const approve = (request: RequestRecord, actor: UserProfile) => checked(approveRequestStage({ request, actingUser: actor, signatureDataUrl: actor.signatureDataUrl, comment: 'Reviewed the synthetic request.' }));
  const requests: RequestRecord[] = [];
  requests.push(approve(create('Administrative & Payment Request', 'PEW', 'Replace PEW workshop air conditioner'), manager));
  requests.push(create('IT Request', 'PEW', 'Laptop and Microsoft 365 access for a new employee'));
  requests.push(approve(create('Cash Voucher', 'PEW', 'SAR 450 for urgent workshop consumables'), final));
  requests.push(checked(returnRequestForCorrection({ request: create('Expense Claim', 'PEW', 'Dammam site visit: mileage, parking and meals'), actingUser: manager, reason: 'Please clarify the purpose of the sample journey before resubmitting.' })));
  requests.push(create('R&D Initiative', 'PEW', 'Reduce gasket waste with better cutting layouts'));
  const completed = approve(approve(create('Administrative & Payment Request', 'ICCL', 'Replace worn workshop shelving'), manager), final);
  requests.push(completed);
  const bypass = create('Expense Claim', 'FSG', 'Time-sensitive sample travel reimbursement');
  requests.push(checked(completePreciRoute({ request: bypass, actingUser: final, signatureDataUrl: final.signatureDataUrl, reason: 'Demo: department reviewer is unavailable; supporting evidence has been reviewed.' })));
  let evaluated = create('R&D Initiative', 'FSG', 'Pilot a shared inspection log');
  evaluated = checked(saveRndEvaluation(evaluated, final, { fields: { inpHEvalBy: final.name, inpHRevBy: final.name, inpHDate: day, inpHComments: 'A practical improvement for a controlled trial.', inpHNextAction: 'Run a small synthetic prototype and review the results.' }, choices: { hVerified: ['Yes'], hRecurring: ['Yes'], hImpact: ['Medium'], hFeas: ['High'], hMkt: ['Further Research'], hApproach: ['Internal Solution'], hPriority: ['Medium'], hDecision: ['Validate'] }, marketRows: [] }));
  requests.push(approve(evaluated, final));
  const evaluationNeeded = create('R&D Initiative', 'ICCL', 'Evaluate gasket cutting layout improvements');
  requests.push(approve(evaluationNeeded, final));
  const replacement = create('IT Request', 'ICCL', 'Approve sample access while the reviewer is away');
  requests.push(checked(proposeSignerReplacement(replacement, requester, backup, replacement.approvalSteps[0].stageId, 'Demo: ask the backup approver to accept this assignment.')));
  const printer = create('IT Request', 'FSG', 'Configure a shared workshop printer');
  printer.formData.itRequest = { requestType: 'Printer and network access', justification: 'Shanid will connect the shared printer and test access for workshop staff.' };
  requests.push(printer);
  const tools = create('Administrative & Payment Request', 'PEW', 'Purchase replacement workshop tools');
  tools.formData.administrativePayment = { documentDescription: 'Quotation for replacement hand tools.', payment: { amount: '1200', transferMode: 'Bank', purpose: 'Other', otherPurpose: 'Workshop tools' } };
  requests.push(approve(tools, manager));
  const pettyCash = create('Cash Voucher', 'ICCL', 'Petty cash for safety supplies');
  pettyCash.formData.cashVoucher = { payee: requester.name, recipientUserId: requester.id, amount: '300', amountInWords: 'Three hundred Saudi Riyals only', source: 'Accounts cash' };
  requests.push(pettyCash);
  const training = create('Expense Claim', 'FSG', 'Training visit: transport and parking');
  training.formData.expenseClaim = { designation: 'Operations coordinator', project: 'Training visit', lines: [{ date: day, particulars: 'Transport', amount: '120', receiptIndex: 0 }, { date: day, particulars: 'Parking', amount: '25', receiptIndex: 0 }] };
  requests.push(approve(approve(training, manager), final));
  const labels = create('R&D Initiative', 'PEW', 'Improve gasket batch identification');
  if (labels.formData.rnd) labels.formData.rnd.fields = { ...labels.formData.rnd.fields, inpProbTitle: 'Improve gasket batch identification', inpQ1: 'Handwritten batch labels can be difficult to read.', inpQ2: 'A sample batch required a second check to confirm its identification.', inpQ11Desc: 'Explore durable printed labels with a simple scanning process.' };
  requests.push(labels);
  // Keep ordering stable while showing realistic recent dates. Only synthetic fixture timestamps change.
  const stamped = requests.map((request, i) => {
    const at = new Date(now.getTime() - i * 3_600_000).toISOString();
    return { ...request, createdAt: at, revision: 1 };
  });
  return { namespace: 'precisign_showcase_v1', companies: structuredClone(INITIAL_COMPANIES), users, workflows, requests: stamped, session: { companyId: 'PEG', userId: final.id } };
}
