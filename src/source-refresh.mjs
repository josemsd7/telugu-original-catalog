import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {VERSION,LANGUAGES,normalize,parallelMap,wikiQuery,wikiRecords,releaseDate,newestFirst} from './identity.mjs';
import {discoverSources,SOURCE_URL,SOURCE_NAME,SOURCES} from './discovery.mjs';
import {confirmedRelease,confirmedIdentity,supersededRelease} from './confirmed-films.mjs';
import {enrichProviderRows} from './provider-facts.mjs';
import {indiaDate,RELEASE_TIME_ZONE} from './release-time.mjs';
import {titleAliases,imdbTitleSearch,SEARCH_SCHEMA,withTitleAliases} from './title-search.mjs';
import {discoverOfficial,OFFICIAL_SOURCES,classifyReleaseRows} from './official-sources.mjs';
import {discover91Movies,NINETYONE_MOVIES} from './movie-discovery.mjs';

export {SOURCE_URL};
const SIX_HOURS=6*3600000,WEEK=7*86400000;
const LANGUAGE_IDS={tamil:'Q5885',hindi:'Q1568',malayalam:'Q36236',kannada:'Q33673',marathi:'Q1571',bengali:'Q9610',punjabi:'Q5146',odia:'Q33810',english:'Q1860'};
const UA='TeluguOriginalCatalog/0.4 (personal catalog factual metadata; https://github.com/josemsd7/telugu-original-catalog)';
const year=value=>String(value||'').match(/\d{4}/)?.[0]||null;
const stamp=(value,now,ttl)=>value?.checkedAt&&now-Date.parse(value.checkedAt)<ttl;
const safePoster=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:undefined;}catch{return undefined;}};

export function parseSource(html,kind='ottreleasemovies',referenceDate=indiaDate()) {
  const result=spawnSync('python3',[fileURLToPath(new URL('./source_parser.py',import.meta.url)),kind,referenceDate],{input:html,encoding:'utf8',maxBuffer:4*1024*1024});
  if(result.error||result.status!==0)throw new Error(`Release parser failed: ${String(result.error?.message||result.stderr).slice(0,180)}`);
  const data=JSON.parse(result.stdout);
  if(!Array.isArray(data.rows)||!data.rows.length)throw new Error('Release source returned no rows');
  return data;
}

export function cleanTitle(title) {
  return String(title||'').replace(/\b(?:web\s*series|movie|film)\b/gi,' ').replace(/\([^)]*\b(?:telugu|tamil|hindi|202\d)\b[^)]*\)/gi,' ').replace(/\b(?:season\s*\d+|\d+\s*-?\s*episodes?)\b/gi,' ').replace(/\bIII\b/g,'3').replace(/\bII\b/g,'2').replace(/\s+/g,' ').trim();
}
const titleKey=value=>normalize((titleAliases(cleanTitle(value))[0]||cleanTitle(value)).replace(/&/g,' and ').replace(/\b(?:and|the)\b/gi,' '));
const phonetic=value=>titleKey(value).replace(/h/g,'').replace(/[gk]/g,'k').replace(/[td]/g,'t').replace(/[bp]/g,'p').replace(/[vw]/g,'v').replace(/(.)\1+/g,'$1');
const titleVariants=value=>{
  const full=cleanTitle(value),main=full.replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
  const aliases=[...full.matchAll(/\(([^)]+)\)/g)].map(x=>x[1]).filter(x=>!/^re\s*-?\s*release$/i.test(x)&&/[A-Za-z]{3}/.test(x));
  return [...new Set([...titleAliases(main),...aliases,...titleAliases(full)].filter(Boolean))];
};
export function titleScore(source,title) {
  const sourceVariants=titleVariants(source),targetVariants=titleVariants(title);
  if(sourceVariants.some(x=>targetVariants.some(y=>titleKey(x)===titleKey(y))))return 100;
  if(sourceVariants.some(x=>targetVariants.some(y=>phonetic(x)===phonetic(y))))return 90;
  const prefix=titleVariants(source).filter(x=>titleKey(x).length>=6);
  if(prefix.some(a=>titleVariants(title).some(b=>titleKey(a)===titleKey(b))))return 80;
  const a=titleKey(source),b=titleKey(title);
  if(Math.min(a.length,b.length)>=12&&Math.abs(a.length-b.length)<=2){
    let prior=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prior[j]+1,prior[j-1]+(a[i-1]===b[j-1]?0:1));prior=next;}
    if(prior[b.length]<=2)return 75;
  }
  // Long transliterations can differ in several vowels (Seetharamuni versus
  // Sita Raamuni). These weak matches still need cast or source-year evidence.
  const consonants=value=>phonetic(value).replace(/[aeiou]/g,'');
  if(sourceVariants.some(x=>targetVariants.some(y=>consonants(x).length>=10&&consonants(x)===consonants(y))))return 70;
  return 0;
}
export const metadataTitleScore=(title,meta)=>Math.max(0,...[meta.name,...(meta.aliases||[])].filter(Boolean).map(name=>titleScore(title,name)));

