import assert from 'node:assert/strict';
import {RandomMath as E} from '../dist/index.js';
import {LegacyMath as L} from '../dist/legacy.js';
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name,e.stack);}}
const fixture=()=>{
 const values=new Map(Object.entries({out:88,ok:false,error:'old',attack:20,cap:100,precision:2,text:'4',flag:true}));
 const save=new Map([['fixedResults',[]],['drawDecks',[]],['poolStateV3','']]);
 return {values,save,owner:{save:{get:k=>save.get(k),set:(k,v)=>save.set(k,v)}},ctx:{variables:{get:k=>values.get(k),set:(k,v)=>values.set(k,v)},flow:{signal:new AbortController().signal},database:{collection(){throw Error('direct formula must not need a table');}}}};
};
const params=(op,fields={})=>({op,...Object.fromEntries(Object.entries(fields).map(([k,v])=>[`${op}__${k}`,v])),outVar:'out',successVar:'ok',errorVar:'error'});
const run=(h,p)=>E.calc.run.call(h.owner,h.ctx,p);
for(const [op,fields,result] of [
 ['ceil',{value:'1.2'},2],['ceil',{value:'-1.2'},-1],['trunc',{value:'-1.9'},-1],['abs',{value:'-8'},8],
 ['round-digits',{value:'1.005',digits:'2'},1.01],['round-digits',{value:'-1.005',digits:'2'},-1.01],['round-digits',{value:'2.675',digits:'2'},2.68],
 ['round-digits',{value:'1.2345678',digits:'6'},1.234568],['round-digits',{value:'1e-20',digits:'6'},0],
 ['remainder',{a:'-7',b:'4'},-3],['remainder',{a:'7',b:'-4'},3],['mod',{a:'-7',b:'4'},1],['mod',{a:'0.1',b:'1e16'},.1],
 ['min',{a:'3',b:'-2'},-2],['max',{a:'3',b:'-2'},3],['clamp',{value:'150',min:'0',max:'100'},100],
 ['clamp',{value:'-20',min:'0',max:'100'},0],['clamp',{value:'50',min:'0',max:'100'},50],
 ['expr',{expression:'abs(-4)+ceil(1.2)+trunc(-1.8)+mod(-7,4)+roundDigits(1.005,2)'},7.01],
])await test(op+' '+JSON.stringify(fields),async()=>{const h=fixture();assert.equal(await run(h,params(op,fields)),result);assert.equal(h.values.get('out'),result);assert.equal(h.values.get('ok'),true);assert.equal(h.values.get('error'),'');});
await test('formula rereads finite numeric variables without table or random/save effects',async()=>{const h=fixture();const before=[...h.save];const p=params('expr',{expression:'var("attack") * 0.8 + 10'});assert.equal(await run(h,p),26);h.values.set('attack',30);assert.equal(await run(h,p),34);assert.deepEqual([...h.save],before);});
await test('new inputs support variables, formulas and resolved numeric bindings',async()=>{const h=fixture();assert.equal(await run(h,params('clamp',{value:'var("attack") * 8',min:0,max:'var("cap")'})),100);assert.equal(await run(h,params('round-digits',{value:1.005,digits:'var("precision")'})),1.01);});
for(const [op,fields] of [
 ['expr',{expression:'1/0'}],['expr',{expression:'var("missing")'}],['expr',{expression:'var("text")'}],['expr',{expression:'var("flag")'}],
 ['expr',{expression:'x+1'}],['expr',{expression:'process(1)'}],['expr',{expression:'1;2'}],['expr',{expression:'abs(1,2)'}],
 ['expr',{expression:'2^1024'}],['round-digits',{value:'1',digits:'7'}],['round-digits',{value:'1',digits:'-1'}],['round-digits',{value:'1',digits:'1.5'}],
 ['round-digits',{value:'1e20',digits:'2'}],['remainder',{a:'1',b:'0'}],['mod',{a:'1',b:'-4'}],['clamp',{value:'1',min:'2',max:'0'}],['ceil',{value:''}],
])await test('failure retains output '+op+' '+JSON.stringify(fields),async()=>{const h=fixture();assert.equal(await run(h,params(op,fields)),-1);assert.equal(h.values.get('out'),88);assert.equal(h.values.get('ok'),false);assert.ok(h.values.get('error'));});
await test('output alias and wrong output type fail without damaging previous results',async()=>{for(const outVar of ['ok','text']){const h=fixture();const old=h.values.get(outVar);assert.equal(await run(h,{...params('abs',{value:'-4'}),outVar}),-1);assert.equal(h.values.get(outVar),old);}});
await test('new fields ignore stale inputs for other operations',async()=>{const h=fixture();assert.equal(await run(h,{...params('abs',{value:'-9'}),'expr__expression':'1/0','clamp__max':'bad',a:999}),9);});
await test('old math operations preserve results, errors and round tie behavior',async()=>{for(const [op,a,b]of [['add',2,3],['sub',2,3],['mul',2,3],['div',2,3],['div',2,0],['pow',2,3],['root',9,0],['floor',-1.2,0],['round',-1.5,0]]){const h=fixture(),old=fixture(),p={op,a,b,outVar:'out',successVar:'ok',errorVar:'error'};assert.equal(await run(h,p),await L.calc.run.call(old.owner,old.ctx,p));assert.deepEqual([...h.values],[...old.values]);}});
await test('old function named abs remains a user function',async()=>{const h=fixture();h.ctx.database.collection=()=>({find:async()=>[{name:'abs',expr:'x+100'}]});assert.equal(await run(h,{op:'func',funcName:'abs',x:2,y:0,z:0,w:0,outVar:'out'}),102);});
await test('immediate restore preserves saved result; skip and navigation calculate',async()=>{const h=fixture(),p=params('expr',{expression:'var("attack")+1'});h.values.set('out',12);assert.equal(await E.calc.runImmediately.call(h.owner,h.ctx,p),12);assert.equal(h.values.get('out'),12);assert.equal(await E.calc.skip.call(h.owner,h.ctx,p),21);h.ctx.getHost=()=>({application:{scriptingSystem:{getActiveSeekPurpose:()=> 'navigation'}}});h.values.set('attack',50);assert.equal(await E.calc.runImmediately.call(h.owner,h.ctx,p),51);});
await test('native forms show only the selected enhanced inputs and preserve stable defaults',()=>{const schema=E.calc.schema;assert.equal(E.calc.id,'calc');assert.equal(schema.op.default,'add');assert.equal(E.calc.returns.type,'number');const ops=schema.op.options.map(x=>x.value);assert.equal(new Set(ops).size,ops.length);for(const op of ['expr','ceil','trunc','round-digits','abs','remainder','mod','min','max','clamp']){assert.ok(ops.includes(op));const visible=Object.entries(schema).filter(([,f])=>!f.visibleWhen||f.visibleWhen.equals===op).map(([k])=>k);assert.ok(visible.some(k=>k.startsWith(op+'__')));assert.ok(!visible.includes('a')&&!visible.includes('b')&&!visible.includes('funcName'));assert.ok(visible.filter(k=>k.includes('__')).every(k=>k.startsWith(op+'__')));}});
console.log(JSON.stringify({passed,failed}));if(failed)process.exitCode=1;
