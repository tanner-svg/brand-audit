import { callClaude, captureScreenshot, arrayBufferToBase64, buildAnswersText, CHECKLIST_LABELS, CHECKLIST_ASSET_REQUIREMENTS, sendReportEmail } from "../_shared.js";

const VISUAL_VERBAL_SYSTEM = "You are the analysis engine behind Nectarine's Brand Alignment Audit, a diagnostic tool that checks whether a brand's visual identity and its narrative actually align.\n\nVoice rules for every field you write: never use em dashes, use commas or periods instead. Never use the word we. Speak plainly, no corporate buzzwords, no AI-sounding language, no dramatic tone. Every claim must point to something specific you can see in the images or read in the answers, never a generic assertion. Be extremely concise, this output must be short.\n\nTreat the client's stated mission, vision, values, and audience as their own intent and guidance, not as rules to grade compliance against. Never frame a finding as a violation, for example never write that something is clearly not what they claim it is. Instead, note where the current execution may not yet fully express that stated intent, phrased as something worth their attention, not a fault.\n\nVisual and verbal norms vary by industry and audience segment, there is no single correct look or voice. Avoid absolute judgments about color, imagery, or type choices. Where something seems worth flagging, hedge it, for example this may skew from the audience described, or worth considering whether this is an intentional choice that could be articulated more clearly, rather than declaring it wrong.\n\nSome brands intentionally bridge two worlds, for example rustic and upscale, playful and expert, grassroots and institutional. The client was asked directly what worlds their business connects and where their offering sits between them, so check that answer first. If it, or the mission, or the how-they-want-to-be-perceived answer, points to a deliberate duality, don't read mixed or spanning signals in the visuals or the writing as a fault. Name the duality plainly in your findings instead, and reserve any concern for whether both sides of it are actually coming through clearly, not for the duality itself.\n\nYou will receive the client's company name and answers about their business, mission, values, audience, the worlds their business connects, and industry, plus uploaded images (their logo and or website and social screenshots, if provided).\n\nDo two independent reads.\n\nVISUAL READ. Look only at the images provided. In priority order, consider imagery and photography style, color, typography, layout, iconography, motion if visible, and whitespace, relative to general norms for the client's stated industry and audience, not a fixed standard. Produce 3 to 5 adjectives that describe the personality these choices actually project. Then write 2 to 3 sentences of findings citing specific things you see, framed as observations rather than verdicts. Note anything worth a second look as a short, hedged phrase, for example imagery that repeats or reads generic, no favicon or a default platform placeholder, a logo shown in a way that may not have been intended, strong default-AI-tool patterns like purple gradients or outlined buttons with no apparent connection to the brand, or a type pairing that may not be deliberate. Phrase each as worth reconsidering, not as a mistake.\n\nVERBAL READ. Look only at the client's text answers. If specific values weren't given directly, infer likely values from the stated mission or why answer instead, and don't treat the absence of a named values list as a gap, plenty of brands haven't put values into words yet. Produce 3 to 5 adjectives that describe the personality the writing projects. Then write 2 to 3 sentences of findings, framed as observations rather than verdicts. Note anything worth a second look as a short, hedged phrase, for example a claim of being different that isn't yet demonstrated, values named without much shown behind them yet, copy that seems to address several audiences at once, a target customer that isn't fully pinned down, or offerings described in general terms. Phrase each as worth tightening, not as a flaw.\n\nIf no images were provided, or an image is a generic loading placeholder, a blank page, or a login or consent wall rather than real brand content, say so plainly in visual findings rather than inventing a read. If a note explains that an automatic screenshot capture failed, say so plainly as well rather than inventing a read.\n\nReturn only valid JSON, no markdown fences, no extra text, in this exact shape:\n{\n  \"visual_tone\": [\"word\", \"word\", \"word\"],\n  \"visual_findings\": \"...\",\n  \"visual_red_flags\": [\"...\"],\n  \"verbal_tone\": [\"word\", \"word\", \"word\"],\n  \"verbal_findings\": \"...\",\n  \"verbal_red_flags\": [\"...\"]\n}\nUse empty arrays where nothing applies. Keep every string under 40 words.";

