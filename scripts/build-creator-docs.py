"""Build creator HTML and workshop body from docs/USER-GUIDE.md. Requires Python markdown."""
from pathlib import Path
import markdown, re, base64, json
from html import escape
from html.parser import HTMLParser

OUT = Path(__file__).resolve().parent.parent/'docs'
text = (OUT/'USER-GUIDE.md').read_text(encoding='utf-8')
md = markdown.Markdown(extensions=['tables','fenced_code','toc','sane_lists'], extension_configs={'toc':{'toc_depth':'2-3'}})
body = md.convert(text)
def embed(m):
    p=OUT/m.group(1)
    assert p.is_file(), p
    mime='image/jpeg' if p.read_bytes().startswith(b'\xff\xd8') else 'image/png'
    return 'src="data:'+mime+';base64,'+base64.b64encode(p.read_bytes()).decode()+'"'
body=re.sub(r'src="(images/[^\"]+)"',embed,body)
page='''<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>随机与计算系统 · 创作者使用手册</title><style>
:root{color-scheme:light;--ink:#243431;--accent:#176c5b;--line:#dce5df}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:#f5f4ef;font:16px/1.85 "Microsoft YaHei",system-ui,sans-serif}aside{position:fixed;inset:0 auto 0 0;width:280px;background:#163c34;color:#e4f0e9;padding:28px 22px;overflow:auto}aside h2{font-size:20px;margin:0 0 12px}aside p{font-size:13px;color:#b7d2c3}aside a{color:#e4f0e9;text-decoration:none;font-size:13px;display:block;padding:3px 0}aside ul{padding-left:14px;list-style:none}aside>.toc>ul{padding-left:0}aside input{width:100%;padding:11px;border:1px solid #6b9984;border-radius:6px;background:#fafffb;color:#163c34}aside button{padding:8px 12px;margin:8px 4px 8px 0;border:1px solid #8daf9e;border-radius:5px;background:transparent;color:white;cursor:pointer}main{margin-left:280px;max-width:1120px;padding:52px 64px 120px;background:#fffefb;min-height:100vh}h1{font-size:34px;line-height:1.45;letter-spacing:-.8px;margin:0 0 24px}h2{font-size:26px;line-height:1.5;color:#145c4d;border-top:1px solid var(--line);padding-top:35px;margin-top:52px}h3{font-size:20px;margin-top:34px}h1,h2,h3{scroll-margin-top:26px}p{margin:14px 0}strong{font-weight:700}a{color:#176c5b}code{background:#edf3ef;padding:2px 5px;border-radius:4px;font-family:Consolas,"Microsoft YaHei",monospace;overflow-wrap:anywhere}pre{background:#edf3ef;padding:18px 22px;border-left:3px solid #3b8a70;overflow:auto;white-space:pre-wrap;line-height:1.8}pre code{padding:0;background:none}table{border-collapse:collapse;width:100%;font-size:14px;margin:22px 0;table-layout:auto}th,td{border:1px solid var(--line);padding:11px 13px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e7efe9}tr:nth-child(even){background:#f7f9f5}img{display:block;width:100%;height:auto;margin:24px auto 12px;border:1px solid var(--line);border-radius:8px;cursor:zoom-in}li{margin:6px 0}mark{background:#ffe68a;color:#1c362b}#result{min-height:1.8em;font-size:12px}.edition{font-size:12px;color:#6b756f;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:22px}dialog{max-width:96vw;width:1500px;padding:14px;border:1px solid #789;border-radius:8px}dialog::backdrop{background:#000b}dialog img{margin:0;cursor:default}dialog button{float:right;padding:8px 20px;margin-bottom:10px}
@media(max-width:950px){aside{position:static;width:auto;max-height:360px}main{margin:0;padding:30px 20px}h1{font-size:27px}table{font-size:13px}th,td{padding:8px}aside .toc{columns:2}aside .toc ul ul{display:none}}
aside h2{color:#e4f0e9;margin:0 0 12px;padding:0;border:0} @media(max-width:600px){aside .toc{columns:1}main{padding:24px 16px}h1{font-size:25px}th,td{padding:6px}}
@media print{aside,dialog,.edition{display:none!important}main{margin:0;padding:0;max-width:none}body{background:white;font-size:10pt}h1{font-size:23pt}h2{font-size:17pt}h3{font-size:13pt}h2,h3{break-after:avoid}tr,img,pre{break-inside:avoid}table{font-size:9pt}img{max-height:145mm;object-fit:contain}a{color:inherit}mark{background:none}}
'''+(Path(__file__).parent/'creator-search.css').read_text(encoding='utf-8')+'''</style></head><body><aside><h2>随机与计算系统</h2><p>创作者使用手册<br>插件 2.2.1 · 2026-09-26</p><label for="search">查找正文</label><input id="search" type="search" placeholder="例如：输出列、读档、批量"><div class="search-actions"><button id="find">查找</button><button id="previous">上一处</button><button id="next">下一处</button><button id="openResults">结果与预览</button><button id="print">打印</button></div><div class="jump-row"><label for="hitNumber">跳到第几处</label><input id="hitNumber" type="number" min="1" step="1"><button id="jump">跳转</button></div><div id="result" role="status" aria-live="polite"></div>'''+md.toc+'''</aside><main><div class="edition">创作者教程 · 离线阅读版 · 点击截图可放大</div>'''+body+'''</main><dialog id="zoom"><button id="closeZoom">关闭</button><img alt="放大的手册截图"></dialog><dialog id="searchDialog" aria-labelledby="resultsTitle"><header><h2 id="resultsTitle">搜索结果</h2><button id="closeResults">关闭预览</button></header><p class="hint">选择编号先看上下文，点“跳转到正文”再前往。位置百分比表示文中位置。</p><div class="search-layout"><div id="hitList" aria-label="搜索命中列表"></div><section aria-label="命中预览"><h3 id="previewTitle">选择一处查看预览</h3><div id="previewLocation"></div><p id="previewText"></p><button id="goPreview">跳转到正文</button></section></div></dialog><script>'''+(Path(__file__).parent/'creator-search.js').read_text(encoding='utf-8')+'''</script></body></html>'''
(OUT/'creator-guide.html').write_bytes(page.encode('utf-8'))
class Links(HTMLParser):
    def __init__(self):super().__init__();self.ids=[];self.links=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if tag=='a':self.links.append(a.get('href',''))
