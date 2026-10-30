import {normalize} from './identity.mjs';

// Corrections backed by a public platform page, rather than choosing the newest
// namesake by default. A correction only applies to its listed release and ID.
const confirmedFilms=[{
  title:'Dhoomakethu',id:'tt38990864',year:'2026',platform:'Netflix',
  ottReleaseDate:'2026-10-23',originalLanguages:['Q36236'],
  cast:['Nikhila Vimal','Shine Tom Chacko'],
  sourceName:'Netflix public title page',sourceUrl:'https://www.netflix.com/in/title/83206696',
  checkedAt:'2026-10-29',
},{
  title:'SI Yugandhar',aliases:['Sub Inspector Yugandhar','Sub-Inspector Yugandhar'],id:'tt47421307',year:'2026',platform:'Netflix',
  ottReleaseDate:'2026-10-30',originalLanguages:['Q8097'],cast:['Aadi','Aadi Saikumar','Rakendu Mouli','Megha Lekha'],
  sourceName:'Netflix public title page — Telugu [Original]',sourceUrl:'https://www.netflix.com/in/title/83001320',
  ignoredTmdbId:'1811964',checkedAt:'2026-10-30',
}];

export function confirmedRelease(row) {
  return confirmedFilms.find(f=>[f.title,...f.aliases||[]].some(name=>normalize(row.title)===normalize(name))
    &&row.ottReleaseDate===f.ottReleaseDate&&row.platforms?.includes(f.platform)
    &&(!row.movieYearHint||row.movieYearHint===f.year));
}

export function confirmedIdentity(row,meta) {
  const film=confirmedRelease(row);
  if(!film||meta.id!==film.id||meta.year!==film.year||![film.title,...film.aliases||[]].some(name=>normalize(meta.name)===normalize(name)))return null;
  if(!meta.cast?.some(name=>film.cast.some(known=>normalize(name)===normalize(known))))return null;
  return film;
}

