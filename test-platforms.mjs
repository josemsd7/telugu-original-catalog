import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlatform,discoverPlatforms} from './src/platform-sources.mjs';
import {classifyReleaseRows} from './src/official-sources.mjs';
import {assessFilm} from './src/source-refresh.mjs';
const ld=value=>`<script type="application/ld+json">${JSON.stringify(value)}</script>`;
test('Netflix reads the exact title Audio section and never treats film year as OTT date',()=>{
 const url='https://www.netflix.com/in/title/12345678';
 const html=ld({'@type':'Movie',url:'https://www.netflix.com/title/12345678',name:'Example',actors:[{name:'Actor'}]})+'<ul><li>2026</li></ul><div>Audio Tamil [Original], Telugu</div><div>Recommendations Telugu [Original]</div>';
 const row=parsePlatform(html,'netflix-detail',url).rows[0];
 assert.deepEqual(row.providerOriginalLanguageIds,['Q5885']);assert.equal(row.movieYearHint,'2026');assert.equal(row.ottReleaseDate,null);
 assert.throws(()=>parsePlatform(html,'netflix-detail','https://www.netflix.com/in/title/87654321'),/identity/);
 assert.throws(()=>parsePlatform(html.replace('Tamil [Original], Telugu','Tamil [Original]'),'netflix-detail',url),/does not list Telugu/);
});
test('ETV Win uses title-bound streaming schema and ignores trailer dates and sitemap changes',()=>{
 const url='https://www.etvwin.com/movies/sample/ABC123';
 const x={'@type':'Movie',name:'Sample',url,inLanguage:'te',uploadDate:'2026-02-26T05:30:00+05:30',dateCreated:'2026-02-26',potentialAction:{'@type':'WatchAction',target:{'@type':'EntryPoint',urlTemplate:url}},video:{'@type':'VideoObject',name:'Trailer',uploadDate:'2026-02-10'}};
 const html=`<script>self.__next_f.push(${JSON.stringify([1,JSON.stringify(x)])})</script>`;
 const row=parsePlatform(html,'etv-detail',url).rows[0];assert.equal(row.ottReleaseDate,null);assert.equal(row.platformUploadDate,'2026-02-26');assert.equal(row.movieYearHint,null);
 x.potentialAction.expectsAcceptanceOf={availabilityStarts:'2026-02-26'};
 assert.equal(parsePlatform(ld(x),'etv-detail',url).rows[0].ottReleaseDate,'2026-02-26');
 assert.throws(()=>parsePlatform(html,'etv-detail',url.replace('ABC123','OTHER')),/ambiguous/);
 const sitemap='<urlset><url><loc>'+url+'</loc><lastmod>2026-10-30</lastmod></url></urlset>';
 const card=parsePlatform(sitemap,'etv-list','https://www.etvwin.com/movies-sitemap.xml').cards[0];assert.equal(card.modifiedAt,'2026-10-30');assert.equal(card.ottReleaseDate,undefined);
});
test('Sun NXT accepts explicit streaming wording for the same full movie, not teaser uploads',()=>{
 const url='https://www.sunnxt.com/telugu-movie-honey-2026/detail/245191';
 const x={'@type':'movie',name:'Honey',url,actors:[{name:'Actor'}],trailer:{'@type':'VideoObject',description:'The latest Drama "Honey" is streaming on Sun NXT from February 27th, 2026.',uploadDate:'2026-01-12'}};
 assert.equal(parsePlatform(ld(x),'sun-detail',url).rows[0].ottReleaseDate,'2026-02-27');
 x.trailer.description=x.trailer.description.replace('"Honey"','"Another Film"');assert.equal(parsePlatform(ld(x),'sun-detail',url).rows[0].ottReleaseDate,null);
 const map='<urlset><url><loc>'+url+'</loc></url><url><loc>'+url.replace('honey-','honey-teaser-')+'</loc></url></urlset>';
 assert.equal(parsePlatform(map,'sun-list','https://www.sunnxt.com/sitemap/movies.xml').cards.length,1);
});
test('Prime and SonyLIV metadata cannot turn film dates or contracts into new OTT releases',()=>{
 const url='https://www.primevideo.com/detail/EXAMPLE123',header={title:'Example',titleType:'movie',releaseYear:2026,releaseDate:'Jan 12, 2026',audioTracks:['తెలుగు'],contributors:{cast:[{name:'Actor'}]}};
 const d={init:{path:'/detail/EXAMPLE123',preparations:{body:{atf:{state:{pageTitleId:'id',detail:{headerDetail:{id:header}}}}}}}};
 const html=`<script id="dv-web-page-hydration-data" type="application/json">${JSON.stringify(d)}</script>`;
 const row=parsePlatform(html,'prime-detail',url).rows[0];assert.equal(row.movieYearHint,'2026');assert.equal(row.ottReleaseDate,null);
 assert.throws(()=>parsePlatform(html,'prime-detail',url+'OTHER'),/URL mismatch/);
 const state={landingpagedata:{assets:{containers:[{metadata:{contentId:123,objectSubtype:'MOVIE_BUNDLE',title:'Sample',year:'2021',language:'TEL',contractStartDate:Date.parse('2026-10-30'),emfAttributes:{audio_languages:'TEL,HIN'}}}]}}};
 const sony=`<a href="/movies/sample-123">Sample</a><script>window.INITIAL_STATE = ${JSON.stringify(state)}; window.OTHER = 1;</script>`;
 assert.equal(parsePlatform(sony,'sony','https://www.sonyliv.com/').rows[0].ottReleaseDate,null);
});
test('official Original labels are year-bound, conflict-checked evidence rather than an audio-only assumption',()=>{
 const base={title:'Example',genreText:'Movie',languageText:'Telugu',ottReleaseDate:'2026-10-30',platforms:['Netflix'],castText:''};
 const official={...base,sourceKey:'netflix-official',sourceName:'Netflix official',sourceUrl:'https://www.netflix.com/in/title/12345678',ottReleaseDate:null,movieYearHint:'2026',providerOriginalLanguageIds:['Q8097'],castText:'Actor'};
 const row=classifyReleaseRows([base,official])[0];const match={meta:{id:'tt1234567',name:'Example',countries:[],cast:['Actor']},titleScore:100,castMatches:1};
 assert.equal(assessFilm(row,match).reason,null);assert.equal(row.officialMetadataEvidence[0].url,official.sourceUrl);
 assert.equal(assessFilm({...row,providerOriginalLanguageIds:['Q5885']},match).reason,'not_original_telugu');
 assert.equal(assessFilm(row,match,{items:['Q1'],languages:['Q5885'],countries:[],tmdbIds:[]}).reason,'original_language_conflict');
 assert.equal(classifyReleaseRows([base,{...official,movieYearHint:'1984'}])[0].providerOriginalLanguageIds,undefined);
 assert.equal(assessFilm({...row,providerOriginalLanguageIds:[]},match).reason,'original_language_unconfirmed');
 const other={...official,title:'Example - A Different Story',castText:'Different Actor'};
 assert.equal(classifyReleaseRows([base,other])[0].officialMetadataEvidence,undefined);
});
test('platform discovery reports regional restrictions, reuses cached details and retains failed-source snapshots',async()=>{
 const now=Date.parse('2026-10-30T06:00:00Z'),url='https://www.netflix.com/in/title/12345678',record={title:'Example',sourceUrl:url,genreText:'Movie',movieYearHint:'2026',languageText:'Telugu',ottReleaseDate:null};
 const prior={officialDetailCache:{[url]:{platformSchema:1,checkedAt:new Date(now).toISOString(),rows:[record]}},sourceSnapshots:{}};
 const list=ld({'@type':'ItemList',itemListElement:[{item:{'@type':'Movie',name:'Example',url}}]});
 const netflix={key:'netflix-official',name:'Netflix official',kind:'netflix',platform:'Netflix',url:'https://www.netflix.com/in/browse/genre/81404071',pages:['https://www.netflix.com/in/browse/genre/81404071'],list:'netflix-list',detail:'netflix-detail',limit:1};
 const jio={key:'jiohotstar-official',name:'JioHotstar official',kind:'jiohotstar',platform:'JioHotstar',url:'https://www.hotstar.com/in',pages:['https://www.hotstar.com/in'],limit:0};
 const calls=[];const result=await discoverPlatforms(prior,{now,sources:[netflix,jio],fetcher:async url=>{calls.push(url);return new Response(url.includes('hotstar')?'Disney Bundle':list);}});
 assert.equal(result.rows.length,1);assert.equal(calls.length,2);assert.equal(result.statuses[1].state,'unavailable');assert.match(result.statuses[1].errors[0],/server region/);
 const failed=await discoverPlatforms({...prior,sourceSnapshots:{'netflix-official':{checkedAt:'2026-10-29T00:00:00Z',rows:[record]}}},{now,sources:[netflix],fetcher:async()=>new Response('',{status:503})});
 assert.equal(failed.rows.length,1);assert.equal(failed.statuses[0].state,'cached');
});
test('fresh cached titles leave the detail budget available for previously unchecked titles',async()=>{
 const now=Date.parse('2026-10-30T06:00:00Z'),known='https://www.netflix.com/in/title/12345678',unseen='https://www.netflix.com/in/title/87654321';
 const prior={officialDetailCache:{[known]:{platformSchema:1,checkedAt:new Date(now).toISOString(),rows:[{title:'Known',sourceUrl:known,genreText:'Movie',movieYearHint:'2026'}]}},sourceSnapshots:{}};
 const source={key:'netflix-official',name:'Netflix official',kind:'netflix',platform:'Netflix',url:'https://www.netflix.com/in/browse/genre/81404071',pages:['https://www.netflix.com/in/browse/genre/81404071'],list:'netflix-list',detail:'netflix-detail',limit:1};
 const list=ld({'@type':'ItemList',itemListElement:[{item:{'@type':'Movie',name:'Known',url:known}},{item:{'@type':'Movie',name:'Unseen',url:unseen}}]});
 const calls=[];const result=await discoverPlatforms(prior,{now,sources:[source],fetcher:async url=>{calls.push(url);return new Response(url===unseen?ld({'@type':'Movie',url:unseen,name:'Unseen'})+'<li>2026</li><div>Audio Telugu [Original]</div>':list);}});
 assert(calls.includes(unseen));assert(!calls.includes(known));assert.equal(result.rows.length,2);assert.equal(result.statuses[0].detailPagesScheduled,1);
});
