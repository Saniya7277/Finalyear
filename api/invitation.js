const APP_SCHEME = "securesphere";
const ANDROID_PACKAGE = "com.securesphere.workspace";
const INVITATION_ORIGIN = "https://securesphere-api.vercel.app";

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character],
  );
}

function publicHttpsUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isPrivateIpv4 = /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/.test(
      hostname,
    );
    const isLocalIpv6 =
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80:");
    const isVercelHost =
      hostname === "vercel.com" ||
      hostname.endsWith(".vercel.com") ||
      hostname.endsWith(".vercel.app");

    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      hostname &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !isPrivateIpv4 &&
      !isLocalIpv6 &&
      !isVercelHost
      ? url.href
      : null;
  } catch {
    return null;
  }
}

module.exports = (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  // Invitation tokens are 32 random bytes encoded as hexadecimal. Rejecting
  // anything else keeps a malformed URL from being reflected into page markup.
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    res.status(400);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send("<h1>Invalid SecureSphere invitation</h1>");
    return;
  }

  const encodedToken = encodeURIComponent(token);
  const appUrl = `${APP_SCHEME}://accept-invitation/${encodedToken}`;
  const fallbackUrl = `${INVITATION_ORIGIN}/accept-invitation/${encodedToken}?deep_link_failed=1`;
  // Chrome follows browser_fallback_url when the package is not installed.
  // The fallback retains the token and opts out of another automatic launch,
  // keeping the public landing page visible instead of navigating to an
  // unsupported custom-scheme URL.
  const androidIntent = `intent://${appUrl.slice(`${APP_SCHEME}://`.length)}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  const downloadUrl = publicHttpsUrl(process.env.APP_DOWNLOAD_URL);
  const safeAndroidIntent = escapeHtml(androidIntent);
  const installAction = downloadUrl
    ? `<a class="secondary" href="${escapeHtml(downloadUrl)}">Download SecureSphere</a>`
    : '<button class="secondary disabled" type="button" disabled aria-disabled="true">Download SecureSphere</button><p class="hint">SecureSphere is not available to download yet. Please return after the app release is published.</p>';
  const deepLinkFailed = req.query.deep_link_failed === "1";
  const launchScript = deepLinkFailed
    ? ""
    : `<script>window.setTimeout(function(){window.location.href=${JSON.stringify(androidIntent)};},250);</script>`;

  res.setHeader("Cache-Control", "no-store");
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SecureSphere invitation</title><style>
body{margin:0;background:#050b18;color:#e8f4fd;font:16px system-ui,-apple-system,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box}.card{max-width:440px;text-align:center;background:#0d1b2a;border:1px solid #1a3050;border-radius:20px;padding:32px;box-sizing:border-box}h1{font-size:24px;margin:0 0 12px}p{color:#a8c4dc;line-height:1.55;margin:0 0 22px}a,button{display:block;width:100%;box-sizing:border-box;border-radius:12px;padding:14px 18px;text-decoration:none;font:700 16px system-ui,-apple-system,sans-serif;background:#00d4ff;color:#050b18;margin:12px 0;border:0}.secondary{background:transparent;color:#00d4ff;border:1px solid #1a3050}.disabled{opacity:.55;cursor:not-allowed}.hint{font-size:14px;margin-top:18px}</style></head>
<body><main class="card"><h1>You’re invited to SecureSphere</h1><p>Open this invitation in the SecureSphere app to sign in and join your teammate.</p>
<a id="open-app" href="${safeAndroidIntent}">Open SecureSphere</a>${installAction}</main>
${launchScript}</body></html>`);
};
