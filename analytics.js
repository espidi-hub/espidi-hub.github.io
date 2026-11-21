// Public collection URL from the owner's GoatCounter account (not an API key).
// Leave empty to disable analytics. See docs/ANALYTICS.md.
const counterURL = "https://espidihub.goatcounter.com/count";

// Consume the one-hop share-link handoff even when analytics is disabled.
function redirectedReferrer() {
  if (!location.pathname.endsWith("/composer.html")) return null;
  try {
    const key = "espidi-share-referrer";
    const saved = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    const params = new URLSearchParams(location.search);
    if (saved && Date.now() - saved.time < 30000 && (params.has("play") || params.has("page"))) {
      return saved.origin;
    }
  } catch { /* The site also works without storage. */ }
  return null;
}

function startAnalytics() {
  const redirected = redirectedReferrer();
  if (!counterURL || location.origin !== "https://espidi-hub.github.io" ||
      navigator.globalPrivacyControl || navigator.doNotTrack === "1") return;

  const page = location.pathname.replace(/\/index\.html$/, "/");
  const query = new URLSearchParams(location.search);
  // The legacy share-link redirect itself isn't a view.
  if (page === "/" && (query.has("play") || query.has("page"))) return;

  function count(path, title, referrer, event = false, source = "") {
    const endpoint = new URL(counterURL);
    endpoint.searchParams.set("p", path);
    endpoint.searchParams.set("t", title);
    if (referrer) endpoint.searchParams.set("r", referrer);
    if (event) endpoint.searchParams.set("e", "true");
    if (source) endpoint.searchParams.set("q", "?utm_source=" + encodeURIComponent(source));
    // A keepalive GET works on navigation and never holds up the destination.
    void fetch(endpoint, { mode: "no-cors", credentials: "omit", keepalive: true,
      cache: "no-store", referrerPolicy: "origin" }).catch(() => {});
  }

  let referringOrigin = document.referrer ? new URL(document.referrer).origin : "";
  if (referringOrigin === location.origin && redirected !== null) referringOrigin = redirected;
  const sourceTag = query.get("utm_source") || "";
  const source = /^[\w.-]{1,64}$/.test(sourceTag) ? sourceTag : "";
  const external = referringOrigin && referringOrigin !== location.origin ? referringOrigin : "";
  count(page, document.title, external, false, source);

  const nav = performance.getEntriesByType("navigation")[0];
  if ((!nav || nav.type === "navigate") && referringOrigin !== location.origin) {
    const channel = source || (external ? new URL(external).hostname : "direct-or-unknown");
    count("in/" + channel, "Arrival: " + channel, external, true);
  }

  // A restored page is another view, but back/forward isn't a new arrival.
  window.addEventListener("pageshow", e => {
    if (e.persisted) count(page, document.title, "");
  });

  function outbound(e) {
    if (e.defaultPrevented || e.button !== (e.type === "auxclick" ? 1 : 0)) return;
    const link = e.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download")) return;
    const dest = new URL(link.href);
    if (!["http:", "https:"].includes(dest.protocol) || dest.origin === location.origin) return;
    const action = link.dataset.analytics || "link";
    count("out/" + action + "/" + dest.hostname, "Outbound: " + action + " → " + dest.hostname,
      location.origin + page, true);
  }
  document.addEventListener("click", outbound);
  document.addEventListener("auxclick", outbound);
}

startAnalytics();
