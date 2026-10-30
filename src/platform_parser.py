"""Public platform metadata only: no player calls, cookies or private APIs."""
import json,re,sys,xml.etree.ElementTree as ET
from urllib.parse import urlparse,urljoin
from ninetyone_parser import tree
from official_parser import walk,docs
from source_parser import parse_date

LANGS={'telugu':'Q8097','tamil':'Q5885','hindi':'Q1568','malayalam':'Q36236','kannada':'Q33673','english':'Q1860','bengali':'Q9610','marathi':'Q1571'}
def key(s):return re.sub(r'[^a-z0-9]','',str(s).lower())
def raw(n):return ''.join(c for c in n.children if isinstance(c,str))
def script_json(root,identifier):
    n=next(root.all(lambda n:n.tag=='script' and n.attrs.get('id')==identifier),None)
    if not n:raise ValueError('Public embedded catalog metadata missing')
    return json.loads(raw(n))
def people(item):
    values=[]
    for field in ['actors','actor','director','directors']:
        people=item.get(field,[]);people=people if isinstance(people,list) else [people]
        values.extend(x['name'] for x in people if isinstance(x,dict) and isinstance(x.get('name'),str))
    return list(dict.fromkeys(values))
def canonical_url(url,kind):
    u=urlparse(url);host=u.hostname or '';p=u.path.rstrip('/')
    patterns={
      'netflix':('www.netflix.com',r'/(?:[a-z]{2}(?:-[a-z]{2})?/)?title/(\d+)'),
      'prime':('www.primevideo.com',r'/(?:[^/]+/)?detail/([A-Za-z0-9.\-]+)'),
      'sony':('www.sonyliv.com',r'/(?:movies|shows)/[^/]+-\d+'),
      'etv':('www.etvwin.com',r'/(?:movies|series)/[^/]+/[A-Za-z0-9]+'),
      'sun':('www.sunnxt.com',r'/(?:telugu-movie|telugu-tv)[^/]*/detail/\d+'),
    }
    expected,pattern=patterns[kind]
    if u.scheme!='https' or host not in [expected,expected.removeprefix('www.')]:return None
    m=re.fullmatch(pattern,p)
    if not m:return None
    if kind=='netflix':p='/in/title/'+m[1]
    return 'https://'+expected+p
def row(title,url,kind,media,year=None,cast=None,day=None,originals=None):
    names={'netflix':'Netflix','prime':'Prime Video','sony':'SonyLIV','etv':'ETV Win','sun':'Sun NXT'}
    return {'title':title,'sourceUrl':url,'sourceKey':kind+'-official','sourceName':names[kind]+' official',
      'genreText':'Movie' if media=='movie' else 'Series','languageText':'Telugu','platforms':[names[kind]],
      'movieYearHint':str(year) if year and media=='movie' else None,'filmReleaseYear':str(year) if year else None,
      'castText':', '.join(cast or []),'ottReleaseDate':day,'tentative':False,'requiresFilmYearForDate':bool(day and media=='movie' and kind in ['etv','sun']),
      'audioEvidence':names[kind]+' public title metadata',
      'providerOriginalLanguageIds':originals or [],'providerOriginalLanguageSourceUrl':url if originals else None}
def netflix_list(html,url):
    cards=[]
    for x in walk(list(docs(tree(html)))):
        u=canonical_url(x.get('url',''),'netflix')
        if u and x.get('name') and x.get('@type') in ['Movie','TVSeries']:
            cards.append({'title':x['name'],'sourceUrl':u,'genreText':'Movie' if x['@type']=='Movie' else 'Series'})
    return {'cards':list({x['sourceUrl']:x for x in cards}.values())}
def netflix_detail(html,url):
    root=tree(html);matches=[x for x in docs(root) if x.get('@type') in ['Movie','TVSeries'] and canonical_url(x.get('url',''),'netflix')==url]
    if len(matches)!=1:raise ValueError('Netflix title identity or media type is ambiguous')
    x=matches[0]
    # Restrict language parsing to the visible Audio section of this title.
    audio=[]
    for n in root.all(lambda n:n.tag in ['div','section']):
        text=' '.join(n.text().split())
        if text.startswith('Audio ') and len(text)<1500:audio.append(text.split('Subtitles',1)[0])
    audio=min(audio,key=len) if audio else ''
    if not re.search(r'\bTelugu\b',audio,re.I):raise ValueError('Netflix public Audio section does not list Telugu')
    originals=list(dict.fromkeys(LANGS[m.lower()] for m in re.findall(r'\b('+ '|'.join(LANGS)+r')\s*(?:-\s*Audio Description\s*)?\[Original\]',audio,re.I)))
    years=[n.text().strip() for n in root.all(lambda n:n.tag in ['span','div','li'] and re.fullmatch(r'(?:19|20)\d{2}',n.text().strip()))]
    year=str(x.get('dateCreated',''))[:4];year=year if re.fullmatch(r'\d{4}',year) else years[0] if years else None
    result=row(x['name'],url,'netflix','movie' if x['@type']=='Movie' else 'series',year,people(x),originals=originals)
    return {'rows':[result]}
