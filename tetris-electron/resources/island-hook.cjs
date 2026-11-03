// Observational only: never print decisions or block the agent.
const fs=require('node:fs'),net=require('node:net');
const done=()=>process.exit(0);setTimeout(done,1500);
if(!process.env.COLLAB_NOTIFY_ROUTE || !process.env.COLLAB_NOTIFY_SOCKET_FILE) done();
let input='';process.stdin.setEncoding('utf8');
process.stdin.on('data',data=>{input+=data;if(input.length>262144)done()});
process.stdin.on('end',()=>{try{
 const p=JSON.parse(input);const time=Date.now();
 const socket=net.createConnection(fs.readFileSync(process.env.COLLAB_NOTIFY_SOCKET_FILE,'utf8').trim());
 socket.on('error',done);socket.on('connect',()=>socket.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'terminal.island-event',params:{route:process.env.COLLAB_NOTIFY_ROUTE,event:p.hook_event_name,time,tool:typeof p.tool_name==='string'?p.tool_name.slice(0,120):'',cwd:typeof p.cwd==='string'?p.cwd.slice(0,1000):''}})+'\n'));
 socket.on('data',done);
}catch{done()}});
