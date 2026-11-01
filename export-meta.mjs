import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {manifest} from './src/core.mjs';
import {titleMetadata} from './src/meta.mjs';

export async function exportMetadata(movies,series,details={},destination=new URL('./public/',import.meta.url)){
  const summary={movies:0,series:0,seriesWithEpisodes:0,episodeCount:0,missingEpisodeIds:[],cachedEpisodeIds:[]};
  for(const [type,rows,cache] of [['movie',movies.movies,movies.sourceMetadataCache],['series',series.series,series.metadataCache]]){
    const folder=new URL(`meta/${type}/`,destination);await mkdir(folder,{recursive:true});
    // Reuse the completed catalog's hosted posters instead of sending Nuvio
    // back to an external image service. Read all pages, including page two+.
    const posters=new Map();
    for(let skip=0;skip<(rows||[]).length;skip+=100){
      const id=type==='movie'?'telugu-original-movies':'telugu-original-series';
      const page=JSON.parse(await readFile(new URL(`catalog/${type}/${id}/skip=${skip}.json`,destination),'utf8'));
      for(const item of page.metas)posters.set(item.id,item.poster);
    }
    for(const item of rows||[]){
      if(item.type!==type)throw new Error('Metadata content type mismatch');
      const payload=titleMetadata({...item,poster:posters.get(item.id)||item.poster},cache?.[item.id],details.entries?.[item.id]);
      await writeFile(new URL(`${item.id}.json`,folder),JSON.stringify(payload));
      summary[type==='movie'?'movies':'series']++;
      if(type==='series'){
        const count=payload.meta.videos.length;summary.episodeCount+=count;
        if(count)summary.seriesWithEpisodes++;else summary.missingEpisodeIds.push(item.id);
        if(details.entries?.[item.id]?.state==='cached')summary.cachedEpisodeIds.push(item.id);
      }
    }
  }
  if(!summary.movies||!summary.series)throw new Error('Refusing to export incomplete metadata catalogs');
  // Keep the IMDb prefix stable: clients cache manifests, and newly discovered
  // catalog entries must work without reinstalling the add-on every refresh.
  await writeFile(new URL('manifest.json',destination),JSON.stringify(manifest()));
  await writeFile(new URL('meta/status.json',destination),JSON.stringify({...summary,checkedAt:details.checkedAt||null,source:'https://v3-cinemeta.strem.io',warnings:details.warnings||[],limits:['Series episode lists depend on public Cinemeta metadata. Missing episodes are never invented. Previous successful episode lists survive temporary source failures.','This add-on provides catalog and metadata resources. Playback is supplied by the user’s separate stream add-ons.']}));
  return summary;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const [movies,series,details]=await Promise.all(['catalog.json','series.json','series-details.json'].map(async name=>JSON.parse(await readFile(new URL('./data/'+name,import.meta.url),'utf8'))));
  console.log(JSON.stringify(await exportMetadata(movies,series,details)));
}
