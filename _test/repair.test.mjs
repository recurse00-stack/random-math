import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RandomMath as M} from '../dist/index.js';
import {validateExtensionManifest} from './validate.mjs';
let passed=0, failed=0, warnings=[];
const warn=console.warn, originalRandom=Math.random;
console.warn=(...args)=>warnings.push(String(args[0]));
function host(initial={},picks=[],funcs=[],saved=[]) {
  const values=new Map(Object.entries(initial)), save=new Map([['fixedResults',structuredClone(saved)]]);
  const ctx={variables:{get:n=>values.get(n),set:(n,v)=>{
    assert.ok(n,'No empty output variable'); assert.ok(!(typeof v==='number'&&!Number.isFinite(v)),'No nonfinite writes');
    const old=values.get(n); if(old!=null)assert.equal(typeof v,typeof old,`Variable type ${n}`); values.set(n,v);
  }},database:{collection:name=>({find:async(filter,options)=>{
    assert.ok(['pickTable','funcLib'].includes(name));
    return (name==='pickTable'?picks:funcs).filter(row=>Object.entries(filter||{}).every(([k,v])=>row[k]===v)).slice(0,options?.limit);
  }})}};
  const owner={save:{get:k=>save.get(k),set:(k,v)=>save.set(k,structuredClone(v))}};
  return {ctx,values,save,owner,run:(method,p)=>M[method].run.call(owner,ctx,p),snapshot:()=>({values:Object.fromEntries(values),saved:structuredClone(save.get('fixedResults'))})};
}
async function test(name,fn){try{warnings=[];await fn();passed++;console.log(`PASS ${name}`)}catch(e){failed++;console.error(`FAIL ${name}: ${e.stack}`)}}
const base={mode:'fresh',min:1,max:6,digits:0,includeMin:true,includeMax:true,count:1};
const random=n=>{Math.random=()=>n};
const outcome={outVar:'result',successVar:'ok',errorVar:'error'};
const standard=()=>host({result:88,ok:true,error:''});
const formula=async(expr,vars={},funcs=[])=>host(vars,[],[{name:'test',expr},...funcs]).run('calc',{op:'func',funcName:'test',x:3,y:2});
await test('manifest validates / IDs stable',()=>{const m=validateExtensionManifest(JSON.parse(readFileSync('extension.json','utf8')));assert.equal(m.id,'mixing-entropy.random-math');assert.deepEqual([M.rand.id,M.randPick.id,M.calc.id],['rand','rand-pick','calc']);assert.equal(M.saveSchema.fixedResults.persistence,'slot')});
for(const [title,p,r,expect] of [
 ['integer minimum',{},0,1],['integer maximum',{},.999999,6],['open minimum',{includeMin:false},0,2],['open maximum',{includeMax:false},.999999,5],
 ['fractional bounds lower',{min:1.2,max:4.8,includeMin:false,includeMax:false},0,2],['fractional bounds upper',{min:1.2,max:4.8,includeMin:false,includeMax:false},.99999,4],
 ['negative integers',{min:-5,max:-1},0,-5],['one tick',{min:3,max:3},.7,3],
 ['decimal lower tick',{min:.004,max:.026,digits:2},0,.01],['decimal upper tick',{min:.004,max:.026,digits:2},.9999,.02],
 ['decimal open max',{min:0,max:1,digits:2,includeMax:false},.99999,.99],['decimal open min',{min:0,max:1,digits:2,includeMin:false},0,.01],
 ['decimal rounding noise',{min:.29,max:.29,digits:2},.5,.29],
])await test(title,async()=>{random(r);assert.equal(await host().run('rand',{...base,...p}),expect)});
for(const [name,p] of Object.entries({reversed:{min:5,max:3},empty:{min:1,max:1,includeMax:false},precisionEmpty:{min:.004,max:.006,digits:2},nan:{min:NaN},infinite:{max:Infinity},unsafe:{max:1e18},fractionalDigits:{digits:1.5},tooManyDigits:{digits:7},badCount:{count:101},nanCount:{count:NaN}}))
 await test(`invalid ${name} preserves output`,async()=>{const h=standard();assert.equal(await h.run('rand',{...base,...p,...outcome}),-1);assert.equal(h.values.get('result'),88);assert.equal(h.values.get('ok'),false);assert.ok(h.values.get('error'))});
