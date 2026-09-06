from __future__ import annotations

from django.urls import path

from ai.views import ai_status, copilot

urlpatterns = [
    path("status/", ai_status, name="ai-status"),
    path("copilot/", copilot, name="ai-copilot"),
]
