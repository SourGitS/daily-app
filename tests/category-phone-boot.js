// Test-only startup. The fixture supplies a mock account, mock cloud and memory storage.
addEventListener('load',()=>{
 document.title='Daily · local sample test';
 const timer=setInterval(()=>{
  if(typeof _cloudWorkoutReady==='undefined'||!_cloudWorkoutReady)return;
  clearInterval(timer);obDismiss();dailyUpdateDismiss();setView('home');
 },50);
});
