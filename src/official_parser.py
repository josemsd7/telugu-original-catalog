"""Factual public listing data embedded by streaming platforms in their HTML."""
import json,re,sys
from urllib.parse import urljoin,urlparse
from ninetyone_parser import tree,objects

def docs(root):
    for n in root.all(lambda n:n.tag=='script' and n.attrs.get('type')=='application/ld+json'):
        try:yield from objects(json.loads(''.join(c for c in n.children if isinstance(c,str))))
        except ValueError:pass
def walk(value):
    if isinstance(value,dict):
        yield value
        for x in value.values():yield from walk(x)
    elif isinstance(value,list):
        for x in value:yield from walk(x)
def parse_zee(html,url):
    root=tree(html);n=next(root.all(lambda n:n.attrs.get('id')=='__NEXT_DATA__'),None)
    if not n:raise ValueError('ZEE5 public listing data missing')
    data=json.loads(''.join(c for c in n.children if isinstance(c,str)));byid={}
    for x in walk(data.get('props',{}).get('pageProps',{})):
        kind=x.get('assetType',x.get('asset_type'));slug=x.get('slug','');key=x.get('id')
        if kind not in (0,6) or not key or not x.get('title') or not re.fullmatch(r'(?:movies|web-series|tv-shows)/details/[^/?#]+/'+re.escape(key),slug):continue
        audio=x.get('audioLanguages',x.get('audio_languages',x.get('languages',[])))
        if 'te' not in audio:continue
        day=str(x.get('releaseDate',x.get('release_date','')))[:10]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day):continue
        tags=' '.join(str(v) for v in x.get('tags',[]))
        original=bool(re.search(r'\b(?:Z\s+Telugu\s+Original|Telugu\s+(?:Z5\s+|ZEE5\s+)?Original)',tags,re.I))
        cast=[str(v).split(':')[0].strip() for v in x.get('actors',[])]+[str(v) for v in x.get('directors',[])]
        row={'title':x['title'].strip(),'ottReleaseDate':day if kind==6 else None,'filmReleaseDate':day if kind==0 else None,'movieYearHint':day[:4] if kind==0 else None,'genreText':'Series' if kind==6 else 'Movie','languageText':'Direct Telugu' if original else 'Telugu','platforms':['ZEE5'],'castText':', '.join(cast),'sourceUrl':urljoin('https://www.zee5.com/',slug),'sourceName':'ZEE5 official','sourceKey':'zee5-official','audioEvidence':'ZEE5 embedded audio-language field','publisherLanguageEvidence':'ZEE5 explicit Telugu Original tags' if original else None,'tentative':False}
        if kind==6:row['firstSeasonReleaseDate']=day
        old=byid.get(key)
        if old:
            row['castText']=', '.join(dict.fromkeys([v for v in [old['castText'],row['castText']] if v]))
            if old['languageText']=='Direct Telugu':row['languageText']=old['languageText'];row['publisherLanguageEvidence']=old.get('publisherLanguageEvidence')
        byid[key]=row
    if not byid:raise ValueError('No dated Telugu movie/series records in ZEE5 public listing')
    return {'rows':list(byid.values()),'coverage':'Public server-rendered listing records only; not the complete ZEE5 library.'}
def parse_aha_list(html,url):
    root=tree(html);found={}
    for x in walk(list(docs(root))):
        u=x.get('url')
        if isinstance(u,str) and re.fullmatch(r'https://www\.aha\.video/(?:movie|webseries)/[^/?#]+',u) and x.get('name'):found[u]={'title':x['name'],'sourceUrl':u}
    for a in root.all(lambda n:n.tag=='a' and n.attrs.get('href')):
        u=urljoin('https://www.aha.video',a.attrs['href'])
        if re.fullmatch(r'https://www\.aha\.video/(?:movie|webseries)/[^/?#]+',u) and a.text():found.setdefault(u,{'title':a.text(),'sourceUrl':u})
    if not found:raise ValueError('Aha public listing links missing')
    return {'cards':list(found.values())}
def parse_aha_detail(html,url):
    candidates=[x for x in docs(tree(html)) if x.get('@type')=='VideoObject' and x.get('contentUrl')==url]
    if len(candidates)!=1:raise ValueError('Aha detail identity is missing or ambiguous')
    x=candidates[0];action=x.get('potentialAction',{});offer=action.get('expectsAcceptanceOf',{})
    day=str(offer.get('availabilityStarts',''))[:10]
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day):raise ValueError('Aha dated streaming availability missing')
    if not re.search(r'\bTelugu\b',x.get('name','')+' '+x.get('description',''),re.I):raise ValueError('Aha Telugu language evidence missing')
    cast=[p['name'] for key in ['actor','director'] for p in x.get(key,[]) if isinstance(p,dict) and p.get('name')]
    return {'ottReleaseDate':day,'genreText':'Series' if '/webseries/' in url else 'Movie','languageText':'Telugu','platforms':['Aha'],'castText':', '.join(cast),'sourceUrl':url,'sourceName':'Aha official','sourceKey':'aha-official','audioEvidence':'Aha title language description and dated WatchAction offer','tentative':False}
if __name__=='__main__':
    try:print(json.dumps({'zee5':parse_zee,'aha-list':parse_aha_list,'aha-detail':parse_aha_detail}[sys.argv[1]](sys.stdin.read(),sys.argv[2]),ensure_ascii=False))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
