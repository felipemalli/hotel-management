# Decisões de interpretação (D1–D19)

> Voltar ao [README](../README.md). Os casos numéricos T1–T9 citados aqui
> estão na seção 4 do README, em `backend/tests/unit/test_pricing.py` e em
> `frontend/src/features/reservations/__fixtures__/bills.ts`.

O briefing tem ambiguidades reais — como contar diárias, qual tarifa aplica em
cada uma, o que exatamente acontece às 12h00min em ponto. Esta seção é o
registro de **como cada uma foi resolvida e por quê**, incluindo a leitura
alternativa que foi rejeitada e o caso concreto em que as duas divergem. As
decisões são normativas: todo código e todo teste deriva delas, e cada linha
carrega um identificador `Dx` para ser citável em revisão.

> Leitura das referências: `Tn` são os casos da tabela de dinheiro (README §4);
> `RFn` / `RNn` são os requisitos funcionais e de negócio do briefing.

## 4.1 Decisões que resolvem ambiguidades do briefing

As regras de negócio ficam em [`backend/docs/BUSINESS_RULE.md`](../backend/docs/BUSINESS_RULE.md) —
é ele a fonte da verdade. A tabela abaixo é a **leitura** dessas regras onde o texto admitia mais
de uma; divergiu, o arquivo vence e esta tabela é que se corrige.

| ID | Ambiguidade | Decisão |
|----|-------------|---------|
| D1 | Como contar diárias? | Uma diária por **data** no intervalo `[data(check-in real), max(data(checkout real), data(checkout contratado)))`. **Saída antecipada não devolve diária** — o hóspede paga o período que reservou. Se o intervalo for vazio (day-use), cobra-se **mínimo de 1 diária** (a do dia do check-in). |
| D2 | Qual tarifa aplica em cada diária? | A do dia da semana **da própria data da diária**. Sex→Seg = sex 120 + sáb 180 + dom 180. |
| D3 | Multa de checkout tardio | Cobrada **por dia**, a partir do dia de saída contratado, inclusive ele. Um dia entra se o hóspede permaneceu nele **depois das 12:00:00** — os dias anteriores ao da saída entram sempre (ficou o dia inteiro); o dia da saída entra só se ele vagou passado o limite. **Exatamente 12:00:00 é isento.** Cada multa vale 50% da tarifa **do seu próprio dia** (útil 60,00 / fds 90,00) e independe de vaga. Quem sai antes do prazo nunca é multado. |
| D4 | Check-in antes das 14h | Permitido se `hora local >= 14:00:00`. Antes disso a API responde `409 EARLY_CHECKIN` (alerta). O atendente pode **confirmar mesmo assim** reenviando com `allow_early: true` — o briefing pede *alerta*, não bloqueio. |
| D5 | Busca parcial em documento/telefone | `documento` e `telefone` em claro, **já normalizados** (D9). Busca **parcial** (trigram/`icontains`) nos três campos: nome, documento e telefone. Cifra em repouso foi rejeitada — custa o `LIKE` e o negócio não a usa. |
| D6 | Cobrança usa datas agendadas ou reais? | **As duas.** A entrada segue o fato (`checked_in_at`). A saída cobra o **maior** entre o fato (`checked_out_at`) e o contratado (`checkout_date`): estender custa mais, antecipar não desconta. |
| D7 | Check-in fora da data agendada | Não validamos correspondência com a data agendada (fora de escopo). D6 garante que a cobrança permanece correta. |
| D8 | Cancelamento | Enum inclui `CANCELLED`; transição `PENDING → CANCELLED` exposta via endpoint. Nenhum outro estado cancela. |
| D9 | Documento sem dígito / passaporte / telefone internacional | Normalização de **armazenamento** é **por tipo**: documento = alfanumérico maiúsculo (`re.sub(r"[^A-Z0-9]", "", v.upper())`), telefone = dígitos **E.164 sem o `+`** (`5521988887777`). A coluna guarda o valor normalizado; a máscara digitada não persiste. Validação: documento ≥ 4 alfanuméricos; telefone **exige o `+` e o código do país na entrada**, validado por `phonenumberslite` (`is_valid_number`). A presença do DDI é garantida na **entrada** — o `+` não persiste e o banco não distingue. Nacionalidade obrigatória em ISO 3166-1 alpha-2. |
| D10 | Vaga no dia da saída em checkout tardio | **Não** se cobra vaga do dia de saída: a taxa de vaga acompanha as diárias (intervalo semiaberto de D1) e a única consequência do atraso é a multa de D3 — o briefing enumera a penalidade de forma exaustiva. |
| D11 | Reserva com data no passado | Criação exige `checkin_date >= data local de hoje` (`400 VALIDATION_ERROR`). O passado entra no sistema pelos fatos (check-in/checkout reais), nunca pelo agendamento. |
| D12 | Hóspede duplicado | `document` é único (`409 DUPLICATE_DOCUMENT` no segundo cadastro). Como a coluna já está normalizada (D9), a unicidade é tolerante a máscara. Telefone **não** é único (familiares compartilham). |
| D13 | Day-use agendado | Agendamento exige mínimo de 1 noite (constraint mantida). Day-use existe apenas como **fato** (check-in e checkout reais no mesmo dia — T9), coberto por D1. |
| D14 | Reserva PENDING vencida | Continua listada em `pending-checkin` até ação do atendente (check-in ou cancelamento). O sistema não muda estado sem gesto humano. |
| D19 | Titular e acompanhantes | Cada acompanhante é um `Guest` completo (documento e telefone próprios). O preço **não** muda com o número de pessoas; a capacidade do quarto é o freio. As abas "no hotel" e "pendentes" listam acompanhantes. |
| D16 | Overbooking de quarto | Três camadas: o `EXCLUDE` gist protege a **agenda** (datas que se cruzam), a unique parcial protege o **fato físico** (dois `CHECKED_IN` no mesmo quarto), e overstay e chegada antecipada — que dependem de "hoje" — são guardas de leitura sob lock. |
| D17 | Capacidade do quarto | `capacity` é a única propriedade do quarto que outra regra consome. Lotação total do hotel **não** se guarda: é derivada (`Sum(capacity)` dos ativos) e já imposta por construção. |
| D18 | Pagamento da conta fechada | Pagamento **único e integral**, com forma e ator, registrado depois do checkout. Não é um status: `CHECKED_OUT` continua sendo o estado terminal. Sem pagamento parcial e sem estorno. |
| D15 | Qual política de tarifa rege a estadia | A política **amarrada no check-in** rege tudo: diárias, vaga, fator da multa **e** limite de checkout. Só o horário de abertura do check-in vem da política vigente no ato, porque antecede a amarração. |