await test('uniform decimal grid (10000 stratified draws)',async()=>{const h=host(),counts=Array(11).fill(0);for(let i=0;i<11000;i++){random((i+.5)/11000);const n=await h.run('rand',{...base,min:0,max:1,digits:1});counts[Math.round(n*10)]++}assert.deepEqual(counts,Array(11).fill(1000))});
await test('batch uses same sampler / endpoints',async()=>{random(0);const h=host({q_1:0,q_2:0});assert.equal(await h.run('rand',{...base,count:2,prefix:'q',includeMin:false}),2);assert.equal(h.values.get('q_1'),2);assert.equal(h.values.get('q_2'),2)});
await test('batch invalid range no writes',async()=>{const h=host({q_1:9,q_2:9,ok:true,error:''});assert.equal(await h.run('rand',{...base,min:5,max:3,count:2,prefix:'q',successVar:'ok',errorVar:'error'}),-1);assert.equal(h.values.get('q_1'),9);assert.equal(h.values.get('ok'),false)});
await test('batch missing variable no partial writes',async()=>{const h=host({q_1:9});assert.equal(await h.run('rand',{...base,count:2,prefix:'q'}),-1);assert.equal(h.values.get('q_1'),9);assert.equal(h.values.has('q_2'),false)});
await test('sticky ignores default zero',async()=>{random(.5);const h=host({r:0});assert.equal(await h.run('rand',{...base,mode:'sticky',outVar:'r'}),4);random(0);assert.equal(await h.run('rand',{...base,mode:'sticky',outVar:'r'}),4)});
await test('sticky new save / reload / earlier save / reset',async()=>{random(.5);const h=host({r:0}),before=h.snapshot();assert.equal(await h.run('rand',{...base,mode:'sticky',outVar:'r'}),4);const after=h.snapshot();
 random(0);const loaded=host(after.values,[],[],after.saved);assert.equal(await loaded.run('rand',{...base,mode:'sticky',outVar:'r'}),4);
 const earlier=host(before.values,[],[],before.saved);assert.equal(await earlier.run('rand',{...base,mode:'sticky',outVar:'r'}),1);
 assert.equal(await loaded.run('resetFixed',{key:'value:r'}),true);assert.equal(await loaded.run('rand',{...base,mode:'sticky',outVar:'r'}),1);
});
await test('sticky slot isolation',async()=>{random(.5);const a=host(),b=host();const p={...base,mode:'sticky',fixedKey:'event'};assert.equal(await a.run('rand',p),4);random(0);assert.equal(await b.run('rand',p),1);assert.equal(await a.run('rand',p),4)});
await test('sticky changed config requires reset',async()=>{const h=host({r:0,ok:true,error:''});const p={...base,mode:'sticky',outVar:'r',successVar:'ok',errorVar:'error'};await h.run('rand',p);const old=h.values.get('r');assert.equal(await h.run('rand',{...p,max:9}),-1);assert.equal(h.values.get('r'),old);assert.equal(h.values.get('ok'),false)});
await test('adopt existing valid old save explicitly',async()=>{const h=host({r:5});assert.equal(await h.run('rand',{...base,mode:'sticky',outVar:'r',fixedPolicy:'adopt'}),5);assert.equal(h.save.get('fixedResults').length,1)});
await test('adopt invalid old save rejected',async()=>{const h=host({r:0});assert.equal(await h.run('rand',{...base,mode:'sticky',outVar:'r',fixedPolicy:'adopt'}),-1);assert.equal(h.save.get('fixedResults').length,0)});
await test('batch sticky defaults do not imply completion',async()=>{random(.5);const h=host({q_1:0,q_2:0});assert.equal(await h.run('rand',{...base,mode:'sticky',count:2,prefix:'q'}),2);assert.equal(h.values.get('q_1'),4);assert.equal(h.values.get('q_2'),4)});
await test('failed generation never locks sticky',async()=>{const h=host({r:0});assert.equal(await h.run('rand',{...base,mode:'sticky',outVar:'r',min:9}),-1);assert.deepEqual(h.save.get('fixedResults'),[])});
for(const [expr,expected] of [['2*3^2',18],['2^3^2',512],['-2^2',-4],['(-2)^2',4],['2^-2',.25],['-2+3',1],['1e2+0.5',100.5],['x>y?10:20',10],['0?1/0:2',2],['1?2:1/0',2],['var("flag")+1',2],['clamp(round(x*y),0,100)',6],['sqrt(pow(x,2)+pow(y,2))',Math.sqrt(13)]])
 await test(`formula ${expr}`,async()=>assert.equal(await formula(expr,{flag:true}),expected));
