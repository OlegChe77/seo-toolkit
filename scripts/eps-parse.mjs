// Разбор векторных фигур из EPS (Adobe Illustrator): mo/li/cv/cp, f/ef/@, cmyk, lw/lj/lc.
// Координаты страницы уже перевёрнуты (1 -1 scale), поэтому совпадают с системой SVG.
import fs from 'node:fs';

export function parseEps(file) {
  const text = fs.readFileSync(file, 'latin1').replace(/\r/g, '\n');
  const start = text.indexOf('%%EndPageSetup');
  const end = text.indexOf('%%PageTrailer', start);
  const body = text.slice(start, end);
  const ops = [];
  const stack = [];
  let d = [];
  let bbox = null;
  let color = [0, 0, 0, 1];
  const style = { lw: 1, lj: 0, lc: 0, ml: 10 };
  const pt = (x, y) => {
    if (!bbox) bbox = [x, y, x, y];
    else bbox = [Math.min(bbox[0], x), Math.min(bbox[1], y), Math.max(bbox[2], x), Math.max(bbox[3], y)];
  };
  const r = (n) => +n.toFixed(2);
  const paint = (type) => {
    if (d.length && bbox) ops.push({ type, d: d.join(''), color: [...color], bbox, ...(type === 'stroke' ? { ...style } : {}) });
    d = [];
    bbox = null;
  };
  for (const tok of body.split(/\s+/)) {
    if (!tok) continue;
    if (/^-?\d*\.?\d+(e-?\d+)?$/i.test(tok)) { stack.push(parseFloat(tok)); continue; }
    switch (tok) {
      case 'mo': { const [x, y] = stack.splice(-2); d.push(`M${r(x)} ${r(y)}`); pt(x, y); break; }
      case 'li': { const [x, y] = stack.splice(-2); d.push(`L${r(x)} ${r(y)}`); pt(x, y); break; }
      case 'cv': { const a = stack.splice(-6); d.push(`C${a.map(r).join(' ')}`); pt(a[0], a[1]); pt(a[2], a[3]); pt(a[4], a[5]); break; }
      case 'cp': d.push('Z'); break;
      case 'f': paint('fill'); break;
      case 'ef': paint('evenodd'); break;
      case '@': paint('stroke'); break;
      case 'np': d = []; bbox = null; break;
      case 'clp': d = []; bbox = null; break;
      case 'cmyk': color = stack.splice(-4); break;
      case 'lw': style.lw = stack.pop(); break;
      case 'lj': style.lj = stack.pop(); break;
      case 'lc': style.lc = stack.pop(); break;
      case 'ml': style.ml = stack.pop(); break;
      default: stack.length = 0;
    }
  }
  return ops;
}

export const cmykKey = (c) => c.map((v) => +v.toFixed(3)).join(',');
