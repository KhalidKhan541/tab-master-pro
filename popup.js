import {
  getFaviconUrl,
  extractDomain,
  groupTabsByDomain,
  debounce,
  serializeSession,
  deserializeSession,
  escapeHtml,
  truncateUrl,
  formatDate,
  generateId
} from "./utils.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let allTabs = [];
let currentView = "all";
let searchQuery = "";
let selectedTabId = null;
let contextTabId = null;
let draggedTabId = null;

const searchInput = $("#searchInput");
const clearSearchBtn = $("#clearSearch");
const tabListEl = $("#tabList");
const emptyStateEl = $("#emptyState");
const tabCountEl = $("#tabCount");
const saveSessionBtn = $("#saveSessionBtn");
const restoreSessionBtn = $("#restoreSessionBtn");
const closeAllBtn = $("#closeAllBtn");
const sessionDropdown = $("#sessionDropdown");
const sessionListEl = $("#sessionList");
const closeSessionDropdownBtn = $("#closeSessionDropdown");
const themeToggleBtn = $("#themeToggle");
const settingsBtn = $("#settingsBtn");
const contextMenu = $("#contextMenu");
const viewBtns = $$(".view-btn");

async function loadTabs() {
  allTabs = await chrome.tabs.query({});
  render();
  updateBadge();
}

function updateBadge() {
  const count = allTabs.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
  tabCountEl.textContent = `${count} tab${count !== 1 ? "s" : ""}`;
}

function getFilteredTabs() {
  let tabs = allTabs;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    tabs = tabs.filter(
      (t) =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.url && t.url.toLowerCase().includes(q))
    );
  }
  if (currentView === "pinned") {
    tabs = tabs.filter((t) => t.pinned);
  }
  return tabs;
}

function render() {
  const tabs = getFilteredTabs();
  tabListEl.innerHTML = "";

  if (tabs.length === 0) {
    emptyStateEl.classList.remove("hidden");
    tabListEl.classList.add("hidden");
    return;
  }

  emptyStateEl.classList.add("hidden");
  tabListEl.classList.remove("hidden");

  if (currentView === "grouped") {
    renderGrouped(tabs);
  } else {
    renderFlat(tabs);
  }
}

function renderFlat(tabs) {
  const fragment = document.createDocumentFragment();
  for (const tab of tabs) {
    fragment.appendChild(createTabElement(tab));
  }
  tabListEl.appendChild(fragment);
}

function renderGrouped(tabs) {
  const groups = groupTabsByDomain(tabs);
  const fragment = document.createDocumentFragment();

  for (const [domain, domainTabs] of Object.entries(groups)) {
    const groupEl = document.createElement("div");
    groupEl.className = "domain-group";

    const faviconUrl = domainTabs[0]?.url
      ? getFaviconUrl(domainTabs[0].url, 14)
      : "";

    const header = document.createElement("div");
    header.className = "domain-header";
    header.innerHTML = `
      <span class="domain-chevron">▼</span>
      ${faviconUrl ? `<img class="domain-favicon" src="${escapeHtml(faviconUrl)}" alt="">` : ""}
      <span class="domain-name">${escapeHtml(domain)}</span>
      <span class="domain-count">${domainTabs.length}</span>
    `;

    const tabsContainer = document.createElement("div");
    tabsContainer.className = "domain-tabs";

    for (const tab of domainTabs) {
      tabsContainer.appendChild(createTabElement(tab));
    }

    header.addEventListener("click", () => {
      header.classList.toggle("collapsed");
      tabsContainer.classList.toggle("collapsed");
    });

    groupEl.appendChild(header);
    groupEl.appendChild(tabsContainer);
    fragment.appendChild(groupEl);
  }

  tabListEl.appendChild(fragment);
}

