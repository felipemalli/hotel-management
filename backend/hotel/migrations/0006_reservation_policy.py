# FK da reserva para a politica. Separada da 0005: RunPython nunca no mesmo
# arquivo que DDL da tabela que ele grava (pending trigger events).

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
