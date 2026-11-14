/** Replay presentation only: never sends a prompt or changes a run's status. */
export function createTaskReplay({ ensureWorker, ensureReport, tileManager, edgeIndicators, taskEffects }) {
  let active = false;
  return async function replay(params) {
    if (active) throw new Error('已有流程正在回放');
    active = true;
    const controller = new AbortController(), animations = [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bar = document.createElement('div');
    bar.className = 'task-replay-controls';
    const label = document.createElement('span'), stop = document.createElement('button');
    bar.setAttribute('role', 'status'); stop.textContent = '结束回放';
    stop.onclick = () => controller.abort(); bar.append(label, stop); document.body.append(bar);
    const delay = ms => new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException('Replay stopped', 'AbortError')); };
      const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, reduced ? 100 : ms);
      if (controller.signal.aborted) abort(); else controller.signal.addEventListener('abort', abort, { once: true });
    });
    const reveal = tile => {
      if (!reduced) {
        const element = tileManager.getTileDOMs().get(tile.id)?.container;
        if (element) animations.push(element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 850, easing: 'ease-out' }));
      }
    };
    let worker;
    try {
      label.textContent = '流程回放 · 1/3 委派任务';
      worker = ensureWorker(params);
      edgeIndicators.panToTiles([worker]);
      reveal(worker);
      await delay(350);
      const visual = { sessionId: params.sessionId, sourceMessageId: params.sourceMessageId, tileIds: [worker.id], color: params.color };
      taskEffects.event({ ...visual, id: crypto.randomUUID(), state: 'focus' });
      await delay(1700);
      if (!tileManager.getTileDOMs().has(worker.id)) return { tileId: worker.id };
      label.textContent = '流程回放 · 2/3 Worker 执行过程';
      tileManager.focusCanvasTile(worker.id);
      taskEffects.selectTile(worker.id);
      await delay(1700);
      if (!tileManager.getTileDOMs().has(worker.id)) return { tileId: worker.id };
      if (params.artifactPath) {
        label.textContent = '流程回放 · 3/3 打开报告';
        const report = ensureReport(params.artifactPath);
        edgeIndicators.panToTiles([worker, report]);
        reveal(report);
        await delay(350);
        taskEffects.event({ id: crypto.randomUUID(), sessionId: params.sessionId, state: 'delivery', sourceTileId: worker.id, tileIds: [report.id], color: params.color });
        tileManager.focusCanvasTile(report.id);
        await delay(1800);
      } else {
        label.textContent = '流程回放 · 尚未生成报告，回放到此结束';
        await delay(1400);
      }
      return { tileId: worker.id };
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
      return { tileId: worker?.id };
    } finally {
      animations.forEach(animation => animation.cancel());
      bar.remove(); active = false;
    }
  };
}
