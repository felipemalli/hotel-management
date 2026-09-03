# Nacionalidade obrigatoria (D9 estendida). O default "BR" e ONE-OFF
# (`preserve_default=False`): serve apenas para preencher a linha que ja existe,
# e nao fica no model -- default silencioso ali faria todo hospede estrangeiro
# nascer brasileiro no primeiro caminho de escrita que esquecesse o campo.
#
# Sem RunPython: o `AddField` com default resolve o backfill no proprio DDL, e a
# regra da casa e nunca misturar RunPython com DDL da mesma tabela na mesma
# migration (FK do Django e DEFERRABLE INITIALLY DEFERRED, e a combinacao
# estoura com "pending trigger events").

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
