import {parallelMap} from './identity.mjs';
import {parse91} from './ninetyone.mjs';
export const NINETYONE_MOVIES={key:'91mobiles-movies',name:'91mobiles movies',url:'https://www.91mobiles.com/entertainment/new-telugu-movies'};
export async function discover91Movies(previous={},options={}){
 const s=NINETYONE_MOVIES,fetcher=options.fetcher||fetch,checkedAt=new Date(options.now||Date.now()).toISOString(),old=previous.sourceSnapshots?.[s.key],errors=[];
 const url=n=>'https://www.91mobiles.com/entertainment/web/list_ajax.php?'+new URLSearchParams({qp:'contentTypes:movie~languages:65',sortOrder:'desc',sortBy:'ottReleaseDate',start:String(n),seoSlug:'/entertainment/new-telugu-movies',pType:'new-telugu-movies',dubbedVal:'notDubbed',type:n?'loadmore':'filter'});
 async function request(u){const r=await fetcher(u,{headers:{Accept:'application/json,text/html;q=0.9','User-Agent':'TeluguOriginalCatalog/1.1 (factual release metadata)'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return r;}
 try{
  let first,p,htmlFallback=false;
  try{first=await(await request(url(0))).json();p=parse91(first.response,'movie-list');}catch(e){p=parse91(await(await request(s.url)).text(),'movie-list');first={total_records:p.totalRecords};htmlFallback=true;errors.push('Pagination unavailable: '+e.message);}
  const available=Math.ceil(Number(first.total_records||p.totalRecords)/24),pages=Math.min(40,available||1);
  if(available>40)errors.push('Pagination capped at the newest 40 pages; older archives are outside the scanned pages.');
  let pagesFetched=1;
  const rest=await parallelMap(Array.from({length:htmlFallback?0:pages-1},(_,i)=>i+1),2,async n=>{try{const d=await(await request(url(n))).json();const rows=parse91(d.response,'movie-list').rows;pagesFetched++;return rows;}catch(e){errors.push(`Page ${n+1}: ${e.message}`);return [];}});
  const rows=[...new Map([...(old?.rows||[]),...p.rows,...rest.flat()].map(x=>[x.sourceUrl+'|'+x.ottReleaseDate,x])).values()];
  if(!rows.length)throw Error('No dated public OTT movie cards');
  const snapshot={checkedAt,rows};options.onProgress?.(`91mobiles movies: ${rows.length} dated movie cards`);
  return {rows,snapshot,fresh:true,status:{...s,state:errors.length?'partial':'ok',checkedAt,rowCount:rows.length,pagesFetched,pagesAvailable:available,errors}};
 }catch(e){const rows=old?.rows||[];return {rows,snapshot:old,fresh:false,status:{...s,state:rows.length?'cached':'unavailable',checkedAt:old?.checkedAt||null,rowCount:rows.length,errors:[e.message]}};}
}
