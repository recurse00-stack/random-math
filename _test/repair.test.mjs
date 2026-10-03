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
await test('stable schema / creator settings build',()=>{const field=Object.fromEntries(['default','multiline','describe','range','enabledWhen','maxItems','addLabel','table','labels'].map(k=>[k,function(){return this}]));const builder={string:()=>field,boolean:()=>field,number:()=>field,enum:()=>field,array(_label,fn){fn(this);return field;}};assert.ok(M.settings.build(builder).dslCheat);for(const def of [M.rand,M.randPick,M.calc,M.previewPool,M.resetFixed]){for(const field of Object.values(def.schema)){if(field.visibleWhen)assert.ok(def.schema[field.visibleWhen.field])}assert.ok(def.schema.successVar);assert.ok(def.schema.errorVar)}});
await test('blank weights are uniformly unweighted',async()=>{const h=host({},[{id:'a',label:'A',weight:'   '},{id:'b',label:'B',weight:null}]);const r=JSON.parse(await h.run('previewPool',{}));assert.equal(r.unweighted,true);assert.deepEqual(r.candidates.map(c=>c.probability),[.5,.5])});
await test('invalid weight tokenizer reports candidate',async()=>{const h=host({ok:true,error:''},[{id:'bad-row',label:'A',weight:'@'}]);assert.equal(await h.run('randPick',{successVar:'ok',errorVar:'error'}),'');assert.match(h.values.get('error'),/bad-row/)});
await test('blank fixed key falls back to output identity',async()=>{random(.5);const h=host({r:0});const p={...base,mode:'sticky',fixedKey:'  ',outVar:'r'};assert.equal(await h.run('rand',p),4);assert.equal(JSON.parse(h.save.get('fixedResults')[0]).key,'value:r');random(0);assert.equal(await h.run('rand',p),4)});
await test('slot write failure preserves output',async()=>{const h=host({r:9});h.owner.save.set=()=>{throw Error('disk write failed')};assert.equal(await h.run('rand',{...base,mode:'sticky',outVar:'r'}),-1);assert.equal(h.values.get('r'),9)});
await test('batch setter failure restores outputs and fixed state',async()=>{const h=host({q_1:9,q_2:9});const set=h.ctx.variables.set;h.ctx.variables.set=(k,v)=>{if(k==='q_2')throw Error('setter failure');set(k,v)};assert.equal(await h.run('rand',{...base,mode:'sticky',count:2,prefix:'q'}),-1);assert.equal(h.values.get('q_1'),9);assert.deepEqual(h.save.get('fixedResults'),[])});


