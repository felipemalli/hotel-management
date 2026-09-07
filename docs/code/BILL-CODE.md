# BILL

Uma fatura é aberta no momento do check-in seguindo o modelo do `Bill` para possibilitar a expansão do modelo com gastos extras que podem ocorrer durante a estadia (consumo em frigobar, restaurante do hotel, danos, etc.). 

```python
Bill(
    lines=[
        BillLine(date=date(2026, 9, 10), weekday_label='quinta-feira',  daily_rate=Decimal('120.00'), parking_fee=Decimal('15.00')),
        BillLine(date=date(2026, 9, 11), weekday_label='sexta-feira',   daily_rate=Decimal('120.00'), parking_fee=Decimal('15.00')),
        BillLine(date=date(2026, 9, 12), weekday_label='sábado',        daily_rate=Decimal('180.00'), parking_fee=Decimal('20.00')),
        BillLine(date=date(2026, 9, 13), weekday_label='domingo',       daily_rate=Decimal('180.00'), parking_fee=Decimal('20.00')),
        BillLine(date=date(2026, 9, 14), weekday_label='segunda-feira', daily_rate=Decimal('120.00'), parking_fee=Decimal('15.00')),
    ],
    subtotal_daily=Decimal('720.00'),
    subtotal_parking=Decimal('85.00'),
    late_fees=[
        LateFee(date=date(2026, 9, 15), weekday_label='terça-feira', base_rate=Decimal('120.00'), amount=Decimal('60.00')),
    ],
    late_fee=Decimal('60.00'),
    total=Decimal('865.00'),
)
```

A saída contratada era 15/09 e o hóspede vagou o quarto às 12:30. A multa é do dia da saída, não das `lines`: 15/09 não gera diária nem vaga (o período cobrado é semiaberto), só os 50% da tarifa do próprio dia.

As `lines` e `late_fees` ficam em uma tabela separada (`billing_accountline`).

Elas nascem no checkout porque só ali existe o que as define. `calculate_bill` exige o dia e a hora da saída real, e é a saída real que decide **quantas** linhas são: o período cobrado vai até `max(saída real, saída contratada)`, então cada dia de permanência além do contratado acrescenta uma diária, uma vaga e uma multa. No exemplo acima, sair em 17/09 às 13:00 daria 7 diárias, 7 vagas e 3 multas em vez de 5, 5 e 1. No check-in nada disso é conhecido, e a conta é aberta vazia.

Inserir cedo e corrigir depois também não seria só um `UPDATE` extra: a `UniqueConstraint` `accountline_one_per_kind_date` é por (`account`, `kind`, `service_date`), então relançar no checkout colidiria com o que já estivesse lá. Do jeito atual, `post_lines` é um lock e um `bulk_create` — o checkout de N noites não trava N vezes.

Cancelamento não entra na justificativa: a conta só passa a existir no check-in, que é quem chama `open_account`, e de `CHECKED_IN` só se sai para `CHECKED_OUT` (`ALLOWED_TRANSITIONS`). A CHECK `resv_account_matches_status` fecha isso no banco, exigindo `account IS NULL` em `PENDING` e `CANCELLED`. Reserva cancelada nunca teve conta, logo nunca houve linha para excluir.