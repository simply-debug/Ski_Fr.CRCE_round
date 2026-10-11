const TRACKER_URL = chrome.runtime.getURL('tracker.html');

async function openTracker() {
  const wins = await chrome.windows.getAll({ populate: true });
  for (const w of wins) {
    if (w.tabs && w.tabs.some((t) => t.url && t.url.startsWith(TRACKER_URL))) {
      await chrome.windows.update(w.id, { focused: true });
      return;
    }
  }
  await chrome.windows.create({
    url: TRACKER_URL,
    type: 'popup',
    width: 420,
    height: 860,
    left: 20,
    top: 20,
    focused: true,
  });
}

// Automatically trigger on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set first-time storage flag
    chrome.storage.local.set({ hasCalibrated: false }, () => {
      openTracker();
    });
  }
});

chrome.action.onClicked.addListener(() => {
  openTracker();
});