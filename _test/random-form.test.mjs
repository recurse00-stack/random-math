import assert from 'node:assert/strict';
import {RandomMath as E} from '../dist/index.js';
import {LegacyMath as L} from '../dist/legacy.js';
let passed=0, failed=0;
const original=Math.random;
const fixture=()=>{
    const values=new Map(Object.entries({out:0,json:'',ok:false,error:'',n_1:0,n_2:0}));
    const saved=new Map([['fixedResults',[]],['drawDecks',[]],['poolStateV3','']]);
    return {values,saved,owner:{save:{get:k=>saved.get(k),set:(k,v)=>saved.set(k,structuredClone(v))}},
        ctx:{variables:{get:k=>values.get(k),set:(k,v)=>values.set(k,v)},flow:{signal:new AbortController().signal}}};
};
async function test(name,fn){try{Math.random=()=>.25;await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name,e.stack);}}
const run=(h,p)=>E.rand.run.call(h.owner,h.ctx,{successVar:'ok',errorVar:'error',...p});
await test('legacy absent/generate action preserve number, outputs and save state',async()=>{
    for(const action of [undefined,'generate'])for(const mode of ['fresh','sticky']){
        const h=fixture(),old=fixture();const p={mode,min:1,max:100,count:2,prefix:'n',reportVar:'json',fixedKey:'old-key',successVar:'ok',errorVar:'error'};
        const expected=await L.rand.run.call(old.owner,old.ctx,p);
        assert.equal(await run(h,{...p,...(action?{action}:{})}),expected);
        assert.deepEqual([...h.values],[...old.values]);assert.deepEqual([...h.saved],[...old.saved]);
    }
});
await test('single fresh preset ignores stale batch/fixed fields and returns a number',async()=>{
    const h=fixture();const p={action:'single-fresh','single-fresh__min':7,'single-fresh__max':7,'single-fresh__outVar':'out',mode:'sticky',count:99,prefix:'missing',fixedKey:'stale','batch-fixed__count':88};
    assert.equal(await run(h,p),7);assert.equal(h.values.get('out'),7);assert.deepEqual(h.saved.get('fixedResults'),[]);assert.equal(h.values.get('ok'),true);
});
await test('batch fresh preset needs only JSON output and preserves single output',async()=>{
    const h=fixture();assert.equal(await run(h,{action:'batch-fresh','batch-fresh__min':3,'batch-fresh__max':3,'batch-fresh__count':4,'batch-fresh__reportVar':'json',outVar:'missing'}),4);
    assert.equal(h.values.get('json'),'[3,3,3,3]');assert.equal(h.values.get('out'),0);assert.equal(h.values.get('ok'),true);
});
await test('fixed single repeats and reset uses the same record namespace',async()=>{
    const h=fixture();const p={action:'single-fixed','single-fixed__min':1,'single-fixed__max':100,'single-fixed__outVar':'out','single-fixed__fixedKey':'new-key'};
    const first=await run(h,p);Math.random=()=>.8;assert.equal(await run(h,p),first);
    assert.equal(await run(h,{action:'reset',resetKey:'new-key'}),1);assert.notEqual(await run(h,p),first);
});
await test('fixed batch adopts existing output without drawing and resumes in another owner',async()=>{
    const h=fixture();h.values.set('n_1',7);h.values.set('n_2',8);
    const p={action:'batch-fixed','batch-fixed__min':1,'batch-fixed__max':100,'batch-fixed__prefix':'n','batch-fixed__fixedKey':'adopt','batch-fixed__fixedPolicy':'adopt'};
    Math.random=()=>{throw Error('adopt sampled')};assert.equal(await run(h,p),2);
    const loaded=fixture();for(const [k,v]of h.saved)loaded.saved.set(k,structuredClone(v));assert.equal(await run(loaded,p),2);assert.equal(loaded.values.get('n_1'),7);assert.equal(loaded.values.get('n_2'),8);
});
await test('invalid preset output is rejected before changing results or fixed records',async()=>{
    const h=fixture();h.values.set('out',42);assert.equal(await run(h,{action:'single-fixed','single-fixed__outVar':'json','single-fixed__fixedKey':'bad'}),-1);
    assert.equal(h.values.get('out'),42);assert.equal(h.values.get('json'),'');assert.deepEqual(h.saved.get('fixedResults'),[]);assert.equal(h.values.get('ok'),false);
});
await test('native equality rules expose only relevant fields for each preset and reset',()=>{
    const schema=E.rand.schema;assert.equal(schema.action.default,'generate');
    const visible=action=>Object.entries(schema).filter(([,f])=>!f.visibleWhen||f.visibleWhen.equals===action).map(([k])=>k);
    for(const action of ['single-fresh','batch-fresh','single-fixed','batch-fixed']){
        const keys=visible(action);assert.ok(keys.includes(action+'__min'));assert.ok(keys.includes(action+'__max'));
        assert.equal(keys.includes(action+'__fixedKey'),action.endsWith('fixed'));
        assert.equal(keys.includes(action+'__outVar'),action.startsWith('single'));
        assert.equal(keys.includes(action+'__prefix'),action.startsWith('batch'));
        assert.ok(!keys.includes('mode'));assert.ok(!keys.includes('resetKey'));
    }
    assert.deepEqual(visible('reset').sort(),['action','successVar','errorVar','resetKey'].sort());
});
Math.random=original;console.log(JSON.stringify({passed,failed,scope:'SDK shim; UI acceptance is separate'}));if(failed)process.exitCode=1;
