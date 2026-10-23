import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {getAuth} from 'firebase-admin/auth';
import {firebaseStore} from './firebase-store.mjs';
import {createApp} from './app.mjs';

const required=name=>{const value=process.env[name];if(!value)throw Error('Missing configuration: '+name);return value;};
const origin=required('DAILY_CONNECTOR_ORIGIN');
if(!/^https:\/\/[^/]+$/.test(origin))throw Error('Production connector requires an exact HTTPS origin.');
const config={origin,dailyOrigin:'https://sourgits.github.io',clientId:'daily-fuji',
  redirectUris:JSON.parse(required('DAILY_OAUTH_REDIRECT_URIS')),firebaseConfig:JSON.parse(required('DAILY_FIREBASE_WEB_CONFIG')),
  jwks:JSON.parse(required('DAILY_OIDC_JWKS')),cookieKeys:JSON.parse(required('DAILY_COOKIE_KEYS')),
  encryptionKey:Buffer.from(required('DAILY_CONNECTOR_KEY'),'base64')};
if(config.encryptionKey.length!==32||!Array.isArray(config.cookieKeys)||!config.cookieKeys.length||!config.cookieKeys.every(k=>typeof k==='string'&&k.length>=32))throw Error('Invalid Secret Manager key configuration.');
if(process.env.FIREBASE_DATABASE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Production entry point refuses emulator configuration. Use the isolated test harness.');
initializeApp({credential:applicationDefault(),databaseURL:required('DAILY_DATABASE_URL')});
const db=getDatabase(),firebaseAuth=getAuth(),store=firebaseStore(db);
const {app}=createApp(config,{db,firebaseAuth,store});
app.listen(Number(process.env.PORT)||8080,'0.0.0.0',()=>console.log('Daily connector listening. Credentials and request bodies are never logged.'));
