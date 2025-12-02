// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

// Node 18+ has global fetch. If you’re on older Node, uncomment next line:
// const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public/
app.use(express.static(path.join(__dirname, "public")));

// Load sites config
const sitesPath = path.join(__dirname, "config", "sites.json");
let sites = [];

function loadSites() {
  try {
    const raw = fs.readFileSync(sitesPath, "utf8");
    sites = JSON.parse(raw).filter((s) => s.enabled !== false);
    console.log(`Loaded ${sites.length} sites from config.`);
  } catch (err) {
    console.error("Failed to load sites.json:", err);
    sites = [];
  }
}

loadSites();

// Utility: absolute URL
function makeAbsoluteUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// Parse one site
async function fetchAndParseSite(site, query) {
  const encoded = encodeURIComponent(query);
  const url = site.template.replace("{query}", encoded);

  const startTime = Date.now();
  let html;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome Safari"
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    html = await res.text();
  } catch (err) {
    return {
      siteId: site.id,
      siteName: site.name,
      url,
      ok: false,
      error: `Fetch error: ${err.message}`,
      items: [],
      ms: Date.now() - startTime
    };
  }

  const $ = cheerio.load(html);
  const items = [];

  const resultSelector = site.resultSelector || "a";
  const linkSelector = site.linkSelector || "a";
  const titleSelector = site.titleSelector || linkSelector;
  const snippetSelector = site.snippetSelector || "";

  $(resultSelector).each((_, el) => {
    const $el = $(el);

    const linkEl = $el.find(linkSelector).first();
    const href = linkEl.attr("href");
    if (!href) return;

    const urlAbs = makeAbsoluteUrl(url, href);

    let titleText = $el.find(titleSelector).first().text().trim();
    if (!titleText) {
      titleText = linkEl.text().trim();
    }

    let snippet = "";
    if (snippetSelector) {
      snippet = $el.find(snippetSelector).first().text().trim();
    }

    if (!titleText && !snippet) return;

    items.push({
      title: titleText || "(no title)",
      url: urlAbs,
      snippet
    });
  });

  return {
    siteId: site.id,
    siteName: site.name,
    url,
    ok: true,
    error: null,
    items,
    ms: Date.now() - startTime
  };
}

// API endpoint: /api/search?q=Something
app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Missing q parameter" });
  }

  if (!sites.length) {
    return res.status(500).json({ error: "No sites configured" });
  }

  const promises = sites.map((site) => fetchAndParseSite(site, query));

  try {
    const results = await Promise.all(promises);
    res.json({
      query,
      timestamp: new Date().toISOString(),
      results
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Simple hot-reload endpoint for sites (optional)
app.post("/api/reload-sites", (req, res) => {
  loadSites();
  res.json({ ok: true, count: sites.length });
});

app.listen(PORT, () => {
  console.log(`Movie meta-search server running at http://localhost:${PORT}`);
});