## 4.2 Leituras alternativas rejeitadas

Para cada decisão: a leitura alternativa em uma frase testável, um caso concreto onde as duas divergem, e por que a adotada venceu.

**D1 — mínimo de 1 diária.** Alternativa: "cobra-se uma diária por noite dormida; estadia sem pernoite gera zero diárias." Divergência: T9 (seg 03/03 14:00 → 18:00, com vaga) valeria ~R$ 60,00 (só multa) em vez de **R$ 195,00**. Venceu a adotada: quarto ocupado e higienizado tem custo; fatura zero contradiz "total geral da reserva **a ser paga**"; mínimo de 1 diária é praxe hoteleira.

**D2 — tarifa pela data da diária.** Alternativa: "a diária é precificada pelo dia em que a noite termina." Divergência: qui 06/03 15:00 → sáb 08/03 10:00 = qui 120 + sex 120 = **R$ 240,00** (adotada) vs sex 120 + sáb 180 = R$ 300,00 (alternativa). Venceu a adotada: "diárias de segunda à sexta" qualifica o dia em que a diária ocorre, e é assim que tarifa é anunciada em balcão.

**D3 — multa pela tarifa do dia da saída; 12:00:00 isento.** Alternativa: "a multa usa a tarifa da última diária dormida, não a do dia da saída." Divergência: sáb 08/03 14:00 → seg 10/03 12:30 = diárias 360,00 + multa 50%×120 (seg) = **R$ 420,00** (adotada) vs multa 50%×180 (dom) = R$ 450,00. Venceu a adotada: o briefing atrela a variação útil/fds ao **procedimento** de checkout, que ocorre na segunda. Fronteira: "até as 12h00min" lido como inclusivo → 12:00:00 em ponto isento (T8); "até", em pt-BR, inclui o limite. Segunda alternativa, agora sobre a **contagem**: "a multa é uma só, pela tarifa do dia da saída real, e permanência extra é diária, não penalidade" — foi o desenho original, trocado em `f0384de`. Divergência: contratado 10/09 → 15/09 com saída real em 17/09 às 13:00 = 7 diárias 960,00 + vaga 115,00, e aí **R$ 1.255,00** (adotada, 3 multas) vs R$ 1.135,00 (alternativa, 1 multa). Venceu a adotada, com a ressalva registrada: o briefing diz "**uma** taxa adicional" atrelada ao procedimento, então cobrar por dia é partida deliberada do texto, não leitura dele. O que a sustenta é que noite não autorizada custar 150% da tarifa aproxima a tarifa *rack* que hotéis cobram por extensão sem aprovação, e que o briefing é silente sobre permanência multi-dia. Nos nove T a escolha é indiferente — todos têm exatamente um dia de multa, então nenhum número da §4 se move. **Gatilho para voltar à multa única:** o dia em que atraso multi-dia deixar de ser conflito de quarto. Hoje `resv_one_active_per_room` barra o check-in do próximo hóspede e não existe caminho de resolução, então a regra por dia precifica um cenário que o resto do modelo trata como erro operacional, não como estadia.

