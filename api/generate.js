// Vercel serverless function: Amazon PDP clip -> Google Ads submission-doc JSON.
// Needs env var ANTHROPIC_API_KEY. Optional: CLAUDE_MODEL, APP_PASSWORD.

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const API = "https://api.anthropic.com/v1/messages";

const LIMITS = { headline: 30, description: 90, sitelink: 25, sitelinkDesc: 35, callout: 25 };
const len = (s) => [...(s || "")].length; // counts ® and ™ as 1 character, like Google Ads

const SYSTEM = `You write Google Ads search campaign submission documents for Abbott Nutrition brands (Similac, PediaSure, Ensure, Pedialyte, EleCare, Glucerna). The input is a clipped Amazon product detail page (PDP). Every ad will go through Abbott Medical/Legal/Regulatory (MLR) review.

CLAIM RULES (most important)
- Use ONLY claims, numbers, and benefits stated by the brand on the PDP: title, "About this item" bullets, product description, "From the manufacturer"/A+ content, image text, and product details.
- NEVER use claims that appear only in customer reviews, "Customers say", or Q&A. Never invent claims, statistics, or comparisons.
- When a claim carries a footnote, asterisk, or qualifier on the PDP (clinical claims, surveys, "#1 recommended", "non-GMO", immune support nutrient lists, caffeine, "suitable for lactose intolerance", etc.), you may use it, but put the exact qualifier in that item's "note" starting with "MLR:".
- Use a note to cite the PDP source of any non-obvious claim (e.g. "PDP A+ comparison table").
- Keep wording close to the PDP's own phrasing. No superlatives the PDP doesn't make. No pricing amounts or percent discounts.
- Use ® on the brand name the way Abbott does (e.g. PediaSure®, Ensure®, Similac®) in roughly half the headlines that mention the brand; ® and ™ each count as 1 character.

STRUCTURE
- rsa: 3 campaign themes: one Brand theme ("<Product> - Brand") and two Non-Brand themes named by the shopper need (e.g. "Non-Brand - Kids Nutrition Shake", "Non-Brand - Muscle Health").
- Each theme: 13-15 UNIQUE headlines (max ${LIMITS.headline} characters each) and exactly 4 descriptions (max ${LIMITS.description} characters each). Count characters carefully, including spaces and punctuation. Aim for headlines of 15-30 characters and descriptions of 75-90.
- Each theme should include "Shop <Brand>® on Amazon" or "Buy on Amazon" style headlines, since landing pages are Amazon.
- Headlines must work in any combination (Responsive Search Ads); avoid repeating the same claim more than twice within a theme.
- display_url: "www.amazon.com/<brandname lowercase, no spaces or symbols>".
- sitelinks: 4-5. Text max ${LIMITS.sitelink}, d1 and d2 max ${LIMITS.sitelinkDesc} each. Prefer sibling products linked on the PDP (A+ comparison tables, "From the brand") using their real Amazon URLs as https://www.amazon.com/dp/<ASIN>. Otherwise link to the PDP itself.
- callouts: 8-10, max ${LIMITS.callout} characters each.
- keywords: keyword themes named "Brand - <Product>", "Non-Brand - <Need>" (matching the RSA non-brand themes) and one "Competitor - <Brand>" theme per competitor brand that appears on the PDP (e.g. "Frequently bought together", "Consider a similar item"), plus any competitors the user lists. Brand theme: 20-25 keywords including product name, flavor/variant, size/pack, "on amazon", "buy" variants. Non-brand themes: 8-16 each. Competitor themes: 5-8 each. All lowercase, no match-type symbols. Set ad_message to a short label for which ad serves it (e.g. "Grow & Gain ad").
- pdp_issues: list real catalog problems you notice on the PDP that the brand team should fix or confirm (contradictory age ranges, mismatched flavor lists or names, A+ links pointing to a different ASIN, etc.). Empty list if none.

Return everything by calling the submit_campaign tool. All sections are required — especially keywords; never leave keywords empty.`;

