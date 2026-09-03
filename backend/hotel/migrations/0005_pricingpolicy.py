# A politica de tarifas e a linha de bootstrap com os valores do briefing.
#
# Os literais estao ESCRITOS AQUI, e a migration nao importa `hotel.services.
# pricing`: migration e registro historico, e importar a constante faria o
# passado mudar junto com o codigo. `test_default_policy_row_matches_default_
# rates` compara a linha com `DEFAULT_RATES` campo a campo -- e o teste, nao o
# import, que mantem as duas em dia.
#
# `effective_from` e uma SENTINELA em 2000-01-01, nao o instante da migracao:
# os testes de API congelam o relogio em marco/2025 e o seed faz check-in
# "ontem". Com a vigencia no momento do `migrate`, `policy_in_force` nao
# encontraria politica nenhuma para qualquer data anterior -- o seed abortaria
# na cadeia de subida do compose e a suite cairia inteira.
#
# `RunPython` sobre a tabela que o `CreateModel` acabou de criar (CREATE ->
# INSERT) e seguro; o que a regra da casa proibe e o inverso na mesma
# transacao (INSERT -> ALTER), que estoura com "pending trigger events" por
# causa das FKs DEFERRABLE do Django. O DDL em `Reservation` fica na 0006.

from datetime import datetime, UTC
from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

BOOTSTRAP = {
    "weekday_rate": Decimal("120.00"),
    "weekend_rate": Decimal("180.00"),
    "weekday_park": Decimal("15.00"),
    "weekend_park": Decimal("20.00"),
    "late_fee_factor": Decimal("0.5"),
    "checkin_opens": "14:00",
    "checkout_limit": "12:00",
    "note": "tarifa do briefing (bootstrap)",
}

SENTINEL_EFFECTIVE_FROM = datetime(2000, 1, 1, 0, 0, tzinfo=UTC)


def create_bootstrap_policy(apps, schema_editor):
    PricingPolicy = apps.get_model("hotel", "PricingPolicy")
    # `get_or_create` e nao `create`: o `flush` transacional da suite de teste
    # nao restaura dado de migration, e a fixture autouse chama a mesma chave.
    PricingPolicy.objects.get_or_create(
        effective_from=SENTINEL_EFFECTIVE_FROM,
        defaults=BOOTSTRAP,
    )


def drop_bootstrap_policy(apps, schema_editor):
    PricingPolicy = apps.get_model("hotel", "PricingPolicy")
    PricingPolicy.objects.filter(effective_from=SENTINEL_EFFECTIVE_FROM).delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("hotel", "0004_guest_nationality"),
    ]

    operations = [
        migrations.CreateModel(
            name="PricingPolicy",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("weekday_rate", models.DecimalField(decimal_places=2, max_digits=10)),
                ("weekend_rate", models.DecimalField(decimal_places=2, max_digits=10)),
                ("weekday_park", models.DecimalField(decimal_places=2, max_digits=10)),
                ("weekend_park", models.DecimalField(decimal_places=2, max_digits=10)),
                ("late_fee_factor", models.DecimalField(decimal_places=4, default=Decimal("0.5"), max_digits=5)),
                ("checkin_opens", models.TimeField()),
                ("checkout_limit", models.TimeField()),
                ("effective_from", models.DateTimeField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("note", models.CharField(blank=True, max_length=200)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="pricing_policies",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-effective_from", "-id"]},
        ),
        migrations.AddConstraint(
            model_name="pricingpolicy",
            constraint=models.CheckConstraint(
                condition=models.Q(("weekday_rate__gte", 0))
                & models.Q(("weekend_rate__gte", 0))
                & models.Q(("weekday_park__gte", 0))
                & models.Q(("weekend_park__gte", 0))
                & models.Q(("late_fee_factor__gte", 0)),
                name="policy_money_non_negative",
            ),
        ),
        migrations.AddConstraint(
            model_name="pricingpolicy",
            constraint=models.CheckConstraint(
                condition=models.Q(("checkout_limit__lte", models.F("checkin_opens"))),
                name="policy_checkout_before_checkin",
            ),
        ),
        migrations.RunPython(create_bootstrap_policy, drop_bootstrap_policy),
    ]
