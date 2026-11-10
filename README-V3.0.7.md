# RADAR BLITZ V3.0.7

Atualização sobre a V3.0.6, preservando o motor de sugestões e as tabelas existentes.

## Novidades
- Seletor de **3 HORAS** junto de 1h, 6h, 24h e 7 dias.
- **17 / Identificador de Padrões** e **18 / Linhas Fortes**, posicionados imediatamente depois dos cards 11 e 12.
- Padrões exatos de 2 ou 3 números (0–14), seguidos de branco em até 5 rodadas. Comparação com histórico D1 e últimas 3 horas.
- Regras iniciais: mínimo de 10 ocorrências globais, 2 nas últimas 3h e taxa global observada >= 40%. Só contam ocorrências com cinco rodadas futuras completas. Exibe até 8 no card.
- Catalogador destaca as pedras de sequências qualificadas: **verde** quando um branco foi confirmado nas 5 rodadas seguintes, **amarelo** quando ainda não há cinco rodadas futuras completas e **cinza** quando não houve branco.
- Linhas fortes: 00–09, 10–19, 20–29, 30–39, 40–49 e 50–59. Ordenação por brancos e taxa por rodadas no período selecionado.

## Publicação
1. Publique `worker/index.js` no Worker existente, mantendo o binding `DB`, os segredos e o cron.
2. Publique a pasta `public/` no mesmo projeto Cloudflare Pages.
3. Limpe cache da página se necessário (Ctrl+F5). **Nenhuma alteração de schema D1 é necessária.**

## Limite e custo D1
A análise de padrões lê no máximo as **50.000 rodadas mais recentes** do D1 por consulta, com cache compartilhado de **30 minutos por datacenter**. Se houver mais de 50.000 rodadas, o card avisa que a análise histórica é parcial. A leitura pode consumir até 50.000 linhas por cache MISS; acompanhe a métrica de D1 após o deploy. O cache do Worker não é global entre datacenters. Uma implementação incremental/materializada será necessária para histórico ilimitado sem custo crescente.

## Interpretação
Padrões históricos não provam poder preditivo nem vantagem de apostas. Linhas com mais rodadas podem acumular mais brancos. O ranking inclui a taxa por rodada para dar contexto.
