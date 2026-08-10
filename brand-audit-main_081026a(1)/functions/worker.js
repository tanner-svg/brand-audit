// Single entry point for the Workers project.
//
// Cloudflare Pages Functions auto-routes a file like functions/api/report.js
// (exporting onRequestPost) to the path /api/report. That convention is
// specific to Pages and does not apply to a plain Workers project, which
// only ever runs one entry script with one fetch handler. This file is
// that single entry point: it imports the existing handler files unchanged
// and manually dispatches to the right one based on the request's path
// and method, then falls through to the static front-end (served from
// ./public via the ASSETS binding below) for everything else.

import * as screenshot from "./api/screenshot.js";
import * as followup from "./api/followup.js";
import * as lead from "./api/lead.js";
import * as report from "./api/report.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // The handler files were written for Pages Functions, so they expect a
    // "context" object shaped like { request, env, waitUntil }. Building
    // that shape here means screenshot.js, followup.js, lead.js, and
    // report.js can be called exactly as they already are, no changes
    // needed inside any of them.
    const context = { request, env, waitUntil: ctx.waitUntil.bind(ctx) };

    if (url.pathname === "/api/screenshot" && request.method === "GET") {
      return screenshot.onRequestGet(context);
    }
    if (url.pathname === "/api/followup" && request.method === "POST") {
      return followup.onRequestPost(context);
    }
    if (url.pathname === "/api/lead" && request.method === "POST") {
      return lead.onRequestPost(context);
    }
    if (url.pathname === "/api/report" && request.method === "POST") {
      return report.onRequestPost(context);
    }

    // Everything else is the front-end, served only from ./public. This is
    // deliberately scoped to that one folder rather than the project root,
    // so this binding can never serve functions/ (the server-side source)
    // or .dev.vars (local secrets) as public static files.
    return env.ASSETS.fetch(request);
  }
};
