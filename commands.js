const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60,

  // Hindi numbers
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4,
  paanch: 5, panch: 5, chhe: 6, cheh: 6,
  saat: 7, aath: 8, nau: 9, das: 10
};

const NUMBER_HOMOPHONES = {
  to: 2, too: 2, for: 4, fore: 4,
  won: 1, ate: 8, tree: 3, free: 3
};

const KNOWN_SITES = {
  google: 'https://www.google.com',
  youtube: 'https://www.youtube.com',
  wikipedia: 'https://www.wikipedia.org',
  gmail: 'https://mail.google.com',
  github: 'https://github.com',
  maps: 'https://maps.google.com',
  'google maps': 'https://maps.google.com'
};

// English, Hindi and Marathi command phrases.
// Multiple phrases can trigger the same action.
const COMMANDS = {
  pause: [
  // English
  'pause', 'sleep', 'freeze', 'stop tracking',
  // Hinglish
  'ruko', 'ruk jao', 'tracking rok do', 'band karo',
  // Maralish
  'thamba', 'thamb', 'tracking thambva', 'band kara',
  // Gujulish
  'atko', 'rokai jao', 'tracking bandh karo', 'band karo',
  // Tamlish
  'niruthu', 'nillu', 'tracking niruthu', 'stop pannu'
],

resume: [
  // English
  'resume', 'wake up', 'wake', 'start tracking', 'unfreeze',
  // Hinglish
  'shuru karo', 'phir se shuru karo', 'tracking shuru karo',
  // Maralish
  'suru kara', 'punha suru kara', 'tracking suru kara',
  // Gujulish
  'chalu karo', 'pachha chalu karo', 'tracking chalu karo',
  // Tamlish
  'thodangu', 'marubadi thodangu', 'tracking thodangu'
],

calibrate: [
  // English
  'calibrate', 'recalibrate', 'calibration', 'start calibration',
  // Hinglish
  'calibrate karo', 'calibration shuru karo',
  // Maralish
  'calibrate kara', 'calibration suru kara',
  // Gujulish
  'calibrate karo', 'calibration sharu karo',
  // Tamlish
  'calibrate pannu', 'calibration thodangu'
],

click: [
  // English
  'click', 'select', 'press', 'tap',
  'click this', 'click here', 'click it', 'left click',
  // Hinglish
  'click karo', 'click kar do', 'chuno', 'select karo',
  // Maralish
  'click kara', 'nivadha', 'select kara',
  // Gujulish
  'click karo', 'pasand karo', 'select karo',
  // Tamlish
  'click pannu', 'therndhedu', 'select pannu'
],

doubleClick: [
  // English
  'double click', 'double tap',
  // Hinglish
  'double click karo', 'do baar click karo',
  // Maralish
  'double click kara', 'don vela click kara',
  // Gujulish
  'double click karo', 'be vaar click karo',
  // Tamlish
  'double click pannu', 'rendu thadava click pannu'
],

enter: [
  // English
  'enter', 'press enter', 'submit',
  // Hinglish
  'enter dabao', 'submit karo', 'jama karo',
  // Maralish
  'enter daba', 'submit kara', 'jama kara',
  // Gujulish
  'enter dabavo', 'submit karo', 'jama karo',
  // Tamlish
  'enter press pannu', 'submit pannu', 'ullidu'
],

scrollDown: [
  // English
  'scroll down', 'page down', 'down', 'go down',
  // Hinglish
  'neeche scroll karo', 'neeche jao', 'neeche karo',
  // Maralish
  'khali scroll kara', 'khali ja', 'khali kara',
  // Gujulish
  'niche scroll karo', 'niche jao', 'niche karo',
  // Tamlish
  'keela scroll pannu', 'keela po', 'keela pogu'
],

scrollUp: [
  // English
  'scroll up', 'page up', 'up', 'go up',
  // Hinglish
  'upar scroll karo', 'upar jao',
  // Maralish
  'var scroll kara', 'var ja',
  // Gujulish
  'upar scroll karo', 'upar jao',
  // Tamlish
  'mela scroll pannu', 'mela po', 'mele pogu'
],

scrollLeft: [
  // English
  'scroll left', 'left',
  // Hinglish
  'baaye scroll karo', 'baayi taraf jao',
  // Maralish
  'davikade scroll kara', 'davikade ja',
  // Gujulish
  'dabi taraf scroll karo', 'dabi baju jao',
  // Tamlish
  'idathu pakkam scroll pannu', 'idathu pakkam po'
],

scrollRight: [
  // English
  'scroll right', 'right',
  // Hinglish
  'daaye scroll karo', 'daayi taraf jao',
  // Maralish
  'ujvikade scroll kara', 'ujvikade ja',
  // Gujulish
  'jamni taraf scroll karo', 'jamni baju jao',
  // Tamlish
  'valathu pakkam scroll pannu', 'valathu pakkam po'
],

top: [
  'scroll to top', 'go to top', 'top of page', 'top', 'scroll top',
  'sabse upar jao', 'page ke upar jao',
  'sarvat var ja', 'panachya var ja',
  'sauthi upar jao', 'page na upar jao',
  'mela po', 'page oda mela po'
],

bottom: [
  'scroll to bottom', 'go to bottom', 'bottom of page',
  'bottom', 'scroll bottom',
  'sabse neeche jao', 'page ke neeche jao',
  'sarvat khali ja', 'panachya khali ja',
  'sauthi niche jao', 'page na niche jao',
  'keela po', 'page oda keela po'
],

back: [
  'go back', 'back', 'navigate back', 'previous page',
  'peeche jao', 'wapas jao', 'pichle page par jao',
  'mage ja', 'magil panavar ja',
  'pachha jao', 'pahela page par jao',
  'thirumbi po', 'pinnadi po'
],

forward: [
  'go forward', 'forward', 'navigate forward', 'next page',
  'aage jao', 'agle page par jao',
  'pudhe ja', 'pudhchya panavar ja',
  'aagal jao', 'agal na page par jao',
  'munnadi po', 'adutha page po'
],

reload: [
  'refresh', 'reload', 'refresh page', 'reload page',
  'page refresh karo', 'page phir se kholo',
  'page refresh kara', 'pan punha load kara',
  'page refresh karo', 'page fari load karo',
  'page refresh pannu', 'marubadi load pannu'
],

newTab: [
  'new tab', 'open new tab', 'open a new tab',
  'naya tab kholo', 'naya tab khol do',
  'navin tab ughada',
  'navi tab kholo', 'navo tab kholo',
  'pudhu tab open pannu', 'pudhu tab thira'
],

closeTab: [
  'close tab', 'close this tab', 'close the tab',
  'tab band karo', 'tab band kar do',
  'tab band kara',
  'tab bandh karo', 'tab bandh kari do',
  'tab close pannu', 'indha tab moodu'
],

nextTab: [
  'next tab', 'switch tab', 'switch tabs', 'tab right',
  'agle tab par jao', 'agla tab kholo',
  'pudhchya tab var ja', 'pudhil tab ughada',
  'aagal na tab par jao', 'biji tab kholo',
  'adutha tab po', 'next tab open pannu'
],

prevTab: [
  'previous tab', 'prev tab', 'last tab', 'tab left',
  'pichle tab par jao', 'pichla tab kholo',
  'magil tab var ja', 'magcha tab ughada',
  'pahela tab par jao', 'paheli tab kholo',
  'munnadi tab po', 'previous tab open pannu'
],

hintsOn: [
  'show numbers', 'display numbers', 'turn on numbers',
  'show links', 'show labels', 'show hints', 'numbers',
  'number dikhao', 'link dikhao', 'number chalu karo',
  'kramank dakhava', 'link dakhava', 'number suru kara',
  'number batavo', 'link batavo', 'number chalu karo',
  'number kaatu', 'link kaatu', 'hints kaatu'
],

hintsOff: [
  'hide numbers', 'remove numbers', 'clear numbers',
  'turn off numbers', 'hide links', 'hide labels', 'hide hints',
  'number chhupao', 'link chhupao', 'number band karo',
  'number lapava', 'link lapava', 'number band kara',
  'number chhupavo', 'link chhupavo', 'number bandh karo',
  'number maraikka', 'link maraikka', 'hints off pannu'
],

dictateOn: [
  'dictate', 'dictation', 'start typing', 'start dictation',
  'type', 'write',
  'type karna shuru karo', 'likhna shuru karo',
  'typing suru kara', 'lihayla suru kara',
  'typing chalu karo', 'lakhvanu chalu karo',
  'type pannu', 'ezhutha thodangu'
],

dictateOff: [
  'stop dictation', 'stop typing', 'stop dictating',
  'stop', 'done', 'finish',
  'typing band karo', 'likhna band karo',
  'typing band kara', 'lihayche thambva',
  'typing bandh karo', 'lakhvanu bandh karo',
  'typing niruthu', 'ezhuthuradha niruthu'
],

help: [
  'help', 'commands', 'what can i say',
  'madad', 'madad karo', 'command batao',
  'madat', 'madat kara', 'command sanga',
  'madad karo', 'commands batavo',
  'udhavi', 'help pannu', 'commands sollu'
],

mistake: [
  'undo', 'that was a mistake', 'wrong click', 'mistake', 'oops',
  'galti ho gayi', 'galat click',
  'chuk zali', 'chukicha click',
  'bhul thai', 'khoto click',
  'thappu', 'thappaana click'
]
};
function matchesCommand(text, commandName) {
  return COMMANDS[commandName]?.includes(text) ?? false;
}

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

  if (t in NUMBER_WORDS) return NUMBER_WORDS[t];

  if (allowHomophones && t in NUMBER_HOMOPHONES) {
    return NUMBER_HOMOPHONES[t];
  }

  return null;
}

