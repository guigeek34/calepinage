'use strict';
// Outils géométriques 2D (mm, axe Y vers le haut).
const Geo = (() => {
  const EPS = 1e-9;

  function signedArea(poly) {
    let s = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
  }

  const area = poly => Math.abs(signedArea(poly));

  function bbox(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  const ensureCCW = poly => (signedArea(poly) < 0 ? poly.slice().reverse() : poly);

  function centroid(poly) {
    const a = signedArea(poly);
    if (Math.abs(a) < EPS) {
      const b = bbox(poly);
      return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }
    let cx = 0, cy = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      const f = p.x * q.y - q.x * p.y;
      cx += (p.x + q.x) * f;
      cy += (p.y + q.y) * f;
    }
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }

  function dedupe(poly) {
    const out = [];
    for (const p of poly) {
      const q = out[out.length - 1];
      if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) out.push(p);
    }
    while (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1e-6) out.pop();
    return out;
  }

  function isConvex(poly) {
    let sign = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], c = poly[(i + 2) % n];
      const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cr) < EPS) continue;
      const s = cr > 0 ? 1 : -1;
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  }

  // Sutherland-Hodgman : `clip` doit être convexe et orienté CCW, `subject` quelconque.
  function clipConvex(subject, clip) {
    let output = subject;
    for (let i = 0, n = clip.length; i < n && output.length; i++) {
      const a = clip[i], b = clip[(i + 1) % n];
      const side = p => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      const input = output;
      output = [];
      let s = input[input.length - 1], ss = side(s);
      for (const e of input) {
        const se = side(e);
        if (se >= 0) {
          if (ss < 0) output.push(lerpCross(s, e, ss, se));
          output.push(e);
        } else if (ss >= 0) {
          output.push(lerpCross(s, e, ss, se));
        }
        s = e;
        ss = se;
      }
    }
    return output;
  }

  function lerpCross(s, e, ss, se) {
    const t = ss / (ss - se);
    return { x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) };
  }

  // Décalage parallèle des côtés : d > 0 vers l'intérieur, d < 0 vers l'extérieur.
  function offset(poly, d) {
    const p = dedupe(poly);
    const n = p.length;
    if (n < 3 || !d) return p.map(q => ({ x: q.x, y: q.y }));
    const s = signedArea(p) >= 0 ? 1 : -1;
    const lines = p.map((a, i) => {
      const b = p[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      return { px: a.x - (dy / len) * s * d, py: a.y + (dx / len) * s * d, dx, dy, len };
    });
    return p.map((v, i) => {
      const l1 = lines[(i - 1 + n) % n], l2 = lines[i];
      const den = l1.dx * l2.dy - l1.dy * l2.dx;
      if (Math.abs(den) > 1e-9 * l1.len * l2.len) {
        const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / den;
        const q = { x: l1.px + l1.dx * t, y: l1.py + l1.dy * t };
        if (Math.hypot(q.x - v.x, q.y - v.y) <= Math.abs(d) * 20) return q;
      }
      return { x: l2.px, y: l2.py };
    });
  }

  function pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function closestOnSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const x = a.x + t * dx, y = a.y + t * dy;
    return { x, y, t, d: Math.hypot(p.x - x, p.y - y) };
  }

  return { signedArea, area, bbox, ensureCCW, centroid, dedupe, isConvex, clipConvex, offset, pointInPolygon, closestOnSegment };
})();