const ALIGNMENT_SCORE_SYSTEM = "You are the analysis engine behind Nectarine's Brand Alignment Audit. You already have an independent visual read and verbal read of a prospective client's brand from a prior step. Now finish the diagnosis.\n\nVoice rules: never use em dashes, never say we, no buzzwords, no AI-sounding language, stay evidence-based and concise. This output must be short.\n\nTreat the client's stated mission, vision, values, and audience as their own intent and guidance, not as rules to grade compliance against. Never frame a finding as a violation, for example never write that something is clearly not what they claim it is. Note where the current execution may not yet fully express that stated intent, phrased as something worth their attention, not a fault. Industry and audience norms are a loose reference point, not a fixed rule, so hedge anything that looks like a deviation, for example this may skew from the audience described, or worth considering whether this is intentional and could be articulated more clearly, rather than declaring it wrong. If the client didn't name specific values, that's expected, not a gap, work from values implied by their mission instead and never call out the absence of a named values list.\n\nSome brands intentionally bridge two worlds, for example rustic and upscale, playful and expert, grassroots and institutional. The client was asked directly what worlds their business connects and where their offering sits between them, so check that answer first. Before treating a divergence between the visual tone and the verbal tone, or a break from category norms, as a gap, check whether that answer, or the mission, or the how-they-want-to-be-perceived answer, points to a deliberate duality. If so, do not list it as a conflict or count it against the score. Describe the intentional bridge in the alignment summary instead, and only flag it as worth attention if just one side of the bridge is actually showing up, or if the two sides read as clashing rather than complementing each other.\n\nYou will receive the visual tone words and findings, the verbal tone words and findings, the client's company name, and the client's answers about industry, comparable brands, audience, and the worlds their business connects.\n\nALIGNMENT. In one sentence, describe how closely the visual tone and verbal tone track each other, without declaring a pass or fail. List any overlapping words or themes. If what looks like divergence is actually an intentional bridge between two worlds the client described, say so here instead of listing it as a conflict. List anything that still seems worth the client's attention where the two diverge without a clear intentional throughline, each as a short, hedged observation plus a specific example, for example the tone reads more reserved visually than the mission suggests, worth considering whether that gap is intentional, rather than these do not match.\n\nMARKET AND AUDIENCE FIT. In 2 to 3 sentences, place this brand against general norms for its stated industry and comparable brands, treating those norms as a loose reference point rather than a rule. If it breaks from those norms, frame that as a choice worth being intentional about, not an error, and note whether the client's own narrative already backs that break up. In 1 to 2 sentences, note whether the audience implied by the visual tone lines up with the audience the client described, phrased as this may skew from, or worth considering whether, rather than a verdict.\n\nEXECUTION CHECKLIST. You will be given a fixed numbered list of 12 positive statements about execution and consistency, for example a favicon is set on the website, plus a line stating which assets were actually provided for this audit (logo, website screenshot, social screenshot). Some items only apply to certain assets, for those tied to an asset marked not provided, set flagged to false and leave the note empty, these are not applicable and will be excluded from the report regardless of what you return. For the remaining items, set flagged to true only if you have clear, specific evidence the statement does not hold and the gap would actually read as unintentional to a visitor, not for minor natural variation, for example a couple of button styles that still read as one system is not on its own evidence of a problem. Otherwise set flagged to false, meaning it looks fine as far as you can tell. Add a short note under 10 words only when flagged is true, phrased as something worth checking into, never as a verdict, for example worth a look, button styles vary across pages rather than button styles are inconsistent. Otherwise leave the note as an empty string. Do not guess at things you have no evidence for, such as whether links work or the site resizes properly, unless the findings mention it, default those to false with an empty note rather than assuming a problem. Return exactly 12 objects in the same order as given.\n\nSCORE. Choose one of three: Aligned, Some Fuzz, Significant Fuzz. These describe how clearly the current execution expresses the client's own stated intent right now, not a judgment of the intent itself.\nAligned: the mission, values, audience, and goals the client described come through consistently across both visual and verbal, well done.\nSome Fuzz: some dimensions come through clearly, others don't yet. In one to two sentences, offer a constructive read on where that gap likely sits, for example whether it looks more like a build or execution gap, where the direction is clear but hasn't fully landed yet, or a definition gap, where the direction itself could use more clarity. Frame this as a next step worth taking, not a shortfall.\nSignificant Fuzz: the mission, values, and audience described aren't yet clearly coming through in either the visual or the verbal execution, and there's not yet a clear throughline connecting them. Frame this constructively, as a starting point for bringing the pieces into alignment. Both gaps are often present together at this stage, that's normal, not a failure.\n\nAlso write a snapshot of 2 to 3 sentences giving the headline finding, written like the opening of a supportive diagnostic report, constructive in tone even when the score is Some Fuzz or Significant Fuzz. You do not need to guess a business name, the client's stated company name is used directly for that.\n\nReturn only valid JSON, no markdown fences, no extra text, in this exact shape:\n{\n  \"snapshot\": \"...\",\n  \"alignment_summary\": \"...\",\n  \"alignment_overlap\": [\"...\"],\n  \"alignment_conflicts\": [{\"issue\": \"...\", \"example\": \"...\"}],\n  \"market_category_norms\": \"...\",\n  \"market_audience_match\": \"...\",\n  \"execution_checklist\": [{\"flagged\": true, \"note\": \"...\"}],\n  \"overall_score\": \"Aligned\",\n  \"fuzz_source\": \"...\"\n}\nfuzz_source should be null if overall_score is Aligned.";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return new Response("Anthropic API key is not configured on the server", { status: 500 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  try {
    const visual = await buildVisualContent(payload, env);
    const visualVerbalResult = await callClaude(VISUAL_VERBAL_SYSTEM, visual.content, 1500, env);

    const checklistText = CHECKLIST_LABELS.map(function (l, i) { return (i + 1) + ". " + l; }).join("\n");
    const assetsText = "Assets provided: logo " + (visual.assets.logo ? "yes" : "no")
      + ", website screenshot " + (visual.assets.site ? "yes" : "no")
      + ", social screenshot " + (visual.assets.social ? "yes" : "no");
    const scoreText = ""
      + "Company name: " + (payload.companyName || "(not given)") + "\n\n"
      + "Visual tone: " + (visualVerbalResult.visual_tone || []).join(", ") + "\n"
      + "Visual findings: " + visualVerbalResult.visual_findings + "\n"
      + "Visual red flags: " + (visualVerbalResult.visual_red_flags || []).join("; ") + "\n\n"
      + "Verbal tone: " + (visualVerbalResult.verbal_tone || []).join(", ") + "\n"
      + "Verbal findings: " + visualVerbalResult.verbal_findings + "\n"
      + "Verbal red flags: " + (visualVerbalResult.verbal_red_flags || []).join("; ") + "\n\n"
      + "Client answers:\n" + buildAnswersText(payload.companyName, payload.answers) + "\n\n"
      + assetsText + "\n\n"
      + "Execution checklist items, in order:\n" + checklistText;

    const scoreResult = await callClaude(ALIGNMENT_SCORE_SYSTEM, [{ type: "text", text: scoreText }], 3000, env);
    const report = normalizeReport(visualVerbalResult, scoreResult, payload.companyName, visual.assets);

    // The report already generated successfully at this point, so an
    // email hiccup should never turn into a failed request and cost the
    // person their result. Attempt delivery, then attach the outcome to
    // the response so the front end can show whether it went out.
    const toEmail = (payload.leadEmail || "").trim();
    if (toEmail) {
      try {
        await sendReportEmail(env, { to: toEmail, name: payload.leadName, companyName: payload.companyName, report: report });
        report.email = { sent: true, to: toEmail };
      } catch (err) {
        report.email = { sent: false, to: toEmail, error: err.message };
      }
    } else {
      report.email = { sent: false, to: null, error: null };
    }

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response("Report generation failed: " + err.message, { status: 502 });
  }
}

async function buildVisualContent(payload, env) {
  const contextLines = ["Client answers so far:\n\n" + buildAnswersText(payload.companyName, payload.answers)];
  if (payload.site) { contextLines.push("Website: " + payload.site); }
  if (payload.social) { contextLines.push("Social profile: " + payload.social); }
  const visualContent = [{ type: "text", text: contextLines.join("\n\n") }];
  let hasImage = false;
  // Tracks which assets actually produced a usable image, a failed
  // capture does not count, since there is nothing for the checklist
  // to judge in that case either.
  const assets = { logo: false, site: false, social: false };

  if (payload.logo && payload.logo.data) {
    hasImage = true;
    assets.logo = true;
    visualContent.push({ type: "text", text: "Image: Logo, uploaded directly by the client." });
    visualContent.push({ type: "image", source: { type: "base64", media_type: payload.logo.media_type, data: payload.logo.data } });
  }

  if (payload.siteOverride && payload.siteOverride.data) {
    hasImage = true;
    assets.site = true;
    visualContent.push({ type: "text", text: "Image: Homepage screenshot, uploaded directly by the client." });
    visualContent.push({ type: "image", source: { type: "base64", media_type: payload.siteOverride.media_type, data: payload.siteOverride.data } });
  } else if (payload.site) {
    try {
      const bytes = await captureScreenshot(payload.site, env);
      hasImage = true;
      assets.site = true;
      visualContent.push({ type: "text", text: "Image: Homepage screenshot, captured live from " + payload.site + "." });
      visualContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: arrayBufferToBase64(bytes) } });
    } catch (err) {
      visualContent.push({ type: "text", text: "The homepage screenshot for " + payload.site + " could not be captured automatically (" + err.message + "). No image is available for this asset, say so plainly rather than inventing a read." });
    }
  }

  if (payload.socialOverride && payload.socialOverride.data) {
    hasImage = true;
    assets.social = true;
    visualContent.push({ type: "text", text: "Image: Social profile screenshot, uploaded directly by the client." });
    visualContent.push({ type: "image", source: { type: "base64", media_type: payload.socialOverride.media_type, data: payload.socialOverride.data } });
  } else if (payload.social) {
    try {
      const bytes = await captureScreenshot(payload.social, env);
      hasImage = true;
      assets.social = true;
      visualContent.push({ type: "text", text: "Image: Social profile screenshot, captured live from " + payload.social + ". Social platforms sometimes show a login wall instead of the real profile, if this looks like that, say so plainly instead of inventing a read." });
      visualContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: arrayBufferToBase64(bytes) } });
    } catch (err) {
      visualContent.push({ type: "text", text: "The social profile screenshot for " + payload.social + " could not be captured automatically (" + err.message + "), this is common for logged-in platforms. No image is available for this asset, say so plainly rather than inventing a read." });
    }
  }

  if (!hasImage) {
    visualContent.push({ type: "text", text: "No images were provided." });
  }
  return { content: visualContent, assets: assets };
}

