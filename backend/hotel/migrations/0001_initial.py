# Regenerated: document/phone persistidos ja normalizados.

import django.contrib.postgres.indexes
import django.db.models.deletion
import django.db.models.functions.text
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        # pg_trgm ANTES dos indices: os GinIndex funcionais de Guest dependem da
        # classe de operadores gin_trgm_ops (SPEC 1.4).
        TrigramExtension(),
        migrations.CreateModel(
            name="Guest",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("full_name", models.CharField(max_length=140)),
                ("document", models.CharField(max_length=40, unique=True)),
                ("phone", models.CharField(max_length=30)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["full_name", "id"],
                "indexes": [
                    django.contrib.postgres.indexes.GinIndex(
                        django.contrib.postgres.indexes.OpClass(
                            django.db.models.functions.text.Upper("full_name"), name="gin_trgm_ops"
                        ),
                        name="guest_name_trgm_upper",
                    ),
                    django.contrib.postgres.indexes.GinIndex(
                        django.contrib.postgres.indexes.OpClass(
                            django.db.models.functions.text.Upper("document"), name="gin_trgm_ops"
                        ),
                        name="guest_document_trgm_upper",
                    ),
                    django.contrib.postgres.indexes.GinIndex(
                        django.contrib.postgres.indexes.OpClass(
                            django.db.models.functions.text.Upper("phone"), name="gin_trgm_ops"
                        ),
                        name="guest_phone_trgm_upper",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="Reservation",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("checkin_date", models.DateField()),
                ("checkout_date", models.DateField()),
                ("has_vehicle", models.BooleanField(default=False)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Reserva pendente"),
                            ("CHECKED_IN", "Hospede no hotel"),
                            ("CHECKED_OUT", "Finalizada"),
                            ("CANCELLED", "Cancelada"),
                        ],
                        db_index=True,
                        default="PENDING",
                        max_length=11,
                    ),
                ),
                ("checked_in_at", models.DateTimeField(blank=True, null=True)),
                ("checked_out_at", models.DateTimeField(blank=True, null=True)),
                (
                    "total_daily",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
                ),
                (
                    "total_parking",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
                ),
                (
                    "late_fee",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
                ),
                (
                    "total_amount",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "guest",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="reservations",
                        to="hotel.guest",
                    ),
                ),
            ],
            options={
                "ordering": ["checkin_date", "id"],
                "indexes": [
                    models.Index(fields=["status", "checkin_date"], name="resv_status_checkin")
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(("checkout_date__gt", models.F("checkin_date"))),
                        name="resv_checkout_after_checkin",
                    ),
                    models.UniqueConstraint(
                        condition=models.Q(("status", "CHECKED_IN")),
                        fields=("guest",),
                        name="resv_one_active_per_guest",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(
                            models.Q(("status", "CHECKED_OUT"), _negated=True),
                            models.Q(
                                ("checked_out_at__isnull", False), ("total_amount__isnull", False)
                            ),
                            _connector="OR",
                        ),
                        name="resv_checked_out_complete",
                    ),
                ],
            },
        ),
    ]
