import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/components/review/ReviewSignView.tsx', 'utf8');
// Execute the actual dispatcher before and after its local naming/extraction.
const body = source.match(/const handleSignatureConfirmation = \(signature: string, note\?: string\) => \{([\s\S]*?)\n  }/)?.[1]
  ?? source.match(/onConfirm=\{\(signature, note\) => \{(.*?)\}\}/)?.[1];
assert.ok(body, 'Locate signature confirmation dispatcher');
function setup(action: string, stale = false, result: unknown = Promise.resolve({ success: true })) {
  const calls: unknown[][] = [];
  const handlers = ['resubmit', 'complete', 'approve'].map(name => (...args: unknown[]) => { calls.push([name, ...args]); return result; });
  const confirm = new Function('signingRecordTime', 'request', 'signatureAction', 'handleResubmitSubmit', 'handleFinalRouteCompletionSubmit', 'handleConfirmedApproval', `return (signature, note) => {${body}}`)({ current: stale ? 'old' : 'current' }, { updatedAt: 'current' }, action, ...handlers);
  return { confirm, calls };
}
for (const [action, expected] of [['approve', 'approve'], ['override', 'complete'], ['resubmit', 'resubmit']]) {
  test(`${action}: dispatches signature and only approval receives the note`, async () => {
    const result = Promise.resolve({ success: false, error: 'synthetic rejection' });
    const s = setup(action, false, result);
    assert.equal(s.confirm('signature-bytes', 'remark'), result);
    assert.deepEqual(s.calls, [action === 'approve' ? [expected, 'signature-bytes', 'remark'] : [expected, 'signature-bytes']]);
    assert.equal((await result).success, false);
  });
  test(`${action}: stale confirmation never calls an action`, async () => {
    const s = setup(action, true);
    assert.deepEqual(await s.confirm('signature', 'note'), { success: false, error: 'The route changed. Close this dialog and review the current document before signing again.' });
    assert.deepEqual(s.calls, []);
  });
}
test('signature validation remains delegated, including empty signatures and absent notes', () => {
  const s = setup('approve'); s.confirm(''); assert.deepEqual(s.calls, [['approve', '', undefined]]);
});
test('pending work and rejected promises are forwarded without dispatcher cleanup or retries', async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise((_, fail) => { reject = fail; });
  const s = setup('override', false, pending);
  const returned = s.confirm('signature'); assert.equal(returned, pending); assert.equal(s.calls.length, 1);
  reject(new Error('synthetic failure')); await assert.rejects(returned, /synthetic failure/); assert.equal(s.calls.length, 1);
});
test('cancel remains a close-only callback without action invocation', () => {
  assert.ok(source.includes('onClose={() => setSignatureModalOpen(false)}'));
});