const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const mixed = () => [{id:'a',label:'A',weight:'10%'},{id:'b',label:'B',weight:'var("b")'},{id:'c',label:'C',weight:'var("c")'}];
const preview = async (h,p={}) => JSON.parse(await h.run('previewPool',p));
await test('fixed 10 percent plus dynamic weights reads current values', async () => {
  Math.random=()=>{throw Error('Preview must not draw')};
  const h=host({b:20,c:30},mixed());
  const first=await preview(h);
  assert.deepEqual(first.candidates.map(c=>c.kind),['fixed','relative','relative']);
  assert.equal(first.fixedProbability,.1); assert.equal(first.remainingProbability,.9);
  first.candidates.forEach((c,i)=>close(c.probability,[.1,.36,.54][i]));
  h.values.set('b',80);
  const next=await preview(h);
  next.candidates.forEach((c,i)=>close(c.probability,[.1,.9*80/110,.9*30/110][i]));
  h.values.set('b',0);
  assert.deepEqual((await preview(h)).candidates.map(c=>c.probability),[.1,0,.9]);
});
await test('player draws keep fixed share when dynamic weights change', async () => {
  const h=host({b:20,c:30},mixed());
  for (const [b,c,expected] of [[20,30,{A:100,B:360,C:540}],[80,10,{A:100,B:800,C:100}],[0,30,{A:100,B:0,C:900}]]) {
    h.values.set('b',b); h.values.set('c',c); const count={A:0,B:0,C:0};
    for(let i=0;i<1000;i++){random((i+.5)/1000);count[await h.run('randPick',{})]++}
    assert.deepEqual(count,expected);
  }
});
await test('draw boundaries preserve zero exclusions and output ID', async () => {
  const h=host({b:0,c:30,picked:'old',id:'old'},mixed());
  for(const [r,label,id] of [[0,'A','a'],[.1-Number.EPSILON,'A','a'],[.1,'C','c'],[1-Number.EPSILON,'C','c']]) {
    random(r);assert.equal(await h.run('randPick',{outVar:'picked',outIdVar:'id'}),label);
    assert.equal(h.values.get('id'),id);
  }
});
await test('fixed percentage does not depend on row order', async () => {
  const data=mixed();
  for(const picks of [data,[data[1],data[0],data[2]],[data[1],data[2],data[0]]]){
    const r=await preview(host({b:20,c:30},picks));
    const byId=Object.fromEntries(r.candidates.map(c=>[c.id,c.probability]));
    close(byId.a,.1);close(byId.b,.36);close(byId.c,.54);
  }
});
await test('multiple fixed percentages reserve their sum', async () => {
  const r=await preview(host({},[{label:'A',weight:'10%'},{label:'D',weight:'15%'},{label:'B',weight:2},{label:'C',weight:3}]));
  r.candidates.forEach((c,i)=>close(c.probability,[.1,.15,.3,.45][i]));
  assert.equal(r.fixedProbability,.25);
});
await test('fixed-only complete pool needs no relative candidates', async () => {
  const h=host({},[{label:'A',weight:'10%'},{label:'B',weight:'90%'}]);
  const r=await preview(h);assert.equal(r.remainingProbability,0);assert.equal(r.fallback,false);
  assert.deepEqual(r.candidates.map(c=>c.probability),[.1,.9]);random(.8);assert.equal(await h.run('randPick',{}),'B');
});
await test('100 percent fixed excludes even huge positive relative weights', async () => {
  const h=host({},[{label:'A',weight:'100%'},{label:'B',weight:1e308},{label:'C',weight:0}]);
  const r=await preview(h,{emptyPolicy:'uniform'});assert.equal(r.fallback,false);
  assert.deepEqual(r.candidates.map(c=>c.probability),[1,0,0]);random(1-Number.EPSILON);assert.equal(await h.run('randPick',{}),'A');
});
await test('uniform fallback distributes only the unreserved share', async () => {
  const h=host({},[{label:'A',weight:'10%'},{label:'off',weight:'0%'},{label:'B',weight:0},{label:'C'}]);
  const r=await preview(h,{emptyPolicy:'uniform'});assert.equal(r.fallback,true);
  assert.deepEqual(r.candidates.map(c=>c.probability),[.1,0,.45,.45]);
  assert.deepEqual(r.candidates.map(c=>c.weight),[10,0,1,1]);
  random(0);assert.equal(await h.run('randPick',{emptyPolicy:'uniform'}),'A');
  random(.1);assert.equal(await h.run('randPick',{emptyPolicy:'uniform'}),'B');
});
await test('large finite relative weights split the remaining probability', async () => {
  const r=await preview(host({},[{label:'A',weight:'10%'},{label:'B',weight:1e308},{label:'C',weight:1e308}]));
  assert.deepEqual(r.candidates.map(c=>c.probability),[.1,.45,.45]);
});
await test('fixed percentages work with nested table functions', async () => {
  const h=host({score:2},[{label:'A',weight:'10%'},{label:'B',weight:'nested(var("score"))'},{label:'C',weight:2}],[{name:'nested',expr:'double(x)'},{name:'double',expr:'x*2'}]);
  close((await preview(h)).candidates[1].probability,.6);h.values.set('score',4);
  close((await preview(h)).candidates[1].probability,.72);
});
await test('fixed-only pool never queries an unneeded function library', async () => {
  const h=host({},[{label:'A',weight:'100%'}]);const collection=h.ctx.database.collection;
  h.ctx.database.collection=name=>{assert.equal(name,'pickTable');return collection(name)};
  assert.equal((await preview(h)).candidates[0].probability,1);
});
await test('fixed totals are computed within the selected pool', async () => {
  const h=host({},[{label:'A',pool:'one',weight:'100%'},{label:'B',pool:'two',weight:'100%'}]);
  assert.equal((await preview(h,{pool:'one'})).candidates[0].probability,1);
  assert.equal(await h.run('previewPool',{poolScope:'all'}),'');
});
await test('many fractional reservations reach 100 without false errors', async () => {
  const r=await preview(host({},Array.from({length:10000},(_,i)=>({label:String(i),weight:'0.01%'}))));
  assert.equal(r.fixedProbability,1);assert.equal(r.remainingProbability,0);
  assert.ok(r.candidates.every(c=>c.probability===.0001));
});
await test('decimal percentage notation and whitespace', async () => {
  const r=await preview(host({},[{label:'A',weight:'  12.5%  '},{label:'B',weight:1}]));
  assert.deepEqual(r.candidates.map(c=>c.probability),[.125,.875]);
});
await test('existing numeric weight ten remains a relative weight', async () => {
  const r=await preview(host({},[{label:'A',weight:'10'},{label:'B',weight:20},{label:'C',weight:30}]));
  close(r.candidates[0].probability,1/6);assert.equal(r.fixedProbability,0);
});
const badPools = [
  ['over 100 percent',[{label:'A',weight:'60%'},{label:'B',weight:'41%'},{label:'C',weight:1}]],
  ['tiny real excess',[{label:'A',weight:'50.000000001%'},{label:'B',weight:'50%'}]],
  ['unassigned probability',[{label:'A',weight:'10%'}]],
  ['all fixed zero',[{label:'A',weight:'0%'}]],
  ['no positive remaining weights',[{label:'A',weight:'10%'},{label:'B',weight:0}]],
  ['negative percent',[{id:'bad-row',label:'A',weight:'-1%'},{label:'B',weight:1}]],
  ['percent above 100',[{id:'bad-row',label:'A',weight:'101%'}]],
  ['nonfinite percent',[{id:'bad-row',label:'A',weight:'1e309%'},{label:'B',weight:1}]],
  ['expression percent rejected',[{id:'bad-row',label:'A',weight:'var("b")%'},{label:'B',weight:1}]],
  ['double percent rejected',[{id:'bad-row',label:'A',weight:'10%%'},{label:'B',weight:1}]],
  ['invalid relative still checked at full reservation',[{label:'A',weight:'100%'},{id:'bad-row',label:'B',weight:'var("missing")'}]],
];
for(const [name,picks] of badPools)await test(`${name} fails before drawing and preserves all results`,async()=>{
  Math.random=()=>{throw Error('Invalid config must not draw')};
  for(const method of ['randPick','previewPool']){
    const h=host({picked:'old',id:'oldid',ok:true,error:''},picks);
    assert.equal(await h.run(method,{outVar:'picked',outIdVar:'id',successVar:'ok',errorVar:'error'}),'');
    assert.equal(h.values.get('picked'),'old');assert.equal(h.values.get('id'),'oldid');
    assert.equal(h.values.get('ok'),false);assert.ok(h.values.get('error'));
    assert.doesNotMatch(h.values.get('error'),/must not draw/);
    if(picks.some(c=>c.id==='bad-row'))assert.match(h.values.get('error'),/bad-row/);
  }
});
await test('uniform policy cannot normalize invalid or incomplete fixed totals',async()=>{
  for(const picks of [[{label:'A',weight:'10%'}],[{label:'A',weight:'0%'}],[{label:'A',weight:'101%'}],[{label:'A',weight:'60%'},{label:'B',weight:'60%'},{label:'C',weight:0}]]){
    assert.equal(await host({},picks).run('previewPool',{emptyPolicy:'uniform'}),'');
  }
});
await test('save reload re-evaluates dynamic weights with unchanged reservation',async()=>{
  const h=host({b:20,c:30},mixed());const saved=h.snapshot();h.values.set('b',80);
  close((await preview(h)).candidates[1].probability,.9*80/110);
  const loaded=host(saved.values,mixed(),[],saved.saved);
  const r=await preview(loaded);close(r.candidates[0].probability,.1);close(r.candidates[1].probability,.36);
});


