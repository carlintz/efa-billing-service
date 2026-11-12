import {build} from 'esbuild';
import {mkdir,writeFile,cp,rm} from 'node:fs/promises';
const output='.vercel/output';
await rm(output,{recursive:true,force:true});
await mkdir(`${output}/static`,{recursive:true});
await mkdir(`${output}/functions/api/rate.func`,{recursive:true});
await cp('public/index.html',`${output}/static/index.html`);
await cp('public/style.css',`${output}/static/style.css`);
await build({entryPoints:['src/app.mjs'],bundle:true,minify:true,platform:'browser',target:'es2022',outfile:`${output}/static/app.js`});
for(const route of ['rate','config','settlements','team']){
 await mkdir(`${output}/functions/api/${route}.func`,{recursive:true});
 await build({entryPoints:[`api/${route}.mjs`],bundle:true,minify:true,platform:'node',target:'node22',format:'esm',outfile:`${output}/functions/api/${route}.func/index.mjs`});
 await writeFile(`${output}/functions/api/${route}.func/.vc-config.json`,JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:60},null,2));
}
await mkdir('build/edge',{recursive:true});
await build({entryPoints:['supabase/functions/efa-billing/index.mjs'],bundle:true,minify:true,platform:'browser',target:'es2022',format:'esm',external:['npm:@supabase/supabase-js@2.95.3'],mainFields:['browser','module','main'],outfile:'build/edge/index.js'});
const security=[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://hagqpkfegwhgketkswua.supabase.co wss://hagqpkfegwhgketkswua.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"}];
await writeFile(`${output}/config.json`,JSON.stringify({version:3,routes:[{src:'/(.*)',headers:Object.fromEntries(security.map(x=>[x.key,x.value])),continue:true},{src:'/(?:account|history|settlement)?/?',dest:'/index.html'},{handle:'filesystem'},{src:'/(.*)',status:404}]},null,2));
console.log('Built independent Vercel static site and Node.js exchange-rate function.');
