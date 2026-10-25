#!/usr/bin/env bash
# =============================================================================
# up-version.sh — Actualizador centralizado de versiones para Keyme
#
# Uso:
#   ./up-version.sh 1.3.0          # Pasando la versión por parámetro
#   ./up-version.sh                # Sugiere la siguiente y pide confirmarla (Y/n)
#
# Sugerencia (según lo que hay en [Unreleased]):
#   - Menciona "breaking"/"incompatible"          → major (2.0.0)
#   - Trae Added, Changed, Deprecated o Removed   → minor (1.6.0)
#   - Solo Fixed/Security                         → patch (1.5.1)
#   - La actual es pre-release (1.6.0-rc.1)       → su versión final (1.6.0)
# Con "n" se pide la versión a mano.
#
# Archivos actualizados:
#   - apps/web/package.json          versión de la PWA (la que muestra Ajustes › App)
#   - packages/crypto/package.json   versión de @keyme/crypto
#   - packages/models/package.json   versión de @keyme/models
#   - package-lock.json              entradas de los tres workspaces
#   - apps/api/config/keyme.php      versión que anuncia /api/v1/status
#   - README.md                      "Versión actual"
#   - CHANGELOG.md                   versiona lo escrito en [Unreleased]
#
# Es todo o nada: primero calcula el contenido nuevo de TODOS los archivos y
# solo si ninguno falla los escribe. Una subida a medias (la PWA en una
# versión y la API en otra) es peor que no subir.
#
# Reglas:
#   - La versión debe ser SemVer y mayor que la actual (apps/web/package.json).
#   - [Unreleased] debe tener contenido: sin notas no hay nada que liberar.
#   - En CHANGELOG, el contenido de [Unreleased] pasa tal cual a
#     "## [X.Y.Z] - AAAA-MM-DD" y [Unreleased] queda vacío para lo siguiente.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEW_VERSION="${1:-}"

# Sugiere la siguiente versión a partir de la actual (apps/web/package.json) y
# de lo que hay en [Unreleased]. Imprime "versión|motivo", o nada si no puede.
suggest_version() {
  python3 - "$ROOT_DIR" << 'EOF'
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
try:
    current = json.loads((root / "apps" / "web" / "package.json").read_text(encoding="utf-8"))["version"]
    changelog = (root / "CHANGELOG.md").read_text(encoding="utf-8")
except (OSError, KeyError, ValueError):
    sys.exit(0)

match = re.match(r"^(\d+)\.(\d+)\.(\d+)(-.+)?$", current)
unreleased = re.search(r"^##\s*\[Unreleased\][ \t]*\n(.*?)(?=^##\s*\[|\Z)", changelog, re.MULTILINE | re.DOTALL)
if not match or not unreleased or not unreleased.group(1).strip():
    sys.exit(0)

major, minor, patch = (int(part) for part in match.group(1, 2, 3))
body = unreleased.group(1)
sections = {name.lower(): name for name in re.findall(r"^###\s*(\w+)", body, re.MULTILINE)}
minor_kinds = [sections[kind] for kind in ("added", "changed", "deprecated", "removed") if kind in sections]

if match.group(4):
    # Un pre-release (1.5.0-rc.1) se libera como su versión final.
    version, reason = f"{major}.{minor}.{patch}", f"la actual es pre-release ({current})"
elif re.search(r"breaking|incompatible", body, re.IGNORECASE):
    version, reason = f"{major + 1}.0.0", "[Unreleased] menciona un cambio incompatible"
elif minor_kinds:
    version, reason = f"{major}.{minor + 1}.0", f"[Unreleased] trae {', '.join(minor_kinds)}"
else:
    version, reason = f"{major}.{minor}.{patch + 1}", "[Unreleased] solo trae correcciones"

print(f"{version}|{current} → {version}: {reason}")
EOF
}

if [[ -z "$NEW_VERSION" ]]; then
  SUGGESTION="$(suggest_version)"
  if [[ -n "$SUGGESTION" ]]; then
    echo "💡 Sugerencia: ${SUGGESTION#*|}"
    echo -n "¿Usar ${SUGGESTION%%|*}? [Y/n]: "
    read -r ANSWER
    if [[ -z "$ANSWER" || "$ANSWER" =~ ^[YySs]$ ]]; then
      NEW_VERSION="${SUGGESTION%%|*}"
    fi
  fi
fi

if [[ -z "$NEW_VERSION" ]]; then
  echo -n "Ingresa la nueva versión (ej. 1.3.0): "
  read -r NEW_VERSION
fi

# Elimina 'v' o 'V' inicial y espacios en blanco
NEW_VERSION="${NEW_VERSION#v}"
NEW_VERSION="${NEW_VERSION#V}"
NEW_VERSION="$(echo -e "${NEW_VERSION}" | tr -d '[:space:]')"

# Validar formato SemVer (ej. 1.3.0 o 1.3.0-rc.1)
if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
  echo "❌ Error: La versión '$NEW_VERSION' no cumple con el formato SemVer (ej. 1.3.0 o 1.3.0-rc.1)." >&2
  exit 1
