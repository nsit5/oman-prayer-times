// popup.js v2.1

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

const LBL = { fajr:'الفجر', shuruq:'الشروق', dhuhr:'الظهر', asr:'العصر', maghrib:'المغرب', isha:'العشاء' };
const ORDER  = ['fajr','shuruq','dhuhr','asr','maghrib','isha'];
const IQ_ORD = ['fajr','dhuhr','asr','maghrib','isha'];
const DEF_OFF = { fajr:25, dhuhr:20, asr:20, maghrib:10, isha:20 };

let prayers = null;
let cfg = { cityId:'0', theme:'dark', notifyAdhan:true, notifyIqama:true, soundEnabled:false, showNextOnly:true, fontSize:13, iqamaOffsets:{...DEF_OFF} };

// ======== helpers ========
function fmt12(ms) {
  if (!ms) return '--:--';
  const d = new Date(ms);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'م' : 'ص';
  const hh = h > 12 ? h-12 : h === 0 ? 12 : h;
  return `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}`;
}

function fmtCountdown(diffMs) {
  if (diffMs <= 0) return 'حان الوقت';
  const s = Math.floor(diffMs/1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function getOff(key) { return cfg.iqamaOffsets[key] ?? DEF_OFF[key] ?? 20; }

function getNextKey() {
  if (!prayers) return null;
  const now = Date.now();
  for (const k of IQ_ORD) {
    if (!prayers[k]) continue;
    if (prayers[k] + getOff(k)*60000 > now) return k;
  }
  return null;
}

// ======== tabs ========
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('panel-'+t.dataset.tab).classList.add('active');
  });
});

// ======== city select ========
function buildCitySelect() {
  const sel = document.getElementById('csel');
  sel.innerHTML = '';
  for (const [id, name] of Object.entries(CITIES)) {
    const o = document.createElement('option');
    o.value = id; o.textContent = name;
    sel.appendChild(o);
  }
  sel.value = cfg.cityId;
  sel.addEventListener('change', () => {
    cfg.cityId = sel.value;
    saveAll();
    document.getElementById('hcity').textContent = CITIES[cfg.cityId] || 'مسقط';
    chrome.runtime.sendMessage({ type:'REFRESH' }, () => setTimeout(loadData, 3000));
  });
}

// ======== toggles ========
function bindToggle(id, key) {
  const el = document.getElementById(id);
  el.addEventListener('click', () => {
    cfg[key] = !cfg[key];
    el.classList.toggle('on', cfg[key]);
    saveAll();
  });
}
bindToggle('tog-adhan',   'notifyAdhan');
bindToggle('tog-iqama',   'notifyIqama');
bindToggle('tog-sound',   'soundEnabled');
bindToggle('tog-nextonly','showNextOnly');

// ======== themes ========
document.querySelectorAll('.tbtn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tbtn').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    cfg.theme = b.dataset.theme;
    saveAll();
  });
});

// ======== offsets ========
document.querySelectorAll('.offbtn').forEach(b => {
  b.addEventListener('click', () => {
    const k = b.dataset.k, d = parseInt(b.dataset.d);
    cfg.iqamaOffsets[k] = Math.max(0, Math.min(60, (cfg.iqamaOffsets[k]??DEF_OFF[k]) + d*5));
    document.getElementById('ov-'+k).textContent = cfg.iqamaOffsets[k];
    saveAll();
  });
});

// ======== font size slider ========
document.addEventListener('DOMContentLoaded', () => {});
// use event delegation since slider is always in DOM
document.getElementById('font-size-range')?.addEventListener('input', function() {
  cfg.fontSize = parseInt(this.value);
  document.getElementById('fs-val').textContent = cfg.fontSize;
  saveAll();
});

// ======== refresh button ========
document.getElementById('refbtn').addEventListener('click', () => {
  const btn = document.getElementById('refbtn');
  btn.textContent = '⏳ جاري الجلب...';
  btn.disabled = true;
  chrome.storage.local.remove('lastFetchDay', () => {
    chrome.runtime.sendMessage({ type:'REFRESH' }, () => {
      setTimeout(() => {
        loadData();
        btn.textContent = '✅ تم التحديث';
        setTimeout(() => { btn.textContent = '🔄 تحديث المواقيت الآن'; btn.disabled = false; }, 2000);
      }, 3500);
    });
  });
});

// ======== save ========
function saveAll() {
  chrome.storage.local.set({
    cityId:       cfg.cityId,
    theme:        cfg.theme,
    notifyAdhan:  cfg.notifyAdhan,
    notifyIqama:  cfg.notifyIqama,
    soundEnabled: cfg.soundEnabled,
    showNextOnly: cfg.showNextOnly,
    fontSize:     cfg.fontSize,
    iqamaOffsets: cfg.iqamaOffsets
  });
}