p=Links();p.feed(page)
assert len(set(p.ids))==len(p.ids)
assert all(x[1:] in p.ids for x in p.links if x.startswith('#'))
assert not re.search(r'(src|href)="https?://',page)
assert len(re.findall(r'^## ',text,re.M))==13
assert all(x in text for x in ['rand-pick-number','deck-create','deck-draw','deck-peek','deck-reset','preview-pool','reset-fixed','calc'])
assert not any(x in text for x in ['.ai-work','npm run','SDK','AGENTS.md','源码关联流程'])
print('Built standalone HTML; 13 chapters; anchors and audience boundaries checked.')
(OUT/'WORKSHOP.md').write_bytes(text.encode('utf-8'))

ai=markdown.markdown((OUT/'AI-GUIDE.md').read_text(encoding='utf-8'),extensions=['tables','fenced_code','toc','sane_lists'])
ai_page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>随机与计算系统 · AI 使用指南</title><style>body{max-width:1100px;margin:auto;padding:32px 20px;font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif;color:#243431;background:#fffefb}h2{margin-top:40px;color:#145c4d}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #ccd8cf;padding:9px;text-align:left;overflow-wrap:anywhere}th,pre{background:#edf3ef}pre{padding:18px;white-space:pre-wrap;overflow-wrap:anywhere}code{overflow-wrap:anywhere}a{color:#176c5b}</style>'+ai+'</html>'
(OUT/'ai-guide.html').write_bytes(ai_page.encode('utf-8'))
print('Built separate AI HTML; search JS/CSS embedded in creator HTML.')

# Generated Skill references share the same maintained AI documentation.
skill_refs = OUT.parent / "skills/letsgal-plugin-random-math/references"
skill_refs.mkdir(parents=True, exist_ok=True)
for name in ["AI-GUIDE.md", "AI-INTEGRATION.md"]:
    (skill_refs / name).write_bytes((OUT / name).read_bytes())
print("Synced standalone Skill reference files from maintained AI docs.")
