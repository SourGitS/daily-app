const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('workout CSV handles names with punctuation, embedded line breaks, numeric zeroes and formula-looking text',async()=>{
  const records=[{date:'2026-11-16',dayNum:1,sessionType:'Pull',effort:0,exercises:[
    {name:'Row, "seated"\nvariation',sets:[{weight:0,reps:10}]},{name:'=example',sets:[{weight:-5,reps:2}]}]}];
  let blob;
  const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8').match(/^function exportData\(\)\{[\s\S]*?^\}/m)[0];
  vm.runInNewContext(source+'\nexportData()',{S:{sessions:records},Blob,URL:{createObjectURL:b=>{blob=b;return 'test'}},
    getLocalDate:()=>records[0].date,document:{createElement:()=>({click(){}})}});
  const csv=await blob.text();
  const parser=fs.readFileSync(path.join(__dirname,'../js/finance-import.js'),'utf8');
  const rows=vm.runInNewContext(parser+'\nacctFinCsvParse(csv)',{csv});
  assert.equal(Object.keys(rows[0]).length,8);
  assert.equal(rows[0].exercise,records[0].exercises[0].name);
  assert.equal(rows[0]['weight_(kg)'],'0');assert.equal(rows[1].reps,'2');
  assert.equal(csv.split('\n').slice(1).join('\n'),'2026-11-16,1,Pull,"Row, ""seated""\nvariation",1,0,10,0\n2026-11-16,1,Pull,\'=example,1,-5,2,0');
});
