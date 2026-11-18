import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedMcpRequest} from '../request-limits.mjs';

test('ordinary MCP requests fit while metadata validation work stays bounded',()=>{
  assert.equal(boundedMcpRequest({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'Daily test',version:'1',icons:[{src:'https://example.test/icon.png',sizes:['48x48']}]}}}),true);
  assert.equal(boundedMcpRequest({params:{clientInfo:{icons:Array(5000).fill(null)}}}),false);
  assert.equal(boundedMcpRequest({params:{clientInfo:{icons:[{src:'https://example.test/icon.png',sizes:Array(257).fill('48x48')}]}}}),false);
  assert.equal(boundedMcpRequest({params:{text:'x'.repeat(65537)}}),false);
  assert.equal(boundedMcpRequest({params:{items:Array.from({length:16},()=>Array(256).fill(null))}}),false);
  let deep={};for(let i=0;i<26;i++)deep={child:deep};
  assert.equal(boundedMcpRequest(deep),false);
});
