# RADAR BLITZ V3.0.4 — Estabilidade + Identidade visual

Base: V3.0.3. Preserva todas as ferramentas, gráficos, catalogador, pedras pagantes, animações de branco, botões de recolher e cron.

## Mudanças
- Logotipo com raio preto em fundo amarelo; título sem número da versão; favicon SVG.
- Interface escura refinada, cartões e catalogador modernizados, popup de branco central preservado.
- Snapshot dos últimos dados recebidos no localStorage do navegador. Recarregar o site durante indisponibilidade restaura os dados salvos *neste navegador*, com aviso de desatualização. A restauração não é compartilhada entre dispositivos.
- Falhas parciais da API não apagam o histórico já exibido. Reconexão automática a cada 30 segundos; análise a cada 5 minutos.
- Worker: cache compartilhado da V3.0.3 mantido; elimina COUNT(*) em cada minuto e evita INSERTs repetidos consultando IDs existentes por índice. Contagem total inicial é calculada uma vez, depois atualizada incrementalmente.

## Publicação
1. **GitHub/Cloudflare Pages**: substituir public/index.html, public/style.css, public/app.js e adicionar public/favicon.svg. Preservar public/config.js com a URL do Worker em uso.
2. **Cloudflare Worker radar-blitz-coletor**: substituir o código por worker/index.js e clicar em Deploy.
3. **Não executar novamente schema.sql**, não recriar o D1 e não alterar binding DB, segredo BOOTSTRAP_SECRET ou Cron.
4. Abrir /api/health e /api/rounds?limit=10 para conferir, depois abrir o site e verificar coleta e painéis. Medir Rows read no D1 após 1–2 horas.
5. Se ocorrer erro, restaurar o código anterior do Worker (V3.0.3 ou V3.0.2) e os arquivos public correspondentes.

## Limitações
- A versão foi validada estaticamente (sintaxe JS e estrutura do ZIP), mas não foi testada contra o D1 real ou no navegador em produção.
- O cache do Worker é regional, e um cache miss pode acessar o D1. Se a cota estiver esgotada, o site exibirá dados salvos localmente se já houver snapshot; não consegue recuperar dados nunca recebidos.
- A contagem incremental pressupõe um único coletor agendado e ausência de inserções externas concorrentes. Se o banco for alterado manualmente, a contagem pode precisar de reconciliação.