export function sourceReason(row,today) {
  if(!row.ottReleaseDate)return 'missing_ott_date';
  if(row.tentative)return 'tentative_or_subtitles_only';
  if(row.ottReleaseDate>today)return 'upcoming';
  if(/\b(series|season|episodes?|reality|sitcom|show)\b/i.test(row.genreText)||(!/\b(movie|film)\b/i.test(row.genreText)&&/\b(series|season|episodes?|reality|sitcom|show)\b/i.test(row.title)))return 'not_a_movie';
  if(!/telugu/i.test(row.languageText))return 'telugu_audio_not_listed';
  if(/subtitles?/i.test(row.languageText))return 'subtitles_not_audio';
  if(/\b(korean?|koria|chinese|mandarin|japanese|spanish|french|turkish|arabic)\b/i.test(row.languageText))return 'non_indian_language';
  return null;
}

export function languageHint(row) {
  if(/direct\s*telugu|telugu\s*original/i.test(row.languageText))return 'Q8097';
  const match=row.languageText.match(/\b(Tamil|Hindi|Malayalam|Kannada|Marathi|Bengali|Punjabi|Odia|English)\s*(?:to|→|->)\s*Telugu\b/i);
  return match?LANGUAGE_IDS[match[1].toLowerCase()]:null;
}

