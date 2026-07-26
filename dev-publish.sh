#!/bin/bash
# ===========================================
# dev-publish.sh
# Bump versión + test + publish + instalar en consumidores.
# Delega a publish.sh (fuente de verdad para publish)
# y scripts/install-consumers.sh (fuente de verdad para install).
#
# ⚠️  PRINCIPIO ARQUITECTÓNICO — NO MODIFICAR SIN AUTORIZACIÓN ⚠️
#
# events-core se publica online en GitHub Packages.
# gym y tango SIEMPRE consumen @latest del registry online.
# NUNCA usar links locales (pnpm link, file:...) ni versiones fijas.
# Dependencia en package.json SIEMPRE con rango (^x.y.z) o @latest, nunca versión exacta.
#
# Razón: gym y tango están (o estarán) en servers separados.
# Solo lo publicado en el registry está disponible para ellos.
#
# Flujo completo: dev-publish.sh → publish.sh → GitHub Packages
#                                              → install-consumers.sh → pnpm add @latest
#
# Uso: bash dev-publish.sh [patch|minor|major]
# Ejemplo: bash dev-publish.sh patch  (0.1.0 → 0.1.1)
# ===========================================
set -e

BUMP_TYPE=${1:-patch}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGES_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$PACKAGES_DIR")"
cd "$SCRIPT_DIR"

echo "📦 Publicando nueva versión de @onlemary/events-core..."

# 1. Obtener versión actual
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📌 Versión actual: $CURRENT_VERSION"

# 2. Incrementar versión
npm version "$BUMP_TYPE" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "📌 Nueva versión: $NEW_VERSION"

# Cargar EVENTS_CORE_DB_URL desde gym/.env.events-core (base del paquete events-core).
# Los tests corren Prisma contra esa DB (acá con `npm test` y de nuevo en
# publish.sh vía prepublishOnly). Sin la variable fallan con
# "Prisma requires EVENTS_CORE_DB_URL". Solo como fallback: respetamos un
# EVENTS_CORE_DB_URL ya exportado en el entorno.
if [ -z "${EVENTS_CORE_DB_URL:-}" ]; then
    ENV_EVENTS="$PROJECT_ROOT/gym/.env.events-core"
    if [ -f "$ENV_EVENTS" ]; then
        set -a
        source <(grep '^EVENTS_CORE_DB_URL' "$ENV_EVENTS" | sed 's/\r$//')
        set +a
    else
        echo "⚠️  gym/.env.events-core no encontrado — los tests pueden fallar si EVENTS_CORE_DB_URL no está seteada"
    fi
fi
# vitest.config.ts hace fallback entre EVENTS_CORE_DB_URL y DATABASE_URL — reflejamos si falta.
if [ -z "${DATABASE_URL:-}" ] && [ -n "${EVENTS_CORE_DB_URL:-}" ]; then
    export DATABASE_URL="$EVENTS_CORE_DB_URL"
fi

# 3. Ejecutar tests (fail-fast: si fallan, no commitear el bump)
# NOTA: npm publish vuelve a correr tests via prepublishOnly — es intencional
# como safety net. El test explícito aquí evita commitear un bump roto.
echo "🧪 Ejecutando tests..."
npm test

# 4. Commit del bump
git add -A
git commit -m "chore: bump version to $NEW_VERSION" || true

# 5. Publicar (delega a publish.sh — fuente de verdad)
echo "📤 Publicando..."
bash publish.sh

# 6. Instalar en consumidores (delega a install-consumers.sh — fuente de verdad)
echo ""
bash scripts/install-consumers.sh

echo ""
echo "✅ Publicación completa! Versión: $NEW_VERSION"
