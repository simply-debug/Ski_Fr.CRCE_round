// Shared voice layer. Independent of the cursor mode: it owns speech recognition, parses
// what was heard with commands.js (the original parser, still the single source of truth) and
// hands the result to ONE command handler (tracker.js -> run()), which is also what
// head / eye / hand gestures use. So every mode gets the same commands and voice typing.
import { parseCommand } from '../commands.js';

export class VoiceManager {
  // opts: { getLang(), isDictating(), onHeard(text), onCommand(cmd, text), onState(state, detail) }
  constructor(opts) {
    this.opts = opts;
    this.rec = null;
    this.wanted = false;
    this.state = 'off'; // off | starting | listening | retrying | blocked | unsupported
    this.detail = '';
    this.timer = null;
    this.restartDelay = 100;
  }

  get supported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  get active() {
    return this.state === 'listening' || this.state === 'starting' || this.state === 'retrying';
  }

  _set(state, detail = '') {
    this.state = state;
    this.detail = detail;
    if (this.opts.onState) this.opts.onState(state, detail);
  }

  start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.wanted = false;
      this._set('unsupported', 'Speech recognition is not supported in this browser.');
      return;
    }
    this._teardown();

    const rec = new SR();
    this.rec = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = this.opts.getLang();

    rec.onresult = (e) => {
      if (this.rec !== rec) return;
      const result = e.results[e.results.length - 1];
      if (!result || !result.isFinal) return;
      this.restartDelay = 100;
      this._handle(result[0].transcript);
    };

    rec.onerror = (e) => {
      if (this.rec !== rec) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        this.wanted = false;
        this._set('blocked', 'Microphone unavailable. Voice commands are disabled. Allow the microphone, then press Restart voice.');
      } else if (e.error === 'network') {
        this.restartDelay = 2000;
        this._set('retrying', 'Speech service needs an internet connection. Retrying…');
      } else if (e.error === 'language-not-supported') {
        this.wanted = false;
        this._set('blocked', 'This language is not supported for speech recognition.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        this.restartDelay = 1000;
        this._set('retrying', 'Speech error: ' + e.error + '. Retrying…');
      }
    };

    rec.onstart = () => {
      if (this.rec === rec) this._set('listening');
    };

    rec.onend = () => {
      if (this.rec !== rec || !this.wanted) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.rec !== rec || !this.wanted) return;
        try {
          rec.start();
        } catch (_) {}
      }, this.restartDelay);
    };

    this.wanted = true;
    this._set('starting');
    try {
      rec.start();
    } catch (_) {}
  }

  _teardown() {
    clearTimeout(this.timer);
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      try {
        rec.stop();
      } catch (_) {}
    }
  }

  stop() {
    this.wanted = false;
    this._teardown();
    this._set('off');
  }

  restart() {
    this.restartDelay = 100;
    this.start();
  }

  _handle(text) {
    if (this.opts.onHeard) this.opts.onHeard(text);
    const cmd = parseCommand(text, { dictating: this.opts.isDictating() });
    if (this.opts.onCommand) this.opts.onCommand(cmd, text);
  }
}
