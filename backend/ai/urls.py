from __future__ import annotations

from django.urls import path

from ai.views import ai_status, parse_guest

urlpatterns = [
    path("status/", ai_status, name="ai-status"),
    path("parse-guest/", parse_guest, name="ai-parse-guest"),
]
