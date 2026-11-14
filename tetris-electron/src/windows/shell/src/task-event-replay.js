import './task-event-replay.css';
import { enhanceSelect } from '../../../shared/ui/select-control.js';

const REPLAY_LABELS = {
  'task.created': '任务创建', 'task.specified': '任务要求已记录', 'task.execution_resolved': '执行范围已确定',
  'worker.bound': '关联 Worker', 'worker.linked': 'Worker 出现', 'worker.reported': 'Worker 回报',
  'run.queued': '等待执行', 'run.started': '开始执行', 'run.stopped': 'Worker 已停止', 'tool.updated': '工具执行',
  'run.ready_for_review': '等待验收', 'run.failed': '执行失败', 'run.blocked': '执行受阻', 'run.cancelled': '已取消',
  'run.interrupted': '执行中断', 'run.session_missing': '执行会话不可用', 'worker.recovery_queued': '恢复任务已入队',
  'decision.requested': '等待你的决定', 'decision.responded': '收到你的决定', 'decision.delivered': '交付你的决定',
  'decision.delivery_unconfirmed': '决定交付未确认', 'decision.delivery_failed': '决定交付失败', 'decision.cancelled': '决定已取消',
  'task.accepted': '已验收', 'instruction.queued': '补充要求入队', 'instructions.interrupted': '排队指令已中断',
  'artifact.unavailable': '交付文件不可用', 'artifact.opened': '打开历史产物', 'report.opened': '打开报告',
  'agent.summarized': 'Tetris Agent 回报', 'supervisor.summarized': 'Tetris Agent 回报',
};
function replayLabel(event) {
  if (event.type === 'user.intent') return ({ create_task: '收到任务要求', send_task_message: '收到补充要求', cancel_task: '收到取消要求' })[event.payload?.action] || '收到用户要求';
  if (event.type === 'artifact.created') return ({ 'raw-execution-log': '原始执行记录已保存', 'execution-log': '执行记录已保存', 'result-summary': '结果摘要已保存', deliverable: '交付文件已保存' })[event.payload?.kind] || '产物已保存';
  return REPLAY_LABELS[event.type] || '任务进展';
}
function replayText(payload, userTextLabel = '你的决定') {
  if (typeof payload === 'string') return payload;
  if (!payload) return '';
  const names = { text: '', texts: '未执行的要求', title: '', goal: '目标', scope: '范围', expectedArtifacts: '预期交付', acceptance: '验收标准', prompt: '执行要求', question: '需要决定', reason: '原因', recommendation: '建议', impact: '影响', userText: userTextLabel, interpretation: '理解', instruction: '执行指令', summary: '结果', detail: '说明', verification: '验证', remaining: '未完成事项', stopReason: '停止原因' };
  const lines = [];
  for (const [key, name] of Object.entries(names)) {
    const value = payload[key];
    if (typeof value === 'string' && value) lines.push(`${name ? `${name}：` : ''}${value}`);
    else if (Array.isArray(value) && value.length && value.every(item => typeof item === 'string')) lines.push(`${name}：${value.join('；')}`);
  }
  return lines.join('\n\n');
}

