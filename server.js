require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "keys.json");
app.use(express.json({ limit: "10mb" }));
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
// Ashish AI: Text + Image support. API key stays on server.

app.post("/api/ai/chat", async (req, res) => {
  const question = String(
    req.body?.question || req.body?.message || ""
  ).trim();

  const image = req.body?.image || "";

  if (!question && !image) {
    return res.status(400).json({
      error: "Please enter a question or select an image."
    });
  }

  if (question.length > 4000) {
    return res.status(400).json({
      error: "Question must be under 4,000 characters."
    });
  }

  let imagePart = null;

  if (image) {
    const match = image.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "Please select a JPG, PNG or WEBP image."
      });
    }

    const mimeType = match[1];
    const base64Data = match[2].replace(/\s/g, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    if (
      imageBuffer.length === 0 ||
      imageBuffer.length > 6 * 1024 * 1024
    ) {
      return res.status(413).json({
        error: "Image must be smaller than 6 MB."
      });
    }

    imagePart = {
      inlineData: {
        mimeType,
        data: imageBuffer.toString("base64")
      }
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: "Gemini API key is missing."
    });
  }

  const models = [
    process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.8-flash"
  ];

  const uniqueModels = [...new Set(models)];
  let lastError = "";

  const prompt = question ||
    "Please carefully read this image and explain the question and its answer step by step.";

  const parts = [];

  if (imagePart) parts.push(imagePart);
  parts.push({ text: prompt });

  for (const model of uniqueModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(
          `Ashish AI: Trying ${model}, attempt ${attempt}`
        );

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{
                  text: `You are Ashish AI, a friendly and intelligent study tutor.
Answer in the same language as the student.
Understand uploaded images, read questions from photos,
and solve them accurately.
Explain answers step by step.
For mathematics, show formulas and calculations.
Help with science, English, history and general knowledge.
Keep answers clear and easy to understand.`
                }]
              },
              contents: [{
                role: "user",
                parts
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
          lastError = data.error?.message ||
            "Gemini request failed.";

          console.error(
            `Gemini ${model} error:`,
            response.status,
            lastError
          );

          if ([429, 500, 503, 404].includes(response.status)) {
            break;
          }

          return res.status(502).json({
            error: lastError
          });
        }

        const answer = data.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("")
          .trim();

        if (answer) {
          return res.json({ answer, model });
        }

        lastError = "The AI returned an empty response.";
        break;

      } catch (error) {
        lastError = error.message || "Network error";
        console.error("Ashish AI error:", lastError);

        if (attempt === 1) {
          await new Promise(resolve =>
            setTimeout(resolve, 1000)
          );
        }
      }
    }
  }

  return res.status(503).json({
    error: "Ashish AI is temporarily busy. Please try again.",
    details: lastError
  });
});
app.get("/api/health", (_req, res) => res.json({ ok: true, app: "AshishHub" }));
app.listen(PORT, () => console.log(`AshishHub running on http://localhost:${PORT}`));
