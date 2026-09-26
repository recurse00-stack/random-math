/* Embedded by build-creator-docs.py; no network or storage access. */
(() => {
  const main=document.querySelector('main'), original=main.innerHTML;
  const $=id=>document.getElementById(id);
  const search=$('search'), status=$('result'), dialog=$('searchDialog');
  let hits=[], position=-1, previewIndex=-1, query='';
  function controls() {
    ['previous','next','openResults','jump','hitNumber'].forEach(id=>$(id).disabled=!hits.length);
    $('hitNumber').max=String(hits.length||1);
    $('hitNumber').value=position<0?'':String(position+1);
  }
  function clear() {
    main.innerHTML=original; hits=[];position=-1;previewIndex=-1;query='';
    $('hitList').replaceChildren();$('previewTitle').textContent='选择一处查看预览';
    $('previewText').replaceChildren();$('previewLocation').textContent='';$('goPreview').disabled=true;
    status.textContent=search.value.trim()?'关键词已更改，请点“查找”':'请输入关键词';controls();
  }
  function showPosition() {
    status.textContent=hits.length?`第 ${position+1} / ${hits.length} 处`:'未找到“'+query+'”';controls();
  }
  function jump(index) {
    if(!Number.isInteger(index)||index<0||index>=hits.length) {
      status.textContent=`请输入 1～${hits.length} 的整数编号`; return;
    }
    main.querySelectorAll('mark.current').forEach(m=>m.classList.remove('current'));
    const marks=main.querySelectorAll(`mark[data-hit="${index}"]`);
    marks.forEach(m=>m.classList.add('current'));position=index;
    if(marks[0]) {marks[0].scrollIntoView({block:'center',behavior:'instant'});marks[0].focus({preventScroll:true});}
    showPosition();
  }
  function preview(index) {
    previewIndex=index;const h=hits[index],text=h.context,startAt=h.contextStart,endAt=h.contextEnd;
    $('previewTitle').textContent=`第 ${index+1} 处 · ${h.section}`;
    $('previewLocation').textContent=`${h.chapter} · 正文约 ${h.percent}% 处`;
    const start=Math.max(0,startAt-160),end=Math.min(text.length,endAt+180);
    const mark=document.createElement('mark');mark.textContent=text.slice(startAt,endAt);
    $('previewText').replaceChildren(document.createTextNode((start?'…':'')+text.slice(start,startAt)),mark,document.createTextNode(text.slice(endAt,end)+(end<text.length?'…':'')));
    $('goPreview').disabled=false;
    [...$('hitList').children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  }
  function listResults() {
    const list=document.createDocumentFragment();
    hits.forEach((h,i)=>{
      const button=document.createElement('button');button.type='button';button.className='hit-item';
      button.setAttribute('aria-label',`预览第 ${i+1} 处：${h.section}`);
      const title=document.createElement('strong');title.textContent=`${i+1}. ${h.section}`;
      const snippet=document.createElement('span');snippet.textContent=(h.contextStart>32?'…':'')+h.context.slice(Math.max(0,h.contextStart-32),Math.min(h.context.length,h.contextEnd+50)).replace(/\s+/g,' ')+(h.contextEnd+50<h.context.length?'…':'');
      button.append(title,snippet);button.onclick=()=>preview(i);list.append(button);
    });
    $('hitList').replaceChildren(list);$('resultsTitle').textContent=`“${query}”的 ${hits.length} 处结果`;
  }
  function find() {
    clear();query=search.value.trim();if(!query)return;
    const selector='h1,h2,h3,p,th,td,pre,li';
    const blocks=[...main.querySelectorAll(selector)].filter(b=>!b.querySelector(selector));
    const total=blocks.reduce((n,b)=>n+b.textContent.length,0);let offset=0,chapter='手册开头',section='手册开头';
    blocks.forEach(block=>{
      const text=block.textContent;
      if(block.tagName==='H2'){chapter=text;section=text;}else if(block.tagName==='H3')section=text;
      let context=text,contextOffset=0;
      if(block.tagName==='TD'||block.tagName==='TH'){
        const cells=[...block.parentElement.children];
        context=cells.map(c=>c.textContent).join(' | ');
        contextOffset=cells.slice(0,cells.indexOf(block)).reduce((n,c)=>n+c.textContent.length+3,0);
      }
      const local=[];let at=0,found;
      // Unicode regex handles case-insensitivity without changing source offsets.
      const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const matcher=new RegExp(escaped,'giu');
      while((found=matcher.exec(text))!==null){
        at=found.index;const h={text,start:at,end:at+found[0].length,context,contextStart:contextOffset+at,contextEnd:contextOffset+at+found[0].length,chapter,section,percent:Math.round((offset+at)/Math.max(1,total)*100),index:hits.length};
        hits.push(h);local.push(h);
      }
      if(local.length){
        const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);const nodes=[];let nodeStart=0;
        while(walker.nextNode()){const node=walker.currentNode;nodes.push({node,start:nodeStart,end:nodeStart+node.data.length});nodeStart+=node.data.length;}
        nodes.forEach(({node,start,end})=>{
          const spans=local.filter(h=>h.start<end&&h.end>start);if(!spans.length)return;
          const fragment=document.createDocumentFragment();let cursor=0;
          spans.forEach(h=>{
            const a=Math.max(h.start,start)-start,b=Math.min(h.end,end)-start;
            fragment.append(node.data.slice(cursor,a));const mark=document.createElement('mark');
            mark.dataset.hit=h.index;mark.tabIndex=-1;mark.textContent=node.data.slice(a,b);fragment.append(mark);cursor=b;
          });fragment.append(node.data.slice(cursor));node.replaceWith(fragment);
        });
      }
      offset+=text.length;
    });
    listResults();if(hits.length)jump(0);else showPosition();
  }
  $('find').onclick=find;
  search.addEventListener('input',clear);
  search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find();}});
  $('previous').onclick=()=>jump((position-1+hits.length)%hits.length);
  $('next').onclick=()=>jump((position+1)%hits.length);
  function jumpNumber(){const value=$('hitNumber').value.trim();if(!/^\d+$/.test(value)){status.textContent=`请输入 1～${hits.length} 的整数编号`;return;}jump(Number(value)-1);}
  $('jump').onclick=jumpNumber;
  $('hitNumber').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();jumpNumber();}});
  $('openResults').onclick=()=>{if(!hits.length)return;preview(position<0?0:position);dialog.showModal();};
  $('closeResults').onclick=()=>dialog.close();
  $('goPreview').onclick=()=>{const i=previewIndex;dialog.close();jump(i);};
  $('print').onclick=()=>window.print();
  main.addEventListener('click',e=>{if(e.target.tagName==='IMG'){const zoom=$('zoom');zoom.querySelector('img').src=e.target.src;zoom.querySelector('img').alt=e.target.alt;zoom.showModal();}});
  $('closeZoom').onclick=()=>$('zoom').close();
  clear();
})();
