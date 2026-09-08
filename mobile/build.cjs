// Build the phone app from shared renderer/model source. Never copy user data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/app');
fs.mkdirSync(out,{recursive:true});
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const write=(file,content)=>{const p=path.join(out,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content);};
const replace=(text,a,b)=>{if(!text.includes(a))throw Error('Shared source changed: '+a);return text.replace(a,b);};
const styles=['style.css','quiet.css','completion.css','finish.css','colors.css','day-actions.css'];
for(const file of styles)write(file,read('src/'+file).replaceAll('../assets/','assets/'));
for(const file of ['finish.js','day-actions.js','day-navigation.js','renderer.js'])write(file,read('src/'+file).replaceAll('Saved on this Mac','Saved on this device').replace("list.querySelector('textarea')?.focus();","document.querySelector('#undo-clear-today')?.focus();"));
// Reuse the validated period engine; persistence is provided by IndexedDB transactions.
const store=read('src/store.cjs');
const functions=store.slice(store.indexOf('function dayKey('),store.indexOf('class Store {'));
const methods=store.slice(store.indexOf('  read(key ='),store.indexOf('  commit(next)'));
write('model.js',`/* Generated from src/store.cjs by mobile/build.cjs. */\nwindow.ThreeModel=(()=>{\n${functions}\nclass Store {\nconstructor(data){this.data=validateData(data||{version:6,days:{},weeks:{},months:{},completion:{},clearUndos:{}});}\n${methods}\ncommit(next){this.data=validateData(next);}\n}\nreturn {Store,dayKey,weekKey,validateKey};\n})();\n`);
const exportSource=read('src/text-export.cjs');
write('text-export.js',exportSource.slice(exportSource.indexOf('function formatArchive('),exportSource.indexOf('function writeTextExport(')));
for(const file of ['bridge.js','mobile.js','mobile.css'])write(file,read('mobile/'+file));
let html=read('src/index.html');
html=replace(html,'<html lang="en">','<html lang="en" data-skin="meadow" data-mode="list">');
html=replace(html,'width=device-width, initial-scale=1','width=device-width, initial-scale=1, viewport-fit=cover');
html=replace(html,"connect-src 'none'","connect-src 'self'; worker-src 'self'; manifest-src 'self'");
html=replace(html,'<title>Three Things</title>','<title>Three Things · Mobile</title>\n  <meta name="theme-color" content="#eeecda">\n  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-title" content="Three Things">\n  <link rel="manifest" href="manifest.webmanifest">\n  <link rel="apple-touch-icon" href="assets/icon-180.png">\n  <link rel="icon" href="assets/icon-192.png">');
for(const file of ['materials.css','illustrations.css','fullscreen.css'])html=replace(html,`  <link rel="stylesheet" href="${file}">\n`,'');
html=replace(html,'</head>','  <link rel="stylesheet" href="mobile.css">\n</head>');
html=replace(html,'<header class="titlebar" title="Drag to move">','<header class="titlebar"><div class="mobile-brand"><svg viewBox="0 0 32 28" aria-hidden="true"><path d="M3 5H23"/><path d="M3 14H29"/><path d="M3 23H19"/></svg><span>Three Things</span></div>');
html=replace(html,'title="Settings" aria-haspopup="menu">⚙','title="Settings" aria-haspopup="dialog">Settings');
html=replace(html,'<p id="save-state" class="sr-only" role="status">Opening…</p>','<footer class="mobile-footer"><p id="save-state" role="status">Opening…</p><button id="device-info" type="button">Device-only · No Mac sync</button><p id="offline-state" role="status">Preparing offline use…</p></footer>');
html=replace(html,'  <script src="finish.js"></script>',read('mobile/settings.html')+'\n  <script src="model.js"></script>\n  <script src="text-export.js"></script>\n  <script src="bridge.js"></script>\n  <script src="finish.js"></script>');
html=replace(html,'</body>','  <script src="mobile.js"></script>\n</body>');
write('index.html',html);
for(const file of ['inter-latin.woff2','Inter-LICENSE.txt','Heroicons-LICENSE.txt','pencil-neutral.svg','pencil-photo.svg','pencil-graphite.svg','charcoal-grain.png']){
 if(!fs.existsSync(path.join(root,'assets',file)))throw Error('Missing asset '+file);
 write('assets/'+file,fs.readFileSync(path.join(root,'assets',file)));
}
for(const file of ['icon-180.png','icon-192.png','icon-512.png','photos/meadow.webp','photos/sunroom.webp'])write('assets/'+file,fs.readFileSync(path.join(root,'mobile/assets',file)));
write('manifest.webmanifest',JSON.stringify({id:'./',name:'Three Things',short_name:'Three Things',description:'Three priorities for today, this week, and this month. Saved on this device.',start_url:'./',scope:'./',display:'standalone',background_color:'#eeecda',theme_color:'#eeecda',icons:[{src:'assets/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]},null,2)+'\n');
const files=['index.html',...styles,'finish.js','day-actions.js','day-navigation.js','renderer.js','model.js','text-export.js','bridge.js','mobile.js','mobile.css','manifest.webmanifest',...['inter-latin.woff2','Inter-LICENSE.txt','Heroicons-LICENSE.txt','pencil-neutral.svg','pencil-photo.svg','pencil-graphite.svg','charcoal-grain.png','icon-180.png','icon-192.png','icon-512.png','photos/meadow.webp','photos/sunroom.webp'].map(f=>'assets/'+f)];
const hashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex')]));
const version=crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex').slice(0,12);
write('sw.js',`// Generated static-only offline cache. User priorities are never cached here.\nconst CACHE='three-things-mobile-${version}';\nconst FILES=${JSON.stringify(files)};\nconst URLS=FILES.map(f=>new URL(f,self.registration.scope).href);\nself.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));\nself.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('three-things-mobile-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));\nself.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;const home=new URL(self.registration.scope);let target=u.href;if(event.request.mode==='navigate'&&(u.pathname===home.pathname||u.pathname===home.pathname+'index.html'))target=new URL('index.html',home).href;if(!URLS.includes(target))return;event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(target))||fetch(event.request)));});\n`);
write('build.json',JSON.stringify({version,files:hashes},null,2)+'\n');
console.log('Built mobile app:',files.length,'static files; version',version);
