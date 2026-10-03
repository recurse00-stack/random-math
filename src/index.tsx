import { Extension, extension, settings, defineSave, method as sdkMethod, type BlockSchema, type ExtensionContext } from '@avg-studio/sdk';
import { LegacyMath, runExtraCalculation } from './legacy.js';
import { buildCalcSchema, isEnhancedCalculation, evaluateCalculation } from './math-enhancement.js';
import { replayMethod, isNavigationReplay } from './host-replay.js';
import { runAction, showChoices, legacyDeck, type Owner, type Params } from './pool-runtime.js';
import { PoolInspector } from './pool-inspector.js';
import { randSchema, randomParams } from './random-form.js';
// Presentation only: closing advanced settings never clears or disables saved outputs.
const feedbackVisibility={field:'showAdvancedFeedback',equals:true} as const;
const common:BlockSchema={
    showAdvancedFeedback:{type:'boolean',label:'高级设置：执行反馈（可选）',default:false},
    reportVar:{type:'variable',label:'完整报告（文本，可空）',visibleWhen:feedbackVisibility},
    statusVar:{type:'variable',label:'结果状态 ok/skipped/empty/error（文本，可空）',visibleWhen:feedbackVisibility},
    successVar:{type:'variable',label:'成功状态（布尔，可空）',visibleWhen:feedbackVisibility},
    errorVar:{type:'variable',label:'错误说明（文本，可空）',visibleWhen:feedbackVisibility},
};
const resultFields:BlockSchema={outVar:{type:'variable',label:'单项结果（与池结果类型一致，可空）'},idVar:{type:'variable',label:'单项候选ID（文本，可空）'},valuesVar:{type:'variable',label:'结果数组JSON（文本，可空）'},idsVar:{type:'variable',label:'候选ID数组JSON（文本，可空）'},prefix:{type:'string',label:'逐项输出前缀（可空，预先声明 前缀_1…N）',default:''},receiptVar:{type:'variable',label:'占用凭证（文本，延后消耗时填写）'},remainingVar:{type:'variable',label:'剩余份数（数值，可空）'},availableVar:{type:'variable',label:'可用份数（数值，可空）'}};
const poolField:BlockSchema={poolId:{type:'string',label:'目标池ID（见扩展设置的池目录）',required:true,suggestions:{key:'v3-pool'}}};
const drawFields:BlockSchema={...poolField,count:{type:'number',label:'抽取数量',default:1,min:1,max:100,step:1},...resultFields};
const {receiptVar:unusedReceipt,remainingVar:unusedRemaining,availableVar:unusedAvailable,...replacementFields}=drawFields;
const {receiptVar:batchReceipt,...temporaryResults}=resultFields;
const consumption:BlockSchema={consumption:{type:'enum',label:'消耗时机',default:'immediate',options:[{label:'立即消耗',value:'immediate'},{label:'先占用，完成后确认',value:'deferred'}]}};
const fieldString=(label:string,defaultValue='')=>({type:'string',label,default:defaultValue} as const);
function operationSchema(operations:Record<string,{label:string;fields:BlockSchema}>,first:string,shared:BlockSchema={}):BlockSchema{
    const schema:BlockSchema={action:{type:'enum',label:'执行什么',default:first,options:Object.entries(operations).map(([value,x])=>({label:x.label,value}))},...shared};
    for(const [action,{fields}]of Object.entries(operations))for(const [key,field]of Object.entries(fields))schema[`${action}__${key}`]={...field,visibleWhen:{field:'action',equals:action}};
    return {...schema,...common};
}
const drawWithoutSchema=operationSchema({draw:{label:'从池中抽取',fields:{...drawFields,...consumption}},batch:{label:'仅本次批量不放回（JSON数组）',fields:{poolId:{...poolField.poolId,label:'本次操作名称'},arrayJson:{...fieldString('JSON数组','[]'),multiline:true},valueType:{type:'enum',label:'结果类型',default:'text',options:[{label:'文字',value:'text'},{label:'数值或公式',value:'number'}]},count:drawFields.count,...temporaryResults}},confirm:{label:'确认消耗',fields:{receiptId:fieldString('抽取凭证'),...resultFields}},cancel:{label:'取消占用',fields:{receiptId:fieldString('抽取凭证'),...resultFields}}},'draw');
const target:BlockSchema={candidateId:{...fieldString('目标候选ID'),suggestions:{key:'v3-candidate'}}};
const amount:BlockSchema={...target,amount:fieldString('数值／变量表达式（如 var("好感度")）','0')};
const importFields:BlockSchema={kind:{type:'enum',label:'导入池类型',default:'without',options:[{label:'放回',value:'with'},{label:'不放回',value:'without'}]},valueType:{type:'enum',label:'导入结果类型',default:'text',options:[{label:'文字',value:'text'},{label:'数值或公式',value:'number'}]},random:{type:'enum',label:'导入随机策略',default:'fixed',options:[{label:'同一进度固定',value:'fixed'},{label:'允许读档重抽',value:'fresh'}]}};
const updateSchema=operationSchema({
    initialize:{label:'从配置初始化池（已存在时保留）',fields:{}},'import-array':{label:'从JSON数组初始化（已存在时保留）',fields:{arrayJson:{...fieldString('JSON数组','[]'),multiline:true},...importFields}},'import-table':{label:'从旧候选表初始化快照（已存在时保留）',fields:{tablePool:fieldString('旧表池名'),field:fieldString('结果列','label'),...importFields}},reset:{label:'重置为当前创作配置',fields:{}},delete:{label:'删除池',fields:{}},
    add:{label:'新增候选',fields:{...target,label:fieldString('显示文字'),value:fieldString('结果内容（数值池可填公式）'),rate:fieldString('权重／基础百分比（可填 var("好感度")）','1'),quantity:{type:'number',label:'初始份数（不放回池）',default:1,min:0,max:10000,step:1},condition:fieldString('参与条件的布尔变量名（空=始终）'),data:{...fieldString('附加JSON数据（可空）'),multiline:true}}},
    remove:{label:'移除候选',fields:target},enable:{label:'启用候选',fields:target},disable:{label:'停用候选',fields:target},
    'set-rate':{label:'设置权重',fields:amount},'add-rate':{label:'增减权重',fields:amount},'set-percent':{label:'设置基础百分比（其他候选按比例分配）',fields:amount},
    'set-quantity':{label:'设置剩余份数',fields:amount},'add-quantity':{label:'增减剩余份数',fields:amount},
    'set-condition':{label:'修改参与条件',fields:{...target,condition:fieldString('布尔变量名（空=始终）')}},'set-content':{label:'修改显示和结果内容',fields:{...target,label:fieldString('显示文字'),value:fieldString('结果内容')}},
    'batch-adjust':{label:'执行一组批量调整',fields:{batchId:fieldString('批量调整组ID')}},inspect:{label:'读取状态和概率报告',fields:{remainingVar:resultFields.remainingVar,availableVar:resultFields.availableVar}}
},'inspect',{...poolField,when:{type:'variable',label:'仅当此布尔变量为真时执行（可空）'}});
const hide=<T extends object>(definition:T)=>({...definition,enabledWhen:'showLegacyMethods'});
const oldDeck=(definition:any,name:string)=>hide({...definition,run(this:Owner,ctx:ExtensionContext,p:Params){return legacyDeck(this,ctx,p,name,owner=>definition.run.call(owner,ctx,p));},skip(this:Owner,ctx:ExtensionContext,p:Params){return legacyDeck(this,ctx,p,name,owner=>definition.run.call(owner,ctx,p));},runImmediately(this:Owner,ctx:ExtensionContext,p:Params){return isNavigationReplay(ctx)?legacyDeck(this,ctx,p,name,owner=>definition.run.call(owner,ctx,p)):definition.runImmediately.call(this,ctx,p);}});
const calcSchema=buildCalcSchema(LegacyMath.calc.schema);
@extension({id:'random-math',label:'抽选与数学增强'})
export class RandomMath extends Extension {
    static saveSchema=defineSave({...LegacyMath.saveSchema,poolStateV3:{type:'string',persistence:'slot',default:'',label:'3.0池、占用凭证与待选状态'}});
    static settings=settings(s=>({
        ...LegacyMath.settings.build(s),
        creatorHelp:s.string('使用说明').default('六入口：随机数、放回抽取、不放回抽取、调整抽取池、玩家选项、计算。先在池目录添加池，再在候选目录填写所属池ID；首次抽取或展示时自动初始化。改作者配置不会覆盖已经开始游玩的池；剧情调整只改当前存档。检查配置和概率使用检查面板；剧情需要余量时使用“调整抽取池→读取状态”。完整案例见 docs/creator-guide.html；AI资料独立安装。').multiline(),
        dslCheat:s.string('旧版速查（仅旧候选表与随机数记录，不用于3.0池）').default('旧候选表的10%与数字混合、随机数的首次结果记录继续兼容。3.0池的规则请阅读下方新池规则。已有工程保存的旧速查原文保留。').multiline(),
        poolRulesV3:s.string('3.0池：表达式、概率与读档规则').default('表达式：支持 + - * / ^、比较、三元条件，以及 sqrt、pow、floor、round、min、max、clamp、var("变量名")。表函数用于“计算”；新池需先计算再引用变量。\n新池：权重支持数值或变量表达式，如 var("好感度") + 10；每次抽取读取当前变量，已经初始化的池也会生效。设置权重保留表达式，增减权重按执行时计算一次；基础百分比填0～100，不加百分号，基础合计100。条件、份数和计权方式会改变本次实际概率。旧候选表的10%与数字混合仅属于兼容规则。\n池的“同一进度固定”保存随机进度；在池已建立且状态、条件与操作相同时，读档结果相同。读回建池前或调整内容、条件后不保证相同。“允许读档重抽”重新产生随机值，但仍可能抽到相同结果。\n“随机数”的“首次抽取后固定”保留旧记录规则，与池的固定进度不同；读回首次记录产生前可重新抽取。').multiline(),
        showLegacyMethods:s.boolean('显示旧版入口（已有调用始终可执行）').default(false),
        pools:s.array('池目录',i=>({id:i.string('稳定池ID'),name:i.string('显示名称'),kind:i.enum('抽取类型',['with','without'] as const).labels({with:'放回',without:'不放回'}).default('with'),valueType:i.enum('结果类型',['text','number'] as const).labels({text:'文字',number:'数值或公式'}).default('text'),probability:i.enum('概率规则',['weight','percent'] as const).labels({weight:'相对权重',percent:'基础百分比'}).default('weight'),quantityWeight:i.enum('份数计权（不放回）',['candidate','unit'] as const).labels({candidate:'按候选计权',unit:'按每份计权'}).default('candidate').enabledWhen('kind','without'),random:i.enum('随机策略',['fixed','fresh'] as const).labels({fixed:'同一进度固定',fresh:'允许读档重抽'}).default('fixed')})).maxItems(100).addLabel('添加池').table({titleField:'name',columns:['id','kind'],sections:[{label:'结果与概率',fields:['valueType','probability','quantityWeight','random']}]}),
        candidates:s.array('候选目录',i=>({poolId:i.string('所属池ID'),id:i.string('稳定候选ID'),label:i.string('选项显示文字'),value:i.string('结果内容（数值池可填公式）'),rate:i.string('权重／基础百分比（支持变量）').default('1').describe('可填10、var("好感度")或var("好感度") + 10。每次抽取读取当前数值变量；基础百分比每次求值后合计100，不加%。'),quantity:i.number('初始份数（仅不放回）').default(1).range(0,10000),enabled:i.boolean('启用').default(true),condition:i.string('条件布尔变量名（空=始终）').default(''),data:i.string('附加JSON数据（可空）').multiline()})).maxItems(20000).addLabel('添加候选').table({titleField:'label',columns:['poolId','id','rate'],sections:[{label:'结果与份数',fields:['value','quantity']},{label:'参与条件',fields:['enabled','condition']},{label:'外部系统数据',fields:['data']}]}),
        adjustments:s.array('批量调整目录（同组按行顺序执行）',i=>({batchId:i.string('调整组ID'),op:i.enum('操作',['add','remove','enable','disable','set-rate','add-rate','set-percent','set-quantity','add-quantity','set-condition','set-content'] as const).labels({'add':'新增','remove':'移除','enable':'启用','disable':'停用','set-rate':'设置权重','add-rate':'增减权重','set-percent':'设置基础百分比','set-quantity':'设置剩余份数','add-quantity':'增减剩余份数','set-condition':'修改条件','set-content':'修改内容'}).default('set-rate'),candidateId:i.string('候选ID'),candidateIdVar:i.string('从文本变量读取候选ID（可空，优先）'),amount:i.string('数值／变量表达式').default('0').describe('例如var("好感度")。设置权重保留表达式；增减权重、份数与设置百分比按执行时求值。'),when:i.string('执行条件布尔变量名（可空）'),label:i.string('新增或修改：显示文字'),value:i.string('新增或修改：结果内容'),rate:i.string('新增：权重／百分比（支持变量）').default('1').describe('例如var("好感度") + 10；变量必须为数值。'),quantity:i.number('新增：份数').default(1).range(0,10000),condition:i.string('新增或修改：参与条件')})).maxItems(10000).table({titleField:'batchId',columns:['op','candidateId'],sections:[{label:'输入',fields:['candidateIdVar','amount','when']},{label:'候选内容',fields:['label','value','rate','quantity','condition']}]}),
    }));
    static rand=replayMethod({id:'rand',title:'随机数',description:'选择单个／批量及重抽／固定；完整参数保留既有调用。也可清除指定固定记录。',schema:randSchema,returns:{type:'number',label:'单次结果／批量数量；清除成功1、失败-1'},run(ctx,p){if(p.action==='reset')return LegacyMath.resetFixed.run.call(this,ctx,{key:String(p.resetKey||''),successVar:p.successVar,errorVar:p.errorVar} as never)?1:-1;return LegacyMath.rand.run.call(this,ctx,randomParams(p) as never);}});
    static drawReplace=replayMethod({id:'draw-replace',title:'放回抽取',description:'从指定放回池抽取，候选不会因抽取而减少。',schema:{...replacementFields,...common},async run(ctx,p){await runAction(this as unknown as Owner,ctx,p,'with');}});
    static drawWithout=replayMethod({id:'draw-without',title:'不放回抽取',description:'抽取并消耗或占用份数；也可确认消耗、取消占用。',schema:drawWithoutSchema,async run(ctx,p){await runAction(this as unknown as Owner,ctx,p,'without');}});
    static poolUpdate=replayMethod({id:'pool-update',title:'调整抽取池',description:'剧情运行时调整指定池，或读取状态。批量调整全部成功后才提交。',schema:updateSchema,async run(ctx,p){await runAction(this as unknown as Owner,ctx,p,'update');}});
    static playerChoice=sdkMethod({id:'player-choice',title:'玩家选项',description:'展示合格候选，等待玩家选择；输出结果接续后面的剧情。',schema:{...poolField,requestKey:fieldString('选项请求名（空=池ID；同池多个待选点请分别命名）'),...consumption,...resultFields,...common},async run(ctx,p){await showChoices(this as unknown as Owner,ctx,p);},async skip(ctx,p){await showChoices(this as unknown as Owner,ctx,p);},async runImmediately(ctx,p){if(isNavigationReplay(ctx))return;await showChoices(this as unknown as Owner,ctx,p,true);}});
    static calc=replayMethod({id:LegacyMath.calc.id,title:LegacyMath.calc.title,description:'基础运算、直接公式、取整精度、余数及范围限制。输入支持数值变量；失败保留结果。',returns:LegacyMath.calc.returns,schema:calcSchema,run(ctx,p){if(isEnhancedCalculation(p.op))return runExtraCalculation(ctx,p,()=>evaluateCalculation(ctx,p));const op=String(p.op);return LegacyMath.calc.run.call(this,ctx,{...p,a:p[`${op}A`]??p.a,b:p[`${op}B`]??p.b} as never);}});
    static deckCreate=oldDeck(LegacyMath.deckCreate,'create');
    static deckDraw=oldDeck(LegacyMath.deckDraw,'draw');
    static deckPeek=oldDeck(LegacyMath.deckPeek,'peek');
    static deckReset=oldDeck(LegacyMath.deckReset,'reset');
    static resetFixed=hide(LegacyMath.resetFixed);
    static randPick=hide(LegacyMath.randPick);
    static randPickNumber=hide(LegacyMath.randPickNumber);
    static previewPool=hide(LegacyMath.previewPool);
    render(){return {component:PoolInspector,props:{id:"random-math-inspector",owner:this as unknown as Owner}};}
}
