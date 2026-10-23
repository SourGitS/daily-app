import express from 'express';
import {randomBytes} from 'node:crypto';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {connectorService,DailyError,blob,fail,protectedPaths,syncFinancialBlob,undoCreatedExpense} from './domain.mjs';
import {configureOAuth,SCOPES} from './oauth.mjs';
import {createMcp} from './mcp.mjs';
import {consentPage} from './consent.mjs';

export function createApp(config,dependencies){
  const {store,db,firebaseAuth}=dependencies,{origin,dailyOrigin,firebaseConfig}=config;
  const oauth=configureOAuth({...config,...dependencies}),service=connectorService(store,{previewKey:config.encryptionKey});
  const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
  app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});next();});
  // Bounded per-instance abuse guard. Hosting instance/request limits are still needed;
  // this is deliberately not presented as a billing cap or global distributed quota.
  const buckets=new Map();
  app.use((req,res,next)=>{
    const now=Date.now(),key=req.ip;
    if(buckets.size>2000)for(const [id,b]of buckets)if(b.until<=now)buckets.delete(id);
    let b=buckets.get(key);if(!b||b.until<=now){if(buckets.size>5000)return res.status(429).set('Retry-After','60').end();b={until:now+60000,n:0};buckets.set(key,b);}
    if(++b.n>180)return res.status(429).set('Retry-After','60').json({status:'failed',error:{code:'RATE_LIMITED',message:'Too many requests. Wait one minute and retrieve the existing request ID.'}});
    next();
  });
  app.get('/health',(_req,res)=>res.json({service:'Daily',status:'available',financialAccess:'authentication required'}));
  const metadata={resource:oauth.resource,authorization_servers:[oauth.issuer],scopes_supported:SCOPES};
  app.get(['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'],(_req,res)=>res.json(metadata));
  app.get('/.well-known/oauth-authorization-server/oauth',(_req,res)=>res.redirect(302,oauth.issuer+'/.well-known/openid-configuration'));
  const body=express.json({limit:'2mb'});
  const bearer=req=>/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'')?.[1];
  async function userAuth(req){
    const token=bearer(req);if(!token)fail('UNAUTHENTICATED','Sign in to Daily.');
    try{return await firebaseAuth.verifyIdToken(token,true);}catch{fail('UNAUTHENTICATED','Daily sign-in expired or was revoked. Sign in again.');}
  }
  const allowedOrigins=new Set([origin,dailyOrigin]);
  function cors(req,res,next){
    const source=req.headers.origin;
    if(source&&!allowedOrigins.has(source)&&!(req.path==='/mcp'&&source==='https://chatgpt.com'))return res.status(403).json({error:{code:'ORIGIN_DENIED',message:'This origin is not permitted.'}});
    if(source)res.set({'Access-Control-Allow-Origin':source,Vary:'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type, MCP-Protocol-Version','Access-Control-Allow-Methods':'GET, POST, OPTIONS'});
    if(req.method==='OPTIONS')return res.sendStatus(204);next();
  }
  app.use('/daily',cors,body);
  app.get('/daily/status',async(req,res)=>{
    const user=await userAuth(req);
    const result=await store.transaction(user.uid,root=>({root,result:{enabled:root.assistant?.enabled===true,account:{uid:user.uid,email:user.email||null},
      connections:Object.entries(root.assistant?.grants||{}).map(([id,g])=>({id,scopes:g.scopes,createdAt:g.createdAt,expiresAt:g.expiresAt,revokedAt:g.revokedAt||null,status:g.revokedAt?'revoked':g.expiresAt<=Date.now()?'expired':'authorized'})),
      operations:blob(root,'aiRequests').filter(r=>r.remote===true).slice(-20).reverse().map(r=>({requestId:r.id,status:r.status,summary:r.summary,recordId:r.record?.id||null,createdAt:r.createdAt,appliedAt:r.appliedAt||null,undoneAt:r.undoneAt||null,error:r.error||null,cloudSave:'verified'}))}}));
    res.json(result);
  });
  app.post('/daily/sync',async(req,res)=>{const user=await userAuth(req);res.json(await store.transaction(user.uid,root=>syncFinancialBlob(root,req.body,Date.now())));});
  app.post('/daily/revoke',async(req,res)=>{const user=await userAuth(req);if(Object.keys(req.body).some(k=>k!=='grantId'))fail('INVALID_INPUT','Unsupported fields.');res.json(await oauth.revoke(user.uid,req.body.grantId));});
  app.post('/daily/undo',async(req,res)=>{
    const user=await userAuth(req);if(Object.keys(req.body).some(k=>k!=='requestId'))fail('INVALID_INPUT','Unsupported fields.');
    res.json(await store.transaction(user.uid,root=>{const row=undoCreatedExpense(root,user.uid,req.body.requestId,Date.now());return {root,result:{status:row.status,recordId:row.record.id,requestId:row.id,cloudSave:'verified'}};}));
  });
  app.get('/interaction/:uid',async(req,res)=>{
    const interaction=await oauth.provider.interactionDetails(req,res);
    if(interaction.uid!==req.params.uid)fail('INVALID_CONSENT','This is not the current interaction.');
    const nonce=randomBytes(18).toString('base64');
    res.set('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}' https://www.gstatic.com; style-src 'nonce-${nonce}'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; frame-src https://${firebaseConfig.authDomain}; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
    res.type('html').send(consentPage({firebaseConfig,uid:interaction.uid,csrf:oauth.csrf(interaction.uid),scopes:String(interaction.params.scope||'').split(' ').filter(s=>SCOPES.includes(s)),nonce}));
  });
  app.post('/interaction/:uid/complete',body,async(req,res)=>{
    if(req.headers.origin!==origin)fail('INVALID_CONSENT','Consent must come from this authorization page.');
    const user=req.body.approve===true?await userAuth(req):null;
    res.json({redirect:await oauth.consent(req,res,user)});
  });
  // OAuth provider owns protocol parsing, PKCE, code exchange, refresh rotation and cookies.
  app.use('/oauth',oauth.provider.callback());
  app.options('/mcp',cors);
  app.post('/mcp',cors,body,async(req,res)=>{
    let principal;
    try{principal=await oauth.authenticate(bearer(req));}
    catch{res.set('WWW-Authenticate',`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`);return res.status(401).json({error:{code:'UNAUTHENTICATED',message:'Reconnect Daily.'}});}
    const server=createMcp(service,principal),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{transport.close().catch(()=>{});server.close().catch(()=>{});});
    await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });
  app.all('/mcp',(_req,res)=>res.status(405).set('Allow','POST').end());
  app.use((error,_req,res,_next)=>{
    const known=error instanceof DailyError,code=known?error.code:'REQUEST_FAILED';
    const status=code==='UNAUTHENTICATED'?401:code==='REVOKED'||code==='INSUFFICIENT_SCOPE'?403:code==='OUTCOME_UNKNOWN'?503:400;
    res.status(status).json({status:code==='OUTCOME_UNKNOWN'?'unknown':'failed',error:{code,message:known?error.message:'Request failed. No confirmed result; check operation status before retrying.'}});
  });
  return {app,oauth,service};
}
