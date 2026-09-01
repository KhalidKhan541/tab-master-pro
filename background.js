const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;

async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});
    const count = tabs.length;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
  } catch (err) {
    console.error("Badge update failed:", err);
  }
}

async function autoSaveSession() {
  try {
    const tabs = await chrome.tabs.query({});
    const sessionData = tabs.map((t) => ({
      title: t.title,
      url: t.url,
      favIconUrl: t.favIconUrl,
      pinned: t.pinned,
      muted: t.mutedInfo?.muted || false,
    }));

    const data = await chrome.storage.local.get("autoSavedSession");
    const existing = data.autoSavedSession || null;

    const newSession = {
      id: "auto",
      name: "Auto-saved",
      date: Date.now(),
      tabs: sessionData,
    };

    if (existing && JSON.stringify(existing.tabs) === JSON.stringify(sessionData)) {
      return;
    }

    const sessionsData = await chrome.storage.local.get("sessions");
    const sessions = sessionsData.sessions || [];
    const autoIndex = sessions.findIndex((s) => s.id === "auto");

    if (autoIndex >= 0) {
      sessions[autoIndex] = newSession;
    } else {
      sessions.unshift(newSession);
    }

    await chrome.storage.local.set({ sessions, autoSavedSession: newSession });
  } catch (err) {
    console.error("Auto-save failed:", err);
  }
}

chrome.tabs.onCreated.addListener(async (tab) => {
  updateBadge();
  notifyPopup();
});

chrome.tabs.onRemoved.addListener(async () => {
  updateBadge();
  notifyPopup();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title || changeInfo.pinned || changeInfo.mutedInfo) {
    notifyPopup();
  }
});

chrome.tabs.onActivated.addListener(async () => {
  updateBadge();
});

chrome.tabGroups.onUpdated.addListener(() => {
  notifyPopup();
});

async function notifyPopup() {
  try {
    const tabs = await chrome.tabs.query({});
    const views = chrome.runtime.getViews({ type: "popup" });
    for (const view of views) {
      try {
        view.chrome.runtime.sendMessage({ type: "TABS_UPDATED", tabs });
      } catch {
        // popup might be closed
      }
    }
  } catch {
    // ignore
  }
}

setInterval(updateBadge, 30000);
setInterval(autoSaveSession, AUTO_SAVE_INTERVAL);

chrome.runtime.onInstalled.addListener(async () => {
  updateBadge();
  const data = await chrome.storage.local.get("sessions");
  if (!data.sessions) {
    await chrome.storage.local.set({ sessions: [] });
  }
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

chrome.action.onClicked.addListener(async (tab) => {
  // Popup handles this, but just in case
});

updateBadge();
autoSaveSession();