export function parseMovieFacts(html,tmdbId) {
  if(!/^\d+$/.test(String(tmdbId)))throw new Error('Invalid TMDB movie ID');
  const result=spawnSync('python3',[fileURLToPath(new URL('./tmdb_parser.py',import.meta.url))],{input:html,encoding:'utf8',maxBuffer:1024*1024});
  if(result.error||result.status!==0)throw new Error('Public movie page lacks unambiguous original-language facts');
  const facts=JSON.parse(result.stdout);
  const expected=`https://www.themoviedb.org/movie/${tmdbId}`;
  const canonical=new URL(facts.canonical),pageId=canonical.pathname.match(/^\/movie\/(\d+)(?:-[^/]+)?\/?$/)?.[1];
  if(canonical.origin!=='https://www.themoviedb.org'||canonical.search||canonical.hash||pageId!==String(tmdbId))throw new Error('Original-language movie ID mismatch');
  const ids={...LANGUAGE_IDS,telugu:'Q8097'};
  const languageId=ids[facts.originalLanguage.toLowerCase()];
  if(!languageId)throw new Error('Unrecognized original language');
  const structured=facts.structured;
  const countries=(structured?.countries||[]).map(x=>String(x).trim().toLowerCase());
  let poster;
  try{const image=new URL(structured?.image);if(image.origin==='https://image.tmdb.org'&&/^\/t\/p\/(?:original|w\d+)\/[^/]+$/.test(image.pathname)){image.pathname=image.pathname.replace(/^\/t\/p\/[^/]+\//,'/t/p/w342/');poster=image.href;}}catch{}
  return {title:facts.title,languageIds:[languageId],sourceUrl:expected,countries,poster,schemaVersion:2};
}

function matchingPageTitle(a,b) {
  if(titleScore(a,b)>0)return true;
  // Allow one transliteration vowel in a long title already bound to the same
  // numeric movie ID, for example "Rathiri" versus "Rathri".
  const values=[titleKey(a),titleKey(b)].sort((x,y)=>y.length-x.length),[longer,shorter]=values;
  if(shorter.length<8||longer.length!==shorter.length+1)return false;
  return [...longer].some((letter,i)=>/[aeiou]/.test(letter)&&longer.slice(0,i)+longer.slice(i+1)===shorter);
}

export function assessFilm(row,match,identity,facts) {
  const meta=match.meta;
  const confirmed=confirmedIdentity(row,meta);
  if(confirmed?.ignoredTmdbId&&confirmed.ignoredTmdbId===meta.tmdbId)facts=undefined;
  if(identity?.items.length>1)return {reason:'ambiguous_identity'};
  if(facts&&![meta.name,...(meta.aliases||[])].some(name=>matchingPageTitle(name,facts.title)))return {reason:'original_language_identity_conflict'};
  const countries=meta.countries||[];
  if(countries.length&&!countries.includes('india'))return {reason:'non_indian_film'};
  if(identity?.countries.length&&!identity.countries.includes('Q668'))return {reason:'country_conflict'};
  if(facts?.countries?.length&&!facts.countries.includes('india'))return {reason:'country_conflict'};
  if(identity?.tmdbIds.length&&meta.tmdbId&&!identity.tmdbIds.includes(meta.tmdbId))return {reason:'identity_conflict'};
  if(meta.cast?.length&&row.castText&&match.castMatches===0)return {reason:'cast_mismatch'};
  if(match.titleScore===0)return {reason:'title_mismatch'};
  if(match.titleScore<80&&match.castMatches===0&&!row.movieYearHint)return {reason:'title_variant_uncorroborated'};
  const confirmedLanguages=confirmed?.originalLanguages||[];
  const hint=languageHint(row),wikiLanguages=identity?.languages||[],pageLanguages=facts?.languageIds||[];
  if(wikiLanguages.length&&pageLanguages.some(id=>!wikiLanguages.includes(id)))return {reason:'original_language_conflict'};
  if(confirmedLanguages.length&&[...wikiLanguages,...pageLanguages].some(id=>!confirmedLanguages.includes(id)))return {reason:'original_language_conflict'};
  const languages=wikiLanguages.length?wikiLanguages:pageLanguages.length?pageLanguages:confirmedLanguages;
  if(hint&&languages.length&&!languages.includes(hint))return {reason:'original_language_conflict'};
  const originalLanguages=languages.length?languages:hint?[hint]:[];
  if(!originalLanguages.length)return {reason:'original_language_unconfirmed'};
  if(!originalLanguages.includes('Q8097'))return {reason:'not_original_telugu'};
  return {reason:null,originalLanguages,originalEvidence:wikiLanguages.length?'Wikidata original-language metadata':pageLanguages.length?'TMDB public original-language field':confirmedLanguages.length?confirmed.sourceName:'Publisher explicit original-language label',originalSourceUrl:!wikiLanguages.length?(pageLanguages.length?facts.sourceUrl:confirmed?.sourceUrl):undefined,countryEvidence:countries.includes('india')?'Cinemeta country metadata':identity?.countries.includes('Q668')?'Wikidata country metadata':facts?.countries?.includes('india')?'TMDB public countryOfOrigin field':'Country field unavailable; original Telugu language verified separately',countrySourceUrl:!countries.includes('india')&&!identity?.countries.includes('Q668')?facts?.sourceUrl:undefined};
}

async function response(url,fetcher) {
  const result=await fetcher(url,{headers:{Accept:'application/json,text/html;q=0.9','User-Agent':UA},signal:AbortSignal.timeout(18000)});
  if(!result.ok)throw new Error(`Metadata HTTP ${result.status}`);
  return result;
}

function metadata(m,checkedAt) {
  return {id:m.id,name:String(m.name||'').slice(0,300),type:m.type||'movie',countries:String(m.country||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),year:year(m.releaseInfo||m.year||m.released),released:releaseDate(m.released),poster:safePoster(m.poster),tmdbId:m.moviedb_id?String(m.moviedb_id):null,cast:(m.cast||[]).map(String).slice(0,30),directors:(Array.isArray(m.director)?m.director:[m.director]).filter(Boolean).map(String),checkedAt,schemaVersion:3};
}

export async function refreshFromOtt(previous={},options={}) {
  const fetcher=options.fetcher||fetch,now=options.now||Date.now(),checkedAt=new Date(now).toISOString(),today=indiaDate(now);
  let source=options.source;
  let officialDetailCache=previous.officialDetailCache||{};
  if(!source){
    const results=await Promise.allSettled([discoverSources(previous,{fetcher,now,parsePage:parseSource,onProgress:options.onProgress,allowCachedOnly:true}),discoverOfficial(previous,{fetcher,now,onProgress:options.onProgress}),discover91Movies(previous,{fetcher,now,onProgress:options.onProgress})]);
    const base=results[0].status==='fulfilled'?results[0].value:{rows:[],snapshots:{},statuses:SOURCES.map(s=>({...s,state:'unavailable',error:String(results[0].reason)})),freshSourceCount:0};
    const official=results[1].status==='fulfilled'?results[1].value:{rows:[],snapshots:{},statuses:[],freshSourceCount:0};
    const extra=results[2].status==='fulfilled'?results[2].value:{rows:[],status:{...NINETYONE_MOVIES,state:'unavailable',error:String(results[2].reason)},fresh:false};
    if(!base.freshSourceCount&&!official.freshSourceCount&&!extra.fresh)throw Error('All release sources failed; preserving last successful catalog');
    source={...base,rows:[...base.rows,...official.rows,...extra.rows],snapshots:{...base.snapshots,...official.snapshots,...(extra.snapshot?{[NINETYONE_MOVIES.key]:extra.snapshot}:{})},statuses:[...base.statuses,...official.statuses,extra.status],windowStart:null,historyDays:null};
    source.rows=classifyReleaseRows(source.rows);
    officialDetailCache=official.cache||officialDetailCache;
  }
  if(!Array.isArray(source.rows)||!source.rows.length)throw new Error('Release source empty; preserving last successful catalog');
  const counts={},audit=[],warnings=[];
  const record=(row,reason)=>{counts[reason]=(counts[reason]||0)+1;audit.push({title:row.title,ottReleaseDate:row.ottReleaseDate,platforms:row.platforms,sourceName:row.sourceName||'OTTReleaseMovies',sourceUrl:row.sourceUrl,reason});};
  let eligible=[];
  for(const row of source.rows){const reason=sourceReason(row,today);if(reason)record(row,reason);else eligible.push(row);}
  eligible.sort((a,b)=>b.ottReleaseDate.localeCompare(a.ottReleaseDate)||a.sourceRank-b.sourceRank);
  options.onProgress?.(`Source: ${source.rows.length} release rows; ${eligible.length} candidates after source filters`);
  const searchCache={...(previous.sourceSearchCache||{})},metaCache={...(previous.sourceMetadataCache||{})},identities={...(previous.identities||{})},originalCache={...(previous.sourceOriginalLanguageCache||{})};
  const providerEvidence=await enrichProviderRows(eligible,previous.sourceProviderFactsCache,{fetcher,now,titleScore});
  eligible=providerEvidence.rows;warnings.push(...providerEvidence.warnings);
  const failedMetadata=new Map(),failedSearches=new Map();
  if(!options.retryFailedLookups&&stamp(previous,now,3600000))for(const warning of previous.refreshWarnings||[]){
    const clean=warning.replace(/Cached lookup failure: /g,''),index=clean.lastIndexOf(': ');
    if(index<0)continue;
    const label=clean.slice(0,index),message=clean.slice(index+2);
    if(!/^(Metadata HTTP|The operation|fetch failed)/.test(message))continue;
    if(/^tt\d+$/.test(label))failedMetadata.set(label,message);else failedSearches.set(titleKey(label),message);
  }
  const searchPromises=new Map(),metaPromises=new Map(),confirmedProofs=new Map();
  const recoverKeys=new Set((previous.audit||[]).filter(x=>x.ottReleaseDate>=String(Number(today.slice(0,4))-1)+'-01-01'&&['no_matching_movie_id','title_mismatch','cast_mismatch','older_film_relisted_as_new','original_language_unconfirmed'].includes(x.reason)).map(x=>titleKey(x.title)));
  async function search(row) {
    const key=titleKey(row.title),cached=searchCache[key];
    const recover=recoverKeys.has(key)&&cached?.recoveryVersion!==1;
    const relevant=hit=>!hit.year||(Number(hit.year)<=Number(row.ottReleaseDate.slice(0,4))&&Number(hit.year)>=Number(row.ottReleaseDate.slice(0,4))-1);
    const promiseKey=key+'|'+row.ottReleaseDate.slice(0,4);
    if(!recover&&cached?.schemaVersion===SEARCH_SCHEMA&&stamp(cached,now,cached?.hits.some(relevant)?WEEK:SIX_HOURS)){
      const hits=cached.hits.filter(x=>titleScore(row.title,x.name)>0&&relevant(x)).slice(0,8);
      if(hits.length||cached.hits.length===0)return hits;
      if(cached.checkedYear===row.ottReleaseDate.slice(0,4))return cached.hits.filter(x=>titleScore(row.title,x.name)>0).slice(0,8);
    }
    if(failedSearches.has(key))throw new Error('Cached lookup failure: '+failedSearches.get(key));
    if(!searchPromises.has(promiseKey))searchPromises.set(promiseKey,(async()=>{
      let hits=[];
      const queries=titleVariants(row.title).slice(0,3);
      for(const query of [...new Set(queries)]){
        const url='https://v3-cinemeta.strem.io/catalog/movie/top/search='+encodeURIComponent(query)+'.json';
        const data=await (await response(url,fetcher)).json();
        if(!Array.isArray(data.metas))throw new Error('Invalid movie search response');
        const found=data.metas.filter(x=>/^tt\d+$/.test(x.id||'')&&(!x.type||x.type==='movie')&&titleScore(row.title,x.name)>0).slice(0,8).map(m=>({id:m.id,name:String(m.name||''),year:year(m.releaseInfo),poster:safePoster(m.poster)}));
        hits=[...new Map([...hits,...found].map(x=>[x.id,x])).values()];
        if(hits.some(relevant))break;
      }
      if(recover||!hits.some(relevant))try{hits=[...new Map([...hits,...(await imdbTitleSearch(row.title,'movie',fetcher,hit=>titleScore(row.title,hit.name)>0&&relevant(hit))).filter(x=>titleScore(row.title,x.name)>0)].map(x=>[x.id,x])).values()];}catch(e){warnings.push('IMDb title search: '+row.title+': '+e.message);}
      const merged=[...new Map([...(cached?.hits||[]),...hits].map(x=>[x.id,x])).values()];
      searchCache[key]={hits:[...merged.filter(relevant),...merged.filter(x=>!relevant(x))].slice(0,20),checkedAt,schemaVersion:SEARCH_SCHEMA,checkedYear:row.ottReleaseDate.slice(0,4),recoveryVersion:recover?1:cached?.recoveryVersion};return [...hits.filter(relevant),...hits.filter(x=>!relevant(x))].slice(0,8);
    })());
    return searchPromises.get(promiseKey);
  }
  async function getMeta(hit) {
    const remember=value=>{const result=withTitleAliases({...value,year:hit.identitySource==='IMDb public title suggestions'&&hit.year?hit.year:value.year,cast:[...new Set([...(value.cast||[]),...(hit.cast||[])])],aliases:[...(value.aliases||[]),...(metaCache[hit.id]?.aliases||[])]},hit);metaCache[hit.id]=result;return result;};
    const cached=metaCache[hit.id];if(stamp(cached,now,WEEK))return remember({...cached,name:cached.name||hit.name,year:cached.year||hit.year,poster:hit.identitySource==='IMDb public title suggestions'?(hit.poster||cached.poster):(cached.poster||hit.poster),cast:cached.cast?.length?cached.cast:hit.cast||[]});
    if(failedMetadata.has(hit.id)){
      warnings.push(`Cached lookup failure: ${hit.id}: ${failedMetadata.get(hit.id)}`);
      return remember(cached||{...hit,type:'movie',countries:[],cast:[],directors:[],released:null});
    }
    if(!metaPromises.has(hit.id))metaPromises.set(hit.id,(async()=>{
      try{
        const data=await (await response(`https://v3-cinemeta.strem.io/meta/movie/${hit.id}.json`,fetcher)).json();
        if(!data.meta||data.meta.id!==hit.id)throw new Error('Invalid film identity response');
        const result=metadata({...hit,...data.meta,name:data.meta.name||hit.name,year:data.meta.year||hit.year,poster:data.meta.poster||hit.poster,cast:data.meta.cast?.length?data.meta.cast:hit.cast||[]},checkedAt);metaCache[hit.id]=result;return result;
      }catch(error){
        warnings.push(`${hit.id}: ${String(error.message||error).slice(0,100)}`);
        return cached||{...hit,type:'movie',countries:[],cast:[],directors:[],released:null};
      }
    })());
    return remember(await metaPromises.get(hit.id));
  }
  let done=0;
  const groups=(await parallelMap(eligible,4,async row=>{
    try{
      const confirmed=confirmedRelease(row);
      let found=await search(row);
      if(confirmed?.ignoredTmdbId){
        if(!confirmedProofs.has(confirmed.id))confirmedProofs.set(confirmed.id,imdbTitleSearch(confirmed.title,'movie',fetcher,x=>x.id===confirmed.id));
        const proof=await confirmedProofs.get(confirmed.id);found=[...new Map([...found,...proof].map(x=>[x.id,x])).values()];
      }
      const hits=found.filter(x=>titleScore(row.title,x.name)>0&&(!row.movieYearHint||!x.year||x.year===row.movieYearHint)&&(!confirmed||x.id===confirmed.id)).slice(0,8);
      const matches=[];let staleListing=false;
      for(const hit of hits){
        if(hit.year&&Number(row.ottReleaseDate.slice(0,4))-Number(hit.year)>1){staleListing=true;continue;}
        if(hit.year&&Number(hit.year)>Number(row.ottReleaseDate.slice(0,4)))continue;
        const meta=await getMeta(hit);
        if(confirmed&&!confirmedIdentity(row,meta))continue;
        if(meta.type!=='movie'||(meta.year&&Number(meta.year)>Number(row.ottReleaseDate.slice(0,4)))||(row.movieYearHint&&meta.year&&row.movieYearHint!==meta.year))continue;
        if(meta.year&&Number(row.ottReleaseDate.slice(0,4))-Number(meta.year)>1){staleListing=true;continue;}
        const castText=normalize(row.castText),castMatches=[...(meta.cast||[]),...(meta.directors||[])].filter(x=>normalize(x).length>=4&&castText.includes(normalize(x))).length;
        const score=metadataTitleScore(row.title,meta);
        matches.push({row,meta,titleScore:score,castMatches,score:score+Math.min(castMatches,4)*15});
      }
      matches.sort((a,b)=>b.score-a.score);
      if(!matches.length){record(row,staleListing?'older_film_relisted_as_new':'no_matching_movie_id');return null;}
      return matches;
    }catch(error){warnings.push(`${row.title}: ${String(error.message||error).slice(0,100)}`);record(row,'movie_lookup_failed');return null;}
    finally{done++;if(done%25===0)options.onProgress?.(`Matched ${done}/${eligible.length} source candidates`);}
  })).filter(Boolean);
  const resolved=groups.flat();
  const ids=[...new Set(resolved.map(x=>x.meta.id))];
  const pending=ids.filter(id=>!stamp(identities[id],now,identities[id]?.languages.length?WEEK:SIX_HOURS));
  const batches=[];for(let i=0;i<pending.length;i+=70)batches.push(pending.slice(i,i+70));
  await parallelMap(batches,2,async batch=>{
    try{
      const data=await (await response('https://query.wikidata.org/sparql?'+new URLSearchParams({query:wikiQuery(batch),format:'json'}),fetcher)).json();
      if(!Array.isArray(data.results?.bindings))throw new Error('Invalid original-language response');
      const found=wikiRecords(data.results.bindings,checkedAt);
      for(const id of batch)identities[id]=found[id]||{items:[],names:[],languages:[],countries:[],tmdbIds:[],years:[],checkedAt};
    }catch(error){warnings.push('Original-language lookup: '+String(error.message||error).slice(0,120));}
  });
  // Public facts fill missing original-language or country fields for matched
  // film IDs. Confirmed non-Telugu originals remain excluded.
  const needFacts=new Map();
  for(const match of resolved){
    const {meta,row}=match,identity=identities[meta.id],reason=assessFilm(row,match,identity).reason;
    const needsCountry=!meta.countries?.includes('india')&&!identity?.countries.includes('Q668');
    if(((!identity?.languages.length&&!confirmedIdentity(row,meta))||needsCountry)&&/^\d+$/.test(meta.tmdbId||'')&&(!reason||reason==='original_language_unconfirmed'||reason==='indian_origin_unconfirmed'))needFacts.set(meta.tmdbId,{meta,needsCountry});
  }
  let checkedOriginalCount=0;
  await parallelMap([...needFacts.keys()],2,async id=>{
    try{
      const needsCountry=needFacts.get(id).needsCountry,cached=originalCache[id];
      if(stamp(cached,now,needsCountry&&!cached?.countries?.length?SIX_HOURS:WEEK)&&(!needsCountry||cached.schemaVersion===2))return;
      const html=await (await response(`https://www.themoviedb.org/movie/${id}?language=en-US`,fetcher)).text();
      originalCache[id]={...parseMovieFacts(html,id),checkedAt};
    }catch(error){warnings.push(`TMDB ${id}: ${String(error.message||error).slice(0,100)}`);}
    finally{checkedOriginalCount++;if(checkedOriginalCount%25===0)options.onProgress?.(`Original-language checks ${checkedOriginalCount}/${needFacts.size}`);}
  });
  options.onProgress?.(`Checked original-language fallback for ${needFacts.size} Indian films`);
  const selected=[];
  for(const matches of groups){
    const assessed=matches.map(match=>({match,result:assessFilm(match.row,match,identities[match.meta.id],originalCache[match.meta.tmdbId])}));
    const valid=assessed.filter(x=>!x.result.reason).map(x=>x.match).sort((a,b)=>b.score-a.score);
    if(!valid.length){record(matches[0].row,assessed[0].result.reason);continue;}
    if(valid[1]?.score===valid[0].score){record(matches[0].row,'ambiguous_movie_match');continue;}
    selected.push(valid[0]);
  }
  const byId=new Map(),dateCorrections=new Map();let acceptedListingCount=0;
  for(const match of selected){
    const {row,meta}=match,assessment=assessFilm(row,match,identities[meta.id],originalCache[meta.tmdbId]);
    if(assessment.reason){record(row,assessment.reason);continue;}
    const superseded=supersededRelease(row,meta);
    if(superseded){record(row,'superseded_ott_announcement');dateCorrections.set(meta.id,{...superseded,supersededListingUrl:row.sourceUrl});continue;}
    acceptedListingCount++;
    const languages=assessment.originalLanguages.map(x=>LANGUAGES[x]||'Other');
    const correction=confirmedIdentity(row,meta);
    const pagePoster=correction?.ignoredTmdbId&&correction.ignoredTmdbId===meta.tmdbId?null:originalCache[meta.tmdbId]?.poster;
    const posters=[...new Set([meta.poster,`https://images.metahub.space/poster/small/${meta.id}/img`,pagePoster].filter(Boolean))];
    const listing={sourceName:row.sourceName||'OTTReleaseMovies',sourceUrl:row.sourceUrl,title:row.title,ottReleaseDate:row.ottReleaseDate,platforms:row.platforms,providerUrl:row.providerUrl,dateYearInferred:row.dateYearInferred,castEvidenceUrl:row.castEvidenceUrl};
    const old=byId.get(meta.id);
    if(old){
      old.platforms=[...new Set([...old.platforms,...row.platforms])];
      const existingListing=old.releaseListings.find(x=>x.sourceUrl===listing.sourceUrl&&x.ottReleaseDate===listing.ottReleaseDate&&x.title===listing.title);
      if(existingListing)existingListing.platforms=[...new Set([...existingListing.platforms,...listing.platforms])];
      else old.releaseListings.push(listing);
      if(row.ottReleaseDate<old.ottReleaseDate)old.ottReleaseDate=row.ottReleaseDate;
      continue;
    }
    byId.set(meta.id,{id:meta.id,type:'movie',name:cleanTitle(row.title),canonicalName:meta.name,poster:posters[0],posterCandidates:posters,releaseInfo:meta.year||undefined,released:meta.released||undefined,genres:languages,
      description:'',releaseListings:[listing],countryEvidence:assessment.countryEvidence,countrySourceUrl:assessment.countrySourceUrl,
      links:[{name:'OTT release source',category:'Source',url:row.sourceUrl},...(assessment.originalSourceUrl?[{name:'Original language',category:'Source',url:assessment.originalSourceUrl}]:[])],ottReleaseDate:row.ottReleaseDate,platforms:row.platforms,sourceTitle:row.title,sourceUrl:row.sourceUrl,originalLanguageIds:assessment.originalLanguages,originalLanguageEvidence:assessment.originalEvidence,originalLanguageSourceUrl:assessment.originalSourceUrl,sourceRank:row.sourceRank});
  }
  for(const movie of byId.values()){
    const dateCorrection=dateCorrections.get(movie.id);
    if(dateCorrection)movie.releaseDateCorrections=[dateCorrection];
    movie.sourceNames=[...new Set(movie.releaseListings.map(x=>x.sourceName))];
    movie.releaseDateConflicts=movie.platforms.flatMap(platform=>{
      const entries=movie.releaseListings.filter(x=>x.platforms.includes(platform)),dates=[...new Set(entries.map(x=>x.ottReleaseDate))].sort();
      return dates.length>1?[{platform,dates}]:[];
    });
    movie.description=`Earliest Telugu OTT date reported by these sources: ${movie.ottReleaseDate}${movie.platforms.length?' — '+movie.platforms.join(', '):''}. Original language: ${movie.genres.join(', ')}. Telugu audio is reported by ${movie.sourceNames.join(', ')}; audio tracks and regional availability are not independently checked.${movie.releaseDateConflicts.length?' Some sources report different dates; see the release source links.':''}`;
    const sources=[...new Map(movie.releaseListings.map(x=>[x.sourceUrl,x])).values()];
    movie.links=[...sources.map(x=>({name:x.sourceName,category:'OTT release source',url:x.sourceUrl})),...(movie.originalLanguageSourceUrl?[{name:'Original language',category:'Source',url:movie.originalLanguageSourceUrl}]:[])];
    if(dateCorrection)movie.links.push({name:dateCorrection.sourceName,category:'Confirmed OTT date',url:dateCorrection.sourceUrl},{name:'Postponement announcement',category:'Release date correction',url:dateCorrection.postponementSourceUrl});
    for(const url of new Set(movie.releaseListings.map(x=>x.castEvidenceUrl).filter(Boolean)))if(!movie.links.some(x=>x.url===url))movie.links.push({name:'Platform title details',category:'Identity source',url});
    if(movie.countrySourceUrl&&!movie.links.some(x=>x.url===movie.countrySourceUrl))movie.links.push({name:'Country of origin',category:'Source',url:movie.countrySourceUrl});
  }
  const movies=newestFirst([...byId.values()]);
  if(!movies.length)throw new Error('No verified films from release source; preserving the last successful catalog');
  const keep=new Set(ids),searchKeys=new Set(eligible.map(x=>titleKey(x.title)));
  return {version:VERSION,checkedAt,releaseTimeZone:RELEASE_TIME_ZONE,movies,candidateCount:eligible.length,sourceRowCount:source.rows.length,sourceName:SOURCE_NAME+' + ZEE5 official + Aha official + 91mobiles movies',sourceUrl:SOURCE_URL,sourceUrls:[...SOURCES,...OFFICIAL_SOURCES,NINETYONE_MOVIES].map(x=>x.url),sortOrder:'source_ott_release_date_desc',datePolicy:'earliest_reported_telugu_ott_date',acceptedListingCount,duplicatesMerged:acceptedListingCount-movies.length,releaseDateConflictCount:movies.filter(x=>x.releaseDateConflicts.length).length,sourceStatus:(source.statuses||[]).map(x=>({...x,movieCount:movies.filter(m=>m.sourceNames.includes(x.name)).length})),sourceSnapshots:source.snapshots||previous.sourceSnapshots||{},coverageWindowStart:source.windowStart||null,coverageHistoryDays:source.historyDays||null,counts,refreshWarnings:warnings,audit,
    officialDetailCache,sourceProviderFactsCache:providerEvidence.cache,sourceSearchCache:Object.fromEntries(Object.entries(searchCache).filter(([k])=>searchKeys.has(k))),sourceMetadataCache:Object.fromEntries(Object.entries(metaCache).filter(([id])=>keep.has(id))),identities:Object.fromEntries(Object.entries(identities).filter(([id])=>keep.has(id))),sourceOriginalLanguageCache:Object.fromEntries(Object.entries(originalCache).filter(([id])=>needFacts.has(id))),
    limits:['Release evidence combines publisher tables, 91mobiles movie cards, and public ZEE5/Aha metadata. Actual audio tracks and regional subscriptions are not inspected.','Discovery uses the accessible source archives with bounded pagination; there is no one-year release cutoff. Future and tentative dates, series, non-Telugu originals and non-Indian films are excluded.','Duplicate film IDs are merged. Sorting uses the earliest reported Telugu OTT date across accepted listings; conflicting platform dates remain visible in coverage data.','Original language uses Wikidata or the matching TMDB public movie page; an explicit publisher original-language label is the final fallback. Telugu must be a confirmed original language. Unknown or conflicting originals are excluded.','Film identities use Cinemeta, IMDb public suggestions, cast where listed, country consistency and year checks. Older-film relistings more than one calendar year after the film year are excluded from new-release dates. Unmatched or ambiguous titles remain excluded and are reported in coverage data.','A failed source uses its last successful recent snapshot while other sources update. If all release sources fail, publication stops and the previous deployment is preserved.','SV Telugu OTT returned HTTP 403 to automated requests during validation and is not an active source. Combined coverage is not a guarantee of every platform or every Telugu original.']};
}


