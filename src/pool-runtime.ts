import type { ExtensionContext, VariableValue } from '@avg-studio/sdk';
import { parseDecks, type Deck } from './deck.js';
import { poolReport } from './legacy.js';
import * as M from './pool-model.js';
export type Owner={save:{get(key:string):unknown;set(key:string,value:unknown):void}};
export type Params=Record<string,unknown>;
const FIELD='poolStateV3';
const busy=new WeakSet<object>();
const activeChoices=new WeakMap<object,Set<string>>();
function lockKey(ctx:ExtensionContext):object {return ctx.variables;}
function lock(ctx:ExtensionContext):()=>void{const key=lockKey(ctx);if(busy.has(key))M.fail('BUSY','抽取池正在处理另一次调用');busy.add(key);return()=>busy.delete(key);}
export function snapshotRead(ctx:ExtensionContext):M.ReadVariable {const cache=new Map<string,unknown>();return name=>{if(!cache.has(name))cache.set(name,ctx.variables.get(name));return cache.get(name);};}
function configuration(ctx:ExtensionContext,key:string):Record<string,unknown>[] {const value=ctx.settings?.get(key)??[];if(!Array.isArray(value))M.fail('INVALID_CONFIG',`${key}不是列表`);return value as Record<string,unknown>[];}
export function configurationIssues(ctx:ExtensionContext):string[]{
    const issues:string[]=[],pools=configuration(ctx,'pools'),rows=configuration(ctx,'candidates'),ids=new Set<string>(),candidates=new Set<string>();
    if(pools.length>100)issues.push('池目录超过100个');
    for(const [index,p]of pools.entries()){
        if(!p||typeof p.id!=='string'||!p.id.trim()||p.id.length>128||p.id!==p.id.trim()){issues.push(`池目录第${index+1}行：稳定ID为空、过长或带首尾空格`);continue;}
        if(ids.has(p.id))issues.push(`池目录：稳定ID「${p.id}」重复`);ids.add(p.id);
    }
    for(const [index,c]of rows.entries()){
        if(!c||typeof c.id!=='string'||!c.id.trim()||c.id.length>128||c.id!==c.id.trim()){issues.push(`候选目录第${index+1}行：稳定ID为空、过长或带首尾空格`);continue;}
        if(typeof c.poolId!=='string'||!ids.has(c.poolId))issues.push(`候选「${c.id}」（第${index+1}行）引用了不存在的池「${String(c.poolId??'')}」`);
        const key=JSON.stringify([c.poolId,c.id]);if(candidates.has(key))issues.push(`池「${String(c.poolId)}」中的候选ID「${c.id}」重复`);candidates.add(key);
    }
    return issues;
}
function initial(ctx:ExtensionContext,poolId:string,read:M.ReadVariable):M.Pool {
    const issues=configurationIssues(ctx);if(issues.length)M.fail('INVALID_CONFIG',issues.join('；'));
    const pools=configuration(ctx,'pools');
    const spec=pools.find(p=>p.id===poolId);if(!spec)M.fail('MISSING_POOL',`池「${poolId}」未配置`);
    const rows=configuration(ctx,'candidates').filter(c=>c.poolId===poolId);const p=M.configuredPool(spec!,rows);M.rates(p,read);return p;
}
function seed():number{const n=Math.random();if(!Number.isFinite(n)||n<0||n>=1)M.fail('RANDOM','初始化随机源无效');return Math.floor(n*4294967296);}
function legacySeed(text:string):number{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;}
function lift(d:Deck):M.Pool {
    const p=M.configuredPool({id:d.key,name:d.key,kind:'without',configSource:'legacy',valueType:d.valueType,random:d.mode==='fixed'?'fixed':'fresh'},d.items.map(c=>({id:c.id,label:String(c.value),value:c.value,rate:c.weight,quantity:1})),legacySeed(JSON.stringify(d)));
    p.legacy={mode:d.mode,total:d.total,drawn:d.drawn,history:'unknown',order:d.items.map(c=>c.id)};return p;
}
function ensure(owner:Owner,ctx:ExtensionContext,s:M.Store,poolId:string,read:M.ReadVariable):M.Pool {
    let pool=s.pools.find(p=>p.id===poolId);if(pool)return pool;
    if(s.tombstones.includes(poolId))M.fail('DELETED_POOL','该池已显式删除，需要初始化后再使用');
    const old=parseDecks(owner.save.get('drawDecks')).find(d=>d.key===poolId);
    pool=old?lift(old):initial(ctx,poolId,read);if(!old)pool.seed=seed();s.pools.push(pool);return pool;
}
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
export function parameters(input:Params):Params {const p={...input},prefix=`${text(input.action)}__`;for(const [k,v]of Object.entries(input))if(k.startsWith(prefix)&&v!==undefined)p[k.slice(prefix.length)]=v;return p;}
function writes(ctx:ExtensionContext,p:Params,r:M.Result):[string,VariableValue][] {
    const out:[string,VariableValue][]=[];const put=(field:string,value:VariableValue|undefined)=>{const name=text(p[field]);if(name&&value!==undefined)out.push([name,value]);};
    if(r.status==='ok'){
        if(r.items.length===1){put('outVar',r.items[0].value);put('idVar',r.items[0].id);}
        put('valuesVar',JSON.stringify(r.items.map(c=>c.value)));put('idsVar',JSON.stringify(r.items.map(c=>c.id)));put('receiptVar',r.receiptId);
        if(r.remaining!==null)put('remainingVar',r.remaining);if(r.available!==null)put('availableVar',r.available);
        const prefix=text(p.prefix);if(prefix)r.items.forEach((item,i)=>out.push([`${prefix}_${i+1}`,item.value]));
    } else if(r.status==='empty'){put('valuesVar','[]');put('idsVar','[]');put('receiptVar','');}
    put('reportVar',JSON.stringify(r));put('statusVar',r.status);put('successVar',r.status==='ok'||r.status==='skipped');put('errorVar',r.status==='error'||r.status==='empty'?r.message:'');
    if(new Set(out.map(w=>w[0])).size!==out.length)M.fail('OUTPUT_COLLISION','结果、报告和状态不能写到同一变量');
    for(const [name,value]of out){const old=ctx.variables.get(name);if(old===undefined||old===null)M.fail('MISSING_VARIABLE',`请先声明输出变量「${name}」`);if(typeof old!==typeof value)M.fail('OUTPUT_TYPE',`输出变量「${name}」类型应为${typeof value}`);}
    return out;
}
function applyWrites(ctx:ExtensionContext,out:[string,VariableValue][]):()=>void {
    const previous=out.map(([name])=>ctx.variables.get(name)!);let done=0;
    const undo=()=>{for(let i=done-1;i>=0;i--)ctx.variables.set(out[i][0],previous[i]);};
    try{for(;done<out.length;done++)ctx.variables.set(...out[done]);}catch(e){undo();throw e;}return undo;
}
function commit(owner:Owner,ctx:ExtensionContext,before:unknown,s:M.Store,p:Params,r:M.Result,signal?:AbortSignal,extra?:{key:string,before:unknown,value:unknown}):void{
    const encoded=M.encode(s),out=writes(ctx,p,r);if(signal?.aborted)M.fail('CANCELLED','运行已取消');
    if(owner.save.get(FIELD)!==before)M.fail('CONFLICT','存档状态已改变，本次操作未提交');
    let undo:(()=>void)|undefined;let extraDone=false;
    try{owner.save.set(FIELD,encoded);if(extra){owner.save.set(extra.key,extra.value);extraDone=true;}undo=applyWrites(ctx,out);if(signal?.aborted)M.fail('CANCELLED','运行已取消');}
    catch(e){undo?.();if(extra&&extraDone)owner.save.set(extra.key,extra.before as VariableValue);owner.save.set(FIELD,(before??'') as VariableValue);throw e;}
}
function outputOnly(ctx:ExtensionContext,p:Params,r:M.Result){applyWrites(ctx,writes(ctx,p,r));}
export function failure(ctx:ExtensionContext,p:Params,e:unknown):M.Result {
    const code=e instanceof M.PoolError?e.code:'INVALID_INPUT';const message=e instanceof Error?e.message:String(e);const r=M.emptyResult(text(p.poolId),code==='EMPTY_POOL'?'empty':'error',message,code);
    // Never overwrite a result when the author accidentally reused its variable for status.
    const protectedNames=new Set(['outVar','idVar','valuesVar','idsVar','receiptVar','remainingVar','availableVar'].map(k=>text(p[k])).filter(Boolean));
    const used=new Set<string>();const safe:Params={};for(const k of ['reportVar','statusVar','successVar','errorVar']){const v=text(p[k]);if(v&&!protectedNames.has(v)&&!used.has(v)){safe[k]=v;used.add(v);}}
    try{outputOnly(ctx,safe,r);}catch{}console.warn(`[random-math] ${code}: ${message}`);return r;
}
function checkOutputs(ctx:ExtensionContext,p:Params,pool:M.Pool,count:number):void{
    if(!Number.isInteger(count)||count<1||count>100)M.fail('INVALID_COUNT','抽取数量必须为1～100');
    const sample=M.result(pool,Array.from({length:count},()=>({id:'check',label:'check',value:pool.valueType==='number'?0:'',quantity:1})));writes(ctx,p,sample);
}
function getChange(p:Params):M.Change {return {op:text(p.action),candidateId:text(p.candidateId),candidateIdVar:text(p.candidateIdVar),amount:(p.amount??0) as M.Rate,value:p.value as string|number|undefined,label:p.label===undefined?undefined:String(p.label),condition:text(p.condition),quantity:p.quantity===undefined?undefined:Number(p.quantity),rate:(p.rate??1) as M.Rate,data:p.data,when:text(p.when)};}
export async function runAction(owner:Owner,ctx:ExtensionContext,input:Params,type:'with'|'without'|'update'):Promise<M.Result>{
    const p=parameters(input),signal=ctx.flow?.signal;let release:(()=>void)|undefined;
    try{release=lock(ctx);if(signal?.aborted)M.fail('CANCELLED','运行已取消');const read=snapshotRead(ctx);const before=owner.save.get(FIELD),s=M.decode(before);const action=text(p.action)||(type==='update'?'inspect':'draw');
        if(type==='update'&&!M.allows(text(p.when),read)){const r=M.emptyResult(text(p.poolId),'skipped','执行条件未满足');outputOnly(ctx,p,r);return r;}
        if(type==='without'&&(action==='confirm'||action==='cancel')){const r=M.settle(s,M.id(p.receiptId,'抽取凭证'),action);commit(owner,ctx,before,s,p,r,signal);return r;}
        const poolId=M.id(p.poolId,'池ID');
        if(type==='update'&&action==='inspect'){
            const pool=s.pools.find(p=>p.id===poolId)??parseDecks(owner.save.get('drawDecks')).filter(d=>d.key===poolId).map(lift)[0]??initial(ctx,poolId,read);
            const r:M.Result=M.inspect(pool,read);r.details={...(r.details as object),initialized:s.pools.some(p=>p.id===poolId)||parseDecks(owner.save.get('drawDecks')).some(d=>d.key===poolId)};outputOnly(ctx,p,r);return r;
        }
        if(type==='update'&&['initialize','import-array','import-table','reset','delete'].includes(action)){
            const initializing=['initialize','import-array','import-table'].includes(action);
            if(initializing&&!s.pools.some(p=>p.id===poolId)){const legacy=parseDecks(owner.save.get('drawDecks')).find(d=>d.key===poolId);if(legacy)s.pools.push(lift(legacy));}
            const old=s.pools.find(p=>p.id===poolId);if(!initializing&&old?.items.some(c=>c.reserved))M.fail('RESERVED','池还有未处理的占用凭证');
            if(initializing&&old){const r=M.inspect(old,read);commit(owner,ctx,before,s,p,r,signal);return r;}
            if(action==='reset'||action==='delete'){s.pools=s.pools.filter(p=>p.id!==poolId);s.pendingChoices=s.pendingChoices.filter(p=>p.poolId!==poolId);}
            let r:M.Result;
            if(action==='delete'){if(!s.tombstones.includes(poolId))s.tombstones.push(poolId);r=M.emptyResult(poolId);}
            else {s.tombstones=s.tombstones.filter(x=>x!==poolId);let pool:M.Pool;
                if(action==='import-array'||text(p.source)==='array'){
                    const raw=JSON.parse(String(p.arrayJson||'[]'));if(!Array.isArray(raw)||raw.length>10000)M.fail('INVALID_ARRAY','初始化需要不超过10000项的JSON数组');
                    const items=raw.map((v,i)=>typeof v==='object'&&v!==null?{...v,id:v.id||`array:${i+1}`}:{id:`array:${i+1}`,value:v,label:String(v),quantity:1});
                    pool=M.configuredPool({id:poolId,kind:p.kind||'without',configSource:'array',valueType:p.valueType||'text',random:p.random||'fixed',probability:p.probability||'weight',quantityWeight:p.quantityWeight||'candidate'},items);
                }else if(action==='import-table'||text(p.source)==='table'){
                    const report=await poolReport(ctx,{pool:text(p.tablePool),poolScope:'named',field:text(p.field)||'label'});
                    pool=M.configuredPool({id:poolId,kind:p.kind||'without',configSource:'table',valueType:p.valueType||'text',random:p.random||'fixed'},report.candidates.map((c,i)=>({id:c.id||`row:${i+1}`,value:c.value,label:c.value,rate:c.probability,quantity:1})));
                }else pool=initial(ctx,poolId,read);
                M.rates(pool,read);pool.seed=seed();s.pools.push(pool);r=M.inspect(pool,read);
            }
            const raw=owner.save.get('drawDecks');const next=parseDecks(raw).filter(d=>d.key!==poolId).map(d=>JSON.stringify(d));commit(owner,ctx,before,s,p,r,signal,{key:'drawDecks',before:raw??[],value:next});return r;
        }
        if(type==='without'&&action==='batch'){
            const raw=JSON.parse(String(p.arrayJson||'[]'));if(!Array.isArray(raw))M.fail('INVALID_ARRAY','本次批量来源需要JSON数组');
            const pool=M.configuredPool({id:poolId,kind:'without',valueType:p.valueType||'text',random:'fresh'},raw.map((v,i)=>typeof v==='object'&&v!==null?{...v,id:v.id||`array:${i+1}`}:{id:`array:${i+1}`,value:v,label:String(v),quantity:1}));
            checkOutputs(ctx,p,pool,Number(p.count??1));const r=M.draw(M.blankStore(),pool,Number(p.count??1),read,'immediate');if(signal?.aborted)M.fail('CANCELLED','运行已取消');outputOnly(ctx,p,r);return r;
        }
        const changes=type==='update'?(action==='batch-adjust'?configuration(ctx,'adjustments').filter(row=>row.batchId===text(p.batchId)).map(row=>({...row,op:row.op} as M.Change)):[getChange(p)]):[];
        if(type==='update'){if(!changes.length||changes.length>100)M.fail('INVALID_BATCH','批量调整需要1～100项');if(!changes.some(c=>M.allows(c.when||'',read))){const r=M.emptyResult(poolId,'skipped','本组执行条件均未满足');outputOnly(ctx,p,r);return r;}}
        const pool=ensure(owner,ctx,s,poolId,read);let r:M.Result;
        if(type==='update'){
            r=M.adjust(pool,changes,read);
        }else {if(pool.kind!==type)M.fail('WRONG_KIND',`池类型与${type==='with'?'放回':'不放回'}入口不符`);checkOutputs(ctx,p,pool,Number(p.count??1));r=M.draw(s,pool,Number(p.count??1),read,(p.consumption||'immediate') as 'immediate'|'deferred');}
        commit(owner,ctx,before,s,p,r,signal);return r;
    }catch(e){if(signal?.aborted)return M.emptyResult(text(p.poolId),'skipped','运行已取消','CANCELLED');return failure(ctx,p,e);}finally{release?.();}
}
export async function showChoices(owner:Owner,ctx:ExtensionContext,input:Params,resumeOnly=false):Promise<void>{
    const p=parameters(input),signal=ctx.flow?.signal,key=text(p.requestKey)||text(p.poolId);let release:(()=>void)|undefined,opened=false,done=false,accepting=false;
    const identity=lockKey(ctx);const existing=activeChoices.get(identity)??new Set<string>();if(existing.size){failure(ctx,p,new M.PoolError('BUSY','已有玩家选项正在展示'));return;}existing.add(key);activeChoices.set(identity,existing);
    const outputsContext=Object.fromEntries(['outVar','idVar','valuesVar','idsVar','prefix','receiptVar','reportVar','statusVar','successVar','errorVar','remainingVar','availableVar'].map(k=>[k,p[k]]));
    try{
        if(!ctx.system?.invoke||!ctx.system?.close)M.fail('UNSUPPORTED_HOST','宿主缺少Choice系统插槽接口');
        release=lock(ctx);if(signal?.aborted)M.fail('CANCELLED','运行已取消');const before=owner.save.get(FIELD),s=M.decode(before);let pending=s.pendingChoices.find(x=>x.key===key);
        if(resumeOnly&&!pending)return;
        const poolId=pending?.poolId||M.id(p.poolId,'池ID'),read=snapshotRead(ctx),pool=ensure(owner,ctx,s,poolId,read);
        checkOutputs(ctx,p,pool,1);let ids=M.choiceIds(pool,read);
        if(pending)ids=pending.ids.filter(k=>ids.includes(k));
        if(!ids.length){s.pendingChoices=s.pendingChoices.filter(x=>x.key!==key);const r=M.emptyResult(poolId,'empty','没有符合条件的玩家选项','EMPTY_POOL');commit(owner,ctx,before,s,p,r,signal);return;}
        if(!pending){pending={key:M.id(key,'选项请求名'),requestId:`q${s.nextToken++}`,poolId,ids,revision:pool.revision,consumption:(p.consumption||'immediate') as 'immediate'|'deferred'};s.pendingChoices.push(pending);}
        // Persist only the pending request; no output or quantity is consumed here.
        commit(owner,ctx,before,s,{},M.result(pool),signal);release();release=undefined;
        ctx.dialogue?.setSkipMode?.(false);ctx.dialogue?.setAutoMode?.(false);
        const pendingSnapshot=M.clone(pending);const choices=ids.map((candidateId,originalIndex)=>({originalIndex,text:pool.items.find(c=>c.id===candidateId)!.label,enabled:true}));
        const abort=()=>{void ctx.system.close('internal.system.choice');};signal?.addEventListener('abort',abort,{once:true});
        try{
            opened=true;accepting=true;await ctx.system.invoke('internal.system.choice',{branchId:`mixing-entropy.random-math:${key}`,choices,onSelect:async(index:number)=>{
                if(!accepting||done||signal?.aborted)return;
                if(!Number.isInteger(index)||index<0||index>=ids.length){failure(ctx,p,new M.PoolError('INVALID_CHOICE','界面返回了无效选项序号'));return;}
                let unlock:(()=>void)|undefined;
                try{unlock=lock(ctx);const prior=owner.save.get(FIELD),next=M.decode(prior),request=next.pendingChoices.find(x=>x.key===key);
                    if(!request||JSON.stringify(request)!==JSON.stringify(pendingSnapshot))M.fail('STALE_CHOICE','待选请求已改变，请重新展示');
                    const current=next.pools.find(x=>x.id===poolId);if(!current)M.fail('MISSING_POOL','选项池不存在');
                    const r=M.choose(next,current,ids[index],snapshotRead(ctx),request.consumption);next.pendingChoices=next.pendingChoices.filter(x=>x.key!==key);
                    commit(owner,ctx,prior,next,outputsContext,r,signal);done=true;
                }catch(e){if(!signal?.aborted)failure(ctx,p,e);done=true;const prior=owner.save.get(FIELD),next=M.decode(prior);next.pendingChoices=next.pendingChoices.filter(x=>x.key!==key);if(!signal?.aborted)commit(owner,ctx,prior,next,{},M.emptyResult(poolId),signal);}
                finally{unlock?.();if(!signal?.aborted)await ctx.system.close('internal.system.choice');}
            }},{modal:true});
        }finally{accepting=false;signal?.removeEventListener('abort',abort);}
        if(!done&&!signal?.aborted){const before=owner.save.get(FIELD),s=M.decode(before);s.pendingChoices=s.pendingChoices.filter(x=>x.key!==key);commit(owner,ctx,before,s,p,M.emptyResult(poolId,'skipped','玩家未选择，未消耗份数'),signal);}
    }catch(e){if(!signal?.aborted)failure(ctx,p,e);}finally{accepting=false;release?.();existing.delete(key);if(!existing.size)activeChoices.delete(identity);if(opened&&!signal?.aborted)await ctx.system.close('internal.system.choice');}
}
export function readInspection(owner:Owner,ctx:ExtensionContext,poolId:string):M.Result{
    try{const s=M.decode(owner.save.get(FIELD)),read=snapshotRead(ctx),issues=configurationIssues(ctx);if(issues.length)M.fail('INVALID_CONFIG',issues.join('；'));const pool=s.pools.find(p=>p.id===poolId)??parseDecks(owner.save.get('drawDecks')).filter(d=>d.key===poolId).map(lift)[0]??initial(ctx,poolId,read);return M.inspect(pool,read);}catch(e){return M.emptyResult(poolId,'error',e instanceof Error?e.message:String(e),e instanceof M.PoolError?e.code:'INVALID_INPUT');}
}
// Only imported v1 pools use this compatibility view. Their identity and order stay intact.
export async function legacyDeck(owner:Owner,ctx:ExtensionContext,p:Params,name:string,original:(owner:Owner)=>unknown):Promise<unknown>{
    const s=M.decode(owner.save.get(FIELD)),key=text(p.key),pool=s.pools.find(p=>p.id===key);
    if(!pool){const value=await original(owner);if(name==='create'&&typeof value==='number'&&value>=0&&s.tombstones.includes(key)){s.tombstones=s.tombstones.filter(x=>x!==key);owner.save.set(FIELD,M.encode(s));}return value;}
    const fallback=name==='create'?-1:name==='reset'?false:'';
    let release:(()=>void)|undefined;
    try{release=lock(ctx);const before=owner.save.get(FIELD),state=M.decode(before),current=state.pools.find(x=>x.id===key)!;let r:M.Result,ret:unknown,out:Params={successVar:p.successVar,errorVar:p.errorVar};
        if(name==='create')M.fail('DUPLICATE','同名抽取池已存在；请先重置');
        if(name==='draw'){
            if(current.kind!=='without')M.fail('WRONG_KIND','旧取出调用需要不放回池');r=M.draw(state,current,Number(p.count??1),snapshotRead(ctx),'immediate');ret=JSON.stringify(r.items.map(x=>x.value));
            out={...out,outVar:Number(p.count??1)===1?p.outVar:undefined,valuesVar:p.reportVar,idsVar:p.outIdVar,remainingVar:p.remainingVar,prefix:Number(p.count??1)>1?p.prefix:undefined};
        }else if(name==='peek'){
            if(current.items.reduce((n,c)=>n+c.remaining-c.reserved,0)>10000)M.fail('LIMIT','旧数组报告最多10000项，请改用新版状态报告');
            const values=current.items.flatMap(c=>Array.from({length:c.remaining-c.reserved},()=>c.value));const ids=current.items.flatMap(c=>Array.from({length:c.remaining-c.reserved},()=>c.id));
            const report={key,mode:current.legacy?.mode||(current.random==='fixed'?'fixed':'remaining'),valueType:current.valueType,total:current.legacy?.total??current.items.reduce((n,c)=>n+c.initial,0),drawn:current.legacy?.drawn??current.items.reduce((n,c)=>n+c.initial-c.remaining,0),remaining:values.length,values,ids};
            ret=JSON.stringify(report);const w:[string,VariableValue][]=[];if(text(p.outVar))w.push([text(p.outVar),ret as string]);if(text(p.arrayVar))w.push([text(p.arrayVar),JSON.stringify(values)]);if(text(p.remainingVar))w.push([text(p.remainingVar),values.length]);
            const statusWrites=writes(ctx,out,M.result(current));const all=[...w,...statusWrites];if(new Set(all.map(x=>x[0])).size!==all.length)M.fail('OUTPUT_COLLISION','旧报告变量冲突');for(const [n,v]of all){const prior=ctx.variables.get(n);if(prior!==undefined&&typeof prior!==typeof v)M.fail('OUTPUT_TYPE','旧报告输出类型错误');}applyWrites(ctx,all);return ret;
        }else if(name==='reset'){
            if(current.items.some(c=>c.reserved))M.fail('RESERVED','池还有未处理的占用');state.pools=state.pools.filter(x=>x.id!==key);state.pendingChoices=state.pendingChoices.filter(x=>x.poolId!==key);if(!state.tombstones.includes(key))state.tombstones.push(key);r=M.emptyResult(key);ret=true;
        }else M.fail('INVALID_OPERATION','未知旧池调用');
        const raw=owner.save.get('drawDecks'),legacy=parseDecks(raw).filter(d=>d.key!==key).map(d=>JSON.stringify(d));commit(owner,ctx,before,state,out,r!,ctx.flow?.signal,{key:'drawDecks',before:raw??[],value:legacy});return ret!;
    }catch(e){
        // Legacy reportVar is a result array, not the v3 diagnostic report.
        // On failure keep every previous result and only write safe status fields.
        const failureParams:Params={poolId:key,successVar:p.successVar,errorVar:p.errorVar,
            outVar:name==='draw'&&Number(p.count??1)!==1?undefined:p.outVar,
            valuesVar:name==='draw'?p.reportVar:p.arrayVar,idsVar:p.outIdVar,remainingVar:p.remainingVar};
        failure(ctx,failureParams,e);return fallback;
    }finally{release?.();}
}