function createTabElement(tab) {
  const el = document.createElement("div");
  el.className = "tab-item";
  el.dataset.tabId = tab.id;
  el.draggable = true;

  if (tab.active) el.classList.add("active");
  if (tab.id === selectedTabId) el.classList.add("selected");

  const faviconUrl = tab.favIconUrl || getFaviconUrl(tab.url || "", 16);
  const displayUrl = truncateUrl(tab.url || "", 48);

  el.innerHTML = `
    <img class="tab-favicon" src="${escapeHtml(faviconUrl)}" alt="" loading="lazy">
    <div class="tab-info">
      <div class="tab-title">${escapeHtml(tab.title || "Untitled")}</div>
      <div class="tab-url">${escapeHtml(displayUrl)}</div>
    </div>
    <div class="tab-indicators">
      ${tab.pinned ? '<span class="tab-indicator pinned" title="Pinned"></span>' : ""}
      ${tab.mutedInfo?.muted ? '<span class="tab-indicator muted" title="Muted"></span>' : ""}
    </div>
    <button class="tab-close" title="Close tab">✕</button>
  `;

  el.addEventListener("click", (e) => {
    if (e.target.closest(".tab-close")) return;
    activateTab(tab.id);
  });

  el.addEventListener("dblclick", (e) => {
    if (e.target.closest(".tab-close")) return;
    activateTab(tab.id);
    window.close();
  });

  el.querySelector(".tab-close").addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(tab.id);
  });

  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    contextTabId = tab.id;
    showContextMenu(e.clientX, e.clientY);
  });

  el.addEventListener("dragstart", (e) => {
    draggedTabId = tab.id;
    el.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tab.id);
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    draggedTabId = null;
    $$(".tab-item.drag-over").forEach((x) => x.classList.remove("drag-over"));
  });

  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    el.classList.add("drag-over");
  });

  el.addEventListener("dragleave", () => {
    el.classList.remove("drag-over");
  });

  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("drag-over");
    const fromId = draggedTabId;
    const toId = tab.id;
    if (fromId && fromId !== toId) {
      reorderTab(Number(fromId), Number(toId));
    }
  });

  return el;
}

async function activateTab(tabId) {
  const tab = allTabs.find((t) => t.id === tabId);
  if (!tab) return;
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  selectedTabId = tabId;
  render();
}

async function closeTab(tabId) {
  await chrome.tabs.remove(tabId);
  allTabs = allTabs.filter((t) => t.id !== tabId);
  render();
  updateBadge();
}

async function reorderTab(fromId, toId) {
  const fromIndex = allTabs.findIndex((t) => t.id === fromId);
  const toIndex = allTabs.findIndex((t) => t.id === toId);
  if (fromIndex === -1 || toIndex === -1) return;

  const [moved] = allTabs.splice(fromIndex, 1);
  allTabs.splice(toIndex, 0, moved);

  const windowId = moved.windowId;
  const pinnedTabs = allTabs.filter((t) => t.windowId === windowId && t.pinned);
  const unpinnedTabs = allTabs.filter((t) => t.windowId === windowId && !t.pinned);

  const orderedUrls = [...pinnedTabs, ...unpinnedTabs].map((t) => t.url);

  try {
    await chrome.tabs.move(fromId, { index: toIndex });
  } catch {
    // cross-window move not supported
  }

  render();
}

function showContextMenu(x, y) {
  contextMenu.classList.remove("hidden");
  contextMenu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
  contextMenu.style.top = `${Math.min(y, window.innerHeight - 280)}px`;
}

function hideContextMenu() {
  contextMenu.classList.add("hidden");
  contextTabId = null;
}

contextMenu.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || !contextTabId) return;

  const action = btn.dataset.action;
  const tabId = contextTabId;

  hideContextMenu();

  switch (action) {
    case "close":
      await closeTab(tabId);
      break;
    case "pin":
      await chrome.tabs.update(tabId, { pinned: !allTabs.find((t) => t.id === tabId)?.pinned });
      await loadTabs();
      break;
    case "mute":
      const tab = allTabs.find((t) => t.id === tabId);
      await chrome.tabs.update(tabId, { muted: !tab?.mutedInfo?.muted });
      await loadTabs();
      break;
    case "duplicate":
      await chrome.tabs.duplicate(tabId);
      await loadTabs();
      break;
    case "bookmark":
      const bookmarkTab = allTabs.find((t) => t.id === tabId);
      if (bookmarkTab) {
        await chrome.bookmarks.create({
          title: bookmarkTab.title,
          url: bookmarkTab.url,
        });
        showToast("Tab bookmarked");
      }
      break;
    case "moveToWindow":
      await chrome.windows.create({ url: allTabs.find((t) => t.id === tabId)?.url });
      await closeTab(tabId);
      break;
    case "closeOthers": {
      const winTabs = allTabs.filter((t) => t.windowId === allTabs.find((x) => x.id === tabId)?.windowId && t.id !== tabId && !t.pinned);
      await chrome.tabs.remove(winTabs.map((t) => t.id));
      await loadTabs();
      break;
    }
    case "closeRight": {
      const currentTab = allTabs.find((t) => t.id === tabId);
      if (currentTab) {
        const winTabs = allTabs.filter(
          (t) =>
            t.windowId === currentTab.windowId &&
            t.index > currentTab.index &&
            !t.pinned
        );
        await chrome.tabs.remove(winTabs.map((t) => t.id));
        await loadTabs();
      }
      break;
    }
  }
});

