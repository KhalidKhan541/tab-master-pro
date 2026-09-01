export function getFaviconUrl(url, size = 16) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=${size}`;
  } catch {
    return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="#555" width="16" height="16" rx="2"/><text x="8" y="12" text-anchor="middle" fill="white" font-size="10">?</text></svg>')}`;
  }
}

export function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function groupTabsByDomain(tabs) {
  const groups = {};
  for (const tab of tabs) {
    const domain = extractDomain(tab.url || "");
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(tab);
  }
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  return Object.fromEntries(sorted);
}

export function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function throttle(fn, ms = 100) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      return fn(...args);
    }
  };
}

export function serializeSession(tabs) {
  return tabs.map(t => ({
    title: t.title,
    url: t.url,
    favIconUrl: t.favIconUrl,
    pinned: t.pinned,
    muted: t.mutedInfo?.muted || false
  }));
}

export function deserializeSession(session) {
  return session.map(t => ({
    title: t.title,
    url: t.url,
    favIconUrl: t.favIconUrl,
    pinned: t.pinned || false,
    muted: t.muted || false
  }));
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function truncateUrl(url, maxLen = 50) {
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + "...";
}

export function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}
