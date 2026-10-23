// Run ONLY after approval to create persistent production credentials, in a private
// operator environment. Values are written to files, never printed or sent to chat.
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
if(process.env.DAILY_APPROVED_OPERATION!=='create-connector-secrets')throw Error('Production credential creation has not been approved.');
const destination=resolve(process.argv[2]||'secrets.local');
if(!destination.endsWith('.local'))throw Error('Use a new private directory ending in .local.');
await mkdir(destination,{recursive:false,mode:0o700});
const key=generateKeyPairSync('rsa',{modulusLength:3072}).privateKey.export({format:'jwk'});
Object.assign(key,{use:'sig',alg:'RS256',kid:randomBytes(12).toString('hex')});
const files={'oidc-jwks.json':JSON.stringify({keys:[key]}),'cookie-keys.json':JSON.stringify([randomBytes(48).toString('base64')]),'connector-key.txt':randomBytes(32).toString('base64')};
for(const [name,value]of Object.entries(files))await writeFile(join(destination,name),value,{mode:0o600,flag:'wx'});
console.log('Created private files. Import them directly into Secret Manager; do not paste their contents into chat.');
