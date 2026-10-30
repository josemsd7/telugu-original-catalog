import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {manifest,catalog,MOVIE_ID} from './src/core.mjs';
import {seriesCatalog,SERIES_ID} from './src/series-core.mjs';
import {assessFilm,sourceReason,parseSource,refreshFromOtt} from './src/source-refresh.mjs';
import {seriesSourceReason} from './src/series-refresh.mjs';
import {indiaDate} from './src/release-time.mjs';
import {exportStatic} from './export.mjs';
import {exportSeries} from './export-series.mjs';
import {normalize} from './src/identity.mjs';
const row={title:'Sample',languageText:'Telugu',ottReleaseDate:'2026-10-30',genreText:'Movie',platforms:['Aha'],sourceUrl:'https://example.org/releases',sourceName:'Fixture',sourceRank:0};
const match={meta:{id:'tt0000001',name:'Sample',type:'movie',countries:['india'],cast:[]},titleScore:100,castMatches:0};
const identity=languages=>({items:['Q1'],languages,countries:['Q668'],tmdbIds:[]});
test('only confirmed Telugu originals qualify, including Telugu bilingual originals',()=>{
  assert.equal(assessFilm(row,match,identity(['Q8097'])).reason,null);
  assert.equal(assessFilm(row,match,identity(['Q8097','Q5885'])).reason,null);
  assert.equal(assessFilm(row,match,identity(['Q5885'])).reason,'not_original_telugu');
  assert.equal(assessFilm(row,match,identity([])).reason,'original_language_unconfirmed');
  assert.equal(assessFilm({...row,languageText:'Direct Telugu'},match,identity([])).reason,null);
  assert.equal(assessFilm({...row,languageText:'Tamil to Telugu'},match,identity(['Q8097'])).reason,'original_language_conflict');
  assert.equal(assessFilm(row,match,identity(['Q8097']),{title:'Sample',languageIds:['Q1568']}).reason,'original_language_conflict');
  assert.equal(assessFilm(row,match,{...identity(['Q8097']),items:['Q1','Q2']}).reason,'ambiguous_identity');
  assert.equal(assessFilm(row,{...match,meta:{...match.meta,countries:['usa']}},identity(['Q8097'])).reason,'non_indian_film');
});
test('movie and series source filters retain original Telugu and honor India release day',()=>{
  const today=indiaDate('2026-10-29T19:00:00Z');assert.equal(today,'2026-10-30');
  assert.equal(sourceReason({...row,languageText:'Direct Telugu'},today),null);
  assert.equal(sourceReason({...row,ottReleaseDate:'2026-10-31'},today),'upcoming');
  assert.equal(sourceReason({...row,genreText:'Series'},today),'not_a_movie');
  assert.equal(seriesSourceReason({...row,genreText:'Series',languageText:'Telugu original'},today),null);
  assert.equal(seriesSourceReason(row,today),'not_a_series');
});
test('123telugu parser reads only OTT tab and distinguishes originals from dubs',()=>{
  const html='<table><tr><td>Theatrical (Telugu Film) Aha</td><td>October 29</td></tr></table><div class="t123-show-OTT"><table><tr><td>Original (Telugu Film) Aha</td><td>October 30</td></tr><tr><td>Dubbed (Tamil Film - Telugu Dub) Netflix</td><td>October 29</td></tr></table></div>';
  const d=parseSource(html,'123telugu','2026-10-30');
  assert.equal(d.rows.length,2);assert.equal(d.rows[0].languageText,'Direct Telugu');assert.equal(d.rows[1].languageText,'Tamil to Telugu');
});
test('manifest and catalogs have independent identity, content types and premiere sorting',()=>{
  const m=manifest();assert.equal(m.catalogs.length,2);assert.equal(m.id,'org.josemsd7.telugu.original.catalog');
  assert.deepEqual(m.catalogs.map(x=>[x.type,x.id]),[['movie',MOVIE_ID],['series',SERIES_ID]]);
  const items=[{id:'tt1',name:'Old show',type:'series',firstSeasonReleaseDate:'2021-01-01',latestAiredDate:'2026-10-30'},{id:'tt2',name:'New show',type:'series',firstSeasonReleaseDate:'2026-10-01',latestAiredDate:'2026-10-01'},{id:'tt3',name:'Film',type:'movie',ottReleaseDate:'2026-10-30'}];
  assert.deepEqual(seriesCatalog({series:items}).metas.map(x=>x.id),['tt2','tt1']);
  assert.deepEqual(catalog({movies:items}).metas.map(x=>x.id),['tt3']);
  assert.throws(()=>catalog({movies:[]},'skip=-1'));
});
test('refresh merges duplicate originals, rejects dubs, and keeps earliest reported OTT sort date',async()=>{
  const now=Date.parse('2026-10-29T19:00:00Z'),checkedAt=new Date(now).toISOString();
  const titles=[['First','tt0000001','Q8097'],['Newest','tt0000002','Q8097'],['Dub','tt0000003','Q5885']];
  const previous={sourceSearchCache:{},sourceMetadataCache:{},identities:{}};
  for(const [name,id,lang] of titles){previous.sourceSearchCache[normalize(name)]={checkedAt,hits:[{id,name}]};previous.sourceMetadataCache[id]={id,name,type:'movie',countries:['india'],year:'2026',cast:[],directors:[],checkedAt};previous.identities[id]={...identity([lang]),checkedAt};}
  const rows=[{...row,title:'First',ottReleaseDate:'2026-10-28'},{...row,title:'First',platforms:['Netflix']},{...row,title:'Newest'},{...row,title:'Dub'}];
  const result=await refreshFromOtt(previous,{now,source:{rows,statuses:[],snapshots:{}},fetcher:()=>{throw new Error('Unexpected uncached request');}});
  assert.deepEqual(result.movies.map(x=>x.name),['Newest','First']);assert.equal(result.movies[1].ottReleaseDate,'2026-10-28');assert.equal(result.movies[1].platforms.length,2);assert.equal(result.counts.not_original_telugu,1);
  const dir=await mkdtemp(tmpdir()+'/telugu-original-test-'),destination=pathToFileURL(dir+'/');
  try{
    await exportStatic(result,destination);
    await exportSeries({checkedAt,series:[{id:'tt0000004',name:'Show',type:'series',firstSeasonReleaseDate:'2026-10-29'}]},destination);
    const movie=JSON.parse(await readFile(new URL(`catalog/movie/${MOVIE_ID}.json`,destination)));
    const series=JSON.parse(await readFile(new URL(`catalog/series/${SERIES_ID}.json`,destination)));
    assert.equal(movie.metas.length,2);assert.equal(series.metas.length,1);
    assert.deepEqual(JSON.parse(await readFile(new URL(`catalog/movie/${MOVIE_ID}/skip=100.json`,destination))).metas,[]);
    assert.deepEqual(JSON.parse(await readFile(new URL('manifest.json',destination))).catalogs.map(x=>x.type),['movie','series']);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('failed discovery rejects refresh without overwriting previous data',async()=>{
  const prior={movies:[{id:'tt1'}]};
  await assert.rejects(refreshFromOtt(prior,{source:{rows:[]}}),/preserving/);assert.equal(prior.movies.length,1);
});
