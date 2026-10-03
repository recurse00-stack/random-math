// Pure v3 pool state and probability rules. No host, filesystem or UI dependency.
import { compileExpr } from './expression.js';
export type ReadVariable = (name: string) => unknown;
export type ConfigSource = 'settings' | 'array' | 'table' | 'legacy';
export type Rate = number | string;
export type PoolKind = 'with' | 'without';
export type Candidate = { id: string; label: string; value: string | number; rate: Rate; enabled: boolean; condition: string; initial: number; remaining: number; reserved: number; data?: unknown };
export type Pool = { id: string; name: string; kind: PoolKind; valueType: 'text' | 'number'; probability: 'weight' | 'percent'; quantityWeight: 'candidate' | 'unit'; random: 'fresh' | 'fixed'; seed: number; cursor: number; revision: number; configVersion?: string; configSource?: ConfigSource; items: Candidate[]; legacy?: { mode: 'fixed' | 'remaining'; total: number; drawn: number; history: 'unknown'; order: string[] } };
export type Selected = { id: string; label: string; value: string | number; quantity: number; data?: unknown };
export type Receipt = { id: string; poolId: string; state: 'pending' | 'confirmed' | 'cancelled'; items: Selected[] };
export type PendingChoice = { key: string; requestId?: string; poolId: string; ids: string[]; revision: number; consumption: 'immediate' | 'deferred' };
export type Store = { schemaVersion: 3; pools: Pool[]; receipts: Receipt[]; pendingChoices: PendingChoice[]; nextToken: number; tombstones: string[] };
export type Result = { schemaVersion: 1; status: 'ok' | 'skipped' | 'empty' | 'error'; poolId: string; items: Selected[]; receiptId: string; remaining: number | null; reserved: number; available: number | null; errorCode: string; message: string; details?: unknown };
export class PoolError extends Error { constructor(public code: string, message: string) { super(message); this.name = 'PoolError'; } }
export function fail(code: string, text: string): never { throw new PoolError(code, text); }
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export const blankStore = (): Store => ({ schemaVersion: 3, pools: [], receipts: [], pendingChoices: [], nextToken: 1, tombstones: [] });
export function id(v: unknown, label = 'ID'): string { if (typeof v !== 'string' || !v.trim() || v.trim().length > 128) fail('INVALID_ID', `${label}需要1～128个字符`); return (v as string).trim(); }
export function finite(v: unknown, label: string): number { if (typeof v !== 'number' || !Number.isFinite(v)) fail('INVALID_NUMBER', `${label}必须是有限数值`); return v as number; }
export function integer(v: unknown, label: string, max = 10000): number { const n = finite(v,label); if (!Number.isSafeInteger(n) || n < 0 || n > max) fail('INVALID_QUANTITY', `${label}必须是0～${max}整数`); return n; }
export function numeric(v: Rate, read: ReadVariable): number { return typeof v === 'number' ? finite(v,'数值') : compileExpr(v)({x:0,y:0,z:0,w:0,v:read}); }
export function allows(condition: string, read: ReadVariable): boolean { if (!condition) return true; const v = read(condition); if (typeof v !== 'boolean') fail('INVALID_CONDITION', `条件变量「${condition}」缺失或不是布尔值`); return v as boolean; }
export function payload(raw: unknown): unknown { if (raw === undefined || raw === '') return undefined; const v = typeof raw === 'string' ? JSON.parse(raw) : clone(raw); const text=JSON.stringify(v); if (!text || text.length>8192) fail('INVALID_DATA','附加数据超过8192字符或不是JSON'); return v; }
export function candidate(raw: Record<string, unknown>, kind: PoolKind): Candidate {
    if(raw.enabled!==undefined&&typeof raw.enabled!=='boolean')fail('INVALID_VALUE','启用状态必须是布尔值');
    if(raw.condition!==undefined&&typeof raw.condition!=='string')fail('INVALID_CONDITION','条件必须是布尔变量名文本');
    const quantity = integer(raw.quantity ?? raw.initial ?? 1,'初始份数');
    const value = raw.value ?? raw.label ?? '';
    if (typeof value !== 'string' && typeof value !== 'number') fail('INVALID_VALUE','候选结果需要文字或数值');
    const rate = raw.rate ?? 1;
    if (typeof rate !== 'string' && typeof rate !== 'number') fail('INVALID_RATE','权重或基础百分比类型错误');
    const data=payload(raw.data);
    return {id:id(raw.id,'候选ID'),label:String(raw.label ?? value),value:value as string|number,rate:rate as Rate,enabled:raw.enabled !== false,condition:String(raw.condition ?? '').trim(),initial:kind==='without'?quantity:0,remaining:kind==='without'?quantity:0,reserved:0,...(data===undefined?{}:{data})};
}
export function configuredPool(raw: Record<string, unknown>, rows: Record<string,unknown>[], seed = 1): Pool {
    const kind = raw.kind ?? 'with'; if (kind!=='with' && kind!=='without') fail('INVALID_KIND','池类型无效');
    const pool: Pool = {id:id(raw.id,'池ID'),name:String(raw.name || raw.id),kind:kind as PoolKind,valueType:(raw.valueType ?? 'text') as Pool['valueType'],probability:(raw.probability ?? 'weight') as Pool['probability'],quantityWeight:(raw.quantityWeight ?? 'candidate') as Pool['quantityWeight'],random:(raw.random || (kind==='without'?'fixed':'fresh')) as Pool['random'],seed:seed>>>0,cursor:0,revision:0,items:rows.map(r=>candidate(r,kind as PoolKind))};
    pool.configSource=(raw.configSource??'settings') as ConfigSource;
    // A content fingerprint of the initialization definition, not a migration or security hash.
    const definition=JSON.stringify([pool.id,pool.name,pool.kind,pool.valueType,pool.probability,pool.quantityWeight,pool.random,pool.items]);
    let fingerprint=2166136261;for(let i=0;i<definition.length;i++)fingerprint=Math.imul(fingerprint^definition.charCodeAt(i),16777619);
    pool.configVersion=`cfg1-${(fingerprint>>>0).toString(16).padStart(8,'0')}`;
    validatePool(pool); return pool;
}
export function validatePool(p: Pool): void {
    id(p.id,'池ID');
    if(p.configVersion!==undefined&&(!/^cfg1-[0-9a-f]{8}$/.test(p.configVersion)||typeof p.configVersion!=='string')||p.configSource!==undefined&&!['settings','array','table','legacy'].includes(p.configSource))fail('CORRUPT_STATE','配置来源记录损坏');
    if (!['with','without'].includes(p.kind)||!['text','number'].includes(p.valueType)||!['weight','percent'].includes(p.probability)||!['candidate','unit'].includes(p.quantityWeight)||!['fresh','fixed'].includes(p.random)) fail('CORRUPT_STATE','池配置无效');
    if (!Array.isArray(p.items)||p.items.length>10000||new Set(p.items.map(x=>x.id)).size!==p.items.length) fail('CORRUPT_STATE','候选重复或超过10000项');
    integer(p.seed,'随机状态',0xffffffff); integer(p.cursor,'随机进度',Number.MAX_SAFE_INTEGER); integer(p.revision,'池修订',Number.MAX_SAFE_INTEGER);
    for(const c of p.items){ id(c.id,'候选ID'); if(typeof c.label!=='string'||!['string','number'].includes(typeof c.value)||!['string','number'].includes(typeof c.rate)||typeof c.enabled!=='boolean'||typeof c.condition!=='string') fail('CORRUPT_STATE','候选字段损坏');
        if(typeof c.value==='number')finite(c.value,'候选值'); if(typeof c.rate==='number')finite(c.rate,'候选权重');
        integer(c.initial,'初始份数'); integer(c.remaining,'剩余份数'); integer(c.reserved,'占用份数'); if(c.reserved>c.remaining)fail('CORRUPT_STATE','占用超过剩余份数');
        if(p.kind==='with'&&(c.remaining!==0||c.reserved!==0||c.initial!==0))fail('CORRUPT_STATE','放回池不记录份数');
        if(c.data!==undefined)payload(c.data);
    }
    if(p.legacy){if(!['fixed','remaining'].includes(p.legacy.mode)||!Array.isArray(p.legacy.order)||new Set(p.legacy.order).size!==p.legacy.order.length||p.legacy.order.some(x=>!p.items.some(c=>c.id===x)))fail('CORRUPT_STATE','旧池顺序损坏');integer(p.legacy.total,'旧池总量');integer(p.legacy.drawn,'旧池已抽');}
}
export function validateStore(s: Store): void {
    if (!s || s.schemaVersion!==3 || !Array.isArray(s.pools)||s.pools.length>100||!Array.isArray(s.receipts)||s.receipts.length>10000||!Array.isArray(s.pendingChoices)||s.pendingChoices.length>100||!Array.isArray(s.tombstones)) fail('CORRUPT_STATE','池存档格式损坏或版本不支持');
    if(new Set(s.pools.map(p=>p.id)).size!==s.pools.length||new Set(s.receipts.map(r=>r.id)).size!==s.receipts.length||new Set(s.pendingChoices.map(p=>p.key)).size!==s.pendingChoices.length)fail('CORRUPT_STATE','池、凭证或待选键重复');
    integer(s.nextToken,'凭证序号',Number.MAX_SAFE_INTEGER);if(s.tombstones.length>10000||new Set(s.tombstones).size!==s.tombstones.length)fail('CORRUPT_STATE','已删除池记录错误');s.tombstones.forEach(x=>id(x));s.pools.forEach(validatePool);
    if(s.pools.reduce((n,p)=>n+p.items.length,0)>20000)fail('LIMIT','存档候选总数超过20000');
    const reserved=new Map<string,number>();
    for(const r of s.receipts){id(r.id,'凭证ID');id(r.poolId,'凭证池');if(!['pending','confirmed','cancelled'].includes(r.state)||!Array.isArray(r.items)||!r.items.length||r.items.length>100)fail('CORRUPT_STATE','凭证格式错误');
        for(const item of r.items){id(item.id);integer(item.quantity,'凭证数量',100);if(!item.quantity||typeof item.label!=='string'||!['string','number'].includes(typeof item.value))fail('CORRUPT_STATE','凭证结果错误');if(r.state==='pending'){const k=JSON.stringify([r.poolId,item.id]);reserved.set(k,(reserved.get(k)||0)+item.quantity);}}
        if(r.state==='pending'&&!s.pools.some(p=>p.id===r.poolId))fail('CORRUPT_STATE','占用池缺失');
    }
    for(const p of s.pools)for(const c of p.items){const k=JSON.stringify([p.id,c.id]);if((reserved.get(k)||0)!==c.reserved)fail('CORRUPT_STATE','凭证与占用数量不一致');reserved.delete(k);}
    if(reserved.size)fail('CORRUPT_STATE','凭证候选缺失');
    for(const pending of s.pendingChoices){id(pending.key);if(pending.requestId!==undefined)id(pending.requestId,'待选请求ID');if(!s.pools.some(p=>p.id===pending.poolId)||!Array.isArray(pending.ids)||pending.ids.some(x=>typeof x!=='string')||!['immediate','deferred'].includes(pending.consumption))fail('CORRUPT_STATE','待选状态损坏');}
}
export function decode(raw: unknown): Store { if(raw===undefined||raw===null||raw==='')return blankStore();if(typeof raw!=='string'||raw.length>4000000)fail('CORRUPT_STATE','池存档不是有效JSON文本');let s:Store;try{s=JSON.parse(raw as string);}catch{fail('CORRUPT_STATE','池存档JSON损坏');}validateStore(s!);return s!; }
export function encode(s: Store): string { validateStore(s);const text=JSON.stringify(s);if(text.length>4000000)fail('LIMIT','池存档超过400万字符');return text; }
export function rates(p: Pool, read: ReadVariable) {
    const values=p.items.map(c=>{const n=numeric(c.rate,read);if(n<0||p.probability==='percent'&&n>100)fail('INVALID_RATE',`候选「${c.id}」权重或基础百分比无效`);return n;});
    if(p.probability==='percent'&&p.items.length&&Math.abs(values.reduce((a,b)=>a+b,0)-100)>1e-8)fail('INVALID_PERCENT','基础百分比合计必须为100%');return values;
}
export function distribution(p: Pool, read: ReadVariable) {
    const base=rates(p,read);
    const rows=p.items.map((c,i)=>{const available=p.kind==='without'?c.remaining-c.reserved:null;
        const reason=!c.enabled?'disabled':!allows(c.condition,read)?'condition':available===0?'exhausted':base[i]===0?'zero-rate':'';
        const weight=reason?0:base[i]*(p.kind==='without'&&p.quantityWeight==='unit'?available!:1);
        if(!Number.isFinite(weight))fail('INVALID_RATE','权重乘份数溢出');
        return {id:c.id,label:c.label,base:base[i],remaining:p.kind==='without'?c.remaining:null,reserved:c.reserved,available,reason,weight,probability:0};});
    const max=Math.max(0,...rows.map(r=>r.weight));const total=max?rows.reduce((n,r)=>n+r.weight/max,0):0;
    rows.forEach(r=>r.probability=total?(r.weight/max)/total:0);return rows;
}
export function counts(p: Pool){return {remaining:p.kind==='without'?p.items.reduce((n,c)=>n+c.remaining,0):null,reserved:p.items.reduce((n,c)=>n+c.reserved,0),available:p.kind==='without'?p.items.reduce((n,c)=>n+c.remaining-c.reserved,0):null};}
export function result(p: Pool, items: Selected[]=[], receiptId=''): Result {return {schemaVersion:1,status:'ok',poolId:p.id,items,receiptId,...counts(p),errorCode:'',message:''};}
export function emptyResult(poolId='',status:Result['status']='ok',message='',errorCode=''):Result{return {schemaVersion:1,status,poolId,items:[],receiptId:'',remaining:null,reserved:0,available:null,errorCode,message};}
export function inspect(p: Pool,read:ReadVariable){return {...result(p),details:{name:p.name,kind:p.kind,probability:p.probability,quantityWeight:p.quantityWeight,random:p.random,cursor:p.cursor,revision:p.revision,configVersion:p.configVersion??'UNKNOWN',configSource:p.configSource??'UNKNOWN',candidates:distribution(p,read),...(p.legacy?{legacyHistory:'unknown',legacyOrder:p.legacy.order}: {})}};}
function random(p:Pool,source:()=>number):number {let n:number;if(p.random==='fixed'){let t=p.seed=(p.seed+0x6D2B79F5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);n=((t^(t>>>14))>>>0)/4294967296;}else n=source();if(!Number.isFinite(n)||n<0||n>=1)fail('RANDOM','随机源超出[0,1)');p.cursor++;return n;}
function selected(p:Pool,c:Candidate,read:ReadVariable):Selected {return {id:c.id,label:c.label,value:p.valueType==='number'?numeric(c.value,read):String(c.value),quantity:1,...(c.data===undefined?{}:{data:clone(c.data)})};}
function consume(s:Store,p:Pool,items:Selected[],consumption:'immediate'|'deferred'):string {
    if(p.kind==='with')return '';
    for(const item of items){const c=p.items.find(c=>c.id===item.id)!;if(c.remaining-c.reserved<item.quantity)fail('INSUFFICIENT','可用份数不足');if(consumption==='deferred')c.reserved+=item.quantity;else c.remaining-=item.quantity;}
    if(p.legacy&&consumption==='immediate')p.legacy.drawn+=items.length;
    if(consumption==='immediate')return '';
    if(s.receipts.length>=10000)fail('LIMIT','抽取凭证达到10000条');const rid=`r${s.nextToken++}`;
    s.receipts.push({id:rid,poolId:p.id,state:'pending',items:clone(items)});return rid;
}
export function draw(s:Store,p:Pool,count:number,read:ReadVariable,consumption:'immediate'|'deferred'='immediate',source:()=>number=Math.random):Result {
    if(!Number.isInteger(count)||count<1||count>100)fail('INVALID_COUNT','抽取数量必须为1～100');
    if(!['immediate','deferred'].includes(consumption))fail('INVALID_CONSUMPTION','消耗时机无效');
    const initial=distribution(p,read),active=initial.filter(r=>r.probability>0);
    if(!active.length)fail('EMPTY_POOL','没有符合条件且可抽取的候选');
    if(p.kind==='without'&&active.reduce((n,r)=>n+r.available!,0)<count)fail('INSUFFICIENT','可用份数不足，本批未抽取');
    // Numeric results are validated before any sampling; reads remain a batch snapshot.
    const activeIds=new Set(active.map(c=>c.id));const resolved=new Map(p.items.filter(c=>activeIds.has(c.id)).map(c=>[c.id,selected(p,c,read)]));
    const chosen:Selected[]=[];
    for(let i=0;i<count;i++){
        const rows=distribution(p,read).filter(r=>r.probability>0);let chosenId:string;
        if(p.legacy?.mode==='fixed'){chosenId=p.legacy.order.find(k=>rows.some(r=>r.id===k))||fail('EMPTY_POOL','旧固定顺序中没有可抽取项目');}
        else {let roll=random(p,source);chosenId=rows[rows.length-1].id;for(const r of rows){roll-=r.probability;if(roll<0){chosenId=r.id;break;}}}
        chosen.push(clone(resolved.get(chosenId)!));if(p.kind==='without')p.items.find(c=>c.id===chosenId)!.reserved++;
    }
    // Release temporary batch reservations before the single receipt commit.
    if(p.kind==='without')for(const item of chosen)p.items.find(c=>c.id===item.id)!.reserved--;
    const rid=consume(s,p,chosen,consumption);p.revision++;return result(p,chosen,rid);
}
export function choiceIds(p:Pool,read:ReadVariable):string[]{return p.items.filter(c=>c.enabled&&allows(c.condition,read)&&(p.kind==='with'||c.remaining>c.reserved)).map(c=>c.id);}
export function choose(s:Store,p:Pool,candidateId:string,read:ReadVariable,consumption:'immediate'|'deferred'):Result {
    if(!['immediate','deferred'].includes(consumption))fail('INVALID_CONSUMPTION','消耗时机无效');const valid=choiceIds(p,read).includes(candidateId);if(!valid)fail('STALE_CHOICE','选项已不可用，请重新展示');
    const item=selected(p,p.items.find(c=>c.id===candidateId)!,read);const rid=consume(s,p,[item],consumption);p.revision++;return result(p,[item],rid);
}
export function settle(s:Store,receiptId:string,action:'confirm'|'cancel'):Result {
    const r=s.receipts.find(r=>r.id===receiptId);if(!r)fail('MISSING_RECEIPT','未找到抽取凭证');const p=s.pools.find(p=>p.id===r!.poolId);if(!p)fail('MISSING_POOL','凭证所属池不存在');
    const target=action==='confirm'?'confirmed':'cancelled';if(r!.state===target)return {...result(p!,r!.items,r!.id),message:'该凭证已经处理，本次未重复扣除'};
    if(r!.state!=='pending')fail('SETTLED_RECEIPT','该凭证已经以另一方式结束');
    for(const item of r!.items){const c=p!.items.find(c=>c.id===item.id);if(!c||c.reserved<item.quantity)fail('CORRUPT_STATE','占用候选或份数不一致');c.reserved-=item.quantity;if(action==='confirm')c.remaining-=item.quantity;}
    if(p!.legacy&&action==='confirm')p!.legacy.drawn+=r!.items.length;r!.state=target;p!.revision++;return result(p!,r!.items,r!.id);
}
export type Change = {op:string; candidateId?:string; candidateIdVar?:string; amount?:Rate; value?:string|number; label?:string; condition?:string; enabled?:boolean; quantity?:number; rate?:Rate; data?:unknown; when?:string};
export function adjust(p:Pool,changes:Change[],read:ReadVariable):Result {
    if(!changes.length||changes.length>100)fail('INVALID_BATCH','批量调整需要1～100项');
    const percent=new Map<string,number>();let percentageMembership=false,applied=0;
    for(const change of changes){if(!allows(change.when||'',read))continue;applied++;
        const cid=change.candidateIdVar?id(read(change.candidateIdVar),'变量中的候选ID'):id(change.candidateId,'候选ID');
        const c=p.items.find(c=>c.id===cid);
        if(change.op==='add') {if(c)fail('DUPLICATE','候选ID已存在');const added=candidate({...change,id:cid},p.kind);allows(added.condition,read);p.items.push(added);if(p.probability==='percent')percent.set(cid,numeric(added.rate,read));continue;}
        if(!c)fail('MISSING_CANDIDATE',`候选「${cid}」不存在`);
        switch(change.op){
            case 'remove':if(c!.reserved)fail('RESERVED','候选仍有占用份数');p.items=p.items.filter(x=>x.id!==cid);if(p.legacy)p.legacy.order=p.legacy.order.filter(k=>k!==cid);percent.delete(cid);percentageMembership=true;break;
            case 'enable':c!.enabled=true;break;case 'disable':c!.enabled=false;break;
            case 'set-rate':case 'add-rate':{
                if(p.probability!=='weight')fail('WRONG_PROBABILITY','百分比池请使用调整基础百分比');
                c!.rate=change.op==='set-rate'?(change.amount??0):numeric(c!.rate,read)+numeric(change.amount??0,read);if(numeric(c!.rate,read)<0)fail('INVALID_RATE','权重不能为负');break;}
            case 'set-percent':if(p.probability!=='percent')fail('WRONG_PROBABILITY','权重池请使用调整权重');percent.set(cid,numeric(change.amount??0,read));break;
            case 'set-quantity':case 'add-quantity':{
                if(p.kind!=='without')fail('WRONG_KIND','放回池没有份数');const n=integer(change.op==='set-quantity'?numeric(change.amount??0,read):c!.remaining+numeric(change.amount??0,read),'剩余份数');if(n<c!.reserved)fail('RESERVED','剩余份数不能少于占用');c!.remaining=n;break;}
            case 'set-condition':c!.condition=String(change.condition||'').trim();allows(c!.condition,read);break;
            case 'set-content':if(change.value===undefined)fail('INVALID_VALUE','结果内容未填写');c!.value=change.value;if(change.label!==undefined)c!.label=change.label;break;
            default:fail('INVALID_OPERATION',`未知调整操作「${change.op}」`);
        }
    }
    if(p.probability==='percent'&&(percent.size||percentageMembership)){
        let specified=0;for(const [key,value]of percent){if(value<0||value>100)fail('INVALID_PERCENT','基础百分比必须在0～100之间');specified+=value;p.items.find(c=>c.id===key)!.rate=value;}
        if(specified>100+1e-8)fail('INVALID_PERCENT','指定百分比合计超过100%');const rest=p.items.filter(c=>!percent.has(c.id));const total=rest.reduce((n,c)=>n+numeric(c.rate,read),0);const left=Math.max(0,100-specified);
        if(p.items.length&&left>1e-8&&(!rest.length||total<=0))fail('INVALID_PERCENT','剩余百分比没有正比例候选可以分配');
        for(const c of rest)c.rate=total?left*numeric(c.rate,read)/total:0;
    }
    // Once an author deliberately changes an imported pool, use the v3 sampler.
    if(applied&&p.legacy){p.legacy.mode='remaining';p.legacy.order=p.items.map(c=>c.id);}
    validatePool(p);rates(p,read);if(applied)p.revision++;return {...inspect(p,read),status:applied?'ok':'skipped'};
}
