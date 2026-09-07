# Regras de negócio do sistema

## Iniciais

1- Diárias de segunda à sexta-feira terão um valor fixo de R$ 120,00;
2- Diárias em finais de semana terão um valor fixo de R$ 180,00;
3- Caso o hóspede tenha carro e necessite utilizar as vagas disponíveis no estabelecimento, será cobrado uma taxa adicional de R$ 15,00 de segunda à sexta-feira e R$ 20,00 nos finais de semana;
4- O horário para a realização do check-in será a partir das 14h00min. Ao tentar realizar o procedimento antes do horário previsto, o sistema deverá emitir um alerta;
5- O horário para a realização do checkout será até as 12h00min. Caso o procedimento seja realizado posteriormente, deverá ser cobrada uma taxa adicional de 50% do valor da diária (Respeitando a variação para dias úteis e finais de semana);
6- Durante o processo de checkout, deverá ser exibido em detalhes o total geral da reserva a ser paga;

## Adicionadas

7- Checkout antecipado permitido mediante aprovação do atendente;
8- Valores fixos, taxas e horários de check-in e check-out são imutáveis, mas podem ser substituídos via sistema de snapshot;
9- A fatura final é gerada com base no shapshot dos valores e taxas do momento da reserva;
10- Quartos possuem número máximo de pessoas que comportam;
11- Uma reserva possui no mínimo 1 títular;
12- Uma reserva pode possuir acompanhantes.
13- Um hóspede não pode realizar outro check-in enquanto outro seu está ativo
14- Caso o checkout ocorra antes, o valor de todas as diárias se mantém.
15- Caso o check-in ocorra depois, o valor de todas as diárias se mantém.
16- A multa de 50% é cobrada por dia, a partir do dia limite, inclusive ele. Um dia só gera multa se o hóspede permanecer nele depois das 12h, e cada multa usa a tarifa do próprio dia.
