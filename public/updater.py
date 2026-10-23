"""ORBITAL hourly public-feed collector. No credentials are stored. Secret input is stdin only."""
import sys,json,urllib.request,urllib.error,xml.etree.ElementTree as ET,concurrent.futures,email.utils,datetime,html,re,time
try:
 import termios
 if sys.stdin.isatty():
  attrs=termios.tcgetattr(sys.stdin);attrs[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,attrs)
except (ImportError,OSError):pass
print('Ready for ORBITAL update JSON on stdin (input is hidden).',flush=True)
p=json.loads(sys.stdin.readline());origin=p['url'].rstrip('/');token=p['token']
class SiteRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  if urllib.parse.urlsplit(newurl)[:2]!=urllib.parse.urlsplit(origin)[:2]:raise ValueError('Cross-origin service redirect blocked')
  return super().redirect_request(req,fp,code,msg,headers,newurl)
site_opener=urllib.request.build_opener(SiteRedirect())
def site(path,body=None):
 headers={'OAI-Sites-Authorization':'Bearer '+token,'Accept':'application/json'}
 if body is not None:headers['Content-Type']='application/json'
 req=urllib.request.Request(origin+path,headers=headers,data=None if body is None else json.dumps(body).encode(),method='GET' if body is None else 'POST')
 with site_opener.open(req,timeout=50) as r:return json.load(r)
def clean(s):return re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',html.unescape(s or ''))).strip()
def collect(feed):
 error=''
 for attempt in range(2):
  try:
   req=urllib.request.Request(feed['url'],headers={'User-Agent':'Mozilla/5.0 ORBITAL-Research/2.0','Accept':'application/rss+xml, application/xml, text/xml'})
   with urllib.request.urlopen(req,timeout=18) as r:raw=r.read(1500001)
   if len(raw)>1500000:raise ValueError('feed too large')
   root=ET.fromstring(raw);blocks=root.findall('.//item');items=[]
   if root.tag!='rss' and not blocks:raise ValueError('invalid RSS response')
   for b in blocks[:8]:
    title=clean(b.findtext('title'));link=clean(b.findtext('link'));published=None
    try:published=email.utils.parsedate_to_datetime(b.findtext('pubDate')).astimezone(datetime.timezone.utc).isoformat()
    except (TypeError,ValueError,AttributeError):pass
    if title and link:items.append({'title':title[:350],'url':link[:2000],'publishedAt':published,'source':clean(b.findtext('source')) or feed['name'],'summary':clean(b.findtext('description'))[:330]})
   return {'id':feed['id'],'status':'ok','items':items}
  except Exception as e:
   error=str(e)[:160]
   if attempt==0:time.sleep(1)
 return {'id':feed['id'],'status':'error','error':error}
try:
 manifest=site('/api/update-manifest')
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:sources=list(pool.map(collect,manifest['sources']))
 result=site(manifest['writer'],{'sources':sources});state=site('/api/state');persisted=next((r for r in state['runs'] if r['id']==result.get('runId')),None)
 if not persisted:raise ValueError('Update result was not found on readback')
 print(json.dumps({'runId':result['runId'],'status':result['status'],'added':result['added'],'sources':result['details'],'persisted':True,'signals':len(state['signals']),'finishedAt':result['finishedAt']},ensure_ascii=False),flush=True)
 if result['status']=='failed':sys.exit(2)
except Exception as e:
 print(json.dumps({'status':'error','message':str(e)[:300]},ensure_ascii=False),flush=True);sys.exit(1)
