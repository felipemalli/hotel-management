## USE_TZ

**`USE_TZ = True`**: O Django guarda todas as datas e horas no formato UTC (Tempo Coordenado Universal) dentro do banco de dados. Na hora de mostrar para o usuário, ele converte para o fuso horário local definido em `TIME_ZONE`.

**Vantagens de ativar (`True`):**

1. Evita erros durante mudanças de horário de verão.
2. Facilita sistemas acessados por pessoas em países ou fusos horários diferentes.
3. Padroniza os registros temporais da aplicação. [1]

**`USE_TZ = False`**: O Django usa o horário local do servidor sem conversões automáticas ao salvar no banco de dados.