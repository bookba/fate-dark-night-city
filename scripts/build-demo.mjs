// One-file build of the v5 demo for the Claude artifact (no npm packages needed, vite is not required):
// node scripts/build-demo.mjs . out.html  → modules become functions, pictures become data URIs.
import fs from 'fs'; import path from 'path';
const ROOT = process.argv[2], OUT = process.argv[3];
const V5 = path.join(ROOT, 'v5');
const mods = new Map(); const order = [];
const dataUri = (f) => `data:image/${path.extname(f).slice(1)};base64,${fs.readFileSync(f).toString('base64')}`;
function load(file) {
  if (mods.has(file)) return;
  mods.set(file, null);
  let src = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  const deps = [];
  const R = (p) => { const f = path.resolve(dir, p); return f; };
  const names = []; const reexp = [];
  // imports (single or multi-line)
  src = src.replace(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';?$/gm, (m, what, p) => {
    const f = R(p);
    if (/\.(webp|png|jpg|svg)$/.test(p)) return `const ${what.trim()} = ${JSON.stringify(dataUri(f))};`;
    deps.push(f);
    const id = JSON.stringify(path.relative(V5, f));
    what = what.trim();
    if (what.startsWith('* as ')) return `const ${what.slice(5)} = __r(${id});`;
    if (what.startsWith('{')) return `const ${what.replace(/\s+as\s+/g, ': ')} = __r(${id});`;
    return `const ${what} = __r(${id}).default;`;
  });
  src = src.replace(/^export \* from '([^']+)';?$/gm, (m, p) => { const f = R(p); deps.push(f); reexp.push(JSON.stringify(path.relative(V5, f))); return ''; });
  src = src.replace(/^export (async function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (m, k, n) => { names.push(n); return `${k} ${n}`; });
  src = src.replace(/^export default /m, () => { names.push('default'); return 'const __default = '; });
  if (/^export /m.test(src)) throw new Error('unhandled export in ' + file + ': ' + src.match(/^export .*/m)[0]);
  // the admin page's editor opens only on the real server (?edit)
  src = src.replace(/import\('\.\/admin-edit\.js'\)/g, "Promise.reject(new Error('no editor in the demo'))");
  for (const d of deps) load(d);
  const exp = names.map((n) => (n === 'default' ? `get default() { return __default; }` : `get ${n}() { return ${n}; }`));
  mods.set(file, `__d(${JSON.stringify(path.relative(V5, file))}, () => {\n${src}\nreturn Object.defineProperties({}, Object.getOwnPropertyDescriptors(Object.assign({}, ${reexp.map((r) => `__r(${r})`).join(', ') || '{}'}, { ${exp.join(', ')} })));\n});`);
  order.push(file);
}
load(path.join(V5, 'main.js'));
const js = `const __defs = {}, __cache = {};
function __d(id, f) { __defs[id] = f; }
function __r(id) { if (!(id in __cache)) { __cache[id] = null; __cache[id] = __defs[id](); } return __cache[id]; }
${order.map((f) => mods.get(f)).join('\n')}
__r('main.js');`;
let css = fs.readFileSync(path.join(V5, 'style.css'), 'utf8').replace(/url\('(\.\.\/[^']+\.(?:webp|png|jpg|svg))'\)/g, (m, p) => `url('${dataUri(path.resolve(V5, p))}')`);
let html = fs.readFileSync(path.join(V5, 'index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="./style.css" />', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./main.js"></script>', () => `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
fs.writeFileSync(OUT, html);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB', order.length, 'modules');
