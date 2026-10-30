import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parallelMap,normalize} from './identity.mjs';
import {titleAliases} from './title-search.mjs';

export const PLATFORM_SOURCES=[
 {key:'netflix-official',name:'Netflix official',platform:'Netflix',kind:'netflix',url:'https://www.netflix.com/in/browse/genre/81404071',pages:['https://www.netflix.com/in/browse/genre/81404071','https://www.netflix.com/in/browse/genre/34399','https://www.netflix.com/in/browse/genre/83'],list:'netflix-list',detail:'netflix-detail',limit:120},
 {key:'prime-official',name:'Prime Video official',platform:'Prime Video',kind:'prime',url:'https://www.primevideo.com/search?phrase=Telugu',pages:['https://www.primevideo.com/search?phrase=Telugu','https://www.primevideo.com/movie'],list:'prime-list',detail:'prime-detail',limit:45},
 {key:'sony-official',name:'SonyLIV official',platform:'SonyLIV',kind:'sony',url:'https://www.sonyliv.com/',pages:['https://www.sonyliv.com/','https://www.sonyliv.com/custompage/movies-399','https://www.sonyliv.com/shows/telugu-1500002590'],list:'sony',limit:0},
 {key:'etv-official',name:'ETV Win official',platform:'ETV Win',kind:'etv',url:'https://www.etvwin.com/sitemap.xml',pages:['https://www.etvwin.com/movies-sitemap.xml','https://www.etvwin.com/series-sitemap.xml'],list:'etv-list',detail:'etv-detail',limit:120},
 {key:'sun-official',name:'Sun NXT official',platform:'Sun NXT',kind:'sun',url:'https://www.sunnxt.com/sitemap.xml',pages:['https://www.sunnxt.com/sitemap/movies.xml','https://www.sunnxt.com/sitemap/tvshows.xml','https://blog.sunnxt.com/feed/','https://blog.sunnxt.com/category/movies/'],list:'sun-list',detail:'sun-detail',limit:100},
 {key:'jiohotstar-official',name:'JioHotstar official',platform:'JioHotstar',kind:'jiohotstar',url:'https://www.hotstar.com/in',pages:['https://www.hotstar.com/in'],limit:0},
];
export function parsePlatform(html,kind,url){
 const r=spawnSync('python3',[fileURLToPath(new URL('./platform_parser.py',import.meta.url)),kind,url],{input:html,encoding:'utf8',maxBuffer:12*1024*1024});
 if(r.error||r.status!==0)throw Error(String(r.stderr||r.error?.message||'Public platform metadata missing').trim().slice(0,220));
 return JSON.parse(r.stdout);
}
const variants=title=>new Set(titleAliases(title).map(normalize));
export async function discoverPlatforms(previous={},options={}){
 const now=options.now||Date.now(),checkedAt=new Date(now).toISOString(),fetcher=options.fetcher||fetch;
 const cache={...(previous.officialDetailCache||{})},snapshots={},statuses=[];let freshSourceCount=0;
 const base=Object.values(previous.sourceSnapshots||{}).flatMap(x=>x.rows||[]).filter(x=>x.ottReleaseDate);
 async function page(url){
  const r=await fetcher(url,{headers:{Accept:'text/html,application/xml;q=0.9','User-Agent':'TeluguOriginalCatalog/1.2 (public factual metadata; no playback)'},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('HTTP '+r.status);return r.text();
 }
 const results=await parallelMap(options.sources||PLATFORM_SOURCES,3,async source=>{
  const old=previous.sourceSnapshots?.[source.key],errors=[];let cards=[],rows=[],pagesFetched=0;
  for(const url of source.pages){
   try{
    const html=await page(url);pagesFetched++;
    if(source.kind==='jiohotstar'){
     // Do not call authenticated app APIs or manufacture a country/session.
     throw Error(/Disney Bundle|disneyplus\.com|hulu\.com/i.test(html)?'India catalog unavailable from this server region; returned the Disney Bundle page. Publisher JioHotstar listings remain active.':'No public India title metadata in the returned page; publisher JioHotstar listings remain active.');
    }
    const data=parsePlatform(html,url.startsWith('https://blog.sunnxt.com/')?'sun-blog':source.list,url);cards.push(...(data.cards||[]).map(card=>({...card,curated:source.kind==='netflix'&&url.includes('/81404071')||source.kind==='prime'&&url.includes('/search?phrase=Telugu')})));rows.push(...data.rows||[]);
    if(source.kind==='sun'&&data.sitemaps?.length){
     // Recent TV sitemap partitions, not player or episode endpoints.
     for(const part of data.sitemaps.slice(-2))try{const extra=parsePlatform(await page(part),source.list,part);pagesFetched++;cards.push(...extra.cards||[]);}catch(e){errors.push('TV sitemap: '+e.message);}
    }
   }catch(e){errors.push(url+': '+e.message);}
  }
  const byUrl=new Map();for(const card of cards){const old=byUrl.get(card.sourceUrl);byUrl.set(card.sourceUrl,{...card,curated:card.curated||old?.curated});}cards=[...byUrl.values()];
  const discoveredCardCount=cards.length;
  const recent=base.filter(x=>x.platforms?.includes(source.platform)&&x.ottReleaseDate>=String(Number(new Date(now).getUTCFullYear())-1)+'-01-01');
  const recentNames=new Map();for(const item of recent)for(const name of variants(item.title))if(item.ottReleaseDate>(recentNames.get(name)||''))recentNames.set(name,item.ottReleaseDate);
  const matchedDate=card=>[...variants(card.title)].map(n=>recentNames.get(n)).filter(Boolean).sort().at(-1);
  cards=cards.map(card=>({...card,matchedDate:matchedDate(card)}));
  if(['netflix','prime'].includes(source.kind))cards=cards.filter(card=>card.curated||card.matchedDate);
  const priority=card=>card.matchedDate?'2'+card.matchedDate:card.yearHint&&Number(card.yearHint)>=new Date(now).getUTCFullYear()-1?'1'+card.yearHint:'0'+(card.modifiedAt||'');
  cards=cards.map(card=>({...card,priority:priority(card)})).sort((a,b)=>b.priority.localeCompare(a.priority)||String(b.sourceUrl).localeCompare(a.sourceUrl));
  const recentDate=new Date(now-14*86400000).toISOString().slice(0,10);
  const ttlFor=(cached,card)=>card?.matchedDate>=recentDate?6*3600000:cached?.error?(/does not list Telugu|Telugu label missing/.test(cached.error)?7*86400000:6*3600000):cached?.rows?.some(x=>x.ottReleaseDate&&x.ottReleaseDate>=recentDate)?6*3600000:7*86400000;
  const needsRefresh=card=>{const cached=cache[card.sourceUrl];return cached?.platformSchema!==1||now-Date.parse(cached.checkedAt)>=ttlFor(cached,card);};
  const pending=cards.filter(needsRefresh);
  if(source.limit&&pending.length>source.limit)errors.push(`Public detail scan capped at ${source.limit} of ${pending.length} new/expired titles this refresh; fresh cached records are reused and remaining titles are scanned on later refreshes.`);
  if(source.detail){
   rows.push(...cards.filter(card=>!needsRefresh(card)).flatMap(card=>cache[card.sourceUrl]?.rows||[]));
   const details=await parallelMap(pending.slice(0,source.limit),3,async card=>{
    let cached=cache[card.sourceUrl];
    const ttl=ttlFor(cached,card);
    if(cached?.platformSchema!==1||now-Date.parse(cached.checkedAt)>=ttl){
     try{cached={...parsePlatform(await page(card.sourceUrl),source.detail,card.sourceUrl),checkedAt,platformSchema:1};}
     catch(e){cached={error:e.message,checkedAt,platformSchema:1};}
     cache[card.sourceUrl]=cached;
    }
    if(cached.error){errors.push(card.title+': '+cached.error);return [];}
    return cached.rows||[];
   });rows.push(...details.flat());
  }
  const fresh=rows.length>0;
  if(fresh)rows=[...new Map([...(old?.rows||[]),...rows].map(x=>[x.sourceUrl+'|'+(x.platformTitleUrl||''),x])).values()];
  else rows=old?.rows||[];
  const snapshot=rows.length?{checkedAt:fresh?checkedAt:old.checkedAt,rows}:null;
  const status={key:source.key,name:source.name,url:source.url,state:fresh?(errors.length?'partial':'ok'):rows.length?'cached':'unavailable',checkedAt:fresh?checkedAt:old?.checkedAt||null,attemptedAt:checkedAt,rowCount:rows.length,discoveredCardCount,pagesFetched,detailLimit:source.limit,detailPagesDue:pending.length,detailPagesScheduled:source.detail?Math.min(pending.length,source.limit):0,errors,coverage:'Public title pages and sitemaps only. Film years, sitemap modification dates, license dates and generic trailer upload dates are not treated as OTT release dates. Fresh cached records do not consume the new-page scan budget. Complete platform coverage is not guaranteed.'};
  options.onProgress?.(`${source.name}: ${rows.length} public metadata records; ${discoveredCardCount} discovered cards; ${errors.length} limits/errors`);
  return {source,status,snapshot,fresh};
 });
 for(const result of results){statuses.push(result.status);if(result.snapshot)snapshots[result.source.key]=result.snapshot;if(result.fresh)freshSourceCount++;}
 return {rows:Object.values(snapshots).flatMap(x=>x.rows),snapshots,statuses,cache,freshSourceCount};
}
