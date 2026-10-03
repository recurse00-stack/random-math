"""Conservative, offline project migration. Preview by default; never reads/writes saves.
Python 3 standard library only. The original project must be closed in Studio for apply/restore.
"""
import argparse, base64, hashlib, json, os, stat, sys, uuid
from pathlib import Path

PLUGIN = 'mixing-entropy.random-math/'
VERSION = '3.0.0'
SCHEMA = 1
MAX_FILE = 16 * 1024 * 1024

def sha(data): return hashlib.sha256(data).hexdigest()
def dumps(value): return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
def lit(value): return {'kind':'lit', 'value':value}
def unpack(value, default=None):
    if value is None: return default
    if isinstance(value,dict) and value.get('kind') == 'lit': return value.get('value')
    raise ValueError('dynamic parameter binding retained')

def safe(path, root=None, file=False):
    path = Path(os.path.abspath(path))
    if root is not None:
        try: path.relative_to(root)
        except ValueError: raise ValueError('Path escapes the selected project/report directory')
    for part in [path, *path.parents]:
        if part.exists() or part.is_symlink():
            s=part.lstat()
            if stat.S_ISLNK(s.st_mode) or getattr(s,'st_file_attributes',0) & 0x400:
                raise ValueError('Symbolic links / reparse points are not accepted')
            if part.is_file() and s.st_nlink > 1: raise ValueError('Hardlinked files are not accepted')
    if file and (not path.is_file() or path.stat().st_size > MAX_FILE):
        raise ValueError('Missing or oversized regular file')
    return path

def read(path): return safe(path,file=True).read_bytes()
def read_json(path): return json.loads(read(path).decode('utf-8-sig'))
def scan(root):
    root=safe(root)
    if not root.is_dir() or not (root/'project.json').is_file(): raise ValueError('Select an actual project root with project.json')
    inputs={}
    for name in ['project.json','project.variables.json','extensions.json']:
        p=root/name
        if p.exists(): inputs[name]=read(p)
    chapters=safe(root/'chapters',root)
    if chapters.is_dir():
        for base, dirs, files in os.walk(chapters,followlinks=False):
            for name in dirs: safe(Path(base)/name,root)
            for name in sorted(files):
                if name.endswith('.json'):
                    p=safe(Path(base)/name,root,file=True);inputs[p.relative_to(root).as_posix()]=read(p)
    if len(inputs)>10000: raise ValueError('Project scan exceeds 10000 files')
    return inputs

def variable_types(inputs):
    try: data=json.loads(inputs['project.variables.json'].decode('utf-8-sig'))
    except (KeyError,ValueError): return {}
    return {v['name']:{'bool':'boolean','float':'number','int':'number'}.get(v.get('type'),v.get('type')) for v in data.get('variables',[]) if isinstance(v,dict) and isinstance(v.get('name'),str)}

def convert(method, params, variables):
    # Literal control parameters only. Variable-bound field objects remain byte-equivalent.
    control=lambda k,d=None:unpack(params.get(k),d)
    def outputs(spec):
        names=[]
        for key,types in spec.items():
            name=control(key,'')
            if name:
                if not isinstance(name,str) or variables.get(name) not in types: raise ValueError('Output declaration/type not proven: '+key)
                names.append(name)
        if len(names)!=len(set(names)): raise ValueError('Aliased outputs retained')
    p=dict(params)
    def move(old,new):
        if old in p:
            if new in p: raise ValueError('Conflicting destination parameter: '+new)
            p[new]=p.pop(old)
    if method=='rand': return None,'stable method and defaults retained'
    if method=='calc':
        op=control('op','add')
        if op not in ['sub','mul','div','pow','root','floor','round']: return None,'stable calculation contract retained'
        for k in ['a','b']:
            if k in p and (k=='a' or op in ['sub','mul','div','pow']): move(k,op+k.upper())
        if p==params: return None,'already uses current calculation fields'
        return ('calc',p),'same calculation and return contract; bindings preserved'
    outputs({'successVar':{'boolean'},'errorVar':{'string'}})
    if method=='reset-fixed':
        if not isinstance(control('key',''),str) or not control('key','').strip(): raise ValueError('Fixed record name not proven')
        move('key','resetKey');p['action']=lit('reset');return ('rand',p),'ordinary action ignores boolean return; fixed record identity preserved'
    if method in ['deck-draw','deck-peek','deck-reset']:
        key=control('key','')
        if not isinstance(key,str) or not key.strip() or len(key)>128: raise ValueError('Pool identity is dynamic or invalid')
        if method=='deck-reset':
            move('key','poolId');p['action']=lit('delete');return ('pool-update',p),'delete same slot pool; no result return consumed'
        if method=='deck-peek':
            if control('outVar','') or control('arrayVar',''): raise ValueError('Old report/remaining-array shape retained')
            outputs({'remainingVar':{'number'}});move('key','poolId');move('remainingVar','inspect__remainingVar');p['action']=lit('inspect')
            return ('pool-update',p),'read-only remaining count; old report not used'
        count=control('count',1)
        if type(count) is not int or not 1<=count<=100: raise ValueError('Dynamic/invalid count retained')
        outputs({'outVar':{'number','string'},'reportVar':{'string'},'outIdVar':{'string'},'remainingVar':{'number'}})
        prefix=control('prefix','')
        if prefix:
            if count==1: raise ValueError('Single-draw prefix previously ignored; retained')
            if any(variables.get(f'{prefix}_{i}') not in {'number','string'} for i in range(1,count+1)): raise ValueError('Batch variable declarations not proven')
        for a,b in [('key','poolId'),('reportVar','valuesVar'),('outIdVar','idsVar')]: move(a,b)
        for name in ['poolId','count','outVar','prefix','valuesVar','idsVar','remainingVar']:
            move(name,'draw__'+name)
        p['action']=lit('draw');p['draw__consumption']=lit('immediate')
        return ('draw-without',p),'adopts v1 remaining items/order; old array outputs retained'
    if method=='deck-create': raise ValueError('Creation duplicate-error / fixed-order snapshot contract retained; initialization is idempotent in v3')
    if method in ['rand-pick','rand-pick-number']: raise ValueError('Bound table source / mixed probabilities / per-batch uniqueness need source proof; hidden compatibility retained')
    if method=='preview-pool': raise ValueError('Old probability report contract retained; new inspector is read-only')
    return None,'current or unknown method retained'