def prime_list(html,url):
    d=script_json(tree(html),'dv-web-page-hydration-data');cards=[]
    for x in walk(d.get('init',{})):
        link=x.get('link');link=link.get('url','') if isinstance(link,dict) else ''
        u=canonical_url(urljoin('https://www.primevideo.com',link),'prime')
        if u and x.get('title') and x.get('entityType') in ['Movie','TV Show','TV Season','TVSeries','movie','tvSeason','tvShow']:
            cards.append({'title':x['title'],'sourceUrl':u,'genreText':'Movie' if x['entityType'].lower()=='movie' else 'Series','yearHint':x.get('releaseYear')})
    return {'cards':list({x['sourceUrl']:x for x in cards}.values())}
def prime_detail(html,url):
    d=script_json(tree(html),'dv-web-page-hydration-data');state=d['init']['preparations']['body']['atf']['state']
    if canonical_url(urljoin('https://www.primevideo.com',d['init'].get('path','')),'prime')!=url:raise ValueError('Prime public title URL mismatch')
    titleid=state.get('pageTitleId');headers=state.get('detail',{}).get('headerDetail',{})
    x=headers.get(titleid)
    if not x or not x.get('title'):raise ValueError('Prime public title header missing')
    tracks=' '.join(str(a) for a in x.get('audioTracks',[]))
    if not re.search(r'Telugu|తెలుగు',tracks,re.I):raise ValueError('Prime public audio tracks do not list Telugu')
    cast=[p['name'] for p in x.get('contributors',{}).get('cast',[]) if p.get('name')]
    cast += [p['name'] for p in x.get('contributors',{}).get('directors',[]) if p.get('name')]
    typ=str(x.get('titleType') or x.get('entityType') or '')
    # A season detail page is metadata for a series; its date cannot reset S1.
    media='series' if any('season' in str(k).lower() for k in x) or re.search('season|series|show',typ,re.I) else 'movie'
    result=row(x['title'],url,'prime',media,x.get('releaseYear'),cast)
    return {'rows':[result]}
def sony_rows(html,url):
    root=tree(html);s=next((raw(n) for n in root.all(lambda n:n.tag=='script') if 'window.INITIAL_STATE' in raw(n)),None)
    if not s:raise ValueError('SonyLIV public embedded catalog missing')
    d=json.JSONDecoder().raw_decode(s.split('window.INITIAL_STATE',1)[1].split('=',1)[1].lstrip())[0];rows=[]
    for x in walk(d):
        m=x.get('metadata')
        if not isinstance(m,dict):continue
        typ=m.get('objectSubtype') or m.get('contentSubtype');name=m.get('title');ident=m.get('contentId')
        if typ not in ['MOVIE_BUNDLE','SHOW'] or not name or not ident:continue
        emf=m.get('emfAttributes',{});audio=emf.get('audio_languages','')
        if m.get('language')!='TEL' and 'TEL' not in audio.split(','):continue
        slug=next((n.attrs['href'] for n in root.all(lambda n:n.tag=='a' and re.search(r'/(movies|shows)/[^/]+-'+str(ident)+r'(?:\?|$)',n.attrs.get('href','')))),None)
        if not slug and str(ident) in url:slug=url
        if not slug:continue
        u=canonical_url(urljoin('https://www.sonyliv.com',slug),'sony')
        if not u:continue
        cast=[]
        for field in ['cast','actors','directors']:
            value=emf.get(field) or m.get(field) or ''
            if isinstance(value,str):cast.extend(v.strip() for v in value.split(',') if v.strip())
        rows.append(row(name,u,'sony','movie' if typ=='MOVIE_BUNDLE' else 'series',m.get('year'),cast))
    return {'rows':list({x['sourceUrl']:x for x in rows}.values())}
