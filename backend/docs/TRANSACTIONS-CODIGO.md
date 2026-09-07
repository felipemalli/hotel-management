## Transactions

Ao longo do projeto, várias transações precisaram ser realizadas para garantir que regras de negócio não fossem violadas.

Os locks congelam a linha até o commit e devolvem o estado atual. Os asserts veem se tem algum problema naquela ação acontecer. 

Usam `select_for_update()` para fazer o lock, que trava a linha no banco contra escritas concorrentes e devolve uma nova instância da mesma linha, relida no último estado commitado. É importante ser uma nova instância porque o objeto que chega no service veio do `get_object()` da view, numa query própria, antes da transação existir. E entre essa leitura e o `_lock` pode ter ocorrido o commit de qualquer outra requisição, então o dado pode estar desatualizado.

Por isso, os asserts são relacionados ao dado gerado pelas funções do `lock` no código.

O exemplo do `check_in` é interessante pois é o mais complexo de transactions:

`reservations/services.py`:
```python
def check_in(
    reservation: Reservation,
    *,
    now: datetime,
    actor: AbstractBaseUser,
    allow_early: bool = False,
) -> Reservation:
    with transaction.atomic():
        people_ids = _lock_people(reservation)
        _lock_room(reservation)
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_IN)
        _assert_no_active_stay(locked, people_ids)
        _assert_room_ready(locked, now=now)
...
```

No checkin, o `.atomic()` abre a transação no início do service, que mantém os locks válidos até o commit.

A `_assert_room_ready` cuida do quarto no momento do check-in, em dois passos:
1) Quando outra estadia ainda está CHECKED_IN nele; pois a agenda pode estar livre, mas o quarto não está. Isso porque na criação da reserva, nós permitimos uma reserva terminar dia 7 (12h) e outra iniciar dia 7 (14h). Mas nada obriga o primeiro hóspede a sair. Enquanto ninguém chamar o checkout, a reserva dele continua CHECKED_IN, mesmo passando da data. Por isso o check-in da segunda falha na hora, com 409 ROOM_UNAVAILABLE. O atendente precisa fechar o checkout da primeira e tentar de novo.
2) Quando o hóspede chega antes da data agendada, barra se a antecipação invadiria a janela de outra reserva PENDING.


A `_assert_no_active_stay` impede o titular + acompanhantes de possuírem outra estadia ativa ao mesmo tempo.

A `_assert_transition` basicamente diz "CHECKED_IN é alcançável de onde estou?". Então ela garante que a reserva com locked esteja PENDING. Se estiver qualquer outro estado, lança erro. Ou seja, aqui é garantido que se tiver 2 dialogs de check-ins tentando ao mesmo tempo (com inicial PENDING) e um concluir, o outro vai esperar o lock. E se na primeira transação deixar de ser PENDING, a segunda dará erro.

**[Importante]**: um lock só é liberado no commit ou no rollback, então uma transação segura os locks que já pegou enquanto espera pelo próximo. Se duas pedirem os mesmos recursos em ordens diferentes, cada uma acaba segurando o que a outra espera, que causa deadlock. A defesa é uma ordem única, obedecida por todos: `Guest → Room → Reservation → Account`. Como basta um ponto fora da ordem para anular a garantia, ela é declarada no topo do services.py, e o `Account` fica em `billing` (a regra atravessa os dois apps).