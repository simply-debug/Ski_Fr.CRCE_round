// Timer worker. Chrome slows down timers in hidden/covered windows, but not in Web Workers,
// so the tracker uses this worker for its frame clock and for timed waits.
let timer = null;
onmessage = (e) => {
  const m = e.data;
  if (m.type === 'start') {
    clearInterval(timer);
    timer = setInterval(() => postMessage({ type: 'tick' }), m.ms || 33);
  } else if (m.type === 'stop') {
    clearInterval(timer);
  } else if (m.type === 'sleep') {
    setTimeout(() => postMessage({ type: 'wake', id: m.id }), m.ms);
  }
};
