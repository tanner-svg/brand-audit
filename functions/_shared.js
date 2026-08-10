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

// Shared between report.js (which scores against these) and the email
// template below (which needs the same labels to render the checklist),
// so there is one place that defines the 12 execution statements.
export const CHECKLIST_LABELS = [
  "Buttons are consistent in size, shape, and style",
  "Buttons and links work as expected",
  "The site resizes well across devices",
  "The logo stays legible at small scale",
  "The logo holds up cleanly at large scale",
  "Colors and fonts stay consistent across posts and pages",
  "Images feel consistent, not generic stock",
  "A favicon is set on the website",
  "The social grid or cover images have a visual rhythm",
  "Writing style stays consistent across pages and posts",
  "Padding and text alignment are consistent",
  "A clear grid system underlies the layout"
];

// Which uploaded asset(s) each checklist item depends on. An item is
// only judged if at least one required asset was actually provided,
// otherwise report.js marks it not_applicable instead of guessing.
export const CHECKLIST_ASSET_REQUIREMENTS = [
  ["site"],           // Buttons are consistent in size, shape, and style
  ["site"],           // Buttons and links work as expected
  ["site"],           // The site resizes well across devices
  ["logo"],           // The logo stays legible at small scale
  ["logo"],           // The logo holds up cleanly at large scale
  ["site", "social"], // Colors and fonts stay consistent across posts and pages
  ["site", "social"], // Images feel consistent, not generic stock
  ["site"],           // A favicon is set on the website
  ["social"],         // The social grid or cover images have a visual rhythm
  ["site", "social"], // Writing style stays consistent across pages and posts
  ["site"],           // Padding and text alignment are consistent
  ["site"]            // A clear grid system underlies the layout
];

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreColor(score) {
  return score === "Aligned" ? "#1F5C55" : "#D7432A";
}

function chipRow(words) {
  if (!words || !words.length) { return ""; }
  return words.map(function (w) {
    return '<span style="display:inline-block;font-family:Georgia,serif;font-size:11px;'
      + 'letter-spacing:.04em;text-transform:uppercase;border:1px solid #E1DDD0;'
      + 'border-radius:999px;padding:4px 10px;margin:0 6px 6px 0;color:#3E0000;">'
      + escapeHtml(w) + "</span>";
  }).join("");
}

function flagList(items) {
  if (!items || !items.length) {
    return '<p style="font-size:13px;color:#83806F;margin:8px 0 0;">Nothing here reads against the stated direction.</p>';
  }
  return '<ul style="margin:8px 0 0;padding-left:18px;">' + items.map(function (f) {
    return '<li style="font-size:14px;margin-bottom:4px;">' + escapeHtml(f) + "</li>";
  }).join("") + "</ul>";
}

function conflictBlocks(conflicts) {
  if (!conflicts || !conflicts.length) {
    return '<p style="font-size:13px;color:#83806F;margin:8px 0 0;">The visual and verbal reads broadly line up.</p>';
  }
  return conflicts.map(function (c) {
    return '<div style="border-left:3px solid #D7432A;background:#F8DED5;padding:10px 14px;margin-top:10px;">'
      + '<div style="font-weight:700;font-size:14px;">' + escapeHtml(c.issue) + "</div>"
      + '<div style="font-size:13px;margin-top:4px;">' + escapeHtml(c.example) + "</div>"
      + "</div>";
  }).join("");
}

function checklistRows(checklist) {
  return CHECKLIST_LABELS.map(function (label, i) {
    var item = (checklist && checklist[i]) || { flagged: false, note: "" };
    if (item.not_applicable) { return ""; }
    var icon = item.flagged
      ? '<span style="color:#D7432A;">&#10005;</span>'
      : '<span style="color:#1F5C55;">&#10003;</span>';
    var note = item.note ? '<div style="font-size:11px;color:#83806F;margin-top:2px;">' + escapeHtml(item.note) + "</div>" : "";
    return '<tr><td style="padding:8px 10px 8px 0;border-bottom:1px solid #E1DDD0;width:20px;vertical-align:top;">' + icon + "</td>"
      + '<td style="padding:8px 0;border-bottom:1px solid #E1DDD0;font-size:14px;">' + escapeHtml(label) + note + "</td></tr>";
  }).join("");
}

function emailSection(title, innerHtml) {
  return '<div style="margin-top:28px;padding-top:16px;border-top:1px solid #E1DDD0;">'
    + '<div style="font-family:Georgia,serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#D7432A;">' + title + "</div>"
    + innerHtml
    + "</div>";
}

