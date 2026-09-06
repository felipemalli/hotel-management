from __future__ import annotations

from rest_framework.routers import SimpleRouter

from hotel.billing.views import PricingPolicyViewSet

router = SimpleRouter()
router.register("pricing-policies", PricingPolicyViewSet, basename="pricing-policy")

urlpatterns = router.urls
