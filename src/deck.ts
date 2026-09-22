// Persistent draw bags. Pure sampling/state validation, independent of host/UI.
export type Item = { id: string; value: string | number; weight: number };
export type Deck = { version: 1; key: string; mode: 'fixed' | 'remaining'; valueType: 'text' | 'number'; total: number; drawn: number; items: Item[] };
export const MAX_ITEMS = 10000;
export const MAX_SAVED_ITEMS = 20000;
export const MAX_DECKS = 100;
export const MAX_STATE_CHARS = 4_000_000;
const invalid = (text: string): never => { throw Error(text); };
export function deckKey(key: unknown): string {
  if (typeof key !== 'string' || !key.trim() || key.trim().length > 128) invalid('抽取池名称必须为1～128字符');
  return (key as string).trim();
}
export function parseDecks(raw: unknown): Deck[] {
  if (raw === undefined || raw === null) return []; // old slots: new schema field has no value yet
  if (!Array.isArray(raw) || raw.length > MAX_DECKS || raw.some(s => typeof s !== 'string')) invalid('抽取池存档格式损坏');
  if ((raw as string[]).reduce((n,s)=>n+s.length,0)>MAX_STATE_CHARS) invalid('抽取池存档过大');
  const decks = (raw as string[]).map(s => {
    const d = JSON.parse(s) as Deck;
    if (!d || d.version !== 1 || deckKey(d.key) !== d.key || !['fixed','remaining'].includes(d.mode) || !['text','number'].includes(d.valueType)
      || !Number.isInteger(d.total) || d.total < 1 || d.total > MAX_ITEMS || !Number.isInteger(d.drawn) || d.drawn < 0 || d.drawn > d.total
      || !Array.isArray(d.items) || d.items.length !== d.total-d.drawn) invalid('抽取池记录损坏或版本不支持');
    const ids = new Set<string>();
    for (const item of d.items) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !Number.isFinite(item.weight) || item.weight <= 0
        || (d.valueType === 'text' ? typeof item.value !== 'string' : typeof item.value !== 'number' || !Number.isFinite(item.value))) invalid('抽取池候选记录损坏');
      ids.add(item.id);
    }
    return d;
  });
  if (new Set(decks.map(d=>d.key)).size !== decks.length) invalid('抽取池名称重复');
  if (decks.reduce((n,d)=>n+d.items.length,0)>MAX_SAVED_ITEMS) invalid('抽取池剩余项目总量超过20000');
  return decks;
}
export function encodeDecks(decks: Deck[]): string[] {
  const raw=decks.map(d=>JSON.stringify(d)); parseDecks(raw); return raw;
}
export function uniqueItems(items: Item[], uniqueBy: string): Item[] {
  if (!['row','value'].includes(uniqueBy)) invalid('去重方式无效');
  if (!items.length || items.length>MAX_ITEMS) invalid('抽取池需要1～10000个有效候选');
  if (new Set(items.map(i=>i.id)).size!==items.length || items.some(i=>!i.id)) invalid('候选行ID为空或重复');
  if(uniqueBy==='row')return items.map(i=>({...i}));
  const merged=new Map<string,Item>();
  for(const item of items){
    const key=JSON.stringify(item.value), old=merged.get(key);
    if(old) old.weight+=item.weight;
    else merged.set(key,{...item});
  }
  return [...merged.values()];
}
function randomUnit(): number {
  const r=Math.random();
  if(!Number.isFinite(r)||r<0||r>=1) invalid('随机源超出[0,1)');
  return r;
}
export function weightedIndex(items: Item[]): number {
  if(!items.length)invalid('抽取池已空');
  let max=0;
  for(const i of items)max=Math.max(max,i.weight);
  let total=0;
  for(const i of items)total+=i.weight/max;
  let roll=randomUnit()*total;
  for(let i=0;i<items.length;i++){roll-=items[i].weight/max;if(roll<0)return i;}
  return items.length-1;
}
export function shuffle(items: Item[]): Item[] {
  const rest=items.map(i=>({...i}));
  if(rest.every(i=>i.weight===rest[0].weight)){
    for(let i=rest.length-1;i>0;i--){const j=Math.floor(randomUnit()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
    return rest;
  }
  const ordered:Item[]=[];
  while(rest.length)ordered.push(rest.splice(weightedIndex(rest),1)[0]);
  return ordered;
}
export function take(deck: Deck, count: number): { next: Deck; chosen: Item[] } {
  if(!Number.isInteger(count)||count<1||count>100) invalid('抽取数量必须为1～100整数');
  if(count>deck.items.length)invalid(`抽取池仅剩${deck.items.length}项，本次需要${count}项；请减少数量或显式重置`);
  const items=deck.items.map(i=>({...i})), chosen:Item[]=[];
  for(let i=0;i<count;i++)chosen.push(items.splice(deck.mode==='fixed'?0:weightedIndex(items),1)[0]);
  return {next:{...deck,drawn:deck.drawn+count,items},chosen};
}
export function report(deck: Deck) {
  return {key:deck.key,mode:deck.mode,valueType:deck.valueType,total:deck.total,drawn:deck.drawn,remaining:deck.items.length,
    values:deck.items.map(i=>i.value),ids:deck.items.map(i=>i.id)};
}
