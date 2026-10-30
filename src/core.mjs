import {RELEASE_TIME_ZONE} from './release-time.mjs';
import {VERSION,newestFirst} from './identity.mjs';
import {SERIES_ID} from './series-core.mjs';
export {VERSION,LANGUAGES,normalize,jsonFetch,parallelMap,wikiQuery,wikiRecords,releaseDate,newestFirst} from './identity.mjs';
export {refreshFromOtt as refresh} from './source-refresh.mjs';
export const MOVIE_ID='telugu-original-movies';
export function manifest(){
  return {id:'org.josemsd7.telugu.original.catalog',version:VERSION,name:'Telugu Originals — Latest OTT',description:'Two catalogs for confirmed Telugu original movies and Telugu original series/TV shows. Movies sort by earliest reported OTT release; series sort by first-season premiere, newest first. India release dates. Catalog only.',resources:['catalog'],types:['movie','series'],catalogs:[{type:'movie',id:MOVIE_ID,name:'Telugu Originals — Movies',extra:[{name:'skip'}]},{type:'series',id:SERIES_ID,name:'Telugu Originals — Series & TV',extra:[{name:'skip'}]}],behaviorHints:{configurable:false}};
}
export function catalog(data,extra=''){
  if(extra.length>2000)throw new Error('Invalid parameters');
  const params=new URLSearchParams(extra.includes('=')?extra:decodeURIComponent(extra)),skip=params.get('skip')||'0';
  if(!/^\d{1,6}$/.test(skip))throw new Error('Invalid skip');
  return {metas:newestFirst(data.movies||[]).filter(x=>x.type==='movie').slice(Number(skip),Number(skip)+100).map(x=>({id:x.id,type:'movie',name:x.name,poster:x.poster,posterShape:'poster',releaseInfo:x.releaseInfo,released:x.released,description:x.description,genres:x.genres,links:x.links})),cacheMaxAge:600,staleRevalidate:3600};
}
export function status(data){
  const platformCounts={};for(const m of data.movies||[])for(const p of m.platforms||[])platformCounts[p]=(platformCounts[p]||0)+1;
  return {version:VERSION,releaseTimeZone:RELEASE_TIME_ZONE,checkedAt:data.checkedAt||null,stale:!data.checkedAt||Date.now()-Date.parse(data.checkedAt)>6*3600000,verifiedMovieCount:data.movies?.length||0,datePolicy:data.datePolicy,coverageWindowStart:data.coverageWindowStart,sources:data.sourceStatus||[],platformCounts,exclusions:data.counts||{},refreshWarnings:data.refreshWarnings||[],limits:data.limits||[]};
}
