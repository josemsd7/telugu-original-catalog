import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('public');
const types={'.json':'application/json; charset=utf-8','.html':'text/html; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
http.createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+'/'))throw new Error('Invalid path');const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Access-Control-Allow-Origin':'*'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(7000,'127.0.0.1',()=>console.log('Manifest: http://127.0.0.1:7000/manifest.json'));
