#!/usr/bin/env bash
# =============================================================================
# up-version.sh — Actualizador centralizado de versiones para Keyme
#
# Uso:
#   ./up-version.sh 1.3.0          # Pasando la versión por parámetro
#   ./up-version.sh                # Sugiere la siguiente y pide confirmarla (Y/n)
#   ./up-version.sh --rollback     # Deshace la última subida (pide confirmar)
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
#
# Rollback (--rollback), por si te equivocaste de versión:
#   - Devuelve todos los archivos a la versión anterior del CHANGELOG y pasa
#     las notas de la última sección de vuelta a [Unreleased].
#   - Se niega si existe el tag vX.Y.Z (ya se publicó), si la versión actual
#     no es la última sección del CHANGELOG o si [Unreleased] tiene notas
#     nuevas (no las mezcla con las de la versión deshecha).
#   - También es todo o nada. Después vuelves a subir con la versión correcta.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEW_VERSION="${1:-}"
MODE="bump"

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

if [[ "$NEW_VERSION" == "--rollback" ]]; then
  MODE="rollback"
  NEW_VERSION=""
  CURRENT="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT_DIR/apps/web/package.json")"
  if git -C "$ROOT_DIR" rev-parse -q --verify "refs/tags/v$CURRENT" > /dev/null; then
    echo "❌ Error: el tag v$CURRENT ya existe; esa versión se publicó y no se deshace con este script." >&2
    exit 1
  fi
  echo -n "↩️  ¿Deshacer la versión $CURRENT y devolver sus notas a [Unreleased]? [y/N]: "
  read -r ANSWER
  if [[ ! "$ANSWER" =~ ^[YySs]$ ]]; then
    echo "Cancelado: no se modificó ningún archivo."
    exit 0
  fi
fi

if [[ "$MODE" == "bump" && -z "$NEW_VERSION" ]]; then
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

if [[ "$MODE" == "bump" && -z "$NEW_VERSION" ]]; then
  echo -n "Ingresa la nueva versión (ej. 1.3.0): "
  read -r NEW_VERSION
fi

# Elimina 'v' o 'V' inicial y espacios en blanco
NEW_VERSION="${NEW_VERSION#v}"
NEW_VERSION="${NEW_VERSION#V}"
NEW_VERSION="$(echo -e "${NEW_VERSION}" | tr -d '[:space:]')"

# Validar formato SemVer (ej. 1.3.0 o 1.3.0-rc.1)
if [[ "$MODE" == "bump" && ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
  echo "❌ Error: La versión '$NEW_VERSION' no cumple con el formato SemVer (ej. 1.3.0 o 1.3.0-rc.1)." >&2
  exit 1
fi

if [[ "$MODE" == "bump" ]]; then
  echo "🚀 Actualizando Keyme a la versión $NEW_VERSION..."
else
  echo "↩️  Deshaciendo la versión $CURRENT..."
fi

python3 - "$ROOT_DIR" "$MODE" "$NEW_VERSION" << 'EOF'
import json
import re
import sys
from datetime import date
from pathlib import Path

root = Path(sys.argv[1]).resolve()
mode = sys.argv[2]           # "bump" o "rollback"
new_version = sys.argv[3]    # vacío en rollback: se calcula del CHANGELOG
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

changelog = root / "CHANGELOG.md"
content = changelog.read_text(encoding="utf-8")
# Desde "## [Unreleased]" hasta el siguiente "## [" (o el final).
unreleased = re.search(r"^##\s*\[Unreleased\][ \t]*\n(.*?)(?=^##\s*\[|\Z)", content, re.MULTILINE | re.DOTALL)

if mode == "rollback":
    # La última versión (justo después de [Unreleased]) y la anterior, a la que se vuelve.
    sections = list(re.finditer(r"^##\s*\[(\d[^\]]*)\][^\n]*\n", content, re.MULTILINE))
    if not unreleased:
        problems.append("CHANGELOG.md no tiene sección ## [Unreleased]")
    elif unreleased.group(1).strip():
        problems.append("[Unreleased] tiene notas nuevas: muévelas o bórralas antes de deshacer")
    elif len(sections) < 2:
        problems.append("CHANGELOG.md no tiene una versión anterior a la cual volver")
    elif sections[0].group(1) != current:
        problems.append(f"La última sección del CHANGELOG es [{sections[0].group(1)}], no la actual ({current})")
    else:
        new_version = sections[1].group(1)
    if problems:
        new_version = current  # Solo para que los pasos 1-4 no fallen; nada se escribe.
elif new_version == current:
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
if mode == "rollback":
    if not problems:
        # Las notas de la versión deshecha vuelven a [Unreleased], sin su encabezado.
        body = content[sections[0].end(): sections[1].start()].strip("\n")
        pending[changelog] = content[: unreleased.start()] + f"## [Unreleased]\n\n{body}\n\n" + content[sections[1].start():]
elif re.search(rf"^##\s*\[{re.escape(new_version)}\]", content, re.MULTILINE):
    problems.append(f"CHANGELOG.md ya tiene una sección [{new_version}]")
else:
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
if [[ "$MODE" == "bump" ]]; then
  echo "✨ Versión $NEW_VERSION aplicada correctamente en todos los archivos."
else
  echo "✨ Versión $CURRENT deshecha: sus notas volvieron a [Unreleased]."
fi
echo "💡 Recuerda revisar los cambios con 'git diff' antes de hacer commit."
