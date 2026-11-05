# RADAR BLITZ V3.0.0 — terminal estatístico

## Escopo implementado
- Removidos sinais de branco e cores, SG/G1, alertas de entrada e win/loss.
- Indicadores: última pedra, recuperação, média dos últimos quatro intervalos de branco e total de rodadas no D1.
- Ferramentas: frequência de cores, White Flow 10/15/60 min, distribuição de intervalos de brancos, sequências, transições, mapa de calor por hora, números 0–14, comparação com período anterior.
- Períodos de análise: 1h, 6h, 24h, 7d e personalizado até 31d.
- Catalogador: 200/400/600 rodadas, 10 colunas por bloco de 10 minutos, 2 pedras por minuto, mais recente no topo.
- CSV de rodadas exibidas, links Telegram e Blitz.
- Banco D1, cron Worker por minuto, carga inicial de 200 rodadas, API de histórico paginado, status de sincronização.

## Arquivos
- `public/` — site Cloudflare Pages.
- `worker/index.js` — API e coletor.
- `worker/schema.sql` — tabelas e índices.
- `worker/wrangler.toml` — configuração; inserir database_id real.
- `README-INSTALACAO.md` — passos de implantação.

## Segurança e consistência
- Credencial de bootstrap somente em secret do Worker.
- API de consulta é pública, sem login, para todos verem o mesmo histórico.
- `INSERT OR IGNORE` evita duplicação após reconsultas.
- O site não é responsável pela coleta; fechar a página não interrompe o cron.