document.addEventListener("click", (e) => {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideContextMenu();
    sessionDropdown.classList.add("hidden");
    if (searchQuery) {
      searchInput.value = "";
      searchQuery = "";
      clearSearchBtn.classList.add("hidden");
      render();
    }
  }
});

searchInput.addEventListener(
  "input",
  debounce(() => {
    searchQuery = searchInput.value.trim();
    clearSearchBtn.classList.toggle("hidden", !searchQuery);
    render();
  }, 150)
);

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  clearSearchBtn.classList.add("hidden");
  render();
  searchInput.focus();
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

viewBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    viewBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    render();
  });
});

closeAllBtn.addEventListener("click", async () => {
  const tabsToClose = allTabs.filter((t) => !t.pinned);
  if (tabsToClose.length === 0) {
    showToast("No tabs to close (all pinned)");
    return;
  }
  await chrome.tabs.remove(tabsToClose.map((t) => t.id));
  await loadTabs();
  showToast(`Closed ${tabsToClose.length} tabs`);
});

saveSessionBtn.addEventListener("click", async () => {
  const name = prompt("Session name:", `Session ${new Date().toLocaleDateString()}`);
  if (!name) return;

  const sessions = await getSessions();
  sessions.unshift({
    id: generateId(),
    name,
    date: Date.now(),
    tabs: serializeSession(allTabs),
  });

  await chrome.storage.local.set({ sessions });
  showToast("Session saved");
});

restoreSessionBtn.addEventListener("click", async () => {
  const sessions = await getSessions();
  renderSessionList(sessions);
  sessionDropdown.classList.toggle("hidden");
});

closeSessionDropdownBtn.addEventListener("click", () => {
  sessionDropdown.classList.add("hidden");
});

async function getSessions() {
  const data = await chrome.storage.local.get("sessions");
  return data.sessions || [];
}

function renderSessionList(sessions) {
  sessionListEl.innerHTML = "";

  if (sessions.length === 0) {
    sessionListEl.innerHTML = '<div class="session-empty">No saved sessions</div>';
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("div");
    item.className = "session-item";
    item.innerHTML = `
      <div class="session-item-info">
        <div class="session-item-name">${escapeHtml(session.name)}</div>
        <div class="session-item-meta">${session.tabs.length} tabs · ${formatDate(session.date)}</div>
      </div>
      <div class="session-item-actions">
        <button data-action="restore" title="Restore">▶</button>
        <button data-action="delete" title="Delete">✕</button>
      </div>
    `;

    item.querySelector("[data-action='restore']").addEventListener("click", (e) => {
      e.stopPropagation();
      restoreSession(session);
    });

    item.querySelector("[data-action='delete']").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(session.id);
    });

    item.addEventListener("click", () => restoreSession(session));

    sessionListEl.appendChild(item);
  }
}

async function restoreSession(session) {
  const tabs = deserializeSession(session.tabs);
  const urls = tabs.filter((t) => t.url && !t.url.startsWith("chrome://")).map((t) => t.url);

  if (urls.length === 0) {
    showToast("No restoreable tabs in session");
    return;
  }

  await chrome.windows.create({ url: urls[0] });

  for (let i = 1; i < urls.length; i++) {
    await chrome.tabs.create({ url: urls[i], active: false });
  }

  sessionDropdown.classList.add("hidden");
  showToast(`Restored ${urls.length} tabs`);
}

async function deleteSession(sessionId) {
  let sessions = await getSessions();
  sessions = sessions.filter((s) => s.id !== sessionId);
  await chrome.storage.local.set({ sessions });
  renderSessionList(sessions);
  showToast("Session deleted");
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

async function loadTheme() {
  const data = await chrome.storage.local.get("theme");
  const theme = data.theme || "light";
  document.documentElement.setAttribute("data-theme", theme);
}

themeToggleBtn.addEventListener("click", async () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  await chrome.storage.local.set({ theme: next });
});

settingsBtn.addEventListener("click", () => {
  showToast("Settings coming soon");
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TABS_UPDATED") {
    loadTabs();
  }
});

loadTheme();
loadTabs();

chrome.tabs.onCreated.addListener(loadTabs);
chrome.tabs.onRemoved.addListener(loadTabs);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.title || changeInfo.pinned || changeInfo.mutedInfo) {
    loadTabs();
  }
});
chrome.tabs.onActivated.addListener(loadTabs);
