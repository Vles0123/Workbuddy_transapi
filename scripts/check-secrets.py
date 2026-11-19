#!/usr/bin/env python3
"""Scan the publishable tree and history. Findings never print matched values."""
import argparse, json, re, subprocess
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--private-source',action='append',default=[],help='Optional LOCAL runtime directory; values are never printed')
args=parser.parse_args();root=Path(__file__).resolve().parents[1]
patterns={
 'github-token':r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b',
 'provider-key':r'\bsk-(?:proj-|ant-api\d\d-)?[A-Za-z0-9_-]{24,}\b',
 'workbuddy-local-key':r'\bwb-local-[a-fA-F0-9]{64}\b',
 'private-key':r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
 'jwt':r'\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b',
 'aws-access-key':r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
 'credential-url':r'https?://[^\s/"\']+:[^\s/@"\']+@',
 'literal-credential':r'(?i)["\']?(?:access_?token|refresh_?token|api[_-]?key|password|client[_-]?secret)["\']?\s*[:=]\s*["\'][A-Za-z0-9_./+=-]{24,}["\']',
 'local-user-path':r'/Users/' + r'(?!YOUR_USERNAME(?:/|\b)|you(?:/|\b)|username(?:/|\b))[^\s/"\']+/',
}
compiled={k:re.compile(v) for k,v in patterns.items()};known=set()
def collect(x):
 if isinstance(x,dict):
  for k,v in x.items():
   if re.search(r'token|secret|password|api.?key|uid|nickname|email',k,re.I) and isinstance(v,str) and len(v)>12:known.add(v)
   collect(v)
 elif isinstance(x,list):
  for v in x:collect(v)
for directory in args.private_source:
 base=Path(directory)
 for p in base.rglob('*'):
  if not p.is_file() or p.is_symlink() or p.stat().st_size>2_000_000:continue
  if p.name not in ['api-key','additional-api-keys.json'] and p.suffix!='.info':continue
  try:
   text=p.read_text()
   if p.name=='api-key':known.add(text.strip())
   obj=json.loads(text);collect(obj)
   if p.name=='additional-api-keys.json':known.update(v for v in obj if isinstance(v,str) and len(v)>8)
  except (UnicodeError,ValueError):pass
findings=[]
def scan(label,raw):
 text=raw.decode('utf-8',errors='replace')
 for rule,pattern in compiled.items():
  for m in pattern.finditer(text):findings.append({'file':label,'line':text.count('\n',0,m.start())+1,'rule':rule})
 for value in known:
  if value and value in text:findings.append({'file':label,'rule':'known-private-value'})
if (root/'.git').exists():
 files=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
else:
 files=[str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and not any(part in ['runtime','data','node_modules','.git'] for part in p.relative_to(root).parts)]
for name in filter(None,files):
 p=root/name
 if p.is_file():scan(name,p.read_bytes())
try:
 objects=subprocess.check_output(['git','rev-list','--objects','--all'],cwd=root,stderr=subprocess.DEVNULL).decode().splitlines()
 for obj in objects:
  sha,_,name=obj.partition(' ')
  if subprocess.check_output(['git','cat-file','-t',sha],cwd=root).strip()==b'blob':scan('history:'+name,subprocess.check_output(['git','cat-file','blob',sha],cwd=root))
except subprocess.CalledProcessError:pass
print(json.dumps({'files_checked':len(list(filter(None,files))),'private_values_compared':len(known),'findings':findings},indent=2,ensure_ascii=False))
raise SystemExit(bool(findings))