const item = { type: "object", properties: { text: { type: "string" }, note: { type: "string" } }, required: ["text"] };
const CAMPAIGN_TOOL = {
  name: "submit_campaign",
  description: "Submit the complete campaign submission document.",
  input_schema: {
    type: "object",
    required: ["product_name", "brand", "asin", "rsa", "sitelinks", "callouts", "keywords", "pdp_issues"],
    properties: {
      product_name: { type: "string" },
      brand: { type: "string" },
      asin: { type: "string" },
      rsa: {
        type: "array",
        items: {
          type: "object",
          required: ["theme", "display_url", "headlines", "descriptions"],
          properties: {
            theme: { type: "string" },
            display_url: { type: "string" },
            headlines: { type: "array", items: item },
            descriptions: { type: "array", items: item },
          },
        },
      },
      sitelinks: {
        type: "array",
        items: {
          type: "object",
          required: ["text", "d1", "d2", "url"],
          properties: { text: { type: "string" }, d1: { type: "string" }, d2: { type: "string" }, url: { type: "string" }, note: { type: "string" } },
        },
      },
      callouts: { type: "array", items: item },
      keywords: {
        type: "array",
        items: {
          type: "object",
          required: ["theme", "ad_message", "keywords"],
          properties: { theme: { type: "string" }, ad_message: { type: "string" }, note: { type: "string" }, keywords: { type: "array", items: { type: "string" } } },
        },
      },
      pdp_issues: { type: "array", items: { type: "string" } },
    },
  },
};

const KEYWORD_TOOL = {
  name: "submit_keywords",
  description: "Submit the keyword themes for the campaign.",
  input_schema: { type: "object", required: ["keywords"], properties: { keywords: CAMPAIGN_TOOL.input_schema.properties.keywords } },
};

const FIX_TOOL = {
  name: "submit_fixes",
  description: "Submit replacement text for the listed over-limit items.",
  input_schema: {
    type: "object",
    required: ["fixes"],
    properties: {
      fixes: {
        type: "array",
        items: { type: "object", required: ["path", "text"], properties: { path: { type: "string" }, text: { type: "string" } } },
      },
    },
  },
};

// Returns [{path, text, limit, length}]
function findViolations(doc) {
  const v = [];
  const chk = (path, text, limit) => { if (len(text) > limit) v.push({ path, text, limit, length: len(text) }); };
  (doc.rsa || []).forEach((t, i) => {
    (t.headlines || []).forEach((h, j) => chk(`rsa[${i}].headlines[${j}]`, h.text, LIMITS.headline));
    (t.descriptions || []).forEach((d, j) => chk(`rsa[${i}].descriptions[${j}]`, d.text, LIMITS.description));
  });
  (doc.sitelinks || []).forEach((s, i) => {
    chk(`sitelinks[${i}].text`, s.text, LIMITS.sitelink);
    chk(`sitelinks[${i}].d1`, s.d1, LIMITS.sitelinkDesc);
    chk(`sitelinks[${i}].d2`, s.d2, LIMITS.sitelinkDesc);
  });
  (doc.callouts || []).forEach((c, i) => chk(`callouts[${i}]`, c.text, LIMITS.callout));
  return v;
}

function applyFix(doc, path, text) {
  let m;
  if ((m = path.match(/^rsa\[(\d+)\]\.(headlines|descriptions)\[(\d+)\]$/))) {
    const it = doc.rsa?.[+m[1]]?.[m[2]]?.[+m[3]]; if (it) it.text = text;
  } else if ((m = path.match(/^sitelinks\[(\d+)\]\.(text|d1|d2)$/))) {
    const it = doc.sitelinks?.[+m[1]]; if (it) it[m[2]] = text;
  } else if ((m = path.match(/^callouts\[(\d+)\]$/))) {
    const it = doc.callouts?.[+m[1]]; if (it) it.text = text;
  }
}

