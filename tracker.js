async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Camera API is unavailable. Please open the extension in Chrome.'
    );
  }

  let stream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });
  } catch (err) {
    console.error('[Handsfree] Camera permission error:', err);

    throw new Error(
      'Camera access failed: ' +
      err.name +
      ' — ' +
      err.message
    );
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  if (video.readyState < 1) {
    await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener(
        'error',
        () => reject(new Error('Could not load camera video.')),
        { once: true }
      );
    });
  }

  await video.play();

  if (video.readyState < 2) {
    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener(
        'error',
        () => reject(new Error('Camera video data could not be loaded.')),
        { once: true }
      );
    });
  }

  console.log('[Handsfree] Camera started successfully.');
}
