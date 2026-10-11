const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60
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

// English command phrases. Hindi, Marathi, Gujarati and Tamil phrases (in their own scripts) are added below.
const ENGLISH = {
  pause: ['pause', 'sleep', 'freeze', 'stop tracking'],
  resume: ['resume', 'wake up', 'wake', 'start tracking', 'unfreeze'],
  calibrate: ['calibrate', 'recalibrate', 'calibration', 'start calibration'],
  click: ['click', 'select', 'press', 'tap', 'click this', 'click here', 'click it', 'left click'],
  doubleClick: ['double click', 'double tap'],
  enter: ['enter', 'press enter', 'submit'],
  scrollDown: ['scroll down', 'page down', 'down', 'go down'],
  scrollUp: ['scroll up', 'page up', 'up', 'go up'],
  scrollLeft: ['scroll left', 'left'],
  scrollRight: ['scroll right', 'right'],
  top: ['scroll to top', 'go to top', 'top of page', 'top', 'scroll top'],
  bottom: ['scroll to bottom', 'go to bottom', 'bottom of page', 'bottom', 'scroll bottom'],
  back: ['go back', 'back', 'navigate back', 'previous page'],
  forward: ['go forward', 'forward', 'navigate forward', 'next page'],
  reload: ['refresh', 'reload', 'refresh page', 'reload page'],
  newTab: ['new tab', 'open new tab', 'open a new tab'],
  closeTab: ['close tab', 'close this tab', 'close the tab'],
  nextTab: ['next tab', 'switch tab', 'switch tabs', 'tab right'],
  prevTab: ['previous tab', 'prev tab', 'last tab', 'tab left'],
  hintsOn: ['show numbers', 'display numbers', 'turn on numbers', 'show links', 'show labels', 'show hints', 'numbers'],
  hintsOff: ['hide numbers', 'remove numbers', 'clear numbers', 'turn off numbers', 'hide links', 'hide labels', 'hide hints'],
  dictateOn: ['dictate', 'dictation', 'start typing', 'start dictation', 'type', 'write'],
  dictateOff: ['stop dictation', 'stop typing', 'stop dictating', 'stop', 'done', 'finish'],
  help: ['help', 'commands', 'what can i say'],
  mistake: ['undo', 'that was a mistake', 'wrong click', 'mistake', 'oops'],
};
const COMMANDS = JSON.parse(JSON.stringify(ENGLISH));

