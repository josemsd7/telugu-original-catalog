import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {catalog,manifest,status,MOVIE_ID} from './src/core.mjs';
export async function exportStatic(data,destination=new URL('./public/',import.meta.url)){
  if(!data.movies?.length)throw new Error('Refusing to export an empty movie catalog');
  await rm(destination,{recursive:true,force:true});
  const route=`catalog/movie/${MOVIE_ID}`;
  await mkdir(new URL(route+'/',destination),{recursive:true});
  const save=(name,body)=>writeFile(new URL(name,destination),JSON.stringify(body));
  await save('manifest.json',manifest());
  const {stale,...s}=status(data);
  await save('status.json',{...s,staleAfter:new Date(Date.parse(data.checkedAt)+6*3600000).toISOString()});
  await save('coverage.json',{checkedAt:data.checkedAt,datePolicy:data.datePolicy,sources:data.sourceStatus,limits:data.limits,accepted:data.movies.map(({poster,posterCandidates,...facts})=>facts),excluded:data.audit||[]});
  await save(route+'.json',catalog(data));
  for(let skip=0;skip<=Math.ceil(data.movies.length/100)*100;skip+=100)await save(`${route}/skip=${skip}.json`,catalog(data,`skip=${skip}`));
  await writeFile(new URL('.nojekyll',destination),'');
  await writeFile(new URL('index.html',destination),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>Telugu Originals — Latest OTT</title><style>body{font:18px/1.6 system-ui;max-width:720px;margin:4rem auto;padding:0 1.5rem;color:#17242b}button{font:inherit;padding:.7rem 1rem}input{width:95%;padding:.5rem;font:14px monospace}small{display:block;margin:1rem 0;color:#52636b}</style><h1>Telugu Originals — Latest OTT</h1><p>Two separate Stremio catalogs for Telugu original movies and Telugu original series / TV shows.</p><p><b>Movies:</b> newest reported OTT releases first. <b>Series &amp; TV:</b> newest first-season premieres first; later seasons and episode updates do not move older shows up.</p><p>Only released titles with confirmed Telugu as an original language are included. Bilingual productions with Telugu as a confirmed original language qualify. Release eligibility follows India Standard Time. Public source archives are included without a one-year cutoff; older films cannot be promoted as new releases by a later platform listing.</p><button id="install">Install in Stremio</button><p><input id="link" readonly aria-label="Stremio manifest URL"></p><p><a href="status.json">Movie coverage status</a> · <a href="series/status.json">Series coverage status</a> · <a href="coverage.json">Movie evidence</a> · <a href="series/coverage.json">Series evidence</a></p><small>Automatic refreshes at 00:00, 06:00, 12:00 and 18:00 IST; GitHub jobs and Stremio caches can delay visibility. Catalog only. No playback, provider account, debrid service or API key. Publisher metadata may omit titles; unmatched or conflicting identities remain excluded. Regional availability and actual audio tracks are not inspected. Metadata checked: ${data.checkedAt}.</small><script>const u=new URL('manifest.json',location.href);document.getElementById('link').value=u.href;document.getElementById('install').onclick=()=>location.href='stremio://'+u.host+u.pathname;</script></html>`);
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){await exportStatic(JSON.parse(await readFile(new URL('./data/catalog.json',import.meta.url),'utf8')));console.log('Exported movie catalog');}
