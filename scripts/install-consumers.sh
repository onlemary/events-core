#!/bin/bash
# ===========================================
# Wrapper de delegación. Fuente única = scripts/install-package.sh del monorepo.
# No duplicar lógica acá — si cambia el patrón, se cambia en 1 lugar.
#
# Uso (idéntico al script viejo, sin breaking change):
#   bash scripts/install-consumers.sh [--add]
# ===========================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"  # packages/<name>
bash "$PACKAGE_DIR/../../scripts/install-package.sh" "$PACKAGE_DIR" "$@"

