'use strict';
(() => {
  const STORAGE_KEY = 'calepinage.project';
  const COLORS = {
    bg: '#fbfbfb', grid: '#eeeeee', gridMajor: '#dadada', joint: '#bdb7ad',
    full: '#f1e4c8', cutNew: '#f4a259', cutReuse: '#7cc6a4', obstacle: '#8b929c',
    room: '#1f2937', select: '#2563eb', start: '#dc2626', hover: '#1d4ed8',
  };

  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const tooltip = $('tooltip');

  let project = loadInitial();
  let result = null;
  let selected = 0; // 0 = pièce, i > 0 = obstacle i-1
  let tableMode = 'xy';
  const view = { scale: 0.1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  const ui = { labels: true, dims: true, snap: 10, placing: false, hoverTile: null, highlightId: null, drag: null };

  // ---------- Utilitaires ----------
  const fmt = (v, min = 0, max = min) => v.toLocaleString('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
  const fmtMm = v => fmt(v, 0, 1);
  const m2 = mm2 => `${fmt(mm2 / 1e6, 2)} m²`;
  const round2 = v => Math.round(v * 100) / 100;

  function loadInitial() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Project.normalize(JSON.parse(raw));
    } catch (e) { /* sauvegarde locale illisible : on repart des valeurs par défaut */ }
    return Project.defaults();
  }

  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); } catch (e) { /* stockage indisponible */ }
    }, 300);
  }

  // ---------- Historique (retour arrière / avant) ----------
  const HISTORY_MAX = 100;
  const undoStack = [JSON.stringify(project)];
  let undoIndex = 0;
  let historyPending = false;
  let historyTimer = 0;

  function scheduleHistory() {
    historyPending = JSON.stringify(project) !== undoStack[undoIndex];
    updateHistoryButtons();
    clearTimeout(historyTimer);
    if (historyPending) historyTimer = setTimeout(commitHistory, 400);
  }

  function commitHistory() {
    clearTimeout(historyTimer);
    // Un glisser-déposer en cours ne produit qu'une seule étape, à la fin.
    if (ui.drag && ui.drag.type !== 'pan') { historyTimer = setTimeout(commitHistory, 400); return; }
    const snap = JSON.stringify(project);
    historyPending = false;
    if (snap !== undoStack[undoIndex]) {
      undoStack.splice(undoIndex + 1);
      undoStack.push(snap);
      if (undoStack.length > HISTORY_MAX) undoStack.shift();
      undoIndex = undoStack.length - 1;
    }
    updateHistoryButtons();
  }

  function stepHistory(delta) {
    if (!(ui.drag && ui.drag.type !== 'pan')) commitHistory();
    const i = undoIndex + delta;
    if (i < 0 || i >= undoStack.length) return;
    undoIndex = i;
    project = JSON.parse(undoStack[i]);
    ui.highlightId = null;
    refreshAll();
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    $('btnUndo').disabled = undoIndex === 0 && !historyPending;
    $('btnRedo').disabled = historyPending || undoIndex >= undoStack.length - 1;
  }

  const shapePoints = i => (i === 0 ? project.room : project.obstacles[i - 1].points);
  const shapeName = i => (i === 0 ? 'Pièce' : project.obstacles[i - 1].name || `Obstacle ${i}`);

  function wall(pts, i) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (ang < 0) ang += 360;
    return { len: Math.hypot(b.x - a.x, b.y - a.y), ang: ang >= 359.995 ? 0 : ang };
  }

  const getPath = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
  function setPath(obj, path, val) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = val;
  }

  const snapV = (v, e) => (ui.snap > 0 && !(e && e.altKey) ? Math.round(v / ui.snap) * ui.snap : round2(v));

  // ---------- Mise à jour ----------
  let frameRequested = false;
  function changed() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      result = Layout.compute(project);
      ui.hoverTile = null;
      render();
      updateResults();
      refreshVertexTable();
      syncInputs();
      scheduleSave();
      scheduleHistory();
    });
  }

  function refreshAll() {
    if (selected > project.obstacles.length) selected = 0;
    buildShapeSelect();
    buildVertexTable();
    buildStartVertexSelect();
    syncInputs();
    changed();
  }

  // ---------- Champs liés au projet ----------
  function bindInputs() {
    document.querySelectorAll('[data-bind]').forEach(el => {
      const evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.type === 'number') {
          v = parseFloat(el.value);
          if (!Number.isFinite(v)) return;
          if (el.min !== '' && v < +el.min) return;
          if (el.max !== '' && v > +el.max) return;
        } else v = el.value;
        setPath(project, el.dataset.bind, v);
        changed();
      });
    });
  }

  function syncInputs() {
    document.querySelectorAll('[data-bind]').forEach(el => {
      if (el === document.activeElement) return;
      const v = getPath(project, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'number') el.value = String(round2(v));
      else el.value = v;
    });
    const nameEl = $('obstacleName');
    if (selected > 0 && nameEl !== document.activeElement) nameEl.value = project.obstacles[selected - 1].name;
  }

  // ---------- Formes ----------
  function buildShapeSelect() {
    const sel = $('shapeSelect');
    sel.replaceChildren();
    for (let i = 0; i <= project.obstacles.length; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = shapeName(i);
      sel.appendChild(o);
    }
    sel.value = String(selected);
    $('btnDelObstacle').disabled = selected === 0;
    $('obstacleNameRow').hidden = selected === 0;
  }

  function selectShape(i) {
    selected = i;
    buildShapeSelect();
    buildVertexTable();
    syncInputs();
    render();
  }

  function buildStartVertexSelect() {
    const sel = $('startVertex');
    const prev = sel.value;
    sel.replaceChildren();
    project.room.forEach((_, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `Sommet ${i + 1}`;
      sel.appendChild(o);
    });
    sel.value = prev && +prev < project.room.length ? prev : '0';
  }

  function cell(text, cls) {
    const td = document.createElement('td');
    if (text !== undefined) td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }

  function inputCell(i, f) {
    const td = document.createElement('td');
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = 'any';
    inp.dataset.i = String(i);
    inp.dataset.f = f;
    td.appendChild(inp);
    return td;
  }

  function buildVertexTable() {
    const pts = shapePoints(selected);
    const n = pts.length;
    const head = $('vertexHead'), body = $('vertexBody');
    head.replaceChildren();
    body.replaceChildren();
    const hr = document.createElement('tr');
    const titles = tableMode === 'xy' ? ['#', 'X (mm)', 'Y (mm)', ''] : ['Mur', 'Longueur (mm)', 'Angle (°)', ''];
    titles.forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); });
    head.appendChild(hr);

    pts.forEach((_, i) => {
      const tr = document.createElement('tr');
      if (tableMode === 'xy') {
        tr.append(cell(String(i + 1)), inputCell(i, 'x'), inputCell(i, 'y'));
      } else {
        tr.appendChild(cell(`${i + 1} → ${((i + 1) % n) + 1}`));
        if (i < n - 1) tr.append(inputCell(i, 'len'), inputCell(i, 'ang'));
        else {
          const l = cell('', 'ro'), a = cell('', 'ro');
          l.dataset.i = a.dataset.i = String(i);
          l.dataset.f = 'len';
          a.dataset.f = 'ang';
          tr.append(l, a);
        }
      }
      const del = cell(undefined, 'del');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.title = tableMode === 'xy' ? 'Supprimer ce sommet' : 'Supprimer le sommet de fin de ce mur';
      btn.disabled = n <= 3;
      btn.dataset.del = String(tableMode === 'xy' ? i : (i + 1) % n);
      del.appendChild(btn);
      tr.appendChild(del);
      body.appendChild(tr);
    });
    $('wallHint').hidden = tableMode !== 'walls';
    fillVertexValues();
  }

  function refreshVertexTable() {
    if ($('vertexBody').rows.length !== shapePoints(selected).length) buildVertexTable();
    else fillVertexValues();
  }

  function fillVertexValues() {
    const pts = shapePoints(selected);
    $('vertexBody').querySelectorAll('[data-f]').forEach(el => {
      const i = +el.dataset.i, f = el.dataset.f;
      const v = f === 'x' || f === 'y' ? pts[i][f] : wall(pts, i)[f];
      const txt = String(round2(v));
      if (el.tagName === 'INPUT') { if (el !== document.activeElement) el.value = txt; }
      else el.textContent = txt;
    });
  }

  function onVertexInput(e) {
    const el = e.target;
    if (!el.dataset.f) return;
    const v = parseFloat(el.value);
    if (!Number.isFinite(v)) return;
    const pts = shapePoints(selected);
    const i = +el.dataset.i, f = el.dataset.f;
    if (f === 'x' || f === 'y') {
      pts[i][f] = v;
    } else {
      const cur = wall(pts, i);
      const len = f === 'len' ? v : cur.len;
      const ang = ((f === 'ang' ? v : cur.ang) * Math.PI) / 180;
      if (len <= 0) return;
      const a = pts[i], b = pts[i + 1];
      const dx = round2(a.x + len * Math.cos(ang)) - b.x;
      const dy = round2(a.y + len * Math.sin(ang)) - b.y;
      for (let k = i + 1; k < pts.length; k++) {
        pts[k].x = round2(pts[k].x + dx);
        pts[k].y = round2(pts[k].y + dy);
      }
    }
    changed();
  }

  function deleteVertex(i) {
    const pts = shapePoints(selected);
    if (pts.length <= 3) return;
    pts.splice(i, 1);
    afterTopologyChange();
  }

  function afterTopologyChange() {
    buildVertexTable();
    buildStartVertexSelect();
    changed();
  }

  // ---------- Carreau de départ ----------
  function unit(to, from) {
    const dx = to.x - from.x, dy = to.y - from.y, l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  function alignStartToVertex(k) {
    const room = project.room, n = room.length;
    const cur = room[k];
    const zone = result ? result.zone : Geo.offset(room, project.joint.perimeter);
    let p = zone[0], best = Infinity;
    for (const z of zone) {
      const d = Math.hypot(z.x - cur.x, z.y - cur.y);
      if (d < best) { best = d; p = z; }
    }
    const u1 = unit(room[(k - 1 + n) % n], cur), u2 = unit(room[(k + 1) % n], cur);
    let bx = u1.x + u2.x, by = u1.y + u2.y;
    if (Math.hypot(bx, by) < 1e-6) { bx = -u2.y; by = u2.x; }
    const bl = Math.hypot(bx, by);
    bx /= bl; by /= bl;
    if (!Geo.pointInPolygon({ x: cur.x + bx, y: cur.y + by }, room)) { bx = -bx; by = -by; }
    const a = (project.start.angle * Math.PI) / 180;
    const lu = bx * Math.cos(a) + by * Math.sin(a);
    const lv = -bx * Math.sin(a) + by * Math.cos(a);
    project.start.anchor = lu >= 0 ? (lv >= 0 ? 'bl' : 'tl') : lv >= 0 ? 'br' : 'tr';
    project.start.x = round2(p.x);
    project.start.y = round2(p.y);
    changed();
  }

  function centerStart() {
    const zone = result ? result.zone : project.room;
    const c = Geo.centroid(zone);
    project.start.x = round2(c.x);
    project.start.y = round2(c.y);
    project.start.anchor = 'c';
    changed();
  }

  function setPlacing(on) {
    ui.placing = on;
    $('btnPlaceStart').classList.toggle('active', on);
    canvas.style.cursor = on ? 'crosshair' : 'default';
  }

  // ---------- Vue ----------
  const toScreen = p => ({ x: view.ox + p.x * view.scale, y: view.oy - p.y * view.scale });
  const toWorld = (sx, sy) => ({ x: (sx - view.ox) / view.scale, y: (view.oy - sy) / view.scale });

  function resizeCanvas() {
    const r = $('canvasWrap').getBoundingClientRect();
    view.dpr = window.devicePixelRatio || 1;
    view.w = r.width;
    view.h = r.height;
    canvas.width = Math.max(1, Math.round(r.width * view.dpr));
    canvas.height = Math.max(1, Math.round(r.height * view.dpr));
    render();
  }

  function fitView() {
    const b = Geo.bbox([...project.room, ...project.obstacles.flatMap(o => o.points)]);
    const m = 50;
    const bw = Math.max(b.maxX - b.minX, 1), bh = Math.max(b.maxY - b.minY, 1);
    const s = Math.min((view.w - 2 * m) / bw, (view.h - 2 * m) / bh);
    view.scale = s > 0 ? s : 0.1;
    view.ox = view.w / 2 - ((b.minX + b.maxX) / 2) * view.scale;
    view.oy = view.h / 2 + ((b.minY + b.maxY) / 2) * view.scale;
    render();
  }

  function pathPoly(poly) {
    ctx.beginPath();
    poly.forEach((p, i) => {
      const s = toScreen(p);
      if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
    });
    ctx.closePath();
  }

  // ---------- Rendu ----------
  function render() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, view.w, view.h);
    drawGrid();
    if (result && !result.error) drawTiles();
    drawShapes();
    if (result) drawStart();
    drawHighlights();
    drawHandles();
    drawScaleBar();
  }

  function drawGrid() {
    const steps = [10, 50, 100, 500, 1000, 5000, 10000, 50000];
    const step = steps.find(s => s * view.scale >= 12) || 50000;
    const tl = toWorld(0, 0), br = toWorld(view.w, view.h);
    const minor = new Path2D(), major = new Path2D();
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
      const sx = Math.round(toScreen({ x, y: 0 }).x) + 0.5;
      const p = Math.round(x / step) % 10 === 0 ? major : minor;
      p.moveTo(sx, 0); p.lineTo(sx, view.h);
    }
    for (let y = Math.floor(br.y / step) * step; y <= tl.y; y += step) {
      const sy = Math.round(toScreen({ x: 0, y }).y) + 0.5;
      const p = Math.round(y / step) % 10 === 0 ? major : minor;
      p.moveTo(0, sy); p.lineTo(view.w, sy);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid; ctx.stroke(minor);
    ctx.strokeStyle = COLORS.gridMajor; ctx.stroke(major);
  }

  function tileColor(t) {
    if (t.full) return COLORS.full;
    return t.source === 'offcut' ? COLORS.cutReuse : COLORS.cutNew;
  }

  function drawTiles() {
    ctx.save();
    pathPoly(project.room);
    ctx.clip();
    ctx.fillStyle = COLORS.joint;
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(70, 60, 50, .35)';
    for (const t of result.tiles) {
      pathPoly(t.piece);
      ctx.fillStyle = tileColor(t);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.joint;
    for (const ob of result.obstacles) { pathPoly(ob); ctx.fill(); }
    ctx.restore();

    if (ui.labels) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1f2937';
      for (const t of result.cuts) {
        const sw = t.w * view.scale, sh = t.h * view.scale;
        const lo = Math.min(sw, sh), hi = Math.max(sw, sh);
        if (lo < 12 || hi < 22) continue;
        const c = toScreen(Geo.centroid(t.piece));
        if (lo >= 28 && hi >= 50) {
          ctx.fillText(`C${t.id}`, c.x, c.y - 7);
          ctx.fillText(`${fmtMm(t.w)}×${fmtMm(t.h)}`, c.x, c.y + 7);
        } else {
          ctx.fillText(`C${t.id}`, c.x, c.y);
        }
      }
    }
  }

  function drawShapes() {
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    project.obstacles.forEach((o, k) => {
      pathPoly(o.points);
      ctx.fillStyle = COLORS.obstacle;
      ctx.fill();
      ctx.lineWidth = selected === k + 1 ? 2 : 1.2;
      ctx.strokeStyle = selected === k + 1 ? COLORS.select : '#4b5563';
      ctx.stroke();
      const c = toScreen(Geo.centroid(o.points));
      ctx.fillStyle = '#fff';
      ctx.fillText(o.name, c.x, c.y);
    });
    pathPoly(project.room);
    ctx.lineWidth = 2;
    ctx.strokeStyle = selected === 0 ? COLORS.select : COLORS.room;
    ctx.stroke();
    if (ui.dims) {
      drawDims(project.room);
      if (selected > 0) drawDims(shapePoints(selected));
    }
  }

  function drawDims(points) {
    const n = points.length;
    const s = Geo.signedArea(points) >= 0 ? 1 : -1;
    const off = 14 / view.scale;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len * view.scale < 35) continue;
      const nx = ((b.y - a.y) / len) * s, ny = (-(b.x - a.x) / len) * s;
      const m = toScreen({ x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off });
      const txt = fmtMm(len);
      const w = ctx.measureText(txt).width + 6;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(m.x - w / 2, m.y - 8, w, 16);
      ctx.fillStyle = '#374151';
      ctx.fillText(txt, m.x, m.y);
    }
  }

  function drawStart() {
    const f = result.frame;
    pathPoly([f.toWorld(0, 0), f.toWorld(f.L, 0), f.toWorld(f.L, f.W), f.toWorld(0, f.W)]);
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.start;
    ctx.stroke();
    ctx.setLineDash([]);

    const a = toScreen(f.toWorld(f.L * 0.2, f.W / 2)), b = toScreen(f.toWorld(f.L * 0.8, f.W / 2));
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 16) {
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      const hs = Math.min(10, len / 3);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * hs - uy * hs * 0.6, b.y - uy * hs + ux * hs * 0.6);
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * hs + uy * hs * 0.6, b.y - uy * hs - ux * hs * 0.6);
      ctx.stroke();
    }

    const s = toScreen(project.start);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.start;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  function drawHighlights() {
    if (!result || result.error) return;
    const list = [ui.hoverTile, result.cuts.find(t => t.id === ui.highlightId)].filter(Boolean);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLORS.hover;
    for (const t of list) { pathPoly(t.piece); ctx.stroke(); }
  }

  function drawHandles() {
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    shapePoints(selected).forEach((p, i) => {
      const s = toScreen(p);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = 2;
      ctx.fillRect(s.x - 5, s.y - 5, 10, 10);
      ctx.strokeRect(s.x - 5, s.y - 5, 10, 10);
      ctx.fillStyle = COLORS.select;
      ctx.fillText(String(i + 1), s.x + 7, s.y - 6);
    });
  }

  function drawScaleBar() {
    const len = [100, 200, 500, 1000, 2000, 5000, 10000].find(l => l * view.scale >= 60) || 10000;
    const px = len * view.scale;
    const x = 14, y = view.h - 16;
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5);
    ctx.stroke();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#374151';
    ctx.fillText(len >= 1000 ? `${len / 1000} m` : `${len} mm`, x + px / 2, y - 3);
  }

  // ---------- Résultats ----------
  function updateResults() {
    const statsBody = $('statsBody'), cutBody = $('cutBody'), err = $('resultError');
    statsBody.replaceChildren();
    cutBody.replaceChildren();
    err.hidden = !result.error;
    err.textContent = result.error || '';
    if (result.error) return;

    const s = result.stats;
    const p = project.purchase;
    const wastePct = s.total ? (s.wasteArea / (s.total * result.frame.L * result.frame.W)) * 100 : 0;
    const rows = [
      ['Surface de la pièce', m2(s.roomArea)],
      ['Obstacles', m2(s.obstacleArea), 'sub'],
      ['Surface carrelée', m2(s.floorArea), 'strong'],
      ['Couverte par les carreaux', m2(s.tiledArea), 'sub'],
      ['Joints et jeu périphérique', m2(s.floorArea - s.tiledArea), 'sub'],
      null,
      ['Carreaux entiers posés', fmt(s.fullCount)],
      ['Morceaux coupés', fmt(s.cutCount)],
      ['dont taillés dans des chutes', fmt(s.reused), 'sub'],
      ['Carreaux neufs entamés', fmt(s.newForCuts), 'sub'],
      ['Carreaux nécessaires', fmt(s.total), 'strong'],
      ['Sans réutilisation des chutes', fmt(s.totalNoOptim), 'sub'],
      null,
      [`À acheter (marge ${fmt(p.margin, 0, 1)} %)`, fmt(s.totalWithMargin), 'strong'],
      ['Boîtes', s.boxes === null ? '—' : `${fmt(s.boxes)} × ${p.tilesPerBox}`],
      ['Surface achetée', m2(s.purchaseArea)],
      ['Chutes perdues', `${m2(s.wasteArea)} (${fmt(wastePct, 0, 1)} %)`],
      [`Coupes fines (< ${s.thinLimit} mm)`, fmt(s.thinCuts), s.thinCuts ? 'warn' : ''],
    ];
    for (const row of rows) {
      const tr = document.createElement('tr');
      if (!row) {
        tr.className = 'sep';
        const td = cell('');
        td.colSpan = 2;
        tr.appendChild(td);
      } else {
        if (row[2]) tr.className = row[2];
        tr.append(cell(row[0]), cell(row[1]));
      }
      statsBody.appendChild(tr);
    }

    for (const t of result.cuts) {
      const tr = document.createElement('tr');
      tr.dataset.id = String(t.id);
      if (t.id === ui.highlightId) tr.className = 'active';
      const src = t.source === 'offcut' ? `Chute du T${t.stock}${t.rotated ? ' (pivotée)' : ''}` : `Neuf T${t.stock}`;
      tr.append(cell(`C${t.id}`), cell(`${fmtMm(t.w)} × ${fmtMm(t.h)}`), cell(src, t.source === 'offcut' ? 'src-offcut' : 'src-new'));
      cutBody.appendChild(tr);
    }
  }

  function tileInfo(t) {
    if (t.full) return 'Carreau entier';
    const src = t.source === 'offcut'
      ? `Taillée dans une chute du carreau T${t.stock}${t.rotated ? ' (pivotée 90°)' : ''}`
      : `Taillée dans le carreau neuf T${t.stock}`;
    return `Coupe C${t.id} : ${fmtMm(t.w)} × ${fmtMm(t.h)} mm\nSurface posée : ${fmt(t.area / 1e6, 3)} m²\n${src}`;
  }

  // ---------- Souris ----------
  function mousePos(e) {
    const r = canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  function hitVertex(points, sx, sy) {
    for (let i = points.length - 1; i >= 0; i--) {
      const s = toScreen(points[i]);
      if (Math.hypot(s.x - sx, s.y - sy) <= 8) return i;
    }
    return -1;
  }

  function hitStart(sx, sy) {
    const s = toScreen(project.start);
    return Math.hypot(s.x - sx, s.y - sy) <= 9;
  }

  function updateHover(sx, sy) {
    const w = toWorld(sx, sy);
    let info = null, tile = null;
    const ob = project.obstacles.find(o => Geo.pointInPolygon(w, o.points));
    if (ob) info = ob.name;
    else if (result && !result.error && Geo.pointInPolygon(w, project.room)) {
      tile = result.tiles.find(t => Geo.pointInPolygon(w, t.piece)) || null;
      if (tile) info = tileInfo(tile);
    }
    if (tile !== ui.hoverTile) { ui.hoverTile = tile; render(); }
    tooltip.hidden = !info;
    if (info) {
      tooltip.textContent = info;
      tooltip.style.left = `${Math.min(sx + 14, view.w - 240)}px`;
      tooltip.style.top = `${sy + 14}px`;
    }
    const onHandle = hitStart(sx, sy) || project.obstacles.concat([{ points: project.room }]).some(o => hitVertex(o.points, sx, sy) >= 0);
    canvas.style.cursor = ui.placing ? 'crosshair' : onHandle ? 'move' : 'default';
  }

  function bindCanvas() {
    canvas.addEventListener('mousedown', e => {
      const { sx, sy } = mousePos(e);
      if (e.button === 1) {
        e.preventDefault();
        ui.drag = { type: 'pan', sx, sy, ox: view.ox, oy: view.oy };
        return;
      }
      if (e.button !== 0) return;
      const w = toWorld(sx, sy);
      if (ui.placing) {
        project.start.x = snapV(w.x, e);
        project.start.y = snapV(w.y, e);
        setPlacing(false);
        changed();
        return;
      }
      if (hitStart(sx, sy)) { ui.drag = { type: 'start' }; return; }
      let vi = hitVertex(shapePoints(selected), sx, sy);
      if (vi < 0) {
        for (let k = 0; k <= project.obstacles.length && vi < 0; k++) {
          if (k === selected) continue;
          vi = hitVertex(shapePoints(k), sx, sy);
          if (vi >= 0) selectShape(k);
        }
      }
      if (vi >= 0) { ui.drag = { type: 'vertex', i: vi }; return; }
      ui.drag = { type: 'pan', sx, sy, ox: view.ox, oy: view.oy };
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', e => {
      const { sx, sy } = mousePos(e);
      const d = ui.drag;
      if (d) {
        tooltip.hidden = true;
        if (d.type === 'pan') {
          view.ox = d.ox + sx - d.sx;
          view.oy = d.oy + sy - d.sy;
          render();
        } else {
          const w = toWorld(sx, sy);
          const p = { x: snapV(w.x, e), y: snapV(w.y, e) };
          if (d.type === 'vertex') shapePoints(selected)[d.i] = p;
          else { project.start.x = p.x; project.start.y = p.y; }
          changed();
        }
        return;
      }
      if (e.target === canvas) updateHover(sx, sy);
      else if (!tooltip.hidden) tooltip.hidden = true;
    });

    window.addEventListener('mouseup', () => {
      if (ui.drag && ui.drag.type === 'pan') canvas.style.cursor = 'default';
      ui.drag = null;
    });

    canvas.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
      if (ui.hoverTile) { ui.hoverTile = null; render(); }
    });

    canvas.addEventListener('dblclick', e => {
      const { sx, sy } = mousePos(e);
      const pts = shapePoints(selected);
      const m = { x: sx, y: sy };
      for (let i = 0; i < pts.length; i++) {
        const c = Geo.closestOnSegment(m, toScreen(pts[i]), toScreen(pts[(i + 1) % pts.length]));
        if (c.d <= 8) {
          const w = toWorld(c.x, c.y);
          pts.splice(i + 1, 0, { x: snapV(w.x, e), y: snapV(w.y, e) });
          afterTopologyChange();
          return;
        }
      }
    });

    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      const { sx, sy } = mousePos(e);
      const vi = hitVertex(shapePoints(selected), sx, sy);
      if (vi >= 0) deleteVertex(vi);
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const { sx, sy } = mousePos(e);
      const w = toWorld(sx, sy);
      view.scale = Math.min(20, Math.max(0.002, view.scale * Math.exp(-e.deltaY * 0.0015)));
      view.ox = sx - w.x * view.scale;
      view.oy = sy + w.y * view.scale;
      render();
    }, { passive: false });
  }

  // ---------- Interface ----------
  function bindUI() {
    $('btnUndo').addEventListener('click', () => stepHistory(-1));
    $('btnRedo').addEventListener('click', () => stepHistory(1));

    $('btnNew').addEventListener('click', () => {
      if (!confirm('Créer un nouveau projet ? Les modifications non enregistrées en JSON seront perdues.')) return;
      project = Project.defaults();
      selected = 0;
      ui.highlightId = null;
      refreshAll();
      fitView();
    });

    $('btnOpen').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        project = Project.normalize(JSON.parse(await file.text()));
        selected = 0;
        ui.highlightId = null;
        refreshAll();
        fitView();
      } catch (err) {
        alert(`Impossible de lire ce fichier : ${err.message}`);
      }
    });

    $('btnSave').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(project.name || '').replace(/[^\p{L}\p{N} _-]+/gu, '_').trim() || 'calepinage'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    $('shapeSelect').addEventListener('change', e => selectShape(+e.target.value));

    $('obstacleName').addEventListener('input', e => {
      if (selected === 0) return;
      project.obstacles[selected - 1].name = e.target.value.slice(0, 60);
      $('shapeSelect').options[selected].textContent = shapeName(selected);
      render();
      scheduleSave();
      scheduleHistory();
    });

    $('btnAddObstacle').addEventListener('click', () => {
      const c = Geo.centroid(project.room);
      const x = snapV(c.x - 300), y = snapV(c.y - 300);
      project.obstacles.push({
        name: `Obstacle ${project.obstacles.length + 1}`,
        points: [{ x, y }, { x: x + 600, y }, { x: x + 600, y: y + 600 }, { x, y: y + 600 }],
      });
      selected = project.obstacles.length;
      refreshAll();
    });

    $('btnDelObstacle').addEventListener('click', () => {
      if (selected === 0) return;
      project.obstacles.splice(selected - 1, 1);
      selected = 0;
      refreshAll();
    });

    $('btnPreset').addEventListener('click', () => {
      const key = $('presetSelect').value;
      if (!Project.presets[key] || !confirm('Remplacer la géométrie de la pièce par ce modèle ?')) return;
      project.room = Project.presets[key]();
      selected = 0;
      refreshAll();
      fitView();
    });

    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
      tableMode = b.dataset.mode;
      document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
      buildVertexTable();
    }));

    $('vertexBody').addEventListener('input', onVertexInput);
    $('vertexBody').addEventListener('click', e => {
      const btn = e.target.closest('button[data-del]');
      if (btn) deleteVertex(+btn.dataset.del);
    });

    $('btnAddVertex').addEventListener('click', () => {
      const pts = shapePoints(selected);
      const a = pts[pts.length - 1], b = pts[0];
      pts.push({ x: round2((a.x + b.x) / 2), y: round2((a.y + b.y) / 2) });
      afterTopologyChange();
    });

    document.querySelectorAll('[data-angle]').forEach(b => b.addEventListener('click', () => {
      project.start.angle = +b.dataset.angle;
      changed();
    }));
    $('btnPlaceStart').addEventListener('click', () => setPlacing(!ui.placing));
    $('btnAlignVertex').addEventListener('click', () => alignStartToVertex(+$('startVertex').value));
    $('btnOrientWall').addEventListener('click', () => {
      project.start.angle = round2(wall(project.room, +$('startVertex').value).ang);
      changed();
    });
    $('btnCenter').addEventListener('click', centerStart);

    $('btnFit').addEventListener('click', fitView);
    $('chkLabels').addEventListener('change', e => { ui.labels = e.target.checked; render(); });
    $('chkDims').addEventListener('change', e => { ui.dims = e.target.checked; render(); });
    $('snapInput').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      ui.snap = Number.isFinite(v) && v >= 0 ? v : 0;
    });

    $('cutBody').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = +tr.dataset.id;
      ui.highlightId = ui.highlightId === id ? null : id;
      $('cutBody').querySelectorAll('tr').forEach(r => r.classList.toggle('active', +r.dataset.id === ui.highlightId));
      render();
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && ui.placing) setPlacing(false);
      const t = e.target;
      const inField = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'checkbox');
      if (!(e.ctrlKey || e.metaKey) || e.altKey || inField) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); stepHistory(-1); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); stepHistory(1); }
    });
  }

  // ---------- Démarrage ----------
  bindInputs();
  bindUI();
  bindCanvas();
  new ResizeObserver(resizeCanvas).observe($('canvasWrap'));
  resizeCanvas();
  refreshAll();
  fitView();
})();
