from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from accounts.models import Role


class IsHotelAdmin(BasePermission):
    """role == ADMIN ou superusuario.

    createsuperuser nasce com role ATTENDANT (o default) e receberia 403
    nas proprias rotas administrativas da API.
    """

    message = "Ação restrita ao administrador do hotel."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or getattr(user, "role", None) == Role.ADMIN)
        )
