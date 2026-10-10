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
    width: 360,
    height: 640,
    left: 20,
    top: 20,
    focused: true,
  });
}

chrome.action.onClicked.addListener(() => {
  openTracker();
});