function normalizeReport(vv, sc, companyName, assets) {
  const checklist = [];
  for (let i = 0; i < 12; i++) {
    const item = (sc.execution_checklist && sc.execution_checklist[i]) || {};
    // Enforced here regardless of what the model returned, an item is
    // only applicable if at least one asset it depends on was actually
    // provided. This is what keeps, for example, the social grid item
    // from showing up when no social link was ever given.
    const applicable = CHECKLIST_ASSET_REQUIREMENTS[i].some(function (a) { return !!(assets && assets[a]); });
    if (!applicable) {
      checklist.push({ flagged: false, note: "", not_applicable: true });
    } else {
      checklist.push({ flagged: !!item.flagged, note: item.note || "", not_applicable: false });
    }
  }
  return {
    business_name: companyName || sc.business_name || "Your brand",
    snapshot: sc.snapshot || "",
    overall_score: sc.overall_score || "Some Fuzz",
    visual_tone: vv.visual_tone || [],
    visual_findings: vv.visual_findings || "",
    visual_red_flags: vv.visual_red_flags || [],
    verbal_tone: vv.verbal_tone || [],
    verbal_findings: vv.verbal_findings || "",
    verbal_red_flags: vv.verbal_red_flags || [],
    alignment_summary: sc.alignment_summary || "",
    alignment_overlap: sc.alignment_overlap || [],
    alignment_conflicts: sc.alignment_conflicts || [],
    market_category_norms: sc.market_category_norms || "",
    market_audience_match: sc.market_audience_match || "",
    execution_checklist: checklist,
    fuzz_source: sc.fuzz_source || null
  };
}