**D4 — alerta com override (e a defesa do 409).** Alternativa: "antes das 14h o check-in é bloqueado, sem exceção." Divergência: hóspede no balcão às 13:59 → adotada: modal + confirmação = hospedado; alternativa: espera forçada. Venceu a adotada: o briefing manda **permitir** o check-in e **emitir alerta** — alerta não é proibição. Defesa do 409 (devolutiva técnica, três linhas): (1) RFC 9110 define 409 como conflito que o cliente pode resolver **alterando a requisição e reenviando** — exatamente o ciclo `allow_early`; (2) preserva a semântica binária do POST mutador (2xx ⇔ check-in efetivado), sem "200 que não muta"; (3) com o envelope de erro único (README §6), `EARLY_CHECKIN` é ramo de protocolo de primeira classe no cliente — e o caminho comum (≥ 14h) segue `200` direto, sem passar por erro.

**D5 — PII em claro + busca parcial nos três campos.** Alternativa: "cifrar documento/telefone em repouso (Fernet) e buscar só por igualdade via blind index." Divergência: buscar `789` acharia a Ana na adotada e devolveria vazio na alternativa. Venceu a adotada: o briefing pede localizar por documento e telefone, o atendente busca por fragmento, e cifra + `LIKE` são objetivos incompatíveis. Criptografia de campo é excesso que o negócio não usa.

**D6 — cobrança pelos fatos.** Alternativa: "a fatura usa as datas agendadas da reserva." Divergência: agendado seg 03 → qua 05 (R$ 240,00); hóspede sai qui 06/03 11:00 → adotada: seg+ter+qua = **R$ 360,00**; alternativa: R$ 240,00 (R$ 120,00 de subfaturamento). Venceu a adotada: dinheiro segue ocupação real; e a simetria protege o hóspede na saída antecipada.

**D7 — check-in fora da data agendada.** Alternativa: "check-in só na data agendada." Divergência: reserva para 05/03, hóspede chega 04/03 15:00 → adotada hospeda (e cobra desde 04, por D6); alternativa exige recriar a reserva. Venceu a adotada: validação não pedida, e D6 blinda o financeiro.

**D8 — cancelamento só de PENDING.** Alternativa: "CHECKED_IN também cancela (estorno)." Divergência: cancelar após uma noite dormida exigiria política de estorno inexistente no briefing. Venceu a adotada: dinheiro monotônico, extrato único.

**D9 — normalização alfanumérica do documento.** Alternativa: "normalizar documento por dígitos." Divergência: passaportes `AB123456` e `CD123456` colidiriam na coluna única → `409 DUPLICATE_DOCUMENT` indevido no segundo. Venceu a adotada: preserva a unicidade real; telefone segue por dígitos porque só a máscara varia.

**D19 — titular + acompanhantes, e por que as abas os listam.** Alternativa: guardar só o número de pessoas na reserva. Divergência: `GET /api/guests/in-hotel/` responde "quem está hospedado", e um número não é uma pessoa — o acompanhante não apareceria em busca nenhuma, apesar de estar no hotel. Adotada: cada acompanhante é um `Guest` completo, e as duas abas os listam. Em "pendentes" é **simetria**: se alguém conta como hospedado depois do check-in, conta como esperado antes dele. O front deriva "esta linha é de acompanhante" de `guest_id != row.id` — dois ids já dizem isso, e um campo `role` computado só repetiria.

O preço não muda com o número de pessoas (o briefing cobra por diária, não por pessoa): a capacidade do quarto é o único freio, e `test_bill_ignores_companions` fixa isso com T7 e dois acompanhantes em R$ 425,00. O M2M é **implícito**: a unicidade `(reservation, guest)` vem de graça, e não há atributo por vínculo que justifique um `through`.

