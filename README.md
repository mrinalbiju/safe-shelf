# 🛡️ Safe Shelf

**Scan smarter. Shop safer.** A mobile-first web app based on the *Safe Shelf* SRS (Team 01, UST Internship) — allergen & health-aware product checking for individuals, families, and group purchases.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Parallax marketing homepage (scroll + pointer/gyro parallax, scroll-reveal) |
| `app.html` | The main app — profiles, product checking, group buys |

## Features

- **Multi-user profiles** — each person gets their own allergens (FDA Big 9 + EU 14), illnesses (diabetes, hypertension, CKD, celiac, …), lifestyle preferences and budget. Stored on-device in `localStorage` (no backend, per SRS NFR-2.1 "on-device health data").
- **Product checking** — three input modes:
  - *Demo shelf* — 16 built-in products with realistic nutrition data
  - *Barcode lookup* — live Open Food Facts API (FR-5.1)
  - *Manual entry* — type what's on the label (FR-1.12 not-found fallback)
- **Evaluation engine** (simplified from the SRS):
  - Presence-based allergen matching with an **Ingredient Alias Dictionary** ("sodium caseinate" → dairy, "albumin" → egg, …) (FR-1.9/1.10)
  - Threshold-based condition rules per 100g (ADA/AHA/NKF/WHO-derived) (FR-1.8)
  - **Most Restrictive Rule Precedence** when conditions conflict on the same nutrient (FR-11.2)
  - Lifestyle conflicts surface as *partial suitability* (caution), medical failures as *unsuitable* (FR-2.7)
- **Group purchases** (FR-2.8–2.11) — pool 2+ profiles into a group session:
  - Every check returns a **per-member breakdown** + aggregate verdict — no cross-profile averaging
  - **🔒 Locked parameters**: inside a group, member allergens/illnesses are read-only. Only the profile's owner (acting as that user) can edit their own profile; edits sync into the group instantly
  - Shared group cart with an aggregate suitability summary (FR-8.4)
- **Mobile-first** — bottom tab navigation, bottom-sheet modals, safe-area insets, works great in a phone browser.

## Run locally

It's a zero-build static site:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to Vercel

1. Import this repository at [vercel.com/new](https://vercel.com/new)
2. Framework preset: **Other** — no build command, no output directory, no root-directory changes
3. Deploy — done.

Or with the CLI: `npx vercel --prod`

## Disclaimer

All outputs are **dietary goal alignment**, not medical advice or diagnosis (SRS NFR-5.1/5.2). Always verify physical labels for life-threatening allergies.
