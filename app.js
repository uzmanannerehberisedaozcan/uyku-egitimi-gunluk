// ============================================================
// FIREBASE
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs,
  doc, updateDoc, serverTimestamp, query, where, getDoc, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDaCZfYCUzkTjI01zqFbF7QFXHihcaw-5k",
  authDomain: "uyku-egitimi-gunluk.firebaseapp.com",
  projectId: "uyku-egitimi-gunluk",
  storageBucket: "uyku-egitimi-gunluk.firebasestorage.app",
  messagingSenderId: "744086234737",
  appId: "1:744086234737:web:5caa4c51e62de11ef55dd0"
};

const firebaseApp = initializeApp(firebaseConfig);
const db   = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// ============================================================
// SABİTLER
// ============================================================
const ADMIN_EMAIL = 'sedaozcan@uzmanannerehberi.com';
const ADMIN_SIFRE = '535830';
const WA_NUMBER   = '905074402953'; // Türkiye kodu + numara

// ============================================================
// GLOBAL STATE
// ============================================================
let activeDocId = null;
let aileBilgi   = null; // { anneAd, bebekAd, dogumTarihi, email }
let uzmanAileler = [];

// ============================================================
// YARDIMCILAR
// ============================================================
function el(id) { return document.getElementById(id); }
function show(id, d='block') { const e=el(id); if(e) e.style.display=d; }
function hide(id) { const e=el(id); if(e) e.style.display='none'; }

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el('screen-' + name)?.classList.add('active');
  window.scrollTo(0,0);
}

function showToast(msg, duration=2800) {
  const t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ============================================================
// AUTH MODAL (AİLE)
// ============================================================
function showAuthModal(tab='giris') {
  el('auth-modal')?.classList.add('open');
  authTab(tab);
}
function closeAuthModal() {
  el('auth-modal')?.classList.remove('open');
}
function authTab(mod) {
  el('tab-giris').classList.toggle('active', mod==='giris');
  el('tab-kayit').classList.toggle('active', mod==='kayit');
  el('giris-alanlari').style.display = mod==='giris' ? 'block' : 'none';
  el('kayit-alanlari').style.display = mod==='kayit' ? 'block' : 'none';
  hide('login-hata'); hide('reg-hata');
}

// Giriş
el('btn-giris')?.addEventListener('click', async () => {
  const email = el('login-email').value.trim();
  const sifre = el('login-sifre').value;
  hide('login-hata');
  if (!email || !sifre) { show('login-hata'); el('login-hata').textContent='E-posta ve şifre girin.'; return; }
  const btn = el('btn-giris');
  btn.textContent='⏳ Giriş yapılıyor...'; btn.disabled=true;
  try {
    await signInWithEmailAndPassword(auth, email, sifre);
    closeAuthModal();
  } catch(err) {
    show('login-hata');
    el('login-hata').textContent = err.code==='auth/invalid-credential' ? 'E-posta veya şifre hatalı.' : 'Giriş hatası: '+err.message;
  } finally {
    btn.textContent='Giriş Yap →'; btn.disabled=false;
  }
});

// Kayıt
el('btn-kayit')?.addEventListener('click', async () => {
  const anneAd    = el('reg-anne-ad').value.trim();
  const bebekAd   = el('reg-bebek-ad').value.trim();
  const dogumT    = el('reg-dogum-tarihi').value;
  const email     = el('reg-email').value.trim();
  const sifre     = el('reg-sifre').value;
  const sifre2    = el('reg-sifre2').value;
  hide('reg-hata');

  if (!anneAd||!bebekAd||!dogumT||!email||!sifre) {
    show('reg-hata'); el('reg-hata').textContent='Lütfen tüm alanları doldurun.'; return;
  }
  if (sifre.length < 6) {
    show('reg-hata'); el('reg-hata').textContent='Şifre en az 6 karakter olmalıdır.'; return;
  }
  if (sifre !== sifre2) {
    show('reg-hata'); el('reg-hata').textContent='Şifreler eşleşmiyor.'; return;
  }

  const btn = el('btn-kayit');
  btn.textContent='⏳ Kaydediliyor...'; btn.disabled=true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, sifre);
    const ref  = await addDoc(collection(db, 'egitim_gunlukleri'), {
      tarih:        serverTimestamp(),
      uid:          cred.user.uid,
      email:        email,
      anne_ad:      anneAd,
      bebek_ad:     bebekAd,
      dogum_tarihi: dogumT,
      gunlukler:    [],
    });
    activeDocId = ref.id;
    aileBilgi = { anneAd, bebekAd, dogumTarihi: dogumT, email };
    closeAuthModal();
    portalYukle();
  } catch(err) {
    show('reg-hata');
    el('reg-hata').textContent = err.code==='auth/email-already-in-use'
      ? 'Bu e-posta zaten kayıtlı. Lütfen giriş yapın.'
      : 'Kayıt hatası: '+err.message;
    if (err.code==='auth/email-already-in-use') authTab('giris');
  } finally {
    btn.textContent='Kayıt Ol →'; btn.disabled=false;
  }
});