**A invariante "uma estadia ativa por pessoa" tem duas autoridades diferentes.** Para o titular é a constraint `resv_one_active_per_guest`. Para o acompanhante **não existe constraint cross-table** sem denormalizar `status` na tabela intermediária, então a autoridade é o lock ordenado de `_lock_people` mais a guarda de leitura: sob `READ COMMITTED`, a segunda transação espera no lock e relê depois do commit da primeira. Três detalhes do lock, cada um com uma falha real por trás: `sorted(...)` porque ordens diferentes dão deadlock; `filter(pk__in=ids)` **sem join** porque o PostgreSQL recusa `FOR UPDATE` no lado anulável de um outer join (e o ORM gera outer join ao atravessar M2M); e `list(...)` porque queryset preguiçoso nunca chega a executar o `FOR UPDATE`. **Fraqueza assumida:** uma escrita que não passe por `check_in` fura a regra do acompanhante — hoje não existe outra, porque acompanhante só é gravado na criação, que nasce `PENDING`. **Gatilho** para uma tabela única de participantes com constraint: o *segundo* caminho de escrita.

**D16 — overbooking em três camadas, e por que não dá para ser só uma.** O `EXCLUDE` gist (`resv_room_no_overlap`) impede duas reservas ativas com datas cruzadas no mesmo quarto; `'[)'` deixa passar estadias adjacentes — sai dia 09, entra dia 09 — que é a mesma semântica de D1. Mas ele olha datas **agendadas**, e D6 cobra pelos fatos reais: um hóspede que fica além do `checkout_date` continua `CHECKED_IN` com a agenda já liberada, e nada impediria um segundo `CHECKED_IN` no mesmo quarto. Daí a unique parcial (`resv_one_active_per_room`), que protege o fato físico. Sobram dois casos que **nenhuma constraint pode expressar**, porque dependem de "hoje": (a) oferecer um quarto com overstay na disponibilidade; (b) uma chegada antecipada (D7) tomar um quarto prometido a outra `PENDING`. Esses são guardas de leitura sob lock, com o `today`/`now` que a view já injeta.

**D7 (complemento) — chegar antes continua permitido, salvo se toma o quarto de alguém.** Divergência com caso: a reserva de 09→11 aparece no balcão dia 07 e quer entrar já; existe outra reserva de 07→09 no mesmo quarto. Adotada: `409 ROOM_UNAVAILABLE` com o id da reserva prometida. Alternativa (permitir): o `EXCLUDE` não pega — as datas agendadas 07→09 e 09→11 não se cruzam — e o hóspede das 07 chega a um quarto ocupado.

**D14 (complemento) — a pendência vencida retém o quarto.** Consequência direta de "o sistema não muda estado sem gesto humano": enquanto ninguém cancela nem faz o check-in, o quarto segue reservado. É registrado aqui porque é o custo assumido de não ter no-show automático; a saída é o `cancel`.

**A ordem de lock é `Guest → Room → Reservation → Account`,** por tabela, e dentro de `Guest` por pk crescente. Duas transações que travem as mesmas linhas em ordens diferentes fazem deadlock, e o atendente vê um 500. `create_reservation` não trava nada: a autoridade dela é o `EXCLUDE` sob savepoint, que traduz a corrida no mesmo `409 ROOM_UNAVAILABLE` da guarda.

**D17 — capacidade sim, lotação do hotel não.** `capacity` é a única propriedade do quarto que outra regra consome (titular + acompanhantes ≤ capacidade); sem ela, "reserva com mais pessoas" não tem freio. Lotação total é derivada (`Sum(capacity)` dos ativos) e já imposta por construção pelo anti-overbooking. **Gatilho:** lotação legal (alvará) *menor* que a soma — aí é uma linha de configuração e uma guarda no check-in. Sem preço por quarto, sem `RoomType` e sem foto: a costura para preço é `hotel.billing.services.rate_table_of`, ponto único, e foto exigiria `MEDIA_ROOT`, volume no compose e Pillow no Dockerfile — não é a coluna que custa.