for(const expr of ['sqrt(-1)','1/0','10^400','var("missing")','"2"+1','clamp(1,4,2)','pow(1)','1;2','.'.repeat(3),'('.repeat(40)+'1'+')'.repeat(40),'x+'.repeat(2200)+'1'])
 await test(`invalid formula ${expr.slice(0,35)}`,async()=>{const h=host({result:88,ok:true,error:''},[],[{name:'test',expr}]);assert.equal(await h.run('calc',{op:'func',funcName:'test',...outcome}),-1);assert.equal(h.values.get('result'),88);assert.equal(h.values.get('ok'),false)});
await test('nested functions in calc',async()=>assert.equal(await formula('g(x)+1',{},[{name:'g',expr:'x*2'}]),7));
for(const [title,funcs] of [['direct recursion',[{name:'f',expr:'f(x)'}]],['mutual recursion',[{name:'f',expr:'g(x)'},{name:'g',expr:'f(x)'}]],['duplicate name',[{name:'f',expr:'1'},{name:'f',expr:'2'}]],['unknown dependency',[{name:'f',expr:'missing(x)'}]],['reserved name',[{name:'sqrt',expr:'1'}]]])
 await test(title,async()=>{const h=host({},[],funcs);assert.equal(await h.run('calc',{op:'func',funcName:funcs[0].name}),-1);assert.ok(warnings.length)});
