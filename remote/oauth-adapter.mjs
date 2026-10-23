import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

// Tokens and session payloads stay in private Firebase storage encrypted with a Secret
// Manager key. Database keys/indexes are hashes, never bearer tokens or authorization codes.
export function oauthAdapter(db,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('OAuth encryption key must be 32 bytes.');
  const digest=s=>createHash('sha256').update(String(s)).digest('hex');
  const seal=(value,aad)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));return {iv:iv.toString('base64url'),body:Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]).toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};};
  const open=(v,aad)=>{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64url'));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(Buffer.from(v.tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(v.body,'base64url')),decipher.final()]).toString());};
  return class Adapter {
    constructor(name){this.name=name;this.root=db.ref('dailyConnectorOAuth/'+name);}
    id(id){return digest(this.name+':'+id);}
    async upsert(id,payload,expiresIn){
      const k=this.id(id),expiresAt=expiresIn?Date.now()+expiresIn*1000:Date.now()+31*864e5;
      const entry={sealed:seal(payload,k),expiresAt};
      for(const field of ['uid','userCode','grantId'])if(payload[field])entry[field+'Hash']=digest(payload[field]);
      await this.root.child(k).set(entry);
    }
    async find(id){
      const k=this.id(id),v=(await this.root.child(k).get()).val();
      return v&&v.expiresAt>Date.now()?open(v.sealed,k):undefined;
    }
    async indexed(field,value){
      const rows=(await this.root.orderByChild(field+'Hash').equalTo(digest(value)).limitToFirst(1).get()).val()||{};
      const [k,v]=Object.entries(rows)[0]||[];return v&&v.expiresAt>Date.now()?open(v.sealed,k):undefined;
    }
    findByUid(uid){return this.indexed('uid',uid);}
    findByUserCode(code){return this.indexed('userCode',code);}
    async consume(id){
      const k=this.id(id);let consumed=false;
      await this.root.child(k).transaction(v=>{
        consumed=false;
        // Admin SDK transactions can begin with an empty local cache even after get().
        // Ask the server to compare/retry; aborting here would reject every fresh process.
        if(v===null)return null;
        if(!v||v.expiresAt<=Date.now())return;
        const payload=open(v.sealed,k);if(payload.consumed)return;
        payload.consumed=Math.floor(Date.now()/1000);consumed=true;return {...v,sealed:seal(payload,k)};
      },undefined,false).then(r=>{if(!r.committed||!consumed)throw Error('Authorization artifact already consumed or expired');});
    }
    async destroy(id){
      // OAuth revocation and refresh-token replay also destroy a Grant. Serialize that
      // revocation with financial commits BEFORE acknowledging protocol success.
      if(this.name==='Grant'){
        const payload=await this.find(id),uid=payload?.accountId;
        if(uid&&typeof uid==='string'&&!/[.#$\[\]\/]/.test(uid))await db.ref('users/'+uid).transaction(root=>{
          if(root===null)return null;
          const grant=root.assistant?.grants?.[id];if(grant&&grant.uid===uid)grant.revokedAt||=Date.now();return root;
        },undefined,false);
      }
      await this.root.child(this.id(id)).remove();
    }
    async revokeByGrantId(grantId){
      const entries=(await this.root.orderByChild('grantIdHash').equalTo(digest(grantId)).get()).val()||{};
      if(Object.keys(entries).length)await this.root.update(Object.fromEntries(Object.keys(entries).map(k=>[k,null])));
    }
  };
}
