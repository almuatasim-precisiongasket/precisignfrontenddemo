import test from 'node:test';
import assert from 'node:assert/strict';
import { currentCompanyDisplay, ICCL_DISPLAY_NAME } from './companyDisplay';
import { LocalStoragePreciSignRepository } from '../services/repository';
test('current ICCL display corrects cached company metadata without rewriting history', async () => {
 const values=new Map<string,string>();
 const storage:Storage={get length(){return values.size;},getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);},clear:()=>values.clear(),key:i=>[...values.keys()][i]??null};
 const old={id:'ICCL' as const,code:'ICCL',name:'Old name',fullName:'ICCL - Old name',groupName:'Group'};
 values.set('precisign_repo_companies_v2',JSON.stringify([old]));
 values.set('precisign_repo_requests_v2',JSON.stringify([{id:'historical',companyId:'ICCL',formData:{companyName:'Signed old name'}}]));
 const repo=new LocalStoragePreciSignRepository(storage);
 assert.equal((await repo.getCompanyById('ICCL'))?.name,ICCL_DISPLAY_NAME);
 assert.equal((await repo.getRequestById('historical'))?.formData.companyName,'Signed old name');
 assert.equal(old.name,'Old name');assert.equal(currentCompanyDisplay(old).id,'ICCL');
});
