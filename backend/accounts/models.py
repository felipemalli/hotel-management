"""
Usuario do sistema (SPEC 1.1) e o papel que ele exerce.
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    """Dois papeis, e a razao de nao serem tres coisas do Django.

    `is_staff` significa "entra no /admin/" -- e o seed rebaixa exatamente essa
    flag, porque conta administrativa com senha publicada nao pode existir.
    Usa-la como papel do produto amarraria a permissao da API a um caminho de
    escrita que o dominio recusa (nao ha `hotel/admin.py`).

    `Groups` seria a resposta com tres papeis ou permissoes cruzadas. Com dois
    papeis exclusivos, uma coluna responde "quem e este usuario" numa unica
    leitura, sem join, e o valor viaja no proprio `request.user`.
    """

    ATTENDANT = "ATTENDANT", "Atendente"
    ADMIN = "ADMIN", "Administrador do hotel"


class CustomUser(AbstractUser):
    """Atendente ou administrador do hotel.

    O papel decide o acesso as rotas de cadastro administrativo (quartos,
    politica de tarifas); o balcao inteiro continua aberto ao atendente.
    """

    role = models.CharField(
        max_length=10,
        choices=Role,
        default=Role.ATTENDANT,
        help_text="ATTENDANT opera o balcão; ADMIN também publica cadastros administrativos.",
    )
