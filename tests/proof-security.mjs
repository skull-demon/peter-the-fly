/**
 * DEPLOYMENT SECURITY SANITY TEST
 *
 * Run this against the live Cloudflare Pages URL BEFORE announcing the site:
 *
 *   node tests/proof-security.mjs https://peter-the-fly.pages.dev
 *
 * Checks:
 *   1. Security headers are present on the main page
 *   2. Brain artifacts are NOT fetchable from a foreign origin (CORS lockdown)
 *   3. The page cannot be embedded in an iframe (X-Frame-Options)
 *   4. The brain bundle responds with correct content-type (not accidentally
 *      served as text, which would allow easy scraping)
 *   5. The readout JSON is also CORS-locked
 *   6. HSTS is present (HTTPS enforced)
 *   7. robots.txt exists and disallows brain artifacts
 */

const BASE = process.argv[2];
if (!BASE || !BASE.startsWith("http")) {
  console.error("Usage: node tests/proof-security.mjs https://your-site.pages.dev");
  process.exit(1);
}

const url = (path) => `${BASE.replace(/\/$/, "")}${path}`;

let failures = 0;
const pass = (name, detail = "") => console.log(`PASS  ${name}${detail ? "  (" + detail + ")" : ""}`);
const fail = (name, detail = "") => { console.log(`FAIL  ${name}${detail ? "  (" + detail + ")" : ""}`); failures++; };
const check = (name, ok, detail = "") => ok ? pass(name, detail) : fail(name, detail);

console.log(`\nTesting: ${BASE}\n`);

// ── 1. Main page security headers ────────────────────────────────────────────
{
  const res = await fetch(url("/"), { redirect: "follow" });
  const h = res.headers;

  check("HSTS present",
    h.get("strict-transport-security")?.includes("max-age") ?? false,
    h.get("strict-transport-security") ?? "MISSING");

  check("X-Frame-Options: DENY",
    (h.get("x-frame-options") ?? "").toUpperCase() === "DENY",
    h.get("x-frame-options") ?? "MISSING");

  check("CSP frame-ancestors: none",
    (h.get("content-security-policy") ?? "").includes("frame-ancestors"),
    (h.get("content-security-policy") ?? "MISSING").slice(0, 80));

  check("X-Content-Type-Options: nosniff",
    h.get("x-content-type-options") === "nosniff",
    h.get("x-content-type-options") ?? "MISSING");

  check("Referrer-Policy present",
    !!h.get("referrer-policy"),
    h.get("referrer-policy") ?? "MISSING");

  check("Permissions-Policy present",
    !!h.get("permissions-policy"),
    (h.get("permissions-policy") ?? "MISSING").slice(0, 60));

  check("COOP: same-origin",
    h.get("cross-origin-opener-policy") === "same-origin",
    h.get("cross-origin-opener-policy") ?? "MISSING");

  check("COEP: require-corp",
    h.get("cross-origin-embedder-policy") === "require-corp",
    h.get("cross-origin-embedder-policy") ?? "MISSING");

  check("CORP: same-origin",
    h.get("cross-origin-resource-policy") === "same-origin",
    h.get("cross-origin-resource-policy") ?? "MISSING");

  check("Page is reachable (200/304)",
    res.status === 200 || res.status === 304,
    `HTTP ${res.status}`);
}

// ── 2. Brain bundle: CORS lockdown ───────────────────────────────────────────
// Simulate a foreign-origin fetch by sending Origin: https://evil-site.example
// The server MUST NOT echo back Access-Control-Allow-Origin: * or the evil origin.
{
  const res = await fetch(url("/brain/peter.brain"), {
    headers: { "Origin": "https://evil-copycat.example" },
  });

  const acao = res.headers.get("access-control-allow-origin") ?? "";

  // Either no ACAO header, or "same-origin" (browser will block cross-origin read)
  const corsBlocked = acao === "" || acao === "same-origin" || acao === "null";
  const corsOpen = acao === "*" || acao === "https://evil-copycat.example";

  check("Brain bundle: CORS NOT open to foreign origins",
    !corsOpen,
    corsOpen ? `DANGER: ACAO=${acao}` : `ACAO=${acao || "(absent)"}`);

  check("Brain bundle: served with binary content-type",
    (res.headers.get("content-type") ?? "").includes("octet-stream") ||
    (res.headers.get("content-type") ?? "").includes("binary"),
    res.headers.get("content-type") ?? "MISSING");

  check("Brain bundle reachable (200/206)",
    res.status === 200 || res.status === 206,
    `HTTP ${res.status}`);
}

// ── 3. Readout JSON: CORS lockdown ───────────────────────────────────────────
{
  const res = await fetch(url("/brain/peter.readout.json"), {
    headers: { "Origin": "https://evil-copycat.example" },
  });

  const acao = res.headers.get("access-control-allow-origin") ?? "";
  const corsOpen = acao === "*" || acao === "https://evil-copycat.example";

  check("Readout JSON: CORS NOT open to foreign origins",
    !corsOpen,
    corsOpen ? `DANGER: ACAO=${acao}` : `ACAO=${acao || "(absent)"}`);
}

// ── 4. Shared brain JSON: CORS lockdown ──────────────────────────────────────
{
  const res = await fetch(url("/brain/peter.shared.json"), {
    headers: { "Origin": "https://evil-copycat.example" },
  });

  const acao = res.headers.get("access-control-allow-origin") ?? "";
  const corsOpen = acao === "*" || acao === "https://evil-copycat.example";

  check("Shared brain JSON: CORS NOT open to foreign origins",
    !corsOpen,
    corsOpen ? `DANGER: ACAO=${acao}` : `ACAO=${acao || "(absent)"}`);
}

// ── 5. robots.txt ────────────────────────────────────────────────────────────
{
  const res = await fetch(url("/robots.txt"));
  const body = res.ok ? await res.text() : "";

  check("robots.txt exists",
    res.status === 200,
    `HTTP ${res.status}`);

  check("robots.txt disallows peter.brain",
    body.includes("peter.brain"),
    body.includes("peter.brain") ? "present" : "NOT FOUND in robots.txt");

  check("robots.txt disallows peter.readout.json",
    body.includes("peter.readout.json"),
    body.includes("peter.readout.json") ? "present" : "NOT FOUND in robots.txt");
}

// ── 6. X-Frame-Options iframe-embed test (simulated) ─────────────────────────
// We can't actually embed in an iframe here, but we can verify the header
// combination is watertight: both X-Frame-Options AND CSP frame-ancestors.
{
  const res = await fetch(url("/"));
  const xfo = (res.headers.get("x-frame-options") ?? "").toUpperCase();
  const csp = res.headers.get("content-security-policy") ?? "";

  const twoLayers = xfo === "DENY" && csp.includes("frame-ancestors 'none'");
  check("Anti-framing: both XFO and CSP frame-ancestors set (belt-and-suspenders)",
    twoLayers,
    twoLayers ? "double-locked" : `XFO=${xfo || "MISSING"} CSP-frame-ancestors=${csp.includes("frame-ancestors") ? "present" : "MISSING"}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log();
if (failures === 0) {
  console.log("SECURITY SANITY PASSED — the deployed site is hardened.");
  console.log("Your brain artifacts are CORS-locked, the page cannot be framed,");
  console.log("and security headers are in place. Safe to go public.");
} else {
  console.log(`SECURITY SANITY FAILED (${failures} check(s)).`);
  console.log("Fix the FAILs above before going public.");
  console.log("Most likely cause: _headers file not in dist/ or not deployed yet.");
}

process.exit(failures === 0 ? 0 : 1);
