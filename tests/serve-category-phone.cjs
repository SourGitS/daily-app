// Local-network sample app only. Never serves production HTML, backend files or real data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),host=process.env.DAILY_PREVIEW_HOST||'127.0.0.1',port=8795;
const octets=host.split('.').map(Number),privateHost=octets.length===4&&octets.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(octets[0]===127||octets[0]===10||(octets[0]===192&&octets[1]===168)||(octets[0]===172&&octets[1]>=16&&octets[1]<=31));
if(!privateHost)throw Error('Use a loopback or private IPv4 address, never a public/wildcard bind.');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assets=vm.runInNewContext(read('service-worker.js').match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
const allowed=new Set(assets.filter(p=>p.startsWith('./')&&p!=='./'&&p!=='./index.html').map(p=>p.slice(2)));
const mime={'.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const params='preview&ui=journal&home-cards&accent=006CCF&switch=category-phone';
const landing=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Daily · local iPhone test</title><style>body{max-width:620px;margin:40px auto;padding:20px;background:#101010;color:#eee;font:16px/1.6 system-ui}a,button{display:block;padding:14px;margin:12px 0;background:#006ccf;color:white;border:0;border-radius:12px;font:inherit;text-decoration:none}small{color:#aaa}button{background:#252525;width:100%;text-align:left}</style><h1>Daily · local test</h1><p>This is the new Home running on your laptop, with sample records. It cannot access your real account or change your data.</p><a href="/app?${params}&scenario=everyday">Open sample app</a><a href="/app?${params}&scenario=long">Try long and incomplete records</a><a href="/app?${params}&scenario=empty">Try an empty account</a><button onclick="sessionStorage.removeItem('daily-test-switch-category-phone');location.reload()">Reset sample edits</button><p>Keep the laptop awake and both devices on the same Wi-Fi.</p><small>This HTTP preview checks Safari layout and interactions. It does not verify installed-app caching, offline updates, location permissions or live Firebase sync.</small>`;
const server=http.createServer((req,res)=>{
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'"};
 const reply=(code,type,data)=>{res.writeHead(code,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:data);};
 if(!['GET','HEAD'].includes(req.method))return reply(405,'text/plain','Read-only sample server');
 try{
  const name=decodeURIComponent(new URL(req.url,'http://'+host).pathname).slice(1);
  if(name===''||name==='index.html')return reply(200,'text/html',landing);
  if(name==='app'){
   let html=read('index.html').replace('<head>','<head><base href="/"><script src="/phone-fixture.js"></script><script defer src="/phone-boot.js"></script>');
   html=html.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^\"]+"><\/script>/g,'');
   if(/<script[^>]+src="[^"]*firebasejs/.test(html))throw Error('Production Firebase SDK must never be served by the sample app');
   return reply(200,'text/html',html);
  }
  if(name==='phone-fixture.js')return reply(200,'application/javascript',read('tests/sync-browser-fixture.js').replace('const initial=clone(stores)',read('tests/category-home-fixture.js')+'\n const initial=clone(stores)'));
  if(name==='phone-boot.js')return reply(200,'application/javascript',read('tests/category-phone-boot.js'));
  if(!allowed.has(name))return reply(404,'text/plain','Not available in this sample preview');
  const file=path.resolve(root,name);if(!file.startsWith(root+path.sep))return reply(404,'text/plain','Not found');
  const data=fs.readFileSync(file);res.writeHead(200,{...headers,'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){reply(404,'text/plain','Sample resource unavailable');}
});
server.listen(port,host,()=>console.log('Local iPhone preview: http://'+host+':'+port+'/'));
