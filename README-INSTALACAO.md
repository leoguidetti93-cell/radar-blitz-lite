# RADAR BLITZ V3.0.0 — instalação e implantação

Esta é uma reconstrução: painel estatístico sem sinais, frontend no Cloudflare Pages, banco Cloudflare D1 e coletor Cloudflare Worker com Cron Trigger. O frontend não grava dados nem mantém o coletor ativo.

## 1. Banco D1

Instale/abra Wrangler em seu computador (Node.js requerido):

```bash
npm install -g wrangler
wrangler login
wrangler d1 create radar-blitz-history
```

Copie o `database_id` retornado e substitua `SUBSTITUIR_PELO_ID_DO_SEU_BANCO_D1` em `worker/wrangler.toml`.

No diretório `worker/`:

```bash
wrangler d1 execute radar-blitz-history --remote --file=./schema.sql
```

## 2. Worker e coleta automática

No diretório `worker/`:

```bash
wrangler secret put BOOTSTRAP_SECRET
wrangler deploy
```

Defina uma senha longa e aleatória no comando acima. NÃO coloque esse segredo no frontend ou no GitHub. O deploy cria o Worker com Cron `* * * * *` (a cada minuto). Cron pode demorar alguns minutos para ativar. Consulte logs e métricas na Cloudflare.

## 3. Carga inicial das 200 rodadas

Após publicar o Worker e criar o schema, use um cliente HTTP (substitua a URL e o segredo):

```bash
curl -X POST 'https://SEU-WORKER.workers.dev/api/bootstrap' -H 'Authorization: Bearer SEU_SEGREDO'
```

O endpoint consulta as últimas 200 rodadas da TipMiner e grava somente as inéditas. A rotina agendada faz o mesmo automaticamente; a carga manual serve para iniciar imediatamente e testar.

## 4. Conectar o site

Edite `public/config.js` com a URL real do Worker:

```js
window.RADAR_API_BASE = 'https://SEU-WORKER.workers.dev';
```

Faça o deploy da pasta `public` no Cloudflare Pages como antes. Para deploy GitHub, mantenha o diretório de saída `public`, sem build command. Não exponha o segredo de bootstrap.

## 5. Testes obrigatórios

- Abra `https://SEU-WORKER.workers.dev/api/health` e confira `ok: true`, `total` e `metadata.last_sync`.
- Abra `https://SEU-WORKER.workers.dev/api/rounds?limit=200` e confira as rodadas reais.
- Abra o site e confirme status **DADOS ATUALIZADOS** e os gráficos preenchidos.
- Feche o site por 10 minutos, reabra e confirme que `total` aumentou no banco.
- Teste opções 200/400/600 após o banco acumular dados suficientes.
- Compare dois navegadores: ambos devem ver a mesma base.
- Verifique falhas do cron no painel Workers & Pages da Cloudflare.

## Limites e observações

- A API TipMiner usada retorna no máximo 200 rodadas por coleta. Interrupções longas podem causar lacunas irrecuperáveis pela API atual.
- O banco acumula apenas a partir da primeira coleta; dados anteriores não são inventados.
- Gravações são idempotentes pelo `id` da rodada.
- O frontend solicita dados históricos paginados (1.000 por página). Filtros podem carregar muitos registros, especialmente em 7 ou 31 dias.
- `CSV` exporta as rodadas **exibidas no catalogador** (200/400/600), não o banco inteiro.
- Alguns gráficos exibem dados insuficientes se a base ainda for pequena.
- A opção personalizada usa o horário local do dispositivo no formulário.
- O mapa de calor resume a contagem de brancos por hora, não uma previsão.
- **Frequências e padrões passados não garantem desempenho em apostas.**
- Esta entrega inclui código e verificações estáticas. Ainda requer implantação real, testes de rede e confirmação de compatibilidade da API TipMiner.
