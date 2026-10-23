import {Provider,errors} from 'oidc-provider';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {DailyError,fail} from './domain.mjs';
import {oauthAdapter} from './oauth-adapter.mjs';

export const SCOPES=['bills:read','expenses:create'];
export function configureOAuth({origin,db,store,firebaseAuth,jwks,cookieKeys,encryptionKey,clientId,redirectUris,adapter}){
  const resource=origin+'/mcp',issuer=origin+'/oauth';
  if(!redirectUris?.length||redirectUris.some(u=>!u.startsWith('https://chatgpt.com/')))throw Error('Exact approved ChatGPT callback URLs are required.');
  const provider=new Provider(issuer,{
    adapter:adapter||oauthAdapter(db,encryptionKey),jwks,cookies:{keys:cookieKeys},
    clients:[{client_id:clientId,client_name:'Daily for Fuji',redirect_uris:redirectUris,response_types:['code'],grant_types:['authorization_code','refresh_token'],token_endpoint_auth_method:'none'}],
    scopes:['openid','email','offline_access',...SCOPES],claims:{openid:['sub'],email:['email','email_verified']},
    pkce:{required:()=>true},clockTolerance:0,
    features:{devInteractions:{enabled:false},revocation:{enabled:true},resourceIndicators:{enabled:true,
      defaultResource:()=>resource,useGrantedResource:()=>true,
      getResourceServerInfo:(_ctx,indicator)=>{if(indicator!==resource)throw new errors.InvalidTarget();return {scope:SCOPES.join(' '),audience:resource,accessTokenFormat:'opaque',accessTokenTTL:300};}}},
    ttl:{AccessToken:300,IdToken:300,AuthorizationCode:60,Grant:30*86400,Interaction:600,RefreshToken:30*86400,Session:3600},
    rotateRefreshToken:()=>true,issueRefreshToken:()=>true,revokeGrantPolicy:()=>true,
    interactions:{url:(_ctx,interaction)=>origin+'/interaction/'+interaction.uid},
    renderError:async ctx=>{ctx.type='html';ctx.body='<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily connection error</title><main><h1>Daily connection could not continue</h1><p>Return to ChatGPT Plugins and reconnect. Check the registered callback URL and required permissions. No expense was created by this sign-in attempt.</p></main></html>';},
    findAccount:async(_ctx,uid)=>{const u=await firebaseAuth.getUser(uid);if(u.disabled)return undefined;return {accountId:u.uid,claims:async()=>({sub:u.uid,email:u.email,email_verified:u.emailVerified===true})};}
  });
  provider.proxy=true;
  const csrf=id=>createHmac('sha256',encryptionKey).update('consent:'+id).digest('base64url');
  function verifyCSRF(id,token){const a=Buffer.from(String(token||'')),b=Buffer.from(csrf(id));if(a.length!==b.length||!timingSafeEqual(a,b))fail('INVALID_CONSENT','Consent expired or does not match this browser interaction.');}
  async function authenticate(bearer){
    if(typeof bearer!=='string'||bearer.length>8192)fail('UNAUTHENTICATED','Connect Daily first.');
    const token=await provider.AccessToken.find(bearer);
    if(!token||token.isExpired||token.aud!==resource||token.clientId!==clientId||!token.grantId)fail('UNAUTHENTICATED','Daily access is expired or invalid. Reconnect.');
    const grant=await provider.Grant.find(token.grantId);
    if(!grant||grant.isExpired||grant.accountId!==token.accountId)fail('REVOKED','The Daily authorization grant was revoked.');
    const u=await firebaseAuth.getUser(token.accountId);
    if(u.disabled)fail('REVOKED','This Daily account is disabled.');
    const p={uid:u.uid,email:u.email||null,grantId:token.grantId,expiresAt:token.exp*1000,scopes:String(token.scope||'').split(' ')};
    await store.transaction(u.uid,root=>{
      const saved=root.assistant?.grants?.[p.grantId];
      if(!saved||saved.revokedAt||saved.expiresAt<=Date.now()||saved.authTime<Date.parse(u.tokensValidAfterTime||'1970-01-01'))fail('REVOKED','The Daily connection must be authorized again.');
      return {root,result:true};
    });
    return p;
  }
  async function consent(req,res,verified){
    const interaction=await provider.interactionDetails(req,res);
    if(interaction.uid!==req.params.uid)fail('INVALID_CONSENT','This is not the current browser interaction.');
    verifyCSRF(interaction.uid,req.body.csrf);
    if(req.body.approve!==true)return provider.interactionResult(req,res,{error:'access_denied',error_description:'Connection declined'},{mergeWithLastSubmission:false});
    if(interaction.params.client_id!==clientId)fail('INVALID_CONSENT','Unknown OAuth client.');
    const requested=String(interaction.params.scope||'').split(' ').filter(s=>SCOPES.includes(s));
    if(!requested.length)fail('INVALID_CONSENT','No supported Daily permissions requested.');
    const uid=verified.uid,now=Date.now();
    // Deployment activation is an explicit, separate step; consent cannot turn on the
    // production protocol or weaken database rules by itself.
    await store.transaction(uid,root=>{if(!root.assistant?.enabled)fail('NOT_ENABLED','The secure Daily service has not been enabled for this account.');return {root,result:true};});
    const grant=new provider.Grant({accountId:uid,clientId});
    // Advertise resource scopes in discovery as well, so clients can request them.
    // oidc-provider also tracks advertised scopes as encountered OIDC consent scopes.
    grant.addOIDCScope(String(interaction.params.scope||'').split(' ').filter(s=>['openid','email','offline_access',...SCOPES].includes(s)).join(' '));
    grant.addResourceScope(resource,requested.join(' '));
    const grantId=await grant.save();
    try{
      await store.transaction(uid,root=>{
        if(!root.assistant?.enabled)fail('NOT_ENABLED','Daily remote access was disabled.');
        root.assistant.grants||={};root.assistant.grants[grantId]={uid,clientId,scopes:requested,createdAt:now,expiresAt:now+30*864e5,authTime:verified.auth_time*1000};
        return {root,result:true};
      });
      return await provider.interactionResult(req,res,{login:{accountId:uid,remember:false},consent:{grantId}},{mergeWithLastSubmission:false});
    }catch(e){await grant.destroy();throw e;}
  }
  async function revoke(uid,grantId){
    if(typeof grantId!=='string'||!grantId||/[.#$\[\]\/]/.test(grantId))fail('INVALID_GRANT','Invalid connection reference.');
    // Revoke in the same transaction domain as commits first. A token cleanup failure
    // cannot leave permission to write after this acknowledgment.
    await store.transaction(uid,root=>{
      const g=root.assistant?.grants?.[grantId];if(!g||g.uid!==uid)fail('NOT_FOUND','This connection does not belong to your account.');
      g.revokedAt||=Date.now();return {root,result:true};
    });
    try{const g=await provider.Grant.find(grantId);if(g&&g.accountId===uid)await g.destroy();await provider.AccessToken.revokeByGrantId(grantId);await provider.RefreshToken.revokeByGrantId(grantId);}catch{/* Access is already blocked by the authoritative grant tombstone. */}
    return {status:'revoked',cloudSave:'verified',grantId};
  }
  return {provider,resource,issuer,csrf,authenticate,consent,revoke};
}
