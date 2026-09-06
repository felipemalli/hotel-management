from __future__ import annotations

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

ROOM_NUMBER_UNIQUE = "room_number_unique"
ROOM_CAPACITY_POSITIVE = "room_capacity_positive"


class Room(models.Model):
    number = models.CharField(max_length=10)
    capacity = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    # FK e PROTECT: sem esta flag um quarto em reforma nao pode ser escondido.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(fields=["number"], name=ROOM_NUMBER_UNIQUE),
            models.CheckConstraint(
                name=ROOM_CAPACITY_POSITIVE,
                condition=Q(capacity__gte=1),
            ),
        ]

    def __str__(self) -> str:
        return self.number
