import React, { useState } from 'react';
import { useExtensionContext } from '@avg-studio/sdk';
import { readInspection, type Owner } from './pool-runtime.js';
import type { Result } from './pool-model.js';
export function PoolInspector({owner}:{id?:string;owner?:Owner}){
    const ctx=useExtensionContext();const [pool,setPool]=useState('');const [report,setReport]=useState<Result|null>(null);
    let choiceBinding='UNKNOWN';
    try { choiceBinding=ctx.system?.getBinding?.('internal.system.choice')||'宿主默认／未返回绑定'; } catch { /* Diagnostic only; never change the binding. */ }
    return <section style={{padding:24,fontFamily:'system-ui',lineHeight:1.7,color:'var(--text-primary, #ddd)'}}>
        <h2>抽取池检查</h2><p>只读查看当前状态与概率；未初始化时检查创作配置。不会抽取、建池或改变随机进度。</p>
        <p>配置顺序：池目录 → 候选目录（填写所属池ID） → 剧情入口。已有存档中的池需用剧情调整或明确重置，修改作者配置不会直接覆盖它。</p>
        <details><summary>玩家选项界面与显示排查</summary><p>当前 Choice 绑定：<code>{choiceBinding}</code>。本插件使用此绑定，不替换项目界面。长文本或大量选项需检查滚动与按钮高度；兼容说明见随包 docs/CHOICE-UI-COMPATIBILITY.md。</p></details>
        <label>池ID <input value={pool} onChange={e=>setPool(e.target.value)} /></label> <button onClick={()=>owner&&setReport(readInspection(owner,ctx,pool))}>检查</button>
        {report&&<><p role="status">{report.status==='error'?report.message:`剩余：${report.remaining??'不限制'}　占用：${report.reserved}　可用：${report.available??'不限制'}`}</p>
        {(report.details as any)?.candidates&&<table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['候选','基础值','实际概率','可用份数','未参与原因'].map(x=><th key={x} style={{textAlign:'left',padding:6}}>{x}</th>)}</tr></thead><tbody>{((report.details as any).candidates as any[]).map(c=><tr key={c.id}><td>{c.label}（{c.id}）</td><td>{c.base}</td><td>{(c.probability*100).toFixed(3)}%</td><td>{c.available??'不限制'}</td><td>{{disabled:'已停用',condition:'条件未满足',exhausted:'无可用份数','zero-rate':'权重为零'}[c.reason as string]||'参与'}</td></tr>)}</tbody></table>}
        <details><summary>完整报告</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(report,null,2)}</pre></details></>}
    </section>;
}
