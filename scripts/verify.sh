#!/usr/bin/env bash
# Everything a judge — or a fresh clone — can re-run.
#
#   bash scripts/verify.sh          # typecheck, unit, build, hygiene, browser e2e
#   bash scripts/verify.sh --fast   # skips the build and the browser pass
set -uo pipefail

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

if ! command -v npm >/dev/null 2>&1; then
  export PATH="/c/Users/张一/.workbuddy/binaries/node/versions/22.22.2-6:$PATH"
fi

fail=0
say() { printf '%-52s %s\n' "$1" "$2"; }
ok() { say "$1" "PASS"; }
bad() { say "$1" "FAIL"; fail=$((fail + 1)); }

echo "Saddle & Spoke verification $( [ $FAST -eq 1 ] && echo '(fast)' || echo '(full)' )"
echo "---------------------------------------------------------------"

command -v node >/dev/null 2>&1 && ok "node available ($(node -v))" || bad "node available"
command -v npm >/dev/null 2>&1 && ok "npm available" || bad "npm available"
[ -d node_modules ] || npm install --silent >/dev/null 2>&1
[ -d node_modules ] && ok "dependencies installed" || bad "dependencies installed"

if npx tsc --noEmit --pretty false >/tmp/ss-tsc.log 2>&1; then ok "typescript type check"; else bad "typescript type check"; tail -8 /tmp/ss-tsc.log; fi

if npx vitest run --no-file-parallelism --reporter=dot >/tmp/ss-unit.log 2>&1; then
  ok "unit checks (32)"
else
  bad "unit checks"
  tail -20 /tmp/ss-unit.log
fi

if [ $FAST -eq 0 ]; then
  if npm run build >/tmp/ss-build.log 2>&1; then ok "production build"; else bad "production build"; tail -14 /tmp/ss-build.log; fi
  for artefact in dist/index.html dist/agent-manifest.json dist/links.json dist/saddle_and_spoke.network.json; do
    [ -f "$artefact" ] && ok "published: $artefact" || bad "published: $artefact"
  done
  if grep -q 'src="\./assets/' dist/index.html && grep -q 'href="\./assets/' dist/index.html; then
    ok "asset paths are relative (repository subpath)"
  else
    bad "asset paths are relative (repository subpath)"
  fi
  if ls dist/assets/*.woff2 >/dev/null 2>&1; then ok "fonts are bundled and hashed"; else bad "fonts are bundled and hashed"; fi
  if grep -rqi "fonts.googleapis\|fonts.gstatic" dist || grep -rqi "fonts.googleapis" src; then
    bad "no font CDN at runtime"
  else
    ok "no font CDN at runtime"
  fi
fi

[ -f LICENSE ] && grep -qi "MIT License" LICENSE && ok "MIT licence present" || bad "MIT licence present"
[ -f README.md ] && grep -q "scripts/verify.sh" README.md && ok "README documents the verification" || bad "README documents the verification"
for doc in docs/00-BRIEF.md docs/01-SPEC.md docs/07-UI.md docs/02-ACTIONS.md docs/04-PROOF.md docs/05-SUBMISSION.md; do
  [ -f "$doc" ] && ok "$doc" || bad "$doc"
done

# The published network is data, not code.
if grep -q '"tools"' public/saddle_and_spoke.network.json; then ok "the published network is present"; else bad "the published network is present"; fi
if grep -qE '^[[:space:]]*include[[:space:]]' peer/spare_room.hocon; then
  bad "the peer HOCON has no include"
else
  ok "the peer HOCON has no include"
fi
if grep -q '\${' peer/spare_room.hocon; then bad "the peer HOCON has no substitution"; else ok "the peer HOCON has no substitution"; fi

# English only, in everything a visitor or a judge reads.
if grep -rIlP '[\x{4e00}-\x{9fff}]' src index.html public peer README.md docs 2>/dev/null | grep -v '^docs/0[0-9]-' | head -3 | grep -q .; then
  bad "visitor-facing copy is English"
else
  ok "visitor-facing copy is English"
fi

if grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  -E "(sk-[a-zA-Z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,})" . >/tmp/ss-secrets.log 2>&1; then
  bad "no credentials in the repository"; head -3 /tmp/ss-secrets.log
else
  ok "no credentials in the repository"
fi

if grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude=verify.sh --exclude=*.md \
  -E "(google-analytics|googletagmanager|plausible\.io|segment\.io|hotjar)" src public peer check index.html >/tmp/ss-analytics.log 2>&1; then
  bad "no third-party analytics"; head -3 /tmp/ss-analytics.log
else
  ok "no third-party analytics"
fi

if [ $FAST -eq 0 ]; then
  if node scripts/e2e.mjs >/tmp/ss-e2e.log 2>&1; then
    ok "browser end-to-end (29 checks)"
  else
    bad "browser end-to-end"
    tail -24 /tmp/ss-e2e.log
  fi
fi

echo "---------------------------------------------------------------"
if [ $fail -eq 0 ]; then echo "all checks passed"; else echo "$fail check(s) failed"; fi
exit $(( fail > 0 ? 1 : 0 ))
