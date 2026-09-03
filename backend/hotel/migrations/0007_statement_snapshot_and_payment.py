# O extrato deixa de ser recomputado e passa a ser um snapshot: `StatementLine`
# por diaria, `late_fee_base` para a base da multa, e as tres colunas do
# pagamento unico (D18).
#
# `late_fee_applied` NAO e coluna: deriva de `late_fee_base IS NOT NULL`. Duas
# colunas para o mesmo fato podem discordar, e um `applied=True` com base nula
# nao teria como ser reemitido.
#
# Sem RunPython: a decisao registrada e banco limpo (`docker compose down -v`).
# Reserva ja encerrada num banco antigo ficaria sem linhas, e `statement()`
# responde 409 explicito nesse caso em vez de devolver um recibo vazio.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("hotel", "0006_reservation_policy"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="late_fee_base",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="reservation",
            name="paid_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="reservation",
            name="payment_method",
            field=models.CharField(
                blank=True,
                choices=[
                    ("CASH", "Dinheiro"),
                    ("CARD", "Cartão"),
                    ("PIX", "Pix"),
                    ("OTHER", "Outro"),
                ],
                max_length=8,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="reservation",
            name="paid_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="reservations_paid",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.CreateModel(
            name="StatementLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField()),
                ("daily_rate", models.DecimalField(decimal_places=2, max_digits=10)),
                ("parking_fee", models.DecimalField(decimal_places=2, max_digits=10)),
                (
                    "reservation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="statement_lines",
                        to="hotel.reservation",
                    ),
                ),
            ],
            options={"ordering": ["date"]},
        ),
        migrations.AddConstraint(
            model_name="statementline",
            constraint=models.UniqueConstraint(
                fields=("reservation", "date"), name="stmtline_unique_date"
            ),
        ),
        migrations.AddConstraint(
            model_name="reservation",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(("paid_at__isnull", True))
                    & models.Q(("payment_method__isnull", True))
                    & models.Q(("paid_by__isnull", True))
                )
                | (
                    models.Q(("paid_at__isnull", False))
                    & models.Q(("payment_method__isnull", False))
                    & models.Q(("paid_by__isnull", False))
                ),
                name="resv_payment_complete",
            ),
        ),
        migrations.AddConstraint(
            model_name="reservation",
            constraint=models.CheckConstraint(
                condition=models.Q(("paid_at__isnull", True))
                | models.Q(("status", "CHECKED_OUT")),
                name="resv_paid_requires_checked_out",
            ),
        ),
    ]
