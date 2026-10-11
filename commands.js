// parseCommand(text, { dictating }) -> { name, arg? }
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
};
// Common mis-hearings, only used right after "click"/"number".
const NUMBER_HOMOPHONES = { to: 2, too: 2, for: 4, fore: 4, won: 1, ate: 8, tree: 3, free: 3 };

const KNOWN_SITES = {
  google: 'https://www.google.com',
  youtube: 'https://www.youtube.com',
  wikipedia: 'https://www.wikipedia.org',
  gmail: 'https://mail.google.com',
  github: 'https://github.com',
  maps: 'https://maps.google.com',
  'google maps': 'https://maps.google.com',
};

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseNumber(token, allowHomophones = false) {
  if (!token) return null;
  const t = token.trim();
  if (/^\d{1,3}$/.test(t)) return parseInt(t, 10);
  const parts = t.split(/[\s-]+/);
  if (parts.length === 1) {
    if (t in NUMBER_WORDS) return NUMBER_WORDS[t];
    if (allowHomophones && t in NUMBER_HOMOPHONES) return NUMBER_HOMOPHONES[t];
    return null;
  }
  if (parts.length === 2 && parts[0] in NUMBER_WORDS && parts[1] in NUMBER_WORDS) {
    const a = NUMBER_WORDS[parts[0]];
    const b = NUMBER_WORDS[parts[1]];
    if (a >= 20 && a % 10 === 0 && b >= 1 && b <= 9) return a + b;
  }
  return null;
}

function toUrl(spoken) {
  const s = spoken.replace(/\s+dot\s+/g, '.').replace(/\s+/g, '');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/.test(s)) return 'https://' + s;
  return null;
}

