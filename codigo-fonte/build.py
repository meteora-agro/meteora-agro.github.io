"""Monta o index.html do Meteora Agro (um unico arquivo, publicado pelo GitHub Pages).

Uso, dentro da pasta codigo-fonte:
    npm install            (so na primeira vez: instala o Firebase e o esbuild)
    python build.py        -> gera ../index.html

O esbuild junta app/*.js (e o Firebase) num unico modulo; este script embute esse modulo,
o CSS e as bibliotecas (Leaflet, Chart.js) no index.html.
"""
import base64, pathlib, re, shutil, subprocess, sys

R = pathlib.Path(__file__).parent
ler = lambda nome: (R / nome).read_text(encoding='utf-8')

# 1) empacota o app com o esbuild
npx = shutil.which('npx') or shutil.which('npx.cmd')
if not npx:
    sys.exit('Instale o Node.js (https://nodejs.org) e rode "npm install" nesta pasta.')
r = subprocess.run([npx, '--no-install', 'esbuild', 'app/app.js', '--bundle', '--format=esm', '--minify',
                    '--target=es2022', '--legal-comments=none', '--log-level=warning'],
                   cwd=R, capture_output=True, text=True, encoding='utf-8')
if r.returncode:
    sys.exit('esbuild falhou:\n' + r.stderr + '\n(Rodou "npm install"?)')
app_js = r.stdout

# 2) CSS do Leaflet com as imagens embutidas (data URI)
def embutir_imagens(css):
    def troca(m):
        arq = R / 'vendor' / m.group(1)
        return 'url(data:image/png;base64,' + base64.b64encode(arq.read_bytes()).decode() + ')'
    return re.sub(r'url\((images/[\w.-]+\.png)\)', troca, css)

partes = {
    '/*LEAFLET_CSS*/': embutir_imagens(ler('vendor/leaflet.css')),
    '/*VELOCITY_CSS*/': ler('vendor/leaflet-velocity.min.css'),
    '/*APP_CSS*/': ler('estilo.css'),
    '/*LEAFLET_JS*/': ler('vendor/leaflet.js'),
    '/*VELOCITY_JS*/': ler('vendor/leaflet-velocity.min.js'),
    '/*CHART_JS*/': ler('vendor/chart.umd.js'),
    '/*APP_JS*/': app_js,
}
t = ler('index.html')
for k, v in partes.items():
    assert k in t, k
    t = t.replace(k, v.replace('</script', '<\\/script').replace('</style', '<\\/style'))
saida = R.parent / 'index.html'
saida.write_text(t, encoding='utf-8', newline='\n')
print(saida, f'{len(t) / 1024:.0f} KB')
