/** Groups keep member coordinates intact; collapsing changes only visibility. */
export function createGroupModel(tiles) {
  const groups = [];
  const members = (group) => tiles.filter(t => group.tileIds.includes(t.id));
  const groupFor = (id) => groups.find(g => g.tileIds.includes(id));
  function prune() {
    const ids = new Set(tiles.map(t => t.id));
    for (const group of [...groups]) {
      group.tileIds = group.tileIds.filter(id => ids.has(id));
      if (!group.tileIds.length) groups.splice(groups.indexOf(group), 1);
    }
  }
  function memberBounds(group) {
    const items = members(group);
    const x = Math.min(...items.map(t => t.x));
    const y = Math.min(...items.map(t => t.y));
    return { x, y, width: Math.max(...items.map(t => t.x + t.width)) - x,
      height: Math.max(...items.map(t => t.y + t.height)) - y };
  }
  function bounds(group) {
    return group.frame ??= memberBounds(group);
  }
  function containMembers(group) {
    const b = memberBounds(group), f = bounds(group);
    const right = Math.max(f.x + f.width, b.x + b.width);
    const bottom = Math.max(f.y + f.height, b.y + b.height);
    f.x = Math.min(f.x, b.x); f.y = Math.min(f.y, b.y);
    f.width = right - f.x; f.height = bottom - f.y;
  }
  function resize(group, rect) {
    const b = memberBounds(group);
    const right = Math.max(rect.x + rect.width, b.x + b.width);
    const bottom = Math.max(rect.y + rect.height, b.y + b.height);
    group.frame = { x: Math.min(rect.x, b.x), y: Math.min(rect.y, b.y), width: 0, height: 0 };
    group.frame.width = Math.max(316, right - group.frame.x);
    group.frame.height = Math.max(80, bottom - group.frame.y);
  }
  function atPoint(x, y) {
    return [...groups].reverse().find(g => {
      if (g.collapsed) return false;
      const b = bounds(g);
      return x >= b.x - 12 && x <= b.x + b.width + 12 && y >= b.y && y <= b.y + b.height + 12;
    });
  }
  function adoptAt(items, x, y) {
    const group = atPoint(x, y);
    if (!group) return null;
    for (const tile of items) {
      if (!groupFor(tile.id)) group.tileIds.push(tile.id);
    }
    containMembers(group);
    return group;
  }
  function create(ids, name) {
    const selected = tiles.filter(t => ids.includes(t.id));
    if (selected.length < 2 || selected.some(t => groupFor(t.id))) return null;
    const group = { id: `group-${crypto.randomUUID()}`, name: name.trim().slice(0, 80) || '未命名分组',
      tileIds: selected.map(t => t.id), collapsed: true };
    group.frame = memberBounds(group);
    groups.push(group);
    return group;
  }
  function restore(saved) {
    groups.length = 0;
    const used = new Set();
    const ids = new Set(tiles.map(t => t.id));
    for (const raw of Array.isArray(saved) ? saved : []) {
      if (!raw || typeof raw.id !== 'string' || groups.some(g => g.id === raw.id) || !Array.isArray(raw.tileIds)) continue;
      const tileIds = [...new Set(raw.tileIds)].filter(id => ids.has(id) && !used.has(id));
      if (!tileIds.length) continue;
      tileIds.forEach(id => used.add(id));
      const group = { id: raw.id, name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '未命名分组', tileIds, collapsed: raw.collapsed === true };
      const f = raw.frame;
      if (f && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(f[k])) && f.width > 0 && f.height > 0) group.frame = { x:f.x, y:f.y, width:f.width, height:f.height };
      containMembers(group);
      groups.push(group);
    }
  }
  function move(group, dx, dy) {
    const frame = bounds(group); frame.x += dx; frame.y += dy;
    for (const tile of members(group)) { tile.x += dx; tile.y += dy; }
  }
  return { groups, members, groupFor, bounds, create, restore, prune, move, resize, adoptAt, atPoint, containMembers,
    remove: group => groups.splice(groups.indexOf(group), 1),
    isHidden: id => groupFor(id)?.collapsed === true,
    serialize: () => groups.map(g => ({ ...g, frame: { ...bounds(g) }, tileIds: [...g.tileIds] })),
  };
}