// ============================================================
// UZMAN GİRİŞ MODAL
// ============================================================
function showUzmanLogin() {
  el('uzman-login-modal')?.classList.add('open');
  el('uzman-email').value = '';
  el('uzman-sifre').value = '';
  hide('uzman-hata');
}
function closeUzmanLogin() {
  el('uzman-login-modal')?.classList.remove('open');
}
async function uzmanGiris() {
  const email = el('uzman-email').value.trim();
  const sifre = el('uzman-sifre').value;
  hide('uzman-hata');
  if (!email || !sifre) { show('uzman-hata'); el('uzman-hata').textContent = 'E-posta ve şifre girin.'; return; }
  if (email !== ADMIN_EMAIL) { show('uzman-hata'); el('uzman-hata').textContent = 'Bu hesap yetkili değil.'; return; }
  const btn = document.querySelector('#uzman-login-modal .btn-primary');
  if (btn) { btn.textContent = '⏳ Giriş...'; btn.disabled = true; }
  try {
    await signInWithEmailAndPassword(auth, email, sifre);
    sessionStorage.setItem('uzmanGiris', 'true');
    closeUzmanLogin();
    showScreen('dashboard');
    uzmanLoadAileler();
  } catch(err) {
    show('uzman-hata');
    el('uzman-hata').textContent = err.code === 'auth/invalid-credential' ? 'E-posta veya şifre hatalı.' : 'Giriş hatası.';
  } finally {
    if (btn) { btn.textContent = 'Giriş →'; btn.disabled = false; }
  }
}
async function uzmanCikis() {
  sessionStorage.removeItem('uzmanGiris');
  await signOut(auth);
  showScreen('landing');
}

// ============================================================
// AİLE — PORTAL YÜKLE
// ============================================================
function portalYukle() {
  showScreen('portal');
  if (aileBilgi) {
    show('bebek-bilgi-banner', 'flex');
    el('banner-bebek-ad').textContent = aileBilgi.bebekAd;
    el('banner-anne-ad').textContent  = aileBilgi.anneAd;
    const d = aileBilgi.dogumTarihi;
    if (d) {
      const dt = new Date(d);
      el('banner-dogum').textContent = 'Doğum: ' + dt.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
    }
  }
  // Kaydedilmiş günlükleri yükle
  if (activeDocId) {
    getDoc(doc(db, 'egitim_gunlukleri', activeDocId)).then(snap => {
      if (snap.exists() && snap.data().gunlukler?.length > 0) {
        setTimeout(() => yukleGunlukler(snap.data().gunlukler), 300);
      }
    }).catch(e => console.warn('Günlük yükleme:', e));
  }
}

// ============================================================
// AİLE — AUTH STATE
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  // Uzman girişi ise aile portalına yönlendirme
  if (user.email === ADMIN_EMAIL) {
    if (sessionStorage.getItem('uzmanGiris') === 'true') {
      if (!el('screen-dashboard')?.classList.contains('active')) {
        showScreen('dashboard');
        uzmanLoadAileler();
      }
    }
    return;
  }

  try {
    const q = query(collection(db, 'egitim_gunlukleri'), where('uid','==',user.uid));
    const snap = await getDocs(q);
    if (snap.empty) { await signOut(auth); return; }

    const docSnap = snap.docs[snap.docs.length - 1];
    activeDocId = docSnap.id;
    const data   = docSnap.data();
    aileBilgi = {
      anneAd:      data.anne_ad      || '',
      bebekAd:     data.bebek_ad     || '',
      dogumTarihi: data.dogum_tarihi || '',
      email:       data.email        || '',
    };

    if (!el('screen-portal')?.classList.contains('active') &&
        !el('screen-dashboard')?.classList.contains('active')) {
      portalYukle();
    }
  } catch(e) { console.error('Auth restore:', e); }
});

function aileCikis() {
  signOut(auth).then(() => {
    activeDocId = null; aileBilgi = null;
    showScreen('landing');
  });
}

// ============================================================
// GÜNLÜK — saat formatı & hesaplama (eski sistemden alındı)
// ============================================================
const gunduzCounters = [0,0,0,0];
const uyanmaCounters = [0,0,0,0];

function parseSaat(v) {
  if (!v) return [NaN, NaN];
  const parts = v.trim().split(/[:.]/).map(Number);
  return [isNaN(parts[0]) ? NaN : parts[0], isNaN(parts[1]) ? 0 : parts[1]];
}

function saatInput(id, oninputFn) {
  const oi = oninputFn || '';
  return '<input type="text" id="' + id + '" placeholder="08:30"'
    + ' inputmode="numeric"'
    + ' style="padding-right:8px;"'
    + ' oninput="formatSaatInput(this);' + oi + '"'
    + ' onblur="formatSaatInput(this,true);' + oi + '">';
}

