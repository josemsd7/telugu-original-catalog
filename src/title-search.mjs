import {normalize} from './identity.mjs';
export const SEARCH_SCHEMA=2;
export function titleAliases(value){
  const full=String(value||'').replace(/\b(?:sub[ -]*inspector)\b/gi,'SI').replace(/\b(?:daughter\s+of)\b/gi,'D/O').replace(/\b(?:son\s+of)\b/gi,'S/O').replace(/\b(?:shri|sri)\b/gi,'Sree').replace(/\s*\((?:telugu|tamil|hindi|malayalam|kannada)(?:\s+version)?\)\s*/gi,' ').replace(/\s*\(20\d{2}\)\s*/g,' ').replace(/\s+/g,' ').trim();
  const main=full.split(/\s*:\s*|\s+[–—-]\s+/)[0].trim();
  return [...new Set([full,full.replace(/\bthe\b/gi,' ').replace(/\s+/g,' ').trim(),main,...[...full.matchAll(/\(([^)]+)\)/g)].map(x=>x[1]),full.replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim(),full.replace(/^the\s+/i,'')].filter(x=>normalize(x).length>=3))];
}
export async function imdbTitleSearch(title,type,fetcher=fetch,accept=()=>true){
  const queries=titleAliases(title).slice(0,2);
  if(!queries.length)return [];
  let hits=[];
  for(const query of queries){
    const key=query.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').trim().replace(/\s+/g,'_');
    if(!key)continue;
    const url=`https://v3.sg.media-imdb.com/suggestion/${encodeURIComponent(key[0])}/${encodeURIComponent(key)}.json`;
    const r=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'TeluguOriginalCatalog/1.1 (public title identity metadata)'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('IMDb title search HTTP '+r.status);
    const data=await r.json();if(!Array.isArray(data.d))throw Error('Invalid IMDb public title search response');
    const kinds=type==='movie'?['movie','tvMovie']:['tvSeries','tvMiniSeries','tvSpecial'];
    hits=data.d.filter(x=>/^tt\d+$/.test(x.id||'')&&kinds.includes(x.qid)).map(x=>({id:x.id,name:x.l,year:x.y?String(x.y):null,poster:x.i?.imageUrl?.replace(/\._V1_[^.]*\.jpg$/, '._V1_SX250.jpg'),cast:String(x.s||'').split(',').map(x=>x.trim()).filter(Boolean),identitySource:'IMDb public title suggestions',identitySourceUrl:url})).filter(accept);
    if(hits.length)break;
  }
  return hits;
}
