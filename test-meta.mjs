import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {episodeVideos,refreshSeriesDetails,titleMetadata} from './src/meta.mjs';
import {manifest,MOVIE_ID} from './src/core.mjs';
import {exportStatic} from './export.mjs';
import {exportSeries} from './export-series.mjs';
import {exportMetadata} from './export-meta.mjs';

test('metadata is declared, keeps current verified titles and IMDb movie playback identity',()=>{
  const id='tt28629017',resource=manifest().resources.find(x=>x.name==='meta');
  assert.deepEqual(resource,{name:'meta',types:['movie','series'],idPrefixes:['tt']});
  assert.ok('tt99999999'.startsWith(resource.idPrefixes[0]),'Future catalog entries must work with a cached manifest');
  const item={id,type:'movie',name:'Mana Shankara Vara Prasad Garu',releaseInfo:'2026',genres:['Telugu'],ottReleaseDate:'2026-02-11'};
  const {meta}=titleMetadata(item,{id,type:'movie',name:'Mega 157',cast:['Chiranjeevi'],year:'2026',released:'2026-01-12'});
  assert.equal(meta.name,item.name);assert.equal(meta.id,id);assert.equal(meta.released,'2026-01-12T00:00:00.000Z');assert.deepEqual(meta.cast,['Chiranjeevi']);
  assert.equal(meta.videos,undefined);assert.equal(meta.streams,undefined);
  assert.deepEqual(titleMetadata(item,{id:'tt9999999',type:'movie',cast:['Wrong actor']}).meta.cast,[]);
  assert.equal(titleMetadata({...item,released:undefined},{}).meta.released,undefined,'OTT dates must not replace original premiere dates');
});

test('episodes normalize both Cinemeta schemas without copying streams or other show IDs',()=>{
  const id='tt49873734';
  const videos=episodeVideos(id,[
    {id:id+':1:2',name:'Second episode',season:1,number:2,firstAired:'2026-10-30T00:00:00Z',streams:[{url:'https://example.org/video'}],overview:'Unused synopsis'},
    {id:id+':1:1',title:'First episode',season:1,episode:1,released:'2026-10-29T18:30:00Z'},
    {id:id+':1:1',title:'Duplicate',season:1,episode:1},
    {id:'tt9999999:1:3',title:'Wrong show',season:1,episode:3},
    {id:id+':2:1',name:'Future episode',season:2,number:1,firstAired:'2027-01-01'},
    {id:id+':0:1',name:'Special',season:0,number:1},
    {season:-1,episode:1},{season:1,episode:'3'}
  ]);
  assert.deepEqual(videos.map(x=>x.id),[id+':0:1',id+':1:1',id+':1:2',id+':2:1']);
  assert.equal(videos[2].released,'2026-10-30T00:00:00.000Z');assert.equal(videos[2].title,'Second episode');
  assert.equal(videos[2].streams,undefined);assert.equal(videos[2].overview,undefined);
});

test('episode refresh retains good cached lists through failures, wrong identities and empty responses',async()=>{
  const now=Date.parse('2026-10-31T12:00:00Z'),checkedAt=new Date(now-7*3600000).toISOString();
  const shows=['tt1111111','tt2222222','tt3333333'].map(id=>({id,type:'series',name:id}));
  const previous={entries:Object.fromEntries(shows.map(x=>[x.id,{schemaVersion:1,id:x.id,type:'series',checkedAt,videos:[{id:x.id+':1:1',title:'Episode 1',season:1,episode:1}]}]))};
  const result=await refreshSeriesDetails(previous,shows,{now,fetcher:async url=>{
    if(url.includes(shows[0].id))throw Error('Connection failed');
    if(url.includes(shows[1].id))return Response.json({meta:{id:'tt9999999',type:'series',videos:[]}});
    return Response.json({meta:{id:shows[2].id,type:'series',videos:[]}});
  }});
  assert.equal(result.warnings.length,3);
  for(const show of shows){assert.equal(result.entries[show.id].state,'cached');assert.deepEqual(result.entries[show.id].videos,previous.entries[show.id].videos);}
  assert.equal(previous.entries[shows[0].id].state,undefined,'Do not mutate previous snapshots');
});

test('fresh episode details are reused and new lists preserve actual episode numbers',async()=>{
  const id='tt49873734',shows=[{id,type:'series',name:'Rudravanam PS'}],now=Date.parse('2026-10-31T12:00:00Z');let calls=0;
  const result=await refreshSeriesDetails({},shows,{now,fetcher:async()=>{calls++;return Response.json({meta:{id,type:'series',videos:[{id:id+':1:1',name:'Episode #1.1',season:1,number:1,firstAired:'2026-10-30'}]}});}});
  assert.equal(result.entries[id].state,'ok');assert.equal(result.entries[id].videos[0].episode,1);
  await refreshSeriesDetails(result,shows,{now:now+3600000,fetcher:()=>{throw Error('Unnecessary request');}});assert.equal(calls,1);
  const empty=await refreshSeriesDetails({},shows,{now,fetcher:async()=>Response.json({meta:{id,type:'series',videos:[]}})});
  assert.equal(empty.entries[id].state,'missing_episodes');assert.deepEqual(empty.entries[id].videos,[]);
});

test('static meta exists for every catalog page and uses the same hosted posters and stable manifest',async()=>{
  const dir=await mkdtemp(tmpdir()+'/telugu-meta-test-'),destination=pathToFileURL(dir+'/'),checkedAt='2026-10-31T12:00:00Z';
  const movies={checkedAt,movies:Array.from({length:101},(_,i)=>({id:'tt'+String(1000000+i),type:'movie',name:'Movie '+i,ottReleaseDate:'2026-10-30',poster:'https://example.org/original.jpg'}))};
  const show={id:'tt2000000',type:'series',name:'Show'},series={checkedAt,series:[show]};
  const details={checkedAt,entries:{[show.id]:{id:show.id,type:'series',state:'ok',videos:[{id:show.id+':1:1',season:1,episode:1,title:'Pilot',released:checkedAt}]}}};
  try{
    await exportStatic(movies,destination);await exportSeries(series,destination);
    const path=new URL(`catalog/movie/${MOVIE_ID}/skip=100.json`,destination),page=JSON.parse(await readFile(path));
    page.metas[0].poster='https://example.org/hosted-page-two.jpg';await writeFile(path,JSON.stringify(page));
    const summary=await exportMetadata(movies,series,details,destination);
    assert.equal(summary.movies,101);assert.equal(summary.series,1);assert.equal(summary.episodeCount,1);
    const exported=JSON.parse(await readFile(new URL('manifest.json',destination)));
    const resource=exported.resources.find(x=>x.name==='meta');assert.deepEqual(resource.idPrefixes,['tt']);
    for(const item of [...movies.movies,...series.series]){
      assert.ok(resource.idPrefixes.some(prefix=>item.id.startsWith(prefix)));
      const {meta}=JSON.parse(await readFile(new URL(`meta/${item.type}/${item.id}.json`,destination)));
      assert.equal(meta.id,item.id);assert.equal(meta.type,item.type);assert.equal(meta.name,item.name);
    }
    const last=JSON.parse(await readFile(new URL(`meta/movie/${page.metas[0].id}.json`,destination)));
    assert.equal(last.meta.poster,page.metas[0].poster);
    const episode=JSON.parse(await readFile(new URL('meta/series/'+show.id+'.json',destination)));
    assert.equal(episode.meta.videos[0].id,show.id+':1:1');
  }finally{await rm(dir,{recursive:true,force:true});}
});
