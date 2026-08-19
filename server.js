require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { OpenAI } = require("openai");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const https = require("https");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000 // 30-second timeout to prevent request hanging
});
const MODEL = "gpt-4o-mini";

// ---------------------------------------------------------------------------
// In-memory job tracker for SSE progress
// ---------------------------------------------------------------------------
const jobs = new Map();

// ---------------------------------------------------------------------------
// Scraping helpers
// ---------------------------------------------------------------------------
const SCRAPE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const MAX_TEXT_CHARS = 3000;
const SCRAPE_TIMEOUT = 12000; // ms

// HTTPS Agent to ignore SSL certificate validation issues
const scrapeAgent = new https.Agent({
  rejectUnauthorized: false,
});

async function scrapeWebsite(url) {
  // Normalize URL
  let base = url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");

  const urlsToTry = [
    `https://www.${base}`,
    `https://${base}`,
    `http://www.${base}`,
    `http://${base}`,
  ];

  console.log(`\n[SCRAPER] --- Initiating live scrape for domain: ${base} ---`);

  for (const tryUrl of urlsToTry) {
    try {
      console.log(`[SCRAPER] Fetching: ${tryUrl}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT);

      const resp = await fetch(tryUrl, {
        headers: SCRAPE_HEADERS,
        redirect: "follow",
        signal: controller.signal,
        agent: tryUrl.startsWith("https:") ? scrapeAgent : undefined,
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const html = await resp.text();
        console.log(`[SCRAPER] Response OK (${resp.status}), HTML size: ${html.length} bytes`);
        
        if (html.length < 500) {
          console.log(`[SCRAPER] Page content too brief (${html.length} chars). Trying next protocol.`);
          continue;
        }

        const $ = cheerio.load(html);

        // Remove noise
        $("script, style, noscript, iframe, svg, path, meta, link").remove();

        const title = $("title").text().trim();
        const metaDesc =
          $('meta[name="description"]').attr("content")?.trim() || "";

        // Extract visible text from meaningful tags
        const textParts = [];
        $("h1, h2, h3, h4, h5, h6, p, li, span, a, td, th, blockquote, article, section").each(
          (_, el) => {
            const t = $(el).text().trim();
            if (t && t.length > 2) textParts.push(t);
          }
        );

        // Deduplicate and join
        const seen = new Set();
        const uniqueText = textParts.filter((t) => {
          if (seen.has(t)) return false;
          seen.add(t);
          return true;
        });

        const bodyText = uniqueText.join(" ").replace(/\s+/g, " ").trim();
        console.log(`[SCRAPER] Extracted ${bodyText.length} characters of unique text.`);

        const context = `Page title: ${title}\nDescription: ${metaDesc}\nPage content: ${bodyText.slice(0, MAX_TEXT_CHARS)}`;

        console.log(`[SCRAPER] ✓ Successful scrape of: ${tryUrl}`);
        console.log(`[SCRAPER] Title: "${title}"`);
        console.log(`[SCRAPER] Meta Description: "${metaDesc}"`);
        
        return {
          success: true,
          url: tryUrl,
          title,
          metaDesc,
          content: context,
          contentLength: bodyText.length,
        };
      } else {
        console.log(`[SCRAPER] Status ${resp.status} for ${tryUrl}`);
      }
    } catch (err) {
      console.log(`[SCRAPER] Fetch error for ${tryUrl}: ${err.message}`);
      continue;
    }
  }

  console.log(`[SCRAPER] ✗ Failed to fetch content from ${url} across all protocol variations.`);
  return { success: false, url, title: "", metaDesc: "", content: "", contentLength: 0 };
}

// ---------------------------------------------------------------------------
// System prompt — the connector framework
// ---------------------------------------------------------------------------
function buildSystemPrompt(supplyCopy, demandCopy) {
  return `You are a cold email copywriter working inside a connector business model.
You write supply-side outreach for a market connector who routes qualified introductions between recruitment agencies (supply) and hiring managers at US tech companies (demand).

THE PERFECT EMAIL — THIS IS YOUR TARGET OUTPUT
Every email you write must land within 99% of this structure, tone, and length:
[Name], reaching out because I currently have tech companies actively looking to hire, and I'm placing the right recruitment partner when timing is live.

I've made introductions under tight timelines before — one client placed 15 engineers in 60 days through our startup pool ($240k in fees), myoProcess powering the matching behind it.

If you're currently placing {{ai_specialisation}} talent and have capacity to take on a live situation, I can send the details.

Let me know.
Study this email. Every structural and tonal decision is intentional.

WHAT MAKES THIS EMAIL WORK — DO NOT DEVIATE
Line 1: States the situation as fact. "I have tech companies looking to hire." No question. No pitch. No qualification of yourself. The sender is already in motion.
Line 2: One proof point. Specific numbers only — placements, timelines, fees. Name the system (myoProcess) without explaining it. Let the specificity do the work.
Line 3: The self-qualifying filter. Drop {{ai_specialisation}} here — pulled from their website specialisation. Not in Line 1 (feels scraped). Here it feels like you already know who you're talking to. Ends with a soft, low-commitment ask.
Line 4: Two words. "Let me know." Period. Not "Let me know!" Not "Would love to connect." Two words and done.

THE ONE AI VARIABLE
{{ai_specialisation}} — the tech discipline the agency places. Pulled from their website.
Examples: DevOps, data engineering, full-stack, cloud infrastructure, QA.
Use it exactly once, in Line 3, in this construction:
"If you're currently placing {{ai_specialisation}} talent..."
Do not add more variables. Do not move this variable. Do not use it in Line 1.

TONE RULES — ABSOLUTE
- Calm. Already in motion. Not pitching — informing.
- No enthusiasm. No exclamation marks. Ever.
- No buzzwords: leverage, synergy, unlock, empower, seamless, cutting-edge.
- No fake warmth: "Hope this finds you well", "I wanted to reach out", "Just checking in."
- No hedging: "perhaps", "maybe", "I think", "I believe."
- The sender evaluates whether the agency deserves access. Not the other way around.

HARD CONSTRAINTS
- Under 100 words. Hard limit.
- Four lines. No more.
- One proof point. One variable. One ask.
- No questions in Line 1.
- No exclamation marks anywhere.

SCRAPED DATA RULES
You will receive website data on the agency. Use it only to identify {{ai_specialisation}}. Never surface any other scraped detail in the email. The recipient must never feel researched — they must feel selected.

${supplyCopy ? `\n--- SUPPLY SIDE COPY CONTEXT ---\n${supplyCopy}\n--- END SUPPLY COPY ---` : ""}
${demandCopy ? `\n--- DEMAND SIDE COPY CONTEXT (for your awareness, do not reference directly) ---\n${demandCopy}\n--- END DEMAND COPY ---` : ""}

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fencing, no explanation:
{
  "subject": "short, calm, direct subject line (under 6 words)",
  "body": "the full email body, adhering exactly to the PERFECT EMAIL structure above. Replace [Name] with the contact's name if provided (e.g. 'Aaron,'), or start directly with 'Reaching out' if not. Replace {{ai_specialisation}} with the tech discipline found in the scraped data (e.g. 'DevOps' or 'full-stack')."
}`;
}

// ---------------------------------------------------------------------------
// Generate emails for a single lead
// ---------------------------------------------------------------------------
async function generateEmailsForLead(lead, supplyCopy, demandCopy) {
  const systemPrompt = buildSystemPrompt(supplyCopy, demandCopy);

  const userMessage = `Generate 1 cold email outreach copy for this recruitment agency.

Agency Name: ${lead.agency_name}
Website URL: ${lead.website_url}
${lead.contact_name ? `Contact Name: ${lead.contact_name}` : ""}

--- SCRAPED WEBSITE INTELLIGENCE (for your internal understanding ONLY — do NOT reference in the email) ---
${lead.scraped_content || "No website data available. Write from pure market-level conviction."}
--- END SCRAPED DATA ---

Remember: The scraped data informs your email content choices invisibly. Write from market-level conviction.`;

  console.log(`[OPENAI] Requesting completion for lead: ${lead.agency_name || lead.website_url} using model: ${MODEL}`);

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const raw = response.choices[0].message.content.trim();
    console.log(`[OPENAI] Raw response received (${raw.length} chars)`);

    // Try to parse JSON — handle potential markdown fencing
    let cleaned = raw;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned);

    // Normalize keys in case the model returns alternate field names
    const subject = parsed.subject || parsed.subject_line || parsed.Subject || parsed.title || parsed.SubjectLine || parsed.heading || "";
    const body = parsed.body || parsed.email || parsed.copy || parsed.text || parsed.content || parsed.message || parsed.Body || parsed.email_body || "";

    const normalizedData = { subject, body };
    console.log(`[OPENAI] ✓ Successfully parsed generated copy for: ${lead.agency_name || lead.website_url}`);
    return { success: true, data: normalizedData };
  } catch (err) {
    console.error(`[OPENAI] ✗ Error generating copy for ${lead.agency_name || lead.website_url}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// Health check
app.get("/api/health", (req, res) => {
  const hasKey = !!process.env.OPENAI_API_KEY;
  res.json({ status: "ok", apiKeyConfigured: hasKey });
});

// Scrape a single website
app.post("/api/scrape", async (req, res) => {
  const { leads } = req.body; // [{agency_name, website_url}]

  if (!leads || !Array.isArray(leads)) {
    return res.status(400).json({ error: "leads array required" });
  }

  const results = [];
  for (const lead of leads) {
    if (!lead.website_url) {
      results.push({ ...lead, scraped_content: "", scrape_status: "skipped" });
      continue;
    }

    try {
      const scraped = await scrapeWebsite(lead.website_url);
      results.push({
        ...lead,
        scraped_content: scraped.content,
        scraped_title: scraped.title,
        scraped_meta: scraped.metaDesc,
        scrape_status: scraped.success ? "success" : "failed",
      });
    } catch (err) {
      results.push({
        ...lead,
        scraped_content: "",
        scrape_status: "error",
        scrape_error: err.message,
      });
    }

    // Small delay to be polite
    await new Promise((r) => setTimeout(r, 500));
  }

  res.json({ results });
});

// Start a generation job (scrape + generate in one go)
app.post("/api/generate", async (req, res) => {
  const { leads, supplyCopy, demandCopy } = req.body;

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "leads array required" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured on server" });
  }

  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: "running",
    total: leads.length,
    completed: 0,
    currentLead: "",
    currentPhase: "starting",
    results: [],
    errors: [],
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  // Process asynchronously
  (async () => {
    let nextLeadIndex = 0;
    const activeLeads = new Set();

    const runWorker = async (workerId) => {
      while (true) {
        if (job.status === "cancelled") {
          break;
        }

        // Atomically claim the next lead index
        const index = nextLeadIndex++;
        if (index >= leads.length) {
          break;
        }

        const lead = leads[index];
        const leadName = lead.agency_name || lead.website_url;
        activeLeads.add(leadName);

        // Update job.currentLead and job.currentPhase
        job.currentLead = Array.from(activeLeads).join(", ");
        job.currentPhase = "generating"; // Keeps label consistent on frontend

        // Phase 1: Scrape
        let scrapedLead = { ...lead };
        if (lead.website_url) {
          try {
            const scraped = await scrapeWebsite(lead.website_url);
            if (job.status === "cancelled") {
              activeLeads.delete(leadName);
              break;
            }
            scrapedLead.scraped_content = scraped.content;
            scrapedLead.scraped_title = scraped.title;
            scrapedLead.scrape_status = scraped.success ? "success" : "failed";
          } catch (err) {
            scrapedLead.scraped_content = "";
            scrapedLead.scrape_status = "error";
          }
        }

        if (job.status === "cancelled") {
          activeLeads.delete(leadName);
          break;
        }

        // Phase 2: Generate
        const result = await generateEmailsForLead(scrapedLead, supplyCopy, demandCopy);

        if (job.status === "cancelled") {
          activeLeads.delete(leadName);
          break;
        }

        if (result.success) {
          job.results.push({
            lead: {
              agency_name: lead.agency_name,
              website_url: lead.website_url,
              contact_name: lead.contact_name || "",
              contact_email: lead.contact_email || "",
              scrape_status: scrapedLead.scrape_status,
            },
            emails: result.data,
          });
        } else {
          job.errors.push({
            lead: leadName,
            error: result.error,
          });
        }

        activeLeads.delete(leadName);
        job.completed += 1;
        job.currentLead = Array.from(activeLeads).join(", ");

        // Small delay between leads for this worker to be polite
        if (nextLeadIndex < leads.length) {
          for (let s = 0; s < 10; s++) { // 10 * 100ms = 1000ms delay
            if (job.status === "cancelled") break;
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      }
    };

    const numWorkers = Math.min(8, leads.length);
    const workers = [];
    for (let w = 0; w < numWorkers; w++) {
      workers.push(runWorker(w));
    }

    await Promise.all(workers);

    if (job.status === "cancelled") {
      job.currentPhase = "cancelled";
    } else {
      job.status = "completed";
      job.currentPhase = "done";
    }
    job.currentLead = "";
  })().catch((err) => {
    job.status = "failed";
    job.currentPhase = "error";
    job.errors.push({ lead: "system", error: err.message });
  });

  res.json({ jobId, total: leads.length });
});

// Cancel a generation job
app.post("/api/cancel/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  if (job.status === "running" || job.status === "starting") {
    job.status = "cancelled";
    job.currentPhase = "cancelled";
  }

  res.json({ success: true, status: job.status });
});


// SSE progress endpoint
app.get("/api/progress/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let lastSentResultIndex = 0;
  let lastSentErrorIndex = 0;

  const interval = setInterval(() => {
    // Only send new results and errors since last tick to avoid massive JSON payloads
    const newResults = job.results.slice(lastSentResultIndex);
    const newErrors = job.errors.slice(lastSentErrorIndex);

    lastSentResultIndex = job.results.length;
    lastSentErrorIndex = job.errors.length;

    const data = {
      status: job.status,
      total: job.total,
      completed: job.completed,
      currentLead: job.currentLead,
      currentPhase: job.currentPhase,
      results: newResults,
      errors: newErrors,
    };

    res.write(`data: ${JSON.stringify(data)}\n\n`);

    if (job.status === "completed" || job.status === "failed") {
      clearInterval(interval);
      res.write(`data: ${JSON.stringify({ ...data, done: true })}\n\n`);
      res.end();

      // Clean up job after 5 minutes
      setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
    }
  }, 800);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// Get job results directly (polling fallback)
app.get("/api/job/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════════╗`);
  console.log(`  ║   Cold Email Generator — Connector Outreach  ║`);
  console.log(`  ╠══════════════════════════════════════════════╣`);
  console.log(`  ║   Server running on http://localhost:${PORT}     ║`);
  console.log(`  ║   API Key: ${process.env.OPENAI_API_KEY ? "✓ Configured" : "✗ Missing"}                   ║`);
  console.log(`  ╚══════════════════════════════════════════════╝\n`);
});
