V2.0.3
Correção dos gráficos 10 MIN e 15 MIN:
- consolida e persiste cada janela completa no navegador;
- preserva também janelas com 0 brancos;
- pontos não somem quando as rodadas deixam as 200 visíveis;
- 10 MIN continua com 4h/24 pontos;
- 15 MIN continua com 6h/24 pontos;
- bucket atual segue em tempo real;
- White Market, sinais, SG/G1 e catalogador não foram alterados.

Nota: a persistência é local ao navegador. Um dispositivo novo não herda automaticamente
o histórico acumulado por outro dispositivo; para isso, a próxima evolução seria D1/KV.
