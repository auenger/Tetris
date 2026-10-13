// Runs only as an agent lifecycle hook. Never let notification failure fail a task.
const fs = require('node:fs');
const net = require('node:net');
const mode = process.argv[2];
const done = () => process.exit(0);
const timer = setTimeout(done, 1800);
function preview(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const text = value.slice(0, 16000)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ').trim();
  return text.length > 300 ? text.slice(0, 299) + '…' : text || fallback;
}
function send(payload) {
  try {
    const route = process.env.COLLAB_NOTIFY_ROUTE;
    if (!route || !process.env.COLLAB_NOTIFY_SOCKET_FILE) return done();
    const socket = net.createConnection(fs.readFileSync(process.env.COLLAB_NOTIFY_SOCKET_FILE, 'utf8').trim());
    socket.on('error', done);
    socket.on('connect', () => socket.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'terminal.notify',params:{route,...payload}})+'\n'));
    socket.on('data', () => { clearTimeout(timer); socket.destroy(); done(); });
  } catch { done(); }
}
if (mode === 'codex') {
  try {
    const p = JSON.parse(process.argv[3] || '{}');
    if (p.type !== 'agent-turn-complete') done();
    send({title:'Codex',body:preview(p['last-assistant-message'], '本轮回复已完成'),kind:'complete'});
  } catch { done(); }
} else {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', data => { raw += data; if(raw.length > 262144) done(); });
  process.stdin.on('end', () => {
    try {
      const p = JSON.parse(raw || '{}');
      if (mode === 'claude-stop' && p.stop_hook_active) return done();
      if (mode === 'claude-stop') send({title:'Claude Code',body:preview(p.last_assistant_message, '本轮回复已完成'),kind:'complete'});
      else if(mode === 'claude-attention' && ['permission_prompt','elicitation_dialog'].includes(p.notification_type))
        send({title:'Claude Code',body:preview(p.message, '等待你的确认或输入'),kind:'attention'});
      else done();
    } catch { done(); }
  });
}