fi

echo "🚀 Actualizando Keyme a la versión $NEW_VERSION..."

python3 - "$ROOT_DIR" "$NEW_VERSION" << 'EOF'
import json
import re
import sys
from datetime import date
from pathlib import Path

root = Path(sys.argv[1]).resolve()
new_version = sys.argv[2]
today = date.today().isoformat()

pending: dict[Path, str] = {}   # archivo -> contenido nuevo
problems: list[str] = []


def rel(path: Path) -> str:
    return str(path.relative_to(root))


def core(version: str) -> tuple[int, int, int]:
    return tuple(int(part) for part in version.split("-", 1)[0].split("."))


def replace(path: Path, pattern: str, replacement: str, expected: int, flags: int = 0) -> None:
    """Sustituye en `path` y exige encontrar exactamente `expected` coincidencias."""
    if not path.is_file():
        problems.append(f"No existe {rel(path)}")
        return
    content = pending.get(path, path.read_text(encoding="utf-8"))
    new_content, count = re.subn(pattern, replacement, content, flags=flags)
    if count != expected:
        problems.append(f"{rel(path)}: se esperaban {expected} coincidencia(s) y hubo {count}")
        return
    pending[path] = new_content


def package_version(name: str) -> str:
    """Patrón del par "name"/"version" de un paquete en package.json o en el lockfile."""
    return rf'("name":\s*"{re.escape(name)}",\s*\n\s*"version":\s*")[^"]*(")'


# ── Versión actual ──────────────────────────────────────────────────────────
web_package = root / "apps" / "web" / "package.json"
current = json.loads(web_package.read_text(encoding="utf-8"))["version"]

if new_version == current:
    problems.append(f"La versión {new_version} ya es la actual")
elif core(new_version) < core(current):
    problems.append(f"La versión {new_version} es menor que la actual ({current})")

# ── 1. package.json de cada workspace ───────────────────────────────────────
workspaces = {
    "@keyme/web": root / "apps" / "web" / "package.json",
    "@keyme/crypto": root / "packages" / "crypto" / "package.json",
    "@keyme/models": root / "packages" / "models" / "package.json",
}
for name, path in workspaces.items():
    replace(path, package_version(name), rf"\g<1>{new_version}\g<2>", expected=1)

# ── 2. package-lock.json (una entrada por workspace) ────────────────────────
for name in workspaces:
    replace(root / "package-lock.json", package_version(name), rf"\g<1>{new_version}\g<2>", expected=1)

# ── 3. apps/api/config/keyme.php (lo que anuncia /api/v1/status) ────────────
replace(
    root / "apps" / "api" / "config" / "keyme.php",
    r"('version'\s*=>\s*env\('KEYME_VERSION',\s*')[^']*(')",
    rf"\g<1>{new_version}\g<2>",
    expected=1,
)

# ── 4. README.md ────────────────────────────────────────────────────────────
replace(root / "README.md", r"(- Versión actual:\s*\*\*)[^*]+(\*\*)", rf"\g<1>{new_version}\g<2>", expected=1)

# ── 5. CHANGELOG.md ─────────────────────────────────────────────────────────
changelog = root / "CHANGELOG.md"
content = changelog.read_text(encoding="utf-8")

if re.search(rf"^##\s*\[{re.escape(new_version)}\]", content, re.MULTILINE):
    problems.append(f"CHANGELOG.md ya tiene una sección [{new_version}]")
else:
    # Desde "## [Unreleased]" hasta el siguiente "## [" (o el final).
    unreleased = re.search(r"^##\s*\[Unreleased\][ \t]*\n(.*?)(?=^##\s*\[|\Z)", content, re.MULTILINE | re.DOTALL)
    if not unreleased:
        problems.append("CHANGELOG.md no tiene sección ## [Unreleased]")
    elif not unreleased.group(1).strip():
        problems.append("[Unreleased] está vacío: escribe las notas del release antes de versionar")
    else:
        body = unreleased.group(1).strip("\n")
        # Mismo formato que el resto de secciones: encabezado, línea en blanco,
        # contenido, línea en blanco antes de la siguiente sección.
        section = f"## [Unreleased]\n\n## [{new_version}] - {today}\n\n{body}\n\n"
        pending[changelog] = content[: unreleased.start()] + section + content[unreleased.end():]

# ── Escribir todo o nada ────────────────────────────────────────────────────
if problems:
    print("❌ No se modificó ningún archivo:", file=sys.stderr)
    for problem in problems:
        print(f"   - {problem}", file=sys.stderr)
    sys.exit(1)

for path, new_content in pending.items():
    path.write_text(new_content, encoding="utf-8")
    print(f"  ✓ {rel(path)}")

print(f"\n  {current} → {new_version}")
EOF

echo ""
echo "✨ Versión $NEW_VERSION aplicada correctamente en todos los archivos."
echo "💡 Recuerda revisar los cambios con 'git diff' antes de hacer commit."
