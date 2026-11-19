# Arquitetura

## Dados (Firestore)
| Caminho | Conteudo | Quem grava |
|---|---|---|
| `users/{uid}` | name, email, role (client/admin), plan (basic/pro/enterprise), status (pending/active/suspended) | o proprio (cadastro: sempre cliente pendente), admin (status/plano/papel), job (promove ADMIN_EMAILS) |
| `properties/{uid}_p_{n}` | owner, name, crop, plantio, city, state, notes, boundary (GeoJSON em texto), areaHa, lat, lon | dono aprovado (n < limite do plano) |
| `stations/{id}` | cadastro: owner, name, type (publica/virtual/sensor), public, active, lat, lon, elevation, propertyId, inmetCode, deviceUid | dono (`{uid}_e_{n}`), admin (`pub_*`) |
|  | resumo: atual, ultimoDado, chuva24h, tmin24h, tmax24h, ontem, previsao {dias, itens, janelas, chuva7, eto7} | job; o sensor grava so `atual` e `ultimoDado` |
| `stations/{id}/dias/{AAAA-MM-DD}` | `h` {HH: temp, tmax, tmin, rh, p, wind, dir, rain, rad, dew}, `resumo` {eto, chuva, balanco, gd...}, `reserva` {chuva, vento} | job; o sensor grava so `h` |
| `sistema/status` | ultima execucao do job, falhas, sensores parados | job (admin le) |

Um documento por dia (24 horas dentro) faz um grafico de 48 h custar 3 leituras, nao 48.

## Ciencia (`web/js/ciencia.js`, usado no navegador e no job)
- **ETo** FAO-56 Penman-Monteith diaria. Vento de 10 m para 2 m (x 0,748). Sem radiacao medida: Hargreaves
  (kRs 0,16). Sem anemometro: vento do modelo; sem pluviometro: chuva do modelo (`reserva`).
- **Irrigacao**: ETc = Kc x ETo (Kc medio por fase, FAO-56 tabela 12), chuva efetiva = 80 %, lamina bruta pela eficiencia.
- **Graus-dia** base 10 °C. **Pulverizacao**: 6h-18h, vento 3-10 km/h, T <= 30 °C, UR >= 55 %, sem chuva nas 3 h seguintes.
- **Avisos**: geada (min <= 2 °C alto, <= 4 °C medio), calor (max >= 35 °C), chuva forte (>= 30 mm), deficit (ETo 7 d - chuva 7 d > 25 mm).

## Seguranca
- Nenhum segredo no codigo: a configuracao web (em `app/fb.js`) e publica por natureza; a conta de servico e o token INMET
  ficam nos *secrets* do GitHub.
- O login da estacao de campo e uma conta do Auth criada pelo app; a senha aparece uma vez. "Novo login" invalida o anterior.
- Regras testadas em `job/test/regras.emu.mjs` (rodam no CI a cada push).
