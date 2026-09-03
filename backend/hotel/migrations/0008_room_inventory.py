# Inventario de quartos e o anti-overbooking.
#
# Ordem obrigatoria e sem `RunPython`:
#   1. `BtreeGistExtension` -- a 0001 habilita so `pg_trgm`, e o `EXCLUDE`
#      precisa comparar igualdade de FK (btree) e sobreposicao de range (gist)
#      no MESMO indice. `btree_gist` e extensao *trusted* no PG >= 13: o dono
#      do banco a instala sem ser superusuario.
#   2. `CreateModel` do quarto.
#   3. `AddField(null=True)` seguido de `AlterField(NOT NULL)`. Em banco vazio
#      isso aplica direto; em banco com volume antigo falha ALTO -- que e o
#      comportamento desejado, porque a decisao registrada e banco limpo
#      (`docker compose down -v`) e um default inventado poria toda reserva
#      historica num quarto que ela nunca ocupou.
#   4. As duas constraints.
#
# Sem `RunPython` em nenhum ponto: a regra da casa proibe misturar backfill com
# DDL da mesma tabela (FKs DEFERRABLE do Django -> "pending trigger events").

import django.contrib.postgres.constraints
import django.contrib.postgres.fields.ranges
import django.core.validators
import django.db.models.deletion
from django.contrib.postgres.operations import BtreeGistExtension
from django.db import migrations, models

import hotel.models


class Migration(migrations.Migration):

    dependencies = [
        ("hotel", "0007_statement_snapshot_and_payment"),
    ]

    operations = [
        BtreeGistExtension(),
        migrations.CreateModel(
            name="Room",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("number", models.CharField(max_length=10)),
                (
                    "capacity",
                    models.PositiveSmallIntegerField(
                        validators=[django.core.validators.MinValueValidator(1)]
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["number"]},
        ),
        migrations.AddConstraint(
            model_name="room",
            constraint=models.UniqueConstraint(fields=("number",), name="room_number_unique"),
        ),
        migrations.AddConstraint(
            model_name="room",
            constraint=models.CheckConstraint(
                condition=models.Q(("capacity__gte", 1)), name="room_capacity_positive"
            ),
        ),
        migrations.AddField(
            model_name="reservation",
            name="room",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="reservations",
                to="hotel.room",
            ),
        ),
        migrations.AlterField(
            model_name="reservation",
            name="room",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="reservations",
                to="hotel.room",
            ),
        ),
        migrations.AddConstraint(
            model_name="reservation",
            constraint=django.contrib.postgres.constraints.ExclusionConstraint(
                condition=models.Q(("status__in", ["PENDING", "CHECKED_IN"])),
                expressions=[
                    ("room", "="),
                    (
                        hotel.models.DateRange(
                            "checkin_date",
                            "checkout_date",
                            django.contrib.postgres.fields.ranges.RangeBoundary(),
                        ),
                        "&&",
                    ),
                ],
                name="resv_room_no_overlap",
            ),
        ),
        migrations.AddConstraint(
            model_name="reservation",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status", "CHECKED_IN")),
                fields=("room",),
                name="resv_one_active_per_room",
            ),
        ),
    ]