export function parseCommand(rawText, opts = {}) {
  const raw = String(rawText || '').trim();
  const t = normalize(raw);
  if (!t) return { name: 'empty' };

  // Safety words work in every mode (tolerant of spelling slips).
  if (/^(pause|paws|sleep|freeze|stop\s*tracking)$/.test(t)) return { name: 'pause' };
  if (/^(resume|resum|resoom|wake\s*up|wake|start\s*tracking|unfreeze)$/.test(t)) return { name: 'resume' };

  let m;

  if (opts.dictating) {
    if (/^(stop\s*dictation|stop\s*typing|stop\s*voice\s*typing|voice\s*typing\s*off|stop|done|finish|finsh)$/.test(t)) return { name: 'dictateOff' };
    if (/^(enter|press\s*enter|submit|new\s*line|next\s*line)$/.test(t)) return { name: 'enter' };
    if (/^(clear|clear\s*all|delete\s*all|clear\s*field|clear\s*text)$/.test(t)) return { name: 'clear' };
    if (/^(delete|backspace|delete\s*that|undo|delete\s*word|delete\s*last\s*word)$/.test(t)) return { name: 'deleteWord' };
    return { name: 'text', arg: raw };
  }

  // Switch the cursor-control mode by voice (voice itself stays on in every mode).
  if ((m = t.match(/^(?:(?:switch|change|go|swap)\s*to\s*|use\s*|select\s*)?(head|eye|eyes|hand|hands)(?:\s*(?:and|plus)\s*voice)?\s*(?:mode|control|tracking)$/)) ||
      (m = t.match(/^(?:switch|change|swap)\s*to\s*(head|eye|eyes|hand|hands)(?:\s*(?:and|plus)\s*voice)?$/))) {
    const k = m[1];
    return { name: 'mode', arg: k === 'head' ? 'head' : k.startsWith('eye') ? 'eyes' : 'hands' };
  }
  if (/^(voice\s*typing(\s*on)?|start\s*voice\s*typing)$/.test(t)) return { name: 'dictateOn' };

  if ((m = t.match(/^(?:type|write|enter\s*text|dictate) (.+)$/))) {
    const arg = raw.replace(/^\s*(type|write|enter\s*text|dictate)\s+/i, '');
    return { name: 'text', arg };
  }
  if (/^(dictate|start\s*typing|type|write)$/.test(t)) return { name: 'dictateOn' };

  if (/^(calibrate|recalibrate|start\s*calibration)$/.test(t)) return { name: 'calibrate' };
  if ((m = t.match(/^(?:dwell|dwell\s*click|dwell\s*clicking) (on|off)$/))) return { name: 'dwell', arg: m[1] === 'on' };
  if (/^enable\s*dwell(\s*click)?$/.test(t)) return { name: 'dwell', arg: true };
  if (/^disable\s*dwell(\s*click)?$/.test(t)) return { name: 'dwell', arg: false };

  if (/^(undo|that\s*was\s*a\s*mistake|wrong\s*click|mistake|oops|ups)$/.test(t)) return { name: 'mistake' };
  if (/^(help|commands|what\s*can\s*i\s*say)$/.test(t)) return { name: 'help' };

  if (/^double\s*(click|tap|clik)$/.test(t)) return { name: 'dblclick' };
  if (/^(click|clik|kwik|clack|select|press|tap|click\s*this|click\s*here|click\s*it|left\s*click)$/.test(t)) return { name: 'click' };
  if (/^(enter|press\s*enter|submit)$/.test(t)) return { name: 'enter' };

  if (/^(show|display|turn\s*on)\s+(numbers|number|links|labels|hints)$|^numbers$/.test(t)) return { name: 'hintsOn' };
  if (/^(hide|remove|clear|turn\s*off)\s+(numbers|number|links|labels|hints)$/.test(t)) return { name: 'hintsOff' };

  // "click 5", "number five", "five"
  if ((m = t.match(/^(?:click|clik|open|press|select|number|choose|tap) ([a-z0-9 -]+)$/))) {
    const n = parseNumber(m[1], true);
    if (n !== null && n > 0) return { name: 'hintClick', arg: n };
  }
  if ((m = t.match(/^([a-z0-9 -]+)$/))) {
    const n = parseNumber(m[1], false);
    if (n !== null && n > 0) return { name: 'hintClick', arg: n };
  }

  // Scrolling (with typo / shorthand safety)
  if (/^(scroll\s*down|scrol\s*down|page\s*down|down|go\s*down|scroll\s*down\s*a\s*lot)$/.test(t)) return { name: 'scroll', arg: /page|a lot/.test(t) ? 'pageDown' : 'down' };
  if (/^(scroll\s*up|scrol\s*up|page\s*up|up|go\s*up|scroll\s*up\s*a\s*lot)$/.test(t)) return { name: 'scroll', arg: /page|a lot/.test(t) ? 'pageUp' : 'up' };
  if (/^(scroll\s*left|scrol\s*left|left)$/.test(t)) return { name: 'scroll', arg: 'left' };
  if (/^(scroll\s*right|scrol\s*right|right)$/.test(t)) return { name: 'scroll', arg: 'right' };
  if (/^(scroll\s*to\s*top|go\s*to\s*top|top\s*of\s*page|top|scroll\s*top)$/.test(t)) return { name: 'scroll', arg: 'top' };
  if (/^(scroll\s*to\s*bottom|go\s*to\s*bottom|bottom\s*of\s*page|bottom|scroll\s*bottom)$/.test(t)) return { name: 'scroll', arg: 'bottom' };

  // Browser navigation (including common mishearings)
  if (/^(go\s*back|back|bak|navigate\s*back|previous\s*page)$/.test(t)) return { name: 'back' };
  if (/^(go\s*forward|forward|navigate\s*forward|next\s*page)$/.test(t)) return { name: 'forward' };
  if (/^(refresh|reload|relead|refresh\s*page|reload\s*page)$/.test(t)) return { name: 'reload' };
  if (/^(new\s*tab|nu\s*tab|open\s*new\s*tab|open\s*a\s*new\s*tab)$/.test(t)) return { name: 'newTab' };
  if (/^(close\s*tab|cls\s*tab|close\s*this\s*tab|close\s*the\s*tab)$/.test(t)) return { name: 'closeTab' };
  if (/^(next\s*tab|nex\s*tab|neck\s*tab|next\s*tap|nex\s*tap|tab\s*right)$/.test(t)) return { name: 'nextTab' };
  if (/^(previous\s*tab|prev\s*tab|pref\s*tab|pre\s*tab|last\s*tab|tab\s*left)$/.test(t)) return { name: 'prevTab' };

  if ((m = t.match(/^search(?:\s*for)? (.+)$/))) return { name: 'search', arg: m[1] };

  if ((m = t.match(/^(?:open|go\s*to|visit|navigate\s*to) (.+)$/))) {
    const target = m[1];
    if (KNOWN_SITES[target]) return { name: 'goto', arg: KNOWN_SITES[target] };
    const url = toUrl(target);
    if (url) return { name: 'goto', arg: url };
    return { name: 'clickText', arg: target };
  }
  if ((m = t.match(/^(?:click|clik|press|select|tap|choose) (.+)$/))) return { name: 'clickText', arg: m[1] };

  return { name: 'unknown', arg: raw };
}

export const HELP_TEXT =
  'Say: click · double click · scroll down/up · go back · new tab · next tab · ' +
  'show numbers, then "click 5" · click <link text> · type <words> · dictate · stop typing · ' +
  'search <words> · pause / resume · calibrate · head mode / eyes mode / hands mode';