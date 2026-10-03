// Uses only the test loader and actual definitions; does not open any game project.
import fs from 'node:fs';
import {RandomMath as E} from '../dist/index.js';
const esc=v=>String(v??'').replaceAll('|','\\|').replaceAll('\n','<br>');
const json=v=>v===undefined?'—':JSON.stringify(v);
const sections=[];
for(const m of Object.values(E).filter(v=>v&&typeof v==='object'&&typeof v.run==='function'&&!v.enabledWhen)){
 const rows=Object.entries(m.schema??{}).map(([key,f])=>`|${key}|${esc(f.label)}|${f.type}${f.required?'，必填':''}|${esc(json(f.default))}|${esc(f.options?.map(o=>`${o.value}：${o.label}`).join('；')??'')}|${esc(f.visibleWhen?`${f.visibleWhen.field} = ${json(f.visibleWhen.equals)}`:'始终')}|`);
 sections.push(`### ${m.title}：${m.id}\n\n${m.description??''}\n\n返回：${m.returns?`${m.returns.type}，${m.returns.label}`:'剧情动作；通过变量输出，不作为If条件候选'}。\n\n|字段|填写含义|类型|默认|选项|显示条件|\n|---|---|---|---|---|---|\n${rows.join('\n')}`);
}
const body=sections.join('\n\n');
for(const name of ['USER-GUIDE.md','AI-GUIDE.md']){
 const path=new URL(`../docs/${name}`,import.meta.url);const before=fs.readFileSync(path,'utf8');if(!before.includes('<!-- PARAMETERS-BEGIN -->'))throw Error('Missing generation marker');
 fs.writeFileSync(path,before.replace(/<!-- PARAMETERS-BEGIN -->[\s\S]*?<!-- PARAMETERS-END -->/,`<!-- PARAMETERS-BEGIN -->\n${body}\n<!-- PARAMETERS-END -->`));
}
console.log('Generated six-method parameter references.');
