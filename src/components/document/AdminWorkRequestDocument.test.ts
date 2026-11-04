import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AdminWorkRequestDocument} from './AdminWorkRequestDocument';
import {INITIAL_REQUESTS} from '../../data/seedData';

test('protected Admin renderer preserves original bytes, signature slots and continuation text',()=>{
 const source=readFileSync(new URL('./AdminWorkRequestDocument.tsx',import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex').toUpperCase(),'B2C2F09983EA66B0354E03AF51CED451D6EB213F1DBF0449829EB9C161601C51');
 const data={...INITIAL_REQUESTS[0].formData,requesterSignatureDataUrl:'data:image/png;base64,REQUESTER',approvalAuthoritySignatureDataUrl:'data:image/png;base64,FINAL'};
 const html=renderToStaticMarkup(React.createElement(AdminWorkRequestDocument,{data}));
 assert.match(html,/alt="Requester Signature"/);assert.match(html,/alt="Approval Authority Signature"/);
 assert.match(html,/data:image\/png;base64,REQUESTER/);assert.match(html,/data:image\/png;base64,FINAL/);
 const longText='UNIQUE_LONG_DESCRIPTION_'.repeat(40);
 const longHtml=renderToStaticMarkup(React.createElement(AdminWorkRequestDocument,{data:{...data,workDescription:longText},isPrintMode:true}));
 assert.match(longHtml,/Continuation Sheet/);assert.ok(longHtml.includes(longText.slice(420)));
 const css=readFileSync(new URL('../../index.css',import.meta.url),'utf8');
 assert.match(css,/@media print/);assert.match(css,/transform:\s*none !important/);
});
