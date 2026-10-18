'use strict';
// Modèle de projet (sérialisé tel quel en JSON) : valeurs par défaut, validation, modèles de pièces.
const Project = (() => {
  const PATTERNS = ['straight', 'half', 'third', 'twoThirds'];
  const ANCHORS = ['bl', 'br', 'tl', 'tr', 'c'];
  const MATERIALS = ['tile', 'parquet'];

  const pts = arr => arr.map(([x, y]) => ({ x, y }));
  const presets = {
    rect: () => pts([[0, 0], [4000, 0], [4000, 3000], [0, 3000]]),
    L: () => pts([[0, 0], [5000, 0], [5000, 2500], [2500, 2500], [2500, 4000], [0, 4000]]),
    T: () => pts([[1500, 0], [3500, 0], [3500, 2500], [5000, 2500], [5000, 4000], [0, 4000], [0, 2500], [1500, 2500]]),
    U: () => pts([[0, 0], [5000, 0], [5000, 4000], [3500, 4000], [3500, 1500], [1500, 1500], [1500, 4000], [0, 4000]]),
    chamfer: () => pts([[0, 0], [4000, 0], [4000, 2200], [3200, 3000], [0, 3000]]),
    irregular: () => pts([[0, 0], [4200, -150], [4500, 2800], [2600, 3400], [300, 3100]]),
  };

  function defaults(material = 'tile') {
    return {
      version: 1,
      name: 'Ma pièce',
      material: MATERIALS.includes(material) ? material : 'tile',
      room: presets.L(),
      obstacles: [],
      tile: { length: 600, width: 300 },
      pattern: 'third',
      joint: { inner: 3, perimeter: 5 },
      start: { x: 5, y: 5, anchor: 'bl', angle: 0 },
      optim: { reuse: true, kerf: 2, minOffcut: 20, allowRotate: false, noInnerCuts: false },
      purchase: { margin: 10, tilesPerBox: 0 },
    };
  }

  function num(v, def, min = -Infinity, max = Infinity) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  }

  function points(arr) {
    if (!Array.isArray(arr)) return null;
    const list = arr
      .map(p => ({ x: Number(p && p.x), y: Number(p && p.y) }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    return list.length >= 3 ? list : null;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('contenu JSON invalide.');
    const d = defaults();
    const room = points(raw.room);
    if (!room) throw new Error('la pièce doit comporter au moins 3 points.');
    const t = raw.tile || {}, j = raw.joint || {}, s = raw.start || {}, o = raw.optim || {}, p = raw.purchase || {};
    return {
      version: 1,
      name: typeof raw.name === 'string' ? raw.name.slice(0, 100) : d.name,
      material: MATERIALS.includes(raw.material) ? raw.material : d.material,
      room,
      obstacles: (Array.isArray(raw.obstacles) ? raw.obstacles : [])
        .map((ob, i) => ({
          name: ob && typeof ob.name === 'string' ? ob.name.slice(0, 60) : `Obstacle ${i + 1}`,
          points: points(ob && ob.points),
        }))
        .filter(ob => ob.points),
      tile: { length: num(t.length, d.tile.length, 10, 5000), width: num(t.width, d.tile.width, 10, 5000) },
      pattern: PATTERNS.includes(raw.pattern) ? raw.pattern : d.pattern,
      joint: { inner: num(j.inner, d.joint.inner, 0, 50), perimeter: num(j.perimeter, d.joint.perimeter, 0, 100) },
      start: {
        x: num(s.x, d.start.x),
        y: num(s.y, d.start.y),
        anchor: ANCHORS.includes(s.anchor) ? s.anchor : d.start.anchor,
        angle: num(s.angle, 0, -360, 360),
      },
      optim: {
        reuse: o.reuse !== false,
        kerf: num(o.kerf, d.optim.kerf, 0, 20),
        minOffcut: num(o.minOffcut, d.optim.minOffcut, 0, 1000),
        allowRotate: o.allowRotate === true,
        noInnerCuts: o.noInnerCuts === true,
      },
      purchase: {
        margin: num(p.margin, d.purchase.margin, 0, 100),
        tilesPerBox: Math.round(num(p.tilesPerBox, 0, 0, 1000)),
      },
    };
  }

  return { defaults, normalize, presets };
})();
