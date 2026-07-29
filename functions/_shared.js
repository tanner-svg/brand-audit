// Shared helpers for the Fuzz Tax audit backend.
// Filename starts with an underscore so Cloudflare Pages does not treat
// it as a route, it is only importable from other functions.

export async function callClaude(system, content, maxTokens, env) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens || 1000,
      system: system,
      messages: [{ role: "user", content: content }]
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(function () { return ""; });
    throw new Error("Claude request failed (" + resp.status + ")" + (text ? ": " + text.slice(0, 300) : ""));
  }

  const data = await resp.json();
  const blocks = (data.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; });
  return extractJSON(blocks.join("\n"));
}

function extractJSON(text) {
  var cleaned = (text || "").trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  var start = cleaned.indexOf("{");
  var end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) { cleaned = cleaned.slice(start, end + 1); }
  return JSON.parse(cleaned);
}

// Renders a live screenshot via Cloudflare's Browser Rendering REST API
// and returns the raw JPEG bytes. Requires CF_ACCOUNT_ID and CF_API_TOKEN
// (a Cloudflare API token scoped to "Browser Rendering - Edit") as secrets.
export async function captureScreenshot(targetUrl, env) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    throw new Error("Screenshot capture is not configured (missing CF_ACCOUNT_ID or CF_API_TOKEN)");
  }
  const resp = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/browser-rendering/screenshot",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.CF_API_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: targetUrl,
        viewport: { width: 1280, height: 900 },
        gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
        screenshotOptions: { type: "jpeg", quality: 78, fullPage: false }
      })
    }
  );

  if (!resp.ok) {
    const text = await resp.text().catch(function () { return ""; });
    throw new Error("Cloudflare returned " + resp.status + (text ? ": " + text.slice(0, 200) : ""));
  }

  return await resp.arrayBuffer();
}

export function arrayBufferToBase64(buffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var chunkSize = 0x8000;
  for (var i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function buildAnswersText(companyName, answers) {
  var lines = [];
  if (companyName) { lines.push("Company name: " + companyName); }
  (answers || []).forEach(function (a, i) {
    lines.push((i + 1) + ". " + a.question + "\nAnswer: " + a.answer);
  });
  return lines.join("\n\n");
}