function formatSaatInput(inp, blur) {
  if (!blur) return;
  let v = inp.value.replace(/[^0-9:]/g, '');
  if (!v.includes(':')) {
    const d = v.replace(/[^0-9]/g, '');
    if (d.length === 3)      v = '0'+d.slice(0,1)+':'+d.slice(1,3);
    else if (d.length >= 4)  v = d.slice(0,2)+':'+d.slice(2,4);
    else if (d.length === 2) v = d+':00';
    else if (d.length === 1) v = '0'+d+':00';
  }
  if (v.includes(':')) {
    let [h,m] = v.split(':').map(Number);
    if (isNaN(h)) h=0; if (isNaN(m)) m=0;
    if (h>23) h=23; if (m>59) m=59;
    v = String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    if (inp.id && /^uy-\d+-\d+-saat$/.test(inp.id)) {
      if (h>=6 && h<22) {
        const duzeltH = h>=12 ? h-12 : h;
        const duzelt = String(duzeltH).padStart(2,'0')+':'+String(m).padStart(2,'0');
        if (confirm('Gece uyanması saati '+v+' girdiniz. '+duzelt+' olarak düzeltekim mi?')) v = duzelt;
      }
    }
  }
  inp.value = v;
}

function calcGece(day) {
  const yatisEl  = el('yatis-'+day);
  const kalkisEl = el('kalkis-'+day);
  const outEl    = el('gece-sure-'+day);
  if (!yatisEl||!kalkisEl||!outEl) return;
  const [yh,yd] = parseSaat(yatisEl.value);
  const [kh,kd] = parseSaat(kalkisEl.value);
  if (isNaN(yh)||isNaN(kh)) { outEl.value=''; return; }
  let total = (kh*60+kd)-(yh*60+yd);
  if (total<0) total+=24*60;
  outEl.value = Math.floor(total/60)+' saat'+(total%60>0?' '+(total%60)+' dk':'');
}

function calcUyanikSureler(day) {
  function saatDk(s) {
    if (!s) return null;
    const p = s.trim().split(/[:.]/).map(Number);
    return isNaN(p[0]) ? null : p[0]*60+(p[1]||0);
  }
  function dkStr(dk) {
    if (!dk||dk<=0) return null;
    const h=Math.floor(dk/60), m=dk%60;
    return h>0 ? (h+'s '+(m>0?m+'dk':'')).trim() : m+'dk';
  }
  function balonHTML(sure, etiket) {
    return '<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(196,147,106,0.1);'
      +'border:1px dashed #C4936A;border-radius:20px;padding:5px 14px;font-size:11.5px;color:#9B6B3A;margin:4px 0;">'
      +'⏱️ <strong>'+sure+'</strong> uyanık'+(etiket?' <span style="opacity:.7">('+etiket+')</span>':'')+'</div>';
  }

  const sabahEl = el('sabah-'+day);
  const sabahDk = sabahEl ? saatDk(sabahEl.value) : null;
  const panel   = el('gunluk-'+day);
  const rows    = panel ? [...panel.querySelectorAll('.gunduz-uyku-row')] : [];

  const sabahBalon = el('sabah-uyanik-'+day);
  if (sabahBalon) {
    if (sabahDk!=null && rows.length>0) {
      const ilkBas = saatDk(el(rows[0].id+'-bas')?.value);
      if (ilkBas!=null) {
        let fark = ilkBas-sabahDk; if (fark<0) fark+=1440;
        const s = dkStr(fark);
        if (s && fark<600) { sabahBalon.style.display='block'; sabahBalon.innerHTML=balonHTML(s,'sabahtan 1. uykuya'); }
        else sabahBalon.style.display='none';
      } else sabahBalon.style.display='none';
    } else sabahBalon.style.display='none';
  }

  rows.forEach((row, idx) => {
    const rowId = row.id;
    let interEl = el(rowId+'-inter');
    if (!interEl) {
      interEl = document.createElement('div');
      interEl.id = rowId+'-inter'; interEl.style.cssText='margin:4px 0 8px 0;';
      row.parentNode.insertBefore(interEl, row.nextSibling);
    }
    if (idx < rows.length-1) {
      const bitDk   = saatDk(el(rowId+'-bit')?.value);
      const nextBas = saatDk(el(rows[idx+1].id+'-bas')?.value);
      if (bitDk!=null && nextBas!=null) {
        let fark=nextBas-bitDk; if(fark<0) fark+=1440;
        interEl.innerHTML = (fark>0&&fark<600) ? balonHTML(dkStr(fark)) : '';
      } else interEl.innerHTML='';
    } else {
      const bitDk   = saatDk(el(rowId+'-bit')?.value);
      const yatisDk = saatDk(el('yatis-'+day)?.value);
      if (bitDk!=null && yatisDk!=null) {
        let geceBas=yatisDk; if(geceBas<bitDk) geceBas+=1440;
        const fark=geceBas-bitDk;
        interEl.innerHTML = (fark>0&&fark<600) ? balonHTML(dkStr(fark),'son gündüz → gece yatışı') : '';
      } else interEl.innerHTML='';
    }
  });
}

