import http from 'node:http';import {readFile} from 'node:fs/promises';import rateHandler from './api/rate.mjs';import configHandler from './api/config.mjs';import settlementsHandler from './api/settlements.mjs';import teamHandler from './api/team.mjs';
const files={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8']};
const port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const routes={'/api/rate':rateHandler,'/api/config':configHandler,'/api/settlements':settlementsHandler,'/api/team':teamHandler};if(routes[path])return routes[path](req,res);
 const asset=files[path]||(['/account','/history','/settlement'].includes(path.replace(/\/$/,''))?files['/']:null);if(!asset){res.writeHead(404);res.end('Not found');return;}
 try{const data=await readFile('.vercel/output/static/'+asset[0]);res.writeHead(200,{'Content-Type':asset[1]});res.end(data);}catch{res.writeHead(500);res.end('Run npm run build first.');}
}).listen(port,'0.0.0.0',()=>console.log(`EFA service ready http://localhost:${port}`));