// ======== load from storage ========
function loadData() {
  chrome.storage.local.get(
    ['cityId','theme','notifyAdhan','notifyIqama','soundEnabled','showNextOnly','fontSize','iqamaOffsets','prayerData','lastFetchDay'],
    res => {
      if (res.cityId      !== undefined) cfg.cityId      = res.cityId;
      if (res.theme       !== undefined) cfg.theme       = res.theme;
      if (res.notifyAdhan !== undefined) cfg.notifyAdhan = res.notifyAdhan;
      if (res.notifyIqama !== undefined) cfg.notifyIqama = res.notifyIqama;
      if (res.soundEnabled !== undefined) cfg.soundEnabled = res.soundEnabled;
      if (res.fontSize    !== undefined) cfg.fontSize    = res.fontSize || 13;
      if (res.showNextOnly!== undefined) cfg.showNextOnly= res.showNextOnly;
      if (res.iqamaOffsets) cfg.iqamaOffsets = { ...DEF_OFF, ...res.iqamaOffsets };

      // sync UI
      document.getElementById('csel').value = cfg.cityId;
      document.getElementById('hcity').textContent = CITIES[cfg.cityId] || 'مسقط';
      document.getElementById('tog-adhan').classList.toggle('on', cfg.notifyAdhan);
      document.getElementById('tog-iqama').classList.toggle('on', cfg.notifyIqama);
      document.getElementById('tog-sound').classList.toggle('on', cfg.soundEnabled);
      const fsr = document.getElementById('font-size-range');
      if (fsr) { fsr.value = cfg.fontSize; document.getElementById('fs-val').textContent = cfg.fontSize; }
      document.getElementById('tog-nextonly').classList.toggle('on', cfg.showNextOnly);
      document.querySelectorAll('.tbtn').forEach(b => b.classList.toggle('sel', b.dataset.theme === cfg.theme));
      for (const k of IQ_ORD) {
        const el = document.getElementById('ov-'+k);
        if (el) el.textContent = cfg.iqamaOffsets[k] ?? DEF_OFF[k];
      }

      if (res.lastFetchDay) {
        document.getElementById('lupdate').textContent = 'آخر جلب: ' + res.lastFetchDay;
      }

      if (res.prayerData) {
        prayers = res.prayerData; // raw ms values
        const d = res.prayerData;
        if (d.isFallback) document.getElementById('fallnote').style.display = 'block';
        if (d.dateStr)    document.getElementById('pdate').textContent = d.dateStr;
        render();
      } else {
        // لا بيانات — اطلب جلباً جديداً
        document.getElementById('plist').innerHTML = '<div class="prow"><div class="pname" style="color:#e67e22">لا توجد بيانات — اضغط تحديث</div></div>';
        document.getElementById('nname').textContent = 'لا توجد بيانات';
        document.getElementById('iqrow').textContent = 'اضغط "تحديث المواقيت" في تبويب الإعدادات';
        chrome.storage.local.remove('lastFetchDay', () => {
          chrome.runtime.sendMessage({ type:'REFRESH' }, () => setTimeout(loadData, 4000));
        });
      }
    }
  );
}

// ======== render ========
function render() {
  if (!prayers) return;
  const now = Date.now();
  const nextKey = getNextKey();

  // بطاقة القادمة
  if (nextKey) {
    const ams = prayers[nextKey];
    const ims = ams + getOff(nextKey)*60000;
    const diffA = ams - now;
    const diffI = ims - now;
    document.getElementById('nname').textContent = LBL[nextKey];
    document.getElementById('ntime').textContent = 'الأذان: ' + fmt12(ams);
    document.getElementById('cdown').textContent = diffA > 0 ? fmtCountdown(diffA) : fmtCountdown(diffI);
    const iqMin = Math.ceil(diffI/60000);
    if (diffA <= 0 && diffI > 0)
      document.getElementById('iqrow').textContent = `📿 الإقامة بعد ${iqMin} دقيقة`;
    else if (diffI <= 0)
      document.getElementById('iqrow').textContent = '✅ أقيمت الصلاة';
    else
      document.getElementById('iqrow').textContent = `⏱ إقامة بعد ${Math.ceil(diffA/60000)} د أذان + ${getOff(nextKey)} د`;
  } else {
    document.getElementById('nname').textContent = 'انتهت صلوات اليوم';
    document.getElementById('ntime').textContent = 'إلى الفجر الغد';
    document.getElementById('cdown').textContent = '--:--';
    document.getElementById('iqrow').textContent = '🌙 نوم هنيء';
  }

  // قائمة الصلوات
  let html = '';
  for (const key of ORDER) {
    const ams = prayers[key];
    if (!ams) continue;
    const ims  = ams + (key !== 'shuruq' ? getOff(key)*60000 : 0);
    const done = key === 'shuruq' ? ams < now : ims < now;
    const isNext = key === nextKey;
    const cls = 'prow' + (done && !isNext ? ' done' : '') + (isNext ? ' nxt' : '');
    const badge = isNext ? '<span class="badge b-next">▸ القادمة</span>' : done ? '<span class="badge b-done">✓</span>' : '';
    const iqLine = key !== 'shuruq' ? `<div class="piqama">إقامة: ${fmt12(ims)}</div>` : '';
    html += `<div class="${cls}"><div class="pname">${LBL[key]} ${badge}</div><div class="ptimes"><div class="padhan">${fmt12(ams)}</div>${iqLine}</div></div>`;
  }
  document.getElementById('plist').innerHTML = html;
}

// ======== tick ========
function tick() {
  if (!prayers) return;
  const now = Date.now();
  const nextKey = getNextKey();
  if (!nextKey) return;
  const ams = prayers[nextKey];
  const ims = ams + getOff(nextKey)*60000;
  const diff = ams > now ? ams - now : ims - now;
  const el = document.getElementById('cdown');
  if (el) el.textContent = fmtCountdown(diff);
}

// ======== boot ========
buildCitySelect();
loadData();

// font slider (attach after DOM ready)
setTimeout(() => {
  const fsr = document.getElementById('font-size-range');
  if (fsr) {
    fsr.addEventListener('input', function() {
      cfg.fontSize = parseInt(this.value);
      document.getElementById('fs-val').textContent = cfg.fontSize;
      saveAll();
    });
  }
}, 50);
setInterval(tick, 1000);
setInterval(loadData, 30000);
