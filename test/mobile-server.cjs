const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../docs');
function createServer(){return http.createServer((req,res)=>{try{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(!route.startsWith('/three-things/'))throw Error('Not found');
 let file=path.resolve(root,'.'+route.slice('/three-things'.length));
 if(!file.startsWith(root+path.sep))throw Error('Not allowed');
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-cache'});res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end('Not found');}});}
module.exports={createServer};
if(require.main===module){const server=createServer();server.listen(4179,'127.0.0.1',()=>console.log('Three Things static preview: http://127.0.0.1:4179/three-things/app/'));}
