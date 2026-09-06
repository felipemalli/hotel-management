from __future__ import annotations

from datetime import datetime

from django.db.models import QuerySet

from hotel.billing.models import PricingPolicy


def policy_in_force(at: datetime) -> PricingPolicy:
    policy = (
        PricingPolicy.objects.filter(effective_from__lte=at)
        .order_by("-effective_from", "-id")
        .first()
    )
    if policy is None:
        # Banco sem bootstrap, nao erro do cliente. Um codigo de dominio fingiria
        # que a requisicao resolve isso.
        raise RuntimeError(
            "nenhuma PricingPolicy vigente: o bootstrap nao foi aplicado (rode migrate)"
        )
    return policy


def list_policies() -> QuerySet[PricingPolicy]:
    return PricingPolicy.objects.select_related("created_by").all()
