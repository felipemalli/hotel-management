"""
Rotas raiz (Workstream A).

As rotas de dominio (guests, reservations, auth) e a excecao de CSP em
/api/docs/ entram no Workstream C (SPEC 2.4, 4.2).
"""

from django.contrib import admin
from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from config.health import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
