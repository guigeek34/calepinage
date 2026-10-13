'use strict';
// Générateur PDF minimal sans dépendance : pages A4, polices standard (Helvetica, Courier), dessin vectoriel.
const Pdf = (() => {
  const A4 = { w: 595.28, h: 841.89 };
  const FONTS = { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Courier' };

  // Caractères WinAnsi hors Latin-1, et remplacements pour ceux que les polices standard ne savent pas afficher.
  const WIN = {
    '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140,
    'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155,
    'œ': 156, 'ž': 158, 'Ÿ': 159,
  };
  const SUBST = {
    '\u202f': '\u00a0', '\u2009': ' ', '\u2212': '-', '→': '->', '←': '<-', '↑': '^', '↓': 'v',
    '↻': '(pivotée)', '↰': '<', '↱': '>', '≤': '<=', '≥': '>=',
  };
  const norm = str => String(str).replace(/[\u202f\u2009\u2212→←↑↓↻↰↱≤≥]/g, c => SUBST[c]);

  function toWin(str) {
    let out = '';
    for (const ch of str) {
      const c = ch.codePointAt(0);
      if (c < 128 || (c >= 160 && c <= 255)) out += ch;
      else if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
      else out += '?';
    }
    return out;
  }
  const esc = s => s.replace(/[\\()]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const num = n => String(Math.round(n * 100) / 100 || 0);

  function rgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(c => num(c / 255)).join(' ');
  }

  const measureCtx = document.createElement('canvas').getContext('2d');

  class Doc {
    constructor(title) {
      this.title = title || '';
      this.pages = [];
      this.addPage();
    }

    addPage() {
      this.ops = [];
      this.pages.push(this.ops);
    }

    forEachPage(cb) {
      this.pages.forEach((ops, i) => { this.ops = ops; cb(i, this.pages.length); });
    }

    width(str, size, font = 'F1') {
      const s = norm(str);
      if (font === 'F3') return s.length * 0.6 * size;
      measureCtx.font = `${font === 'F2' ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
      return measureCtx.measureText(s).width;
    }

    // Découpe un texte en lignes de largeur maximale `maxW`.
    wrap(str, size, font, maxW) {
      const lines = [];
      let cur = '';
      for (const word of String(str).split(/ +/)) {
        const next = cur ? `${cur} ${word}` : word;
        if (cur && this.width(next, size, font) > maxW) { lines.push(cur); cur = word; } else cur = next;
      }
      if (cur) lines.push(cur);
      return lines;
    }

    text(str, x, y, { size = 10, font = 'F1', color = '#000000', align = 'left', angle = 0 } = {}) {
      const a = (angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      const w = align === 'left' ? 0 : this.width(str, size, font) * (align === 'center' ? 0.5 : 1);
      const tx = x - w * cos, ty = y - w * sin;
      this.ops.push(`BT ${rgb(color)} rg /${font} ${num(size)} Tf ${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(tx)} ${num(ty)} Tm (${esc(toWin(norm(str)))}) Tj ET`);
    }

    path(points, { fill, stroke, width = 1, close = true, dash } = {}) {
      if (points.length < 2 || (!fill && !stroke)) return;
      const d = points.map((p, i) => `${num(p.x)} ${num(p.y)} ${i ? 'l' : 'm'}`).join(' ') + (close ? ' h' : '');
      let st = 'q 1 j 1 J';
      if (fill) st += ` ${rgb(fill)} rg`;
      if (stroke) st += ` ${rgb(stroke)} RG ${num(width)} w`;
      if (dash) st += ` [${dash.map(num).join(' ')}] 0 d`;
      this.ops.push(`${st} ${d} ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
    }

    line(a, b, opts) { this.path([a, b], { ...opts, close: false }); }

    rect(x, y, w, h, opts) {
      this.path([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], opts);
    }

    toBlob() {
      const objs = [];
      const add = s => objs.push(s);
      const catalog = add(''), pagesId = add('');
      const fontRes = Object.entries(FONTS)
        .map(([k, name]) => `/${k} ${add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`)} 0 R`)
        .join(' ');
      const kids = this.pages.map(ops => {
        const content = ops.join('\n');
        const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
        return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << ${fontRes} >> >> /Contents ${c} 0 R >>`);
      });
      objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
      objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
      const info = add(`<< /Title (${esc(toWin(norm(this.title)))}) /Producer (Calepinage) >>`);

      let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
      const offsets = objs.map((o, i) => {
        const at = out.length;
        out += `${i + 1} 0 obj\n${o}\nendobj\n`;
        return at;
      });
      const xref = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
      out += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
      out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;

      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
      return new Blob([bytes], { type: 'application/pdf' });
    }
  }

  return { A4, Doc };
})();