def sitemap(html,url,kind):
    root=ET.fromstring(html);cards=[];maps=[]
    for x in root:
        values={c.tag.split('}')[-1]:c.text for c in x};u=values.get('loc','')
        if x.tag.endswith('sitemap'):
            if urlparse(u).hostname==urlparse(url).hostname:maps.append(u)
            continue
        safe=canonical_url(u,kind)
        if not safe:continue
        path=urlparse(safe).path
        if kind=='sun':
            if re.search(r'-(?:teaser|trailer|promo|song|clip|review|making)(?:-|/)',path):continue
            m=re.search(r'/telugu-(movie|tv)[^-]*-(.*?)(?:-(20\d{2}))?/detail/',path)
            if not m:continue
            title=m[2].replace('-',' ');year=m[3];media='Movie' if m[1]=='movie' else 'Series'
        else:title=path.split('/')[2].replace('-',' ');year=None;media='Movie' if '/movies/' in path else 'Series'
        cards.append({'title':title,'sourceUrl':safe,'genreText':media,'yearHint':year,'modifiedAt':values.get('lastmod')})
    return {'cards':cards,'sitemaps':maps}
def etv_detail(html,url):
    root=tree(html);structured=list(docs(root))
    for n in root.all(lambda n:n.tag=='script'):
        s=raw(n);m=re.fullmatch(r'\s*self\.__next_f\.push\((\[.*\])\)\s*;?\s*',s,re.S)
        if not m:continue
        try:
            payload=json.loads(m[1]);text=payload[1]
            if isinstance(text,str) and text.startswith('{'):structured.extend(walk(json.loads(text)))
        except (ValueError,IndexError,TypeError):pass
    expected='Movie' if '/movies/' in url else 'TVSeries'
    matches=[]
    for x in structured:
        if x.get('@type')!=expected or not x.get('name'):continue
        targets=[v for v in walk(x.get('potentialAction',{})) if v.get('@type')=='EntryPoint']
        urls=[x.get('url',''),x.get('@id','')]+[v.get('urlTemplate','').removesuffix('/watch') for v in targets]
        if url in [canonical_url(v,'etv') for v in urls]:matches.append(x)
    matches=list({json.dumps(x,sort_keys=True):x for x in matches}.values())
    if len(matches)!=1:raise ValueError('ETV Win public title schema missing or ambiguous')
    x=matches[0];meta=' '.join(n.attrs.get('content','') for n in root.all(lambda n:n.tag=='meta' and n.attrs.get('name')=='description'))
    if x.get('inLanguage') not in ['te','Telugu','telugu'] and not re.search(r'\bTelugu\b',meta):raise ValueError('ETV Win Telugu label missing')
    day=str(x.get('uploadDate',''))[:10]
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day):day=None
    # ETV also places theatrical dates (including pre-OTT dates) in uploadDate.
    # Only an explicit WatchAction offer can independently establish OTT time.
    availability=[]
    for offer in walk(x.get('potentialAction',{})):
        value=str(offer.get('availabilityStarts',''))[:10]
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}',value):availability.append(value)
    result=row(x['name'],url,'etv','movie' if expected=='Movie' else 'series',None,people(x),min(availability) if availability else None)
    result['platformUploadDate']=day
    result['metadataYearHint']=day[:4] if day else None
    return {'rows':[result]}
def sun_detail(html,url):
    root=tree(html);expected='movie' if '/telugu-movie-' in url else 'tvseries'
    matches=[x for x in docs(root) if str(x.get('@type','')).lower()==expected and canonical_url(x.get('url',''),'sun')==url]
    if len(matches)!=1:raise ValueError('Sun NXT full title schema missing or ambiguous')
    x=matches[0];year=re.search(r'-(\d{4})/detail/',url);year=year[1] if year else None;day=None
    trailer=x.get('trailer',{});description=trailer.get('description','')
    m=re.search(r'["“]([^"”]+)["”]\s+is streaming on Sun NXT from\s+(.+?)(?:\.|$)',description,re.I)
    if m and key(m[1])==key(x['name']):day=parse_date(re.sub(r'(\d)(st|nd|rd|th)\b',r'\1',m[2]))
    return {'rows':[row(x['name'],url,'sun','movie' if expected=='movie' else 'series',year,people(x),day)]}
def parse(html,kind,url):
    return {'netflix-list':netflix_list,'netflix-detail':netflix_detail,'prime-list':prime_list,'prime-detail':prime_detail,'sony':sony_rows,'etv-list':lambda h,u:sitemap(h,u,'etv'),'etv-detail':etv_detail,'sun-list':lambda h,u:sitemap(h,u,'sun'),'sun-detail':sun_detail}[kind](html,url)
if __name__=='__main__':
    try:print(json.dumps(parse(sys.stdin.read(),sys.argv[1],sys.argv[2]),ensure_ascii=False))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
