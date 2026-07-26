# RUNBOOK — Publish `@onlemary/events-core@0.1.0` to GitHub Packages

> **Quién corre esto:** un humano con `NODE_AUTH_TOKEN` GitHub + write access al repo `onlemary/events-core` (o el org donde vive el paquete).
> **Cuándo correr:** después de Phase 0 cerrada y validada (lo que ya pasó), antes de Phase 2 implementación end-to-end.
> **Riesgo:** tag + push al repo + publish al registry. **Irreversible** en parte: una vez publicado, no se borra (solo se deprecatea).
> **Reversibilidad parcial:** el git tag se puede borrar (`git tag -d events-core@0.1.0`), pero el publish a `npm.pkg.github.com` NO se puede borrar después de 24h.

---

## Pre-publish checks (automatizados, correr primero)

```bash
cd /home/mauriu2026/Escritorio/membreisa_310326/packages/events-core

# 1. Variables de entorno necesarias
export EVENTS_CORE_DB_URL=postgres://publish-placeholder@localhost:5432/events_core_db_for_publish
# Esto es solo para que prisma generate no falle en el build; el publish al registry no usa la DB.

# 2. Build
pnpm build
# Espera: 'dist/' poblado, 'prisma generate' OK.

# 3. Typecheck
pnpm typecheck
# Espera: 0 errors.

# 4. Tests
pnpm test -- --reporter=basic
# Espera: 6/6 PBT verdes + 4/4 integration verdes.

# 5. Dry-run publish (simula lo que va a subir al registry)
EVENTS_CORE_DB_URL=postgres://publish-placeholder@localhost:5432/events_core_db_for_publish \
  npm publish --dry-run --registry=https://npm.pkg.github.com
# Espera: "npm notice total files: 56" (NUNCA 60+). Esto verifica:
#   - 56 archivos en el tarball
#   - 'tests/' y 'node_modules/' NO están (excluidos)
#   - 'dist/', 'prisma/', 'README.md', 'CHANGELOG.md', '.env.events-core.example' están
#   - 'package.json' apunta a registry correcto
```

Si alguno de los 5 falla, **ABORTAR** y revisar qué se rompió.

## 1. Configurar auth (GitHub PAT)

### 1.1. Crear PAT

1. Ir a https://github.com/settings/tokens
2. **Generate new token** → **classic** (NO fine-grained; classic soporta `write:packages` directamente).
3. Scopes necesarios:
   - `write:packages` (escribir al registry)
   - `read:packages` (validar)
   - `repo` (para push tag al repo si está en scope org-private)
4. **NO** agregar `admin:org` u otros scopes innecesarios.
5. Expiration: 90 días (default razonable). Rotar antes del venc.

### 1.2. Configurar `.npmrc` local

Crea `packages/events-core/.npmrc.local` (NO commitear; en `.gitignore`):

```ini
; auth para GitHub Packages
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
registry=https://npm.pkg.github.com
always-auth=true
```

Alternativa: set la env var global:

```bash
export NODE_AUTH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
# (tu PAT)
```

### 1.3. Validar auth

```bash
npm whoami --registry=https://npm.pkg.github.com
# Espera: tu username GitHub (no error).
```

Si falla: error 401. Re-chequear el token + scopes.

## 2. Tag git y push

### 2.1. Tag LOCAL (esto sí corre aquí)

```bash
cd /home/mauriu2026/Escritorio/membreisa_310326
git tag -a events-core@0.1.0 -m "Events-core v0.1.0: initial release

Phase 0 closed. 14 requirements implemented. 4 vital event_kinds seeded.
Multi-tenant by construction. DispatchFn injectable (zero coupling to notifier-core).

See CHANGELOG.md for release notes."
```

### 2.2. Push del tag

```bash
# MANUAL — el humano corre esto con credenciales propias
git push origin events-core@0.1.0
# Espera: tag pushed al remote. Ver en https://github.com/onlemary/events-core/tags
```

## 3. Publish al registry

