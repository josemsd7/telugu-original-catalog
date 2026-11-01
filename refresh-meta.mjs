import {readFile,writeFile,rename} from 'node:fs/promises';
import {refreshSeriesDetails} from './src/meta.mjs';

const file=new URL('./data/series-details.json',import.meta.url);
let previous={};try{previous=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const {series}=JSON.parse(await readFile(new URL('./data/series.json',import.meta.url),'utf8'));
const data=await refreshSeriesDetails(previous,series);
await writeFile(new URL(file.href+'.tmp'),JSON.stringify(data,null,2)+'\n');
await rename(new URL(file.href+'.tmp'),file);
const entries=Object.values(data.entries);
console.log(JSON.stringify({series:entries.length,withEpisodes:entries.filter(x=>x.videos.length).length,episodes:entries.reduce((n,x)=>n+x.videos.length,0),warnings:data.warnings}));
