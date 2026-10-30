import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {manifest,catalog,MOVIE_ID} from './src/core.mjs';
import {seriesCatalog,SERIES_ID} from './src/series-core.mjs';
import {assessFilm,sourceReason,parseSource,refreshFromOtt} from './src/source-refresh.mjs';
import {seriesSourceReason,mergeSeriesListings} from './src/series-refresh.mjs';
import {indiaDate} from './src/release-time.mjs';
import {exportStatic} from './export.mjs';
import {exportSeries} from './export-series.mjs';
import {normalize} from './src/identity.mjs';
import {parseOfficial,classifyReleaseRows} from './src/official-sources.mjs';
import {imdbTitleSearch,SEARCH_SCHEMA,withTitleAliases} from './src/title-search.mjs';
import {titleScore} from './src/source-refresh.mjs';
import {supersededRelease} from './src/confirmed-films.mjs';
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
  for(const [name,id,lang] of titles){previous.sourceSearchCache[normalize(name)]={checkedAt,schemaVersion:SEARCH_SCHEMA,hits:[{id,name}]};previous.sourceMetadataCache[id]={id,name,type:'movie',countries:['india'],year:'2026',cast:[],directors:[],checkedAt};previous.identities[id]={...identity([lang]),checkedAt};}
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
test('official listings distinguish media types and use streaming availability dates',()=>{
 const record={id:'0-6-test',title:'New Telugu Show',asset_type:6,slug:'web-series/details/new-telugu-show/0-6-test',languages:['te'],audio_languages:['te'],release_date:'2026-10-30T00:00:00',tags:['Z Telugu Original'],actors:['Example Actor:Lead']};
 const html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{railsData:[{items:[record]}]}}})+'</script>';
 const d=parseOfficial(html,'zee5','https://www.zee5.com/web-series/lang/telugu');assert.equal(d.rows[0].genreText,'Series');assert.equal(d.rows[0].languageText,'Direct Telugu');assert.equal(d.rows[0].firstSeasonReleaseDate,'2026-10-30');
 const fixed=classifyReleaseRows([{...row,title:'New Telugu Show'},...d.rows]);assert.equal(fixed[0].genreText,'Series');
 const u='https://www.aha.video/movie/sample';const video={'@type':'VideoObject',contentUrl:u,name:'Sample Telugu movie',datePublished:'2026-01-01',potentialAction:{expectsAcceptanceOf:{availabilityStarts:'2026-10-09'}},actor:[{'@type':'Person',name:'Actor'}]};
 const a=parseOfficial('<script type="application/ld+json">'+JSON.stringify(video)+'</script>','aha-detail',u);assert.equal(a.ottReleaseDate,'2026-10-09');assert.equal(a.genreText,'Movie');
});
test('IMDb fallback keeps public title IDs and movie/series types separate',async()=>{
 const fetcher=async()=>Response.json({d:[{id:'tt1111111',l:'SI Yugandhar',qid:'movie',y:2026,s:'Actor'},{id:'tt2222222',l:'SI Yugandhar',qid:'tvSeries',y:2026},{id:'nm123',l:'Person',qid:'name'}]});
 assert.equal(titleScore('Sub-Inspector Yugandhar','SI Yugandhar'),100);
 assert.deepEqual((await imdbTitleSearch('Sub-Inspector Yugandhar','movie',fetcher)).map(x=>x.id),['tt1111111']);
 assert.deepEqual((await imdbTitleSearch('SI Yugandhar','series',fetcher)).map(x=>x.id),['tt2222222']);
});
test('same-name candidates are verified before ambiguity rejection and old relistings stay excluded',async()=>{
 const now=Date.parse('2026-10-30T02:00:00Z'),checkedAt=new Date(now).toISOString(),previous={sourceSearchCache:{},sourceMetadataCache:{},identities:{}};
 for(const [name,id,lang,year] of [['Shared','tt1000001','Q8097','2026'],['Shared','tt1000002','Q5885','2026'],['Old namesake','tt1000003','Q8097','1984']]){
  const k=normalize(name);previous.sourceSearchCache[k]||={checkedAt,schemaVersion:SEARCH_SCHEMA,checkedYear:'2026',hits:[]};previous.sourceSearchCache[k].hits.push({id,name,year});previous.sourceMetadataCache[id]={id,name,type:'movie',year,countries:['india'],cast:[],directors:[],checkedAt};previous.identities[id]={...identity([lang]),checkedAt};
 }
 const d=await refreshFromOtt(previous,{now,source:{rows:[{...row,title:'Shared'},{...row,title:'Old namesake'}],snapshots:{},statuses:[]},fetcher:()=>{throw Error('Unexpected request');}});
 assert.deepEqual(d.movies.map(x=>x.id),['tt1000001']);assert.equal(d.counts.older_film_relisted_as_new,1);
});
test('series merges retain an official premiere discovered after a sparse source row',()=>{
 const first={id:'tt49873734',name:'Rudravanam PS',type:'series',genres:['Telugu'],releaseListings:[{title:'Rudravanam PS',sourceName:'Publisher',sourceUrl:'https://example.org/',ottReleaseDate:'2026-10-30',platforms:['ZEE5']}]};
 const official={...first,firstSeasonReleaseDate:'2026-10-30',firstSeasonReleaseDateSource:'https://www.zee5.com/web-series/details/rudravanam-ps/0-6-4z51098526'};
 const d=mergeSeriesListings([first,official]);assert.equal(d[0].firstSeasonReleaseDate,'2026-10-30');assert.equal(d[0].firstSeasonReleaseYear,'2026');
 assert.equal(sourceReason({...row,title:'The Great Pre-Wedding Show',genreText:'Movie'},'2026-10-30'),null);
 assert.equal(seriesSourceReason({...row,title:'The Great Pre-Wedding Show',genreText:'Movie'},'2026-10-30'),'not_a_series');
});
test('an old EPIC search result does not block the current First Semester identity',async()=>{
 const now=Date.parse('2026-10-30T02:00:00Z'),checkedAt=new Date(now).toISOString();
 const ids=[['tt1111001','Epic','2013'],['tt35448218','Epic - First Semester','2026']];
 const previous={sourceSearchCache:{epicfirstsemester:{schemaVersion:SEARCH_SCHEMA,checkedAt,hits:[{id:'tt1111001',name:'Epic',year:'2013'}]}},sourceMetadataCache:{},identities:{}};
 for(const [id,name,year] of ids){previous.sourceMetadataCache[id]={id,name,year,type:'movie',countries:['india'],cast:[],directors:[],checkedAt};previous.identities[id]={...identity(['Q8097']),checkedAt};}
 const calls=[];const fetcher=async url=>{calls.push(url);return url.includes('sg.media-imdb.com')?Response.json({d:[{id:'tt35448218',l:'Epic - First Semester',y:2026,qid:'movie'}]}):Response.json({metas:[{id:'tt1111001',name:'Epic',releaseInfo:'2013',type:'movie'}]});};
 const d=await refreshFromOtt(previous,{now,source:{rows:[{...row,title:'EPIC - The First Semester'}],snapshots:{},statuses:[]},fetcher});
 assert.equal(d.movies[0].id,'tt35448218');assert(calls.some(x=>x.includes('sg.media-imdb.com')));
});
test('near-spelling matches require cast or explicit year evidence and film dates are not OTT dates',()=>{
 const score=titleScore('Kagitham Padayalu','Kaagitham Padavalu');assert(score>0&&score<80);
 assert.equal(assessFilm(row,{...match,titleScore:score},identity(['Q8097'])).reason,'title_variant_uncorroborated');
 assert.equal(assessFilm({...row,castText:'Actor'},{...match,titleScore:score,castMatches:1},identity(['Q8097'])).reason,null);
 const record={id:'0-0-new',title:'Movie',assetType:0,slug:'movies/details/movie/0-0-new',languages:['te'],releaseDate:'2026-09-01T00:00:00'};
 const html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{items:[record]}}})+'</script>';
 const x=parseOfficial(html,'zee5','https://www.zee5.com/movies/lang/telugu').rows[0];assert.equal(x.ottReleaseDate,null);assert.equal(x.movieYearHint,'2026');
});
test('a Netflix-backed correction is bound to the exact release, IMDb ID, year and cast',()=>{
 const row={title:'Sub Inspector Yugandhar',ottReleaseDate:'2026-10-30',platforms:['Netflix'],languageText:'Direct Telugu',castText:'Aadi Saikumar'};
 const match={meta:{id:'tt47421307',name:'SI Yugandhar',type:'movie',year:'2026',countries:[],cast:['Aadi'],tmdbId:'1811964'},titleScore:100,castMatches:1};
 const facts={title:'SI Yugandhar',languageIds:['Q1860'],countries:['united states']};
 assert.equal(assessFilm(row,match,identity([]),facts).reason,null);
 assert.equal(assessFilm({...row,ottReleaseDate:'2026-10-29'},match,identity([]),facts).reason,'country_conflict');
 assert.equal(assessFilm(row,{...match,meta:{...match.meta,cast:['Different Actor']}},identity([]),facts).reason,'country_conflict');
 assert.equal(assessFilm(row,{...match,meta:{...match.meta,id:'tt0000000'}},identity([]),facts).reason,'country_conflict');
});
test('current title aliases survive cached or fresh metadata that still uses a working title',async()=>{
 const now=Date.parse('2026-10-30T04:00:00Z'),checkedAt=new Date(now).toISOString(),id='tt28629017',name='Mana Shankara Vara Prasad Garu';
 for(const cached of [true,false]){
  const previous={sourceSearchCache:{[normalize(name)]:{checkedAt,schemaVersion:SEARCH_SCHEMA,hits:[{id,name,year:'2026'}]}},sourceMetadataCache:{},identities:{[id]:{...identity(['Q8097']),checkedAt}}};
  if(cached)previous.sourceMetadataCache[id]={id,name:'Mega 157',type:'movie',countries:['india'],year:'2026',cast:['Chiranjeevi'],directors:[],checkedAt};
  const result=await refreshFromOtt(previous,{now,source:{rows:[{...row,title:name,ottReleaseDate:'2026-02-11',castText:'Chiranjeevi'}],snapshots:{},statuses:[]},fetcher:async()=>Response.json({meta:{id,name:'Mega 157',type:'movie',country:'India',year:'2026',cast:['Chiranjeevi']}})});
  assert.equal(result.movies[0]?.id,id);assert.equal(result.movies[0].name,name);assert(result.sourceMetadataCache[id].aliases.includes(name));
 }
 const aliased=withTitleAliases({id,name:'Mega 157'},{id,name});
 assert.equal(assessFilm({...row,title:name},{...match,meta:{...match.meta,...aliased},titleScore:100},identity(['Q8097']),{title:name,languageIds:['Q8097']}).reason,null);
 assert.equal(assessFilm({...row,title:name},{...match,meta:{...match.meta,...aliased},titleScore:100},identity(['Q8097']),{title:'Another Film',languageIds:['Q8097']}).reason,'original_language_identity_conflict');
 assert.equal(withTitleAliases({id,name:'Mega 157'},{id:'tt0000000',name}).aliases,undefined);
});
test('shorter IMDb suggestion queries recover spelling variations without accepting unrelated hits',async()=>{
 const calls=[];const fetcher=async url=>{calls.push(url);return Response.json({d:url.includes('/sampradayini.json')?[{id:'tt1234567',l:'Sampradayini Suppini Suddapoosani',qid:'movie',y:2026},{id:'tt9999999',l:'Unrelated',qid:'movie',y:2026}]:[]});};
 const hits=await imdbTitleSearch('Sampradayini Suppini Suddapoosani','movie',fetcher,hit=>titleScore('Sampradayini Suppini Suddapoosani',hit.name)>0);
 assert.deepEqual(hits.map(x=>x.id),['tt1234567']);assert(calls.some(x=>x.includes('/sampradayini.json')));
});
test('long transliterations need corroboration and current IMDb facts repair sparse cached casts',async()=>{
 const score=titleScore('Sampradayini Suppini Suddapoosani','Sampradayaini Suppini Suddapusaani');assert(score>0&&score<80);
 assert.equal(assessFilm(row,{...match,titleScore:score},identity(['Q8097'])).reason,'title_variant_uncorroborated');
 assert.equal(assessFilm({...row,movieYearHint:'2026'},{...match,titleScore:score},identity(['Q8097'])).reason,null);
 assert.equal(titleScore('Sri Chidambaram Garu','Sri Chidambaram'),100);assert.equal(titleScore('Mr Middle Class','Mister Middle Class'),100);
 const now=Date.parse('2026-10-30T04:00:00Z'),checkedAt=new Date(now).toISOString(),id='tt1111234',name='New Feature';
 const previous={sourceSearchCache:{newfeature:{checkedAt,schemaVersion:SEARCH_SCHEMA,hits:[{id,name,year:'2026',cast:['Lead Actor'],identitySource:'IMDb public title suggestions'}]}},sourceMetadataCache:{[id]:{id,name,type:'movie',year:'2017',countries:['india'],cast:['Supporting Actor'],directors:[],checkedAt}},identities:{[id]:{...identity(['Q8097']),checkedAt}}};
 const result=await refreshFromOtt(previous,{now,source:{rows:[{...row,title:name,castText:'Lead Actor'}],snapshots:{},statuses:[]},fetcher:()=>{throw Error('Unexpected request');}});
 assert.equal(result.movies[0]?.id,id);assert.equal(result.movies[0].releaseInfo,'2026');assert(result.sourceMetadataCache[id].cast.includes('Supporting Actor'));
});
test('documented postponed dates cannot outrank confirmed streaming availability',async()=>{
 const now=Date.parse('2026-10-30T04:00:00Z'),checkedAt=new Date(now).toISOString(),id='tt37803848',name='Sri Chidambaram Garu';
 const previous={sourceSearchCache:{sreechidambaramgaru:{checkedAt,schemaVersion:SEARCH_SCHEMA,hits:[{id,name,year:'2026'}]}},sourceMetadataCache:{[id]:{id,name,type:'movie',year:'2026',countries:['india'],cast:[],directors:[],checkedAt}},identities:{[id]:{...identity(['Q8097']),checkedAt}}};
 const release={...row,title:name,platforms:['ETV Win'],ottReleaseDate:'2026-02-19'};
 assert.equal(supersededRelease(release,{id,year:'2026'}).actualDate,'2026-02-26');
 assert.equal(supersededRelease(release,{id:'tt0000000',year:'2026'}),undefined);
 const result=await refreshFromOtt(previous,{now,source:{rows:[release,{...release,ottReleaseDate:'2026-02-26'}],snapshots:{},statuses:[]},fetcher:()=>{throw Error('Unexpected request');}});
 assert.equal(result.movies[0].ottReleaseDate,'2026-02-26');assert.equal(result.counts.superseded_ott_announcement,1);assert.equal(result.movies[0].releaseDateCorrections[0].announcedDate,'2026-02-19');
});
