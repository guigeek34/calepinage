'use strict';
(() => {
  const STORAGE_KEY = 'calepinage.project';
  const COLORS = {
    bg: '#fbfbfb', grid: '#eeeeee', gridMajor: '#dadada', joint: '#bdb7ad',
    full: '#f1e4c8', cutNew: '#f4a259', cutReuse: '#7cc6a4', obstacle: '#8b929c', cutLine: '#e02424',
    room: '#1f2937', select: '#2563eb', start: '#dc2626', hover: '#1d4ed8',
  };

  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const tooltip = $('tooltip');

  let project = loadInitial();
  let result = null;
  let selected = 0; // 0 = pièce, i > 0 = obstacle i-1
  let tableMode = 'walls';
  const view = { scale: 0.1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  const ui = { labels: true, dims: true, snap: 10, placing: false, hoverTile: null, highlightId: null, drag: null, touch: false };

  // ---------- Utilitaires ----------
  const fmt = (v, min = 0, max = min) => v.toLocaleString('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
  const fmtMm = v => fmt(v, 0, 1);
  const m2 = mm2 => `${fmt(mm2 / 1e6, 2)} m²`;
  const round2 = v => Math.round(v * 100) / 100;

  // Vocabulaire selon le revêtement (carreau : masculin, lame : féminin).
  const TEXTS = {
    tile: {
      title: 'Calepinage carrelage',
      dims: 'Dimensions du carreau',
      along: 'du carreau',
      secElems: '2. Carreaux et joints',
      secStart: '3. Carreau de départ',
      length: 'Longueur du carreau (mm)',
      width: 'Largeur du carreau (mm)',
      perimeter: 'Joint périphérique (mm)',
      offsetHint: 'Le décalage des rangées se fait dans le sens de la longueur du carreau.',
      anchor: 'Point du carreau placé',
      alignTitle: "Place le carreau dans l'angle de ce sommet (joint périphérique inclus)",
      orientTitle: 'Oriente les carreaux parallèlement au mur partant de ce sommet',
      startHint: 'Le carreau de départ est encadré en rouge ; la flèche indique le sens de la longueur. Le point rouge se déplace à la souris.',
      rotateHint: 'Rotation déconseillée pour les carreaux à motif ou veinage orienté.',
      innerCutsHint: 'Les bords coupés sont toujours placés contre un mur ou un obstacle, jamais contre un autre carreau.',
      margin: 'Marge casse / sécurité (%)',
      perBox: 'Carreaux par boîte (0 = ignorer)',
      legendFull: 'Entier',
      legendNew: 'Coupe (carreau neuf)',
      cutsHint: 'Cotes du rectangle à découper, dans le sens du carreau (longueur × largeur). Chaque carreau neuf entamé pour les coupes reçoit un numéro (n°1, n°2…). « Chute de C3 » : tailler la coupe dans le reste du carreau qui a servi à C3. Cliquer sur une ligne ou sur un carreau du plan pour le repérer. Formes complexes : croquis et étapes de découpe, pièce vue de dessus telle que posée ; les traits rouges du croquis sont les bords rouges du plan.',
      planTitle: 'Découpe des carreaux neufs',
      planHint: "Pour chaque carreau neuf, les coupes à y tailler dans l'ordre : la première dans le carreau entier, les suivantes dans ce qu'il en reste.",
      planCol: 'Carreau',
      statFloor: 'Surface carrelée',
      statCovered: 'Couverte par les carreaux',
      statGap: 'Joints et jeu périphérique',
      statFull: 'Carreaux entiers posés',
      statNew: 'Carreaux neufs entamés',
      statTotal: 'Carreaux nécessaires',
      statBoxes: 'Boîtes',
      full: 'Carreau entier',
      newN: n => `Carreau neuf n°${n}`,
      fromNew: n => `Taillée dans le carreau neuf n°${n}`,
      stockN: n => `carreau n°${n}`,
    },
    parquet: {
      title: 'Calepinage parquet',
      dims: 'Dimensions de la lame',
      along: 'de la lame',
      secElems: '2. Lames',
      secStart: '3. Lame de départ',
      length: 'Longueur de la lame (mm)',
      width: 'Largeur de la lame (mm)',
      perimeter: 'Jeu de dilatation périphérique (mm)',
      offsetHint: 'Lames jointives (pas de joint). Le décalage des rangées se fait dans le sens de la longueur de la lame. Jeu de dilatation le long des murs : en général 8 à 10 mm.',
      anchor: 'Point de la lame placé',
      alignTitle: "Place la lame dans l'angle de ce sommet (jeu de dilatation inclus)",
      orientTitle: 'Oriente les lames parallèlement au mur partant de ce sommet',
      startHint: 'La lame de départ est encadrée en rouge ; la flèche indique le sens de la longueur. Le point rouge se déplace à la souris.',
      rotateHint: 'Les chutes ne sont jamais tournées de 90° (sens du fil et emboîtement des lames).',
      innerCutsHint: 'Les bords coupés sont toujours placés contre un mur ou un obstacle, jamais contre une autre lame.',
      margin: 'Marge de sécurité (%)',
      perBox: 'Lames par paquet (0 = ignorer)',
      legendFull: 'Entière',
      legendNew: 'Coupe (lame neuve)',
      cutsHint: 'Cotes du rectangle à découper, dans le sens de la lame (longueur × largeur). Chaque lame neuve entamée pour les coupes reçoit un numéro (n°1, n°2…). « Chute de C3 » : tailler la coupe dans le reste de la lame qui a servi à C3. Cliquer sur une ligne ou sur une lame du plan pour la repérer. Formes complexes : croquis et étapes de découpe, pièce vue de dessus telle que posée ; les traits rouges du croquis sont les bords rouges du plan.',
      planTitle: 'Découpe des lames neuves',
      planHint: "Pour chaque lame neuve, les coupes à y tailler dans l'ordre : la première dans la lame entière, les suivantes dans ce qu'il en reste.",
      planCol: 'Lame',
      statFloor: 'Surface parquetée',
      statCovered: 'Couverte par les lames',
      statGap: 'Jeu de dilatation',
      statFull: 'Lames entières posées',
      statNew: 'Lames neuves entamées',
      statTotal: 'Lames nécessaires',
      statBoxes: 'Paquets',
      full: 'Lame entière',
      newN: n => `Lame neuve n°${n}`,
      fromNew: n => `Taillée dans la lame neuve n°${n}`,
      stockN: n => `lame n°${n}`,
    },
  };
  const T = key => (TEXTS[project.material] || TEXTS.tile)[key];

  function applyMaterial() {
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.dataset.t); });
    document.querySelectorAll('[data-t-title]').forEach(el => { el.title = T(el.dataset.tTitle); });
    document.querySelectorAll('[data-only]').forEach(el => { el.hidden = el.dataset.only !== project.material; });
    document.querySelectorAll('#materialTabs button').forEach(b => b.classList.toggle('active', b.dataset.material === project.material));
    document.title = T('title');
  }

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

  const TURN_PRESETS = [
    [90, '↰ 90° G'], [-90, '↱ 90° D'],
    [45, '↰ 45° G'], [-45, '↱ 45° D'],
    [135, '↰ 135° G'], [-135, '↱ 135° D'],
    [0, '↑ 0°'],
  ];
  const DIR_PRESETS = [[0, '→ droite'], [90, '↑ haut'], [180, '← gauche'], [270, '↓ bas']];

  function normTurn(a) {
    let t = ((a % 360) + 360) % 360;
    if (t > 180) t -= 360;
    return Math.abs(t) < 0.005 ? 0 : t;
  }

  // Virage au sommet i, entre le mur i-1 et le mur i : positif = à gauche.
  const turnAt = (pts, i) => normTurn(wall(pts, i).ang - wall(pts, (i - 1 + pts.length) % pts.length).ang);
  const turnText = t => (t > 0 ? `↰ ${fmt(t, 0, 1)}° G` : t < 0 ? `↱ ${fmt(-t, 0, 1)}° D` : '↑ 0°');

  function rotateChain(pts, i, deltaDeg) {
    const c = pts[i], a = (deltaDeg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    for (let k = i + 1; k < pts.length; k++) {
      const dx = pts[k].x - c.x, dy = pts[k].y - c.y;
      pts[k] = { x: round2(c.x + dx * cos - dy * sin), y: round2(c.y + dx * sin + dy * cos) };
    }
  }

  const getPath = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
  function setPath(obj, path, val) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = val;
  }

  const snapV = (v, e) => (ui.snap > 0 && !(e && e.altKey) ? Math.round(v / ui.snap) * ui.snap : round2(v));

  // Aimante le carreau de départ sur la zone carrelable (pièce réduite du joint périphérique) avant la grille.
  function snapStart(w, e) {
    if (e && e.altKey) return { x: round2(w.x), y: round2(w.y) };
    const zone = result && result.zone ? result.zone : Geo.offset(project.room, project.joint.perimeter);
    const tol = 10 / view.scale;
    let best = null, bd = tol;
    for (const z of zone) {
      const d = Math.hypot(z.x - w.x, z.y - w.y);
      if (d <= bd) { bd = d; best = z; }
    }
    if (best) return { x: round2(best.x), y: round2(best.y) };
    const axis = (v, key) => {
      let r = null, rd = tol;
      for (const z of zone) {
        const d = Math.abs(z[key] - v);
        if (d <= rd) { rd = d; r = z[key]; }
      }
      return r !== null ? round2(r) : snapV(v, e);
    };
    return { x: axis(w.x, 'x'), y: axis(w.y, 'y') };
  }

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
    applyMaterial();
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

  function angleCell(i, kind) {
    const td = document.createElement('td');
    td.className = 'angle';
    const sel = document.createElement('select');
    sel.dataset.i = String(i);
    sel.dataset.k = kind;
    for (const [v, label] of kind === 'dir' ? DIR_PRESETS : TURN_PRESETS) sel.add(new Option(label, String(v)));
    sel.add(new Option('Autre…', 'other'));
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = 'any';
    inp.dataset.i = String(i);
    inp.dataset.f = kind;
    inp.title = kind === 'dir'
      ? 'Direction en degrés (0° = vers la droite, 90° = vers le haut)'
      : 'Virage en degrés (positif = à gauche, négatif = à droite)';
    td.append(sel, inp);
    return td;
  }

  function buildVertexTable() {
    const pts = shapePoints(selected);
    const n = pts.length;
    const head = $('vertexHead'), body = $('vertexBody');
    head.replaceChildren();
    body.replaceChildren();
    const hr = document.createElement('tr');
    const titles = tableMode === 'xy' ? ['#', 'X (mm)', 'Y (mm)', ''] : ['Mur', 'Longueur (mm)', 'Virage', ''];
    titles.forEach(t => { const th = document.createElement('th'); th.textContent = t; hr.appendChild(th); });
    head.appendChild(hr);

    pts.forEach((_, i) => {
      const tr = document.createElement('tr');
      if (tableMode === 'xy') {
        tr.append(cell(String(i + 1)), inputCell(i, 'x'), inputCell(i, 'y'));
      } else {
        const label = cell(`${i + 1} → ${((i + 1) % n) + 1}`);
        label.title = `Mur du sommet ${i + 1} au sommet ${((i + 1) % n) + 1}`;
        tr.appendChild(label);
        if (i < n - 1) tr.append(inputCell(i, 'len'), angleCell(i, i === 0 ? 'dir' : 'turn'));
        else {
          const l = cell('', 'ro'), a = cell('', 'ro');
          l.dataset.i = a.dataset.i = String(i);
          l.dataset.f = 'len';
          a.dataset.f = 'turnRo';
          l.title = a.title = 'Mur de fermeture, calculé automatiquement';
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
    $('btnAddVertex').textContent = tableMode === 'walls' ? '+ Ajouter un mur' : '+ Ajouter un sommet';
    fillVertexValues();
  }

  function refreshVertexTable() {
    if ($('vertexBody').rows.length !== shapePoints(selected).length) buildVertexTable();
    else fillVertexValues();
  }

  function fillVertexValues() {
    const pts = shapePoints(selected);
    const body = $('vertexBody');
    body.querySelectorAll('[data-f]').forEach(el => {
      const i = +el.dataset.i, f = el.dataset.f;
      let v;
      if (f === 'x' || f === 'y') v = pts[i][f];
      else if (f === 'len') v = wall(pts, i).len;
      else if (f === 'dir') v = wall(pts, i).ang;
      else v = turnAt(pts, i);
      if (el.tagName === 'INPUT') { if (el !== document.activeElement) el.value = String(round2(v)); }
      else el.textContent = f === 'turnRo' ? turnText(v) : fmtMm(v);
    });
    body.querySelectorAll('select[data-k]').forEach(sel => {
      const i = +sel.dataset.i;
      const inp = sel.nextElementSibling;
      if (inp !== document.activeElement) {
        const v = sel.dataset.k === 'dir' ? wall(pts, i).ang : turnAt(pts, i);
        const preset = [...sel.options].find(o => o.value !== 'other' && Math.abs(+o.value - v) < 0.01);
        sel.value = preset ? preset.value : 'other';
      }
      inp.hidden = sel.value !== 'other';
    });
  }

  function applyAngle(i, kind, v) {
    const pts = shapePoints(selected);
    const cur = kind === 'dir' ? wall(pts, i).ang : turnAt(pts, i);
    if (Math.abs(v - cur) < 1e-9) return;
    rotateChain(pts, i, v - cur);
    changed();
  }

  function onVertexInput(e) {
    const el = e.target;
    if (!el.dataset.f) return;
    const v = parseFloat(el.value);
    if (!Number.isFinite(v)) return;
    const pts = shapePoints(selected);
    const i = +el.dataset.i, f = el.dataset.f;
    if (f === 'dir' || f === 'turn') { applyAngle(i, f, v); return; }
    if (f === 'x' || f === 'y') {
      pts[i][f] = v;
    } else {
      const cur = wall(pts, i);
      const ang = (cur.ang * Math.PI) / 180;
      if (v <= 0 || cur.len === 0) return;
      const a = pts[i], b = pts[i + 1];
      const dx = round2(a.x + v * Math.cos(ang)) - b.x;
      const dy = round2(a.y + v * Math.sin(ang)) - b.y;
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
    if (result && !result.error) drawCutLines();
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

  // Dessinés après la sélection pour rester visibles ; liseré blanc pour ressortir sur toutes les couleurs.
  function drawCutLines() {
    const all = new Path2D(), active = new Path2D();
    for (const t of result.cuts) {
      const p = t.id === ui.highlightId || t === ui.hoverTile ? active : all;
      for (const [a, b] of t.shape.edges) {
        const sa = toScreen(a), sb = toScreen(b);
        p.moveTo(sa.x, sa.y); p.lineTo(sb.x, sb.y);
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5; ctx.stroke(all);
    ctx.lineWidth = 7; ctx.stroke(active);
    ctx.strokeStyle = COLORS.cutLine;
    ctx.lineWidth = 2.5; ctx.stroke(all);
    ctx.lineWidth = 4; ctx.stroke(active);
    ctx.restore();
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
  function statsRows() {
    const s = result.stats;
    const p = project.purchase;
    const wastePct = s.total ? (s.wasteArea / (s.total * result.frame.L * result.frame.W)) * 100 : 0;
    return [
      ['Surface de la pièce', m2(s.roomArea)],
      ['Obstacles', m2(s.obstacleArea), 'sub'],
      [T('statFloor'), m2(s.floorArea), 'strong'],
      [T('statCovered'), m2(s.tiledArea), 'sub'],
      [T('statGap'), m2(s.floorArea - s.tiledArea), 'sub'],
      null,
      [T('statFull'), fmt(s.fullCount)],
      ['Morceaux coupés', fmt(s.cutCount)],
      ['dont taillés dans des chutes', fmt(s.reused), 'sub'],
      [T('statNew'), fmt(s.newForCuts), 'sub'],
      [T('statTotal'), fmt(s.total), 'strong'],
      ['Sans réutilisation des chutes', fmt(s.totalNoOptim), 'sub'],
      null,
      [`À acheter (marge ${fmt(p.margin, 0, 1)} %)`, fmt(s.totalWithMargin), 'strong'],
      [T('statBoxes'), s.boxes === null ? '—' : `${fmt(s.boxes)} × ${p.tilesPerBox}`],
      ['Surface achetée', m2(s.purchaseArea)],
      ['Chutes perdues', `${m2(s.wasteArea)} (${fmt(wastePct, 0, 1)} %)`],
      [`Coupes fines (< ${s.thinLimit} mm)`, fmt(s.thinCuts), s.thinCuts ? 'warn' : ''],
    ];
  }

  function updateResults() {
    const statsBody = $('statsBody'), cutBody = $('cutBody'), planBody = $('planBody'), err = $('resultError');
    statsBody.replaceChildren();
    cutBody.replaceChildren();
    planBody.replaceChildren();
    err.hidden = !result.error;
    err.textContent = result.error || '';
    if (result.error) return;

    const rows = statsRows();
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
      tr.append(cell(`C${t.id}`), cell(`${fmtMm(t.w)} × ${fmtMm(t.h)}${t.shape.complex ? ' + forme' : ''}`), cell(sourceLabel(t), t.source === 'offcut' ? 'src-offcut' : 'src-new'));
      cutBody.appendChild(tr);
      if (t.shape.complex) cutBody.appendChild(shapeRow(t));
    }

    for (const s of result.plan) {
      const tr = document.createElement('tr');
      const td = cell();
      s.pieces.forEach((p, i) => {
        if (i) td.append(' → ');
        const span = document.createElement('span');
        span.className = 'piece' + (p.id === ui.highlightId ? ' active' : '');
        span.dataset.id = String(p.id);
        span.textContent = `C${p.id} (${fmtMm(p.w)}×${fmtMm(p.h)}${p.shape.complex ? ', forme' : ''})`;
        td.appendChild(span);
      });
      tr.append(cell(`n°${s.stock}`), td);
      planBody.appendChild(tr);
    }
  }

  const r0 = v => (Math.abs(v) < 0.05 ? 0 : v);
  const mm = v => `${fmtMm(r0(v))} mm`;
  const near = (a, b) => Math.abs(a - b) < 0.05;
  const letter = i => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1));

  // Repère de la pièce : vue de dessus telle que posée, origine au coin bas-gauche du rectangle w × h.
  function pointText(p, w, h) {
    const v = near(p.y, 0) ? 'bas' : near(p.y, h) ? 'haut' : null;
    const s = near(p.x, 0) ? 'gauche' : near(p.x, w) ? 'droit' : null;
    if (v && s) return `le coin ${v}-${s}`;
    if (s) return `le bord ${s}, à ${mm(p.y)} du bas`;
    if (v) return `le bord ${v}, à ${mm(p.x)} de la gauche`;
    return `le point à ${mm(p.x)} de la gauche et ${mm(p.y)} du bas`;
  }

  function traitText(tr, w, h) {
    const { a, b } = tr;
    if (near(a.x, b.x)) {
      const x = a.x, y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      const pos = x <= w / 2 ? `à ${mm(x)} du bord gauche` : `à ${mm(w - x)} du bord droit`;
      const ext = near(y1, h) ? 'en partant du bord haut' : near(y0, 0) ? 'en partant du bord bas' : `entre ${mm(y0)} et ${mm(y1)} au-dessus du bord bas`;
      return `vertical, ${pos}, ${ext}`;
    }
    if (near(a.y, b.y)) {
      const y = a.y, x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      const pos = y <= h / 2 ? `à ${mm(y)} du bord bas` : `à ${mm(h - y)} du bord haut`;
      const ext = near(x1, w) ? 'en partant du bord droit' : near(x0, 0) ? 'en partant du bord gauche' : `entre ${mm(x0)} et ${mm(x1)} du bord gauche`;
      return `horizontal, ${pos}, ${ext}`;
    }
    return `en biais, de ${pointText(a, w, h)} jusqu'à ${pointText(b, w, h)}`;
  }

  function shapeSteps(t) {
    const s = t.shape;
    const steps = [`Découper un rectangle de ${fmtMm(t.w)} × ${fmtMm(t.h)} mm.`];
    s.traits.forEach((tr, i) => steps.push(`Trait ${letter(i)} (${mm(tr.len)}) : ${traitText(tr, t.w, t.h)}.`));
    if (s.traits.length) steps.push('Retirer la partie hachurée.');
    s.holes.forEach((h, i) => {
      const b = Geo.bbox(h);
      const rect = h.length === 4 && near(Geo.area(h), (b.maxX - b.minX) * (b.maxY - b.minY));
      const name = `Découpe obstacle${s.holes.length > 1 ? ` ${i + 1}` : ''}`;
      const kind = rect ? 'rectangle' : 'zone (forme exacte : voir croquis)';
      steps.push(`${name} : ${kind} de ${fmtMm(b.maxX - b.minX)} × ${fmtMm(b.maxY - b.minY)} mm, à ${mm(b.minX)} du bord gauche et ${mm(b.minY)} du bord bas.`);
    });
    return steps;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function shapeSketch(t) {
    const s = t.shape, pad = 20;
    const sc = Math.min((280 - 2 * pad) / t.w, (150 - 2 * pad) / t.h);
    const X = x => pad + x * sc, Y = y => pad + (t.h - y) * sc;
    const pts = poly => poly.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    const vw = t.w * sc + 2 * pad, vh = t.h * sc + 2 * pad;
    const svg = svgEl('svg', { class: 'sketch', width: vw.toFixed(0), height: vh.toFixed(0), viewBox: `0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}` });
    const hatch = `hatch-${t.id}`;
    const pattern = svgEl('pattern', { id: hatch, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pattern.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#9ca3af', 'stroke-width': 2 }));
    const defs = svgEl('defs');
    defs.appendChild(pattern);
    svg.appendChild(defs);
    svg.appendChild(svgEl('rect', { x: X(0), y: Y(t.h), width: t.w * sc, height: t.h * sc, fill: `url(#${hatch})`, stroke: '#6b7280', 'stroke-dasharray': '4 3' }));
    svg.appendChild(svgEl('polygon', { points: pts(s.outline), fill: tileColor(t) }));
    for (const h of s.holes) svg.appendChild(svgEl('polygon', { points: pts(h), fill: `url(#${hatch})`, stroke: COLORS.cutLine, 'stroke-width': 2.5 }));
    for (const tr of s.traits) {
      svg.appendChild(svgEl('line', { x1: X(tr.a.x), y1: Y(tr.a.y), x2: X(tr.b.x), y2: Y(tr.b.y), stroke: COLORS.cutLine, 'stroke-width': 3, 'stroke-linecap': 'round' }));
    }
    s.traits.forEach((tr, i) => {
      svg.appendChild(svgEl('text', { x: X((tr.a.x + tr.b.x) / 2), y: Y((tr.a.y + tr.b.y) / 2), class: 'lbl' }, letter(i)));
    });
    svg.appendChild(svgEl('text', { x: X(t.w / 2), y: Y(0) + 13, class: 'dim' }, fmtMm(t.w)));
    svg.appendChild(svgEl('text', { x: X(0) - 6, y: Y(t.h / 2), class: 'dim', transform: `rotate(-90 ${X(0) - 6} ${Y(t.h / 2)})` }, fmtMm(t.h)));
    return svg;
  }

  function shapeRow(t) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(t.id);
    tr.className = 'detail' + (t.id === ui.highlightId ? ' active' : '');
    const td = cell();
    td.colSpan = 3;
    const ol = document.createElement('ol');
    for (const step of shapeSteps(t)) {
      const li = document.createElement('li');
      li.textContent = step;
      ol.appendChild(li);
    }
    td.append(shapeSketch(t), ol);
    tr.appendChild(td);
    return tr;
  }

  function sourceLabel(t) {
    if (t.source !== 'offcut') return T('newN')(t.stock);
    return `Chute de C${t.fromPiece} (n°${t.stock})${t.rotation === 180 ? ' ↻ 180°' : t.rotation ? ' ↻' : ''}`;
  }

  function tileInfo(t) {
    if (t.full) return T('full');
    const src = t.source === 'offcut'
      ? `Taillée dans la chute de C${t.fromPiece} (${T('stockN')(t.stock)})${t.rotation ? `, pivotée de ${t.rotation === 180 ? 180 : 90}°` : ''}`
      : T('fromNew')(t.stock);
    const shape = t.shape.complex ? `\n\nForme complexe (vue de dessus, telle que posée) :\n${shapeSteps(t).map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '';
    return `Coupe C${t.id} : ${fmtMm(t.w)} × ${fmtMm(t.h)} mm\nSurface posée : ${fmt(t.area / 1e6, 3)} m²\n${src}${shape}`;
  }

  function setHighlight(id, scroll) {
    ui.highlightId = id;
    let row = null;
    document.querySelectorAll('#cutBody tr[data-id], #planBody [data-id]').forEach(el => {
      const on = +el.dataset.id === id;
      el.classList.toggle('active', on);
      if (on && el.tagName === 'TR' && !row) row = el;
    });
    // En affichage empilé (tablette), le panneau ne défile pas : ne pas faire sauter la page loin du plan.
    const panel = row && row.closest('.panel');
    if (scroll && row && panel.scrollHeight > panel.clientHeight) row.scrollIntoView({ block: 'nearest' });
    render();
  }

  function selectTileAt(sx, sy) {
    if (!result || result.error) return;
    const w = toWorld(sx, sy);
    const onObstacle = project.obstacles.some(o => Geo.pointInPolygon(w, o.points));
    const tile = onObstacle ? null : result.tiles.find(t => Geo.pointInPolygon(w, t.piece));
    const id = tile && !tile.full && tile.id !== ui.highlightId ? tile.id : null;
    setHighlight(id, true);
  }

  // ---------- Export PDF ----------
  function download(blob, ext) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(project.name || '').replace(/[^\p{L}\p{N} _-]+/gu, '_').trim() || 'calepinage'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function optionText(bind, value) {
    const sel = document.querySelector(`select[data-bind="${bind}"]`);
    const o = sel && Array.from(sel.options).find(x => x.value === value);
    return o ? o.textContent : String(value);
  }

  const PDF_M = 36;
  const startName = () => T('secStart').replace(/^\d+\.\s*/, '');

  // Plan sur une page ; pivoté d'un quart de tour si la pièce occupe ainsi mieux la page portrait.
  function pdfPlanPage(doc, title) {
    const { w: PW, h: PH } = Pdf.A4, M = PDF_M;
    const f = result.frame;
    const b = Geo.bbox([...project.room, ...project.obstacles.flatMap(o => o.points)]);
    const rw = Math.max(b.maxX - b.minX, 1), rh = Math.max(b.maxY - b.minY, 1);
    const top = PH - M - 40, bottom = M + 26, pad = 24;
    const box = { x: M + pad, y: bottom + pad, w: PW - 2 * M - 2 * pad, h: top - bottom - 2 * pad };
    const s0 = Math.min(box.w / rw, box.h / rh), s90 = Math.min(box.w / rh, box.h / rw);
    const rot = s90 > s0 * 1.001;
    const s = rot ? s90 : s0, angle = rot ? 90 : 0;
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const bx = box.x + box.w / 2, by = box.y + box.h / 2;
    const P = rot
      ? p => ({ x: bx - (p.y - cy) * s, y: by + (p.x - cx) * s })
      : p => ({ x: bx + (p.x - cx) * s, y: by + (p.y - cy) * s });
    const poly = pts => pts.map(P);
    const up = rot ? { x: -1, y: 0 } : { x: 0, y: 1 };
    const label = (str, c, dy, opts) => {
      const k = dy - opts.size * 0.35;
      doc.text(str, c.x + up.x * k, c.y + up.y * k, { ...opts, align: 'center', angle });
    };

    doc.text(title, M, PH - M - 10, { size: 14, font: 'F2' });
    const sub = [`${T('dims')} : ${fmtMm(f.L)} × ${fmtMm(f.W)} mm`, `Pose : ${optionText('pattern', project.pattern)}`, new Date().toLocaleDateString('fr-FR')];
    if (rot) sub.push('plan pivoté d\'un quart de tour');
    doc.text(sub.join('   ·   '), M, PH - M - 26, { size: 9, color: '#4b5563' });

    doc.path(poly(project.room), { fill: COLORS.joint });
    for (const t of result.tiles) doc.path(poly(t.piece), { fill: tileColor(t), stroke: '#8a8176', width: 0.25 });
    for (const ob of result.obstacles) doc.path(poly(ob), { fill: COLORS.joint });
    for (const o of project.obstacles) doc.path(poly(o.points), { fill: COLORS.obstacle, stroke: '#4b5563', width: 0.6 });
    const edges = result.cuts.flatMap(t => t.shape.edges);
    for (const [a, c] of edges) doc.line(P(a), P(c), { stroke: '#ffffff', width: 2.4 });
    for (const [a, c] of edges) doc.line(P(a), P(c), { stroke: COLORS.cutLine, width: 1.2 });
    doc.path(poly(project.room), { stroke: COLORS.room, width: 1 });

    doc.path(poly([f.toWorld(0, 0), f.toWorld(f.L, 0), f.toWorld(f.L, f.W), f.toWorld(0, f.W)]), { stroke: COLORS.start, width: 1, dash: [4, 3] });
    const sp = P(project.start);
    doc.path(Array.from({ length: 16 }, (_, i) => ({ x: sp.x + 2.5 * Math.cos((i * Math.PI) / 8), y: sp.y + 2.5 * Math.sin((i * Math.PI) / 8) })), { fill: COLORS.start });

    const size = 6;
    for (const t of result.cuts) {
      const pb = Geo.bbox(t.piece);
      const along = (pb.maxX - pb.minX) * s, across = (pb.maxY - pb.minY) * s;
      const id = `C${t.id}`, dims = `${fmtMm(t.w)}×${fmtMm(t.h)}`;
      const c = P(Geo.centroid(t.piece));
      if (across >= 2.6 * size + 4 && along >= doc.width(dims, size) + 4) {
        label(id, c, size * 0.65, { size, font: 'F2', color: '#1f2937' });
        label(dims, c, -size * 0.65, { size, color: '#1f2937' });
      } else if (across >= size + 3 && along >= doc.width(id, size, 'F2') + 3) {
        label(id, c, 0, { size, font: 'F2', color: '#1f2937' });
      }
    }
    for (const o of project.obstacles) label(o.name, P(Geo.centroid(o.points)), 0, { size: 8, font: 'F2', color: '#ffffff' });

    const room = project.room, n = room.length;
    const sign = Geo.signedArea(room) >= 0 ? 1 : -1;
    room.forEach((a, i) => {
      const c = room[(i + 1) % n];
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      if (len * s < 28) return;
      const off = 9 / s;
      const nx = ((c.y - a.y) / len) * sign, ny = (-(c.x - a.x) / len) * sign;
      label(fmtMm(len), P({ x: (a.x + c.x) / 2 + nx * off, y: (a.y + c.y) / 2 + ny * off }), 0, { size: 7, color: '#374151' });
    });

    const items = [
      [COLORS.full, T('legendFull')], [COLORS.cutNew, T('legendNew')], [COLORS.cutReuse, 'Coupe (dans une chute)'],
      [COLORS.obstacle, 'Obstacle'], ['cut', 'Bord à couper'], ['start', startName()],
    ];
    let x = M;
    const ly = M + 6;
    for (const [col, txt] of items) {
      if (col === 'cut') doc.line({ x, y: ly + 4.5 }, { x: x + 10, y: ly + 4.5 }, { stroke: COLORS.cutLine, width: 1.5 });
      else if (col === 'start') doc.rect(x, ly, 10, 9, { stroke: COLORS.start, width: 1, dash: [2, 1.5] });
      else doc.rect(x, ly, 10, 9, { fill: col, stroke: '#9ca3af', width: 0.5 });
      doc.text(txt, x + 13, ly + 1.8, { size: 8, color: '#374151' });
      x += 13 + doc.width(txt, 8) + 14;
    }
  }

  // Croquis vectoriel d'une forme complexe, dans le cadre (x, y) - (x + w, y + h).
  function pdfSketch(doc, t, x, y, w, h) {
    const s = t.shape, pad = 12;
    const sc = Math.min((w - 2 * pad) / t.w, (h - 2 * pad) / t.h);
    const ox = x + pad, oy = y + pad;
    const P = p => ({ x: ox + p.x * sc, y: oy + p.y * sc });
    doc.rect(ox, oy, t.w * sc, t.h * sc, { fill: '#e5e7eb', stroke: '#6b7280', width: 0.6, dash: [3, 2] });
    doc.path(s.outline.map(P), { fill: tileColor(t) });
    for (const hole of s.holes) doc.path(hole.map(P), { fill: '#e5e7eb', stroke: COLORS.cutLine, width: 1.2 });
    for (const tr of s.traits) doc.line(P(tr.a), P(tr.b), { stroke: COLORS.cutLine, width: 1.6 });
    s.traits.forEach((tr, i) => {
      const m = P({ x: (tr.a.x + tr.b.x) / 2, y: (tr.a.y + tr.b.y) / 2 });
      doc.text(letter(i), m.x + 2, m.y + 2, { size: 8, font: 'F2', color: '#b91c1c' });
    });
    doc.text(fmtMm(t.w), ox + (t.w * sc) / 2, oy - 8, { size: 6.5, align: 'center', color: '#374151' });
    doc.text(fmtMm(t.h), ox - 3, oy + (t.h * sc) / 2, { size: 6.5, align: 'center', angle: 90, color: '#374151' });
  }

  const CODE_COLORS = { key: '#0550ae', str: '#116329', num: '#953800', lit: '#8250df', punct: '#57606a', plain: '#24292f' };
  function tokenizeJson(line) {
    const out = [];
    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],:])|(\s+)|(\S)/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[1]) {
        out.push([m[1], m[2] ? CODE_COLORS.key : CODE_COLORS.str]);
        if (m[2]) out.push([m[2], CODE_COLORS.punct]);
      } else if (m[3]) out.push([m[3], CODE_COLORS.num]);
      else if (m[4]) out.push([m[4], CODE_COLORS.lit]);
      else if (m[5]) out.push([m[5], CODE_COLORS.punct]);
      else if (m[6]) out.push([m[6], null]);
      else out.push([m[7], CODE_COLORS.plain]);
    }
    return out;
  }

  function pdfReport(doc) {
    const { w: PW, h: PH } = Pdf.A4, M = PDF_M, CW = PW - 2 * M;
    const parquet = project.material === 'parquet';
    let y = 0;
    const newPage = () => { doc.addPage(); y = PH - M; };
    const need = h => { if (y - h < M + 16) newPage(); };
    // h : hauteur du contenu de la section, pour ne la couper que si elle dépasse une page.
    const heading = (str, h) => {
      const total = 35 + h, bottom = M + 16;
      if (y - total < bottom && (total <= PH - M - bottom || y - 48 < bottom)) newPage();
      y -= 8;
      doc.text(str, M, y - 13, { size: 13, font: 'F2' });
      y -= 19;
      doc.line({ x: M, y }, { x: PW - M, y }, { stroke: '#d1d5db', width: 0.6 });
      y -= 8;
    };
    const kv = (k, v, { font = 'F1', indent = 0, color = '#1f2937' } = {}) => {
      need(13.5);
      doc.text(k, M + indent, y - 9.5, { size: 9.5, font, color });
      doc.text(v, PW - M, y - 9.5, { size: 9.5, font, color, align: 'right' });
      y -= 13.5;
    };
    const para = (str, { size = 9, color = '#1f2937' } = {}) => {
      const lh = size * 1.35;
      for (const line of doc.wrap(str, size, 'F1', CW)) {
        need(lh);
        doc.text(line, M, y - size, { size, color });
        y -= lh;
      }
    };
    const strip = str => str.replace(/\s*\((mm|%|0 = ignorer)\)$/, '');
    const paraH = (str, size) => doc.wrap(str, size, 'F1', CW).length * size * 1.35;

    const st = project.start, o = project.optim;
    const params = [
      ['Revêtement', parquet ? 'Parquet' : 'Carrelage'],
      [T('dims'), `${fmtMm(project.tile.length)} × ${fmtMm(project.tile.width)} mm`],
      ['Pose', optionText('pattern', project.pattern)],
      !parquet && ['Joint entre carreaux', `${fmtMm(project.joint.inner)} mm`],
      [strip(T('perimeter')), `${fmtMm(project.joint.perimeter)} mm`],
      [startName(), `X ${fmtMm(st.x)} ; Y ${fmtMm(st.y)} mm, ${optionText('start.anchor', st.anchor).toLowerCase()}, ${fmt(st.angle, 0, 2)}°`],
      ['Réutilisation des chutes', o.reuse ? 'Oui' : 'Non'],
      ['Épaisseur de coupe', `${fmtMm(o.kerf)} mm`],
      ['Chute minimale réutilisable', `${fmtMm(o.minOffcut)} mm`],
      !parquet && ['Rotation des chutes à 90°', o.allowRotate ? 'Autorisée' : 'Non'],
      ['Bords coupés au milieu', o.noInnerCuts ? 'Interdits' : 'Autorisés'],
      [strip(T('margin')), `${fmt(project.purchase.margin, 0, 1)} %`],
      [strip(T('perBox')), project.purchase.tilesPerBox ? String(project.purchase.tilesPerBox) : '—'],
    ].filter(Boolean);
    heading('Paramètres', params.length * 13.5);
    for (const [k, v] of params) kv(k, v);

    const stats = statsRows();
    heading('Résultats', stats.reduce((s, row) => s + (row ? 13.5 : 5), 0));
    for (const row of stats) {
      if (!row) { y -= 5; continue; }
      const [k, v, cls] = row;
      kv(k, v, {
        font: cls === 'strong' ? 'F2' : 'F1',
        indent: cls === 'sub' ? 12 : 0,
        color: cls === 'warn' ? '#b91c1c' : cls === 'sub' ? '#4b5563' : '#1f2937',
      });
    }

    const cutsIntro = `Cotes du rectangle à découper, dans le sens ${T('along')} (longueur × largeur). Formes complexes : pièce vue de dessus telle que posée, partie à retirer en gris, traits de coupe en rouge.`;
    const cols = [M, M + 40, M + 190];
    const sk = { w: 140, h: 80 }, stepX = cols[1] + sk.w + 12, stepW = PW - M - stepX;
    const cutRows = result.cuts.map(t => {
      const steps = t.shape.complex ? shapeSteps(t).flatMap((s, i) => doc.wrap(`${i + 1}. ${s}`, 8.5, 'F1', stepW)) : [];
      const skH = t.h * Math.min((sk.w - 24) / t.w, (sk.h - 24) / t.h) + 24;
      const detailH = t.shape.complex ? Math.max(skH, steps.length * 11.5) + 6 : 0;
      return { t, steps, skH, detailH };
    });
    heading('Liste des coupes', paraH(cutsIntro, 8.5) + 4 + 14 + cutRows.reduce((s, r) => s + 13.5 + r.detailH, 0));
    para(cutsIntro, { size: 8.5, color: '#4b5563' });
    y -= 4;
    need(14);
    ['N°', 'Dimensions (mm)', 'Taillée dans'].forEach((h, i) => doc.text(h, cols[i], y - 9.5, { size: 9, font: 'F2', color: '#4b5563' }));
    y -= 14;
    for (const { t, steps, skH, detailH } of cutRows) {
      need(13.5 + detailH);
      doc.text(`C${t.id}`, cols[0], y - 9.5, { size: 9.5, font: 'F2' });
      doc.text(`${fmtMm(t.w)} × ${fmtMm(t.h)}${t.shape.complex ? ' + forme' : ''}`, cols[1], y - 9.5, { size: 9.5 });
      doc.text(sourceLabel(t), cols[2], y - 9.5, { size: 9.5, color: t.source === 'offcut' ? '#047857' : '#b45309' });
      y -= 13.5;
      if (t.shape.complex) {
        pdfSketch(doc, t, cols[1], y - skH, sk.w, skH);
        steps.forEach((l, i) => doc.text(l, stepX, y - 9 - i * 11.5, { size: 8.5, color: '#374151' }));
        y -= detailH;
      }
      doc.line({ x: M, y: y + 2 }, { x: PW - M, y: y + 2 }, { stroke: '#e5e7eb', width: 0.5 });
    }

    const planRows = result.plan.map(s => ({
      s,
      lines: doc.wrap(s.pieces.map(p => `C${p.id} (${fmtMm(p.w)}×${fmtMm(p.h)}${p.shape.complex ? ', forme' : ''})`).join(' → '), 9, 'F1', CW - 40),
    }));
    heading(T('planTitle'), planRows.reduce((h, r) => h + r.lines.length * 12.5 + 2, 0));
    for (const { s, lines } of planRows) {
      need(lines.length * 12.5);
      doc.text(`n°${s.stock}`, M, y - 9, { size: 9, font: 'F2' });
      lines.forEach((l, i) => doc.text(l, M + 40, y - 9 - i * 12.5, { size: 9 }));
      y -= lines.length * 12.5 + 2;
    }

    const jsonIntro = 'Contenu du fichier produit par « Enregistrer en JSON ». Recopié dans un fichier .json, il se rouvre avec « Ouvrir un JSON… ».';
    const size = 7.5, lh = 9.6, cw = size * 0.6, gutter = 26;
    const maxChars = Math.floor((CW - gutter - 12) / cw);
    const vis = [];
    JSON.stringify(project, null, 2).split('\n').forEach((line, i) => {
      let cur = [], len = 0, no = i + 1;
      for (const [text, color] of tokenizeJson(line)) {
        let rest = text;
        while (len + rest.length > maxChars) {
          const take = maxChars - len;
          cur.push([rest.slice(0, take), color]);
          vis.push({ no, tokens: cur });
          no = null; cur = []; len = 0; rest = rest.slice(take);
        }
        if (rest) { cur.push([rest, color]); len += rest.length; }
      }
      vis.push({ no, tokens: cur });
    });
    heading('Fichier du projet (JSON)', paraH(jsonIntro, 8.5) + 6 + vis.length * lh + 8);
    para(jsonIntro, { size: 8.5, color: '#4b5563' });
    y -= 6;
    for (let i = 0; i < vis.length;) {
      need(lh * 2 + 8);
      const fit = Math.max(1, Math.floor((y - (M + 16) - 8) / lh));
      const chunk = vis.slice(i, i + fit);
      const h = chunk.length * lh + 8;
      doc.rect(M, y - h, CW, h, { fill: '#f6f8fa', stroke: '#d0d7de', width: 0.6 });
      doc.line({ x: M + gutter, y: y - h }, { x: M + gutter, y }, { stroke: '#d0d7de', width: 0.5 });
      chunk.forEach((v, k) => {
        const base = y - 4 - (k + 1) * lh + 2.2;
        if (v.no) doc.text(String(v.no), M + gutter - 4, base, { size, font: 'F3', color: '#8c959f', align: 'right' });
        let x = M + gutter + 6;
        for (const [text, color] of v.tokens) {
          if (color) doc.text(text, x, base, { size, font: 'F3', color });
          x += text.length * cw;
        }
      });
      y -= h;
      i += chunk.length;
    }
  }

  function exportPdf() {
    if (!result || result.error) {
      alert(`Export impossible : ${result ? result.error : 'calcul en cours.'}`);
      return;
    }
    const title = `${T('title')}${project.name ? ` — ${project.name}` : ''}`;
    const doc = new Pdf.Doc(title);
    pdfPlanPage(doc, title);
    pdfReport(doc);
    doc.forEachPage((i, n) => {
      doc.text(title, PDF_M, PDF_M - 18, { size: 7.5, color: '#9ca3af' });
      doc.text(`Page ${i + 1} / ${n}`, Pdf.A4.w - PDF_M, PDF_M - 18, { size: 7.5, color: '#9ca3af', align: 'right' });
    });
    download(doc.toBlob(), 'pdf');
  }

  // ---------- Souris et tactile ----------
  const pointers = new Map();
  const hitRadius = () => (ui.touch ? 20 : 9);
  const clampScale = s => Math.min(20, Math.max(0.002, s));

  function mousePos(e) {
    const r = canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  function hitVertex(points, sx, sy) {
    for (let i = points.length - 1; i >= 0; i--) {
      const s = toScreen(points[i]);
      if (Math.hypot(s.x - sx, s.y - sy) <= hitRadius() - 1) return i;
    }
    return -1;
  }

  function hitStart(sx, sy) {
    const s = toScreen(project.start);
    return Math.hypot(s.x - sx, s.y - sy) <= hitRadius();
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
      tooltip.style.left = `${Math.max(0, Math.min(sx + 14, view.w - 360))}px`;
      tooltip.style.top = `${sy + 14}px`;
    }
    const onHandle = hitStart(sx, sy) || project.obstacles.concat([{ points: project.room }]).some(o => hitVertex(o.points, sx, sy) >= 0);
    canvas.style.cursor = ui.placing ? 'crosshair' : onHandle ? 'move' : 'default';
  }

  function bindCanvas() {
    const pinch = () => {
      const [a, b] = [...pointers.values()];
      return { dist: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2 };
    };

    canvas.addEventListener('pointerdown', e => {
      const { sx, sy } = mousePos(e);
      ui.touch = e.pointerType !== 'mouse';
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { sx, sy });
      if (pointers.size === 2) {
        const p = pinch();
        ui.drag = { type: 'pinch', ...p, scale: view.scale, w: toWorld(p.mx, p.my) };
        tooltip.hidden = true;
        return;
      }
      if (pointers.size > 2) return;
      if (e.button === 1) {
        e.preventDefault();
        ui.drag = { type: 'pan', sx, sy, ox: view.ox, oy: view.oy };
        return;
      }
      if (e.button !== 0) return;
      const w = toWorld(sx, sy);
      if (ui.placing) {
        const p = snapStart(w, e);
        project.start.x = p.x;
        project.start.y = p.y;
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
      ui.drag = { type: 'pan', sx, sy, ox: view.ox, oy: view.oy, click: true };
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });

    window.addEventListener('pointermove', e => {
      const { sx, sy } = mousePos(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { sx, sy });
      const d = ui.drag;
      if (d) {
        tooltip.hidden = true;
        if (d.type === 'pinch') {
          if (pointers.size < 2) return;
          const p = pinch();
          view.scale = clampScale(d.scale * p.dist / d.dist);
          view.ox = p.mx - d.w.x * view.scale;
          view.oy = p.my + d.w.y * view.scale;
          render();
        } else if (d.type === 'pan') {
          view.ox = d.ox + sx - d.sx;
          view.oy = d.oy + sy - d.sy;
          render();
        } else {
          const w = toWorld(sx, sy);
          if (d.type === 'vertex') shapePoints(selected)[d.i] = { x: snapV(w.x, e), y: snapV(w.y, e) };
          else { const p = snapStart(w, e); project.start.x = p.x; project.start.y = p.y; }
          changed();
        }
        return;
      }
      if (e.target === canvas) updateHover(sx, sy);
      else if (!tooltip.hidden) tooltip.hidden = true;
    });

    const endPointer = e => {
      pointers.delete(e.pointerId);
      const d = ui.drag;
      // Après un pincement, on attend que tous les doigts soient levés.
      if (d && d.type === 'pinch') {
        if (!pointers.size) ui.drag = null;
        return;
      }
      if (pointers.size) return;
      if (d && d.type === 'pan') canvas.style.cursor = 'default';
      ui.drag = null;
      if (d && d.click && e.type === 'pointerup') {
        const { sx, sy } = mousePos(e);
        if (Math.hypot(sx - d.sx, sy - d.sy) < (ui.touch ? 10 : 4)) {
          selectTileAt(sx, sy);
          if (ui.touch) updateHover(sx, sy);
        }
      }
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse') return;
      tooltip.hidden = true;
      if (ui.hoverTile) { ui.hoverTile = null; render(); }
    });

    canvas.addEventListener('dblclick', e => {
      const { sx, sy } = mousePos(e);
      const pts = shapePoints(selected);
      const m = { x: sx, y: sy };
      for (let i = 0; i < pts.length; i++) {
        const c = Geo.closestOnSegment(m, toScreen(pts[i]), toScreen(pts[(i + 1) % pts.length]));
        if (c.d <= hitRadius() - 1) {
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
      view.scale = clampScale(view.scale * Math.exp(-e.deltaY * 0.0015));
      view.ox = sx - w.x * view.scale;
      view.oy = sy + w.y * view.scale;
      render();
    }, { passive: false });
  }

  // ---------- Interface ----------
  function bindUI() {
    $('btnUndo').addEventListener('click', () => stepHistory(-1));
    $('btnRedo').addEventListener('click', () => stepHistory(1));

    $('materialTabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-material]');
      if (!b || b.dataset.material === project.material) return;
      project.material = b.dataset.material;
      applyMaterial();
      changed();
    });

    $('btnNew').addEventListener('click', () => {
      if (!confirm('Créer un nouveau projet ? Les modifications non enregistrées en JSON seront perdues.')) return;
      project = Project.defaults(project.material);
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
      download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'json');
    });

    $('btnPdf').addEventListener('click', exportPdf);

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

    document.querySelectorAll('.tabs button[data-mode]').forEach(b => b.addEventListener('click', () => {
      tableMode = b.dataset.mode;
      document.querySelectorAll('.tabs button[data-mode]').forEach(x => x.classList.toggle('active', x === b));
      buildVertexTable();
    }));

    $('vertexBody').addEventListener('input', onVertexInput);
    $('vertexBody').addEventListener('change', e => {
      const sel = e.target.closest('select[data-k]');
      if (!sel) return;
      const inp = sel.nextElementSibling;
      if (sel.value === 'other') {
        inp.hidden = false;
        inp.focus();
        inp.select();
        return;
      }
      applyAngle(+sel.dataset.i, sel.dataset.k, +sel.value);
    });
    $('vertexBody').addEventListener('click', e => {
      const btn = e.target.closest('button[data-del]');
      if (btn) deleteVertex(+btn.dataset.del);
    });

    $('btnAddVertex').addEventListener('click', () => {
      const pts = shapePoints(selected);
      const a = pts[pts.length - 1], b = pts[0];
      if (tableMode === 'walls') {
        // Nouveau mur de 1 m après le dernier mur saisi, en tournant dans le sens de parcours de la pièce.
        const turn = Geo.signedArea(pts) >= 0 ? 90 : -90;
        const ang = ((wall(pts, pts.length - 2).ang + turn) * Math.PI) / 180;
        pts.push({ x: round2(a.x + 1000 * Math.cos(ang)), y: round2(a.y + 1000 * Math.sin(ang)) });
      } else {
        pts.push({ x: round2((a.x + b.x) / 2), y: round2((a.y + b.y) / 2) });
      }
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
      setHighlight(ui.highlightId === id ? null : id, false);
    });

    $('planBody').addEventListener('click', e => {
      const el = e.target.closest('[data-id]');
      if (!el) return;
      const id = +el.dataset.id;
      setHighlight(ui.highlightId === id ? null : id, true);
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