def transform(data, variables):
    document=json.loads(data.decode('utf-8-sig'));records=[];changed=0
    def visit(v,path='',inside_if=False):
        nonlocal changed
        if isinstance(v,list):
            for i,w in enumerate(v): visit(w,path+'/'+str(i),inside_if)
        elif isinstance(v,dict):
            here=inside_if or str(v.get('type','')).lower() in ['if','condition','conditional']
            props=v.get('props');target=props.get('target') if isinstance(props,dict) else None
            if v.get('type')=='callExtensionFunction' and isinstance(target,str) and target.startswith(PLUGIN):
                record={'path':path,'nodeId':v.get('id'),'method':target[len(PLUGIN):],'action':'retained'}
                try:
                    if here: raise ValueError('If return/side-effect equivalence not established')
                    raw=props.get('paramsJson','{}');params=json.loads(raw) if isinstance(raw,str) else raw
                    if not isinstance(params,dict): raise ValueError('Unknown parameter format')
                    result,reason=convert(record['method'],params,variables);record['reason']=reason
                    if result:
                        new,p=result;props['target']=PLUGIN+new;props['paramsJson']=json.dumps(p,ensure_ascii=False,separators=(',',':')) if isinstance(raw,str) else p
                        record['action']='converted';record['target']=new;changed+=1
                except (ValueError,TypeError,KeyError) as e: record['reason']=str(e)
                records.append(record)
            for key,w in list(v.items()):
                if key=='paramsJson': continue
                if key=='conditions' and isinstance(w,str):
                    # Inspect serialized If calls without changing their original bytes.
                    try:
                        parsed=json.loads(w);before=len(records);visit(parsed,path+'/'+key,True)
                        if len(records)==before and PLUGIN in w: records.append({'path':path+'/'+key,'action':'retained','reason':'serialized If expression uses legacy method; return contract retained'})
                    except (ValueError,TypeError):
                        if PLUGIN in w: records.append({'path':path+'/'+key,'action':'retained','reason':'unknown serialized condition format'})
                else: visit(w,path+'/'+key,here or key=='conditions')
    visit(document)
    # No-op files are retained byte for byte, including BOM and whitespace.
    if not changed: return data,records
    newline='\r\n' if b'\r\n' in data else '\n'
    result=(json.dumps(document,ensure_ascii=False,indent=2)+'\n').replace('\n',newline).encode('utf-8')
    if data.startswith(b'\xef\xbb\xbf'):result=b'\xef\xbb\xbf'+result
    return result,records

def preview(project):
    root=safe(project);inputs=scan(root);variables=variable_types(inputs);files=[];records=[]
    for name,data in inputs.items():
        if not name.startswith('chapters/'): continue
        new,rows=transform(data,variables);records.extend(dict(row,file=name) for row in rows)
        if new!=data:files.append({'path':name,'beforeSha256':sha(data),'afterSha256':sha(new),'afterBase64':base64.b64encode(new).decode('ascii')})
    return {'schemaVersion':SCHEMA,'targetVersion':VERSION,'project':str(root),'inputs':{n:sha(d) for n,d in inputs.items()},'files':files,'records':records,'converted':sum(r['action']=='converted' for r in records),'retained':sum(r['action']=='retained' for r in records),'saveMigration':'runtime adapter only; save files excluded'}

