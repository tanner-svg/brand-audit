// POST /api/lead
// Fires the moment someone passes the email gate, before the report
// generates. Creates (or updates, if they've filled this out before) an
// item on Nectarine's Monday.com "Leads" board, then attaches an update
// with their survey answers.
//
// Migrated from HubSpot after that account was dissolved. Board and
// column IDs below are specific to the "Leads" board
// (https://nectarine.monday.com, board id 5102469972) and were confirmed
// against the live board schema: lead_status has a "New Lead" option and
// color_mkyb8krc ("Lead Source") already has an "AI Audit" option, both
// used as the defaults for a new item here.

const MONDAY_BOARD_ID = "5102469972";
const COLUMN_EMAIL = "lead_email";
const COLUMN_COMPANY = "lead_company";
const COLUMN_STATUS = "lead_status";
const COLUMN_SOURCE = "color_mkyb8krc";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.MONDAY_API_TOKEN) {
    return new Response(JSON.stringify({ ok: false, reason: "not configured" }), {
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

  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const companyName = (body.companyName || "").trim();

  if (!email) {
    return new Response("Missing email", { status: 400 });
  }

  try {
    const itemId = await upsertLead(env, { name: name, email: email, companyName: companyName });

    const noteBody = buildNoteBody(companyName, body.answers);
    try {
      await attachUpdate(env, itemId, noteBody);
    } catch (noteErr) {
      // The lead item matters more than the note. Don't let a hiccup on
      // the update call fail lead capture, just log it lost rather than
      // failing the whole request.
    }

    return new Response(JSON.stringify({ ok: true, itemId: itemId }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, reason: err.message }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function mondayRequest(env, query, variables) {
  const resp = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Authorization": env.MONDAY_API_TOKEN,
      "Content-Type": "application/json",
      "API-Version": "2024-10"
    },
    body: JSON.stringify({ query: query, variables: variables })
  });

  const data = await resp.json().catch(function () { return {}; });
  if (!resp.ok || data.errors) {
    const msg = (data.errors && data.errors[0] && data.errors[0].message) || resp.statusText;
    throw new Error("Monday.com request failed (" + resp.status + "): " + msg);
  }
  return data.data;
}

async function findLeadIdByEmail(env, email) {
  const query = "query($boardId: ID!, $email: CompareValue!) {"
    + " boards(ids: [$boardId]) {"
    + "   items_page(query_params: { rules: [{ column_id: \"" + COLUMN_EMAIL + "\", compare_value: $email, operator: contains_text }] }, limit: 1) {"
    + "     items { id }"
    + "   }"
    + " }"
    + "}";
  const data = await mondayRequest(env, query, { boardId: MONDAY_BOARD_ID, email: email });
  const items = (data.boards[0] && data.boards[0].items_page.items) || [];
  return items.length ? items[0].id : null;
}

async function upsertLead(env, lead) {
  const existingId = await findLeadIdByEmail(env, lead.email);

  const columnValues = {};
  columnValues[COLUMN_EMAIL] = { email: lead.email, text: lead.email };
  if (lead.companyName) { columnValues[COLUMN_COMPANY] = lead.companyName; }

  if (existingId) {
    const mutation = "mutation($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {"
      + " change_multiple_column_values(item_id: $itemId, board_id: $boardId, column_values: $columnValues) { id }"
      + "}";
    await mondayRequest(env, mutation, { itemId: existingId, boardId: MONDAY_BOARD_ID, columnValues: JSON.stringify(columnValues) });
    return existingId;
  }

  columnValues[COLUMN_STATUS] = { label: "New Lead" };
  columnValues[COLUMN_SOURCE] = { label: "AI Audit" };

  const mutation = "mutation($boardId: ID!, $itemName: String!, $columnValues: JSON!) {"
    + " create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) { id }"
    + "}";
  const data = await mondayRequest(env, mutation, {
    boardId: MONDAY_BOARD_ID,
    itemName: lead.name || lead.companyName || lead.email,
    columnValues: JSON.stringify(columnValues)
  });
  return data.create_item.id;
}

async function attachUpdate(env, itemId, noteBody) {
  const mutation = "mutation($itemId: ID!, $body: String!) {"
    + " create_update(item_id: $itemId, body: $body) { id }"
    + "}";
  await mondayRequest(env, mutation, { itemId: itemId, body: noteBody });
}

function buildNoteBody(companyName, answers) {
  const lines = ["Brand Alignment Audit submission" + (companyName ? " for " + companyName : "") + ":"];
  (answers || []).forEach(function (a) {
    lines.push("\n" + a.question + "\n" + a.answer);
  });
  return lines.join("\n");
}
