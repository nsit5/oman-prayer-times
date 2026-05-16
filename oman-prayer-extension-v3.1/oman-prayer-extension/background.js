// background.js v2.1

const CITIES = {
  "0":"مسقط","1":"ابراء","2":"أدم","3":"أزكي","4":"الأشخرة","5":"البريمي",
  "6":"الجازر","7":"الجمة","8":"الحشمان","9":"الحلانيات","10":"الحمرة",
  "11":"الخابورة","12":"الخضرفي","13":"الخوير","14":"الدقم","15":"الرستاق",
  "16":"العوابي","17":"القابل الشرقية","18":"القابل الظاهرة","19":"الكامل والوافي",
  "20":"المضيبي","21":"المعمورة","22":"الهويسة","23":"الواسط","24":"الواصل",
  "25":"بخا","26":"بدبد","27":"بدية","28":"بركاء","29":"بهلاء","30":"ثمريت",
  "31":"جدة الحراسيس","32":"جعلان بوحسن","33":"جعلان بوعلي","34":"حبروت",
  "35":"حج","36":"خزان","37":"دبا البيعة","38":"رأس الحد","39":"رأس مدركة",
  "40":"رخيوت","41":"رمال الوهيبة","42":"ريسوت","43":"سدح","44":"سمائل",
  "45":"سمد الشان","46":"سناو","47":"سويق","48":"سيح الروال","49":"سيق",
  "50":"شليم","51":"شناص","52":"صحار","53":"صحم","54":"صراب","55":"صرفيت",
  "56":"صلالة","57":"صور","58":"ضنك","59":"طاقة","60":"ظلكوت","61":"عبري",
  "62":"فهود","63":"قرن العلم","64":"قريات","65":"كنهات","66":"لوى",
  "67":"محضة","68":"محوت","69":"مدحاء","70":"مرباط","71":"مرمور","72":"مرمول",
  "73":"مسندم","74":"مصنعة","75":"مصيرة","76":"مقشن","77":"منح","78":"نخل",
  "79":"نزوى","80":"نمر","81":"هروويل","82":"هيماء","83":"وادي بني خالد",
  "84":"وادي حيبي","85":"ينقل"
};