def exclusive(path,data):
    safe(path);path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())

def replace_checked(path,expected,data):
    safe(path,file=True)
    if sha(read(path))!=expected:raise ValueError('External modification detected: '+str(path))
    temp=path.with_name(path.name+'.random-math-'+uuid.uuid4().hex+'.tmp')
    exclusive(temp,data)
    try:
        if sha(read(path))!=expected:raise ValueError('External modification during write: '+str(path))
        os.replace(temp,path)
    finally:
        if temp.exists():temp.unlink()

def apply(project,plan_file,transaction):
    root=safe(project);plan=read_json(plan_file);current=preview(root)
    # Recompute from current inputs, not from untrusted embedded replacement bytes.
    if plan!=current:raise ValueError('Plan or original files changed; create a new preview')
    tx=safe(transaction)
    if tx.exists():raise ValueError('Transaction directory must be new')
    try:tx.relative_to(root);raise ValueError('Transaction directory must be outside the project')
    except ValueError as e:
        if str(e).startswith('Transaction'):raise
    tx.mkdir(parents=True);receipt={'schemaVersion':SCHEMA,'project':str(root),'status':'prepared','files':[]}
    for f in plan['files']:
        data=read(root/f['path']);backup=f'backup/{len(receipt["files"]):05d}.bin';exclusive(tx/backup,data)
        receipt['files'].append({k:f[k] for k in ['path','beforeSha256','afterSha256']}|{'backup':backup})
    exclusive(tx/'receipt.json',dumps(receipt));done=[]
    try:
        if preview(root)!=plan:raise ValueError('Original inputs changed before commit')
        for f in plan['files']:
            path=safe(root/f['path'],root,file=True);replace_checked(path,f['beforeSha256'],base64.b64decode(f['afterBase64'],validate=True));done.append(f)
        receipt['status']='applied'
    except Exception:
        # Do not overwrite concurrent edits while rolling back already-written files.
        for f in reversed(done):
            r=next(x for x in receipt['files'] if x['path']==f['path'])
            replace_checked(root/f['path'],f['afterSha256'],read(tx/r['backup']))
        receipt['status']='rolled-back';replace_checked(tx/'receipt.json',sha(read(tx/'receipt.json')),dumps(receipt));raise
    replace_checked(tx/'receipt.json',sha(read(tx/'receipt.json')),dumps(receipt));return receipt

def restore(project,transaction):
    root=safe(project);tx=safe(transaction);receipt=read_json(tx/'receipt.json')
    if receipt.get('project')!=str(root) or receipt.get('schemaVersion')!=SCHEMA:raise ValueError('Restore project identity mismatch')
    if receipt.get('status')=='restored':return receipt
    if receipt.get('status')!='applied':raise ValueError('Transaction was not fully applied; inspect prepared backup manually')
    rows=receipt['files'];staged=[]
    for f in rows:
        path=safe(root/f['path'],root,file=True)
        if not f['path'].startswith('chapters/') or path.suffix!='.json':raise ValueError('Invalid restore target')
        backup=safe(tx/f['backup'],tx,file=True);old=read(backup)
        if sha(old)!=f['beforeSha256'] or sha(read(path))!=f['afterSha256']:raise ValueError('Changed current file or invalid backup; restore refused')
        staged.append((path,f,old,read(path)))
    done=[]
    try:
        for path,f,old,new in staged:replace_checked(path,f['afterSha256'],old);done.append((path,f,new))
    except Exception:
        for path,f,new in reversed(done):replace_checked(path,f['beforeSha256'],new)
        raise
    receipt['status']='restored';replace_checked(tx/'receipt.json',sha(read(tx/'receipt.json')),dumps(receipt));return receipt

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('mode',choices=['preview','apply','restore']);p.add_argument('--project',type=Path,required=True);p.add_argument('--plan',type=Path);p.add_argument('--transaction',type=Path);a=p.parse_args()
    if a.mode=='preview':
        result=preview(a.project)
        if a.plan:exclusive(safe(a.plan),dumps(result))
    elif a.mode=='apply':
        if not a.plan or not a.transaction:p.error('apply requires --plan and --transaction')
        result=apply(a.project,a.plan,a.transaction)
    else:
        if not a.transaction:p.error('restore requires --transaction')
        result=restore(a.project,a.transaction)
    print(json.dumps({k:v for k,v in result.items() if k not in ['inputs','files']},ensure_ascii=False,indent=2))
if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,TypeError) as e:print('STOP: '+str(e),file=sys.stderr);sys.exit(2)
