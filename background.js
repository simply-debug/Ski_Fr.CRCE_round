const TRACKER_URL = chrome.runtime.getURL("tracker.html");

async function openTracker() {
  // Check whether the controller is already open.
  const windows = await chrome.windows.getAll({ populate: true });

  for (const win of windows) {
    if (
      win.tabs &&
      win.tabs.some(
        (tab) => tab.url && tab.url.startsWith(TRACKER_URL)
      )
    ) {
      await chrome.windows.update(win.id, {
        focused: true
      });
      return;
    }
  }

  // Open the Handsfree controller in a small popup window.
  await chrome.windows.create({
    url: TRACKER_URL,
    type: "popup",
    width: 400,
    height: 650,
    focused: true
  });
}

chrome.action.onClicked.addListener(() => {
  openTracker().catch((error) => {
    console.error("Could not open Handsfree:", error);
  });
});