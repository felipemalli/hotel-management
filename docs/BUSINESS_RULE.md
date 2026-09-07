# Regras de negócio

RN1–RN6 são as regras do desafio, na ordem do enunciado. De RN7 em diante estão
as regras adicionadas na implementação — as que resolvem uma ambiguidade do
enunciado e as que o produto precisou para funcionar. Os casos numéricos que
fixam os valores (T1–T9) estão em [CHALLENGE.md](./CHALLENGE.md).

## Do desafio

| ID  | Regra                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN1 | Diárias de segunda à sexta-feira terão um valor fixo de R$ 120,00.                                                                                                                                 |
| RN2 | Diárias em finais de semana terão um valor fixo de R$ 180,00.                                                                                                                                      |
| RN3 | Caso o hóspede tenha carro e necessite utilizar as vagas disponíveis no estabelecimento, será cobrada uma taxa adicional de R$ 15,00 de segunda à sexta-feira e R$ 20,00 nos finais de semana.     |
| RN4 | O horário para a realização do check-in será a partir das 14h00min. Ao tentar realizar o procedimento antes do horário previsto, o sistema deverá emitir um alerta.                                 |
| RN5 | O horário para a realização do checkout será até as 12h00min. Caso o procedimento seja realizado posteriormente, deverá ser cobrada uma taxa adicional de 50% do valor da diária (respeitando a variação para dias úteis e finais de semana). |
| RN6 | Durante o processo de checkout, deverá ser exibido em detalhes o total geral da reserva a ser paga.                                                                                                 |

## Adicionadas

### Dinheiro e tempo

| ID   | Regra                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN7  | Uma diária por **data**, no intervalo semiaberto de `min(entrada real, entrada contratada)` até `max(saída real, saída contratada)`. Mínimo de 1 diária: day-use cobra a data da entrada.                                             |
| RN8  | Sair antes da data contratada, ou chegar depois dela, não desconta diária: paga-se o período contratado. Chegar antes ou sair depois cobra as diárias a mais.                                                                          |
| RN9  | Cada diária e cada vaga usam a tarifa do dia da **própria data** (sex→seg = 120 + 180 + 180).                                                                                                                                          |
| RN10 | A multa de checkout tardio é **por dia**, do dia de saída contratado em diante: um dia entra se o hóspede ainda estava nele depois das 12:00:00, e vale 50% da tarifa **daquele dia**. 12:00:00 em ponto é isento. Não se cobra vaga do dia da saída. |
| RN11 | O check-in abre às 14:00:00. Antes disso a API responde `409 EARLY_CHECKIN` com a hora do servidor; o atendente pode confirmar e efetivar mesmo assim (`allow_early`). O enunciado pede alerta, não bloqueio.                          |
| RN12 | Tarifas, fator da multa e horários são versionados (`PricingPolicy`, append-only). Só o admin publica uma política nova; a vigente nunca é editada.                                                                                     |
| RN13 | A política **amarrada no check-in** rege a estadia inteira: diárias, vaga, fator e limite de checkout. Só a abertura do check-in vem da política vigente no ato, porque antecede a amarração.                                          |
| RN14 | A conta abre vazia no check-in e fecha no checkout com uma linha por diária, por vaga e por dia de multa. A 2ª via do extrato vem das linhas gravadas, nunca de recálculo.                                                              |
| RN15 | Pagamento único e integral, depois do checkout, com forma e atendente. Sem parcial e sem estorno; pagar de novo responde `409 INVALID_STATUS`. Pago é um fato sobre a conta, não um status da reserva.                                   |

### Reservas e quartos

| ID   | Regra                                                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN16 | Reserva exige entrada não anterior a hoje e mínimo de 1 noite. Day-use existe só como fato (RN7).                                                                                                                      |
| RN17 | Transições: `PENDING → CHECKED_IN → CHECKED_OUT` e `PENDING → CANCELLED`. Só `PENDING` cancela; nenhum outro estado muda sem ser por essas setas.                                                                       |
| RN18 | Check-in fora da data agendada é permitido; a cobrança segue os fatos (RN7, RN8).                                                                                                                                      |
| RN19 | Reserva `PENDING` vencida continua listada em "check-in pendente" e retém o quarto até check-in ou cancelamento. O sistema não muda estado sem gesto humano: sem no-show automático.                                    |
| RN20 | Sem overbooking: um quarto não aceita reservas ativas com datas cruzadas (adjacentes podem: sai dia 9, entra dia 9), nem dois check-ins ativos, nem chegada antecipada que tome o quarto prometido a outra reserva.      |
| RN21 | Quarto tem capacidade; titular + acompanhantes ≤ capacidade. Quarto com reserva ativa (`PENDING` ou `CHECKED_IN`) não se desativa; quarto com histórico de reserva não se exclui.                                                              |

### Pessoas

| ID   | Regra                                                                                                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN22 | Uma reserva tem um titular e pode ter acompanhantes. Cada acompanhante é um hóspede completo e aparece nas listas "no hotel" e "check-in pendente". Acompanhantes entram e saem só enquanto a reserva está `PENDING`. O preço não muda com o número de pessoas. |
| RN23 | Uma pessoa, titular ou acompanhante, não pode ter duas estadias ativas ao mesmo tempo.                                                                                                                                                  |
| RN24 | Documento é único e guardado normalizado (alfanumérico maiúsculo, mínimo 4 caracteres). Telefone exige código do país e é validado (E.164); não é único. Nacionalidade obrigatória (ISO 3166-1 alpha-2).                                 |
| RN25 | Busca por fragmento em nome, documento e telefone, sobre os valores normalizados: a máscara digitada não importa.                                                                                                                       |
| RN26 | Hóspede e reserva não têm edição nem exclusão genéricas pela API: mudam por transições (e, em `PENDING`, pela lista de acompanhantes). Toda transição registra quem e quando.                                                            |
| RN27 | Papéis: `ATTENDANT` opera o balcão; só `ADMIN` (ou superusuário do Django) cadastra, edita e exclui quartos e publica tarifas. `is_staff` sozinho não concede nada.                                                                                                                                      |
