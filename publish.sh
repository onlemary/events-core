#!/bin/bash
# ===========================================
# publish.sh
# Fuente única de verdad para publicar @onlemary/events-core
# en GitHub Packages (npm.pkg.github.com).
#
# ⚠️  PRINCIPIO ARQUITECTÓNICO — NO TOCAR SIN AUTORIZACIÓN ⚠️
#
# events-core se publica online en GitHub Packages.
# gym y tango SIEMPRE consumen @latest del registry online.
# NUNCA usar links locales (pnpm link, file:...) ni versiones fijas.
# Dependencia en package.json SIEMPRE con rango (^x.y.z) o @latest, nunca versión exacta.
#
# Razón: gym y tango están (o estarán) en servers separados.
# Solo lo publicado en el registry está disponible para ellos.
#
# Flujo: dev-publish.sh (opcional, bumpea) → publish.sh → GitHub Packages
#                                                  → install-consumers.sh (opcional) → pnpm add @latest
#
# Uso: bash publish.sh
#
# Prerequisitos:
#   - GITHUB_TOKEN configurado (en gym/.env.secrets)
#   - EVENTS_CORE_DB_URL disponible (prioridad: $1 > env > gym/.env.events-core > placeholder)
#   - package.json con la versión YA bumpeada si vas a hacer release con bump;
#     si solo querés republicar la versión actual, esto no toca package.json
#
# NOTA: npm publish ejecuta prepublishOnly (build + test) automáticamente.
#       Este script SOLO se encarga de:
#       (a) propagar el env var requerido por prisma generate
#       (b) inyectar el auth token inline para npm.pkg.github.com
#       No hace build explícito para no duplicar trabajo.
# ===========================================
set -e

# Localizar PROJECT_ROOT (3 niveles arriba de este script:
# este script → packages/events-core → packages → monorepo root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVENTS_DIR="$SCRIPT_DIR"
PACKAGES_DIR="$(dirname "$EVENTS_DIR")"        # packages
PROJECT_ROOT="$(dirname "$PACKAGES_DIR")"      # monorepo root

# -----------------------------------------------------------------
# 1. Cargar GITHUB_TOKEN desde monorepo root (gym/.env.secrets)
# -----------------------------------------------------------------
if [ -z "${GITHUB_TOKEN:-}" ]; then
    if [ -f "$PROJECT_ROOT/gym/.env.secrets" ]; then
        set -a
        # Solo líneas no-comentadas y que empiecen con GITHUB_TOKEN
        source <(grep -v '^#' "$PROJECT_ROOT/gym/.env.secrets" | grep -v '^$' | grep '^GITHUB_TOKEN' | sed 's/\r$//')
        set +a
    fi
fi

# -----------------------------------------------------------------
# 2. Cargar EVENTS_CORE_DB_URL
# -----------------------------------------------------------------
# Es requerido SOLO para el `prepublishOnly` chain → `prisma generate`
# (lee prisma.config.ts vía env()). No afecta lo publicado.
# Prioridad: $1 > env exportado > gym/.env.events-core > placeholder
#            > error.
if [ -z "${EVENTS_CORE_DB_URL:-}" ]; then
    if [ -n "${1:-}" ]; then
        export EVENTS_CORE_DB_URL="$1"
    elif [ -f "$PROJECT_ROOT/gym/.env.events-core" ]; then
        set -a
        source <(grep '^EVENTS_CORE_DB_URL' "$PROJECT_ROOT/gym/.env.events-core" | sed 's/\r$//')
        set +a
    else
        # Placeholder: solo necesita ser sintácticamente válido para
        # que prisma.config.ts cargue; no se conecta realmente a la DB.
        export EVENTS_CORE_DB_URL="postgres://placeholder:placeholder@localhost:5432/events_core_placeholder"
        echo "⚠️  EVENTS_CORE_DB_URL no provisto — usando placeholder (solo válido para que prisma.config.ts cargue)"
    fi
fi
# vitest config puede leer DATABASE_URL como fallback — espejamos.
if [ -z "${DATABASE_URL:-}" ] && [ -n "${EVENTS_CORE_DB_URL:-}" ]; then
    export DATABASE_URL="$EVENTS_CORE_DB_URL"
fi

cd "$EVENTS_DIR"

# -----------------------------------------------------------------
# 3. Verificar auth
# -----------------------------------------------------------------
if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "❌ GITHUB_TOKEN no encontrado."
    echo "   Configuralo en $PROJECT_ROOT/gym/.env.secrets (formato: GITHUB_TOKEN=ghp_...)."
    exit 1
fi

# -----------------------------------------------------------------
# 4. Publicar
# -----------------------------------------------------------------
NEW_VERSION=$(node -p "require('./package.json').version")
echo "📦 Publicando @onlemary/events-core@$NEW_VERSION..."

# npm publish ejecuta prepublishOnly (build + test) — eso leerá
# EVENTS_CORE_DB_URL exportado arriba en este mismo proceso de bash.
npm publish --//npm.pkg.github.com/:_authToken="${GITHUB_TOKEN}"

echo "✅ @onlemary/events-core@$NEW_VERSION publicado en GitHub Packages"
