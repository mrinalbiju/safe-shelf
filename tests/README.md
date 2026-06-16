# Safe Shelf — end-to-end tests

`e2e.cjs` is a Playwright (headless Chromium) smoke suite over the core flows:
onboarding, profile creation, deterministic verdicts (manual entry), allergen
blocking, cart, tab navigation, and the SVG icon system. The app is local-first,
so these run fully offline — no Supabase/Groq needed.

## Run

```bash
# from the repo root, with a static server on :8932
python3 -m http.server 8932 --directory safe-shelf &
NODE_PATH="$(npm root -g)" BASE=http://localhost:8932 node safe-shelf/tests/e2e.cjs
```

Or let the webapp-testing skill manage the server lifecycle:

```bash
NODE_PATH="$(npm root -g)" python3 .claude/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 8932 --directory safe-shelf" --port 8932 \
  -- node safe-shelf/tests/e2e.cjs
```

Requires Playwright + Chromium available to Node (`NODE_PATH` points at the
global install). Exits non-zero if any check fails.