// ====================== NATIVE-SCRIPT COMMANDS ======================
// Chrome returns speech in the script of the selected language (Hindi/Marathi: Devanagari,
// Gujarati: Gujarati script, Tamil: Tamil script). These phrases are ADDED to the romanized ones above.
const NATIVE = {
  pause: [
    // Hindi
    'रुको', 'रुक जाओ', 'रुकिए', 'रोको', 'ट्रैकिंग रोक दो', 'बंद करो', 'पॉज',
    // Marathi
    'थांबा', 'थांब', 'थांबव', 'ट्रॅकिंग थांबवा', 'बंद करा',
    // Gujarati
    'અટકો', 'રોકો', 'રોકાઈ જાઓ', 'ટ્રેકિંગ બંધ કરો', 'બંધ કરો', 'પોઝ',
    // Tamil
    'நிறுத்து', 'நிறுத்துங்கள்', 'நில்லு', 'டிராக்கிங் நிறுத்து', 'பாஸ்',
  ],
  resume: [
    'शुरू करो', 'फिर से शुरू करो', 'ट्रैकिंग शुरू करो', 'चालू करो', 'जारी रखो', 'रिज़्यूम',
    'सुरू करा', 'पुन्हा सुरू करा', 'ट्रॅकिंग सुरू करा', 'चालू करा', 'रिझ्यूम',
    'ચાલુ કરો', 'પાછું ચાલુ કરો', 'ટ્રેકિંગ ચાલુ કરો', 'ફરી શરૂ કરો', 'શરૂ કરો', 'રિઝ્યુમ',
    'தொடங்கு', 'மறுபடி தொடங்கு', 'டிராக்கிங் தொடங்கு', 'தொடர்', 'ரெஸ்யூம்',
  ],
  calibrate: [
    'कैलिब्रेट करो', 'कैलिब्रेट', 'कैलिब्रेशन', 'कैलिब्रेशन शुरू करो',
    'कॅलिब्रेट करा', 'कॅलिब्रेट', 'कॅलिब्रेशन सुरू करा',
    'કેલિબ્રેટ કરો', 'કેલિબ્રેટ', 'કેલિબ્રેશન શરૂ કરો',
    'கேலிப்ரேட் செய்', 'கேலிப்ரேட்', 'கேலிப்ரேஷன் தொடங்கு',
  ],
  click: [
    'क्लिक करो', 'क्लिक करें', 'क्लिक कर दो', 'क्लिक', 'चुनो', 'सिलेक्ट करो', 'दबाओ', 'यहाँ क्लिक करो', 'इसे क्लिक करो',
    'क्लिक करा', 'निवडा', 'सिलेक्ट करा', 'दाबा', 'इथे क्लिक करा',
    'ક્લિક કરો', 'ક્લિક', 'પસંદ કરો', 'સિલેક્ટ કરો', 'દબાવો', 'અહીં ક્લિક કરો',
    'கிளிக் செய்', 'கிளிக்', 'தேர்ந்தெடு', 'செலக்ட் செய்', 'அழுத்து', 'இங்கே கிளிக் செய்',
  ],
  doubleClick: [
    'डबल क्लिक करो', 'डबल क्लिक', 'दो बार क्लिक करो',
    'डबल क्लिक करा', 'दोन वेळा क्लिक करा',
    'ડબલ ક્લિક કરો', 'ડબલ ક્લિક', 'બે વાર ક્લિક કરો',
    'டபுள் கிளிக் செய்', 'டபுள் கிளிக்', 'இரண்டு முறை கிளிக் செய்',
  ],
  enter: [
    'एंटर', 'एंटर दबाओ', 'सबमिट करो', 'जमा करो',
    'एंटर दाबा', 'सबमिट करा', 'जमा करा',
    'એન્ટર', 'એન્ટર દબાવો', 'સબમિટ કરો', 'જમા કરો',
    'என்டர்', 'என்டர் அழுத்து', 'சப்மிட் செய்', 'உள்ளிடு',
  ],
  scrollDown: [
    'नीचे', 'नीचे जाओ', 'नीचे करो', 'नीचे स्क्रॉल करो', 'नीचे स्क्रोल करो', 'स्क्रॉल डाउन', 'पेज डाउन',
    'खाली', 'खाली जा', 'खाली करा', 'खाली स्क्रोल करा', 'खाली स्क्रॉल करा', 'स्क्रोल डाउन',
    'નીચે', 'નીચે જાઓ', 'નીચે કરો', 'નીચે સ્ક્રોલ કરો', 'સ્ક્રોલ ડાઉન',
    'கீழே', 'கீழ்', 'கீழே போ', 'கீழே போகவும்', 'கீழே ஸ்க்ரோல் செய்', 'ஸ்க்ரோல் டவுன்',
  ],
  scrollUp: [
    'ऊपर', 'ऊपर जाओ', 'ऊपर स्क्रॉल करो', 'ऊपर स्क्रोल करो', 'स्क्रॉल अप', 'पेज अप',
    'वर', 'वर जा', 'वर स्क्रोल करा', 'वर स्क्रॉल करा', 'स्क्रोल अप',
    'ઉપર', 'ઉપર જાઓ', 'ઉપર સ્ક્રોલ કરો', 'સ્ક્રોલ અપ',
    'மேலே', 'மேல்', 'மேலே போ', 'மேலே போகவும்', 'மேலே ஸ்க்ரோல் செய்', 'ஸ்க்ரோல் அப்',
  ],
  scrollLeft: [
    'बाएं', 'बाएँ', 'बायें', 'बाएं स्क्रॉल करो', 'बाईं तरफ जाओ',
    'डावीकडे', 'डावीकडे स्क्रोल करा', 'डावीकडे जा',
    'ડાબે', 'ડાબી બાજુ જાઓ', 'ડાબી બાજુ સ્ક્રોલ કરો',
    'இடது', 'இடது பக்கம் போ', 'இடது பக்கம் ஸ்க்ரோல் செய்',
  ],
  scrollRight: [
    'दाएं', 'दाएँ', 'दायें', 'दाएं स्क्रॉल करो', 'दाईं तरफ जाओ',
    'उजवीकडे', 'उजवीकडे स्क्रोल करा', 'उजवीकडे जा',
    'જમણે', 'જમણી બાજુ જાઓ', 'જમણી બાજુ સ્ક્રોલ કરો',
    'வலது', 'வலது பக்கம் போ', 'வலது பக்கம் ஸ்க்ரோல் செய்',
  ],
  top: [
    'सबसे ऊपर जाओ', 'पेज के ऊपर जाओ', 'टॉप पर जाओ', 'ऊपर तक स्क्रॉल करो',
    'सर्वात वर जा', 'पानाच्या वर जा', 'टॉप वर जा',
    'સૌથી ઉપર જાઓ', 'પેજ ના ઉપર જાઓ', 'ટોચ પર જાઓ',
    'பக்கத்தின் மேலே போ', 'மேலே வரை போ', 'டாப்', 'ஸ்க்ரோல் டு டாப்',
  ],
  bottom: [
    'सबसे नीचे जाओ', 'पेज के नीचे जाओ', 'बॉटम पर जाओ', 'नीचे तक स्क्रॉल करो',
    'सर्वात खाली जा', 'पानाच्या खाली जा', 'बॉटम वर जा',
    'સૌથી નીચે જાઓ', 'પેજ ના નીચે જાઓ', 'તળિયે જાઓ',
    'பக்கத்தின் கீழே போ', 'கீழே வரை போ', 'பாட்டம்',
  ],
  back: [
    'पीछे जाओ', 'वापस जाओ', 'पिछले पेज पर जाओ', 'पीछे', 'वापस',
    'मागे जा', 'मागील पानावर जा', 'परत जा', 'मागे',
    'પાછળ જાઓ', 'પાછા જાઓ', 'પહેલાના પેજ પર જાઓ', 'પાછળ',
    'திரும்பி போ', 'பின்னாடி போ', 'பின்னே போ', 'பின்', 'முந்தைய பக்கம்',
  ],
  forward: [
    'आगे जाओ', 'अगले पेज पर जाओ', 'आगे',
    'पुढे जा', 'पुढच्या पानावर जा', 'पुढे',
    'આગળ જાઓ', 'આગલા પેજ પર જાઓ', 'આગળ',
    'முன்னாடி போ', 'முன்னே', 'அடுத்த பக்கம் போ',
  ],
  reload: [
    'रिफ्रेश', 'रिफ्रेश करो', 'पेज रिफ्रेश करो', 'पेज फिर से खोलो', 'रीलोड करो',
    'रिफ्रेश करा', 'पेज रिफ्रेश करा', 'पान पुन्हा लोड करा', 'रीलोड करा',
    'રિફ્રેશ કરો', 'પેજ રિફ્રેશ કરો', 'પેજ ફરી લોડ કરો', 'રીલોડ કરો',
    'ரிஃப்ரெஷ்', 'பேஜ் ரிஃப்ரெஷ் செய்', 'மறுபடி லோட் செய்', 'ரீலோட்',
  ],
  newTab: [
    'नया टैब', 'नया टैब खोलो', 'नया टैब खोल दो', 'नई टैब खोलो',
    'नवीन टॅब', 'नवीन टॅब उघडा', 'नवा टॅब उघडा',
    'નવી ટેબ', 'નવી ટેબ ખોલો', 'નવો ટેબ ખોલો',
    'புதிய டேப்', 'புது டேப்', 'புதிய டேப் திற', 'புதிய டேப் ஓபன் செய்',
  ],
  closeTab: [
    'टैब बंद करो', 'टैब बंद कर दो', 'टैब बंद', 'यह टैब बंद करो',
    'टॅब बंद करा', 'हा टॅब बंद करा',
    'ટેબ બંધ કરો', 'આ ટેબ બંધ કરો',
    'டேப் மூடு', 'இந்த டேப்பை மூடு', 'டேப் குளோஸ் செய்',
  ],
  nextTab: [
    'अगला टैब', 'अगली टैब', 'अगले टैब पर जाओ', 'अगला टैब खोलो',
    'पुढचा टॅब', 'पुढच्या टॅबवर जा', 'पुढील टॅब उघडा',
    'આગલી ટેબ', 'આગલી ટેબ પર જાઓ', 'બીજી ટેબ ખોલો',
    'அடுத்த டேப்', 'அடுத்த டேப் போ', 'அடுத்த டேப் ஓபன் செய்',
  ],
  prevTab: [
    'पिछला टैब', 'पिछली टैब', 'पिछले टैब पर जाओ', 'पिछला टैब खोलो',
    'मागचा टॅब', 'मागील टॅब', 'मागच्या टॅबवर जा', 'मागचा टॅब उघडा',
    'પાછલી ટેબ', 'પહેલાની ટેબ પર જાઓ', 'પાછલી ટેબ ખોલો',
    'முந்தைய டேப்', 'முந்தைய டேப் போ', 'முந்தைய டேப் ஓபன் செய்',
  ],
  hintsOn: [
    'नंबर दिखाओ', 'नंबर्स दिखाओ', 'लिंक दिखाओ', 'नंबर चालू करो',
    'नंबर दाखवा', 'क्रमांक दाखवा', 'लिंक दाखवा', 'नंबर सुरू करा',
    'નંબર બતાવો', 'લિંક બતાવો', 'નંબર ચાલુ કરો',
    'நம்பர் காட்டு', 'எண்களை காட்டு', 'லிங்க் காட்டு', 'ஹிண்ட்ஸ் காட்டு',
  ],
  hintsOff: [
    'नंबर छुपाओ', 'नंबर हटाओ', 'लिंक छुपाओ', 'नंबर बंद करो',
    'नंबर लपवा', 'लिंक लपवा', 'नंबर बंद करा',
    'નંબર છુપાવો', 'લિંક છુપાવો', 'નંબર બંધ કરો',
    'நம்பர் மறை', 'எண்களை மறை', 'லிங்க் மறை', 'ஹிண்ட்ஸ் ஆஃப் செய்',
  ],
  dictateOn: [
    'डिक्टेट', 'टाइपिंग शुरू करो', 'टाइप करना शुरू करो', 'लिखना शुरू करो', 'बोलकर लिखो',
    'टायपिंग सुरू करा', 'लिहायला सुरू करा',
    'ટાઇપિંગ ચાલુ કરો', 'લખવાનું ચાલુ કરો', 'ડિક્ટેટ',
    'டிக்டேட்', 'டைப்பிங் தொடங்கு', 'டைப் செய்யத் தொடங்கு', 'எழுதத் தொடங்கு',
  ],
  dictateOff: [
    'टाइपिंग बंद करो', 'लिखना बंद करो', 'बस', 'हो गया',
    'टायपिंग बंद करा', 'लिहायचे थांबवा', 'झाले',
    'ટાઇપિંગ બંધ કરો', 'લખવાનું બંધ કરો', 'બસ', 'થઈ ગયું',
    'டைப்பிங் நிறுத்து', 'எழுதுவதை நிறுத்து', 'போதும்', 'முடிந்தது',
  ],
  help: [
    'मदद', 'मदद करो', 'कमांड बताओ', 'हेल्प', 'कमांड्स',
    'मदत', 'मदत करा', 'कमांड सांगा',
    'મદદ', 'મદદ કરો', 'કમાન્ડ બતાવો', 'હેલ્પ',
    'உதவி', 'ஹெல்ப் செய்', 'கமாண்ட்ஸ் சொல்லு', 'கமாண்ட்ஸ்',
  ],
  mistake: [
    'गलती हो गई', 'गलती हो गयी', 'गलत क्लिक', 'गलती', 'पूर्ववत',
    'चूक झाली', 'चुकीचा क्लिक', 'चूक',
    'ભૂલ થઈ', 'ખોટો ક્લિક', 'ભૂલ',
    'தவறு', 'தப்பு', 'தவறான கிளிக்', 'செயல்தவிர்',
  ],
  zoomIn: [
    'ज़ूम इन', 'जूम इन', 'ज़ूम', 'जूम', 'बड़ा करो', 'बड़ा',
    'झूम इन', 'झूम', 'मोठे करा',
    'ઝૂમ ઇન', 'ઝૂમ', 'મોટું કરો',
    'ஜூம் இன்', 'ஜூம்', 'பெரிதாக்கு',
  ],
  zoomOut: [
    'ज़ूम आउट', 'जूम आउट', 'छोटा करो', 'छोटा',
    'झूम आउट', 'लहान करा',
    'ઝૂમ આઉટ', 'નાનું કરો',
    'ஜூம் அவுட்', 'சிறிதாக்கு',
  ],
  zoomReset: [
    'ज़ूम रीसेट', 'जूम रीसेट', 'ज़ूम रीसेट करो', 'सामान्य ज़ूम',
    'झूम रीसेट', 'सामान्य झूम',
    'ઝૂમ રીસેટ', 'સામાન્ય ઝૂમ',
    'ஜூம் ரீசெட்', 'சாதாரண ஜூம்',
  ],
  // Used while dictating
  clearText: [
    'सब साफ करो', 'सब हटाओ', 'साफ करो', 'क्लियर',
    'सर्व साफ करा', 'सर्व काढा', 'साफ करा',
    'બધું સાફ કરો', 'બધું હટાવો', 'સાફ કરો',
    'எல்லாவற்றையும் அழி', 'அழி', 'கிளியர்',
  ],
  deleteWord: [
    'हटाओ', 'मिटाओ', 'डिलीट', 'आखिरी शब्द हटाओ',
    'काढा', 'पुसा',
    'હટાવો', 'ભૂંસી નાખો',
    'நீக்கு', 'டிலீட்',
  ],
};
for (const [name, list] of Object.entries(NATIVE)) {
  COMMANDS[name] = [...(COMMANDS[name] || []), ...list];
}

