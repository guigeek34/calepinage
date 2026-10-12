'use strict';
// Optimisation des chutes : découpe guillotine, pièces triées par surface décroissante, placement "best fit".
const Optimizer = (() => {
  const EPS = 0.01;

  function run(pieces, L, W, opt) {
    const pool = [];
    let stockCount = 0;
    let reused = 0;
    const order = pieces.slice().sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);

    for (const p of order) {
      let best = null;
      if (opt.reuse) {
        for (let i = 0; i < pool.length; i++) {
          const o = pool[i];
          const waste = o.w * o.h - p.w * p.h;
          if (o.w + EPS >= p.w && o.h + EPS >= p.h && (!best || waste < best.waste)) best = { i, rot: false, waste };
          if (opt.allowRotate && o.w + EPS >= p.h && o.h + EPS >= p.w && (!best || waste < best.waste)) best = { i, rot: true, waste };
        }
      }
      let src;
      if (best) {
        src = pool.splice(best.i, 1)[0];
        p.source = 'offcut';
        p.rotated = best.rot;
        reused++;
      } else {
        src = { w: L, h: W, stock: ++stockCount };
        p.source = 'new';
        p.rotated = false;
      }
      p.stock = src.stock;
      const pw = p.rotated ? p.h : p.w;
      const ph = p.rotated ? p.w : p.h;
      for (const r of split(src, pw, ph, opt)) pool.push(r);
    }
    return { newTiles: stockCount, reused, offcuts: pool };
  }

  // Deux découpes guillotine possibles : on garde celle qui laisse la plus grande chute.
  function split(src, pw, ph, opt) {
    const k = opt.kerf, min = Math.max(opt.minOffcut, EPS);
    const rw = src.w - pw - k, rh = src.h - ph - k;
    const usable = list => list.filter(r => r.w >= min && r.h >= min);
    const a = usable([{ w: rw, h: src.h }, { w: pw, h: rh }]);
    const b = usable([{ w: src.w, h: rh }, { w: rw, h: ph }]);
    const biggest = list => list.reduce((m, r) => Math.max(m, r.w * r.h), 0);
    return (biggest(a) >= biggest(b) ? a : b).map(r => ({ ...r, stock: src.stock }));
  }

  return { run };
})();
