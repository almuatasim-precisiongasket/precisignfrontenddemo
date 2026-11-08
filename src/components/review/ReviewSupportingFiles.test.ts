import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AttachmentItem } from '../../types';
import { ReviewSupportingFiles } from './ReviewSupportingFiles';

const files: AttachmentItem[] = ['quotation.png', 'receipt.pdf'].map((name, i) => ({
  id: `synthetic-${i}`, name, sizeBytes: 1024, sizeFormatted: '1 KB',
  uploadedAt: '2026-11-08', uploadedBy: 'Synthetic requester', mimeType: i ? 'application/pdf' : 'image/png',
}));
const render = (attachments?: AttachmentItem[]) => renderToStaticMarkup(React.createElement(ReviewSupportingFiles, { attachments, onDownload: () => {} }));

function buttons(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement(node)) return [];
  const props = node.props as { children?: React.ReactNode };
  return [...(node.type === 'button' ? [node] : []), ...React.Children.toArray(props.children).flatMap(buttons)];
}

test('unavailable historical attachments retain the distinct unavailable message', () => {
  const html = render();
  assert.match(html, /Supporting Files \(0\)/);
  assert.match(html, /Attachments for this version are unavailable\./);
  assert.doesNotMatch(html, /No attachments uploaded|<button/);
});
test('empty attachments retain the empty-upload message and no download controls', () => {
  const html = render([]);
  assert.match(html, /No attachments uploaded for this request\./);
  assert.doesNotMatch(html, /version are unavailable|<button/);
});
test('attachments retain count, order, names, sizes and existing CSS', () => {
  const html = render(files);
  assert.match(html, /Supporting Files \(2\)/);
  assert.ok(html.indexOf('quotation.png') < html.indexOf('receipt.pdf'));
  assert.equal((html.match(/title="Download attachment"/g) ?? []).length, 2);
  assert.match(html, /max-h-56 overflow-y-auto/);
  assert.match(html, /\(1 KB\)/);
  assert.doesNotMatch(html, /disabled=/);
});
test('download controls forward the original attachment objects and do not mutate input', () => {
  const input = files.map(file => Object.freeze({ ...file })); Object.freeze(input);
  const calls: AttachmentItem[] = [];
  const controls = buttons(ReviewSupportingFiles({ attachments: input, onDownload: file => calls.push(file) }));
  controls[1].props.onClick(); controls[0].props.onClick();
  assert.equal(calls[0], input[1]); assert.equal(calls[1], input[0]);
  assert.deepEqual(input.map(file => file.id), ['synthetic-0', 'synthetic-1']);
});
test('download errors remain the caller responsibility', () => {
  const controls = buttons(ReviewSupportingFiles({ attachments: files, onDownload: () => { throw new Error('synthetic download failure'); } }));
  assert.throws(() => controls[0].props.onClick(), /synthetic download failure/);
});
test('attachment names remain escaped text', () => {
  const html = render([{ ...files[0], name: '<script>example</script>' }]);
  assert.match(html, /&lt;script&gt;example&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