function addGunduzUyku(day) {
  const listEl = el('gunduz-list-'+day);
  if (!listEl) return;
  const idx   = gunduzCounters[day]++;
  const rowId = 'gd-'+day+'-'+idx;
  const div   = document.createElement('div');
  div.className = 'gunduz-uyku-row'; div.id = rowId; div.dataset.day = day;
  div.innerHTML =
    '<div class="form-group" style="grid-column:1/-1;padding-bottom:8px;border-bottom:1px solid #E2D5C8;margin-bottom:4px;">'
    +'<label style="font-size:12px;color:#C4936A;font-weight:600;">'+(idx+1)+'. Gündüz Uykusu</label></div>'
    +'<div class="form-group"><label>Başlangıç</label>'+saatInput(rowId+'-bas',"calcGunduz('"+rowId+"')")+'</div>'
    +'<div class="form-group"><label>Bitiş</label>'+saatInput(rowId+'-bit',"calcGunduz('"+rowId+"')")+'</div>'
    +'<div class="form-group"><label>Süre</label>'
    +'<input type="text" id="'+rowId+'-sure" readonly placeholder="Otomatik" style="background:#F5F0EA;color:#7A5C48;"></div>'
    +'<button type="button" class="btn-remove-uyku" onclick="removeGunduzUyku(\''+rowId+'\')">×</button>'
    +'<div class="form-group" style="grid-column:1/-1;"><label>Nasıl uyudu?</label>'
    +'<textarea id="'+rowId+'-not" style="min-height:80px;" placeholder="Uykuya nasıl daldı, nasıl uyandı, ne yaptınız..."></textarea>'
    +'</div>';
  listEl.appendChild(div);
}

function calcGunduz(rowId) {
  const row = el(rowId);
  if (row && row.dataset.day!=null) calcUyanikSureler(parseInt(row.dataset.day));
  const bas = el(rowId+'-bas')?.value;
  const bit = el(rowId+'-bit')?.value;
  const out = el(rowId+'-sure');
  if (!bas||!bit||!out) return;
  const parseTime = s => { if(!s) return null; const p=s.trim().split(/[:.]/); const h=+p[0],m=+(p[1]||0); return isNaN(h)?null:h*60+m; };
  const b=parseTime(bas), e=parseTime(bit);
  if (b===null||e===null) return;
  let diff=e-b; if(diff<0) diff+=1440;
  out.value = Math.floor(diff/60)>0 ? Math.floor(diff/60)+'s '+(diff%60)+'dk' : (diff%60)+'dk';
}

function removeGunduzUyku(rowId) { el(rowId)?.remove(); }

function addUyanma(day) {
  const listEl = el('uyanma-list-'+day);
  if (!listEl) return;
  const idx   = uyanmaCounters[day]++;
  const rowId = 'uy-'+day+'-'+idx;
  const div   = document.createElement('div');
  div.id = rowId;
  div.style.cssText='background:rgba(196,147,106,0.06);border:1px solid #E2D5C8;border-radius:10px;padding:12px;margin-bottom:8px;';
  div.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;">'
    +'<div class="form-group" style="margin:0;"><label>Uyanma saati</label>'+saatInput(rowId+'-saat')+'</div>'
    +'<div class="form-group" style="margin:0;"><label>Ne kadar sürdü?</label>'
    +'<input type="text" id="'+rowId+'-sure" placeholder="örn: 20 dk"></div>'
    +'<button type="button" onclick="el(\''+rowId+'\').remove()"'
    +' style="background:none;border:1.5px solid #E2D5C8;border-radius:6px;padding:8px 10px;cursor:pointer;color:#C4936A;font-size:14px;align-self:end;">×</button>'
    +'</div>'
    +'<div class="form-group" style="margin:0;"><label>Ne yaptınız?</label>'
    +'<textarea id="'+rowId+'-not" style="min-height:60px;" placeholder="örn: Emzirdim, kucağımda uyuttum yatırdım..."></textarea>'
    +'</div>';
  listEl.appendChild(div);
}