/** Read-only canvas projection. No task APIs, webviews, file reads or live state. */
export function createEventReplay(host, task, onClose) {
  const id = `agent:replay:${crypto.randomUUID()}`;
  const events = structuredClone(task.events || []).sort((a, b) => a.sequence - b.sequence);
  const artifacts = structuredClone(task.artifacts || []);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, playing = false, timer = null, speed = 1, skipWait = true, disposed = false;
  let layoutSignature = '', flightFrame = 0, activeFlight = null;
  const camera = { x: 0, y: 0, zoom: 1 }, reportViews = new Map();
  const root = node('section', 'agent-event-replay'); root.dataset.canvasId = id; root.dataset.playing = 'false'; root.tabIndex = -1;
  root.setAttribute('aria-label', `${task.title || '任务'}回放`);
  const viewport = node('div', 'replay-viewport'), world = node('div', 'replay-world'); viewport.append(world);
  const delegate = node('article', 'replay-delegation');
  delegate.append(node('strong', '', 'Tetris Agent'), node('p', 'replay-delegation-text'));
  const worker = tile('worker', 'Worker'); worker.element.dataset.replayWorker = 'true';
  const workerStatus = node('div', 'replay-worker-status'), workerState = node('span', 'replay-state'), provider = node('span', 'replay-provider');
  workerStatus.append(workerState, provider); worker.element.insertBefore(workerStatus, worker.body);
  worker.footer.textContent = '由 Tetris Agent 派发 · 历史记录';
  world.append(delegate, worker.element);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('replay-canvas-effects'); svg.setAttribute('aria-hidden', 'true');
  const links = svgNode('g'), outline = svgNode('rect', { class: 'replay-running-outline', rx: 6, fill: 'none', pathLength: 100 });
  const trail = svgNode('path', { class: 'replay-flight-trail', fill: 'none' }), glow = svgNode('circle', { r: 8, class: 'replay-flight-glow' }), dot = svgNode('circle', { r: 3, class: 'replay-flight-dot' });
  const flight = svgNode('g'); flight.style.display = 'none'; flight.append(trail, glow, dot); svg.append(links, outline, flight); world.append(svg);
  const empty = node('p', 'replay-empty', '历史记录不完整：此任务没有可回放的事件。'); viewport.append(empty);
  const controls = node('footer', 'replay-controls');
  const play = button('播放', () => {
    if (playing) { pause(); return; }
    if (index >= events.length - 1) { index = 0; render(true); }
    playing = true; updatePlay(); schedule();
  });
  play.className = 'replay-play';
  const slider = node('input', 'replay-progress'); slider.type = 'range'; slider.min = '0'; slider.max = String(Math.max(0, events.length - 1)); slider.value = '0'; slider.setAttribute('aria-label', '回放进度');
  slider.addEventListener('input', () => seek(Number(slider.value)));
  const progress = node('div', 'replay-progress-wrap'), position = node('span', 'replay-position'); progress.append(slider, position);
  const speeds = node('select', 'replay-speed'); speeds.setAttribute('aria-label', '回放速度');
  for (const value of [.5, 1, 2, 4]) speeds.append(new Option(`${value}×`, String(value)));
  speeds.value = '1'; speeds.addEventListener('change', () => { speed = Number(speeds.value); if (playing) schedule(); });
  const waits = button('压缩等待', () => { skipWait = !skipWait; waits.setAttribute('aria-pressed', String(skipWait)); waits.title = skipWait ? '已压缩长时间等待' : '按原始时间等待'; if (playing) schedule(); render(false); }); waits.className = 'replay-waits'; waits.setAttribute('aria-pressed', 'true'); waits.title = '已压缩长时间等待';
  const back = button('返回实时任务', destroy); back.className = 'replay-exit';
  controls.append(play, progress, speeds, waits, back); root.append(viewport, controls); host.append(root);
  const speedSelect = enhanceSelect(speeds, { variant: 'ghost' });

  function node(tag, className = '', text) { const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element; }
  function button(text, action) { const element = node('button', '', text); element.type = 'button'; element.addEventListener('click', action); return element; }
  function svgNode(tag, attrs = {}) { const element = document.createElementNS(svg.namespaceURI, tag); for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value)); return element; }
  function tile(kind, title) {
    const element = node('article', `replay-tile replay-${kind}`), header = node('header', 'replay-tile-title'), heading = node('span', '', title), body = node('div', 'replay-tile-body'), footer = node('footer', 'replay-tile-footer');
    header.append(heading, node('span', 'replay-readonly', '回放')); element.append(header, body, footer);
    return { element, heading, body, footer };
  }
  function section(kind, title, content, collapsible = false) {
    const element = node(collapsible ? 'details' : 'section', `replay-worker-section ${kind}`);
    if (title) element.append(node(collapsible ? 'summary' : 'strong', '', title));
    if (content) element.append(node('pre', '', content));
    return element;
  }
  function artifactFor(event) {
    const artifactId = event.payload?.artifactId || event.payload?.id, path = event.payload?.path;
    if (artifactId) return artifacts.find(artifact => artifact.id === artifactId) || null;
    if (path) return artifacts.find(artifact => artifact.path === path) || null;
    // Old metadata-only events are safe to match by run only when unambiguous.
    const candidates = artifacts.filter(artifact => artifact.runId === event.runId);
    return candidates.length === 1 ? candidates[0] : null;
  }
  function artifactContent(artifact) { return artifact?.content ?? artifact?.message ?? artifact?.unavailableReason ?? '历史文件不可用，未使用最新报告替代。'; }
  function artifactHeading(artifact, event) {
    return ({ 'raw-execution-log': '原始执行记录', 'execution-log': '执行记录', 'result-summary': '结果摘要', deliverable: '交付文件' })[artifact?.kind || event.payload?.kind] || '报告';
  }
  function artifactKey(artifact, event) { return artifact?.id || event.payload?.artifactId || event.payload?.id || event.payload?.path || `missing:${event.sequence}`; }
  function setBox(element, box) { Object.assign(element.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` }); }
  function updateCamera() { world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`; viewport.style.backgroundPosition = `${camera.x}px ${camera.y}px`; viewport.style.backgroundSize = `${24 * camera.zoom}px ${24 * camera.zoom}px`; }
  function fit(boxes) {
    if (!viewport.clientWidth || !viewport.clientHeight || !boxes.length) return;
    const right = Math.max(...boxes.map(box => box.x + box.width)) + 24, bottom = Math.max(...boxes.map(box => box.y + box.height)) + 24;
    camera.zoom = Math.max(.35, Math.min(1, (viewport.clientWidth - 48) / right, (viewport.clientHeight - 36) / bottom));
    camera.x = Math.max(20, (viewport.clientWidth - right * camera.zoom) / 2); camera.y = Math.max(18, (viewport.clientHeight - bottom * camera.zoom) / 2); updateCamera();
  }
  function stopFlight() { cancelAnimationFrame(flightFrame); flightFrame = 0; activeFlight = null; flight.style.display = 'none'; }
  function pulse(path, reverse = false) {
    stopFlight(); if (motion.matches || document.hidden || !path || !root.isConnected) return;
    trail.setAttribute('d', path); const length = trail.getTotalLength(); if (!length) return;
    activeFlight = { started: performance.now(), length, reverse }; flight.style.display = '';
    function animate(now) {
      if (!activeFlight || disposed || document.hidden) { stopFlight(); return; }
      const t = Math.min(1, (now - activeFlight.started) / 1250), eased = t * t * (3 - 2 * t);
      const distance = activeFlight.length * (activeFlight.reverse ? 1 - eased : eased), point = trail.getPointAtLength(distance), tail = Math.min(75, activeFlight.length * .25);
      trail.setAttribute('stroke-dasharray', `${tail} ${activeFlight.length + tail}`); trail.setAttribute('stroke-dashoffset', String(-Math.max(0, distance - tail)));
      for (const dot of [glow, svg.querySelector('.replay-flight-dot')]) { dot.setAttribute('cx', point.x); dot.setAttribute('cy', point.y); }
      flight.style.opacity = String(Math.min(1, (1 - t) * 5));
      if (t < 1) flightFrame = requestAnimationFrame(animate); else stopFlight();
    }
    flightFrame = requestAnimationFrame(animate);
  }
  function render(animate = false) {
    if (disposed) return;
    stopFlight(); slider.value = String(index); empty.hidden = !!events.length;
    if (!events.length) { world.hidden = true; play.disabled = slider.disabled = speeds.disabled = waits.disabled = true; position.textContent = '没有历史事件'; return; }
    const event = events[index], past = events.slice(0, index + 1), latest = predicate => [...past].reverse().find(predicate);
    const spec = latest(item => ['task.specified', 'task.execution_resolved'].includes(item.type));
    const created = past.find(item => item.type === 'task.created'), title = task.title || created?.payload?.title || spec?.payload?.goal || '任务';
    const requested = spec?.payload?.goal || created?.payload?.title || title;
    const intent = latest(item => item.type === 'user.intent');
    const workerExists = past.some(item => /^(worker\.|run\.|tool\.|decision\.)/.test(item.type));
    delegate.querySelector('strong').textContent = !workerExists && intent?.payload?.userText ? '你的要求' : 'Tetris Agent';
    delegate.querySelector('p').textContent = !workerExists && intent?.payload?.userText || requested;
    worker.heading.textContent = title;
    worker.element.hidden = !workerExists;
    const workerEvent = latest(item => /^(worker\.|run\.|tool\.)/.test(item.type));
    const statusEvent = latest(item => /^(run\.|decision\.)/.test(item.type) || item.type === 'worker.reported' || item.type === 'task.accepted');
    const active = !!statusEvent && ['run.started', 'decision.delivered'].includes(statusEvent.type);
    const stateText = statusEvent ? replayLabel(statusEvent) : workerExists ? (task.historyIncomplete ? '执行状态未记录' : '准备执行') : '准备派发';
    workerState.textContent = stateText; workerState.dataset.state = active ? 'running' : statusEvent?.type === 'decision.requested' ? 'waiting' : 'idle';
    const providerEvent = latest(item => item.payload?.provider);
    provider.textContent = (providerEvent?.payload?.provider || task.provider) === 'codex' ? 'Codex' : 'Claude Code';
    root.style.setProperty('--replay-accent', provider.textContent === 'Codex' ? '#548faf' : '#a878bf');
    const oldScroll = worker.body.scrollTop; worker.body.replaceChildren();
    const cwd = spec?.payload?.executionCwd || workerEvent?.payload?.cwd || created?.payload?.cwd;
    if (cwd) worker.body.append(node('p', 'replay-worker-directory', cwd));
    if (spec) worker.body.append(section('replay-request', '任务要求', replayText(spec.payload), true));
    const tools = new Map(); for (const item of past.filter(item => item.type === 'tool.updated')) tools.set(item.payload?.id || item.id || item.sequence, item);
    for (const item of tools.values()) {
      const tool = section('replay-tool', item.payload?.title || '工具执行', item.payload?.detail || '没有附加输出', true);
      tool.dataset.status = item.payload?.status || 'running'; tool.querySelector('summary').append(node('small', '', ({ completed: '完成', failed: '失败', running: '执行中', in_progress: '执行中' })[item.payload?.status] || '已记录')); worker.body.append(tool);
    }
    const decision = latest(item => item.type === 'decision.requested');
    const answer = latest(item => ['decision.responded', 'decision.delivered', 'decision.delivery_unconfirmed', 'decision.delivery_failed', 'decision.cancelled'].includes(item.type) && (!decision || item.sequence > decision.sequence));
    if (decision) {
      const block = section('replay-decision', answer ? replayLabel(answer) : '需要你的决定', replayText(decision.payload));
      const response = latest(item => item.type === 'decision.responded' && item.sequence > decision.sequence);
      if (response) block.append(node('pre', 'replay-human-answer', replayText(response.payload)));
      if (answer && answer !== response) {
        const delivery = Object.fromEntries(Object.entries(answer.payload || {}).filter(([key, value]) => value !== response?.payload?.[key]));
        if (replayText(delivery)) block.append(node('pre', '', replayText(delivery)));
      }
      worker.body.append(block);
    }
    if (intent) worker.body.append(section('replay-intent', replayLabel(intent), replayText(intent.payload, '你的原话')));
    const outputs = new Map(), opened = new Map();
    for (const item of past) {
      if (['artifact.created', 'artifact.opened', 'report.opened'].includes(item.type)) {
        const artifact = artifactFor(item), kind = artifact?.kind || item.payload?.kind || 'result-summary';
        if (item.type === 'artifact.created') outputs.set(['raw-execution-log', 'execution-log'].includes(kind) ? 'execution-log' : kind === 'deliverable' ? `deliverable:${artifactKey(artifact, item)}` : 'result-summary', { artifact, item, kind });
        else opened.set(artifactKey(artifact, item), { artifact, item, kind });
      }
    }
    for (const [key, { artifact, item, kind }] of outputs) {
      if (kind === 'deliverable') continue;
      const output = section('replay-worker-output', artifactHeading(artifact, item), artifactContent(artifact), key === 'execution-log'); output.dataset.artifactKind = kind; worker.body.append(output);
    }
    const reported = latest(item => item.type === 'worker.reported');
    if (reported && !outputs.has('result-summary')) worker.body.append(section('replay-worker-result', '执行结果', replayText(reported.payload)));
    const unavailable = latest(item => item.type === 'artifact.unavailable');
    if (unavailable) worker.body.append(section('replay-artifact-error', '交付文件不可用', replayText(unavailable.payload)));
    if (workerEvent && ['run.failed', 'run.blocked', 'run.interrupted', 'run.stopped', 'run.session_missing', 'worker.recovery_queued'].includes(workerEvent.type)) worker.body.append(section('replay-worker-exception', replayLabel(workerEvent), replayText(workerEvent.payload)));
    const summary = latest(item => ['agent.summarized', 'supervisor.summarized'].includes(item.type));
    if (summary) worker.body.append(section('replay-agent-summary', 'Tetris Agent 回报', replayText(summary.payload)));
    if (!worker.body.childElementCount) worker.body.append(node('p', 'replay-worker-empty', active ? '正在执行…' : stateText));
    worker.body.scrollTop = playing ? worker.body.scrollHeight : oldScroll;
    worker.footer.textContent = outputs.size ? `${outputs.size} 份历史产物已保存 · 由 Tetris Agent 派发` : '由 Tetris Agent 派发 · 历史记录';

    const delegateBox = { x: 24, y: 24, width: 300, height: 86 }, workerBox = { x: 24, y: 174, width: 430, height: 480 }, boxes = [delegateBox];
    setBox(delegate, delegateBox); setBox(worker.element, workerBox);
    if (workerExists) boxes.push(workerBox);
    for (const view of reportViews.values()) view.element.hidden = true;
    const reportBoxes = [];
    for (const [key, { artifact, item }] of opened) {
      let view = reportViews.get(key);
      if (!view) { view = tile('report', '报告'); view.element.dataset.artifactId = key; reportViews.set(key, view); world.insertBefore(view.element, svg); }
      view.element.hidden = false;
      const filename = artifact?.sourcePath || artifact?.path || item.payload?.path;
      view.heading.textContent = (artifact?.kind || item.payload?.kind) === 'deliverable' && filename ? filename.split(/[\\/]/).at(-1) : `${title} · ${artifactHeading(artifact, item)}`;
      view.body.replaceChildren(node('pre', 'replay-report-content', artifactContent(artifact)));
      view.footer.textContent = `${artifactHeading(artifact, item)}${artifact?.version ? ` · v${artifact.version}` : ''} · 历史版本`;
      const box = { x: 560 + reportBoxes.length * 560, y: 174, width: 460, height: 480 }; setBox(view.element, box); boxes.push(box); reportBoxes.push({ box, key });
    }
    links.replaceChildren(); let delegationPath = ''; const reportPaths = new Map();
    if (workerExists) {
      delegationPath = `M${delegateBox.x + 150},${delegateBox.y + 86} C${delegateBox.x + 150},140 ${workerBox.x + 215},140 ${workerBox.x + 215},${workerBox.y}`;
      links.append(svgNode('path', { d: delegationPath, class: 'replay-relationship' }));
      for (const { box, key } of reportBoxes) {
        const x = workerBox.x + workerBox.width, y = workerBox.y + 72, tx = box.x, ty = box.y + 72;
        const path = `M${x},${y} C${x + 55},${y} ${tx - 55},${ty} ${tx},${ty}`; reportPaths.set(key, path); links.append(svgNode('path', { d: path, class: 'replay-relationship', 'data-artifact-id': key }));
      }
    }
    for (const [key, value] of Object.entries({ x: workerBox.x + 1, y: workerBox.y + 1, width: workerBox.width - 2, height: workerBox.height - 2 })) outline.setAttribute(key, value);
    outline.style.display = workerExists && active ? '' : 'none';
    const signature = `${workerExists}:${[...opened.keys()].join(',')}`;
    if (signature !== layoutSignature) { layoutSignature = signature; fit(boxes); }
    root._replayBoxes = boxes;
    const time = new Date(event.at || event.createdAt); const timeLabel = Number.isNaN(time.getTime()) ? '' : time.toLocaleTimeString();
    position.textContent = `${task.historyIncomplete ? '部分历史记录 · ' : ''}${replayLabel(event)} · ${index + 1}/${events.length}${timeLabel ? ` · ${timeLabel}` : ''}`;
    slider.setAttribute('aria-valuetext', `${index + 1}，${replayLabel(event)}`);
    if (animate) {
      if (['artifact.opened', 'report.opened'].includes(event.type)) pulse(reportPaths.get(artifactKey(artifactFor(event), event)));
      else if (/^(worker\.|run.started|decision\.|user.intent)/.test(event.type)) pulse(delegationPath, ['worker.reported', 'decision.requested'].includes(event.type));
    }
  }
  function updatePlay() { play.textContent = playing ? '暂停' : '播放'; root.dataset.playing = String(playing); }
  function seek(value) { clearTimeout(timer); index = Math.max(0, Math.min(events.length - 1, value)); render(true); if (playing) schedule(); }
  function schedule() {
    clearTimeout(timer);
    if (index >= events.length - 1) { playing = false; updatePlay(); return; }
    const elapsed = Math.max(0, Date.parse(events[index + 1].at || events[index + 1].createdAt) - Date.parse(events[index].at || events[index].createdAt)) || 0;
    timer = setTimeout(() => { index++; render(true); schedule(); }, (skipWait ? Math.min(1800, Math.max(700, elapsed)) : Math.max(300, elapsed)) / speed);
  }
  function pause() { playing = false; clearTimeout(timer); stopFlight(); updatePlay(); }
  function onVisibility() { if (document.hidden) pause(); }
  function onMotionChange() { if (motion.matches) stopFlight(); }
  root.addEventListener('mousedown', event => event.stopPropagation());
  root.addEventListener('pointerdown', event => event.stopPropagation());
  root.addEventListener('wheel', event => event.stopPropagation());
  viewport.addEventListener('wheel', event => {
    if (event.target.closest('.replay-tile-body') && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = viewport.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top, prior = camera.zoom;
      camera.zoom = Math.max(.25, Math.min(1.6, prior * Math.exp(-event.deltaY * .004))); camera.x = x - (x - camera.x) * camera.zoom / prior; camera.y = y - (y - camera.y) * camera.zoom / prior;
    } else { camera.x -= event.deltaX; camera.y -= event.deltaY; }
    updateCamera();
  }, { passive: false });
  const resize = new ResizeObserver(() => fit(root._replayBoxes || [])); resize.observe(viewport);
  document.addEventListener('visibilitychange', onVisibility); motion.addEventListener('change', onMotionChange);
  function destroy() { if (disposed) return; disposed = true; pause(); speedSelect.destroy(); resize.disconnect(); document.removeEventListener('visibilitychange', onVisibility); motion.removeEventListener('change', onMotionChange); root.remove(); onClose(); }
  render(); return { id, destroy, pause };
}