// Native number words (Chrome usually returns digits like "5", but may spell them out).
Object.assign(NUMBER_WORDS, {
  // Hindi
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5, 'छह': 6, 'छः': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  // Marathi
  'दोन': 2, 'पाच': 5, 'सहा': 6, 'नऊ': 9, 'दहा': 10,
  // Gujarati
  'એક': 1, 'બે': 2, 'ત્રણ': 3, 'ચાર': 4, 'પાંચ': 5, 'છ': 6, 'સાત': 7, 'આઠ': 8, 'નવ': 9, 'દસ': 10,
  // Tamil
  'ஒன்று': 1, 'இரண்டு': 2, 'மூன்று': 3, 'நான்கு': 4, 'ஐந்து': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8, 'ஒன்பது': 9, 'பத்து': 10,
});

// Native site names ("यूट्यूब खोलो", "ગૂગલ ખોલો").
Object.assign(KNOWN_SITES, {
  'गूगल': KNOWN_SITES.google, 'ગૂગલ': KNOWN_SITES.google, 'கூகுள்': KNOWN_SITES.google,
  'यूट्यूब': KNOWN_SITES.youtube, 'यूट्युब': KNOWN_SITES.youtube, 'યુટ્યુબ': KNOWN_SITES.youtube, 'யூடியூப்': KNOWN_SITES.youtube,
  'जीमेल': KNOWN_SITES.gmail, 'જીમેલ': KNOWN_SITES.gmail, 'ஜிமெயில்': KNOWN_SITES.gmail,
  'विकिपीडिया': KNOWN_SITES.wikipedia, 'વિકિપીડિયા': KNOWN_SITES.wikipedia, 'விக்கிபீடியா': KNOWN_SITES.wikipedia,
  'गिटहब': KNOWN_SITES.github, 'ગિટહબ': KNOWN_SITES.github, 'கிட்ஹப்': KNOWN_SITES.github,
  'मैप्स': KNOWN_SITES.maps, 'મેપ્સ': KNOWN_SITES.maps, 'மேப்ஸ்': KNOWN_SITES.maps,
  'गूगल मैप्स': KNOWN_SITES.maps,
});