function switchGunluk(idx, btn) {
  document.querySelectorAll('.gunluk-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.gunluk-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  el('gunluk-'+idx)?.classList.add('active');
  if (idx > 0) {
    const prevKalkis = el('kalkis-'+(idx-1))?.value;
    const sabahEl = el('sabah-'+idx);
    if (sabahEl && !sabahEl.value && prevKalkis) {
      sabahEl.value = prevKalkis;
      calcUyanikSureler(idx);
    }
  }
}

// ============================================================
// GÜNLÜK VERİ TOPLA
// ============================================================
function gunlukTopla() {
  const gunler = [];
  for (let d = 0; d < 4; d++) {
    const panel = el('gunluk-'+d);
    if (!panel) continue;
    const gunduzRows = panel.querySelectorAll('.gunduz-uyku-row');
    const gunduz = [...gunduzRows].map(row => {
      const rowId = row.id;
      return {
        bas:  el(rowId+'-bas')?.value  || '',
        bit:  el(rowId+'-bit')?.value  || '',
        sure: el(rowId+'-sure')?.value || '',
        not:  el(rowId+'-not')?.value?.trim() || '',
      };
    }).filter(u => u.bas || u.bit);

    const yatis  = el('yatis-'+d)?.value  || '';
    const kalkis = el('kalkis-'+d)?.value || '';
    const sure   = el('gece-sure-'+d)?.value || '';

    const uyanmaList = el('uyanma-list-'+d);
    const uyanmalar  = uyanmaList ? [...uyanmaList.children].map(row => {
      const rowId = row.id;
      return {
        saat: el(rowId+'-saat')?.value || '',
        sure: el(rowId+'-sure')?.value?.trim() || '',
        not:  el(rowId+'-not')?.value?.trim() || '',
      };
    }).filter(u => u.saat || u.not) : [];

    const sabah    = el('sabah-'+d)?.value || '';
    const genelNot = el('genel-not-'+d)?.value?.trim() || '';
    gunler.push({ gun: d+1, sabah, gunduz, gece: { yatis, kalkis, sure }, uyanmalar, genelNot });
  }
  return gunler;
}

// Kaydedilmiş günlükleri forma geri yükle
function yukleGunlukler(gunlukler) {
  if (!gunlukler || !gunlukler.length) return;
  gunlukler.forEach((g, dayIdx) => {
    if (dayIdx > 3) return;
    const gunduzList = el('gunduz-list-'+dayIdx);
    if (gunduzList && g.gunduz && g.gunduz.length > 0) {
      gunduzList.innerHTML = '';
      gunduzCounters[dayIdx] = 0;
      g.gunduz.forEach((gu, gi) => {
        addGunduzUyku(dayIdx);
        const rowId = 'gd-'+dayIdx+'-'+gi;
        if (el(rowId+'-bas'))  el(rowId+'-bas').value  = gu.bas  || '';
        if (el(rowId+'-bit'))  el(rowId+'-bit').value  = gu.bit  || '';
        if (el(rowId+'-sure')) el(rowId+'-sure').value = gu.sure || '';
        if (el(rowId+'-not'))  el(rowId+'-not').value  = gu.not  || '';
      });
    }
    if (el('yatis-'+dayIdx) && g.gece?.yatis)   el('yatis-'+dayIdx).value   = g.gece.yatis;
    if (el('kalkis-'+dayIdx) && g.gece?.kalkis) el('kalkis-'+dayIdx).value  = g.gece.kalkis;
    calcGece(dayIdx);
    const uyanmaList = el('uyanma-list-'+dayIdx);
    if (uyanmaList && g.uyanmalar && g.uyanmalar.length > 0) {
      uyanmaList.innerHTML = '';
      uyanmaCounters[dayIdx] = 0;
      g.uyanmalar.forEach((u, ui) => {
        addUyanma(dayIdx);
        const rowId = 'uy-'+dayIdx+'-'+ui;
        if (el(rowId+'-saat')) el(rowId+'-saat').value = u.saat || '';
        if (el(rowId+'-sure')) el(rowId+'-sure').value = u.sure || '';
        if (el(rowId+'-not'))  el(rowId+'-not').value  = u.not  || '';
      });
    }
    if (el('sabah-'+dayIdx) && g.sabah)       el('sabah-'+dayIdx).value        = g.sabah;
    if (el('genel-not-'+dayIdx) && g.genelNot) el('genel-not-'+dayIdx).value   = g.genelNot;
  });
}

// ============================================================
// GÜNLÜK KAYDET
// ============================================================
async function gunlukKaydet() {
  if (!activeDocId) { showToast('❌ Giriş yapmanız gerekiyor.'); return; }
  const btn = document.querySelector('.btn-kaydet-gunluk');
  if (btn) { btn.textContent='⏳ Kaydediliyor...'; btn.disabled=true; }
  try {
    const gunlukler = gunlukTopla();
    await updateDoc(doc(db, 'egitim_gunlukleri', activeDocId), {
      gunlukler: gunlukler,
      son_guncelleme: serverTimestamp(),
    });
    const status = el('save-status');
    if (status) { status.classList.add('show'); setTimeout(()=>status.classList.remove('show'),3000); }
    showToast('✓ Günlükler kaydedildi!');
  } catch(e) {
    console.error(e);
    showToast('❌ Kayıt hatası: '+e.message);
  } finally {
    if (btn) { btn.textContent='💾 Günlükleri Kaydet'; btn.disabled=false; }
  }
}

// ============================================================
// RAPOR OLUŞTUR & WHATSAPP
// ============================================================
function raporOlustur() {
  if (!aileBilgi) return '';
  const gunlukler = gunlukTopla();
  let msg = '🌙 *UZMAN ANNE REHBERİ — UYKU EĞİTİMİ GÜNLÜĞÜ*\n\n';
  msg += `👶 *Bebek:* ${aileBilgi.bebekAd}\n`;
  msg += `👩 *Anne:* ${aileBilgi.anneAd}\n`;
  if (aileBilgi.dogumTarihi) {
    const dt = new Date(aileBilgi.dogumTarihi);
    msg += `📅 *Doğum:* ${dt.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'})}\n`;
  }
  msg += `📧 *E-posta:* ${aileBilgi.email}\n\n`;
  msg += '─────────────────────────\n\n';

  gunlukler.forEach((g) => {
    msg += `📓 *${g.gun}. GÜN*\n`;
    if (g.sabah) msg += `🌅 Sabah uyanma: ${g.sabah}\n`;

    if (g.gunduz && g.gunduz.length > 0) {
      msg += `\n☀️ *Gündüz Uykuları:*\n`;
      g.gunduz.forEach((u, i) => {
        msg += `  ${i+1}. uyku: ${u.bas||'?'} → ${u.bit||'?'}`;
        if (u.sure) msg += ` (${u.sure})`;
        msg += '\n';
        if (u.not) msg += `  📝 ${u.not}\n`;
      });
    }

    msg += `\n🌙 *Gece Uykusu:*\n`;
    if (g.gece?.yatis) {
      msg += `  Yatış: ${g.gece.yatis} → Kalkış: ${g.gece.kalkis||'?'}`;
      if (g.gece.sure) msg += ` (${g.gece.sure})`;
      msg += '\n';
    } else {
      msg += `  Henüz girilmedi\n`;
    }

    if (g.uyanmalar && g.uyanmalar.length > 0) {
      msg += `\n⬆️ *Gece Uyanmaları:*\n`;
      g.uyanmalar.forEach((u, i) => {
        msg += `  ${i+1}. uyanma: ${u.saat||'?'}`;
        if (u.sure) msg += ` — ${u.sure}`;
        msg += '\n';
        if (u.not) msg += `  📝 ${u.not}\n`;
      });
    }

    if (g.genelNot) msg += `\n📝 *Not:* ${g.genelNot}\n`;
    msg += '\n─────────────────────────\n\n';
  });

  return msg;
}

async function raporGonder(e) {
  e.preventDefault();
  if (!activeDocId) { showToast('❌ Önce giriş yapın.'); return; }

  // Önce kaydet
  try {
    const gunlukler = gunlukTopla();
    await updateDoc(doc(db, 'egitim_gunlukleri', activeDocId), {
      gunlukler: gunlukler,
      son_guncelleme: serverTimestamp(),
    });
  } catch(e2) { console.warn('Kayıt hatası (rapor öncesi):', e2); }

  const msg = raporOlustur();
  if (!msg) { showToast('❌ Rapor oluşturulamadı.'); return; }
  const url = 'https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent(msg);
  window.open(url, '_blank');
}

// ============================================================
// UZMAN PANELİ — AİLELERİ YÜKLE
// ============================================================
async function uzmanLoadAileler() {
  el('aile-list').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-soft);">⏳ Yükleniyor...</div>';
  try {
    const snap = await getDocs(collection(db, 'egitim_gunlukleri'));
    uzmanAileler = [];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      uzmanAileler.push({
        id:          docSnap.id,
        anneAd:      d.anne_ad      || 'İsimsiz',
        bebekAd:     d.bebek_ad     || '—',
        dogumTarihi: d.dogum_tarihi || '',
        email:       d.email        || '',
        gunlukler:   d.gunlukler    || [],
        tarih:       d.tarih?.toDate ? d.tarih.toDate() : null,
        sonGuncelleme: d.son_guncelleme?.toDate ? d.son_guncelleme.toDate() : null,
      });
    });
    uzmanAileler.sort((a,b) => {
      if (!a.tarih&&!b.tarih) return 0;
      if (!a.tarih) return 1;
      if (!b.tarih) return -1;
      return b.tarih - a.tarih;
    });
    renderAileler();
    updateUzmanStats();
  } catch(err) {
    el('aile-list').innerHTML = `<div style="padding:20px;text-align:center;color:#C05050;">❌ Yüklenemedi: ${err.message}</div>`;
  }
}

