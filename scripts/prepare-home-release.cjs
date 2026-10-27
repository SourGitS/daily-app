// Creates a local static release candidate. Does not commit, push, deploy or touch other checkouts.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sw=read('service-worker.js'),cache=sw.match(/const CACHE_NAME = '([^']+)'/)[1];
if(!/window\.DAILY_REMOTE_CONFIG\s*=\s*null\s*;/.test(read('js/ai-remote-config.js')))throw Error('Remote connector must remain disabled');
if(!/enabled\s*:\s*false/.test(read('js/notification-config.js')))throw Error('Push backend must remain disabled');
const assets=vm.runInNewContext(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]),files=new Set(['index.html','manifest.json','service-worker.js']);
assets.filter(x=>x.startsWith('./')&&x!=='./').forEach(x=>files.add(x.slice(2)));
const html=read('index.html');for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){const p=m[1].split('?')[0];if(/^(?:https?:|data:|#)/.test(p)||!p.includes('.'))continue;if(!files.has(p))throw Error('HTML dependency missing from release assets: '+p);}
const stamp=new Date().toISOString().replace(/[-:.]/g,'');
const out=path.join(root,'temp-analysis','releases',cache+'-'+stamp);fs.mkdirSync(out,{recursive:true});
const hashes=[];for(const file of [...files].sort()){
 const src=path.resolve(root,file),dst=path.resolve(out,file);if(!src.startsWith(root+path.sep)||!dst.startsWith(out+path.sep))throw Error('Unexpected asset path');
 const data=fs.readFileSync(src);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,data);hashes.push({file,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
}
fs.writeFileSync(path.join(out,'.nojekyll'),'');
const rev=ref=>cp.execFileSync('git',['rev-parse',ref],{cwd:root,encoding:'utf8'}).trim();
const manifest={cache,createdAt:new Date().toISOString(),base:rev('HEAD'),verifiedMain:rev('origin/main'),remoteConnectorEnabled:false,pushBackendEnabled:false,defaultHome:'category',publication:'not published',files:hashes};
manifest.branch=cp.execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim();
fs.writeFileSync(path.join(out,'release-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({out,cache,files:hashes.length,base:manifest.base,verifiedMain:manifest.verifiedMain},null,2));