async function fetchFromSite(cityId) {
  const now = new Date();
  const body = new URLSearchParams({
    year:   String(now.getFullYear()),
    month:  String(now.getMonth() + 1),
    day:    String(now.getDate()),
    CityID: String(cityId),
    B1:     '\u0623\u0639\u0631\u0636'
  });
  const resp = await fetch('https://www.mara.gov.om/calendar_page1.asp', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.text();
}

function parseHTML(html) {
  // استخرج كل <td> من جدول النتائج
  const allTd = [...html.matchAll(/<td[^>]*>(.*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g,'').trim());
  // الأوقات بصيغة H:MM أو HH:MM
  const times = allTd.filter(v => /^\d{1,2}:\d{2}$/.test(v));
  if (times.length < 6) return null;
  return buildPrayerObject(times[0], times[1], times[2], times[3], times[4], times[5]);
}

function toMs(str, isAfternoon) {
  const now = new Date();
  let [h, m] = str.split(':').map(Number);
  if (isAfternoon && h < 12) h += 12;
  if (!isAfternoon && h === 12) h = 0;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0).getTime();
}

function buildPrayerObject(fajr, shuruq, dhuhr, asr, maghrib, isha) {
  const now = new Date();
  const d = now.getDate(), mo = now.getMonth()+1, y = now.getFullYear();
  return {
    fajr:    toMs(fajr,    false),
    shuruq:  toMs(shuruq,  false),
    dhuhr:   toMs(dhuhr,   true),
    asr:     toMs(asr,     true),
    maghrib: toMs(maghrib, true),
    isha:    toMs(isha,    true),
    dateStr: `${d}/${mo}/${y}`,
    fetchedAt: Date.now(),
    isFallback: false
  };
}

// حساب تقريبي للمواقيت إذا فشل الجلب
function computeFallback() {
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth()+1, d = now.getDate();
  const doy = Math.floor((now - new Date(y,0,0)) / 86400000);
  const B = (360/365)*(doy-81)*Math.PI/180;
  const decl = 23.45*Math.sin(B)*Math.PI/180;
  const lat  = 23.6*Math.PI/180;
  const cosHA = -Math.tan(lat)*Math.tan(decl);
  const HA = Math.acos(Math.max(-1, Math.min(1, cosHA)))*180/Math.PI;
  const lon = 58.6;
  const tz  = 4;
  const transit = 12 - (lon - tz*15)/15;
  const sunrise = transit - HA/15;
  const sunset  = transit + HA/15;

  function hr2ms(h) {
    const hh = Math.floor(h), mm = Math.round((h-hh)*60);
    return new Date(y, mo-1, d, hh, mm, 0).getTime();
  }
  return {
    fajr:    hr2ms(sunrise - 1.3),
    shuruq:  hr2ms(sunrise),
    dhuhr:   hr2ms(transit + 0.05),
    asr:     hr2ms(transit + HA/15*0.6 + 0.5),
    maghrib: hr2ms(sunset + 0.05),
    isha:    hr2ms(sunset + 1.3),
    dateStr: `${d}/${mo}/${y}`,
    fetchedAt: Date.now(),
    isFallback: true
  };
}

async function refreshPrayers(force) {
  const stored = await chrome.storage.local.get(['cityId','prayerData','lastFetchDay']);
  const cityId = stored.cityId || '0';
  const today  = new Date().toDateString();

  if (!force && stored.lastFetchDay === today && stored.prayerData) {
    scheduleAlarms(stored.prayerData);
    return;
  }

  let data;
  try {
    const html = await fetchFromSite(cityId);
    data = parseHTML(html);
    if (!data) throw new Error('parse failed');
  } catch(e) {
    console.warn('[Prayer] fetch failed:', e.message, '— using fallback');
    data = computeFallback();
  }

  await chrome.storage.local.set({ prayerData: data, lastFetchDay: today, cityId });
  scheduleAlarms(data);
}

async function scheduleAlarms(data) {
  const s = await chrome.storage.local.get(['notifyAdhan','notifyIqama','iqamaOffsets']);
  const notifyAdhan = s.notifyAdhan !== false;
  const notifyIqama = s.notifyIqama !== false;
  const off = { fajr:25, dhuhr:20, asr:20, maghrib:10, isha:20, ...(s.iqamaOffsets||{}) };
  const now = Date.now();

  await chrome.alarms.clearAll();
  for (const key of ['fajr','dhuhr','asr','maghrib','isha']) {
    const ms = data[key];
    if (!ms) continue;
    if (notifyAdhan && ms > now)           chrome.alarms.create('adhan_'+key,  { when: ms });
    if (notifyIqama && ms+off[key]*6e4>now) chrome.alarms.create('iqama_'+key, { when: ms+off[key]*6e4 });
  }
  const tmrw = new Date(); tmrw.setDate(tmrw.getDate()+1); tmrw.setHours(3,0,0,0);
  chrome.alarms.create('daily_refresh', { when: tmrw.getTime() });
}

const LBL = { fajr:'الفجر', dhuhr:'الظهر', asr:'العصر', maghrib:'المغرب', isha:'العشاء' };

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'daily_refresh') {
    await chrome.storage.local.remove('lastFetchDay');
    refreshPrayers(true);
    return;
  }
  const { cityId='0' } = await chrome.storage.local.get('cityId');
  const city = CITIES[cityId] || 'مسقط';
  if (alarm.name.startsWith('adhan_')) {
    const k = alarm.name.slice(6);
    chrome.notifications.create({ type:'basic', iconUrl:'icons/icon128.png',
      title:'🕌 حان أذان '+(LBL[k]||k), message:'ولاية '+city, priority:2 });
  }
  if (alarm.name.startsWith('iqama_')) {
    const k = alarm.name.slice(6);
    chrome.notifications.create({ type:'basic', iconUrl:'icons/icon128.png',
      title:'📿 إقامة '+(LBL[k]||k), message:'ولاية '+city+' — الآن', priority:2 });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'REFRESH') {
    chrome.storage.local.remove('lastFetchDay', () => {
      refreshPrayers(true)
        .then(() => sendResponse({ ok: true }))
        .catch(e => sendResponse({ ok: false, err: e.message }));
    });
    return true;
  }

  // يُستخدم من content.js بدلاً من chrome.storage مباشرة
  if (msg.type === 'GET_WIDGET_DATA') {
    chrome.storage.local.get(
      ['prayerData','theme','iqamaOffsets','showNextOnly','cityId','soundEnabled','fontSize','boxWidth','boxHeight'],
      (res) => sendResponse(res || {})
    );
    return true;
  }

  if (msg.type === 'SAVE_SOUND') {
    chrome.storage.local.set({ soundEnabled: msg.value });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'SAVE_BOX_WIDTH') {
    chrome.storage.local.set({ boxWidth: msg.value });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'SAVE_BOX_SIZE') {
    chrome.storage.local.set({ boxWidth: msg.value.w, boxHeight: msg.value.h });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.storage.onChanged.addListener(async changes => {
  if (changes.cityId) {
    await chrome.storage.local.remove('lastFetchDay');
    refreshPrayers(true);
  } else if (changes.iqamaOffsets || changes.notifyAdhan || changes.notifyIqama) {
    const { prayerData } = await chrome.storage.local.get('prayerData');
    if (prayerData) scheduleAlarms(prayerData);
  }
});

refreshPrayers(false);