function updateUzmanStats() {
  el('stat-toplam').textContent = uzmanAileler.length;
  el('stat-aktif').textContent  = uzmanAileler.filter(a => a.gunlukler?.length > 0).length;
  if (uzmanAileler.length > 0) {
    const son = uzmanAileler[0];
    el('stat-son').textContent     = son.bebekAd;
    el('stat-son-sub').textContent = son.tarih ? son.tarih.toLocaleDateString('tr-TR',{day:'numeric',month:'short'}) : 'Yeni';
  }
}

function renderAileler(liste) {
  const l = liste || uzmanAileler;
  const listEl = el('aile-list');
  if (!listEl) return;
  if (l.length === 0) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-soft);">Henüz kayıtlı aile yok.</div>';
    return;
  }
  listEl.innerHTML = l.map(a => {
    const gunSayisi = a.gunlukler?.filter(g => g.gece?.yatis || g.gunduz?.length>0).length || 0;
    const dogumStr  = a.dogumTarihi ? (() => {
      const dt = new Date(a.dogumTarihi);
      return dt.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
    })() : '—';
    return `
    <div class="aile-card" onclick="uzmanShowDetail('${a.id}')">
      <div class="aile-avatar">${a.bebekAd.charAt(0).toUpperCase()}</div>
      <div class="aile-info">
        <strong>${a.bebekAd}</strong>
        <span>${a.anneAd}</span>
        <span style="font-size:11px;color:#9B8878;">📅 Doğum: ${dogumStr}</span>
      </div>
      <div class="aile-meta">
        <div class="gunluk-sayac">📓 ${gunSayisi}/4 gün</div>
        <div style="margin-top:5px;font-size:11px;">${a.tarih ? a.tarih.toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'}) : ''}</div>
      </div>
    </div>`;
  }).join('');
}

