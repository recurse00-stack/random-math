import fs from 'node:fs';
import assert from 'node:assert/strict';
import {RandomMath as E} from '../dist/index.js';
import * as P from '../dist/pool-model.js';
import {readInspection} from '../dist/pool-runtime.js';
const original=Math.random;let passed=0,failed=0;const warn=console.warn;console.warn=()=>{};
async function test(name,fn){try{Math.random=()=>.25;await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.stack);}}
const spec={id:'events',name:'事件',kind:'without',valueType:'text',probability:'weight',quantityWeight:'candidate',random:'fixed'};
const rows=[{poolId:'events',id:'a',label:'A',value:'A',rate:'1',quantity:10},{poolId:'events',id:'b',label:'B',value:'B',rate:'1',quantity:1}];
const fields={outVar:'value',idVar:'id',valuesVar:'values',idsVar:'ids',reportVar:'report',receiptVar:'receipt',remainingVar:'remaining',availableVar:'available',successVar:'ok',errorVar:'error',statusVar:'status'};
function host(config={},state,extra={}){
 const values=new Map(Object.entries({value:'old',id:'old',values:'old',ids:'old',report:'',receipt:'',remaining:0,available:0,ok:true,error:'',status:'',gate:true,power:2,n:0,...extra}));
 const saved=new Map(Object.entries(state??{drawDecks:[],fixedResults:[],poolStateV3:''}));const abort=new AbortController();let resolveUI,shown;let onShow;
 const settings={pools:[spec],candidates:rows,adjustments:[],...config};
 const owner={save:{get:k=>saved.get(k),set:(k,v)=>saved.set(k,structuredClone(v))}};
 const ctx={variables:{get:k=>values.get(k),set:(k,v)=>{assert.notEqual(v,undefined);values.set(k,v);}},settings:{get:k=>settings[k]},flow:{signal:abort.signal},database:{collection:()=>({find:async()=>[]})},dialogue:{setSkipMode(v){assert.equal(v,false)},setAutoMode(v){assert.equal(v,false)}},system:{invoke:async(slot,payload,options)=>{assert.equal(slot,'internal.system.choice');assert.equal(options.modal,true);shown=payload;const pending=new Promise(resolve=>{resolveUI=resolve;});if(onShow)queueMicrotask(()=>{Promise.resolve(onShow(payload)).catch(e=>{resolveUI();throw e;});});await pending;},close:async()=>resolveUI?.()}};
 return {ctx,owner,saved,values,settings,abort,get shown(){return shown},onShow(fn){onShow=fn},run:(name,p={})=>E[name].run.call(owner,ctx,p),immediate:(name,p={})=>E[name].runImmediately.call(owner,ctx,p),state:()=>P.decode(saved.get('poolStateV3')),snapshot:()=>Object.fromEntries([...saved].map(([k,v])=>[k,structuredClone(v)]))};
}
const fixture=JSON.parse(fs.readFileSync(new URL('./legacy-slot4-fixture.json',import.meta.url),'utf8'));
const legacyState=()=>({drawDecks:structuredClone(fixture.drawDecks),fixedResults:[],poolStateV3:''});
await test('captured old slot inspection is read-only and preserves unknown history',async()=>{
 const h=host({pools:[],candidates:[]},legacyState()),before=h.snapshot();Math.random=()=>{throw Error('inspection sampled');};
 const r=readInspection(h.owner,h.ctx,'accept-fixed');assert.equal(r.remaining,4);assert.equal(r.details.legacyHistory,'unknown');assert.deepEqual(h.snapshot(),before);
});
await test('captured old slot alternates new and old entry without branching state',async()=>{
 const h=host({pools:[],candidates:[]},legacyState());const untouched=fixture.drawDecks[1];
 await h.run('drawWithout',{poolId:'accept-fixed',...fields});assert.equal(h.values.get('value'),'B');
 assert.deepEqual(JSON.parse(await h.run('deckDraw',{key:'accept-fixed'})),['E']);
 const restored=host({pools:[],candidates:[]},h.snapshot());await restored.run('drawWithout',{poolId:'accept-fixed',...fields});assert.equal(restored.values.get('value'),'D');
 assert.deepEqual(JSON.parse(await restored.run('deckDraw',{key:'accept-fixed'})),['A']);
 const r=JSON.parse(await restored.run('deckPeek',{key:'accept-fixed'}));assert.equal(r.total,5);assert.equal(r.drawn,5);assert.equal(r.remaining,0);
 assert.equal(restored.state().pools[0].legacy.history,'unknown');assert.equal(restored.state().pools[0].items.length,4);
 assert.deepEqual(restored.saved.get('drawDecks'),[untouched]);await restored.run('drawWithout',{poolId:'accept-fixed',...fields});assert.equal(restored.values.get('status'),'empty');
});
await test('migrated and hidden legacy empty draw both retain failure diagnostics and results',async()=>{
 const h=host({pools:[],candidates:[]},legacyState());
 await h.run('drawWithout',{action:'draw',draw__poolId:'accept-fixed',draw__count:4,draw__valuesVar:'values',draw__idsVar:'ids',draw__remainingVar:'remaining',successVar:'ok',errorVar:'error'});
 assert.deepEqual(JSON.parse(h.values.get('values')),['B','E','D','A']);assert.equal(h.values.get('remaining'),0);
 const saved=h.snapshot(),values=h.values.get('values'),ids=h.values.get('ids');
 await h.run('drawWithout',{action:'draw',draw__poolId:'accept-fixed',draw__outVar:'value',draw__valuesVar:'values',successVar:'ok',errorVar:'error'});
 assert.equal(h.values.get('ok'),false);assert.notEqual(h.values.get('error'),'');assert.equal(h.values.get('value'),'old');assert.equal(h.values.get('values'),values);assert.deepEqual(h.snapshot(),saved);
 h.values.set('error','');
 assert.equal(await h.run('deckDraw',{key:'accept-fixed',outVar:'value',reportVar:'values',outIdVar:'ids',remainingVar:'remaining',successVar:'ok',errorVar:'error'}),'');
 assert.equal(h.values.get('ok'),false);assert.notEqual(h.values.get('error'),'');assert.equal(h.values.get('value'),'old');assert.equal(h.values.get('values'),values);assert.equal(h.values.get('ids'),ids);assert.equal(h.values.get('remaining'),0);assert.deepEqual(h.snapshot(),saved);
});
await test('captured old slot reservation survives reload, cancellation restores first item',async()=>{
 const h=host({pools:[],candidates:[]},legacyState());await h.run('drawWithout',{poolId:'accept-fixed',consumption:'deferred',...fields});assert.equal(h.values.get('value'),'B');
 const receiptId=h.values.get('receipt'),restored=host({pools:[],candidates:[]},h.snapshot());
 await restored.run('drawWithout',{action:'cancel',receiptId,...fields});const before=restored.snapshot();
 await restored.run('drawWithout',{action:'cancel',receiptId,...fields});assert.deepEqual(restored.snapshot(),before);
 assert.deepEqual(JSON.parse(await restored.run('deckDraw',{key:'accept-fixed'})),['B']);
 assert.equal(JSON.parse(await restored.run('deckPeek',{key:'accept-fixed'})).drawn,2);
});
await test('old slot adopted via initialize twice does not refill consumed history',async()=>{
 const h=host({pools:[],candidates:[]},legacyState());await h.run('poolUpdate',{action:'initialize',poolId:'accept-fixed',...fields});const before=h.snapshot();
 await h.run('poolUpdate',{action:'initialize',poolId:'accept-fixed',...fields});assert.deepEqual(h.snapshot(),before);assert.equal(h.values.get('remaining'),4);
});
await test('late callback after abort cannot consume in either old or resumed owner',async()=>{
 const h=host();let callback;h.onShow(ui=>{callback=ui.onSelect;h.abort.abort();});await h.run('playerChoice',{poolId:'events',requestKey:'late',...fields});
 const saved=h.snapshot();await callback(0);assert.deepEqual(h.snapshot(),saved);assert.equal(h.values.get('value'),'old');
 const restored=host({},saved);restored.onShow(ui=>ui.onSelect(1));await restored.immediate('playerChoice',{poolId:'events',requestKey:'late',...fields});
 assert.equal(restored.values.get('value'),'B');const after=restored.snapshot();await callback(1);assert.deepEqual(restored.snapshot(),after);assert.equal(restored.state().pendingChoices.length,0);
});
await test('navigation does not select or reopen pending choice; ordinary restore resumes',async()=>{
 const h=host();h.onShow(()=>h.abort.abort());await h.run('playerChoice',{poolId:'events',...fields});const saved=h.snapshot(),restored=host({},saved);let shows=0;
 restored.ctx.getHost=()=>({application:{scriptingSystem:{getActiveSeekPurpose:()=> 'navigation'}}});restored.onShow(ui=>{shows++;return ui.onSelect(0);});
 await restored.immediate('playerChoice',{poolId:'events',...fields});assert.equal(shows,0);assert.deepEqual(restored.snapshot(),saved);
 delete restored.ctx.getHost;await restored.immediate('playerChoice',{poolId:'events',...fields});assert.equal(shows,1);assert.equal(restored.values.get('value'),'A');
});
await test('skip invokes choice UI and waits without selecting automatically',async()=>{
 const h=host();let resolveShown;const shown=new Promise(r=>resolveShown=r);h.onShow(()=>resolveShown());
 const work=E.playerChoice.skip.call(h.owner,h.ctx,{poolId:'events',...fields});await shown;assert.equal(h.values.get('value'),'old');assert.equal(h.state().pools[0].items[0].remaining,10);
 await h.shown.onSelect(1);await work;assert.equal(h.values.get('value'),'B');assert.equal(h.state().pools[0].items[1].remaining,0);
});
await test('removed pool invalidates outstanding selection and never recreates it',async()=>{
 const h=host();h.onShow(async ui=>{await h.run('poolUpdate',{poolId:'events',action:'delete'});await ui.onSelect(0);});
 await h.run('playerChoice',{poolId:'events',...fields});assert.equal(h.values.get('status'),'error');assert.equal(h.values.get('value'),'old');assert.equal(h.state().pools.length,0);assert.equal(h.state().pendingChoices.length,0);
});
await test('invalid UI index is reported then a valid callback consumes exactly once',async()=>{
 const h=host();h.onShow(async ui=>{await ui.onSelect(99);assert.equal(h.values.get('status'),'error');assert.equal(h.state().pools[0].items[0].remaining,10);await ui.onSelect(0);await ui.onSelect(1);});
 await h.run('playerChoice',{poolId:'events',...fields});assert.equal(h.values.get('status'),'ok');assert.deepEqual(h.state().pools[0].items.map(x=>x.remaining),[9,1]);
});
Math.random=original;console.warn=warn;
console.log(JSON.stringify({passed,failed,scope:'captured synthetic legacy slot data and SDK-shim lifecycle; not real host integration'}));if(failed)process.exitCode=1;
