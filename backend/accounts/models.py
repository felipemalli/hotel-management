from django.contrib.auth.models import AbstractUser


class CustomUser(AbstractUser):
    """Atendente do hotel. Sem campos extras por decisao de escopo (SPEC 0.1)."""