function searchAileler(q) {
  const s = q.trim().toLowerCase();
  if (!s) { renderAileler(); return; }
  renderAileler(uzmanAileler.filter(a =>
    a.bebekAd.toLowerCase().includes(s) ||
    a.anneAd.toLowerCase().includes(s)
  ));
}

// ============================================================
// UZMAN — DETAY GÖRÜNÜM
// ============================================================
function uzmanShowDetail(id) {
  const a = uzmanAileler.find(x => x.id === id);
  if (!a) return;
  hide('uzman-list-section');
  show('uzman-detail');
  el('uzman-detail').classList.add('visible');

  const dogumStr = a.dogumTarihi ? (() => {
    const dt = new Date(a.dogumTarihi);
    return dt.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
  })() : '—';

  let html = `
  <div class="form-card" style="margin-bottom:14px;">
    <h3 style="border-bottom:none;padding-bottom:0;margin-bottom:14px;">👶 ${a.bebekAd}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
      <div><span style="color:var(--text-soft);font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px;">Anne Adı Soyadı</span><strong>${a.anneAd}</strong></div>
      <div><span style="color:var(--text-soft);font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px;">Doğum Tarihi</span><strong>${dogumStr}</strong></div>
      <div><span style="color:var(--text-soft);font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px;">E-posta</span><strong>${a.email||'—'}</strong></div>
      <div><span style="color:var(--text-soft);font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px;">Kayıt</span><strong>${a.tarih ? a.tarih.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}) : '—'}</strong></div>
    </div>
  </div>`;

  if (!a.gunlukler || a.gunlukler.length === 0) {
    html += `<div style="background:rgba(196,147,106,0.08);border:1px solid rgba(196,147,106,0.2);border-radius:12px;padding:18px;text-align:center;color:var(--text-soft);font-size:13px;">📓 Henüz günlük girilmemiş.</div>`;
  } else {
    html += uzmanGunlukHTML(a.gunlukler);
  }

  el('uzman-detail-content').innerHTML = html;

  // Gün tab etkileşimini başlat
  const ilkTab = el('uzman-detail-content').querySelector('.gunluk-day-tab');
  if (ilkTab) ilkTab.click();
}