const nativeAlt = (arr) => [...arr].sort((a, b) => b.length - a.length).join('|');
const CLICK_VERBS = nativeAlt(['क्लिक करो', 'क्लिक करें', 'क्लिक करा', 'ક્લિક કરો', 'கிளிக் செய்',
  'क्लिक', 'ક્લિક', 'கிளிக்', 'नंबर', 'નંબર', 'நம்பர்']);
const CLICK_FULL = nativeAlt(['क्लिक करो', 'क्लिक करें', 'क्लिक करा', 'ક્લિક કરો', 'கிளிக் செய்']);
const ON_WORDS = nativeAlt(['पर', 'वर', 'પર', 'மேல்']);
const TYPE_VERBS = nativeAlt(['टाइप करो', 'टाइप करें', 'टाइप करा', 'लिखो', 'लिखें', 'लिहा',
  'ટાઇપ કરો', 'લખો', 'டைப் செய்', 'எழுது']);
const SEARCH_VERBS = nativeAlt(['खोजो', 'खोजें', 'सर्च करो', 'सर्च करें', 'शोधा', 'शोध', 'सर्च करा',
  'શોધો', 'સર્ચ કરો', 'தேடுங்கள்', 'தேடு', 'சர்ச் செய்']);
const OPEN_VERBS = nativeAlt(['खोलो', 'खोलें', 'ओपन करो', 'उघडा', 'उघड', 'ओपन करा',
  'ખોલો', 'ઓપન કરો', 'திறக்கவும்', 'திற', 'ஓபன் செய்']);

