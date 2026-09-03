# A FK da reserva para a politica, amarrada no check-in (D15), e a CHECK que
# exige politica em toda reserva que passou por lá.
#
# Separada da 0005 por regra da casa: `RunPython` nunca no mesmo arquivo que
# DDL da tabela que ele grava. A 0005 insere em `hotel_pricingpolicy`; aqui o
# `ALTER TABLE` e em `hotel_reservation`. Juntar as duas nao estoura hoje, mas
# a proxima migration que precisar de backfill estouraria com "pending trigger
# events" -- as FKs do Django sao DEFERRABLE INITIALLY DEFERRED.
#
# Sem backfill: a decisao registrada e banco limpo (`docker compose down -v`).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hotel", "0005_pricingpolicy"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="policy",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="reservations",
                to="hotel.pricingpolicy",
            ),
        ),
        migrations.AddConstraint(
            model_name="reservation",
            constraint=models.CheckConstraint(
                condition=models.Q(("status__in", ["PENDING", "CANCELLED"]))
                | models.Q(("policy__isnull", False)),
                name="resv_active_has_policy",
            ),
        ),
    ]