**D18 — pagamento único e integral (decisão revista).** A leitura do briefing continua a mesma: não há pagamento parcial nem estorno, e `PAID` **não** é um quinto estado da reserva — pago é um fato sobre a estadia encerrada, não um estágio dela. O que mudou foi onde o fato mora. A primeira versão guardava `paid_at`, `payment_method` e `paid_by` como três colunas da reserva, com a CHECK `resv_payment_complete` impedindo meio pagamento. O argumento contra uma tabela `Payment` era que ela duplicaria os quatro totais e o ator — argumento que caiu quando os totais saíram da reserva. Hoje o dinheiro inteiro vive em `hotel/billing`: `Account` (OPEN → CLOSED → PAID), `AccountLine` por item cobrado e `Payment` **1:1** com a conta, e a reserva guarda só a FK `account`. A CHECK `account_closed_is_complete` faz o papel da antiga: conta fechada tem `closed_at` e `total_amount`, conta aberta não tem nenhum dos dois. Pagar duas vezes segue respondendo `409 INVALID_STATUS` com `extra.paid_at`, e **não** um código `ALREADY_PAID`: é operação ilegal para o estado atual do recurso, o mesmo significado de D8. O ator do recebimento chama-se `received_by` (não `paid_by`): a coluna guarda o atendente logado, como `checked_in_by`/`checked_out_by` — não o pagador. **Gatilho para `Payment` virar N:1:** o primeiro pagamento parcial ou estorno — aí `Payment.account` deixa de ser OneToOne e o status da conta passa a derivar da soma.

**O extrato é um fato, não uma função.** A 2ª via já não recomputava; agora nem os totais são colunas. O checkout lança uma `AccountLine` por diária, uma por vaga e, quando houver, uma por **dia** de multa (`quantity` = fator da política, `unit_amount` = a tarifa daquele dia, como manda o D3), e fecha a conta somando as linhas na mesma transação do flip de status. `statement()` hidrata dessas linhas e **nunca** chama o motor. `calculate_bill` passa a ter exatamente **três** chamadores, e só um deles escreve: `check_out` e `preview_checkout`, em `hotel/reservations/services.py`, são o mesmo cálculo com e sem efeito; `quote_scheduled_stay`, no próprio motor, estima a estadia antes de existir reserva. `late_fee_applied` deriva da presença da linha `LATE_FEE`, não de uma coluna: dois lugares para o mesmo fato podem discordar. `weekday_label` continua fora do banco — nome de dia da semana é formatação na fronteira de I/O, e congelá-lo guardaria o idioma junto com o dinheiro.

**A estimativa assume saída no horário limite.** O modal de nova reserva precisa dizer um valor antes de existir estadia, e valor precisa de hora de saída. `quote_scheduled_stay` passa `checkout_time = rates.checkout_limit` e o período agendado nos dois `booked_*`: sair no limite é sair no prazo, logo **a estimativa nunca antecipa multa**. O número que o atendente informa é o piso da conta, não uma promessa — quem fecha o extrato é o checkout, sob a política amarrada no check-in (D15), e não a vigente no momento da cotação. As linhas voltam agrupadas em no máximo dois baldes (`weekday`, `weekend`) porque a tela quer duas linhas, não N; o recorte é de exibição e só é honesto enquanto a `RateTable` tiver uma faixa por tipo de dia. **Gatilho:** tarifa por data (feriado, alta temporada) — aí o balde perde a tarifa unitária única e o agrupamento passa a ser por par (diária, vaga), não por dia da semana.

**D15 — a política amarrada no check-in rege a estadia inteira.** Alternativa: "ler o limite de checkout da política vigente no momento do checkout." Divergência com caso numérico: política A (`checkout_limit=12:00`, multa 50%) amarrada na sexta; o admin publica B (`13:00`, 25%) no sábado; a saída é domingo 12:30. Adotada: **atraso sob A** — multa de R$ 90,00 e total de R$ 425,00 (o T7). Alternativa: isento, porque 12:30 < 13:00 — e a diária viria de A enquanto a decisão de multar viria de B, duas políticas dentro do mesmo extrato. Venceu a adotada: o hóspede combinou uma política na entrada, e é a combinada que fecha a conta.

A exceção é o horário de **abertura** do check-in: ele decide se o check-in pode acontecer, logo antecede a amarração e só pode vir da política vigente no ato. É por isso que `EARLY_CHECKIN` traz `extra.opens_at` — o cliente monta a mensagem sem parsear `detail`, e com a política do briefing o texto sai idêntico ao de sempre ("Check-in permitido a partir das 14:00.").

