## Autenticação

O padrão adotado foi híbrido: Access Token mantido em memória no frontend e Refresh Token armazenado em um Cookie HttpOnly e Secure.

Com o Access Token na memória, as rotas de negócio da API são autenticadas explicitamente via header Authorization: Bearer. Como o navegador nunca anexa headers customizados de forma automática em requisições cross-origin, a API de negócio fica imune a ataques de CSRF por construção, eliminando a complexidade de gerenciar tokens CSRF em toda requisição.

O cookie entra apenas onde a persistência de longa duração é necessária (na rota de renovação /refresh). Como esse cookie é HttpOnly, scripts maliciosos não conseguem ler nem exfiltrar a credencial de longa duração caso ocorra um XSS.

Colocar o Access Token também em cookie traria a complexidade de CSRF para todas as rotas da API em troca de um ganho marginal de segurança. Se a decisão fosse autenticar 100% via cookie, faria mais sentido abandonar o JWT e adotar sessões tradicionais no servidor.

### Denylist

A persistência da denylist é estruturada no PostgreSQL através do app nativo token_blacklist do SimpleJWT. A tabela `outstandingtoken` ganha uma linha por login e nada a limpa no caminho da requisição: o comando `flushexpiredtokens` faz a limpeza e deve ser agendado no ambiente de execução (o compose desta demo não o agenda).

Usar o Redis ofereceria a conveniência do TTL automático, mas instâncias de cache operam sob risco contínuo de evicção sob pressão de memória (risco ampliado pelo compartilhamento da instância com cache de consultas). O descarte inadvertido de chaves pelo Redis resultaria na reativação silenciosa de Refresh Tokens revogados, ferindo o princípio de durabilidade necessário para a integridade de autenticação. 

## Redis para throttle

O throttling protege o endpoint de login contra ataques de força bruta e a rota de IA contra custos excessivos. Como a aplicação opera com múltiplos workers, o cache local isolaria a contagem por processo, exigindo um store centralizado no Redis via REDIS_URL.

Usar o PostgreSQL para registrar tentativas abusivas causaria concorrência de locks, escrita contínua em disco e esgotamento do pool de conexões, prejudicando as operações do hotel. O Redis absorve essa volumetria direto na memória e descarta os registros via TTL nativo.

Caso REDIS_URL não esteja definida, o banco atua como fallback funcional. Em contrapartida, a denylist de tokens permanece no PostgreSQL, onde a persistência é garantida contra o risco de evicção de memória.

### Teto Absoluto de Sessão vs. Sessão Deslizante

O `exp` carimbado no Refresh Token durante o login é o teto absoluto da sessão. A renovação devolve apenas um Access Token novo, sem tocar no cookie, de modo que o prazo não se estende com o uso: passadas 12 horas da autenticação original, a rota responde `401 Unauthorized` e só um novo login reabre o acesso.

A alternativa seria a rotação (`ROTATE_REFRESH_TOKENS`), descartada porque o `set_exp()` do SimpleJWT reescreve o `exp` a cada renovação sem consultar o anterior. Logo, o limite de 12 horas viraria uma sessão deslizante por inatividade, e a biblioteca não oferece configuração de teto absoluto. O que a rotação acrescentaria é a detecção de reúso de um Refresh Token copiado, cenário que o armazenamento em cookie `HttpOnly` já endereça ao manter a credencial fora do alcance de scripts.

No contexto de hotelaria, é comum que diferentes atendentes compartilhem o mesmo computador ao longo do dia. Com uma sessão puramente deslizante, se um funcionário esquecer de fazer logout ao final do expediente, o colega do turno seguinte continuará usando a aplicação sob a conta anterior.

O teto de 12 horas cobre a janela de um turno de trabalho e força a expiração da sessão, exigindo um novo login. Isso evita que ações sensíveis como check-ins, cancelamentos ou registros de pagamento fiquem atribuídas ao usuário errado nos logs do sistema.
