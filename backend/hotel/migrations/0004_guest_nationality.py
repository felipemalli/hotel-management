# Default "BR" e one-off (preserve_default=False): nao fica no model.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("hotel", "0003_reservation_actors"),
    ]

    operations = [
        migrations.AddField(
            model_name="guest",
            name="nationality",
            field=models.CharField(default="BR", max_length=2),
            preserve_default=False,
        ),
    ]
