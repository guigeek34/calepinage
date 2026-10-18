'use strict';
// Génération du calepinage : grille de carreaux dans le repère du carreau de départ, découpée par la pièce.
const Layout = (() => {
  // Décalage de chaque rangée, en fraction du pas (longueur + joint).
  const PATTERNS = {
    straight: [0],
    half: [0, -1 / 2],
    third: [0, -1 / 3, -2 / 3],
    twoThirds: [0, -1 / 3],
  };
  const MAX_TILES = 150000;
  const THIN_CUT = 50;

  function frame(project) {
    const L = project.tile.length, W = project.tile.width;
    const s = project.start;
    const a = (s.angle * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const anchors = { bl: [0, 0], br: [L, 0], tl: [0, W], tr: [L, W], c: [L / 2, W / 2] };
    const [au, av] = anchors[s.anchor] || anchors.bl;
    const ox = s.x - (au * cos - av * sin);
    const oy = s.y - (au * sin + av * cos);
    return {
      L, W,
      toWorld: (u, v) => ({ x: ox + u * cos - v * sin, y: oy + u * sin + v * cos }),
      toLocal: p => {
        const dx = p.x - ox, dy = p.y - oy;
        return { u: dx * cos + dy * sin, v: -dx * sin + dy * cos };
      },
    };
  }

  const TOL = 0.01;
  const onSide = (a, b, x0, y0, x1, y1) =>
    (Math.abs(a.x - x0) < TOL && Math.abs(b.x - x0) < TOL) || (Math.abs(a.x - x1) < TOL && Math.abs(b.x - x1) < TOL) ||
    (Math.abs(a.y - y0) < TOL && Math.abs(b.y - y0) < TOL) || (Math.abs(a.y - y1) < TOL && Math.abs(b.y - y1) < TOL);

  // Traits de coupe d'une pièce : `edges` (monde) hors bords du carreau, `traits` (repère pièce) hors rectangle w × h.
  function cutShape(f, piece, holes, u0, v0, L, W, dx, dy, w, h) {
    const edges = [], traits = [];
    const visit = (poly, isHole) => {
      const pts = Geo.simplify(poly);
      const loc = pts.map(p => { const l = f.toLocal(p); return { x: l.u - u0, y: l.v - v0 }; });
      const rel = loc.map(p => ({ x: p.x - dx, y: p.y - dy }));
      for (let i = 0, n = pts.length; i < n; i++) {
        const j = (i + 1) % n;
        if (onSide(loc[i], loc[j], 0, 0, L, W)) continue;
        edges.push([pts[i], pts[j]]);
        if (!isHole && !onSide(rel[i], rel[j], 0, 0, w, h)) {
          traits.push({ a: rel[i], b: rel[j], len: Math.hypot(rel[j].x - rel[i].x, rel[j].y - rel[i].y) });
        }
      }
      return rel;
    };
    const outline = visit(piece, false);
    const holeOutlines = holes.map(p => visit(p, true));
    return { edges, traits, outline, holes: holeOutlines, complex: traits.length > 0 || holeOutlines.length > 0 };
  }

  function compute(project) {
    const f = frame(project);
    const { L, W } = f;
    const parquet = project.material === 'parquet';
    const gap = parquet ? 0 : project.joint.inner;
    const pu = L + gap, pv = W + gap;
    const seq = PATTERNS[project.pattern] || PATTERNS.straight;
    const zone = Geo.offset(project.room, project.joint.perimeter);
    const obstacles = project.obstacles.map(o => {
      const grown = Geo.offset(o.points, -project.joint.perimeter);
      return { poly: grown, convex: Geo.isConvex(grown) };
    });
    const tileArea = L * W;
    const tiles = [];
    let error = null;

    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (const p of zone) {
      const l = f.toLocal(p);
      umin = Math.min(umin, l.u); umax = Math.max(umax, l.u);
      vmin = Math.min(vmin, l.v); vmax = Math.max(vmax, l.v);
    }
    const estimate = ((umax - umin) / pu + 3) * ((vmax - vmin) / pv + 3);

    if (zone.length < 3 || !(estimate < MAX_TILES)) {
      error = zone.length < 3 ? 'La pièce doit comporter au moins 3 sommets distincts.' : 'Trop d\'éléments à calculer : vérifiez les dimensions.';
    } else {
      const r0 = Math.floor(vmin / pv) - 1, r1 = Math.ceil(vmax / pv);
      for (let r = r0; r <= r1; r++) {
        const v0 = r * pv;
        if (v0 > vmax || v0 + W < vmin) continue;
        const off = seq[((r % seq.length) + seq.length) % seq.length] * pu;
        const c0 = Math.floor((umin - off) / pu) - 1, c1 = Math.ceil((umax - off) / pu);
        for (let c = c0; c <= c1; c++) {
          const u0 = c * pu + off;
          if (u0 > umax || u0 + L < umin) continue;
          const rect = [f.toWorld(u0, v0), f.toWorld(u0 + L, v0), f.toWorld(u0 + L, v0 + W), f.toWorld(u0, v0 + W)];
          const piece = Geo.clipConvex(zone, rect);
          if (piece.length < 3) continue;
          let area = Geo.area(piece);
          if (area < tileArea * 1e-4) continue;

          const holes = [];
          for (const ob of obstacles) {
            let h = Geo.clipConvex(ob.poly, rect);
            if (h.length < 3) continue;
            if (ob.convex) h = Geo.clipConvex(piece, Geo.ensureCCW(h));
            const ha = h.length >= 3 ? Geo.area(h) : 0;
            if (ha > 1e-6) { area -= ha; holes.push(h); }
          }
          const holed = holes.length > 0;
          if (area < tileArea * 1e-4) continue;

          let bu0 = Infinity, bu1 = -Infinity, bv0 = Infinity, bv1 = -Infinity;
          for (const p of piece) {
            const l = f.toLocal(p);
            bu0 = Math.min(bu0, l.u); bu1 = Math.max(bu1, l.u);
            bv0 = Math.min(bv0, l.v); bv1 = Math.max(bv1, l.v);
          }
          const w = Math.min(L, bu1 - u0) - Math.max(0, bu0 - u0);
          const h = Math.min(W, bv1 - v0) - Math.max(0, bv0 - v0);
          const full = !holed && area > tileArea * (1 - 1e-6);
          const shape = full ? null : cutShape(f, piece, holes, u0, v0, L, W, Math.max(0, bu0 - u0), Math.max(0, bv0 - v0), w, h);
          // Côtés restés sur le bord du carreau : ils touchent les carreaux voisins et doivent rester des bords d'usine.
          const sides = { l: bu0 - u0 <= TOL, r: bu1 - u0 >= L - TOL, b: bv0 - v0 <= TOL, t: bv1 - v0 >= W - TOL };
          tiles.push({ row: r, col: c, rect, piece, area, full, w, h, shape, sides, source: full ? 'full' : null });
        }
      }
    }

    const cuts = tiles.filter(t => !t.full);
    cuts.forEach((t, i) => { t.id = i + 1; });
    const opt = Optimizer.run(cuts, L, W, parquet ? { ...project.optim, allowRotate: false } : project.optim);

    const roomArea = Geo.area(project.room);
    const obstacleArea = project.obstacles.reduce((s, o) => s + Geo.area(o.points), 0);
    const tiledArea = tiles.reduce((s, t) => s + t.area, 0);
    const fullCount = tiles.length - cuts.length;
    const total = fullCount + opt.newTiles;
    const totalWithMargin = Math.ceil(total * (1 + project.purchase.margin / 100));
    const tpb = project.purchase.tilesPerBox;

    return {
      tiles, cuts, zone, frame: f, error,
      obstacles: obstacles.map(o => o.poly),
      offcuts: opt.offcuts,
      plan: opt.plan,
      stats: {
        roomArea,
        obstacleArea,
        floorArea: roomArea - obstacleArea,
        tiledArea,
        fullCount,
        cutCount: cuts.length,
        reused: opt.reused,
        newForCuts: opt.newTiles,
        total,
        totalNoOptim: fullCount + cuts.length,
        totalWithMargin,
        boxes: tpb > 0 ? Math.ceil(totalWithMargin / tpb) : null,
        purchaseArea: totalWithMargin * tileArea,
        wasteArea: total * tileArea - tiledArea,
        thinCuts: cuts.filter(t => Math.min(t.w, t.h) < THIN_CUT).length,
        thinLimit: THIN_CUT,
      },
    };
  }

  return { compute, frame };
})();