await test('exponential call graph has evaluation budget',async()=>{const funcs=Array.from({length:20},(_,i)=>({name:`f${i}`,expr:i===19?'1':`f${i+1}(x)+f${i+1}(x)`}));const h=host({},[],funcs);assert.equal(await h.run('calc',{op:'func',funcName:'f0'}),-1);assert.ok(warnings.some(s=>s.includes('预算')))});
for(const [op,a,b,expected] of [['add',2,3,5],['sub',1,2,-1],['mul',3,4,12],['div',7,2,3.5],['pow',2,10,1024],['root',9,0,3],['floor',2.9,0,2],['round',2.6,0,3]])await test(`calc ${op}`,async()=>{const h=standard();assert.equal(await h.run('calc',{op,a,b,...outcome}),expected);assert.equal(h.values.get('ok'),true);assert.equal(h.values.get('error'),'')});
for(const p of [{op:'div',a:2,b:0},{op:'root',a:-2},{op:'pow',a:10,b:400},{op:'func',funcName:'missing'},{op:'mul',a:NaN,b:2}])await test(`calc failure ${p.op}`,async()=>{const h=standard();assert.equal(await h.run('calc',{...p,...outcome}),-1);assert.equal(h.values.get('result'),88);assert.equal(h.values.get('ok'),false)});
await test('output aliases rejected safely',async()=>{const h=host({r:7});assert.equal(await h.run('rand',{...base,outVar:'r',successVar:'r'}),-1);assert.equal(h.values.get('r'),7)});
await test('wrong variable type rejected',async()=>{const h=host({r:'keep'});assert.equal(await h.run('rand',{...base,outVar:'r'}),-1);assert.equal(h.values.get('r'),'keep')});
const picks=[{id:'a',label:'A',weight:5,pool:'village'},{id:'b',label:'B',weight:2,pool:'village'},{id:'c',label:'C',weight:3,pool:'house'}];
await test('weighted preview 50/20/30 no random consumed',async()=>{Math.random=()=>{throw Error('Preview must not draw')};const report=JSON.parse(await host({},picks).run('previewPool',{}));assert.deepEqual(report.candidates.map(c=>c.probability),[.5,.2,.3])});
await test('weighted draws stratified 50/20/30',async()=>{const h=host({},picks),count={A:0,B:0,C:0};for(let i=0;i<1000;i++){random((i+.5)/1000);count[await h.run('randPick',{})]++}assert.deepEqual(count,{A:500,B:200,C:300})});
await test('pool named/default/all distinct',async()=>{const h=host({},[...picks,{id:'d',label:'D',weight:1}]);random(0);assert.equal(await h.run('randPick',{poolScope:'default'}),'D');assert.equal(await h.run('randPick',{pool:'house'}),'C');assert.equal(JSON.parse(await h.run('previewPool',{poolScope:'all'})).candidates.length,4)});
await test('no weight is uniform',async()=>{const h=host({},[{label:'A'},{label:'B',weight:''}]);const r=JSON.parse(await h.run('previewPool',{}));assert.deepEqual(r.candidates.map(c=>c.probability),[.5,.5])});
await test('zero/invalid weight cannot resurrect disabled events',async()=>{for(const weight of [0,'1+','unknown(2)',-1]){const h=host({picked:'old',ok:true,error:''},[{label:'locked',weight}]);assert.equal(await h.run('randPick',{outVar:'picked',successVar:'ok',errorVar:'error'}),'');assert.equal(h.values.get('picked'),'old');assert.equal(h.values.get('ok'),false)}});
await test('explicit zero-weight uniform policy',async()=>{random(0);assert.equal(await host({},[{label:'A',weight:0}]).run('randPick',{emptyPolicy:'uniform'}),'A')});
await test('large finite weights normalized without overflow',async()=>{const r=JSON.parse(await host({},[{label:'A',weight:1e308},{label:'B',weight:1e308}]).run('previewPool',{}));assert.deepEqual(r.candidates.map(c=>c.probability),[.5,.5])});
await test('mixed missing weight remains excluded',async()=>{const r=JSON.parse(await host({},[{label:'A',weight:2},{label:'B'}]).run('previewPool',{}));assert.deepEqual(r.candidates.map(c=>c.probability),[1,0])});
await test('nested function weights use current variables',async()=>{const h=host({power:2},[{label:'A',weight:'f(var("power"))'},{label:'B',weight:2}],[{name:'f',expr:'g(x)'},{name:'g',expr:'x*2'}]);assert.equal(JSON.parse(await h.run('previewPool',{})).candidates[0].probability,2/3);h.values.set('power',4);assert.equal(JSON.parse(await h.run('previewPool',{})).candidates[0].probability,.8)});
await test('missing output column preserves both result and ID',async()=>{const h=host({picked:'old',id:'oldid'},[{id:'a',label:'A'}]);assert.equal(await h.run('randPick',{field:'missing',outVar:'picked',outIdVar:'id'}),'');assert.equal(h.values.get('picked'),'old');assert.equal(h.values.get('id'),'oldid')});
await test('table limit does not silently truncate',async()=>{const h=host({},Array.from({length:10001},()=>({label:'A'})));assert.equal(await h.run('previewPool',{}),'');assert.ok(warnings[0].includes('10000'))});
await test('stable schema / creator settings build',()=>{const field={default(){return this},multiline(){return this}};assert.ok(M.settings.build({string:()=>field}).dslCheat);for(const def of [M.rand,M.randPick,M.calc,M.previewPool,M.resetFixed]){for(const field of Object.values(def.schema)){if(field.visibleWhen)assert.ok(def.schema[field.visibleWhen.field])}assert.ok(def.schema.successVar);assert.ok(def.schema.errorVar)}});
await test('blank weights are uniformly unweighted',async()=>{const h=host({},[{id:'a',label:'A',weight:'   '},{id:'b',label:'B',weight:null}]);const r=JSON.parse(await h.run('previewPool',{}));assert.equal(r.unweighted,true);assert.deepEqual(r.candidates.map(c=>c.probability),[.5,.5])});
await test('invalid weight tokenizer reports candidate',async()=>{const h=host({ok:true,error:''},[{id:'bad-row',label:'A',weight:'@'}]);assert.equal(await h.run('randPick',{successVar:'ok',errorVar:'error'}),'');assert.match(h.values.get('error'),/bad-row/)});
await test('blank fixed key falls back to output identity',async()=>{random(.5);const h=host({r:0});const p={...base,mode:'sticky',fixedKey:'  ',outVar:'r'};assert.equal(await h.run('rand',p),4);assert.equal(JSON.parse(h.save.get('fixedResults')[0]).key,'value:r');random(0);assert.equal(await h.run('rand',p),4)});
await test('slot write failure preserves output',async()=>{const h=host({r:9});h.owner.save.set=()=>{throw Error('disk write failed')};assert.equal(await h.run('rand',{...base,mode:'sticky',outVar:'r'}),-1);assert.equal(h.values.get('r'),9)});
await test('batch setter failure restores outputs and fixed state',async()=>{const h=host({q_1:9,q_2:9});const set=h.ctx.variables.set;h.ctx.variables.set=(k,v)=>{if(k==='q_2')throw Error('setter failure');set(k,v)};assert.equal(await h.run('rand',{...base,mode:'sticky',count:2,prefix:'q'}),-1);assert.equal(h.values.get('q_1'),9);assert.deepEqual(h.save.get('fixedResults'),[])});

Math.random=originalRandom;console.warn=warn;
console.log(JSON.stringify({passed,failed,scope:'built runtime with SDK/context simulation; native host checked separately'}));
if(failed)process.exitCode=1;