**Valores configuráveis não quebram o briefing.** Os números do desafio (120/180/15/20, multa de 50%, 14h/12h) passam a ser o **estado inicial** do sistema, em três camadas redundantes: (1) `engine.DEFAULT_RATES` segue a constante, agora com os horários como campos com default — `tests/unit/test_pricing.py` não passa `rates`, e T1–T9 não mudam um byte; (2) uma data migration insere a mesma linha com os **mesmos literais** (migração é registro histórico e não importa constante de código), e `test_default_policy_row_matches_default_rates` amarra as duas fontes campo a campo; (3) `effective_from` é o instante da publicação e a política é amarrada por FK no check-in, então **mudar a política é mudar o futuro, nunca o passado**. Isto é *mais* fiel ao briefing que antes: antes da política versionada, mudar `DEFAULT_RATES` reescreveria silenciosamente a 2ª via de um extrato já emitido. Sem uma ação deliberada de um `ADMIN`, cada número e cada mensagem do sistema é idêntico ao de hoje.

**D9 (emenda) — o telefone exige `+` e código do país na entrada.** Alternativa: "aceitar o número como vier e inferir o país." Divergência: `11933334444` é um celular de São Paulo; sem o `+`, `phonenumbers` o lê como `+1 193…` (EUA) — e `31…` vira Holanda, `41…` vira Suíça. Adotada: `400` no campo `phone`, e o atendente completa o DDI. Alternativa: o número entra no banco com o país errado, passa a busca e a unicidade sem levantar nada, e nunca mais volta ao dono. Por isso a checagem é `is_valid_number` (plano de numeração do país) e não `is_possible_number` (só comprimento) — a segunda aceitaria os três casos acima. A regra mora em `hotel.guests.services.create_guest`, não no serializer, pelo mesmo motivo de D11/D13: tem de valer para o seed e para o shell.

**D9 (emenda) — nacionalidade obrigatória, ISO 3166-1 alpha-2.** Alternativa: `django-countries`/`pycountry`. Divergência: o que o sistema precisa é recusar `ZZ`, não traduzir nomes de país para 40 idiomas nem servir um `<select>` — isso é do frontend, que já tem a lista. Adotada: um `frozenset` de 249 strings estáveis em `hotel/guests/normalization.py`, zero dependência. O model **não** tem `default`: default silencioso faria todo hóspede estrangeiro nascer brasileiro no primeiro caminho de escrita que esquecesse o campo (o `"BR"` da migração é one-off, `preserve_default=False`).

**D10 — sem vaga no dia da saída.** Alternativa: "checkout tardio cobra também a vaga do dia da saída." Divergência: T7 iria de **R$ 425,00** para R$ 445,00 (+ dom 20,00). Venceu a adotada: a consequência do atraso está enumerada exaustivamente no briefing (os 50%); cobrar vaga extra é regra inventada.

**D11 — sem reserva no passado.** Alternativa: "aceitar `checkin_date` passado." Divergência: POST em 01/09 com check-in 25/08 → alternativa cria pendência já vencida no primeiro dia de uso; adotada responde `400`. Venceu a adotada: reserva é compromisso futuro.

**D12 — documento único.** Alternativa: "documento repetido cria segunda ficha." Divergência: 2º POST com o mesmo CPF → duas fichas; busca e abas mostram o mesmo humano duas vezes. Venceu a adotada: documento é o identificador civil; histórico não fragmenta.

**D13 — agendamento mínimo de 1 noite.** Alternativa: "permitir agendar `checkout_date = checkin_date`." Divergência: a constraint de mínimo 1 noite teria que cair. Venceu a adotada: constraint simples; o motor (D1/T9) já protege o caixa quando o day-use acontece de fato.

**D14 — pendência vencida fica visível.** Alternativa: "PENDING vencida some ou auto-cancela." Divergência: reserva de ontem sem check-in desapareceria sem gesto do atendente. Venceu a adotada: decisão comercial é humana; automatizar no-show é escopo novo.

---

## 4.3 PII e busca (D5 e D9 na prática)

`documento` e `telefone` ficam em claro, **já normalizados** (D9): a coluna
guarda `12345678901` e `5521988887777`, não a máscara digitada — o telefone em
dígitos E.164, sem o `+`. A busca
(`?search=`) acha por **fragmento** nos três campos — nome, documento e
telefone — via `icontains` e índice trigram. Termo com máscara (`789-01`,
`(21) 98888`) é normalizado antes do predicado, então casa o valor gravado.
Documento é único nessa forma normalizada (D12); telefone não.

A API devolve o valor gravado. A máscara de CPF/telefone na tabela é
formatação de exibição no frontend (`formatDocument` / `formatPhone`). Logs
jamais contêm PII: nenhum `print`/log de payload de hóspede, e o exception
handler não ecoa o body.