const DIGITS = { '०': 0, '१': 1, '२': 2, '३': 3, '४': 4, '५': 5, '६': 6, '७': 7, '८': 8, '९': 9,
  '૦': 0, '૧': 1, '૨': 2, '૩': 3, '૪': 4, '૫': 5, '૬': 6, '૭': 7, '૮': 8, '૯': 9,
  '௦': 0, '௧': 1, '௨': 2, '௩': 3, '௪': 4, '௫': 5, '௬': 6, '௭': 7, '௮': 8, '௯': 9 };
function toAsciiDigits(s) {
  return String(s).replace(/[०-९૦-૯௦-௯]/g, (ch) => DIGITS[ch]);
}

// Spelling-tolerant comparison: ignore spaces, punctuation, nukta (ज़ = ज) and chandrabindu (ँ = ं).
function canon(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[़઼]/g, '')
    .replace(/ँ/g, 'ं')
    .replace(/ઁ/g, 'ં')
    .normalize('NFC')
    .replace(/[​-‍\s.,!?;:"'।॥-]/g, '');
}
const CANON_CACHE = {};
function matchesCommand(text, commandName) {
  if (!CANON_CACHE[commandName]) {
    CANON_CACHE[commandName] = new Set((COMMANDS[commandName] || []).map(canon));
  }
  return CANON_CACHE[commandName].has(canon(text));
}

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[.,!?;:"।॥]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseNumber(token, allowHomophones = false) {
  if (!token) return null;

  const t = toAsciiDigits(token.trim());

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

    if (matchesCommand(t, 'enter')) return { name: 'enter' };
    if (matchesCommand(t, 'clearText')) return { name: 'clear' };
    if (matchesCommand(t, 'deleteWord')) return { name: 'deleteWord' };

    return { name: 'text', arg: raw };
  }

  // Switch the cursor-control mode by voice: "head mode", "eyes mode", "hands mode"
  let m = t.match(/^(?:(?:switch|change|go|swap) to |use |select )?(head|eye|eyes|hand|hands)(?: (?:and|plus) voice)? (?:mode|control|tracking)$/) ||
          t.match(/^(?:switch|change|swap) to (head|eye|eyes|hand|hands)(?: (?:and|plus) voice)?$/);
  if (m) {
    const k = m[1];
    return { name: 'mode', arg: k === 'head' ? 'head' : k.startsWith('eye') ? 'eyes' : 'hands' };
  }

  // English typing command
  m = t.match(/^(?:type|write|enter text|dictate)\s+(.+)$/);

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
if (t === 'zoom in' || t === 'zoom') return { name: 'zoom', arg: 'in' };
if (t === 'zoom out') return { name: 'zoom', arg: 'out' };
if (t === 'reset zoom' || t === 'zoom reset') return { name: 'zoom', arg: 'reset' };
  if (matchesCommand(t, 'zoomReset')) return { name: 'zoom', arg: 'reset' };
  if (matchesCommand(t, 'zoomOut')) return { name: 'zoom', arg: 'out' };
  if (matchesCommand(t, 'zoomIn')) return { name: 'zoom', arg: 'in' };
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

  // ---- Native-script phrases with arguments (Hindi, Marathi, Gujarati, Tamil) ----
  const rx = (src) => new RegExp(src, 'u');
  const toNum = (word) => {
    const n = parseNumber(word, false);
    return n !== null && n > 0 ? n : null;
  };

  // Bare digits, e.g. "५"
  if (/^\d{1,3}$/.test(toAsciiDigits(t))) {
    const n = toNum(t);
    if (n !== null) return { name: 'hintClick', arg: n };
  }

  // "क्लिक 5" / "५ पर क्लिक करो" / "கிளிக் 5"
  if ((m = t.match(rx('^(?:' + CLICK_VERBS + ')\\s+(\\S+)$')))) {
    const n = toNum(m[1]);
    if (n !== null) return { name: 'hintClick', arg: n };
  }
  if ((m = t.match(rx('^(\\S+)\\s+(?:(?:' + ON_WORDS + ')\\s+)?(?:' + CLICK_VERBS + ')$')))) {
    const n = toNum(m[1]);
    if (n !== null) return { name: 'hintClick', arg: n };
  }

  // Typing: "टाइप करो hello", "लिखो नमस्ते", "ટાઇપ કરો ...", "டைப் செய் ..."
  if ((m = raw.match(rx('^\\s*(?:' + TYPE_VERBS + ')\\s+(.+)$')))) {
    return { name: 'text', arg: m[1] };
  }

  // Search: verb first or last ("खोजो सस्ते फ्लाइट" / "सस्ते फ्लाइट खोजो")
  if ((m = t.match(rx('^(?:' + SEARCH_VERBS + ')\\s+(.+)$'))) ||
      (m = t.match(rx('^(.+?)\\s+(?:' + SEARCH_VERBS + ')$')))) {
    return { name: 'search', arg: m[1] };
  }

  // Open a site or a link by its text ("यूट्यूब खोलो", "उघडा about us")
  if ((m = t.match(rx('^(?:' + OPEN_VERBS + ')\\s+(.+)$'))) ||
      (m = t.match(rx('^(.+?)\\s+(?:' + OPEN_VERBS + ')$')))) {
    const target = m[1].trim();
    if (KNOWN_SITES[target]) return { name: 'goto', arg: KNOWN_SITES[target] };
    const url = toUrl(target);
    if (url) return { name: 'goto', arg: url };
    return { name: 'clickText', arg: target };
  }

  // Click a link by its text ("about us पर क्लिक करो", "about us वर क्लिक करा", "ક્લિક કરો about us")
  if ((m = t.match(rx('^(.+?)\\s+(?:(?:' + ON_WORDS + ')\\s+)?(?:' + CLICK_FULL + ')$'))) ||
      (m = t.match(rx('^(?:' + CLICK_FULL + ')\\s+(.+)$')))) {
    return { name: 'clickText', arg: m[1].trim() };
  }

  return { name: 'unknown', arg: raw };
}

export const HELP_TEXT =
  'English: click · scroll down · go back · new tab · pause · resume · zoom in · show numbers, then click 5\n' +
  'हिंदी: क्लिक करो · नीचे जाओ · वापस जाओ · नया टैब खोलो · रुको · शुरू करो · ज़ूम इन · नंबर दिखाओ, फिर क्लिक 5\n' +
  'मराठी: क्लिक करा · खाली जा · मागे जा · नवीन टॅब उघडा · थांबा · सुरू करा · झूम इन · नंबर दाखवा, मग क्लिक 5\n' +
  'ગુજરાતી: ક્લિક કરો · નીચે જાઓ · પાછળ જાઓ · નવી ટેબ ખોલો · અટકો · ચાલુ કરો · ઝૂમ ઇન · નંબર બતાવો, પછી ક્લિક 5\n' +
  'தமிழ்: கிளிக் செய் · கீழே போ · திரும்பி போ · புதிய டேப் திற · நிறுத்து · தொடங்கு · ஜூம் இன் · நம்பர் காட்டு, பிறகு கிளிக் 5\n' +
  'Modes (English): head mode · eyes mode · hands mode\n' +
  'Pick the same language in the Language box, then speak.';