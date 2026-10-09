const fs=require('node:fs');
const path=require('node:path');
fs.copyFileSync(path.join(__dirname,'../js/notification-schedule.js'),path.join(__dirname,'schedule.cjs'));
