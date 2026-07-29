// POST /api/lead
// Fires the moment someone passes the email gate, before the report
// generates. Creates (or updates, if they've filled this out before) a
// HubSpot contact, then attaches a note with their survey answers.
//
// This intentionally does not create a Deal. Nectarine's pipeline starts
// at "Lead" and the $500 audit is a flat-rate product, so if you'd like
// this to also drop a Deal into that stage, fill in HUBSPOT_PIPELINE_ID,
// HUBSPOT_STAGE_ID, and the audit product's ID below and uncomment
// createDeal(). Find those IDs in HubSpot under Settings > Objects >
// Deals > Pipelines, and in your product catalog.

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.HUBSPOT_TOKEN) {
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
    const contactId = await upsertContact(env, { name: name, email: email, companyName: companyName });

    const noteBody = buildNoteBody(companyName, body.answers);
    try {
      await attachNote(env, contactId, noteBody);
    } catch (noteErr) {
      // The contact matters more than the note. If HubSpot's association
      // type ID ever changes on their end, don't let that break lead
      // capture, just log it lost rather than failing the whole request.
    }

    // Uncomment to also create a Deal in the Lead stage:
    // await createDeal(env, contactId, companyName);

    return new Response(JSON.stringify({ ok: true, contactId: contactId }), {
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

async function upsertContact(env, lead) {
  const nameParts = lead.name.split(" ");
  const firstname = nameParts[0] || lead.name;
  const lastname = nameParts.slice(1).join(" ");

  const properties = { email: lead.email };
  if (firstname) { properties.firstname = firstname; }
  if (lastname) { properties.lastname = lastname; }
  if (lead.companyName) { properties.company = lead.companyName; }

  const createResp = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.HUBSPOT_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ properties: properties })
  });

  if (createResp.ok) {
    const data = await createResp.json();
    return data.id;
  }

  if (createResp.status === 409) {
    const errData = await createResp.json().catch(function () { return {}; });
    const existingId = extractExistingId(errData);
    if (existingId) {
      await fetch("https://api.hubapi.com/crm/v3/objects/contacts/" + existingId, {
        method: "PATCH",
        headers: {
          "Authorization": "Bearer " + env.HUBSPOT_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ properties: properties })
      });
      return existingId;
    }
  }

  const text = await createResp.text().catch(function () { return ""; });
  throw new Error("HubSpot contact upsert failed (" + createResp.status + "): " + text.slice(0, 300));
}

function extractExistingId(errData) {
  const msg = (errData && errData.message) || "";
  const match = msg.match(/Existing ID:\s*(\d+)/i);
  return match ? match[1] : null;
}

async function attachNote(env, contactId, noteBody) {
  const resp = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.HUBSPOT_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      properties: {
        hs_note_body: noteBody,
        hs_timestamp: Date.now()
      },
      associations: [
        {
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }]
        }
      ]
    })
  });
  if (!resp.ok) {
    const text = await resp.text().catch(function () { return ""; });
    throw new Error("HubSpot note create failed (" + resp.status + "): " + text.slice(0, 300));
  }
}

function buildNoteBody(companyName, answers) {
  const lines = ["Brand Alignment Audit submission" + (companyName ? " for " + companyName : "") + ":"];
  (answers || []).forEach(function (a) {
    lines.push("\n" + a.question + "\n" + a.answer);
  });
  return lines.join("\n");
}

// async function createDeal(env, contactId, companyName) {
//   const HUBSPOT_PIPELINE_ID = "";
//   const HUBSPOT_STAGE_ID = ""; // the "Lead" stage
//   const resp = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
//     method: "POST",
//     headers: {
//       "Authorization": "Bearer " + env.HUBSPOT_TOKEN,
//       "Content-Type": "application/json"
//     },
//     body: JSON.stringify({
//       properties: {
//         dealname: (companyName || "New lead") + " — Brand Alignment Audit",
//         pipeline: HUBSPOT_PIPELINE_ID,
//         dealstage: HUBSPOT_STAGE_ID,
//         amount: "500"
//       },
//       associations: [
//         { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }
//       ]
//     })
//   });
//   if (!resp.ok) { throw new Error("HubSpot deal create failed (" + resp.status + ")"); }
// }
