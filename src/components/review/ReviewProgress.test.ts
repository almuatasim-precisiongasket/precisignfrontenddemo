import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createShowcaseDataset } from '../../data/showcaseData';
import { DocuSignProgressBanner } from './DocuSignProgressBanner';
import { ApprovalJourneyPanel } from '../journey/ApprovalJourneyPanel';
const sample = () => structuredClone(createShowcaseDataset().requests.find(r => r.formType === 'Administrative & Payment Request' && r.status === 'Pending Approval')!);
const render = (request: ReturnType<typeof sample>) => renderToStaticMarkup(React.createElement(DocuSignProgressBanner, { request, currentUserId: request.approvalSteps.at(-1)!.assignedUserId! }));
test('early final signer is ready while an intermediate signer remains upcoming/current', () => {
 const request = sample(); request.approvalSteps[0].status = 'Pending'; request.approvalSteps[0].signatureDataUrl = undefined; request.currentStageIndex = 0;
 const html = render(request); assert.match(html, /Ready to sign/); assert.match(html, /Awaiting signature/); assert.match(html, /Final approver/);
});
test('missing signature images are disclosed rather than fabricated from profiles', () => {
 const request = sample(); request.approvalSteps[0].signatureDataUrl = undefined;
 assert.match(render(request), /Approval recorded/); assert.match(render(request), /Signature image unavailable/);
});
test('bypassed, returned and completed routes have distinct visible states', () => {
 const request = sample(); request.status = 'Approved'; request.approvalSteps[0].status = 'Bypassed';
 assert.match(render(request), /Bypassed/); assert.match(render(request), /Signing complete/); assert.doesNotMatch(render(request), /Ready to sign/);
 request.status = 'Returned for Correction'; assert.doesNotMatch(render(request), /Ready to sign/);
});
test('review history exposes versioned comments without a duplicate signer tab', () => {
 const request = sample(); request.approvalHistory[0].comments = 'Synthetic remark <safe>';
 const html = renderToStaticMarkup(React.createElement(ApprovalJourneyPanel, { request, historyOnly: true }));
 assert.match(html, /Version 1/); assert.match(html, /Synthetic remark &lt;safe&gt;/); assert.doesNotMatch(html, /<details/); assert.doesNotMatch(html, /Signing steps \(/);
});

test('review history shows recent activity first without mutating persisted order', () => {
 const request = sample(); const ids = request.approvalHistory.map(event => event.id);
 request.approvalHistory[0].comments = 'First submission note';
 request.approvalHistory.at(-1)!.comments = 'Latest approval remark';
 const html = renderToStaticMarkup(React.createElement(ApprovalJourneyPanel, { request, historyOnly: true }));
 assert.match(html, /Latest first/);
 assert.ok(html.indexOf('Latest approval remark') < html.indexOf('First submission note'));
 assert.match(html, /Submission note/); assert.match(html, /Signing remark/);
 assert.deepEqual(request.approvalHistory.map(event => event.id), ids);
});
test('reasons are visible without disclosure and long multiline text stays intact', () => {
 const request = sample(); const event = request.approvalHistory[0];
 event.action = 'Returned for Correction'; event.comments = 'Please correct the amount.\n' + 'Long-reference'.repeat(100);
 const html = renderToStaticMarkup(React.createElement(ApprovalJourneyPanel, { request, historyOnly: true }));
 assert.match(html, /Correction reason/); assert.ok(html.includes(event.comments));
 assert.doesNotMatch(html, /<summary|<details|line-clamp/);
});