await test('text batch with replacement returns JSON and per-item variables',async()=>{
 const h=host({b:20,c:30,items:'old',ids:'old',pick_1:'',pick_2:'',pick_3:'',ok:false,error:'old'},mixed());
 const rolls=[0,0,.8];Math.random=()=>rolls.shift();
 assert.equal(await h.run('randPick',{count:3,replacement:'with',outVar:'items',outIdVar:'ids',prefix:'pick',successVar:'ok',errorVar:'error'}),'["A","A","C"]');
 assert.equal(h.values.get('items'),'["A","A","C"]');assert.equal(h.values.get('ids'),'["a","a","c"]');
 assert.deepEqual([1,2,3].map(i=>h.values.get(`pick_${i}`)),['A','A','C']);assert.equal(h.values.get('ok'),true);assert.equal(h.values.get('error'),'');
});
await test('text batch without replacement excludes selected rows',async()=>{
 const h=host({b:20,c:30,ids:''},mixed());random(0);
 assert.deepEqual(JSON.parse(await h.run('randPick',{count:3,replacement:'without',outIdVar:'ids'})),['A','B','C']);
 assert.equal(h.values.get('ids'),'["a","b","c"]');
 assert.deepEqual(JSON.parse(await h.run('randPick',{count:3,replacement:'without'})),['A','B','C']);
});
await test('without replacement renormalizes initial probabilities after each draw',async()=>{
 const h=host({b:20,c:30},mixed());
 for(const [second,expected] of [[.399,'B'],[.401,'C']]){
  const rolls=[0,second];Math.random=()=>rolls.shift();
  assert.deepEqual(JSON.parse(await h.run('randPick',{count:2,replacement:'without'})),['A',expected]);
 }
 // Remove B first: A becomes 10/(10+54), not 10 percent.
 for(const [second,expected] of [[.15,'A'],[.16,'C']]){
  const rolls=[.2,second];Math.random=()=>rolls.shift();
  assert.deepEqual(JSON.parse(await h.run('randPick',{count:2,replacement:'without'})),['B',expected]);
 }
});
await test('repeated text batch retains fixed share on every draw position',async()=>{
 const h=host({b:20,c:30},mixed()),counts=[{A:0,B:0,C:0},{A:0,B:0,C:0}];
 for(let i=0;i<1000;i++){random((i+.5)/1000);const result=JSON.parse(await h.run('randPick',{count:2,replacement:'with'}));result.forEach((v,j)=>counts[j][v]++)}
 assert.deepEqual(counts,[{A:100,B:360,C:540},{A:100,B:360,C:540}]);
});
await test('without replacement means rows, not distinct display text',async()=>{
 const h=host({ids:''},[{id:'a',label:'same',weight:1},{id:'b',label:'same',weight:1}]);random(0);
 assert.equal(await h.run('randPick',{count:2,replacement:'without',outIdVar:'ids'}),'["same","same"]');assert.equal(h.values.get('ids'),'["a","b"]');
});
await test('zero probability rows never return in a later no-repeat draw',async()=>{
 const h=host({},[{label:'A',weight:'10%'},{label:'B',weight:1},{label:'off',weight:'0%'},{label:'off2',weight:0}]);random(0);
 assert.equal(await h.run('randPick',{count:2,replacement:'without'}),'["A","B"]');
 assert.equal(await h.run('randPick',{count:3,replacement:'without'}),'');
});
await test('no-repeat fallback is established once and fixed zero stays disabled',async()=>{
 const h=host({},[{label:'A',weight:'10%'},{label:'B',weight:0},{label:'C',weight:0},{label:'off',weight:'0%'}]);random(0);
 assert.equal(await h.run('randPick',{count:3,replacement:'without',emptyPolicy:'uniform'}),'["A","B","C"]');
});
await test('batch JSON escapes quotes and newlines losslessly',async()=>{
 const h=host({},[{label:'a"\nb',weight:1}]);random(0);
 assert.deepEqual(JSON.parse(await h.run('randPick',{count:2})),['a"\nb','a"\nb']);
});
await test('batch samples current variables once before writing results',async()=>{
 const h=host({score:'1'},[{label:'A',weight:'var("score")'},{label:'B',weight:1}]);random(0);
 assert.equal(await h.run('randPick',{count:2,outVar:'score'}),'["A","A"]');
 h.values.set('score','0');assert.equal(await h.run('randPick',{count:2,outVar:'score'}),'["B","B"]');
});
await test('batch queries candidate data once',async()=>{
 const h=host({},[{label:'A',weight:1}]);let reads=0;const collection=h.ctx.database.collection;
 h.ctx.database.collection=name=>{reads++;return collection(name)};random(0);
 assert.equal(JSON.parse(await h.run('randPick',{count:100})).length,100);assert.equal(reads,1);
});
await test('no-repeat rescales tiny survivors instead of losing them',async()=>{
 const h=host({},[{label:'A',weight:'100%'},{label:'B',weight:1}]);
 assert.equal(await h.run('randPick',{count:2,replacement:'without'}),'');
 const tiny=host({},[{label:'A',weight:1},{label:'B',weight:1e-300},{label:'C',weight:2e-300}]);random(0);
 assert.equal(await tiny.run('randPick',{count:3,replacement:'without'}),'["A","B","C"]');
});
for(const [label,params] of [
 ['zero count',{count:0}],['fraction count',{count:1.5}],['too many',{count:101}],['nan',{count:NaN}],
 ['unknown repeat mode',{count:2,replacement:'invalid'}],['insufficient eligible rows',{count:4,replacement:'without'}],
 ['missing prefix variable',{count:2,prefix:'item'}],['prefix output alias',{count:2,prefix:'q',outVar:'q_1'}],
 ['prefix status alias',{count:2,prefix:'q',successVar:'q_1'}],['prefix ID alias',{count:2,prefix:'q',outIdVar:'q_1'}]
])await test(`invalid text batch ${label} does not draw or partially write`,async()=>{
 const h=host({b:20,c:30,result:'old',ids:'old',ok:true,error:'',q_1:'first',q_2:'second'},mixed());
 Math.random=()=>{throw Error('must not draw')};
 assert.equal(await h.run('randPick',{outVar:'result',outIdVar:'ids',successVar:'ok',errorVar:'error',...params}),'');
 assert.equal(h.values.get('result'),'old');assert.equal(h.values.get('ids'),'old');assert.equal(h.values.get('q_1'),'first');assert.equal(h.values.get('q_2'),'second');
 assert.ok(h.values.get('error'));assert.doesNotMatch(h.values.get('error'),/must not draw/);
});
await test('text batch wrong prefix type fails before random',async()=>{
 const h=host({q_1:'old',q_2:3},[{label:'A',weight:1}]);Math.random=()=>{throw Error('must not draw')};
 assert.equal(await h.run('randPick',{count:2,prefix:'q'}),'');assert.equal(h.values.get('q_1'),'old');assert.equal(h.values.get('q_2'),3);
});
await test('text batch failed setter restores earlier outputs',async()=>{
 const h=host({q_1:'old1',q_2:'old2',result:'old'},[{label:'A',weight:1}]);const set=h.ctx.variables.set;random(0);
 h.ctx.variables.set=(n,v)=>{if(n==='q_2')throw Error('setter failed');set(n,v)};
 assert.equal(await h.run('randPick',{count:2,prefix:'q',outVar:'result'}),'');assert.equal(h.values.get('q_1'),'old1');assert.equal(h.values.get('result'),'old');
});
await test('single draw preserves plain-text return and ignores batch prefix',async()=>{
 const h=host({},[{label:'A',weight:1}]);random(0);
 assert.equal(await h.run('randPick',{prefix:'not-declared'}),'A');assert.equal(await h.run('randPick',{count:1,replacement:'without'}),'A');
});


