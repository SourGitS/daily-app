'use strict';
function dailyCachePrefix(scope){
  return 'daily-shell:'+encodeURIComponent(scope)+':';
}
function dailyIsWeatherURL(url){
  const u=new URL(url);
  return u.origin==='https://api.open-meteo.com'&&u.pathname==='/v1/forecast';
}
async function dailyOwnsLegacyCache(name,cache,scope){
  return /^daily-v\d+$/.test(name)&&!!await cache.match(new URL('js/app.js',scope).href);
}
async function dailyClearWeatherResponses(scope){
  if(typeof caches==='undefined')return;
  scope=scope||new URL('./',document.baseURI).href;
  for(const name of await caches.keys()){
    if(!name.startsWith(dailyCachePrefix(scope))&&!/^daily-v\d+$/.test(name))continue;
    const cache=await caches.open(name);
    if(!name.startsWith(dailyCachePrefix(scope))&&!await dailyOwnsLegacyCache(name,cache,scope))continue;
    for(const req of await cache.keys()){
      if(dailyIsWeatherURL(req.url)&&!await cache.delete(req)&&await cache.match(req)){
        throw Error('Weather cache entry could not be cleared.');
      }
    }
  }
}
