"""
Re-cifra a PII com a chave corrente e re-deriva os blind indexes (SPEC 2.1).

Complemento operacional do `MultiFernet` de `hotel/crypto.py`: a lista de
chaves deixa o sistema LER o que foi cifrado com a chave antiga, e este comando
e o que finalmente move os dados para a chave nova, permitindo aposentar a
anterior.

Nao ha nada de esperto aqui, e isso e o ponto: `Guest.save()` ja e a autoridade
de derivacao (SPEC 2.1), entao um `save()` por linha re-cifra o documento e o
telefone com a primeira chave da lista e recalcula os dois hashes de graca.
Vale igualmente para a troca de `HASH_PEPPER`.

Procedimento de rotacao de chave:

    1. FIELD_ENCRYPTION_KEY="<nova>,<antiga>"   (a primeira cifra)
    2. manage.py rotate_pii
    3. FIELD_ENCRYPTION_KEY="<nova>"

Rodar o passo 3 antes do 2 torna a base ilegivel; rodar o 2 sem o 1 nao faz mal
nenhum (re-cifra com a mesma chave). O comando e idempotente.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from hotel.models import Guest

BATCH_SIZE = 200


class Command(BaseCommand):
    help = "Re-cifra a PII dos hóspedes com a chave corrente e re-deriva os blind indexes."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Apenas conta os registros que seriam re-cifrados, sem gravar.",
        )

    def handle(self, *args, **options) -> None:
        total = Guest.objects.count()
        if options["dry_run"]:
            # Nao imprime PII (SPEC 2.2): so a contagem.
            self.stdout.write(f"{total} hóspede(s) seriam re-cifrados.")
            return

        rotated = 0
        # `iterator` com chunk: a base de um hotel cabe em memoria, mas o
        # comando nao deve assumir isso.
        for guest in Guest.objects.iterator(chunk_size=BATCH_SIZE):
            with transaction.atomic():
                # Ler o objeto ja decifrou com a chave que servir (MultiFernet);
                # salvar re-cifra com a corrente. Os dois `*_hash` entram
                # sozinhos: `Guest.save()` os adiciona ao `update_fields`.
                # `updated_at` fica de fora de proposito -- re-cifrar e
                # operacao de armazenamento, nao alteracao da ficha.
                guest.save(update_fields=["document", "phone"])
            rotated += 1

        self.stdout.write(self.style.SUCCESS(f"{rotated}/{total} hóspede(s) re-cifrados."))
