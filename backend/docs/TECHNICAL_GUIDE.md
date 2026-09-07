# Decisões técnicas principais - backend

A arquitetura segue os padrões do django. Em geral,

Leitura
[query serializer?] → view → selector → response serializer

Escrita
request serializer → view → service → response serializer








** desempacota o dicionário em argumentos nomeados.

serializer.validated_data é um dict, então




## Tabelas do Django que não usamos

`accounts_customuser_groups` e `accounts_customuser_user_permissions`: vêm do `PermissionsMixin`, que o `AbstractUser` já traz; existem sem escolha nossa. Ficam vazias porque o permissionamento é a coluna `role`, lida por `IsHotelAdmin` **por rota**; o do Django é **por modelo**. Passariam a valer na primeira permissão que não se derive do papel. Só sairiam do schema trocando `AbstractUser` por `AbstractBaseUser` (duas tabelas vazias a menos ao custo de reescrever o modelo de usuário à mão).

`django_session` — seria a sessão do Django, e usamos JWT + cookie (AUTH.md). `django.contrib.sessions` saiu de `INSTALLED_APPS`; a tabela não existe mais.

`django_admin_log` — registra só o que passa pela interface do `/admin/`. Aqui toda escrita passa por service e nenhum app de `hotel/` registra admin, então `django.contrib.admin` saiu também. A auditoria do domínio são as colunas de ator (`created_by`, `checked_in_by`, …) e o livro append-only de `billing`.


