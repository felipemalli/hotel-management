"""
Permissao de papel (SPEC 2.3).

Uma classe, um significado: "este usuario pode publicar cadastro
administrativo". A rota declara a permissao; a view nao le `role` a mao e o
dominio nao conhece `request`.
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from accounts.models import Role


class IsHotelAdmin(BasePermission):
    """`role == ADMIN` **ou** superusuario.

    O `or is_superuser` nao e cortesia: quem foi criado por `createsuperuser`
    para acessar o `/admin/` nasce com o `role` default (`ATTENDANT`) e
    receberia 403 nas proprias rotas administrativas da API -- um 403 que
    nenhuma tela explica e que so se resolve por SQL.
    """

    message = "Ação restrita ao administrador do hotel."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or getattr(user, "role", None) == Role.ADMIN)
        )
