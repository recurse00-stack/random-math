import base64, copy, importlib.util, json, os, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('migration',Path(__file__).resolve().parents[1]/'scripts/migrate-project.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Migration(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.root=self.base/'project';(self.root/'chapters').mkdir(parents=True)
  self.vars={'ok':'bool','error':'string','result':'string','values':'string','ids':'string','left':'number'}
  (self.root/'project.json').write_bytes(m.dumps({'extensionStorageVersion':1,'unknown':{'keep':True}}));(self.root/'project.variables.json').write_bytes(m.dumps({'version':2,'variables':[{'name':n,'type':t} for n,t in self.vars.items()]}));self.file=self.root/'chapters/main.json';self.file.write_bytes(m.dumps({'nodes':[]}))
 def tearDown(self):self.tmp.cleanup()
 def node(self,method,**params):return {'id':'stable-id','type':'callExtensionFunction','unknown':{'a':1},'props':{'target':m.PLUGIN+method,'extra':'keep','paramsJson':json.dumps({k:m.lit(v) for k,v in params.items()})}}
 def put(self,nodes):self.file.write_bytes(m.dumps({'nodes':nodes,'futureField':[1,2]}))
 def plan(self):p=m.preview(self.root);f=self.base/'plan.json';m.exclusive(f,m.dumps(p));return f,p
 def test_draw_mapping(self):
  self.put([self.node('deck-draw',key='bag',count=2,reportVar='values',outIdVar='ids',remainingVar='left',successVar='ok',errorVar='error',future='preserve')]);f,p=self.plan();self.assertEqual(p['converted'],1);new=json.loads(base64.b64decode(p['files'][0]['afterBase64']));n=new['nodes'][0];v=json.loads(n['props']['paramsJson']);self.assertEqual(v['draw__valuesVar'],m.lit('values'));self.assertEqual(v['future'],m.lit('preserve'));self.assertEqual(n['id'],'stable-id');self.assertEqual(n['unknown'],{'a':1})
 def test_apply_restore_idempotence(self):
  self.put([self.node('deck-reset',key='bag')]);old=self.file.read_bytes();f,p=self.plan();tx=self.base/'transaction';m.apply(self.root,f,tx);self.assertEqual(m.preview(self.root)['converted'],0);m.restore(self.root,tx);self.assertEqual(self.file.read_bytes(),old);m.restore(self.root,tx)
 def test_original_change_stops(self):
  self.put([self.node('deck-reset',key='bag')]);f,p=self.plan();self.file.write_bytes(self.file.read_bytes()+b' ')
  with self.assertRaises(ValueError):m.apply(self.root,f,self.base/'tx')
 def test_variable_change_stops(self):
  self.put([self.node('deck-reset',key='bag')]);f,p=self.plan();(self.root/'project.variables.json').write_bytes(m.dumps({'variables':[]}))
  with self.assertRaises(ValueError):m.apply(self.root,f,self.base/'tx')
 def test_forged_plan_rejected(self):
  self.put([self.node('deck-reset',key='bag')]);f,p=self.plan();p['files'][0]['path']='../outside.json';f.write_bytes(m.dumps(p))
  with self.assertRaises(ValueError):m.apply(self.root,f,self.base/'tx')
 def test_restore_external_change_refused(self):
  self.put([self.node('deck-reset',key='bag')]);f,p=self.plan();tx=self.base/'tx';m.apply(self.root,f,tx);self.file.write_bytes(self.file.read_bytes()+b' ')
  with self.assertRaises(ValueError):m.restore(self.root,tx)
 def test_if_keeps_return_contract(self):
  n=self.node('reset-fixed',key='a');self.put([{'type':'if','props':{'conditions':json.dumps([n])}}, {'type':'if','children':[n]}]);p=m.preview(self.root);self.assertEqual(p['converted'],0);self.assertEqual(p['retained'],2)
 def test_dynamic_count_preserved(self):
  n=self.node('deck-draw',key='bag');v={'key':m.lit('bag'),'count':{'kind':'var','name':'N'}};n['props']['paramsJson']=json.dumps(v);self.put([n]);self.assertEqual(m.preview(self.root)['converted'],0)
 def test_unknown_bytes_noop(self):
  self.file.write_bytes(b'\xef\xbb\xbf{ "unknown": true }\r\n');self.assertEqual(m.preview(self.root)['files'],[])
 def test_creation_and_old_table_retained(self):
  self.put([self.node('deck-create',key='b'),self.node('rand-pick',pool='a'),self.node('rand-pick-number',pool='a')]);p=m.preview(self.root);self.assertEqual(p['retained'],3);self.assertEqual(p['converted'],0)
 def test_calculation_binding_preserved(self):
  n=self.node('calc',op='sub');n['props']['paramsJson']=json.dumps({'op':m.lit('sub'),'a':{'kind':'var','variableId':'x'},'b':m.lit(2)});self.put([n]);p=m.preview(self.root);v=json.loads(json.loads(base64.b64decode(p['files'][0]['afterBase64']))['nodes'][0]['props']['paramsJson']);self.assertEqual(v['subA'],{'kind':'var','variableId':'x'})
 def test_fixed_reset(self):
  self.put([self.node('reset-fixed',key='value:dice',successVar='ok')]);self.assertEqual(m.preview(self.root)['converted'],1)
 def test_remaining_only(self):
  self.put([self.node('deck-peek',key='bag',remainingVar='left'),self.node('deck-peek',key='bag',outVar='result')]);p=m.preview(self.root);self.assertEqual(p['converted'],1);self.assertEqual(p['retained'],1)
 def test_missing_output_decl(self):
  self.put([self.node('deck-draw',key='bag',reportVar='missing')]);self.assertEqual(m.preview(self.root)['converted'],0)
 def test_hardlink_refused(self):
  os.link(self.file,self.base/'linked.json')
  with self.assertRaises(ValueError):m.preview(self.root)
 def test_path_escape(self):
  with self.assertRaises(ValueError):m.safe(self.root/'../outside',self.root)
 def test_second_file_fault_rolls_back(self):
  self.put([self.node('deck-reset',key='bag')]);second=self.root/'chapters/second.json';second.write_bytes(self.file.read_bytes());old=self.file.read_bytes();f,p=self.plan();original=m.replace_checked;calls=0
  def fault(path,expected,data):
   nonlocal calls
   if path.parent==self.root/'chapters':
    calls+=1
    if calls==2:raise OSError('injected')
   return original(path,expected,data)
  m.replace_checked=fault
  try:
   with self.assertRaises(OSError):m.apply(self.root,f,self.base/'tx')
  finally:m.replace_checked=original
  self.assertEqual(self.file.read_bytes(),old);self.assertEqual(second.read_bytes(),old)
 def test_save_files_untouched(self):
  (self.root/'saves').mkdir();s=self.root/'saves/one.json';s.write_bytes(b'private-save');self.put([self.node('deck-reset',key='bag')]);f,p=self.plan();m.apply(self.root,f,self.base/'tx');self.assertEqual(s.read_bytes(),b'private-save')
if __name__=='__main__':unittest.main(verbosity=2)
