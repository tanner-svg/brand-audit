import { captureScreenshot } from "../_shared.js";

// GET /api/screenshot?url=https://example.com
// Renders the page server-side with Cloudflare's Browser Rendering API and
// returns the image directly. This replaces the old client-side mshots.wp.com
// embed, which was unreliable: it rendered asynchronously, often served a
// generic placeholder on the first request, and needed a manual polling and
// retry workaround in the browser. This endpoint waits for the real render
// before responding, so the <img> tag pointing at it just loads normally.
export async function onRequestGet(context) {
  const { request, env } = context;
  const searchParams = new URL(request.url).searchParams;
  const target = searchParams.get("url");

  if (!target) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch (e) {
    return new Response("Invalid url parameter", { status: 400 });
  }

  // Cache at the edge so retyping, re-rendering, or several visitors
  // auditing the same site don't each trigger a fresh headless render.
  // The "r" query param (used by the Retake button) naturally busts this,
  // since it changes the cache key.
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) { return cached; }

  try {
    const bytes = await captureScreenshot(target, env);
    const response = new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=600"
      }
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    // A plain-text error response makes the <img> fire onerror, which the
    // frontend uses to point the person at the manual upload fallback.
    return new Response("Screenshot capture failed: " + err.message, { status: 502 });
  }
}
