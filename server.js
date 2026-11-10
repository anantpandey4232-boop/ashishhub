require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "keys.json");
app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "public")));

function readKeys() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}
function writeKeys(keys) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
}
function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}
function timingSafeEqualText(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

// Generate a key only after the server-side admin PIN is checked.
app.post("/api/admin/keys", (req, res) => {
  const pin = req.get("x-admin-pin") || "";
  if (!process.env.ADMIN_PIN || !timingSafeEqualText(pin, process.env.ADMIN_PIN)) {
    return res.status(401).json({ error: "Incorrect admin PIN." });
  }
  const key = "ASHISH-" + crypto.randomBytes(8).toString("hex").toUpperCase();
  const keys = readKeys();
  keys.push({ hash: hashKey(key), createdAt: new Date().toISOString(), used: false });
  writeKeys(keys);
  res.json({ key });
});

// Validate a key. By default a key is reusable; set ONE_TIME_KEYS=true to consume it once.
app.post("/api/keys/validate", (req, res) => {
  const key = String(req.body.key || "").trim().toUpperCase();
  if (!/^ASHISH-[A-F0-9]{16}$/.test(key)) return res.status(401).json({ error: "Invalid access key." });
  const keys = readKeys();
  const hash = hashKey(key);
  const item = keys.find(k => timingSafeEqualText(k.hash, hash));
  if (!item || (process.env.ONE_TIME_KEYS === "true" && item.used)) {
    return res.status(401).json({ error: "Invalid or already-used access key." });
  }
  if (process.env.ONE_TIME_KEYS === "true") {
    item.used = true;
    item.usedAt = new Date().toISOString();
    writeKeys(keys);
  }
  res.json({ valid: true });
});

// AI provider call stays on the server; the API key is never sent to the browser.

// Gemini AI provider call stays on the server.
app.post("/api/ai/chat", async (req, res) => {
  const question = String(req.body.question || req.body.message || "").trim();
  if (!question || question.length > 4000) {
    return res.status(400).json({
      error: "Enter a question (up to 4,000 characters)."
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Gemini AI is not configured. Add GEMINI_API_KEY in Render."
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-3.8-flash"}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "You are Ashish AI, a friendly study tutor. Explain clearly and step by step. Use the student's language when possible. Help with maths, science, English and general school subjects. If solving a numerical problem, show the method."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: question }]
          }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: data.error?.message || "Gemini AI request failed."
      });
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    res.json({
      answer: answer || "I couldn't generate an answer. Please try again."
    });

  } catch (err) {
    res.status(500).json({
      error: "Gemini AI service is temporarily unavailable."
    });
  }
});


app.get("/api/health", (_req, res) => res.json({ ok: true, app: "AshishHub" }));
app.listen(PORT, () => console.log(`AshishHub running on http://localhost:${PORT}`));
