import assert from 'node:assert/strict';
import { RandomMath as M } from '../dist/index.js';
import { parseDecks, encodeDecks, weightedIndex, shuffle, take } from '../dist/deck.js';
let passed=0,failed=0;
const originalRandom=Math.random, originalWarn=console.warn;
console.warn=()=>{};
function host(initial={},picks=[],funcs=[],snapshot){
 const values=new Map(Object.entries(snapshot?.values??initial));
 const saved=new Map(Object.entries(structuredClone(snapshot?.saved??{fixedResults:[],drawDecks:[]})));
 const controller=new AbortController();
 const ctx={flow:{signal:controller.signal},variables:{get:n=>values.get(n),set:(n,v)=>{
  const old=values.get(n);if(old!=null)assert.equal(typeof v,typeof old,`type: ${n}`);values.set(n,v);
 }},database:{collection:n=>({find:async(f,o)=>(n==='pickTable'?picks:funcs).filter(r=>Object.entries(f).every(([k,v])=>r[k]===v)).slice(0,o.limit)})}};
 const owner={save:{get:k=>saved.get(k),set:(k,v)=>saved.set(k,structuredClone(v))}};
 return {values,saved,ctx,owner,controller,run:(name,p)=>M[name].run.call(owner,ctx,p),snapshot:()=>({values:Object.fromEntries(values),saved:Object.fromEntries(saved)})};
}
const base={key:'events',source:'array',arrayJson:'["A","B","C"]',valueType:'text',mode:'fixed'};
const outcome={outVar:'result',successVar:'ok',errorVar:'error'};
const make=()=>host({result:'old',ok:true,error:'',report:'',ids:'',remaining:99,x_1:'old1',x_2:'old2',x_3:'old3'});
const seq=(...values)=>{let i=0;Math.random=()=>values[(i++)%values.length];};
function seed(n){Math.random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/2**32;};}
async function test(name,fn){try{seq(.25,.75);await fn();passed++;console.log(`PASS ${name}`);}catch(e){failed++;console.error(`FAIL ${name}: ${e.stack}`);}}
await test('new method IDs and slot fields stay separate',()=>{
 assert.deepEqual([M.deckCreate.id,M.deckDraw.id,M.deckPeek.id,M.deckReset.id],['deck-create','deck-draw','deck-peek','deck-reset']);
 assert.equal(M.saveSchema.drawDecks.persistence,'slot');assert.equal(M.saveSchema.fixedResults.persistence,'slot');
 for(const def of [M.deckCreate,M.deckDraw,M.deckPeek,M.deckReset])for(const field of Object.values(def.schema))if(field.visibleWhen)assert.ok(def.schema[field.visibleWhen.field]);
});
await test('fixed pool draws one at a time without repetition and preserves initial order',async()=>{
 const h=make();assert.equal(await h.run('deckCreate',{...base,...outcome}),3);
 const order=JSON.parse(h.values.get('result')).values;
 Math.random=()=>{throw Error('Fixed draw/peek must not sample');};
 const got=[];for(let i=0;i<3;i++)got.push(JSON.parse(await h.run('deckDraw',{key:'events',...outcome,remainingVar:'remaining'}))[0]);
 assert.deepEqual(got,order);assert.equal(new Set(got).size,3);assert.equal(h.values.get('remaining'),0);
 const before=h.snapshot();assert.equal(await h.run('deckDraw',{key:'events',...outcome}), '');
 assert.deepEqual(h.snapshot().saved,before.saved);assert.equal(h.values.get('result'),before.values.result);assert.equal(h.values.get('ok'),false);
});
await test('same fixed slot snapshot resumes the same next item across a new host instance',async()=>{
 const h=make();await h.run('deckCreate',base);await h.run('deckDraw',{key:'events'});const saved=h.snapshot();
 seq(0);const a=await h.run('deckDraw',{key:'events'});seq(.9999);const b=await host({},[],[],saved).run('deckDraw',{key:'events'});assert.equal(a,b);
});
await test('remaining mode consumes no random at creation and can change after loading same save',async()=>{
 const h=make();Math.random=()=>{throw Error('Creation must not draw');};assert.equal(await h.run('deckCreate',{...base,mode:'remaining'}),3);
 const saved=h.snapshot();seq(0);const a=await h.run('deckDraw',{key:'events'});seq(.9999);const b=await host({},[],[],saved).run('deckDraw',{key:'events'});assert.notEqual(a,b);
});
await test('remaining draws exclude previous picks across calls and batch boundaries',async()=>{
 const h=make();await h.run('deckCreate',{...base,mode:'remaining'});seq(0);const one=JSON.parse(await h.run('deckDraw',{key:'events'}));
 const two=JSON.parse(await h.run('deckDraw',{key:'events',count:2,reportVar:'report',prefix:'x',outIdVar:'ids',remainingVar:'remaining'}));
 assert.equal(new Set([...one,...two]).size,3);assert.deepEqual(JSON.parse(h.values.get('report')),two);assert.equal(h.values.get('x_1'),two[0]);assert.equal(h.values.get('x_2'),two[1]);assert.equal(h.values.get('x_3'),'old3');assert.equal(h.values.get('remaining'),0);assert.equal(JSON.parse(h.values.get('ids')).length,2);
});
await test('partial overdraw fails before consuming random or writing outputs',async()=>{
 const h=make();await h.run('deckCreate',base);const before=h.snapshot();Math.random=()=>{throw Error('Do not draw');};
 assert.equal(await h.run('deckDraw',{key:'events',count:4,...outcome,reportVar:'report'}),'');assert.deepEqual(h.snapshot().saved,before.saved);assert.equal(h.values.get('report'),'');
});
await test('duplicate creation cannot silently refill a depleted bag',async()=>{
 const h=make();await h.run('deckCreate',base);await h.run('deckDraw',{key:'events',count:3});const before=h.snapshot();assert.equal(await h.run('deckCreate',base),-1);assert.deepEqual(h.snapshot(),before);
});
await test('reset only removes the named bag; output and fixed-random state survive',async()=>{
 const h=make();await h.run('deckCreate',base);await h.run('deckCreate',{...base,key:'other'});h.saved.set('fixedResults',['preserved']);
 assert.equal(await h.run('deckReset',{key:'events'}),true);assert.equal(h.values.get('result'),'old');assert.deepEqual(h.saved.get('fixedResults'),['preserved']);assert.equal(parseDecks(h.saved.get('drawDecks'))[0].key,'other');assert.equal(await h.run('deckCreate',base),3);
});
await test('peek returns remaining arrays and never samples or mutates slot state',async()=>{
 const h=make();await h.run('deckCreate',base);await h.run('deckDraw',{key:'events'});const before=h.snapshot().saved;Math.random=()=>{throw Error('peek sampled');};
 const report=JSON.parse(await h.run('deckPeek',{key:'events',outVar:'report',arrayVar:'ids',remainingVar:'remaining'}));assert.equal(report.drawn,1);assert.equal(report.remaining,2);assert.deepEqual(JSON.parse(h.values.get('ids')),report.values);assert.deepEqual(h.snapshot().saved,before);
});
await test('default value deduplication prevents equal options from returning twice',async()=>{
 const h=make();assert.equal(await h.run('deckCreate',{...base,arrayJson:'["A","A","B"]'}),2);assert.deepEqual(new Set(JSON.parse(await h.run('deckDraw',{key:'events',count:2}))),new Set(['A','B']));
});
await test('row identity explicitly preserves repeated values and distinct array IDs',async()=>{
 const h=make();assert.equal(await h.run('deckCreate',{...base,arrayJson:'["A","A","B"]',uniqueBy:'row'}),3);assert.deepEqual(JSON.parse(await h.run('deckDraw',{key:'events',count:3})).sort(),['A','A','B']);
});
await test('numeric arrays preserve negatives decimals zero and batch numeric variables',async()=>{
 const h=host({n_1:99,n_2:99,n_3:99,json:'',ids:'',count:99});assert.equal(await h.run('deckCreate',{...base,arrayJson:'[-1,0,2.5]',valueType:'number'}),3);
 const result=JSON.parse(await h.run('deckDraw',{key:'events',count:3,prefix:'n',reportVar:'json',outIdVar:'ids',remainingVar:'count'}));assert.deepEqual(result.slice().sort((a,b)=>a-b),[-1,0,2.5]);assert.equal(h.values.get('n_1'),result[0]);assert.equal(h.values.get('count'),0);
});
await test('numeric single result including -1 is successful via status variable',async()=>{
 const h=host({n:0,ok:false,error:''});await h.run('deckCreate',{...base,valueType:'number',arrayJson:'[-1]'});assert.equal(await h.run('deckDraw',{key:'events',outVar:'n',successVar:'ok',errorVar:'error'}),'[-1]');assert.equal(h.values.get('n'),-1);assert.equal(h.values.get('ok'),true);
});
await test('range batch JSON can become a numeric persistent bag',async()=>{
 const h=host({n_1:0,n_2:0,n_3:0,json:'',ok:false,error:''});seq(0,.4,.99);
 assert.equal(await h.run('rand',{min:1,max:3,count:3,prefix:'n',reportVar:'json'}),3);assert.deepEqual(JSON.parse(h.values.get('json')),[1,2,3]);
 assert.equal(await h.run('deckCreate',{...base,source:'array',arrayVar:'json',valueType:'number'}),3);
});
await test('range JSON-only batches support fixed results and explicit old-array adoption',async()=>{
 const h=host({json:''});seq(0,.5);assert.equal(await h.run('rand',{min:1,max:6,count:2,reportVar:'json',mode:'sticky'}),2);assert.deepEqual(JSON.parse(h.values.get('json')),[1,4]);
 Math.random=()=>{throw Error('fixed result resampled');};assert.equal(await h.run('rand',{min:1,max:6,count:2,reportVar:'json',mode:'sticky'}),2);assert.equal(JSON.parse(h.saved.get('fixedResults')[0]).key,'array:json');
 const older=host({json:'[2,5]'});assert.equal(await older.run('rand',{min:1,max:6,count:2,reportVar:'json',mode:'sticky',fixedPolicy:'adopt'}),2);assert.deepEqual(JSON.parse(older.values.get('json')),[2,5]);
});
await test('range report rejects collisions and wrong types before random sampling',async()=>{
 const h=host({n:7,report:1});Math.random=()=>{throw Error('must not sample');};assert.equal(await h.run('rand',{min:1,max:6,outVar:'n',reportVar:'n'}),-1);assert.equal(h.values.get('n'),7);assert.equal(await h.run('rand',{min:1,max:6,reportVar:'report'}),-1);
});
await test('array input variable takes precedence and is snapshotted',async()=>{
 const h=host({input:'["X","Y"]'});assert.equal(await h.run('deckCreate',{...base,arrayVar:'input',arrayJson:'broken'}),2);h.values.set('input','["Z"]');assert.deepEqual(new Set(JSON.parse(await h.run('deckDraw',{key:'events',count:2}))),new Set(['X','Y']));
});
const mixed=()=>[{id:'a',pool:'p',label:'A',weight:'10%'},{id:'b',pool:'p',label:'B',weight:2},{id:'c',pool:'p',label:'C',weight:3},{id:'z',pool:'p',label:'Disabled',weight:0}];
await test('table fixed percentages and zero-weight exclusions snapshot correctly',async()=>{
 const h=host({},mixed());assert.equal(await h.run('deckCreate',{key:'table',source:'table',pool:'p',mode:'remaining'}),3);parseDecks(h.saved.get('drawDecks'))[0].items.forEach((item,i)=>assert.ok(Math.abs(item.weight-[.1,.36,.54][i])<1e-12));
 seq(0);assert.equal(await h.run('deckDraw',{key:'table'}),'["A"]');seq(.3999);assert.equal(await h.run('deckDraw',{key:'table'}),'["B"]');assert.equal(await h.run('deckDraw',{key:'table'}),'["C"]');
});
await test('value merging combines initial weights and retains first ID',async()=>{
 const h=host({},[{id:'a',label:'X',weight:1},{id:'b',label:'X',weight:2},{id:'c',label:'Y',weight:3}]);await h.run('deckCreate',{key:'t',mode:'remaining'});const items=parseDecks(h.saved.get('drawDecks'))[0].items;assert.equal(items.length,2);assert.equal(items[0].id,'a');assert.equal(items[0].weight,.5);assert.equal(items[1].weight,.5);
});
await test('numeric formulas and dynamic weights are evaluated once at creation',async()=>{
 const picks=[{id:'a',label:'twice(var("power"))',weight:'var("w")'},{id:'b',label:'2.5',weight:1}];
 const h=host({power:4,w:1},picks,[{name:'twice',expr:'x*2'}]);assert.equal(await h.run('deckCreate',{key:'n',valueType:'number',mode:'remaining'}),2);h.values.set('power',100);h.values.set('w',0);picks.splice(0);assert.deepEqual(JSON.parse(await h.run('deckDraw',{key:'n',count:2})).sort((a,b)=>a-b),[2.5,8]);
});
for(const [label,params] of Object.entries({badJSON:{arrayJson:'['},object:{arrayJson:'{}'},empty:{arrayJson:'[]'},mixed:{arrayJson:'["A",1]'},null:{arrayJson:'[null]'},nested:{arrayJson:'[[1]]'},numberString:{valueType:'number',arrayJson:'["2"]'},infinite:{valueType:'number',arrayJson:'[1e999]'},missingVariable:{arrayVar:'missing'},badMode:{mode:'x'},badType:{valueType:'x'},badSource:{source:'x'},badUnique:{uniqueBy:'x'},blankKey:{key:' '},longKey:{key:'x'.repeat(129)},tooMany:{arrayJson:JSON.stringify(Array.from({length:10001},(_,i)=>String(i)))}}))
 await test(`invalid creation ${label} preserves state and result`,async()=>{const h=make();const before=h.snapshot().saved;Math.random=()=>{throw Error('invalid creation sampled');};assert.equal(await h.run('deckCreate',{...base,...params,...outcome}),-1);assert.equal(h.values.get('result'),'old');assert.equal(h.values.get('ok'),false);assert.deepEqual(h.snapshot().saved,before);});
