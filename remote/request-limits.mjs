// Bound protocol validation work before passing client metadata to the MCP SDK.
// JSON byte limits alone still permit thousands of tiny invalid collection entries.
export function boundedMcpRequest(value){
  const pending=[[value,0]];let nodes=0;
  while(pending.length){
    const [item,depth]=pending.pop();
    if(++nodes>2048||depth>24)return false;
    if(typeof item==='string'){if(item.length>65536)return false;continue;}
    if(item===null||typeof item!=='object')continue;
    const values=Array.isArray(item)?item:Object.values(item);
    if(values.length>(Array.isArray(item)?256:128))return false;
    for(const child of values)pending.push([child,depth+1]);
  }
  return true;
}
