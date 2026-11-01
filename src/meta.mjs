import {parallelMap} from './identity.mjs';

const SIX_HOURS=6*60*60*1000;
const imdb=id=>/^tt\d+$/.test(id||'');
const text=value=>typeof value==='string'?value.trim():'';
const strings=value=>Array.isArray(value)?[...new Set(value.map(text).filter(Boolean))]:[];
const image=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:undefined;}catch{return undefined;}};
const date=value=>{const d=new Date(value||'');return Number.isFinite(d.getTime())?d.toISOString():undefined;};
const isCurrent=(entry,now)=>entry?.schemaVersion===1&&now-Date.parse(entry.checkedAt)<SIX_HOURS;

// Cinemeta uses both the Stremio episode/released fields and number/firstAired.
// Only factual episode fields are retained. No inline streams are copied: they
// would stop clients from asking the user's stream add-ons for the episode.
export function episodeVideos(id,items=[]){
  if(!imdb(id))throw new Error('Invalid series ID');
  const videos=new Map();
  for(const v of Array.isArray(items)?items:[]){
    const season=v.season,episode=v.episode??v.number;
    if(!Number.isInteger(season)||season<0||!Number.isInteger(episode)||episode<0)continue;
    const videoId=`${id}:${season}:${episode}`;
    if(v.id&&v.id!==videoId)continue;
    const released=date(v.released||v.firstAired);
    const video={id:videoId,title:text(v.title)||text(v.name)||`Episode ${episode}`,season,episode};
    if(released)video.released=released;
    const thumbnail=image(v.thumbnail);if(thumbnail)video.thumbnail=thumbnail;
    if(!videos.has(videoId))videos.set(videoId,video);
  }
  return [...videos.values()].sort((a,b)=>a.season-b.season||a.episode-b.episode);
}

export async function refreshSeriesDetails(previous={},series=[],options={}){
  const now=options.now??Date.now(),checkedAt=new Date(now).toISOString(),fetcher=options.fetcher||fetch;
  const entries={},warnings=[];
  await parallelMap(series,options.concurrency||6,async show=>{
    if(show.type!=='series'||!imdb(show.id))throw new Error('Invalid catalog series');
    const old=previous.entries?.[show.id];
    if(old?.id===show.id&&old.type==='series'&&isCurrent(old,now)){entries[show.id]=old;return;}
    const sourceUrl=`https://v3-cinemeta.strem.io/meta/series/${show.id}.json`;
    try{
      const response=await fetcher(sourceUrl,{headers:{Accept:'application/json','User-Agent':'TeluguOriginalCatalog (public episode metadata; no playback)'},signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(`Episode metadata HTTP ${response.status}`);
      const {meta}=await response.json();
      if(meta?.id!==show.id||meta.type!=='series')throw new Error('Episode metadata identity mismatch');
      const videos=episodeVideos(show.id,meta.videos);
      if(!videos.length&&old?.videos?.length)throw new Error('Episode list temporarily empty');
      entries[show.id]={schemaVersion:1,id:show.id,type:'series',checkedAt,sourceUrl,state:videos.length?'ok':'missing_episodes',videos,cast:strings(meta.cast),director:strings(Array.isArray(meta.director)?meta.director:[meta.director]),releaseInfo:text(meta.releaseInfo),released:date(meta.released),background:image(meta.background),logo:image(meta.logo),imdbRating:text(meta.imdbRating),runtime:text(meta.runtime)};
    }catch(error){
      const message=String(error.message||error);warnings.push(`${show.id}: ${message}`);
      const validOld=old?.schemaVersion===1&&old.id===show.id&&old.type==='series';
      entries[show.id]={...(validOld?old:{schemaVersion:1,id:show.id,type:'series',videos:[]}),sourceUrl,state:validOld?'cached':'unavailable',lastAttemptAt:checkedAt,error:message};
    }
    options.onProgress?.({id:show.id,state:entries[show.id].state,episodes:entries[show.id].videos.length});
  });
  return {schemaVersion:1,checkedAt,entries,warnings};
}

export function titleMetadata(item,cached={},details={}){
  if(!imdb(item.id)||!['movie','series'].includes(item.type)||!text(item.name))throw new Error('Invalid catalog metadata');
  // The current verified catalog owns the displayed name (including corrections
  // to working titles). Optional facts must have the very same IMDb ID/type.
  if(cached.id!==item.id||cached.type!==item.type)cached={};
  if(details.id!==item.id||details.type!==item.type)details={};
  const meta={id:item.id,type:item.type,name:item.name,poster:item.poster,posterShape:'poster',releaseInfo:item.releaseInfo||cached.releaseInfo||cached.year,description:item.description,genres:strings(item.genres),links:item.links||[],cast:strings([...(cached.cast||[]),...(details.cast||[])]),director:strings([...(cached.directors||[]),...(details.director||[])]),language:strings(item.genres).join(', '),country:strings(cached.countries).join(', ')};
  const released=date(item.released||cached.released||details.released);if(released)meta.released=released;
  for(const field of ['background','logo']){const url=image(details[field]);if(url)meta[field]=url;}
  for(const field of ['imdbRating','runtime'])if(text(details[field]))meta[field]=details[field];
  if(item.type==='series')meta.videos=episodeVideos(item.id,details.videos);
  return {meta,cacheMaxAge:600,staleRevalidate:3600};
}
