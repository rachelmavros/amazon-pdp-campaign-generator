# PDP Campaign Generator

Amazon product page (clipped with Obsidian Web Clipper) → Google Ads submission doc (.xlsx) in the Abbott SEM submission layout, ready for MLR review.

## Files
- `index.html` — the page: paste clip, review/edit copy with live character counts, download .xlsx
- `api/generate.js` — server function that calls Claude and auto-fixes anything over a character limit
- `vercel.json` — gives the server function up to 300 seconds to run

## Setup (GitHub web UI → Vercel)
1. **GitHub:** New repository (private) → "uploading an existing file" → drag in `index.html`, `vercel.json`, and the `api` folder → Commit.
2. **Anthropic API key:** console.anthropic.com → API Keys → Create key. Add a few dollars of credit under Billing.
3. **Vercel:** Add New → Project → import the repo → Deploy (no build settings needed).
4. **Vercel → Project → Settings → Environment Variables:**
   - `ANTHROPIC_API_KEY` = your key (required)
   - `APP_PASSWORD` = any password (recommended — otherwise anyone with the URL can spend your API credit)
   - `CLAUDE_MODEL` = optional; defaults to `claude-sonnet-5-5`
5. **Redeploy** (Deployments → ⋯ → Redeploy) so the variables take effect.

## Use
1. On the Amazon PDP, clip with Obsidian Web Clipper (copy to clipboard), or save the clip as .md.
2. Paste or drop it into the page. Optionally add competitors or extra instructions.
3. Generate (about 1–3 minutes). Review: red rows are over limit, amber notes are MLR qualifiers.
4. Download .xlsx. "Save JSON" keeps an editable copy you can reopen later with "Open JSON".

## Rules the generator follows
- Claims come only from brand content on the PDP — never from reviews or "Customers say".
- Footnoted/qualified claims are allowed but noted with "MLR:" and the qualifier.
- 3 RSA themes (Brand + 2 Non-Brand), 13–15 headlines (30), 4 descriptions (90), sitelinks (25/35/35), callouts (25).
- Keyword themes: Brand / Non-Brand / Competitor (competitors from the PDP plus any you list).
- Flags catalog problems it notices on the PDP.

To change the rules, edit the `SYSTEM` text at the top of `api/generate.js`.
