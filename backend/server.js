const express = require("express");
const cors    = require("cors");
const axios   = require("axios");

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static("public"));

// const FLOWABLE_BASE = process.env.FLOWABLE_BASE || "http://localhost:8080/flowable-ui/process-api";
const FLOWABLE_BASE = process.env.FLOWABLE_BASE || "http://localhost:8080/flowable-ui/process-api";
const FLOWABLE_AUTH = "Basic " + Buffer.from("admin:test").toString("base64");

// ─────────────────────────────────────────────────────────────────────────────
// BINARY PROXY — must be registered BEFORE the generic JSON proxy below.
//
// WHY ORDER MATTERS:
//   Express matches app.use('/flowable-api') before any specific app.get()
//   routes registered afterwards. If the generic proxy is first, it consumes
//   every /flowable-api/* request and calls res.json() on the response —
//   which corrupts binary PNG data into garbage. These binary routes must
//   come first so Express reaches them before the catch-all.
//
// ROUTES HANDLED HERE:
//   1. /flowable-api/repository/deployments/:id/resourcedata/:filename
//      → The correct image URL used by WorkflowView (diagramResource path
//        with "resources" swapped to "resourcedata").
//
//   2. /flowable-api/repository/process-definitions/:id/image
//      → Legacy image endpoint kept for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────────

// Route 1 — resourcedata (binary PNG from deployment)
app.get(
  '/flowable-api/repository/deployments/:deploymentId/resourcedata/:filename',
  async (req, res) => {
    const { deploymentId, filename } = req.params;
    const targetUrl = `${FLOWABLE_BASE}/repository/deployments/${deploymentId}/resourcedata/${filename}`;

    console.log(`\n[BINARY] GET ${targetUrl}`);

    try {
      // Use node-fetch / built-in fetch to get raw binary — axios with
      // responseType: 'arraybuffer' also works equally well.
      const upstream = await fetch(targetUrl, {
        headers: { Authorization: FLOWABLE_AUTH },
      });

      if (!upstream.ok) {
        console.error(`[BINARY] ❌ upstream ${upstream.status}`);
        return res.status(upstream.status).end();
      }

      const contentType = upstream.headers.get('Content-Type') || 'image/png';
      console.log(`[BINARY] ✅ ${upstream.status} content-type: ${contentType}`);

      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'no-store'); // prevent stale 304 responses

      const buffer = await upstream.arrayBuffer();
      return res.send(Buffer.from(buffer));

    } catch (err) {
      console.error('[BINARY] ❌ fetch error', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Route 2 — legacy /image endpoint (kept for backward compatibility)
app.get(
  '/flowable-api/repository/process-definitions/:id/image',
  async (req, res) => {
    const targetUrl = `${FLOWABLE_BASE}/repository/process-definitions/${req.params.id}/image`;

    console.log(`\n[BINARY] GET ${targetUrl}`);

    try {
      const upstream = await fetch(targetUrl, {
        headers: { Authorization: FLOWABLE_AUTH },
      });

      if (!upstream.ok) {
        console.error(`[BINARY] ❌ upstream ${upstream.status}`);
        return res.status(upstream.status).end();
      }

      const contentType = upstream.headers.get('Content-Type') || 'image/png';
      console.log(`[BINARY] ✅ ${upstream.status} content-type: ${contentType}`);

      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'no-store');

      const buffer = await upstream.arrayBuffer();
      return res.send(Buffer.from(buffer));

    } catch (err) {
      console.error('[BINARY] ❌ fetch error', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC JSON PROXY — handles all other /flowable-api/* requests.
//
// Registered AFTER the binary routes above so it only catches non-image
// requests. Uses res.json() which is correct for JSON API responses but
// would corrupt binary data — hence why the binary routes come first.
// ─────────────────────────────────────────────────────────────────────────────
app.use('/flowable-api', async (req, res) => {
  const targetUrl = `${FLOWABLE_BASE}${req.path}`;
  const queryString = Object.keys(req.query).length
    ? '?' + new URLSearchParams(req.query).toString()
    : '';

  console.log(`\n[PROXY] ${req.method} ${targetUrl}${queryString}`);

  try {
    const response = await axios({
      method:  req.method,
      url:     targetUrl + queryString,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': FLOWABLE_AUTH,
      },
      data:    ['POST', 'PUT'].includes(req.method) ? req.body : undefined,
      timeout: 30000,
    });

    console.log(`[PROXY] ✅ ${response.status}`);
    return res.status(response.status).json(response.data);

  } catch (err) {
    const status  = err.response?.status || 500;
    const message = err.response?.data   || err.message;
    console.error(`[PROXY] ❌ ${status}`, message);
    return res.status(status).json({ error: message });
  }
});

// ── POST /start-process ──────────────────────────────────────
app.post("/start-process", async (req, res) => {
  const { fullName, emailAddress } = req.body;
  if (!fullName || !emailAddress) {
    return res.status(400).json({ success: false, error: "Missing fullName or emailAddress" });
  }
  try {
    const response = await axios.post(
      `${FLOWABLE_BASE}/runtime/process-instances`,
      {
        processDefinitionKey: "registrationWorkflow",
        variables: [
          { name: "fullName",     value: fullName,     type: "string" },
          { name: "emailAddress", value: emailAddress, type: "string" }
        ]
      },
      { headers: { "Content-Type": "application/json", "Authorization": FLOWABLE_AUTH }, timeout: 30000 }
    );
    return res.json({ success: true, data: response.data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// ── POST /login ──────────────────────────────────────────────
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Missing email or password" });
  }
  if (email === "abc@gmail.com" && password === "123") {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: "Invalid email or password." });
});

// ── GET /health ──────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(3000, () => {
  console.log("\n🚀 Node server  → http://localhost:3000");
  console.log(`   Flowable      → ${FLOWABLE_BASE}`);
  console.log(`   Proxy         → /flowable-api → Flowable\n`);
});
