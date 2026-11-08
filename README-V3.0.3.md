# RADAR BLITZ V3.0.3 — otimização D1

- Cache compartilhado Cloudflare para `/api/health` e `/api/rounds` (30 segundos) e `/api/history` (300 segundos).
- Intervalos automáticos de análise ancorados em blocos de 5 minutos para que múltiplos visitantes compartilhem consultas idênticas.
- Coletor, cron, D1, schema, cards, catalogador e popup mantidos.
- O histórico das análises automáticas pode ficar até aproximadamente 5 minutos defasado; o catalogador continua atualizando a cada 30 segundos.
- O cache é regional e não elimina totalmente leituras; acompanhar D1 Usage após publicação.

## Publicação
Substitua `public/app.js` no GitHub Pages e atualize o código do Worker `radar-blitz-coletor` usando `worker/index.js`. Não execute novamente o schema, não apague o banco nem altere segredos ou cron. Publicar apenas o frontend não habilita o cache no Worker.
