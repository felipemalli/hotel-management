from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    ATTENDANT = "ATTENDANT", "Atendente"
    ADMIN = "ADMIN", "Administrador do hotel"


class CustomUser(AbstractUser):
    role = models.CharField(
        max_length=10,
        choices=Role,
        default=Role.ATTENDANT,
        help_text="ATTENDANT opera o balcão; ADMIN também publica cadastros administrativos.",
    )
