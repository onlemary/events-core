// =============================================================================
// events-core — per-event_kind message templates
// =============================================================================
// MVP starter set. Easy to extend by:
//   1. Add an entry below.
//   2. The `getDefaultMessage` switch picks it automatically.
// Routed by `event_kind` from the upstream `evaluatePolicy` Decision.
// =============================================================================

import type { EventKind } from '../buffered-event/schemas.js'

const TEMPLATES: Record<EventKind, (org: string, naturalKey: string) => string> = {
  public_key_missing: (org, key) =>
    `⚠️ Pagos con tarjeta desactivados

Tu conexión con MercadoPago quedó incompleta — falta la clave pública para cobrar.

Org: ${org}
Operación: ${key}

Reconectá desde Configuración → Pagos y Cobros.`,
  oauth_refresh_failed: (org, key) =>
    `⚠️ Refresh de OAuth falló

No se pudo refrescar el token de MercadoPago para la org ${org}.

Operación: ${key}

Revisá las credenciales y reintentá.`,
  webhook_signature_invalid: (org, key) =>
    `🔒 Webhook con firma inválida

MercadoPago envió un webhook que no pudimos validar.

Org: ${org}
Operación: ${key}

Esto suele indicar un problema de configuración o un intento no autorizado.`,
  subscription_dunning_locked: (org, key) =>
    `💸 Suscripción bloqueada por mora

La suscripción de un socio quedó bloqueada porque no se pudo cobrar.

Org: ${org}
Operación: ${key}

Contactá al socio para resolver el pago pendiente.`,
}

export function getDefaultMessage(event_kind: string, org: string, natural_key: string): string {
  const tpl = (TEMPLATES as Record<string, (o: string, k: string) => string>)[event_kind]
  return tpl
    ? tpl(org, natural_key)
    : `Evento de tipo "${event_kind}" registrado para la org ${org} (natural_key: ${natural_key}).`
}
