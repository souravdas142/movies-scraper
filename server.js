// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

// Node 18+ has global fetch
// If using older Node, uncomment below:
// const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Load sites.json
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

// URL helper
function makeAbsoluteUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// Parse results for ONE site
async function fetchAndParseSite(site, query) {
  const encoded = encodeURIComponent(query);
  const url = site.template.replace("{query}", encoded);

  const startTime = Date.now();
  let html;

  try {
	  //const res = await fetch(url, {
      //  headers: {
      //    "User-Agent":
      //      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome Safari",
      //  },
      //});

	const res = await fetch(url, {
	  headers: {
  	    "User-Agent":
  	      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  	    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  	    "Accept-Language": "en-US,en;q=0.9",
  	    "Cache-Control": "no-cache",
  	    "Pragma": "no-cache",
  	    "Sec-Ch-Ua": "\"Chromium\";v=\"120\", \"Not A(Brand\";v=\"99\"",
  	    "Sec-Ch-Ua-Mobile": "?0",
  	    "Sec-Ch-Ua-Platform": "\"Linux\"",
  	    "Sec-Fetch-Dest": "document",
  	    "Sec-Fetch-Mode": "navigate",
  	    "Sec-Fetch-Site": "none",
  	    "Sec-Fetch-User": "?1",
  	    "Upgrade-Insecure-Requests": "1",
  	    "Referer": "https://google.com/"
  }
});


    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    html = await res.text();
  } catch (err) {
	return {
	  siteId: site.id,
	  siteName: site.name,
	  url,
	  ok: false,
	  error: `Fetch error: ${err.message}`,
	  manualUrl: url, // 👈 NEW: clickable fallback URL
	  items: [],
	  ms: Date.now() - startTime,
	};
  }

  const $ = cheerio.load(html);
  const items = [];

  const resultSelector = site.resultSelector;
  const linkSelector = site.linkSelector || "a";
  const titleSelector = site.titleSelector || linkSelector;
  const snippetSelector = site.snippetSelector || "";

  $(resultSelector).each((_, el) => {
    const $el = $(el);

    const linkEl = $el.find(linkSelector).first();
    const href = linkEl.attr("href");
    if (!href) return;

    const absolute = makeAbsoluteUrl(url, href);

    let titleText = $el.find(titleSelector).first().text().trim();
    if (!titleText) titleText = linkEl.text().trim();

    let snippet = "";
    if (snippetSelector) {
      snippet = $el.find(snippetSelector).first().text().trim();
    }

    if (!titleText && !snippet) return;

    items.push({
      title: titleText || "(no title)",
      url: absolute,
      snippet,
    });
  });

  return {
    siteId: site.id,
    siteName: site.name,
    url,
    ok: true,
    error: null,
    items,
    ms: Date.now() - startTime,
  };
}

// Normal Search
app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) return res.status(400).json({ error: "Missing q" });
  if (!sites.length) return res.status(500).json({ error: "No sites configured" });

  try {
    const results = await Promise.all(
      sites.map((s) => fetchAndParseSite(s, query))
    );

    res.json({
      query,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reload sites.json
app.post("/api/reload-sites", (req, res) => {
  loadSites();
  res.json({ ok: true, count: sites.length });
});


// NEW: Search ALL websites (simple version)
app.get("/api/searchAll", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) return res.json({ error: "Missing query" });

  const encoded = encodeURIComponent(query);
  const output = {};

  await Promise.all(
    sites.map(async (site) => {
      const url = site.template.replace("{query}", encoded);
      output[site.name] = [];

      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
          },
        });

        if (!resp.ok) {
          output[site.name] = { error: true, message: `HTTP ${resp.status}`, manualUrl: url };
          return;
        }

        const html = await resp.text();
        const $ = cheerio.load(html);

        const items = [];
        $(site.resultSelector).each((_, el) => {
          const title = $(el).find(site.titleSelector).text().trim();
          const link = $(el).find(site.linkSelector).attr("href");

          if (!title || !link) return;

          items.push({
            title,
            url: makeAbsoluteUrl(url, link),
          });
        });

        output[site.name] = items;
      } catch (err) {
        output[site.name] = { error: true, message: err.message, manualUrl: url };
      }
    })
  );

  res.json(output);
});

// Start
app.listen(PORT, () => {
  console.log(`Movie meta-search server running at http://localhost:${PORT}`);
});

