// Gera uma copia do site com dados de exemplo (sem Firebase) para testar as telas:
//   node tests/ui/montar.mjs /caminho/saida.html   (depois abra com ?papel=admin|cliente|pendente|anon)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('../../', import.meta.url));
const falso = fileURLToPath(new URL('./dados-falso.js', import.meta.url));
const r = await build({
  entryPoints: [R + 'app/app.js'], bundle: true, format: 'esm', write: false, target: 'es2022',
  plugins: [{ name: 'dados-falso', setup(b) { b.onResolve({ filter: /\/dados\.js$/ }, () => ({ path: falso })); } }],
});
let t = readFileSync(R + 'index.html', 'utf8');
const ler = (f) => readFileSync(R + f, 'utf8');
const partes = { '/*LEAFLET_CSS*/': ler('vendor/leaflet.css'), '/*VELOCITY_CSS*/': ler('vendor/leaflet-velocity.min.css'), '/*APP_CSS*/': ler('estilo.css'),
  '/*LEAFLET_JS*/': ler('vendor/leaflet.js'), '/*VELOCITY_JS*/': ler('vendor/leaflet-velocity.min.js'), '/*CHART_JS*/': ler('vendor/chart.umd.js'), '/*APP_JS*/': r.outputFiles[0].text };
for (const [k, v] of Object.entries(partes)) t = t.replace(k, () => v.replaceAll('</script', '<\\/script'));
writeFileSync(process.argv[2] || '/tmp/meteora-teste.html', t);
console.log('ok');
