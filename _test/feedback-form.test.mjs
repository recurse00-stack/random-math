import assert from 'node:assert/strict';
import {RandomMath as E} from '../dist/index.js';
let passed=0,failed=0;const originalRandom=Math.random,originalWarn=console.warn;
const outputFields=['reportVar','statusVar','successVar','errorVar'];
const fields={reportVar:'report',statusVar:'status',successVar:'ok',errorVar:'error'};
function host(kind='without') {
 const values=new Map(Object.entries({report:'old',status:'old',ok:false,error:'old',value:'old',gate:false}));
 const saved=new Map(Object.entries({fixedResults:[],drawDecks:[],poolStateV3:''}));
 const cfg={pools:[{id:'p',name:'Pool',kind,valueType:'text',probability:'weight',quantityWeight:'candidate',random:'fixed'}],candidates:[{poolId:'p',id:'a',label:'A',value:'A',rate:'1',quantity:3}],adjustments:[]};
 const owner={save:{get:k=>saved.get(k),set:(k,v)=>saved.set(k,structuredClone(v))}};
 const ctx={variables:{get:k=>values.get(k),set:(k,v)=>values.set(k,v)},settings:{get:k=>cfg[k]},flow:{signal:new AbortController().signal},dialogue:{setSkipMode(){},setAutoMode(){}},system:{invoke:async(slot,payload)=>{assert.equal(slot,'internal.system.choice');await payload.onSelect(0)},close:async()=>{}}};
 return {values,saved,owner,ctx};
}
async function test(name,run){try{Math.random=()=>.25;console.warn=()=>{};await run();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name,e.stack);}finally{console.warn=originalWarn;Math.random=originalRandom;}}
await test('new cards hide only four optional feedback fields until expanded',()=>{
 for(const m of [E.drawReplace,E.drawWithout,E.poolUpdate,E.playerChoice]){
  const schema=m.schema;assert.equal(schema.showAdvancedFeedback.default,false);
  const visible=params=>Object.entries(schema).filter(([,f])=>!f.visibleWhen||(params[f.visibleWhen.field]??schema[f.visibleWhen.field].default)===f.visibleWhen.equals).map(([k])=>k);
  const collapsed=visible({}),expanded=visible({showAdvancedFeedback:true});
  for(const key of outputFields){assert.ok(!collapsed.includes(key));assert.ok(expanded.includes(key));assert.equal(schema[key].type,'variable');assert.notEqual(schema[key].required,true);}
  assert.deepEqual(expanded.filter(k=>!collapsed.includes(k)),outputFields);
  assert.ok(collapsed.includes('poolId')||collapsed.includes('draw__poolId'));
 }
});
for(const scenario of [
 {name:'replacement',method:'drawReplace',kind:'with',params:{poolId:'p',count:1,outVar:'value'},status:'ok'},
 {name:'without replacement',method:'drawWithout',params:{action:'draw','draw__poolId':'p','draw__count':1,'draw__outVar':'value'},status:'ok'},
 {name:'initialization',method:'poolUpdate',params:{action:'initialize',poolId:'p'},status:'ok'},
 {name:'skipped adjustment',method:'poolUpdate',params:{action:'initialize',poolId:'p',when:'gate'},status:'skipped'},
 {name:'failure diagnostics',method:'drawReplace',kind:'with',params:{poolId:'missing'},status:'error'},
 {name:'player selection',method:'playerChoice',params:{poolId:'p',requestKey:'choice',outVar:'value'},status:'ok'},
]){
 await test(scenario.name+' preserves outputs and state for old, collapsed and expanded calls',async()=>{
  const snapshots=[];
  for(const flag of [undefined,false,true]){
   const h=host(scenario.kind);Math.random=()=>.25;
   const p={...scenario.params,...fields,...(flag===undefined?{}:{showAdvancedFeedback:flag})};
   const original=structuredClone(p);
   await E[scenario.method].run.call(h.owner,h.ctx,p);
   assert.deepEqual(p,original,'presentation must not erase parameters');
   assert.equal(h.values.get('status'),scenario.status);
   assert.equal(JSON.parse(h.values.get('report')).status,scenario.status);
   snapshots.push({variables:Object.fromEntries(h.values),save:Object.fromEntries(h.saved)});
  }
  assert.deepEqual(snapshots[1],snapshots[0]);assert.deepEqual(snapshots[2],snapshots[0]);
 });
}
console.log(JSON.stringify({passed,failed,scope:'SDK shim; actual Studio expansion and saving must be checked separately'}));
if(failed)process.exitCode=1;

