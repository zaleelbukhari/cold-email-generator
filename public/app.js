// =========================================================================
// Cold Email Generator — Frontend Application
// =========================================================================

(() => {
  "use strict";

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  const state = {
    currentStep: 1,
    leads: [],
    results: [],
    jobId: null,
    currentBatch: [],        // Leads in the currently running batch
    activeTabs: {},          // Map of leadIndex -> activeTabId
    evtSource: null,         // EventSource reference
    isRemainingCohort: false, // Track if generating remaining leads
    originalHeaders: null,   // Original CSV headers
    headerMapping: null      // Mapping of standard fields to original headers
  };

  // -----------------------------------------------------------------------
  // Default supply copy (pre-filled connector framework)
  // -----------------------------------------------------------------------
  const DEFAULT_SUPPLY_COPY = `My current supply side target is recruitment agencies that place senior software engineers, DevOps, and technical talent into US tech companies. Specifically boutique agencies of 2 to 50 people who are stretched on BD and need more qualified client mandates.

Positioning:
I sit above the lead gen market entirely. I do not send lists, run campaigns, or spray volume. I route access to live hiring conversations when timing is right and fit is real. Supply partners are not clients I work for. They are partners I route qualified introductions to.

The offer:
£2,000 for 60–90 days. 3–6 qualified introductions to hiring managers at US tech companies with live mandates for senior engineers or DevOps. I do not sit between them and the client operationally. I simply control the access.

Tone:
Not salesy. Not cold and robotic. Calm, direct, market aware. I sound like someone already in motion inside this lane. Low energy, high conviction. I am evaluating whether they deserve access, not pitching them.

Email structure:
Line 1: Market level signal observation. One sentence. No fluff.
Line 2: What that creates for agencies like them. One sentence.
Line 3: What I do and how I sit differently from lead gen. 1–2 sentences.
Line 4: Soft ask. Low commitment. One sentence.

Total email length: Under 100 words. No subject line tricks. No fake personalization. No buzzwords.`;

  // -----------------------------------------------------------------------
  // DOM references
  // -----------------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Steps
    stepsNav: $("#stepsNav"),
    panels: [$("#panel1"), $("#panel2"), $("#panel3")],
    stepItems: [$("#stepItem1"), $("#stepItem2"), $("#stepItem3")],
    stepNums: [$("#stepNum1"), $("#stepNum2"), $("#stepNum3")],
    stepConns: [$("#stepConn1"), $("#stepConn2")],

    // Panel 1
    dropZone: $("#dropZone"),
    fileInput: $("#fileInput"),
    leadsTableBody: $("#leadsTableBody"),
    leadsCount: $("#leadsCount"),
    leadsCountNum: $("#leadsCountNum"),
    btnAddRow: $("#btnAddRow"),
    btnClearAll: $("#btnClearAll"),
    btnLoadSample: $("#btnLoadSample"),
    btnNext1: $("#btnNext1"),

    // Panel 2
    supplyCopy: $("#supplyCopy"),
    demandCopy: $("#demandCopy"),
    btnBack2: $("#btnBack2"),
    btnGenerate: $("#btnGenerate"),
    btnGenerateText: $("#btnGenerateText"),
    progressContainer: $("#progressContainer"),
    progressBar: $("#progressBar"),
    progressText: $("#progressText"),
    progressCount: $("#progressCount"),
    progressSpinner: $("#progressSpinner"),
    btnStopGenerate: $("#btnStopGenerate"),
    btnResumeGenerate: $("#btnResumeGenerate"),

    // Panel 3
    resultsContainer: $("#resultsContainer"),
    emptyResults: $("#emptyResults"),
    resultsCount: $("#resultsCount"),
    emailsCount: $("#emailsCount"),
    btnExportCSV: $("#btnExportCSV"),
    btnBackToConfig: $("#btnBackToConfig"),
    btnStartOver: $("#btnStartOver"),
    
    // Cohort Banner & Inline Progress
    cohortBanner: $("#cohortBanner"),
    cohortTestCount: $("#cohortTestCount"),
    cohortRemainingCount: $("#cohortRemainingCount"),
    btnGenerateRemaining: $("#btnGenerateRemaining"),
    selectCohortCount: $("#selectCohortCount"),
    inputCustomCohortCount: $("#inputCustomCohortCount"),
    cohortProgressContainer: $("#cohortProgressContainer"),
    cohortProgressBar: $("#cohortProgressBar"),
    cohortProgressText: $("#cohortProgressText"),
    cohortProgressCount: $("#cohortProgressCount"),
    cohortProgressSpinner: $("#cohortProgressSpinner"),
    btnStopCohort: $("#btnStopCohort"),
    btnResumeCohort: $("#btnResumeCohort"),

    // Global
    apiStatus: $("#apiStatus"),
    apiDot: $("#apiDot"),
    apiStatusText: $("#apiStatusText"),
    toast: $("#toast"),
  };

  // -----------------------------------------------------------------------
  // Initialize
  // -----------------------------------------------------------------------
  function init() {
    // Pre-fill supply copy
    dom.supplyCopy.value = localStorage.getItem("supplyCopy") || DEFAULT_SUPPLY_COPY;
    dom.demandCopy.value = localStorage.getItem("demandCopy") || "";

    // Load state from storage
    loadStateFromStorage();

    // Check API
    checkApiHealth();

    // Restore UI from state
    restoreUIFromState();

    // Bind events
    bindEvents();
  }

  function saveStateToStorage() {
    try {
      localStorage.setItem("leads", JSON.stringify(state.leads));
      localStorage.setItem("results", JSON.stringify(state.results));
      localStorage.setItem("currentStep", state.currentStep.toString());
      localStorage.setItem("originalHeaders", JSON.stringify(state.originalHeaders || []));
      localStorage.setItem("headerMapping", JSON.stringify(state.headerMapping || {}));
    } catch (e) {
      console.error("Failed to save state to localStorage:", e);
    }
  }

  function loadStateFromStorage() {
    try {
      const savedLeads = localStorage.getItem("leads");
      const savedResults = localStorage.getItem("results");
      const savedStep = localStorage.getItem("currentStep");
      const savedHeaders = localStorage.getItem("originalHeaders");
      const savedMapping = localStorage.getItem("headerMapping");

      if (savedLeads) {
        state.leads = JSON.parse(savedLeads) || [];
      }
      if (savedResults) {
        state.results = JSON.parse(savedResults) || [];
      }
      if (savedStep) {
        state.currentStep = parseInt(savedStep, 10) || 1;
      }
      if (savedHeaders) {
        state.originalHeaders = JSON.parse(savedHeaders) || null;
      }
      if (savedMapping) {
        state.headerMapping = JSON.parse(savedMapping) || null;
      }
    } catch (e) {
      console.error("Failed to load state from localStorage:", e);
    }
  }

  function restoreUIFromState() {
    // Ensure state.leads and state.results are arrays
    if (!Array.isArray(state.leads)) state.leads = [];
    if (!Array.isArray(state.results)) state.results = [];

    // Restore leads table
    if (state.leads.length > 0) {
      dom.leadsTableBody.innerHTML = "";
      state.leads.forEach(lead => addTableRow(lead));
      updateLeadsCount();
    }

    // Restore results
    if (state.results.length > 0) {
      renderResults();
    }

    // Restore cohort banner state
    if (state.leads.length > state.results.length && state.results.length > 0) {
      dom.cohortTestCount.textContent = state.results.length;
      dom.cohortRemainingCount.textContent = state.leads.length - state.results.length;
      dom.cohortBanner.style.display = "flex";
    } else {
      dom.cohortBanner.style.display = "none";
    }

    // Restore step panel visibility
    goToStep(state.currentStep);
  }

  // -----------------------------------------------------------------------
  // API health check
  // -----------------------------------------------------------------------
  async function checkApiHealth() {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.apiKeyConfigured) {
        dom.apiDot.className = "api-status__dot connected";
        dom.apiStatusText.textContent = "API Connected";
      } else {
        dom.apiDot.className = "api-status__dot error";
        dom.apiStatusText.textContent = "API Key Missing";
      }
    } catch {
      dom.apiDot.className = "api-status__dot error";
      dom.apiStatusText.textContent = "Server Offline";
    }
  }

  // -----------------------------------------------------------------------
  // Event bindings
  // -----------------------------------------------------------------------
  function bindEvents() {
    // Step navigation
    dom.stepItems.forEach((item, i) => {
      item.addEventListener("click", () => {
        const targetStep = i + 1;
        if (targetStep === 1) {
          goToStep(1);
        } else if (targetStep === 2) {
          collectLeadsFromTable();
          if (state.leads.length > 0) {
            goToStep(2);
          } else {
            showToast("Add at least one lead to continue", "error");
          }
        } else if (targetStep === 3) {
          if (state.results.length > 0) {
            goToStep(3);
          } else {
            showToast("No generated emails to view yet", "error");
          }
        }
      });
    });

    // Drag & Drop
    dom.dropZone.addEventListener("click", () => dom.fileInput.click());
    dom.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dom.dropZone.classList.add("dragover");
    });
    dom.dropZone.addEventListener("dragleave", () => {
      dom.dropZone.classList.remove("dragover");
    });
    dom.dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dom.dropZone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) parseCSVFile(file);
    });
    dom.fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) parseCSVFile(e.target.files[0]);
    });

    // Table actions
    dom.btnAddRow.addEventListener("click", addEmptyRow);
    dom.btnClearAll.addEventListener("click", clearAllLeads);
    dom.btnLoadSample.addEventListener("click", loadSampleLeads);

    // Navigation
    dom.btnNext1.addEventListener("click", () => {
      collectLeadsFromTable();
      if (state.leads.length === 0) {
        showToast("Add at least one lead to continue", "error");
        return;
      }
      goToStep(2);
    });

    dom.btnBack2.addEventListener("click", () => goToStep(1));
    dom.btnBackToConfig.addEventListener("click", () => goToStep(2));
    dom.btnStartOver.addEventListener("click", startOver);

    // Generate actions
    dom.btnGenerate.addEventListener("click", startInitialGeneration);
    dom.btnStopGenerate.addEventListener("click", () => stopGenerationFlow(false));
    dom.btnResumeGenerate.addEventListener("click", () => resumeGenerationFlow(false));

    // Cohort actions
    dom.btnGenerateRemaining.addEventListener("click", startRemainingGeneration);
    dom.btnStopCohort.addEventListener("click", () => stopGenerationFlow(true));
    dom.btnResumeCohort.addEventListener("click", () => resumeGenerationFlow(true));
    dom.selectCohortCount.addEventListener("change", () => {
      if (dom.selectCohortCount.value === "custom") {
        dom.inputCustomCohortCount.style.display = "inline-block";
        dom.inputCustomCohortCount.focus();
      } else {
        dom.inputCustomCohortCount.style.display = "none";
      }
    });

    // Export
    dom.btnExportCSV.addEventListener("click", exportCSV);

    // Save copy to localStorage on change
    dom.supplyCopy.addEventListener("input", () => {
      localStorage.setItem("supplyCopy", dom.supplyCopy.value);
    });
    dom.demandCopy.addEventListener("input", () => {
      localStorage.setItem("demandCopy", dom.demandCopy.value);
    });

    // Table input changes delegation for auto-saving manual edits
    dom.leadsTableBody.addEventListener("input", () => {
      collectLeadsFromTable();
    });

    // Remove row delegation
    dom.leadsTableBody.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-remove-row")) {
        const row = e.target.closest("tr");
        if (dom.leadsTableBody.children.length > 1) {
          row.remove();
        } else {
          // Clear the last row instead of removing
          row.querySelectorAll("input").forEach((inp) => (inp.value = ""));
        }
        updateLeadsCount();
        collectLeadsFromTable();
      }
    });
  }

  // -----------------------------------------------------------------------
  // Step navigation
  // -----------------------------------------------------------------------
  function goToStep(step) {
    state.currentStep = step;
    saveStateToStorage();

    if (step === 2) {
      collectLeadsFromTable();
      // If we have more than 5 leads, enforce test cohort text
      if (state.leads.length > 5 && state.results.length === 0) {
        dom.btnGenerateText.textContent = "⚡ Generate 5 Test Copies";
      } else {
        dom.btnGenerateText.textContent = "⚡ Generate Emails";
      }
    }

    // Update panels
    dom.panels.forEach((p, i) => {
      p.classList.toggle("active", i === step - 1);
    });

    // Update step nav
    dom.stepItems.forEach((item, i) => {
      item.classList.remove("active", "completed");
      if (i + 1 === step) {
        item.classList.add("active");
      } else if (i + 1 < step) {
        item.classList.add("completed");
        dom.stepNums[i].textContent = "✓";
      } else {
        dom.stepNums[i].textContent = i + 1;
      }
    });

    // Update connectors
    dom.stepConns.forEach((conn, i) => {
      conn.classList.toggle("active", i + 1 < step);
    });
  }

  // -----------------------------------------------------------------------
  // CSV Parsing (simple, handles quotes and commas)
  // -----------------------------------------------------------------------
  function parseCSVFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const rows = parseCSV(text);

      if (rows.length === 0) {
        showToast("No valid data found in CSV", "error");
        return;
      }

      // Clear existing rows
      dom.leadsTableBody.innerHTML = "";

      rows.forEach((row) => addTableRow(row));
      updateLeadsCount();
      collectLeadsFromTable();
      showToast(`Loaded ${rows.length} leads from CSV`, "success");
    };
    reader.readAsText(file);
  }

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    // Parse header
    const originalHeaders = parseCSVLine(lines[0]);
    const normalizedHeaders = originalHeaders.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));

    // Map column names using flexible matching
    const nameCol = normalizedHeaders.findIndex((h) => {
      // Exclude URLs and contact person details from company name
      if (h.includes("url") || h.includes("website") || h.includes("site") || h.includes("domain") || 
          h.includes("contact") || h.includes("first") || h.includes("last") || h.includes("full") || h.includes("person")) {
        return false;
      }
      return ["agency_name", "company_name", "agency", "company", "firm", "organization", "name"].some(opt => h === opt || h.includes(opt));
    });

    const urlCol = normalizedHeaders.findIndex((h) => {
      return ["website_url", "company_website", "website", "url", "domain", "site", "web_site"].some(opt => h === opt || h.includes(opt));
    });

    const contactCol = normalizedHeaders.findIndex((h) => {
      return ["contact_name", "full_name", "first_name", "last_name", "contact", "name", "firstname", "lastname", "fullname", "person"].some(opt => h === opt || h.includes(opt));
    });

    const emailCol = normalizedHeaders.findIndex((h) => {
      return ["contact_email", "email", "email_address", "mail"].some(opt => h === opt || h.includes(opt));
    });

    if (nameCol === -1 && urlCol === -1) {
      showToast("CSV must have an agency_name or website_url column", "error");
      return [];
    }

    state.originalHeaders = originalHeaders;
    state.headerMapping = {
      agency_name: nameCol >= 0 ? originalHeaders[nameCol] : null,
      website_url: urlCol >= 0 ? originalHeaders[urlCol] : null,
      contact_name: contactCol >= 0 ? originalHeaders[contactCol] : null,
      contact_email: emailCol >= 0 ? originalHeaders[emailCol] : null,
    };
    saveStateToStorage();

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      
      const originalData = {};
      originalHeaders.forEach((h, colIdx) => {
        originalData[h] = cols[colIdx] || "";
      });

      const row = {
        agency_name: nameCol >= 0 ? (cols[nameCol] || "").trim() : "",
        website_url: urlCol >= 0 ? (cols[urlCol] || "").trim() : "",
        contact_name: contactCol >= 0 ? (cols[contactCol] || "").trim() : "",
        contact_email: emailCol >= 0 ? (cols[emailCol] || "").trim() : "",
        originalData
      };

      if (row.agency_name || row.website_url) {
        rows.push(row);
      }
    }

    return rows;
  }

  function parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          result.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }

  // -----------------------------------------------------------------------
  // Table management
  // -----------------------------------------------------------------------
  function addTableRow(data = {}) {
    const tr = document.createElement("tr");
    if (data.originalData) {
      tr.dataset.originalData = JSON.stringify(data.originalData);
    }
    tr.innerHTML = `
      <td><input type="text" placeholder="e.g. Harnham" data-field="agency_name" value="${escapeHtml(data.agency_name || "")}"></td>
      <td><input type="text" placeholder="e.g. harnham.com" data-field="website_url" value="${escapeHtml(data.website_url || "")}"></td>
      <td><input type="text" placeholder="Optional" data-field="contact_name" value="${escapeHtml(data.contact_name || "")}"></td>
      <td><input type="text" placeholder="Optional" data-field="contact_email" value="${escapeHtml(data.contact_email || "")}"></td>
      <td class="td-actions"><button class="btn-remove-row" title="Remove row">×</button></td>
    `;
    dom.leadsTableBody.appendChild(tr);
    updateLeadsCount();
  }

  function addEmptyRow() {
    addTableRow();
    // Focus the first input of the new row
    const newRow = dom.leadsTableBody.lastElementChild;
    newRow.querySelector("input").focus();
  }

  function clearAllLeads() {
    dom.leadsTableBody.innerHTML = "";
    addTableRow();
    updateLeadsCount();
    collectLeadsFromTable();
  }

  function loadSampleLeads() {
    dom.leadsTableBody.innerHTML = "";
    const samples = [
      { agency_name: "Harnham", website_url: "harnham.com", contact_name: "", contact_email: "" },
      { agency_name: "Opus Recruitment Solutions", website_url: "opusrs.com", contact_name: "", contact_email: "" },
      { agency_name: "Understanding Recruitment", website_url: "understandingrecruitment.co.uk", contact_name: "", contact_email: "" },
    ];
    samples.forEach((s) => addTableRow(s));
    collectLeadsFromTable();
    showToast("Sample leads loaded", "success");
  }

  function collectLeadsFromTable() {
    state.leads = [];
    const rows = dom.leadsTableBody.querySelectorAll("tr");
    rows.forEach((row) => {
      const lead = {};
      row.querySelectorAll("input").forEach((input) => {
        lead[input.dataset.field] = input.value.trim();
      });

      const originalDataStr = row.dataset.originalData;
      if (originalDataStr) {
        try {
          lead.originalData = JSON.parse(originalDataStr);
          // If the user edited any of the editable fields, update them in originalData
          if (state.headerMapping) {
            if (state.headerMapping.agency_name) {
              lead.originalData[state.headerMapping.agency_name] = lead.agency_name;
            }
            if (state.headerMapping.website_url) {
              lead.originalData[state.headerMapping.website_url] = lead.website_url;
            }
            if (state.headerMapping.contact_name) {
              lead.originalData[state.headerMapping.contact_name] = lead.contact_name;
            }
            if (state.headerMapping.contact_email) {
              lead.originalData[state.headerMapping.contact_email] = lead.contact_email;
            }
          }
        } catch (e) {
          console.error("Failed to parse originalData from row dataset:", e);
        }
      }

      if (lead.agency_name || lead.website_url) {
        state.leads.push(lead);
      }
    });
    saveStateToStorage();
  }

  function updateLeadsCount() {
    let count = 0;
    dom.leadsTableBody.querySelectorAll("tr").forEach((row) => {
      const hasData = Array.from(row.querySelectorAll("input")).some((inp) => inp.value.trim());
      if (hasData) count++;
    });
    dom.leadsCountNum.textContent = count;
    dom.leadsCount.style.display = count > 0 ? "inline-flex" : "none";
  }

  // -----------------------------------------------------------------------
  // Generation
  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  // Generation FLOWS
  function isSameLead(l1, l2) {
    if (!l1 || !l2) return false;
    const url1 = (l1.website_url || "").toLowerCase().trim();
    const url2 = (l2.website_url || "").toLowerCase().trim();
    if (url1 && url2) {
      return url1 === url2;
    }
    const name1 = (l1.agency_name || "").toLowerCase().trim();
    const name2 = (l2.agency_name || "").toLowerCase().trim();
    return name1 && name2 && name1 === name2;
  }

  // -----------------------------------------------------------------------
  function mergeResults(newResults) {
    if (!newResults) return;
    newResults.forEach(newRes => {
      const idx = state.results.findIndex(r => isSameLead(r.lead, newRes.lead));
      if (idx > -1) {
        state.results[idx] = newRes;
      } else {
        state.results.push(newRes);
      }
    });
  }

  async function triggerGeneration(batchLeads, isRemaining) {
    const supplyCopy = dom.supplyCopy.value.trim();
    const demandCopy = dom.demandCopy.value.trim();

    if (isRemaining) {
      dom.cohortBanner.style.display = "none";
      dom.cohortProgressContainer.style.display = "block";
      dom.cohortProgressBar.style.width = "0%";
      dom.cohortProgressCount.textContent = `0 / ${batchLeads.length}`;
      dom.cohortProgressText.textContent = "Starting remaining cohort...";
      dom.cohortProgressSpinner.style.display = "block";
      dom.btnStopCohort.style.display = "inline-flex";
      dom.btnResumeCohort.style.display = "none";
    } else {
      dom.btnGenerate.disabled = true;
      dom.btnGenerateText.textContent = "Processing...";
      dom.progressContainer.style.display = "block";
      dom.progressBar.style.width = "0%";
      dom.progressCount.textContent = `0 / ${batchLeads.length}`;
      dom.progressText.textContent = "Starting test cohort...";
      dom.progressSpinner.style.display = "block";
      dom.btnStopGenerate.style.display = "inline-flex";
      dom.btnResumeGenerate.style.display = "none";
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: batchLeads,
          supplyCopy,
          demandCopy
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }

      const { jobId } = await res.json();
      state.jobId = jobId;

      listenToProgress(jobId, batchLeads, isRemaining);
    } catch (err) {
      showToast(err.message, "error");
      if (isRemaining) {
        dom.cohortProgressContainer.style.display = "none";
        dom.cohortBanner.style.display = "flex";
      } else {
        resetGenerateButton();
      }
    }
  }

  async function startInitialGeneration() {
    collectLeadsFromTable();

    if (state.leads.length === 0) {
      showToast("No leads to process. Go back and add leads.", "error");
      return;
    }

    const supplyCopy = dom.supplyCopy.value.trim();
    if (!supplyCopy) {
      showToast("Supply side copy is required", "error");
      return;
    }

    // Clear previous results on starting a new initial generation run
    state.results = [];
    saveStateToStorage();
    renderResults();

    // Determine batch
    if (state.leads.length > 5) {
      state.currentBatch = state.leads.slice(0, 5);
      showToast("Generating 5 test copies first...", "info");
    } else {
      state.currentBatch = state.leads;
    }

    state.isRemainingCohort = false;
    await triggerGeneration(state.currentBatch, false);
  }

  async function startRemainingGeneration() {
    const remainingLeads = state.leads.filter(lead => {
      return !state.results.some(r => isSameLead(r.lead, lead));
    });

    if (remainingLeads.length === 0) {
      showToast("No remaining leads to generate", "info");
      return;
    }

    const type = dom.selectCohortCount.value;
    let targetCount = remainingLeads.length;

    if (type === "custom") {
      const val = parseInt(dom.inputCustomCohortCount.value, 10);
      if (isNaN(val) || val <= 0) {
        showToast("Please enter a valid custom count", "error");
        return;
      }
      targetCount = val;
    } else if (type !== "all") {
      targetCount = parseInt(type, 10);
    }

    const batchToRun = remainingLeads.slice(0, targetCount);
    if (batchToRun.length === 0) {
      showToast("No leads match target count", "info");
      return;
    }

    state.currentBatch = batchToRun;
    state.isRemainingCohort = true;
    await triggerGeneration(batchToRun, true);
  }

  async function stopGenerationFlow(isRemaining) {
    if (state.jobId) {
      try {
        await fetch(`/api/cancel/${state.jobId}`, { method: "POST" });
      } catch (err) {
        console.error("Error sending cancellation request", err);
      }
    }

    if (state.evtSource) {
      state.evtSource.close();
      state.evtSource = null;
    }

    state.jobId = null;

    const bar = isRemaining ? dom.cohortProgressBar : dom.progressBar;
    const textEl = isRemaining ? dom.cohortProgressText : dom.progressText;
    const spinner = isRemaining ? dom.cohortProgressSpinner : dom.progressSpinner;

    textEl.textContent = "Stopped (Paused)";
    spinner.style.display = "none";
    showToast("Generation stopped", "info");

    if (isRemaining) {
      dom.btnStopCohort.style.display = "none";
      dom.btnResumeCohort.style.display = "inline-flex";
    } else {
      dom.btnStopGenerate.style.display = "none";
      dom.btnResumeGenerate.style.display = "inline-flex";
    }
  }

  async function resumeGenerationFlow(isRemaining) {
    const remainingInBatch = state.currentBatch.filter(lead => {
      return !state.results.some(r => isSameLead(r.lead, lead));
    });

    if (remainingInBatch.length === 0) {
      showToast("All leads in this batch are already processed", "info");
      if (isRemaining) {
        dom.cohortProgressContainer.style.display = "none";
      } else {
        resetGenerateButton();
      }
      return;
    }

    showToast("Resuming generation...", "info");
    await triggerGeneration(remainingInBatch, isRemaining);
  }

  function listenToProgress(jobId, batchLeads, isRemaining) {
    const bar = isRemaining ? dom.cohortProgressBar : dom.progressBar;
    const countEl = isRemaining ? dom.cohortProgressCount : dom.progressCount;
    const textEl = isRemaining ? dom.cohortProgressText : dom.progressText;
    const spinner = isRemaining ? dom.cohortProgressSpinner : dom.progressSpinner;
    const container = isRemaining ? dom.cohortProgressContainer : dom.progressContainer;

    state.evtSource = new EventSource(`/api/progress/${jobId}`);

    state.evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);

      const pct = data.total > 0 ? (data.completed / data.total) * 100 : 0;
      bar.style.width = `${pct}%`;
      countEl.textContent = `${data.completed} / ${data.total}`;

      if (data.currentLead) {
        const phaseLabel = data.currentPhase === "scraping" ? "Scraping" : "Generating copy for";
        textEl.textContent = `${phaseLabel} ${data.currentLead}...`;
      }

      if (data.results && data.results.length > 0) {
        mergeResults(data.results);
        renderResults();
      }

      if (data.done || data.status === "completed" || data.status === "cancelled" || data.status === "failed") {
        state.evtSource.close();
        state.evtSource = null;
        state.jobId = null;

        if (data.results) {
          mergeResults(data.results);
          renderResults();
        }

        if (data.status === "cancelled") {
          textEl.textContent = "Stopped (Paused)";
          spinner.style.display = "none";
          showToast("Generation stopped", "info");
          
          if (isRemaining) {
            dom.btnStopCohort.style.display = "none";
            dom.btnResumeCohort.style.display = "inline-flex";
          } else {
            dom.btnStopGenerate.style.display = "none";
            dom.btnResumeGenerate.style.display = "inline-flex";
          }
          return;
        }

        textEl.textContent = "Complete";
        spinner.style.display = "none";
        bar.style.width = "100%";

        setTimeout(() => {
          container.style.display = "none";
          
          if (isRemaining) {
            if (state.results.length === 0) {
              showToast("Generation failed. Check logs.", "error");
              dom.cohortBanner.style.display = "flex";
            } else {
              showToast("All emails successfully generated!", "success");
              if (state.results.length >= state.leads.length) {
                dom.cohortBanner.style.display = "none";
              }
            }
          } else {
            resetGenerateButton();
            if (state.results.length === 0) {
              showToast("Generation failed. No emails could be generated.", "error");
              if (data.errors && data.errors.length > 0) {
                const errorMsgs = data.errors.map(e => `${e.lead}: ${e.error}`).join("\n");
                alert(`Generation failed with the following errors:\n\n${errorMsgs}`);
              }
            } else {
              goToStep(3);
              if (state.leads.length > state.results.length) {
                dom.cohortTestCount.textContent = state.results.length;
                dom.cohortRemainingCount.textContent = state.leads.length - state.results.length;
                dom.cohortBanner.style.display = "flex";
              } else {
                dom.cohortBanner.style.display = "none";
              }
              showToast(`Test batch completed!`, "success");
            }
          }
        }, 600);

        if (data.errors && data.errors.length > 0) {
          console.warn("Generation errors:", data.errors);
        }
      }
    };

    state.evtSource.onerror = () => {
      if (state.evtSource) {
        state.evtSource.close();
        state.evtSource = null;
      }
      pollJob(jobId, batchLeads, isRemaining);
    };
  }

  async function pollJob(jobId, batchLeads, isRemaining) {
    const container = isRemaining ? dom.cohortProgressContainer : dom.progressContainer;
    try {
      const res = await fetch(`/api/job/${jobId}`);
      const data = await res.json();

      if (data.results && data.results.length > 0) {
        mergeResults(data.results);
        renderResults();
      }

      if (data.status === "completed") {
        container.style.display = "none";
        state.jobId = null;
        if (isRemaining) {
          if (state.results.length === 0) {
            showToast("Generation failed.", "error");
            dom.cohortBanner.style.display = "flex";
          } else {
            if (state.results.length >= state.leads.length) {
              dom.cohortBanner.style.display = "none";
            }
            showToast("Remaining emails generated!", "success");
          }
        } else {
          resetGenerateButton();
          if (state.results.length === 0) {
            showToast("Generation failed. No emails could be generated.", "error");
            if (data.errors && data.errors.length > 0) {
              const errorMsgs = data.errors.map(e => `${e.lead}: ${e.error}`).join("\n");
              alert(`Generation failed with the following errors:\n\n${errorMsgs}`);
            }
          } else {
            goToStep(3);
            if (state.leads.length > state.results.length) {
              dom.cohortTestCount.textContent = state.results.length;
              dom.cohortRemainingCount.textContent = state.leads.length - state.results.length;
              dom.cohortBanner.style.display = "flex";
            } else {
              dom.cohortBanner.style.display = "none";
            }
          }
        }
      } else if (data.status === "cancelled") {
        state.jobId = null;
        const textEl = isRemaining ? dom.cohortProgressText : dom.progressText;
        const spinner = isRemaining ? dom.cohortProgressSpinner : dom.progressSpinner;
        textEl.textContent = "Stopped (Paused)";
        spinner.style.display = "none";
        if (isRemaining) {
          dom.btnStopCohort.style.display = "none";
          dom.btnResumeCohort.style.display = "inline-flex";
        } else {
          dom.btnStopGenerate.style.display = "none";
          dom.btnResumeGenerate.style.display = "inline-flex";
        }
      } else if (data.status === "failed") {
        state.jobId = null;
        showToast("Generation failed", "error");
        resetGenerateButton();
      } else {
        if (state.jobId === jobId) {
          setTimeout(() => pollJob(jobId, batchLeads, isRemaining), 2000);
        }
      }
    } catch {
      if (state.jobId === jobId) {
        setTimeout(() => pollJob(jobId, batchLeads, isRemaining), 3000);
      }
    }
  }

  function resetGenerateButton() {
    dom.btnGenerate.disabled = false;
    if (state.leads.length > 5 && state.results.length === 0) {
      dom.btnGenerateText.textContent = "⚡ Generate 5 Test Copies";
    } else {
      dom.btnGenerateText.textContent = "⚡ Generate Emails";
    }
    dom.progressContainer.style.display = "none";
    dom.progressSpinner.style.display = "block";
    dom.btnStopGenerate.style.display = "none";
    dom.btnResumeGenerate.style.display = "none";
  }

  // -----------------------------------------------------------------------
  // Render Results
  // -----------------------------------------------------------------------
  function renderResults() {
    if (state.results.length === 0) {
      dom.resultsContainer.innerHTML = "";
      dom.resultsContainer.appendChild(dom.emptyResults);
      dom.resultsCount.textContent = "0";
      dom.emailsCount.textContent = "0";
      return;
    }

    if (dom.resultsContainer.contains(dom.emptyResults)) {
      dom.resultsContainer.innerHTML = "";
    }

    const currentRenderedCount = dom.resultsContainer.querySelectorAll(".lead-result").length;

    for (let idx = currentRenderedCount; idx < state.results.length; idx++) {
      const result = state.results[idx];
      const email = result.emails || {};
      const wordCount = countWords(email.body);

      const div = document.createElement("div");
      div.className = "lead-result";
      div.innerHTML = `
        <div class="lead-result__header">
          <div>
            <div class="lead-result__name">${escapeHtml(result.lead.agency_name || "Unknown Agency")}</div>
            <div class="lead-result__url">${escapeHtml(result.lead.website_url || "")}</div>
          </div>
          <div class="lead-result__status ${result.lead.scrape_status === "success" ? "success" : "failed"}">
            ${result.lead.scrape_status === "success" ? "● Scraped" : "○ No data"}
          </div>
        </div>
        <div class="lead-result__body" style="padding-top: 15px;">
          <div class="email-card active" data-lead="${idx}">
            <div class="email-card__subject"><span>Subject:</span> ${escapeHtml(email.subject || "")}</div>
            <div class="email-card__body">${escapeHtml(email.body || "")}</div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top: 15px;">
              <div class="word-count ${wordCount > 100 ? "over-limit" : ""}">${wordCount} words ${wordCount > 100 ? "(over 100 limit)" : ""}</div>
              <div class="email-card__actions">
                <button class="btn-copy" data-copy-subject="${escapeAttr(email.subject || "")}" data-copy-body="${escapeAttr(email.body || "")}">📋 Copy Email</button>
              </div>
            </div>
          </div>
        </div>
      `;
      dom.resultsContainer.appendChild(div);
    }

    dom.resultsCount.textContent = state.results.length;
    dom.emailsCount.textContent = state.results.length;

    // Bind copy click
    bindCopyButtons();
  }

  function bindCopyButtons() {
    document.querySelectorAll(".btn-copy").forEach((btn) => {
      btn.addEventListener("click", () => {
        const subject = btn.dataset.copySubject;
        const body = btn.dataset.copyBody;
        const text = `Subject: ${subject}\n\n${body}`;

        navigator.clipboard.writeText(text).then(() => {
          btn.classList.add("copied");
          btn.innerHTML = "✓ Copied";
          setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = "📋 Copy Email";
          }, 2000);
        });
      });
    });
  }

  // -----------------------------------------------------------------------
  // CSV Export
  // -----------------------------------------------------------------------
  function exportCSV() {
    if (state.results.length === 0) {
      showToast("No results to export", "error");
      return;
    }

    let headers = [];
    const rows = [];

    const hasOriginalHeaders = state.originalHeaders && state.originalHeaders.length > 0;

    if (hasOriginalHeaders) {
      headers = [...state.originalHeaders];
      if (!headers.includes("subject")) headers.push("subject");
      if (!headers.includes("copy")) headers.push("copy");
      rows.push(headers);

      state.results.forEach((result) => {
        const originalLead = state.leads.find(l => isSameLead(l, result.lead));
        const originalData = originalLead ? originalLead.originalData : null;
        const email = result.emails || {};

        const row = headers.map(h => {
          if (h === "subject") {
            return email.subject || "";
          }
          if (h === "copy") {
            return email.body || "";
          }
          if (originalLead && state.headerMapping) {
            if (h === state.headerMapping.agency_name) return originalLead.agency_name || "";
            if (h === state.headerMapping.website_url) return originalLead.website_url || "";
            if (h === state.headerMapping.contact_name) return originalLead.contact_name || "";
            if (h === state.headerMapping.contact_email) return originalLead.contact_email || "";
          }
          return originalData ? (originalData[h] || "") : "";
        });
        rows.push(row);
      });
    } else {
      headers = ["name", "email", "subject", "copy"];
      rows.push(headers);

      state.results.forEach((result) => {
        const lead = result.lead;
        const email = result.emails || {};
        
        const name = lead.contact_name || lead.agency_name || "";
        const emailAddress = lead.contact_email || "";
        const subject = email.subject || "";
        const copy = email.body || "";

        rows.push([name, emailAddress, subject, copy]);
      });
    }

    const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `connector_emails_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast("CSV exported successfully", "success");
  }

  // -----------------------------------------------------------------------
  // Start over
  // -----------------------------------------------------------------------
  function startOver() {
    state.results = [];
    state.leads = [];
    state.jobId = null;
    state.currentBatch = [];
    state.activeTabs = {};
    state.originalHeaders = null;
    state.headerMapping = null;
    if (state.evtSource) {
      state.evtSource.close();
      state.evtSource = null;
    }
    localStorage.removeItem("leads");
    localStorage.removeItem("results");
    localStorage.removeItem("currentStep");
    localStorage.removeItem("originalHeaders");
    localStorage.removeItem("headerMapping");
    dom.cohortBanner.style.display = "none";
    dom.cohortProgressContainer.style.display = "none";
    clearAllLeads();
    goToStep(1);
  }

  // -----------------------------------------------------------------------
  // Toast notifications
  // -----------------------------------------------------------------------
  function showToast(message, type = "info") {
    dom.toast.textContent = message;
    dom.toast.className = `toast ${type}`;
    requestAnimationFrame(() => {
      dom.toast.classList.add("show");
    });
    setTimeout(() => {
      dom.toast.classList.remove("show");
    }, 3500);
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter((w) => w).length;
  }

  // -----------------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", init);
})();
