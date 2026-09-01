"""Endpoint de saude (SPEC 4.2) - sem auth, usado pelo compose e pelo DoD de A."""

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response


# Sem anotacao, o spectacular nao infere o retorno de uma @api_view e reporta
# "unable to guess serializer" ao gerar o schema.
@extend_schema(
    summary="Checagem de saude",
    responses={200: inline_serializer(name="Health", fields={"status": serializers.CharField()})},
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def health(_request: Request) -> Response:
    return Response({"status": "ok"})
