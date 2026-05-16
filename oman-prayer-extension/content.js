// content.js v3.0 — يقرأ من جدول الصفحة مباشرة مثل السكربت الأصلي

(function () {
  'use strict';
  if (document.getElementById('_opr_widget')) return;

  const CITY_NAMES = {"0":"مسقط","1":"ابراء","2":"أدم","3":"أزكي","4":"الأشخرة","5":"البريمي","6":"الجازر","7":"الجمة","8":"الحشمان","9":"الحلانيات","10":"الحمرة","11":"الخابورة","12":"الخضرفي","13":"الخوير","14":"الدقم","15":"الرستاق","16":"العوابي","17":"القابل الشرقية","18":"القابل الظاهرة","19":"الكامل والوافي","20":"المضيبي","21":"المعمورة","22":"الهويسة","23":"الواسط","24":"الواصل","25":"بخا","26":"بدبد","27":"بدية","28":"بركاء","29":"بهلاء","30":"ثمريت","31":"جدة الحراسيس","32":"جعلان بوحسن","33":"جعلان بوعلي","34":"حبروت","35":"حج","36":"خزان","37":"دبا البيعة","38":"رأس الحد","39":"رأس مدركة","40":"رخيوت","41":"رمال الوهيبة","42":"ريسوت","43":"سدح","44":"سمائل","45":"سمد الشان","46":"سناو","47":"سويق","48":"سيح الروال","49":"سيق","50":"شليم","51":"شناص","52":"صحار","53":"صحم","54":"صراب","55":"صرفيت","56":"صلالة","57":"صور","58":"ضنك","59":"طاقة","60":"ظلكوت","61":"عبري","62":"فهود","63":"قرن العلم","64":"قريات","65":"كنهات","66":"لوى","67":"محضة","68":"محوت","69":"مدحاء","70":"مرباط","71":"مرمور","72":"مرمول","73":"مسندم","74":"مصنعة","75":"مصيرة","76":"مقشن","77":"منح","78":"نخل","79":"نزوى","80":"نمر","81":"هروويل","82":"هيماء","83":"وادي بني خالد","84":"وادي حيبي","85":"ينقل"};

  const THEMES = {
    dark:    { bg:'#121212', fg:'#00e5ff', border:'#00e5ff', title:'#ffffff', iqama:'#ffb100', sub:'#2a2a2a', btn:'#1a2a2a', resize:'#00e5ff' },
    light:   { bg:'#f0f8ff', fg:'#1d4f82', border:'#1d4f82', title:'#1d4f82', iqama:'#b36a00', sub:'#c0d0e8', btn:'#ddeeff', resize:'#1d4f82' },
    classic: { bg:'#0d3b26', fg:'#c8e6c9', border:'#2e7d52', title:'#a5d6a7', iqama:'#ffe082', sub:'#1b5e20', btn:'#1a4d30', resize:'#a5d6a7' },
    green:   { bg:'#e8f5e9', fg:'#1b5e20', border:'#4caf50', title:'#1b5e20', iqama:'#e65100', sub:'#c8e6c9', btn:'#c8e6c9', resize:'#4caf50' },
    purple:  { bg:'#1a0533', fg:'#ce93d8', border:'#7b1fa2', title:'#f3e5f5', iqama:'#ffb300', sub:'#3a1050', btn:'#2a0a44', resize:'#ce93d8' },
    gold:    { bg:'#1c1500', fg:'#ffd54f', border:'#f9a825', title:'#fff8e1', iqama:'#ff8f00', sub:'#3a2d00', btn:'#2c2000', resize:'#ffd54f' }
  };

  const LOCAL_ADHAN = chrome.runtime.getURL('adhan.mp3');
  const DEF_OFF = { fajr:25, dhuhr:20, asr:20, maghrib:10, isha:20 };

  // حالة الويدجت
  let cfg = {
    cityId:'0', theme:'dark', offsets:{...DEF_OFF},
    showNextOnly:true, soundEnabled:false, fontSize:13
  };
  let prayerData  = []; // [{name, adhan(ms), iqama(ms)}]
  let notified    = new Set();
  let isMinimized = false;
  let audio       = null;
  let isResizing  = false;
  let boxW        = 210;
  let boxH        = 0;

  // ============================================================
  // الخطوة 1: اختيار الولاية تلقائياً والضغط على "أعرض"
  // ============================================================
  function autoSelectCity() {
    const sel = document.querySelector('select[name="CityID"]');
    const btn = document.querySelector('input[type="submit"][name="B1"]');
    if (!sel || !btn) return false;
    if (sel.value === cfg.cityId) return false; // الولاية محددة مسبقاً

    sel.value = cfg.cityId;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => btn.click(), 300);
    return true; // تم إعادة التحميل
  }

  // ============================================================
  // الخطوة 2: قراءة الجدول من الصفحة مباشرة
  // ============================================================
  function readTableFromPage() {
    // محاولة 1: جدول .table_area (مثل السكربت الأصلي)
    const table = document.querySelector('.table_area table');
    if (table) {
      const rows = table.querySelectorAll('tr');
      if (rows.length >= 2) {
        const cells = rows[1].querySelectorAll('td');
        if (cells.length >= 7) {
          return parseCells(cells);
        }
      }
    }

    // محاولة 2: أي جدول يحتوي على أوقات
    const allTables = document.querySelectorAll('table');
    for (const t of allTables) {
      const rows = t.querySelectorAll('tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
          const times = [...cells].filter(c => /^\d{1,2}:\d{2}$/.test(c.innerText.trim()));
          if (times.length >= 6) return parseCells(cells);
        }
      }
    }
    return null;
  }

  function parseCells(cells) {
    // cells: [تاريخ, فجر, شروق, ظهر, عصر, مغرب, عشاء]
    const now = new Date();
    const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();

    function toMs(str, isPM) {
      const [h, m] = str.split(':').map(Number);
      let hour = h;
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      return new Date(Y, M, D, hour, m, 0).getTime();
    }

    // استخرج نصوص الخلايا، تخطّ الخلية الأولى (التاريخ)
    const raw = [...cells].map(c => c.innerText.trim());
    // ابحث عن أول 6 أوقات
    const times = raw.filter(v => /^\d{1,2}:\d{2}$/.test(v));
    if (times.length < 6) return null;

    const [fajr, shuruq, dhuhr, asr, maghrib, isha] = times;
    const off = { ...DEF_OFF, ...cfg.offsets };

    return [
      { key:'fajr',    name:'الفجر',   adhan: toMs(fajr,   false), iqama: toMs(fajr,   false) + off.fajr    * 60000 },
      { key:'shuruq',  name:'الشروق',  adhan: toMs(shuruq, false), iqama: null },
      { key:'dhuhr',   name:'الظهر',   adhan: toMs(dhuhr,  true),  iqama: toMs(dhuhr,  true)  + off.dhuhr   * 60000 },
      { key:'asr',     name:'العصر',   adhan: toMs(asr,    true),  iqama: toMs(asr,    true)   + off.asr     * 60000 },
      { key:'maghrib', name:'المغرب',  adhan: toMs(maghrib,true),  iqama: toMs(maghrib,true)  + off.maghrib  * 60000 },
      { key:'isha',    name:'العشاء',  adhan: toMs(isha,   true),  iqama: toMs(isha,   true)   + off.isha    * 60000 },
    ];
  }

  // ============================================================
  // الخطوة 3: تحديث البيانات كل ثانية
  // ============================================================
  function tick() {
    loadCfg(() => {
      // تحقق من تطابق الولاية المحددة في الصفحة
      const sel = document.querySelector('select[name="CityID"]');
      if (sel && sel.value !== cfg.cityId) {
        autoSelectCity();
        return; // انتظر إعادة التحميل
      }

      const parsed = readTableFromPage();
      if (parsed) {
        prayerData = parsed;
        // احفظ في storage للـ background (للإشعارات)
        const stored = {};
        parsed.forEach(p => { if (p.key !== 'shuruq') stored[p.key] = p.adhan; });
        stored.dateStr = new Date().toLocaleDateString('ar-OM');
        stored.fetchedAt = Date.now();
        stored.isFallback = false;
        chrome.storage.local.set({ prayerData: stored, lastFetchDay: new Date().toDateString() });
      }

      checkNotifications();
      renderWidget();
    });
  }

  // ============================================================
  // إشعارات + صوت
  // ============================================================
  function checkNotifications() {
    const now = Date.now();
    prayerData.forEach(p => {
      if (!p.adhan) return;
      const diff = p.adhan - now;
      if (diff <= 0 && diff > -60000 && !notified.has(p.key)) {
        notified.add(p.key);
        if (Notification.permission === 'granted')
          new Notification('🕌 حان أذان ' + p.name, { body: 'ولاية ' + (CITY_NAMES[cfg.cityId] || 'عُمان') });
        if (cfg.soundEnabled) playAdhan();
      }
    });
  }

  function playAdhan() {
    try {
      if (audio) { audio.pause(); audio = null; }
      audio = new Audio(LOCAL_ADHAN);
      audio.volume = 1.0;
      audio.addEventListener('ended', () => { audio = null; });
      audio.addEventListener('error', () => { playFallbackTone(); audio = null; });
      audio.play().catch(() => {});
    } catch(e) { playFallbackTone(); }
  }

  function stopAdhan() {
    if (audio) { audio.pause(); audio = null; }
  }

  function playFallbackTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [{f:330,s:0,d:0.4},{f:294,s:0.35,d:0.3},{f:330,s:0.6,d:0.45},{f:392,s:0.9,d:0.5},{f:349,s:1.3,d:0.6},{f:330,s:1.8,d:0.9}];
      const t = ctx.currentTime;
      notes.forEach(n => {
        const o=ctx.createOscillator(), g=ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type='sine'; o.frequency.value=n.f;
        g.gain.setValueAtTime(0,t+n.s);
        g.gain.linearRampToValueAtTime(0.3,t+n.s+0.05);
        g.gain.linearRampToValueAtTime(0,t+n.s+n.d);
        o.start(t+n.s); o.stop(t+n.s+n.d+0.1);
      });
    } catch(e) {}
  }

  // ============================================================
  // تحميل الإعدادات من storage
  // ============================================================
  function loadCfg(cb) {
    chrome.storage.local.get(
      ['cityId','theme','iqamaOffsets','showNextOnly','soundEnabled','fontSize','boxWidth','boxHeight'],
      res => {
        if (res.cityId)                    cfg.cityId      = res.cityId;
        if (res.theme)                     cfg.theme       = res.theme;
        if (res.iqamaOffsets)              cfg.offsets     = {...DEF_OFF,...res.iqamaOffsets};
        if (res.showNextOnly !== undefined) cfg.showNextOnly = res.showNextOnly;
        if (res.soundEnabled !== undefined) cfg.soundEnabled = res.soundEnabled;
        if (res.fontSize)                  cfg.fontSize    = res.fontSize;
        if (res.boxWidth)                  boxW            = res.boxWidth;
        if (res.boxHeight)                 boxH            = res.boxHeight;
        cb();
      }
    );
  }

  // ============================================================
  // رسم الويدجت
  // ============================================================
  // تحديث الأرقام فقط بدون إعادة بناء الـ HTML
  function updateNumbers() {
    const box = document.getElementById('_opr_widget');
    if (!box) return;
    const now = Date.now();
    const nextPrayer = prayerData.find(p => p.iqama && p.iqama > now)
                    || prayerData.find(p => p.adhan && p.adhan > now);

    prayerData.forEach(p => {
      const rowEl = box.querySelector(`[data-key="${p.key}"]`);
      if (!rowEl) return;
      const diffA = Math.floor((p.adhan - now) / 1000);
      const diffI = p.iqama ? Math.floor((p.iqama - now) / 1000) : null;

      const adhanEl  = rowEl.querySelector('.cd-adhan');
      const iqamaEl  = rowEl.querySelector('.cd-iqama');
      const nameEl   = rowEl.querySelector('.cd-name');
      const isNext   = nextPrayer && p.key === nextPrayer.key;

      if (adhanEl)  adhanEl.textContent  = '⏳ ' + fmtSec(diffA);
      if (iqamaEl && diffI !== null)
        iqamaEl.textContent = '📿 ' + (diffI > 0 ? fmtSec(diffI) : 'أقيمت');
      if (nameEl)
        nameEl.textContent = p.name + (isNext ? ' ◄' : '');
    });
  }

    function renderWidget() {
    // لا تُعيد رسم الهيكل أثناء تغيير الحجم — فقط حدّث الأرقام
    if (isResizing) {
      updateNumbers();
      return;
    }
    const t   = THEMES[cfg.theme] || THEMES.dark;
    const fs  = cfg.fontSize || 13;
    const fs2 = Math.max(9,  fs - 2);
    const fs3 = Math.max(8,  fs - 3);
    const now = Date.now();
    const cityName = CITY_NAMES[cfg.cityId] || 'عُمان';

    // الصلاة القادمة
    const nextPrayer = prayerData.find(p => p.iqama && p.iqama > now)
                    || prayerData.find(p => p.adhan && p.adhan > now);

    let box = document.getElementById('_opr_widget');
    if (!box) {
      box = document.createElement('div');
      box.id = '_opr_widget';
      Object.assign(box.style, {
        position:'fixed', top:'20px', left:'20px',
        zIndex:'2147483647', fontFamily:'Tahoma,Arial,sans-serif',
        direction:'rtl', userSelect:'none',
        borderRadius:'12px', overflow:'hidden',
        boxShadow:'0 8px 28px rgba(0,0,0,0.45)',
        width: boxW+'px'
      });
      document.body.appendChild(box);
    }

    Object.assign(box.style, {
      background: t.bg, border: '1.5px solid '+t.border,
      width: boxW+'px',
      height: boxH > 0 ? boxH+'px' : 'auto',
      overflowY: boxH > 0 ? 'auto' : 'visible'
    });

    const soundIco = cfg.soundEnabled ? '🔔' : '🔕';
    const minIco   = isMinimized ? '▲' : '▼';

    // ---- شريط العنوان ----
    let html = `
      <div id="_hdr" style="display:flex;justify-content:space-between;align-items:center;
        padding:7px 10px;cursor:move;background:${t.btn};border-bottom:1px solid ${t.sub};">
        <span style="font-weight:bold;color:${t.title};font-size:${fs}px;">🕌 ${cityName}</span>
        <span style="display:flex;gap:5px;align-items:center;">
          <span id="_snd" title="${cfg.soundEnabled?'إيقاف الصوت':'تفعيل الصوت'}"
            style="cursor:pointer;font-size:${fs+1}px;">${soundIco}</span>
          <span id="_stp" title="إيقاف الصوت"
            style="cursor:pointer;font-size:${fs3}px;color:${t.fg};opacity:.6;
            border:1px solid ${t.border};border-radius:3px;padding:0 4px;">▢||</span>
          <span id="_tst" title="اختبار الصوت"
            style="cursor:pointer;font-size:${fs3}px;color:${t.fg};opacity:.7;
            border:1px solid ${t.border};border-radius:3px;padding:0 4px;">▷</span>
          <span id="_min" title="تصغير/تكبير"
            style="cursor:pointer;font-size:${fs2}px;color:${t.fg};opacity:.6;">${minIco}</span>
          <span id="_cls" title="إخفاء"
            style="cursor:pointer;font-size:${fs2}px;color:${t.fg};opacity:.45;">✕</span>
        </span>
      </div>`;

    if (!isMinimized) {
      html += `<div style="padding:11px 12px;">`;

      if (prayerData.length === 0) {
        html += `<div style="color:${t.fg};opacity:.6;font-size:${fs}px;text-align:center;padding:10px 0;">
          ⏳ جاري تحميل المواقيت...
        </div>`;
      } else {
        prayerData.forEach(p => {
          const diffA = Math.floor((p.adhan - now) / 1000);
          const diffI = p.iqama ? Math.floor((p.iqama - now) / 1000) : null;

          // إخفاء المنتهية إذا كان الخيار مفعلاً
          if (cfg.showNextOnly && diffI !== null && diffI < -600) return;
          if (cfg.showNextOnly && diffI === null && diffA < -600) return;

          const isNext = nextPrayer && p.key === nextPrayer.key;
          const hl = isNext
            ? `background:${t.btn};border-radius:7px;padding:5px 7px;margin:-5px -7px;border:1px solid ${t.border};`
            : '';

          html += `<div data-key="${p.key}" style="margin-bottom:10px;${hl}">`;
          // سطر الاسم + وقت الأذان
          html += `<div style="display:flex;justify-content:space-between;align-items:center;">
            <b class="cd-name" style="color:${t.title};font-size:${fs}px;">${p.name}${isNext?' ◄':''}</b>
            <span style="font-size:${fs}px;color:${t.fg};font-weight:500;">${fmt12(p.adhan)}</span>
          </div>`;
          // سطر العد التنازلي للأذان
          html += `<div style="display:flex;justify-content:space-between;margin-top:2px;">
            <span class="cd-adhan" style="font-size:${fs2}px;color:${t.fg};opacity:.8;">⏳ ${fmtSec(diffA)}</span>
            ${p.iqama ? `<span style="font-size:${fs2}px;color:${t.fg};opacity:.7;">إقامة: ${fmt12(p.iqama)}</span>` : ''}
          </div>`;
          // سطر العد التنازلي للإقامة
          if (diffI !== null) {
            html += `<div style="text-align:left;margin-top:1px;">
              <span class="cd-iqama" style="font-size:${fs3}px;color:${t.iqama};">📿 ${diffI > 0 ? fmtSec(diffI) : 'أقيمت'}</span>
            </div>`;
          }
          html += `</div>`;
        });
      }

      // شريط الصوت السفلي
      html += `<div style="margin-top:6px;padding-top:5px;border-top:1px solid ${t.sub};
        font-size:${fs3}px;color:${t.fg};opacity:.5;text-align:center;">
        ${cfg.soundEnabled?'🔔 الصوت مفعّل':'🔕 الصوت موقوف'} · ▶ اختبار
      </div></div>`;
    }

    // مقبض تغيير الحجم — زاوية يسرى سفلى
    html += `<div id="_rsz" style="position:absolute;bottom:0;left:0;width:16px;height:16px;
      cursor:nwse-resize;opacity:.55;display:flex;align-items:center;justify-content:center;">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <line x1="2" y1="9" x2="9" y2="2" stroke="${t.resize}" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="5" y1="9" x2="9" y2="5" stroke="${t.resize}" stroke-width="1.5" stroke-linecap="round"/>
      </svg></div>`;

    box.innerHTML = html;

    // ربط الأحداث
    makeDraggable(box, box.querySelector('#_hdr'));
    setupResize(box);

    box.querySelector('#_cls')?.addEventListener('click', e => { e.stopPropagation(); box.style.display='none'; });
    box.querySelector('#_min')?.addEventListener('click', e => { e.stopPropagation(); isMinimized=!isMinimized; renderWidget(); });
    box.querySelector('#_snd')?.addEventListener('click', e => {
      e.stopPropagation();
      cfg.soundEnabled = !cfg.soundEnabled;
      chrome.storage.local.set({ soundEnabled: cfg.soundEnabled });
      renderWidget();
    });
    box.querySelector('#_tst')?.addEventListener('click', e => { e.stopPropagation(); playAdhan(); });
    box.querySelector('#_stp')?.addEventListener('click', e => { e.stopPropagation(); stopAdhan(); });
  }

  // ============================================================
  // مساعدات
  // ============================================================
  function fmt12(ms) {
    if (!ms) return '--:--';
    const d=new Date(ms), h=d.getHours(), m=d.getMinutes();
    const hh=h>12?h-12:h===0?12:h;
    return `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h>=12?'م':'ص'}`;
  }

  function fmtSec(sec) {
    if (sec <= 0) return 'حان الوقت';
    return Math.floor(sec/60)+'د '+String(sec%60).padStart(2,'0')+'ث';
  }

  // ============================================================
  // السحب
  // ============================================================
  function makeDraggable(box, handle) {
    if (!handle) return;
    let ox=0,oy=0,ix=0,iy=0,drag=false;
    handle.addEventListener('mousedown', e => {
      const id = e.target.id;
      if (['_snd','_tst','_stp','_min','_cls'].includes(id)) return;
      drag=true; ix=e.clientX; iy=e.clientY;
      ox=parseInt(box.style.left)||20; oy=parseInt(box.style.top)||20;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      box.style.left = Math.max(0, ox+e.clientX-ix)+'px';
      box.style.top  = Math.max(0, oy+e.clientY-iy)+'px';
    });
    document.addEventListener('mouseup', ()=>{ drag=false; });
  }

  // ============================================================
  // تغيير الحجم من الزاوية (عرض + ارتفاع)
  // ============================================================
  function setupResize(box) {
    const rsz = box.querySelector('#_rsz');
    if (!rsz) return;
    let startX=0, startY=0, startW=0, startH=0, rightEdge=0;

    rsz.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      isResizing = true;
      startX = e.clientX; startY = e.clientY;
      startW = box.offsetWidth; startH = box.offsetHeight;
      rightEdge = box.getBoundingClientRect().right;
      document.body.style.cursor = 'nwse-resize';
    });

    document.addEventListener('mousemove', e => {
      if (!isResizing) return;
      // عرض: من موضع الماوس حتى الحافة اليمنى الثابتة
      const newW = Math.max(180, Math.min(440, rightEdge - e.clientX));
      // ارتفاع: سحب للأسفل يكبّر
      const newH = Math.max(120, Math.min(620, startH + (e.clientY - startY)));
      boxW = newW; boxH = newH;
      box.style.left      = (rightEdge - newW)+'px';
      box.style.width     = newW+'px';
      box.style.height    = newH+'px';
      box.style.overflowY = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = '';
      chrome.storage.local.set({ boxWidth:boxW, boxHeight:boxH });
      // أعد رسم كامل مرة واحدة بعد انتهاء السحب
      renderWidget();
    });
  }

  // ============================================================
  // تشغيل
  // ============================================================
  if (typeof Notification !== 'undefined' && Notification.permission === 'default')
    Notification.requestPermission();

  // أول تحميل — اختر الولاية إذا لزم ثم ابدأ الـ tick
  loadCfg(() => {
    autoSelectCity();
    setInterval(tick, 1000);
    tick();
  });

})();
