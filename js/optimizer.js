'use strict';
// Optimisation des chutes : découpe guillotine, pièces triées par surface décroissante, placement "best fit".
// Côtés (l, r, b, t) exprimés dans le sens du carreau : true = bord d'usine (chute) ou bord d'usine exigé (pièce).
const Optimizer = (() => {
  const EPS = 0.01;
  const FACTORY = { l: true, r: true, b: true, t: true };
  const NONE = { l: false, r: false, b: false, t: false };

  // Côtés exigés par la pièce, une fois tournée de `rot` degrés (sens anti-horaire) dans la chute.
  function turn(s, rot) {
    if (rot === 90) return { l: s.t, r: s.b, b: s.l, t: s.r };
    if (rot === 180) return { l: s.r, r: s.l, b: s.t, t: s.b };
    if (rot === 270) return { l: s.b, r: s.t, b: s.r, t: s.l };
    return s;
  }

  // Calage de la pièce (pw × ph) sur un axe de la chute : 'lo' (gauche / bas) ou 'hi' (droite / haut), null si impossible.
  function align(needLo, needHi, srcLo, srcHi, full) {
    const lo = (!needLo || srcLo) && (!needHi || (srcHi && full));
    const hi = (!needHi || srcHi) && (!needLo || (srcLo && full));
    if (lo && hi) return srcLo && !srcHi ? 'hi' : 'lo'; // pièce contre le bord coupé, pour garder le bord d'usine sur la chute
    return lo ? 'lo' : hi ? 'hi' : null;
  }

  function fit(o, pw, ph, need) {
    if (o.w + EPS < pw || o.h + EPS < ph) return null;
    const x = align(need.l, need.r, o.edges.l, o.edges.r, pw + EPS >= o.w);
    const y = align(need.b, need.t, o.edges.b, o.edges.t, ph + EPS >= o.h);
    return x && y ? { x, y } : null;
  }

  function run(pieces, L, W, opt) {
    const pool = [];
    const plan = [];
    let reused = 0;
    const order = pieces.slice().sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);
    const strict = !!opt.noInnerCuts;
    const rotations = opt.allowRotate ? (strict ? [0, 90, 180, 270] : [0, 90]) : [0];

    for (const p of order) {
      const sides = strict && p.sides ? p.sides : NONE;
      let best = null;
      if (opt.reuse) {
        for (let i = 0; i < pool.length; i++) {
          const o = pool[i];
          const waste = o.w * o.h - p.w * p.h;
          for (const rot of rotations) {
            if (best && waste >= best.waste) break;
            const pw = rot % 180 ? p.h : p.w, ph = rot % 180 ? p.w : p.h;
            const at = fit(o, pw, ph, turn(sides, rot));
            if (at) best = { i, rot, waste, at };
          }
        }
      }
      let src, at;
      if (best) {
        src = pool.splice(best.i, 1)[0];
        at = best.at;
        p.source = 'offcut';
        p.rotation = best.rot;
        reused++;
      } else {
        src = { w: L, h: W, edges: FACTORY, stock: plan.length + 1, from: null };
        at = fit(src, p.w, p.h, sides) || { x: 'lo', y: 'lo' };
        plan.push({ stock: src.stock, pieces: [] });
        p.source = 'new';
        p.rotation = 0;
      }
      p.rotated = p.rotation % 180 !== 0;
      p.stock = src.stock;
      p.fromPiece = src.from;
      plan[src.stock - 1].pieces.push(p);
      const pw = p.rotated ? p.h : p.w;
      const ph = p.rotated ? p.w : p.h;
      for (const r of split(src, pw, ph, at, opt)) pool.push({ ...r, stock: src.stock, from: p.id });
    }
    return { newTiles: plan.length, reused, offcuts: pool, plan };
  }

  // Deux découpes guillotine possibles : on garde celle qui laisse la plus grande chute.
  // Les bords d'une chute issus d'un trait de coupe deviennent des bords coupés.
  function split(src, pw, ph, at, opt) {
    const k = opt.kerf, min = Math.max(opt.minOffcut, EPS);
    const rw = src.w - pw - k, rh = src.h - ph - k;
    const e = src.edges;
    const left = at.x === 'lo';
    const bottom = at.y === 'lo';
    const besideX = left ? { l: false, r: e.r } : { l: e.l, r: false }; // bande à côté de la pièce
    const underX = left ? { l: e.l, r: false } : { l: false, r: e.r }; // colonne de la pièce
    const besideY = bottom ? { b: false, t: e.t } : { b: e.b, t: false };
    const underY = bottom ? { b: e.b, t: false } : { b: false, t: e.t };
    const usable = list => list.filter(r => r.w >= min && r.h >= min);
    const a = usable([
      { w: rw, h: src.h, edges: { ...besideX, b: e.b, t: e.t } },
      { w: pw, h: rh, edges: { ...underX, ...besideY } },
    ]);
    const b = usable([
      { w: src.w, h: rh, edges: { l: e.l, r: e.r, ...besideY } },
      { w: rw, h: ph, edges: { ...besideX, ...underY } },
    ]);
    const biggest = list => list.reduce((m, r) => Math.max(m, r.w * r.h), 0);
    return biggest(a) >= biggest(b) ? a : b;
  }

  return { run };
})();