function uzmanGunlukHTML(gunlukler) {
  function saatDk(s) {
    if (!s) return null;
    const p = s.trim().split(/[:.]/).map(Number);
    return isNaN(p[0]) ? null : p[0]*60+(p[1]||0);
  }
  function dkStr(dk) {
    if (dk==null||dk<=0) return null;
    const h=Math.floor(dk/60), m=dk%60;
    return h>0 ? (h+' sa '+(m>0?m+' dk':'')).trim() : m+' dk';
  }
  function uyanikBalon(sure) {
    return '<li style="list-style:none;padding:4px 12px;">'
      +'<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(196,147,106,0.1);'
      +'border:1px dashed #C4936A;border-radius:20px;padding:5px 14px;font-size:11.5px;color:#9B6B3A;">'
      +'⏱️ <strong>'+sure+'</strong> uyanık</div></li>';
  }

  const tabs = gunlukler.map((g,i) =>
    `<button class="gunluk-day-tab" onclick="uzmanSwitchDay(${i},this)">${g.gun}. Gün</button>`
  ).join('');

  const panels = gunlukler.map((g,i) => {
    let html = '<div class="gunluk-day-panel" id="uzman-day-'+i+'">';

    // Sabah
    if (g.sabah) {
      html += '<div class="gunluk-block" style="background:rgba(107,158,120,0.06);border-left:3px solid #8B9E88;">'
        +'<span style="font-size:13px;color:#4A7A56;font-weight:600;">🌅 Sabah uyanma: '+g.sabah+'</span></div>';
    }

    // Sabah → 1. gündüz arası
    const sabahDk2 = saatDk(g.sabah);
    const sabahGeceMi = sabahDk2!=null && sabahDk2 < 6*60+30;
    const ilkGunduz = (g.gunduz||[])[0];
    if (sabahDk2!=null && !sabahGeceMi && ilkGunduz?.bas) {
      const ilkBas = saatDk(ilkGunduz.bas);
      if (ilkBas!=null) {
        let fark=ilkBas-sabahDk2; if(fark<0) fark+=1440;
        if (fark>0&&fark<600) html += '<ul>'+uyanikBalon(dkStr(fark))+'</ul>';
      }
    }

    // Gündüz uykuları
    if ((g.gunduz||[]).length > 0) {
      html += '<div class="gunluk-block"><h4>☀️ Gündüz Uykuları</h4><ul class="gunluk-timeline">';
      (g.gunduz||[]).forEach((u, idx) => {
        html += '<li class="gtl-item uyku">'
          +'<span class="gtl-saat">'+(idx+1)+'. uyku '+(u.bas||'?')+'→'+(u.bit||'?')+'</span>'
          +'<span class="gtl-etiket">'+(idx+1)+'. gündüz uykusu</span>'
          +'<span class="gtl-sure">'+(u.sure||'')+'</span></li>';
        if (u.not) html += '<li style="padding:0 12px 8px;list-style:none;"><div class="gtl-not">'+u.not+'</div></li>';

        const bitDk  = saatDk(u.bit);
        if (bitDk!=null) {
          const sonraki = (g.gunduz||[])[idx+1];
          const yatisDk = g.gece?.yatis ? saatDk(g.gece.yatis) : null;
          if (sonraki?.bas) {
            const nextBas = saatDk(sonraki.bas);
            if (nextBas!=null) { let fark=nextBas-bitDk; if(fark<0) fark+=1440; if(fark>0&&fark<600) html+='</ul>'+uyanikBalon(dkStr(fark))+'<ul class="gunluk-timeline">'; }
          } else if (yatisDk!=null) {
            let geceBas=yatisDk; if(geceBas<bitDk) geceBas+=1440;
            const fark=geceBas-bitDk;
            if (fark>0&&fark<600) html+='</ul><div>'+uyanikBalon(dkStr(fark)+' (son gündüz → gece)')+'</div><ul class="gunluk-timeline">';
          }
        }
      });
      html += '</ul></div>';
    }

    // Gece uykusu
    html += '<div class="gunluk-block"><h4>🌙 Gece Uykusu</h4><ul class="gunluk-timeline">';
    if (g.gece?.yatis) {
      html += '<li class="gtl-item uyku">'
        +'<span class="gtl-saat">'+g.gece.yatis+'→'+(g.gece.kalkis||'?')+'</span>'
        +'<span class="gtl-etiket">Gece uykusu</span>'
        +'<span class="gtl-sure">'+(g.gece.sure||'')+'</span></li>';
    }
    if (g.uyanmalar?.length > 0) {
      g.uyanmalar.forEach((u,ui) => {
        html += '<li class="gtl-item uyanik">'
          +'<span class="gtl-saat">'+(u.saat||'?')+'</span>'
          +'<span class="gtl-etiket">⬆️ '+(ui+1)+'. uyanma'+(u.sure?' ('+u.sure+')':'')+'</span></li>';
        if (u.not) html += '<li style="padding:0 12px 8px;list-style:none;"><div class="gtl-not">'+u.not+'</div></li>';
      });
    } else {
      html += '<li style="padding:8px 12px;list-style:none;font-size:12.5px;color:#9B8878;">Gece ara uyanma kaydedilmemiş</li>';
    }
    html += '</ul></div>';

    if (g.genelNot) {
      html += '<div class="gunluk-block"><h4>📝 Genel Notlar</h4>'
        +'<p style="font-size:13px;color:var(--text-main);line-height:1.6;">'+g.genelNot+'</p></div>';
    }

    html += '</div>';
    return html;
  }).join('');

  return '<div class="form-card" style="margin-top:14px;">'
    +'<h3>📓 Günlükler</h3>'
    +'<div class="gunluk-day-tabs">'+tabs+'</div>'
    + panels
    +'</div>';
}

function uzmanSwitchDay(idx, btn) {
  document.querySelectorAll('#uzman-detail-content .gunluk-day-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#uzman-detail-content .gunluk-day-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  el('uzman-day-'+idx)?.classList.add('active');
}

function uzmanBackToList() {
  hide('uzman-detail');
  el('uzman-detail').classList.remove('visible');
  show('uzman-list-section');
}

// ============================================================
// BAŞLANGIÇ
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  for (let d = 0; d < 4; d++) addGunduzUyku(d);

  if (sessionStorage.getItem('uzmanGiris') === 'true') {
    showScreen('dashboard');
    uzmanLoadAileler();
    return;
  }
});

// ============================================================
// GLOBAL EXPORT (HTML onclick için)
// ============================================================
window.showAuthModal   = showAuthModal;
window.closeAuthModal  = closeAuthModal;
window.authTab         = authTab;
window.showUzmanLogin  = showUzmanLogin;
window.closeUzmanLogin = closeUzmanLogin;
window.uzmanGiris      = uzmanGiris;
window.uzmanCikis      = uzmanCikis;
window.aileCikis       = aileCikis;
window.switchGunluk    = switchGunluk;
window.addGunduzUyku   = addGunduzUyku;
window.removeGunduzUyku = removeGunduzUyku;
window.calcGunduz      = calcGunduz;
window.calcGece        = calcGece;
window.calcUyanikSureler = calcUyanikSureler;
window.addUyanma       = addUyanma;
window.formatSaatInput = formatSaatInput;
window.saatInput       = saatInput;
window.gunlukKaydet    = gunlukKaydet;
window.raporGonder     = raporGonder;
window.uzmanLoadAileler = uzmanLoadAileler;
window.uzmanShowDetail = uzmanShowDetail;
window.uzmanSwitchDay  = uzmanSwitchDay;
window.uzmanBackToList = uzmanBackToList;
window.searchAileler   = searchAileler;
window.el              = el;
