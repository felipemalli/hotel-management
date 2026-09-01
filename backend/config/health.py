"""Endpoint de saude (SPEC 4.2) - sem auth, usado pelo compose e pelo DoD de A."""

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def health(_request: Request) -> Response:
    return Response({"status": "ok"})
