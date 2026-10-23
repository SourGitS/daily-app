import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,createHash} from 'node:crypto';
import {createApp} from '../app.mjs';
import {fixture} from './fixtures.mjs';

class MemoryOAuthAdapter {
  static rows=new Map();
  constructor(name){this.name=name;}
  key(id){return this.name+':'+id;}
  async upsert(id,payload,ttl){MemoryOAuthAdapter.rows.set(this.key(id),{...structuredClone(payload),_expiry:Date.now()+(ttl||3600)*1000});}
  async find(id){const r=MemoryOAuthAdapter.rows.get(this.key(id));if(r&&r._expiry>Date.now())return structuredClone(r);}
  async destroy(id){MemoryOAuthAdapter.rows.delete(this.key(id));}
  async consume(id){const r=MemoryOAuthAdapter.rows.get(this.key(id));if(!r||r.consumed)throw Error('Already consumed');r.consumed=Math.floor(Date.now()/1000);}
  async revokeByGrantId(id){for(const [k,v]of MemoryOAuthAdapter.rows)if(k.startsWith(this.name+':')&&v.grantId===id)MemoryOAuthAdapter.rows.delete(k);}
  async findByUid(uid){for(const[k,v]of MemoryOAuthAdapter.rows)if(k.startsWith(this.name+':')&&v.uid===uid)return structuredClone(v);}
}
test('real OAuth PKCE and MCP HTTP flow: account isolation, expiry, revocation, duplicate retries and undo',async t=>{
  const f=fixture(),privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'jwk'});
  privateKey.kid='ephemeral-test-key';privateKey.use='sig';privateKey.alg='RS256';
  let disabled=false;
  const auth={getUser:async uid=>({uid,email:uid+'@example.test',emailVerified:true,disabled,tokensValidAfterTime:'1970-01-01T00:00:00Z'}),
    verifyIdToken:async token=>{if(token!=='synthetic-alice'||disabled)throw Error('revoked');return {uid:'alice',email:'alice@example.test',auth_time:Math.floor(Date.now()/1000)};}};
  // Reserve an ephemeral localhost port; no production Firebase, OAuth client or grants.
  const {createServer}=await import('node:net');const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const origin='http://127.0.0.1:'+port,redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  const {app,oauth}=createApp({origin,dailyOrigin:'https://sourgits.github.io',clientId:'daily-fuji',redirectUris:[redirect],firebaseConfig:{authDomain:'synthetic.invalid'},jwks:{keys:[privateKey]},cookieKeys:[randomBytes(32).toString('base64')],encryptionKey:randomBytes(32)},
    {store:f.store,firebaseAuth:auth,adapter:MemoryOAuthAdapter});
  const server=app.listen(port,'127.0.0.1');t.after(()=>new Promise(r=>server.close(r)));
  const jar=new Map();
  async function request(path,options={}){
    const r=await fetch(origin+path,{...options,redirect:'manual',headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...options.headers}});
    for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
    return r;
  }
  const metadata=await (await request('/oauth/.well-known/openid-configuration')).json();
  assert.equal(metadata.issuer,origin+'/oauth');assert.ok(metadata.code_challenge_methods_supported.includes('S256'));
  const unauth=await request('/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate'),/oauth-protected-resource/);
  const verifier=randomBytes(32).toString('base64url'),params=new URLSearchParams({client_id:'daily-fuji',redirect_uri:redirect,response_type:'code',scope:'openid offline_access bills:read expenses:create',resource:origin+'/mcp',state:'test-state',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  const badCallback=new URLSearchParams(params);badCallback.set('redirect_uri','https://attacker.invalid/callback');
  assert.equal((await request('/oauth/auth?'+badCallback)).status,400);
  const noPKCE=new URLSearchParams(params);noPKCE.delete('code_challenge');noPKCE.delete('code_challenge_method');
  const pkceRefusal=await request('/oauth/auth?'+noPKCE);assert.ok(pkceRefusal.status===400||new URL(pkceRefusal.headers.get('location')).searchParams.has('error'));
  let r=await request('/oauth/auth?'+params);assert.equal(r.status,303);
  let location=new URL(r.headers.get('location'),origin);assert.ok(location.pathname.startsWith('/interaction/'));
  r=await request(location.pathname);const html=await r.text(),csrf=JSON.parse(/,csrf=("[^"]+")/.exec(html)[1]);
  r=await request(location.pathname+'/complete',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer synthetic-alice'},body:JSON.stringify({approve:true,csrf:'wrong'})});assert.equal(r.status,400);
  r=await request(location.pathname+'/complete',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer synthetic-alice'},body:JSON.stringify({approve:true,csrf})});
  assert.equal(r.status,200);location=new URL((await r.json()).redirect);
  for(let i=0;i<5&&location.origin===origin;i++){r=await request(location.pathname+location.search);assert.ok([302,303].includes(r.status),JSON.stringify([...MemoryOAuthAdapter.rows].filter(([k])=>k.startsWith('Interaction:')).map(([,v])=>({prompt:v.prompt,result:v.result}))));location=new URL(r.headers.get('location'),origin);}
  assert.equal(location.origin,'https://chatgpt.com');assert.equal(location.searchParams.get('state'),'test-state');assert.equal(location.searchParams.get('iss'),origin+'/oauth');
  const code=location.searchParams.get('code');assert.ok(code);
  const tokenRequest=(codeVerifier=verifier)=>request('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:'daily-fuji',code,redirect_uri:redirect,code_verifier:codeVerifier,resource:origin+'/mcp'})});
  // A wrong verifier must not produce an access token.
  r=await tokenRequest(randomBytes(32).toString('base64url'));assert.equal(r.status,400);
  r=await tokenRequest();const tokens=await r.json();assert.equal(r.status,200,JSON.stringify(tokens));assert.ok(tokens.access_token);assert.ok(tokens.refresh_token);
  async function call(method,params,token=tokens.access_token){const response=await request('/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return {status:response.status,data:await response.json()};}
  const initialized=await call('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'isolated-test',version:'1'}});assert.equal(initialized.status,200);
  const list=await call('tools/list',{});assert.equal(list.data.result.tools.length,7);
  const tool=async(name,args={})=>{const r=await call('tools/call',{name,arguments:args});return r.data.result?.structuredContent||r.data.result||r.data;};
  const identity=await tool('connection_status');assert.equal(identity.accountId,'alice');
  assert.equal((await tool('connection_status',{uid:'bob'})).isError,true);
  const bills=await tool('scheduled_bills',{from:'2026-10-23',to:'2026-10-30'});assert.equal(bills.items.length,2);
  assert.equal((await tool('expense_references')).accounts[0].id,'card');
  const preview=await tool('preview_expense',{requestId:f.requestId,expense:f.expense});assert.equal(preview.status,'pending');
  const input={requestId:f.requestId,previewToken:preview.previewToken};
  const saved=await tool('commit_expense',input);assert.equal(saved.status,'committed');assert.equal((await tool('commit_expense',input)).recordId,saved.recordId);
  assert.equal((await tool('operation_result',{requestId:f.requestId})).status,'committed');
  assert.equal((await tool('undo_expense',{requestId:f.requestId})).status,'undone');
  // Actual opaque token lookup rejects expired access, including a valid persisted grant.
  const entry=[...MemoryOAuthAdapter.rows.values()].find(v=>v.kind==='AccessToken');assert.ok(entry);
  const exp=entry.exp;entry.exp=Math.floor(Date.now()/1000)-1;assert.equal((await call('tools/list',{})).status,401);entry.exp=exp;
  const refresh=await request('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:'daily-fuji',refresh_token:tokens.refresh_token,resource:origin+'/mcp'})});
  const rotated=await refresh.json();assert.equal(refresh.status,200);assert.ok(rotated.refresh_token!==tokens.refresh_token);
  const p=await oauth.authenticate(tokens.access_token);await oauth.revoke(p.uid,p.grantId);
  const replay=await request('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:'daily-fuji',refresh_token:rotated.refresh_token,resource:origin+'/mcp'})});assert.equal(replay.status,400);
  assert.equal((await call('tools/list',{})).status,401);
  assert.equal((await call('tools/list',{},'not-a-token')).status,401);
  disabled=true;r=await request('/daily/status',{headers:{Authorization:'Bearer synthetic-alice'}});assert.equal(r.status,401);
});