// Renders the audit result as a self-contained HTML email (inline styles
// only, since most mail clients strip a <style> block). Mirrors the
// sections shown on the report screen in public/index.html, just laid
// out for reading in an inbox instead of a browser.
export function buildReportEmailHTML(name, companyName, report) {
  var firstName = (name || "").trim().split(" ")[0];
  var greeting = firstName ? "Hi " + escapeHtml(firstName) + "," : "Hi,";
  var scoreCol = scoreColor(report.overall_score);

  var fuzzSource = (report.fuzz_source && report.overall_score !== "Aligned")
    ? emailSection("WHERE THE FUZZ IS COMING FROM", '<p style="background:#F8DED5;padding:14px 16px;margin-top:10px;font-size:14px;">' + escapeHtml(report.fuzz_source) + "</p>")
    : "";

  return ''
    + '<div style="font-family:Georgia,serif;color:#3E0000;background:#FCF8F3;padding:32px 20px;">'
    + '<div style="max-width:600px;margin:0 auto;background:#FFFFFF;padding:32px;border:1px solid #E1DDD0;">'
    + '<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;border:1.5px solid #3E0000;border-radius:999px;display:inline-block;padding:6px 14px;">Nectarine Diagnostic</div>'
    + '<h1 style="font-family:Georgia,serif;font-size:24px;margin:16px 0 4px;">' + escapeHtml(report.business_name || companyName || "Your brand") + "</h1>"
    + '<p style="font-size:14px;color:#83806F;margin:0 0 20px;">' + greeting + " your Brand Alignment Audit is ready.</p>"
    + '<div style="font-family:Georgia,serif;font-weight:700;font-size:34px;color:' + scoreCol + ';">' + escapeHtml(report.overall_score) + "</div>"
    + '<p style="font-style:italic;font-size:15px;margin-top:10px;">' + escapeHtml(report.snapshot) + "</p>"

    + emailSection("VISUAL IDENTITY",
        '<div style="margin-top:8px;">' + chipRow(report.visual_tone) + "</div>"
        + '<p style="font-size:14px;margin-top:8px;">' + escapeHtml(report.visual_findings) + "</p>"
        + flagList(report.visual_red_flags))

    + emailSection("VERBAL IDENTITY",
        '<div style="margin-top:8px;">' + chipRow(report.verbal_tone) + "</div>"
        + '<p style="font-size:14px;margin-top:8px;">' + escapeHtml(report.verbal_findings) + "</p>"
        + flagList(report.verbal_red_flags))

    + emailSection("VISUAL / VERBAL ALIGNMENT",
        '<p style="font-size:14px;margin-top:8px;">' + escapeHtml(report.alignment_summary) + "</p>"
        + '<div style="margin-top:8px;">' + chipRow(report.alignment_overlap) + "</div>"
        + conflictBlocks(report.alignment_conflicts))

    + emailSection("MARKET AND AUDIENCE FIT",
        '<p style="font-size:14px;margin-top:8px;">' + escapeHtml(report.market_category_norms) + "</p>"
        + '<p style="font-size:14px;margin-top:8px;">' + escapeHtml(report.market_audience_match) + "</p>")

    + emailSection("EXECUTION AND CONSISTENCY",
        '<table style="width:100%;border-collapse:collapse;margin-top:8px;">' + checklistRows(report.execution_checklist) + "</table>")

    + fuzzSource

    + '<p style="font-size:12px;color:#83806F;margin-top:32px;text-align:center;">Sent by Nectarine. Reply to this email with any questions.</p>'
    + "</div>"
    + "</div>";
}

// Emails the finished audit through Resend. Requires RESEND_API_KEY as a
// secret. RESEND_FROM_EMAIL and RESEND_CC_EMAILS are optional plain vars
// (see wrangler.toml) that override the nectarine.ink defaults below.
// RESEND_CC_EMAILS is comma separated, set it to an empty string to send
// with no CC. The from address must be on a domain verified in Resend
// or delivery will fail.
export async function sendReportEmail(env, options) {
  var to = options.to;
  var name = options.name;
  var companyName = options.companyName;
  var report = options.report;

  if (!env.RESEND_API_KEY) {
    throw new Error("Email delivery is not configured (missing RESEND_API_KEY)");
  }

  var from = env.RESEND_FROM_EMAIL || "Nectarine Brand Audit <audit@nectarine.ink>";
  var cc = (env.RESEND_CC_EMAILS !== undefined ? env.RESEND_CC_EMAILS : "hello@nectarine.ink")
    .split(",")
    .map(function (e) { return e.trim(); })
    .filter(Boolean);
  var subject = "Your Brand Alignment Audit for " + (companyName || "your brand") + ": " + report.overall_score;
  var html = buildReportEmailHTML(name, companyName, report);

  var body = {
    from: from,
    to: [to],
    subject: subject,
    html: html
  };
  if (cc.length) { body.cc = cc; }

  var resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(function () { return ""; });
    throw new Error("Resend request failed (" + resp.status + ")" + (text ? ": " + text.slice(0, 300) : ""));
  }

  return await resp.json();
}