for(const [label,picks] of Object.entries({duplicateID:[{id:'a',label:'A'},{id:'a',label:'B'}],missingID:[{label:'A'}],zero:[{id:'a',label:'A',weight:0}],negative:[{id:'a',label:'A',weight:-1}],over100:[{id:'a',label:'A',weight:'101%'}],gap:[{id:'a',label:'A',weight:'10%'}],badFormula:[{id:'a',label:'1/0',weight:0},{id:'b',label:'2',weight:1}]}))
 await test(`invalid table ${label} fails intact`,async()=>{const h=host({},picks);assert.equal(await h.run('deckCreate',{key:'x',valueType:label==='badFormula'?'number':'text'}),-1);assert.deepEqual(h.saved.get('drawDecks'),[]);});
for(const count of [0,-1,101,1.5,NaN,Infinity])await test(`invalid draw count ${count}`,async()=>{const h=make();await h.run('deckCreate',base);const before=h.snapshot();assert.equal(await h.run('deckDraw',{key:'events',count}),'');assert.deepEqual(h.snapshot(),before);});
await test('output collisions, absent batch variables and wrong types preserve bag',async()=>{
 const h=make();await h.run('deckCreate',base);const before=h.snapshot().saved;
 for(const params of [{outVar:'result',reportVar:'result'},{reportVar:'report',outIdVar:'report'},{count:2,prefix:'missing'},{remainingVar:'result'},{outVar:'remaining'},{reportVar:'report',successVar:'report'}]){assert.equal(await h.run('deckDraw',{key:'events',...params}),'');assert.deepEqual(h.snapshot().saved,before);}
});
await test('missing bag and reset idempotence have explicit results',async()=>{
 const h=make();assert.equal(await h.run('deckDraw',{key:'missing'}),'');assert.equal(await h.run('deckPeek',{key:'missing'}),'');assert.equal(await h.run('deckReset',{key:'missing'}),true);
});
await test('old slots lacking drawDecks migrate without changing fixed results',async()=>{
 const h=make();h.saved.delete('drawDecks');h.saved.set('fixedResults',['unchanged']);assert.equal(await h.run('deckCreate',base),3);assert.deepEqual(h.saved.get('fixedResults'),['unchanged']);
});
await test('corrupt and unsupported save records are rejected rather than silently reset',async()=>{
 const h=make();await h.run('deckCreate',base);const good=structuredClone(h.saved.get('drawDecks')), d=JSON.parse(good[0]);
 for(const bad of ['wrong',[5],['{'],[JSON.stringify({...d,version:99})],[JSON.stringify({...d,drawn:9})],[JSON.stringify({...d,items:[...d.items,d.items[0]]})],good.concat(good)]){h.saved.set('drawDecks',bad);assert.equal(await h.run('deckDraw',{key:'events'}),'');assert.deepEqual(h.saved.get('drawDecks'),bad);}
});
await test('slot write failure preserves all output variables',async()=>{
 const h=make();await h.run('deckCreate',base);const before=h.snapshot();h.owner.save.set=()=>{throw Error('save unavailable');};assert.equal(await h.run('deckDraw',{key:'events',...outcome}),'');assert.equal(h.values.get('result'),'old');assert.deepEqual(h.snapshot().saved,before.saved);
});
await test('output setter failure rolls back earlier output variables and bag consumption',async()=>{
 const h=make();await h.run('deckCreate',base);const before=h.snapshot().saved,set=h.ctx.variables.set;
 h.ctx.variables.set=(n,v)=>{if(n==='x_2')throw Error('write failed');set(n,v);};assert.equal(await h.run('deckDraw',{key:'events',count:2,prefix:'x',reportVar:'report'}),'');assert.equal(h.values.get('x_1'),'old1');assert.deepEqual(h.snapshot().saved,before);
});
await test('status setter failure also rolls back committed bag and result',async()=>{
 const h=make();await h.run('deckCreate',base);const before=h.snapshot().saved,set=h.ctx.variables.set;
 h.ctx.variables.set=(n,v)=>{if(n==='ok')throw Error('status failed');set(n,v);};assert.equal(await h.run('deckDraw',{key:'events',...outcome}),'');assert.equal(h.values.get('result'),'old');assert.deepEqual(h.snapshot().saved,before);
});
await test('cancelled asynchronous creation cannot write to restored slot or output',async()=>{
 const h=host({ok:true,error:''},mixed());let finish;h.ctx.database.collection=()=>({find:()=>new Promise(r=>finish=r)});
 const pending=h.run('deckCreate',{key:'t',successVar:'ok',errorVar:'error'});h.controller.abort();finish(mixed());assert.equal(await pending,-1);assert.deepEqual(h.saved.get('drawDecks'),[]);assert.equal(h.values.get('ok'),true);
});
await test('overlapping operations reject reentry; first operation can still complete',async()=>{
 const h=host({},mixed());let finish;h.ctx.database.collection=()=>({find:()=>new Promise(r=>finish=r)});
 const pending=h.run('deckCreate',{key:'t'});assert.equal(await h.run('deckCreate',base),-1);assert.equal(await h.run('deckReset',{key:'t'}),false);finish(mixed());assert.equal(await pending,3);assert.equal(parseDecks(h.saved.get('drawDecks')).length,1);
});
await test('slot state changed during asynchronous input does not get overwritten',async()=>{
 const h=host({},mixed());let finish;h.ctx.database.collection=()=>({find:()=>new Promise(r=>finish=r)});const pending=h.run('deckCreate',{key:'t'});
 const external=encodeDecks([{version:1,key:'other',mode:'fixed',valueType:'text',total:1,drawn:0,items:[{id:'x',value:'X',weight:1}]}]);h.saved.set('drawDecks',external);finish(mixed());assert.equal(await pending,-1);assert.deepEqual(h.saved.get('drawDecks'),external);
});
await test('fresh run/new slot has no inherited bag while loaded slot preserves exhaustion',async()=>{
 const h=make();await h.run('deckCreate',base);await h.run('deckDraw',{key:'events',count:3});assert.equal(await make().run('deckPeek',{key:'events'}),'');assert.equal(JSON.parse(await host({},[],[],h.snapshot()).run('deckPeek',{key:'events'})).remaining,0);
});
await test('10000-item uniform array creates and resumes without truncation',async()=>{
 const h=make();const begin=performance.now();assert.equal(await h.run('deckCreate',{...base,arrayJson:JSON.stringify(Array.from({length:10000},(_,i)=>String(i)))}),10000);assert.equal(JSON.parse(await h.run('deckDraw',{key:'events',count:100})).length,100);assert.equal(JSON.parse(await h.run('deckPeek',{key:'events'})).remaining,9900);assert.ok(performance.now()-begin<5000);
});
await test('all six uniform three-item permutations occur with expected frequencies',()=>{
 seed(123);const counts=new Map();for(let i=0;i<12000;i++){const key=shuffle(['A','B','C'].map(id=>({id,value:id,weight:1}))).map(i=>i.id).join('');counts.set(key,(counts.get(key)||0)+1);}assert.equal(counts.size,6);for(const count of counts.values())assert.ok(Math.abs(count-2000)<180,`${count}`);
});
await test('weighted first draw distribution matches 10/36/54 percent',()=>{
 seed(9527);const counts=[0,0,0],items=[.1,.36,.54].map((weight,i)=>({id:String(i),value:i,weight}));for(let i=0;i<30000;i++)counts[weightedIndex(items)]++;
 for(let i=0;i<3;i++)assert.ok(Math.abs(counts[i]-30000*items[i].weight)<7*Math.sqrt(30000*items[i].weight*(1-items[i].weight)),`${counts}`);
});
await test('weighted fixed shuffle and remaining mode share conditional distribution',()=>{
 seed(77);const counts=[0,0,0],items=[.1,.36,.54].map((weight,i)=>({id:String(i),value:i,weight}));for(let i=0;i<12000;i++){const order=shuffle(items);assert.equal(new Set(order.map(i=>i.id)).size,3);counts[Number(order[0].id)]++;}for(let i=0;i<3;i++)assert.ok(Math.abs(counts[i]-12000*items[i].weight)<200,`${counts}`);
});
await test('random-source failures never consume persistent candidates',async()=>{
 const h=make();await h.run('deckCreate',{...base,mode:'remaining'});const before=h.snapshot();for(const bad of [-.1,1,NaN,Infinity]){Math.random=()=>bad;assert.equal(await h.run('deckDraw',{key:'events'}),'');assert.deepEqual(h.snapshot(),before);}
});
await test('record-count and aggregate size guards do not consume random or partially create',async()=>{
 const h=make();for(let i=0;i<100;i++)assert.equal(await h.run('deckCreate',{...base,key:String(i),arrayJson:'["x"]',mode:'remaining'}),1);const before=h.snapshot();assert.equal(await h.run('deckCreate',{...base,key:'overflow'}),-1);assert.deepEqual(h.snapshot(),before);
});
await test('10000 weighted candidates shuffle once within practical budget',()=>{
 seed(88);const items=Array.from({length:10000},(_,i)=>({id:String(i),value:i,weight:(i%7)+1})),begin=performance.now();const ordered=shuffle(items);assert.equal(new Set(ordered.map(i=>i.id)).size,10000);assert.ok(performance.now()-begin<10000);
});
for (const purpose of ['archive-restore','snapshot-restore',undefined]) await test(`replaying a saved reset/create/draw chain preserves both modes (${purpose})`,async()=>{
 const h=make();await h.run('deckCreate',base);await h.run('deckCreate',{...base,key:'fresh',mode:'remaining'});
 await h.run('deckDraw',{key:'events',...outcome});await h.run('deckDraw',{key:'fresh'});
 const snapshot=h.snapshot(),loaded=host({},[],[],snapshot);
 loaded.ctx.getHost=()=>({application:{scriptingSystem:{getActiveSeekPurpose:()=>purpose}}});
 Math.random=()=>{throw Error('Replay must not consume randomness');};
 for(const [name,params] of [['deckReset',{key:'events'}],['deckCreate',base],['deckDraw',{key:'events',...outcome}],['deckDraw',{key:'fresh'}],['deckPeek',{key:'events',outVar:'report'}],['rand',{min:0,max:1,outVar:'remaining'}],['resetFixed',{key:'x'}],['randPick',{outVar:'result'}],['randPickNumber',{outVar:'remaining'}],['calc',{op:'add',a:99,b:1,outVar:'remaining'}],['previewPool',{outVar:'report'}]]) {
  await M[name].runImmediately.call(loaded.owner,loaded.ctx,params);
 }
 assert.deepEqual(loaded.snapshot(),snapshot);
 assert.equal(await h.run('deckDraw',{key:'events'}),await loaded.run('deckDraw',{key:'events'}));
 seq(0);const a=await h.run('deckDraw',{key:'fresh'});seq(.9999);const b=await loaded.run('deckDraw',{key:'fresh'});assert.notEqual(a,b);
});
await test('editor navigation still executes actions with an explicit navigation purpose',async()=>{
 const h=make();h.ctx.getHost=()=>({application:{scriptingSystem:{getActiveSeekPurpose:()=> 'navigation'}}});
 assert.equal(await M.deckCreate.runImmediately.call(h.owner,h.ctx,base),3);
 await M.deckDraw.runImmediately.call(h.owner,h.ctx,{key:'events',remainingVar:'remaining'});assert.equal(h.values.get('remaining'),2);
});
await test('fast-forward executes mutations even after loading a slot',async()=>{
 const h=make();h.ctx.getHost=()=>({application:{scriptingSystem:{getActiveSeekPurpose:()=> 'archive-restore'}}});
 assert.equal(await M.deckCreate.skip.call(h.owner,h.ctx,base),3);
 await M.deckDraw.skip.call(h.owner,h.ctx,{key:'events',remainingVar:'remaining'});assert.equal(h.values.get('remaining'),2);
 await M.deckReset.skip.call(h.owner,h.ctx,{key:'events'});assert.equal(parseDecks(h.saved.get('drawDecks')).length,0);
});
Math.random=originalRandom;console.warn=originalWarn;
console.log(JSON.stringify({passed,failed,scope:'persistent draw-bag runtime with SDK simulation, properties, lifecycle, failure injection, distributions and size limits'}));
if(failed)process.exitCode=1;
