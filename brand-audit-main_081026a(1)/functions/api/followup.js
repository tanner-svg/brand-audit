import { callClaude, buildAnswersText } from "../_shared.js";

const FOLLOWUP_SYSTEM = "You are helping conduct a brand alignment audit for Nectarine, a brand strategy studio. You will be given a prospective client's intake answers. Look for where the answers are vague or generic, especially around mission and target audience. Write one or two short, pointed follow-up questions that would sharpen the biggest gap. If everything is already specific and clear, ask none. If the values question was left blank noted as not specified, that's expected and fine, don't write a follow-up asking them to name values, the audit will infer those from the mission instead.\n\nReturn only valid JSON, no markdown fences, no extra text, in this exact shape:\n{\"questions\": [\"...\", \"...\"]}\nIf there is nothing worth asking, return {\"questions\": []}.";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ questions: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const text = "Here are the client's intake answers so far:\n\n" + buildAnswersText(body.companyName, body.answers);

  try {
    const result = await callClaude(FOLLOWUP_SYSTEM, [{ type: "text", text: text }], 500, env);
    return new Response(JSON.stringify({ questions: (result && result.questions) || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    // If Claude hiccups here, the frontend just skips ahead to the assets
    // step rather than blocking the whole audit on an optional step.
    return new Response(JSON.stringify({ questions: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}
