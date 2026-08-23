SP="C:/Users/FRANCO~1/AppData/Local/Temp/claude/C--Users-FrancoisPeters-workout-tracker/1a59964e-11e6-47f8-9e94-7b6677690265/scratchpad"
apply(){ node -e "
const fs=require('fs'); const sp='$SP';
fs.writeFileSync(sp+'/e.json', JSON.stringify([{old:fs.readFileSync(sp+'/old.txt','utf8').replace(/\r\n/g,'\n').trimEnd(), new:fs.readFileSync(sp+'/new.txt','utf8').replace(/\r\n/g,'\n').trimEnd()}]));
" && node "$SP/ed.js" "$1" "$SP/e.json"; }
