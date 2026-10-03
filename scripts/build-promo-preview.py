"""Render the maintained channel Markdown as portable, image-embedded previews."""
from pathlib import Path
import base64
import html
import re
import markdown

ROOT = Path(__file__).resolve().parent.parent
CSS = '''
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#eef2f3;color:#223139;font:17px/1.85 system-ui,"Microsoft YaHei",sans-serif}header{background:#101e2a;color:#edf5f3;padding:18px max(24px,calc((100vw - 1060px)/2));font-size:14px;letter-spacing:.05em}main{max-width:1120px;margin:32px auto;background:white;padding:52px 60px;border:1px solid #d9e2e3;border-radius:12px}h1{font-size:36px;line-height:1.3;margin-top:0;color:#142b38}h2{margin-top:48px;padding-bottom:10px;border-bottom:1px solid #d9e5e3;color:#194d50;font-size:26px}h3{font-size:20px;margin-top:28px}a{color:#176d69;text-underline-offset:4px}img{max-width:100%;height:auto;display:block;border-radius:8px;margin:24px auto}table{width:100%;border-collapse:collapse;font-size:15px;margin:24px 0}th,td{padding:12px;border:1px solid #d9e3e3;text-align:left;vertical-align:top}th{background:#eef6f3}code{background:#eff3f4;padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}li{margin:10px 0}p{overflow-wrap:anywhere}main>p:first-of-type{font-size:21px;color:#366661}footer{text-align:center;padding:0 20px 32px;color:#63747b;font-size:13px}@media(max-width:700px){main{margin:0;padding:26px 18px;border:0;border-radius:0}h1{font-size:29px}h2{font-size:23px}table{font-size:13px}td,th{padding:7px}header{padding:14px 18px}}@media print{body{background:white}header,footer{display:none}main{margin:0;border:0;padding:0}h2,h3{break-after:avoid}img{max-height:85vh;object-fit:contain}tr{break-inside:avoid}}
'''

def render(source, output, label):
    body = markdown.markdown(source.read_text('utf-8'), extensions=['tables', 'fenced_code', 'sane_lists'])
    def image(match):
        name = html.unescape(match.group(1))
        path = (source.parent / name).resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError('Image outside project')
        raw = path.read_bytes()
        mime = 'image/png' if raw.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg'
        return 'src="data:' + mime + ';base64,' + base64.b64encode(raw).decode() + '"'
    body = re.sub(r'src="([^"]+)"', image, body)
    if source.parent == ROOT:
        body = re.sub(r'href="docs/([^"]+)"', r'href="\1"', body)
        body = re.sub(r'href="(skills/[^"]+|RELEASE-NOTES.md)"', r'href="../\1"', body)
    for target in re.findall(r'href="([^"]+)"', body):
        if not (output.parent / html.unescape(target).split('#')[0]).is_file():
            raise ValueError('Missing link: ' + target)
    document = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>抽选与数学增强 · '+label+'</title><style>'+CSS+'</style></head><body><header>抽选与数学增强 / 3.0.0 · '+label+'</header><main>'+body+'</main><footer>混合熵 · 抽选与数学增强</footer></body></html>'
    output.write_bytes(document.encode('utf-8'))

if __name__ == '__main__':
    render(ROOT/'README.md', ROOT/'docs/readme-preview.html', 'README 产品介绍')
    render(ROOT/'docs/WORKSHOP.md', ROOT/'docs/workshop-preview.html', '工坊产品介绍')
    print('Built two responsive previews with embedded original images and checked links.')
