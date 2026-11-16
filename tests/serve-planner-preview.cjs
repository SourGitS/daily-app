// node tests/serve-planner-preview.cjs — a read-only, synthetic app for the layout gallery.
// DAILY_PREVIEW_HOST adds a private LAN address for a phone on the same network.
const fs=require('node:fs'), http=require('node:http'), path=require('node:path'), net=require('node:net');
const {plannerSampleFiles}=require('./planner-browser-fixture.cjs');
const root=__dirname, read=name=>fs.readFileSync(path.join(root,name),'utf8');
const port=Number(process.env.DAILY_PREVIEW_PORT||8822);
const lan=process.env.DAILY_PREVIEW_HOST, hosts=['127.0.0.1'];
if(lan&&lan!==hosts[0]){
  if(!net.isIPv4(lan)||!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(lan))throw Error('Choose the private network address used by this computer.');
  hosts.push(lan);
}
const screens=new Set(['week','review','month','editor','log','finance','home-planner-on','home-planner-off']);
const sample=plannerSampleFiles();
// The optional local font mirror lets the phone use the app's fonts without a CDN request.
const fonts=new Map(), fontDir=process.env.DAILY_PREVIEW_FONT_DIR;
if(fontDir){
  const google=fs.readFileSync(path.join(fontDir,'google.css'),'utf8').replace(/https:\/\/fonts\.gstatic\.com\/[^)]+\/([\w-]+\.ttf)/g,(_,name)=>{
    fonts.set(name,{type:'font/ttf',body:fs.readFileSync(path.join(fontDir,name))});
    return '/fonts/'+name;
  });
  fonts.set('google.css',{type:'text/css',body:google});
  const icons=fs.readFileSync(path.join(fontDir,'tabler-icons.min.css'),'utf8').replace(/url\([^)]+\.woff2[^)]*\)/g,'url(/fonts/tabler-icons.woff2)');
  fonts.set('icons.css',{type:'text/css',body:icons});
  fonts.set('tabler-icons.woff2',{type:'font/woff2',body:fs.readFileSync(path.join(fontDir,'tabler-icons.woff2'))});
}
function handler(req,res){
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; form-action 'self'"};
  function reply(status,type,body){res.writeHead(status,{...headers,'Content-Type':type});res.end(req.method==='HEAD'?undefined:body);}
  if(!['GET','HEAD'].includes(req.method))return reply(405,'text/plain','Read only');
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'||url.pathname==='/home-planner')return reply(200,'text/html; charset=utf-8',read('planner-layouts.html'));
  if(url.pathname==='/app'){
    const screen=screens.has(url.searchParams.get('screen'))?url.searchParams.get('screen'):'week';
    const query=new URLSearchParams('preview&week-preview&home-cards&planner-review&polish&ui=journal&accent=385c72&switch=planner-week');
    query.set('screen',screen);
    const home=screen.startsWith('home-planner-');
    if(home)query.set('switch',screen);
    const view=home?'home':({review:'stats',finance:'budget',log:'log'}[screen]||'notes');
    res.writeHead(302,{...headers,Location:'/tests/sync-browser.html?'+query+'#'+view});return res.end();
  }
  if(url.pathname==='/planner-preview-boot.js')return reply(200,'application/javascript',read('planner-preview-boot.js'));
  const font=url.pathname.startsWith('/fonts/')&&fonts.get(url.pathname.slice(7));
  if(font)return reply(200,font.type,font.body);
  const output=sample(url.pathname.slice(1));
  if(!output)return reply(404,'text/plain','Unavailable in sample preview');
  let body=output.body;
  if(url.pathname==='/tests/sync-browser.html'){
    body=body.replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link [^>]*href="https:[^>]+>/g,'')
      .replace('</head>',(fonts.size?'<link rel="stylesheet" href="/fonts/google.css"><link rel="stylesheet" href="/fonts/icons.css">':'')+'<script src="/planner-preview-boot.js"></script></head>');
  }
  reply(200,output.contentType,body);
}
for(const host of hosts)http.createServer(handler).listen(port,host,()=>console.log('Planner preview http://'+host+':'+port+'/'));
