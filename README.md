# RADAR BLITZ LITE V1.0
Projeto novo, público, sem login e sem Supabase.

## Incluído
- DOUBLE / 200 rodadas
- Visual tecnológico e responsivo
- Desktop mantém grade fixa 00–09, 10–19, 20–29, 30–39, 40–49, 50–59
- Pedras no mesmo padrão visual do Radar atual
- Última pedra + horário
- Recuperação atual + horário do último branco
- % preto/amarelo/branco nas 200
- % de branco em cada minuto/coluna
- intervalo médio em rodadas entre os 4 últimos brancos

## Arquitetura da V1
Cloudflare Pages + Pages Function. A função /api/rounds consulta somente 200 resultados da fonte e o navegador calcula os cards.
O arquivo schema/d1.sql deixa a base pronta para D1, mas o D1 NÃO é necessário para colocar esta primeira versão no ar.

## Deploy
1. Crie um repositório novo no GitHub.
2. Envie TODOS os arquivos/pastas deste ZIP para a raiz do repositório.
3. Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git.
4. Escolha o repositório.
5. Framework preset: None.
6. Build command: vazio.
7. Build output directory: public.
8. Deploy.

Depois teste /api/rounds e a página principal.