async function callClaude(body) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${data?.error?.message || JSON.stringify(data)}`);
  return data;
}
const toolInput = (resp, name) => resp.content?.find((c) => c.type === "tool_use" && c.name === name)?.input;

// Some models don't allow forcing a specific tool, so we ask nicely ("auto"),
// accept JSON in plain text as a fallback, and nudge once if neither came back.
function jsonFromText(resp) {
  const t = (resp.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}
async function callForTool({ tool, maxTokens, userText }) {
  const messages = [{ role: "user", content: `${userText}\n\nRespond only by calling the ${tool.name} tool.` }];
  const base = { model: MODEL, max_tokens: maxTokens, system: SYSTEM, tools: [tool], tool_choice: { type: "auto" } };
  let resp = await callClaude({ ...base, messages });
  let out = toolInput(resp, tool.name) || jsonFromText(resp);
  if (out) return out;
  if (resp.stop_reason === "max_tokens") throw new Error("Claude ran out of room before finishing. Try again, or shorten the clip.");
  messages.push({ role: "assistant", content: resp.content }, { role: "user", content: `Call the ${tool.name} tool now with the complete result.` });
  resp = await callClaude({ ...base, messages });
  return toolInput(resp, tool.name) || jsonFromText(resp);
}

async function generate({ clip, competitors, instructions }) {
  let user = `Here is the clipped Amazon PDP:\n\n<pdp>\n${clip}\n</pdp>`;
  if (competitors) user += `\n\nAlso add Competitor keyword themes for: ${competitors}`;
  if (instructions) user += `\n\nAdditional instructions from the marketer: ${instructions}`;

  const doc = await callForTool({ tool: CAMPAIGN_TOOL, maxTokens: 16000, userText: user });
  if (!doc || !Array.isArray(doc.rsa)) throw new Error("Claude did not return a campaign. Try again.");
  doc.sitelinks ||= []; doc.callouts ||= []; doc.keywords ||= []; doc.pdp_issues ||= [];

  // Safety net: long outputs sometimes drop the keyword section. Ask for it on its own.
  const kwCount = doc.keywords.reduce((a, g) => a + (g.keywords?.length || 0), 0);
  if (kwCount < 10) {
    const themes = doc.rsa.map((t) => t.theme).join("; ");
    const kw = await callForTool({
      tool: KEYWORD_TOOL, maxTokens: 6000,
      userText: `${user}\n\nThe ad copy is already written. Its RSA campaign themes are: ${themes}.\nNow write ONLY the keyword themes, following the keyword rules: a Brand theme, one Non-Brand theme matching each Non-Brand RSA theme, and Competitor themes.`,
    });
    if (kw?.keywords?.length) doc.keywords = kw.keywords;
  }

  // Up to 2 rounds of targeted fixes for anything over a character limit.
  for (let round = 0; round < 2; round++) {
    const v = findViolations(doc);
    if (!v.length) break;
    const list = v.map((x) => `${x.path} (${x.length}/${x.limit} chars): ${x.text}`).join("\n");
    const fix = await callForTool({
      tool: FIX_TOOL, maxTokens: 4000,
      userText: `These ad assets are over their Google Ads character limits. Rewrite each one to fit its limit (count every character, ® and ™ count as 1) while keeping the same claim and PDP wording. Do not add new claims. Use the exact path shown for each item.\n\n${list}`,
    });
    (fix?.fixes || []).forEach((f) => applyFix(doc, f.path, f.text));
  }
  doc.violations = findViolations(doc);
  doc.model = MODEL;
  return doc;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel environment variables." });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (process.env.APP_PASSWORD && body.password !== process.env.APP_PASSWORD) return res.status(401).json({ error: "Wrong password." });
    const clip = (body.clip || "").trim();
    if (clip.length < 200) return res.status(400).json({ error: "Paste the full page clip first." });
    const t0 = Date.now();
    const doc = await generate({ clip: clip.slice(0, 80000), competitors: body.competitors, instructions: body.instructions });
    doc.seconds = Math.round((Date.now() - t0) / 1000);
    res.status(200).json(doc);
  } catch (e) {
    console.error("generate failed:", e);
    res.status(500).json({ error: e.message || String(e) });
  }
};
module.exports.findViolations = findViolations;
module.exports.applyFix = applyFix;
module.exports.generate = generate;
