import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parallelMap,normalize} from './identity.mjs';
import {titleAliases} from './title-search.mjs';
import {PLATFORM_SOURCES,discoverPlatforms} from './platform-sources.mjs';
export function classifyReleaseRows(rows){
 const official=rows.filter(x=>OFFICIAL_SOURCES.some(s=>s.key===x.sourceKey));
 // Search aliases may drop a subtitle; cross-source identity joins must not.
 // "Drive" must not borrow the cast of "Drive - The Pretenders".
 const names=value=>{const full=titleAliases(value)[0]||String(value||'');return [...new Set([full,full.replace(/\s+garu$/i,'')].map(normalize))];};
 const index=new Map();for(const item of official)for(const name of names(item.title)){const entries=index.get(name)||[];entries.push(item);index.set(name,entries);}
 return rows.map(row=>{
  const variants=names(row.title);
  const candidates=[...new Set(variants.flatMap(name=>index.get(name)||[]))];
  const matches=candidates.filter(x=>x.ottReleaseDate&&x.ottReleaseDate===row.ottReleaseDate||row.ottReleaseDate&&[x.movieYearHint,x.filmReleaseYear,x.metadataYearHint,x.ottReleaseDate?.slice(0,4)].filter(Boolean).some(y=>Number(row.ottReleaseDate.slice(0,4))-Number(y)>=0&&Number(row.ottReleaseDate.slice(0,4))-Number(y)<=1));
  const types=[...new Set(matches.map(x=>x.genreText))];
  const declarations=[...new Set(matches.filter(x=>x.providerOriginalLanguageIds?.length).map(x=>[...x.providerOriginalLanguageIds].sort().join(',')))];
  return types.length===1?{...row,genreText:types[0],castText:[...new Set([row.castText,...matches.map(x=>x.castText)].filter(Boolean))].join(', '),movieYearHint:row.movieYearHint||matches.find(x=>['zee5-official','aha-official'].includes(x.sourceKey)&&x.movieYearHint)?.movieYearHint,classificationSourceUrl:matches[0].sourceUrl,
   providerOriginalLanguageIds:declarations.length===1?declarations[0].split(','):row.providerOriginalLanguageIds,
   providerOriginalLanguageConflict:declarations.length>1,
   providerOriginalLanguageSourceUrl:matches.find(x=>x.providerOriginalLanguageIds?.length)?.sourceUrl||row.providerOriginalLanguageSourceUrl,
   officialMetadataEvidence:matches.map(x=>({name:x.sourceName,url:x.sourceUrl,originalLanguageIds:x.providerOriginalLanguageIds||[]}))}:row;
 });
}
const LEGACY_SOURCES=[{key:'zee5-official',name:'ZEE5 official',url:'https://www.zee5.com/web-series/lang/telugu',pages:['https://www.zee5.com/web-series/lang/telugu','https://www.zee5.com/movies/lang/telugu','https://www.zee5.com/global/collections/trending-originals-on-zee5-in-telugu/0-8-7641']},{key:'aha-official',name:'Aha official',url:'https://www.aha.video/',pages:['https://www.aha.video/','https://www.aha.video/movies','https://www.aha.video/shows']}];
export const OFFICIAL_SOURCES=[...LEGACY_SOURCES,...PLATFORM_SOURCES];
export function parseOfficial(html,kind,url){
  const r=spawnSync('python3',[fileURLToPath(new URL('./official_parser.py',import.meta.url)),kind,url],{input:html,encoding:'utf8',maxBuffer:8*1024*1024});
  if(r.error||r.status!==0)throw Error(String(r.stderr||r.error?.message||'Official metadata parser failed').slice(0,200));return JSON.parse(r.stdout);
}
export async function discoverOfficial(previous={},options={}){
 const now=options.now||Date.now(),checkedAt=new Date(now).toISOString(),fetcher=options.fetcher||fetch,snapshots={},statuses=[],cache={...(previous.officialDetailCache||{})};let fresh=0;
 const platformPromise=discoverPlatforms(previous,options);
 async function page(url){const r=await fetcher(url,{headers:{Accept:'text/html','User-Agent':'TeluguOriginalCatalog/1.1 (public factual catalog metadata)'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return r.text();}
 for(const s of LEGACY_SOURCES){
  const errors=[],old=previous.sourceSnapshots?.[s.key];let rows=[],pagesFetched=0;
  for(const url of s.pages){try{const html=await page(url);pagesFetched++;if(s.key==='zee5-official')rows.push(...parseOfficial(html,'zee5',url).rows);else rows.push(...parseOfficial(html,'aha-list',url).cards);}catch(e){errors.push(url+': '+e.message);}}
  if(s.key==='aha-official'){
   const cards=[...new Map(rows.map(x=>[x.sourceUrl,x])).values()];rows=[];
   if(cards.length>60)errors.push('Public detail fetch capped at 60 titles');
   rows=(await parallelMap(cards.slice(0,60),2,async card=>{try{let d=cache[card.sourceUrl];if(!d||now-Date.parse(d.checkedAt)>6*3600000){d={...parseOfficial(await page(card.sourceUrl),'aha-detail',card.sourceUrl),checkedAt};cache[card.sourceUrl]=d;}return {...d,title:card.title};}catch(e){errors.push(card.title+': '+e.message);return null;}})).filter(Boolean);
  }
  const hasFreshRows=rows.length>0;
  if(hasFreshRows){fresh++;rows=[...new Map([...(old?.rows||[]),...rows].map(x=>[x.sourceUrl,x])).values()];snapshots[s.key]={checkedAt,rows};}
  else if(old?.rows?.length){rows=old.rows;snapshots[s.key]=old;}
  statuses.push({key:s.key,name:s.name,url:s.url,state:hasFreshRows?(errors.length?'partial':'ok'):rows.length?'cached':'unavailable',checkedAt:hasFreshRows?checkedAt:old?.checkedAt||null,attemptedAt:checkedAt,rowCount:rows.length,pagesFetched,errors,coverage:'Only metadata visible in public server-rendered pages; full platform libraries are not guaranteed.'});
  options.onProgress?.(`${s.name}: ${rows.length} public title records; ${errors.length} source limits/errors`);
 }
 const platforms=await platformPromise;
 return {rows:[...Object.values(snapshots).flatMap(x=>x.rows),...platforms.rows],snapshots:{...snapshots,...platforms.snapshots},statuses:[...statuses,...platforms.statuses],cache:{...platforms.cache,...Object.fromEntries(Object.entries(cache).filter(([url])=>!platforms.cache[url]?.platformSchema))},freshSourceCount:fresh+platforms.freshSourceCount};
}
