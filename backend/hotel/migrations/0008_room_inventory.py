# Inventario de quartos e anti-overbooking.
# Ordem: btree_gist (EXCLUDE precisa btree+gist no mesmo indice), CreateModel,
# AddField(null=True) + AlterField(NOT NULL) — banco com volume antigo falha
# alto de proposito. Sem RunPython: FKs DEFERRABLE + DDL = pending trigger events.

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
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
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