await test('numeric weighted single returns and writes a real number',async()=>{
 const h=host({n:0,report:'',id:''},[{id:'a',label:'-2.5',weight:'100%'}]);random(0);
 assert.equal(await h.run('randPickNumber',{outVar:'n',reportVar:'report',outIdVar:'id'}),-2.5);assert.equal(h.values.get('n'),-2.5);assert.equal(h.values.get('report'),'[-2.5]');assert.equal(h.values.get('id'),'a');
 assert.equal(M.randPickNumber.returns.type,'number');assert.equal(M.randPickNumber.id,'rand-pick-number');
});
await test('numeric batch supports replacement and downstream arithmetic',async()=>{
 const h=host({n_1:0,n_2:0,sum:0,report:''},[{label:'2.5',weight:1}]);random(0);
 assert.equal(await h.run('randPickNumber',{count:2,prefix:'n',reportVar:'report'}),2);
 assert.equal(h.values.get('n_1'),2.5);assert.equal(h.values.get('n_2'),2.5);assert.equal(h.values.get('report'),'[2.5,2.5]');
 assert.equal(await h.run('calc',{op:'add',a:h.values.get('n_1'),b:h.values.get('n_2'),outVar:'sum'}),5);
});
await test('numeric formula batch evaluates variables and nested functions',async()=>{
 const h=host({power:4,n_1:0,n_2:0,report:''},[{label:'double(var("power"))+0.5',weight:'10%'},{label:'-2^2',weight:1}],[{name:'double',expr:'x*2'}]);random(0);
 assert.equal(await h.run('randPickNumber',{count:2,replacement:'without',prefix:'n',reportVar:'report'}),2);
 assert.deepEqual([h.values.get('n_1'),h.values.get('n_2')],[8.5,-4]);assert.equal(h.values.get('report'),'[8.5,-4]');
 h.values.set('power',5);assert.equal(await h.run('randPickNumber',{outVar:'n_1'}),10.5);
});
await test('numeric output field can differ from text label',async()=>{
 const h=host({n:0},[{label:'奖励',amount:12.25,weight:1}]);random(0);
 assert.equal(await h.run('randPickNumber',{field:'amount',outVar:'n'}),12.25);
 assert.equal(await h.run('randPick',{}),'奖励');
});
await test('equal numeric results are distinct candidate rows',async()=>{
 const h=host({n_1:0,n_2:0,ids:''},[{id:'a',label:'2+2',weight:1},{id:'b',label:'4',weight:1}]);random(0);
 assert.equal(await h.run('randPickNumber',{count:2,replacement:'without',prefix:'n',outIdVar:'ids'}),2);
 assert.deepEqual([h.values.get('n_1'),h.values.get('n_2')],[4,4]);assert.equal(h.values.get('ids'),'["a","b"]');
});
await test('numeric formula values are snapshotted before writing to an input',async()=>{
 const h=host({n_1:3,n_2:0},[{label:'var("n_1")*2',weight:1}]);random(0);
 assert.equal(await h.run('randPickNumber',{count:2,prefix:'n'}),2);
 assert.deepEqual([h.values.get('n_1'),h.values.get('n_2')],[6,6]);
});
for(const bad of ['文字','1/0','var("missing")','sqrt(-1)','10^400','missing(1)',''])await test(`invalid numeric candidate ${bad} fails before draw`,async()=>{
 const h=host({n:9,report:'old',ok:true,error:''},[{id:'bad',label:bad,weight:1}]);Math.random=()=>{throw Error('must not draw')};
 assert.equal(await h.run('randPickNumber',{outVar:'n',reportVar:'report',successVar:'ok',errorVar:'error'}),-1);assert.equal(h.values.get('n'),9);assert.equal(h.values.get('report'),'old');assert.equal(h.values.get('ok'),false);assert.match(h.values.get('error'),/bad/);assert.doesNotMatch(h.values.get('error'),/must not draw/);
});
for(const params of [{count:0},{count:2},{count:2,prefix:'missing'},{count:2,prefix:'n',replacement:'without'},{count:2,prefix:'n',reportVar:'n_1'},{count:2,prefix:'n',successVar:'n_1'},{replacement:'bad'}])await test(`invalid numeric batch ${JSON.stringify(params)}`,async()=>{
 const h=host({n_1:7,n_2:8,report:'old',ok:true,error:''},[{label:'1',weight:1}]);Math.random=()=>{throw Error('must not draw')};
 assert.equal(await h.run('randPickNumber',{reportVar:'report',successVar:'ok',errorVar:'error',...params}),-1);
 assert.equal(h.values.get('n_1'),7);assert.equal(h.values.get('n_2'),8);assert.equal(h.values.get('report'),'old');assert.doesNotMatch(h.values.get('error'),/must not draw/);
});
await test('numeric batch rejects text output variables',async()=>{
 const h=host({n_1:'old',n_2:8},[{label:'1',weight:1}]);Math.random=()=>{throw Error('must not draw')};
 assert.equal(await h.run('randPickNumber',{count:2,prefix:'n'}),-1);assert.equal(h.values.get('n_1'),'old');
});
await test('numeric batch rolls back outputs on setter failure',async()=>{
 const h=host({n_1:7,n_2:8,report:'old'},[{label:'1',weight:1}]);random(0);const set=h.ctx.variables.set;
 h.ctx.variables.set=(n,v)=>{if(n==='n_2')throw Error('setter failed');set(n,v)};
 assert.equal(await h.run('randPickNumber',{count:2,prefix:'n',reportVar:'report'}),-1);assert.equal(h.values.get('n_1'),7);assert.equal(h.values.get('report'),'old');
});

Math.random=originalRandom;console.warn=warn;
console.log(JSON.stringify({passed,failed,scope:'built runtime with SDK/context simulation; native host checked separately'}));
if(failed)process.exitCode=1;