function toUrl(spoken) {
  const s = spoken.replace(/\s+dot\s+/g, '.').replace(/\s+/g, '');

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/.test(s)) {
    return 'https://' + s;
  }

  return null;
}

export function parseCommand(rawText, opts = {}) {
  const raw = String(rawText || '').trim();
  const t = normalize(raw);

  if (!t) return { name: 'empty' };

  // Pause and resume
  if (matchesCommand(t, 'pause')) return { name: 'pause' };
  if (matchesCommand(t, 'resume')) return { name: 'resume' };

  // Dictation mode
  if (opts.dictating) {
    if (matchesCommand(t, 'dictateOff') || [
      'enter', 'press enter', 'submit', 'new line', 'next line',
      'clear', 'clear all', 'delete all', 'clear field', 'clear text',
      'delete', 'backspace', 'delete that', 'undo',
      'delete word', 'delete last word'
    ].includes(t)) {
      if (matchesCommand(t, 'dictateOff')) return { name: 'dictateOff' };

      if (['enter', 'press enter', 'submit', 'new line', 'next line'].includes(t)) {
        return { name: 'enter' };
      }

      if (['clear', 'clear all', 'delete all', 'clear field', 'clear text'].includes(t)) {
        return { name: 'clear' };
      }

      return { name: 'deleteWord' };
    }

    return { name: 'text', arg: raw };
  }

  // English typing command
  let m = t.match(/^(?:type|write|enter text|dictate)\s+(.+)$/);

  if (m) {
    const arg = raw.replace(/^\s*(type|write|enter text|dictate)\s+/i, '');
    return { name: 'text', arg };
  }

  if (matchesCommand(t, 'dictateOn')) return { name: 'dictateOn' };

  if (matchesCommand(t, 'calibrate')) return { name: 'calibrate' };

  if (/^(dwell|dwell click|dwell clicking)\s+(on|off)$/.test(t)) {
    return { name: 'dwell', arg: t.endsWith('on') };
  }

  if (/^enable dwell( click)?$/.test(t)) return { name: 'dwell', arg: true };
  if (/^disable dwell( click)?$/.test(t)) return { name: 'dwell', arg: false };

  if (matchesCommand(t, 'mistake')) return { name: 'mistake' };
  if (matchesCommand(t, 'help')) return { name: 'help' };

  if (matchesCommand(t, 'doubleClick')) return { name: 'dblclick' };
  if (matchesCommand(t, 'click')) return { name: 'click' };
  if (matchesCommand(t, 'enter')) return { name: 'enter' };

  if (matchesCommand(t, 'hintsOn')) return { name: 'hintsOn' };
  if (matchesCommand(t, 'hintsOff')) return { name: 'hintsOff' };

  // Numbered hints: "click 5", "number five", "click 5"
  if ((m = t.match(/^(?:click|open|press|select|number|choose|tap)\s+([a-z0-9 -]+)$/))) {
    const n = parseNumber(m[1], true);
    if (n !== null && n > 0) return { name: 'hintClick', arg: n };
  }

  if (/^\d{1,3}$/.test(t)) {
    const n = parseNumber(t);
    if (n !== null && n > 0) return { name: 'hintClick', arg: n };
  }

  // Scrolling
  if (matchesCommand(t, 'scrollDown')) return { name: 'scroll', arg: 'down' };
  if (matchesCommand(t, 'scrollUp')) return { name: 'scroll', arg: 'up' };
  if (matchesCommand(t, 'scrollLeft')) return { name: 'scroll', arg: 'left' };
  if (matchesCommand(t, 'scrollRight')) return { name: 'scroll', arg: 'right' };
  if (matchesCommand(t, 'top')) return { name: 'scroll', arg: 'top' };
  if (matchesCommand(t, 'bottom')) return { name: 'scroll', arg: 'bottom' };

  // Browser navigation
  if (matchesCommand(t, 'back')) return { name: 'back' };
  if (matchesCommand(t, 'forward')) return { name: 'forward' };
  if (matchesCommand(t, 'reload')) return { name: 'reload' };
  if (matchesCommand(t, 'newTab')) return { name: 'newTab' };
  if (matchesCommand(t, 'closeTab')) return { name: 'closeTab' };
  if (matchesCommand(t, 'nextTab')) return { name: 'nextTab' };
  if (matchesCommand(t, 'prevTab')) return { name: 'prevTab' };

  // Search
  if ((m = t.match(/^search(?: for)?\s+(.+)$/))) {
    return { name: 'search', arg: m[1] };
  }

  if ((m = t.match(/^(?:open|go to|visit|navigate to)\s+(.+)$/))) {
    const target = m[1];

    if (KNOWN_SITES[target]) return { name: 'goto', arg: KNOWN_SITES[target] };

    const url = toUrl(target);
    if (url) return { name: 'goto', arg: url };

    return { name: 'clickText', arg: target };
  }

  if ((m = t.match(/^(?:click|press|select|tap)\s+(.+)$/))) {
    return { name: 'clickText', arg: m[1] };
  }

  // Hindi/Marathi search and open website commands
  if ((m = t.match(/^(?:खोजो|सर्च करो|खोजें)\s+(.+)$/))) {
    return { name: 'search', arg: m[1] };
  }

  if ((m = t.match(/^(?:शोधा|सर्च करा|शोध)\s+(.+)$/))) {
    return { name: 'search', arg: m[1] };
  }

  if ((m = t.match(/^(?:खोलो|खोलें|ओपन करो)\s+(.+)$/))) {
    return { name: 'clickText', arg: m[1] };
  }

  if ((m = t.match(/^(?:उघडा|उघड|ओपन करा)\s+(.+)$/))) {
    return { name: 'clickText', arg: m[1] };
  }

  return { name: 'unknown', arg: raw };
}

export const HELP_TEXT =
  'English / Hindi / Marathi: click / क्लिक करो / क्लिक करा · ' +
  'scroll down / नीचे जाओ / खाली जा · ' +
  'go back / वापस जाओ / मागे जा · ' +
  'new tab / नया टैब खोलो / नवीन टॅब उघडा · ' +
  'pause / रुको / थांबा · resume / शुरू करो / सुरू करा · calibrate';