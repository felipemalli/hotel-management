"""
Configuracao do projeto (SPEC 2.3-2.4).

Infra de subida (banco, fuso, whitenoise, spectacular) vem do Workstream A;
autenticacao JWT, permissao global, envelope de erro unico, headers de
seguranca e CSP sao do Workstream C.
"""

import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


SECRET_KEY = env("SECRET_KEY", "insecure-dev-key-change-me")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,backend")

# -- Aplicacoes ---------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    "accounts",
    "hotel",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Estaticos sob gunicorn: admin e Swagger com CSS mesmo com DEBUG=0 (SPEC 2.4).
MIDDLEWARE.insert(
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,
    "whitenoise.middleware.WhiteNoiseMiddleware",
)
# Content-Security-Policy (SPEC 2.4). A isencao pontual de /api/docs/ e por
# view, em config/urls.py -- a politica global segue estrita nas demais rotas.
MIDDLEWARE.insert(
    MIDDLEWARE.index("whitenoise.middleware.WhiteNoiseMiddleware") + 1,
    "csp.middleware.CSPMiddleware",
)

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# -- Banco --------------------------------------------------------------------
# DB_HOST default = localhost (execucao nativa); o compose injeta DB_HOST=db.

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "hotel"),
        "USER": env("POSTGRES_USER", "hotel"),
        "PASSWORD": env("POSTGRES_PASSWORD", "hotel"),
        "HOST": env("DB_HOST", "localhost"),
        "PORT": env("DB_PORT", "5432"),
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Custom user desde a primeira migracao (SPEC 1.1).
AUTH_USER_MODEL = "accounts.CustomUser"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# -- Internacionalizacao e tempo (SPEC 0.3) -----------------------------------

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

# -- Estaticos ----------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# -- Criptografia de PII (SPEC 2.1) -------------------------------------------
# Consumido pelo Workstream B (hotel/fields.py, hotel/crypto.py).

FIELD_ENCRYPTION_KEY = env("FIELD_ENCRYPTION_KEY")
HASH_PEPPER = env("HASH_PEPPER")

# -- DRF / OpenAPI ------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    # Fechado por padrao (SPEC 2.3). As excecoes AllowAny sao explicitas nas
    # proprias views: /api/health/, /api/auth/token/{,refresh}/, schema e docs.
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    # Envelope de erro unico {"code","detail","extra"} (SPEC 4.1).
    "EXCEPTION_HANDLER": "hotel.exceptions.api_exception_handler",
}

# -- JWT (SPEC 2.3) -----------------------------------------------------------
# 60 min = sessao de balcao; 12 h = um turno de trabalho. Sem rotacao: a
# blacklist adicionaria tabela e complexidade sem exigencia no briefing.

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(hours=12),
    "ROTATE_REFRESH_TOKENS": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Gestao de Hospedes de Hotel",
    "DESCRIPTION": "API de cadastro, reservas, check-in/checkout e extrato.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # /api/schema/ e /api/docs/ ficam abertos (SPEC 2.3): contrato navegavel
    # nao exige token, e nenhum dado de hospede trafega neles.
    "SERVE_PERMISSIONS": ["rest_framework.permissions.AllowAny"],
    # Assets locais: funciona offline e sob CSP estrita (SPEC 2.4, V3).
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
}

# -- Headers de seguranca (SPEC 2.4) ------------------------------------------
# HSTS so tem efeito atras de TLS; deixar armado evita esquecer na promocao a
# producao. Cookies seguros seguem o DEBUG: em dev nao ha TLS para carrega-los.

SECURE_HSTS_SECONDS = int(env("SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = not DEBUG

# django-csp >= 4: configuracao em dicionario; o formato plano CSP_* foi
# removido (SPEC 2.4, V1). Assets do Swagger vem do sidecar, logo 'self' basta.
CONTENT_SECURITY_POLICY = {
    "DIRECTIVES": {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "frame-ancestors": ["'none'"],
    }
}

# -- IA opcional (SPEC 7) -----------------------------------------------------

ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY")
