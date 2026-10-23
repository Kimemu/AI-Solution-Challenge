"""One-request Site service HTTP client. Secret input is stdin only; output redacts credentials."""
import sys,json,urllib.request,urllib.error
try:
 import termios
 if sys.stdin.isatty():
  a=termios.tcgetattr(sys.stdin);a[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,a)
except (ImportError,OSError):pass
print('Ready for Site service JSON on stdin (input is hidden).',flush=True)
p=json.loads(sys.stdin.readline());url=p['url'].rstrip('/')+p.get('path','/api/state');headers={'OAI-Sites-Authorization':'Bearer '+p['token'],'Accept':'application/json'};body=None
if p.get('method','GET')!='GET':headers['Content-Type']='application/json';body=json.dumps(p.get('body',{})).encode()
try:
 with urllib.request.urlopen(urllib.request.Request(url,data=body,headers=headers,method=p.get('method','GET')),timeout=60) as r:
  data=r.read().decode();obj=json.loads(data)
  if p.get('summary') and 'signals' in obj:
   obj={'signals':len(obj['signals']),'news':sum(s.get('kind')=='news' for s in obj['signals']),'records':len(obj['records']),'runs':obj['runs'][:1],'serverAt':obj.get('serverAt'),'schedule':[r for r in obj['records'] if r['kind']=='schedule']}
  print(json.dumps({'status':r.status,'data':obj},ensure_ascii=False),flush=True)
except urllib.error.HTTPError as e:print(json.dumps({'status':e.code,'error':e.read().decode()[:2000]},ensure_ascii=False));sys.exit(1)