### 3.1. Run publish

```bash
cd /home/mauriu2026/Escritorio/membreisa_310326/packages/events-core

# (NODE_AUTH_TOKEN debe estar seteada en este shell)
npm publish --registry=https://npm.pkg.github.com
# Espera: "+ @onlemary/events-core@0.1.0" en output.
# Tarda ~30s.
```

### 3.2. Validar publish

```bash
# Listar versión publicada
npm view @onlemary/events-core@0.1.0 --registry=https://npm.pkg.github.com
# Espera: object con metadata correcta, dist.tarball URL apuntando a github.

# Listar archivos en el tarball público
curl -sL "https://npm.pkg.github.com/@onlemary/events-core/-/@onlemary/events-core-0.1.0.tgz" \
  -H "Authorization: Bearer $NODE_AUTH_TOKEN" | tar -tz | head -20
# Espera: listado de archivos distilled, NO incluye 'tests/' ni 'node_modules/'.
```

## 4. Smoke install

### 4.1. Sandbox project

```bash
cd /home/mauriu2026/Escritorio/membreisa_310326
bash scripts-v2/smoke-install-events-core.sh
```

Este script:
1. Crea `tmp/publish-smoke/` con package.json mínimo que requiere `@onlemary/events-core: 0.1.0`.
2. Corre `pnpm install` desde el sandbox.
3. Verifica que el resolve viene del registry (NO del symlink local).
4. Verifica que `node_modules/@onlemary/events-core/` está presente.
5. Verifica que un import simple (`const ev = require('@onlemary/events-core')`) funciona.
6. Verifica que el `bin events-core-db-setup` corre sin error.

Stop conditions:
- ✅ Si los 5 checks verde → publish exitoso.
- ❌ Si alguno falla → re-rollback (`npm deprecate @onlemary/events-core@0.1.0`) y diagnosticar.

### 4.2. Cleanup del sandbox

```bash
rm -rf tmp/publish-smoke/
```

## 5. Post-publish (para Phase 2)

Una vez publicado, `gym/apps/admin/` puede instalar `@onlemary/events-core: "latest"` vía:

```bash
# (después de Phase 2 implementación)
cd /home/mauriu2026/Escritorio/membreisa_310326/gym
# El package.json ya tiene "@onlemary/events-core": "latest" en dependencies
pnpm install --filter @apps/admin
```

Si `latest` no resuelve (porque registry no permite `latest` para paquetes privados), bumpear manualmente a `"0.1.0"` en el `package.json` y bumpear cuando salga 0.1.1, etc. **Workaround**: usar exact pin o dist-tag (`"@onlemary/events-core": "npm:@onlemary/events-core@0.1.0"`).

---

## Rollback si algo salió mal

```bash
# 1. Deprecate la versión publicada (no se puede borrar después de 24h)
npm deprecate @onlemary/events-core@0.1.0 "broken release, use 0.1.1" \
  --registry=https://npm.pkg.github.com

# 2. Borrar tag local
git tag -d events-core@0.1.0

# 3. Borrar tag remote (si ya se pusheó)
git push --delete origin events-core@0.1.0
```

---

## Resumen

| Step | Comando | Reversibilidad |
|------|---------|----------------|
| Pre-check | `pnpm build && typecheck && test && dry-run` | total |
| Auth | `.npmrc.local` + NODE_AUTH_TOKEN | total (no commits) |
| Local tag | `git tag -a events-core@0.1.0` | total (`git tag -d`) |
| Push tag | `git push origin events-core@0.1.0` | reversible (`git push --delete`) |
| Publish | `npm publish --registry=...` | IRREVERSIBLE post-24h |
| Validate | `npm view` + smoke install | total |
| Rollback | `npm deprecate` + `git tag -d` + `git push --delete` | parcial |

---

**Tiempo total:** ~10-15 minutos para alguien con las credenciales listas.
**Tiempo bloqueo Phase 2:** hasta que se corra este RUNBOOK entero.
