const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8')
  .replace('<head>','<head>\n<base href="../">\n<script src="tests/sync-browser-fixture.js"></script>')
  .replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^\"]+"><\/script>/g,'');
fs.writeFileSync(path.join(__dirname,'sync-browser.html'),html);
