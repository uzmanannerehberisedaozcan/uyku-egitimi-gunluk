// ============================================================
// FIREBASE
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs,
  doc, updateDoc, serverTimestamp, query, where, getDoc, setDoc
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

const ADMIN_EMAIL = 'sedaozcan@uzmanannerehberi.com';
const WA_NUMBER   = '905074402953';

let activeProfilId = null;
let aileBilgi      = null;
let gunlukCache    = {};
let aktifTarih     = null;
let uzmanAileler   = [];
let gunduzCounter  = 0;
let uyanmaCounter  = 0;

// ============================================================
// YARDIMCILAR
// ============================================================
function el(id) { return document.getElementById(id); }
function show(id, d='block') { const e=el(id); if(e) e.style.display=d; }
function hide(id) { const e=el(id); if(e) e.style.display='none'; }

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el('screen-'+name)?.classList.add('active');
  window.scrollTo(0,0);
}

function showToast(msg, dur=2800) {
  const t=el('toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}


function bebekYasi(dogumTarihi) {
  if (!dogumTarihi) return '';
  const dogum = new Date(dogumTarihi + 'T00:00:00');
  const bugun = new Date();
  let ayFark = (bugun.getFullYear() - dogum.getFullYear()) * 12 + (bugun.getMonth() - dogum.getMonth());
  let gunFark = bugun.getDate() - dogum.getDate();
  if (gunFark < 0) { ayFark--; const gecenAy = new Date(bugun.getFullYear(), bugun.getMonth(), 0); gunFark += gecenAy.getDate(); }
  if (ayFark < 0) return '';
  if (ayFark === 0) return gunFark + ' günlük';
  if (gunFark === 0) return ayFark + ' aylık';
  return ayFark + ' ay ' + gunFark + ' günlük';
}
function tarihTR(ds) {
  if (!ds) return '';
  const dt = new Date(ds+'T00:00:00');
  return dt.toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function tarihKisa(ds) {
  if (!ds) return '';
  const dt = new Date(ds+'T00:00:00');
  return dt.toLocaleDateString('tr-TR',{day:'numeric',month:'long'});
}

function bugunStr() {
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// ============================================================
// AUTH MODAL
// ============================================================
function showAuthModal(tab='giris') { el('auth-modal')?.classList.add('open'); authTab(tab); }
function closeAuthModal() { el('auth-modal')?.classList.remove('open'); }
function authTab(mod) {
  el('tab-giris').classList.toggle('active', mod==='giris');
  el('tab-kayit').classList.toggle('active', mod==='kayit');
  el('giris-alanlari').style.display = mod==='giris'?'block':'none';
  el('kayit-alanlari').style.display = mod==='kayit'?'block':'none';
  hide('login-hata'); hide('reg-hata');
}

el('btn-giris')?.addEventListener('click', async () => {
  const email=el('login-email').value.trim(), sifre=el('login-sifre').value;
  hide('login-hata');
  if (!email||!sifre) { show('login-hata'); el('login-hata').textContent='E-posta ve şifre girin.'; return; }
  const btn=el('btn-giris'); btn.textContent='⏳...'; btn.disabled=true;
  try {
    await signInWithEmailAndPassword(auth,email,sifre);
    closeAuthModal();
  } catch(err) {
    show('login-hata');
    el('login-hata').textContent=err.code==='auth/invalid-credential'?'E-posta veya şifre hatalı.':'Giriş hatası.';
  } finally { btn.textContent='Giriş Yap →'; btn.disabled=false; }
});

el('btn-kayit')?.addEventListener('click', async () => {
  const anneAd=el('reg-anne-ad').value.trim(), bebekAd=el('reg-bebek-ad').value.trim();
  const dogumT=el('reg-dogum-tarihi').value, email=el('reg-email').value.trim();
  const sifre=el('reg-sifre').value, sifre2=el('reg-sifre2').value;
  hide('reg-hata');
  if (!anneAd||!bebekAd||!dogumT||!email||!sifre) { show('reg-hata'); el('reg-hata').textContent='Tüm alanları doldurun.'; return; }
  if (sifre.length<6) { show('reg-hata'); el('reg-hata').textContent='Şifre en az 6 karakter.'; return; }
  if (sifre!==sifre2) { show('reg-hata'); el('reg-hata').textContent='Şifreler eşleşmiyor.'; return; }
  const btn=el('btn-kayit'); btn.textContent='⏳...'; btn.disabled=true;
  try {
    const cred=await createUserWithEmailAndPassword(auth,email,sifre);
    const ref=await addDoc(collection(db,'egitim_profilleri'),{
      tarih:serverTimestamp(), uid:cred.user.uid, email,
      anne_ad:anneAd, bebek_ad:bebekAd, dogum_tarihi:dogumT,
    });
    activeProfilId=ref.id;
    aileBilgi={anneAd,bebekAd,dogumTarihi:dogumT,email};
    gunlukCache={};
    closeAuthModal();
    portalYukle();
  } catch(err) {
    show('reg-hata');
    el('reg-hata').textContent=err.code==='auth/email-already-in-use'?'Bu e-posta kayıtlı, giriş yapın.':'Kayıt hatası: '+err.message;
    if (err.code==='auth/email-already-in-use') authTab('giris');
  } finally { btn.textContent='Kayıt Ol →'; btn.disabled=false; }
});

// ============================================================
// UZMAN GİRİŞ
// ============================================================
function showUzmanLogin() { el('uzman-login-modal')?.classList.add('open'); el('uzman-email').value=''; el('uzman-sifre').value=''; hide('uzman-hata'); }
function closeUzmanLogin() { el('uzman-login-modal')?.classList.remove('open'); }

async function uzmanGiris() {
  const email=el('uzman-email').value.trim(), sifre=el('uzman-sifre').value;
  hide('uzman-hata');
  if (email!==ADMIN_EMAIL) { show('uzman-hata'); el('uzman-hata').textContent='Bu hesap yetkili değil.'; return; }
  const btn=document.querySelector('#uzman-login-modal .btn-primary');
  if (btn) { btn.textContent='⏳...'; btn.disabled=true; }
  try {
    await signInWithEmailAndPassword(auth,email,sifre);
    sessionStorage.setItem('uzmanGiris','true');
    closeUzmanLogin(); showScreen('dashboard'); uzmanLoadAileler();
  } catch(err) {
    show('uzman-hata');
    el('uzman-hata').textContent=err.code==='auth/invalid-credential'?'Şifre hatalı.':'Giriş hatası.';
  } finally { if(btn){btn.textContent='Giriş →';btn.disabled=false;} }
}

async function uzmanCikis() { sessionStorage.removeItem('uzmanGiris'); await signOut(auth); showScreen('landing'); }

// ============================================================
// AUTH STATE
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  if (user.email===ADMIN_EMAIL) {
    if (sessionStorage.getItem('uzmanGiris')==='true' && !el('screen-dashboard')?.classList.contains('active')) {
      showScreen('dashboard'); uzmanLoadAileler();
    }
    return;
  }
  try {
    const q=query(collection(db,'egitim_profilleri'),where('uid','==',user.uid));
    const snap=await getDocs(q);
    if (snap.empty) { await signOut(auth); return; }
    const docSnap=snap.docs[0];
    activeProfilId=docSnap.id;
    const data=docSnap.data();
    aileBilgi={anneAd:data.anne_ad||'',bebekAd:data.bebek_ad||'',dogumTarihi:data.dogum_tarihi||'',email:data.email||''};
    if (!el('screen-portal')?.classList.contains('active')) {
      await gunluklerYukle();
      portalYukle();
    }
  } catch(e) { console.error('Auth restore:',e); }
});

function aileCikis() {
  signOut(auth).then(()=>{
    activeProfilId=null; aileBilgi=null; gunlukCache={}; aktifTarih=null;
    showScreen('landing');
  });
}

// ============================================================
// GÜNLÜK VERİTABANI
// ============================================================
async function gunluklerYukle() {
  if (!activeProfilId) return;
  try {
    const snap=await getDocs(collection(db,'egitim_profilleri',activeProfilId,'gunlukler'));
    gunlukCache={};
    snap.forEach(d=>{ gunlukCache[d.id]=d.data(); });
  } catch(e) { console.error('Günlük yükleme:',e); }
}

async function gunlukFirebaseKaydet(tarih, veri) {
  if (!activeProfilId) return;
  await setDoc(doc(db,'egitim_profilleri',activeProfilId,'gunlukler',tarih),{
    ...veri, tarih, guncelleme:serverTimestamp(),
  });
  gunlukCache[tarih]=veri;
}

// ============================================================
// PORTAL
// ============================================================
function portalYukle() {
  showScreen('portal');
  if (aileBilgi) {
    show('bebek-bilgi-banner','flex');
    el('banner-bebek-ad').textContent=aileBilgi.bebekAd;
    el('banner-anne-ad').textContent=aileBilgi.anneAd;
    if (aileBilgi.dogumTarihi) {
      const dt=new Date(aileBilgi.dogumTarihi+'T00:00:00');
      el('banner-dogum').textContent='Doğum: '+dt.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
    }
  }
  renderGecmisList();
  gunlukAc(bugunStr());
}

// ============================================================
// GEÇMİŞ LİSTESİ
// ============================================================
function renderGecmisList() {
  const listEl=el('gecmis-list'); if(!listEl) return;
  const tarihler=Object.keys(gunlukCache).sort((a,b)=>b.localeCompare(a));
  if (tarihler.length===0) {
    listEl.innerHTML='<div style="padding:14px;text-align:center;font-size:12.5px;color:var(--text-soft);">Henüz günlük yok.</div>';
    return;
  }
  listEl.innerHTML=tarihler.map(t=>{
    const g=gunlukCache[t];
    const geceSure=g?.gece?.sure||'';
    const gunduzSayi=(g?.gunduz||[]).length;
    const aktifCls=t===aktifTarih?'gecmis-item aktif':'gecmis-item';
    return `<div class="${aktifCls}" onclick="gunlukAc('${t}')">
      <div class="gecmis-tarih">${tarihTR(t)}</div>
      <div class="gecmis-ozet">${gunduzSayi>0?'☀️ '+gunduzSayi+' gündüz':''} ${geceSure?'🌙 '+geceSure:''}</div>
    </div>`;
  }).join('');
}

// ============================================================
// GÜNLÜK AÇ
// ============================================================
function gunlukAc(tarih) {
  aktifTarih=tarih;
  el('aktif-tarih-input').value=tarih;
  el('aktif-tarih-label').textContent=tarihTR(tarih);
  formSifirla();
  if (gunlukCache[tarih]) formYukle(gunlukCache[tarih]);
  renderGecmisList();
  show('gunluk-editor');
}

function tarihDegistir() {
  const t=el('aktif-tarih-input').value;
  if (t) gunlukAc(t);
}

// ============================================================
// FORM
// ============================================================
function formSifirla() {
  const gl=el('gunduz-list'); if(gl) gl.innerHTML='';
  const ul=el('uyanma-list'); if(ul) ul.innerHTML='';
  gunduzCounter=0; uyanmaCounter=0;
  ['sabah','yatis','kalkis','gece-sure'].forEach(id=>{ const i=el(id); if(i) i.value=''; });
  const gn=el('genel-not'); if(gn) gn.value='';
  addGunduzUyku();
}

function formYukle(g) {
  if (!g) return;
  if (el('sabah')&&g.sabah) el('sabah').value=g.sabah;
  if (el('yatis')&&g.gece?.yatis) el('yatis').value=g.gece.yatis;
  if (el('kalkis')&&g.gece?.kalkis) el('kalkis').value=g.gece.kalkis;
  if (el('genel-not')&&g.genelNot) el('genel-not').value=g.genelNot;
  calcGece();
  const gl=el('gunduz-list');
  if (gl&&g.gunduz&&g.gunduz.length>0) {
    gl.innerHTML=''; gunduzCounter=0;
    g.gunduz.forEach((gu,i)=>{
      addGunduzUyku();
      const rid='gd-'+i;
      if(el(rid+'-bas'))  el(rid+'-bas').value=gu.bas||'';
      if(el(rid+'-bit'))  el(rid+'-bit').value=gu.bit||'';
      if(el(rid+'-sure')) el(rid+'-sure').value=gu.sure||'';
      if(el(rid+'-not'))  el(rid+'-not').value=gu.not||'';
    });
  }
  const ul=el('uyanma-list');
  if (ul&&g.uyanmalar&&g.uyanmalar.length>0) {
    ul.innerHTML=''; uyanmaCounter=0;
    g.uyanmalar.forEach((u,i)=>{
      addUyanma();
      const rid='uy-'+i;
      if(el(rid+'-saat')) el(rid+'-saat').value=u.saat||'';
      if(el(rid+'-sure')) el(rid+'-sure').value=u.sure||'';
      if(el(rid+'-not'))  el(rid+'-not').value=u.not||'';
    });
  }
  calcUyanikSureler();
}

// ============================================================
// VERİ TOPLA
// ============================================================
function gunlukTopla() {
  const rows=[...document.querySelectorAll('#gunduz-list .gunduz-uyku-row')];
  const gunduz=rows.map(r=>({
    bas:el(r.id+'-bas')?.value||'', bit:el(r.id+'-bit')?.value||'',
    sure:el(r.id+'-sure')?.value||'', not:el(r.id+'-not')?.value?.trim()||'',
  })).filter(u=>u.bas||u.bit);
  const uyanmaList=el('uyanma-list');
  const uyanmalar=uyanmaList?[...uyanmaList.children].map(r=>({
    saat:el(r.id+'-saat')?.value||'', sure:el(r.id+'-sure')?.value?.trim()||'',
    not:el(r.id+'-not')?.value?.trim()||'',
  })).filter(u=>u.saat||u.not):[];
  return {
    sabah:el('sabah')?.value||'',
    gunduz,
    gece:{yatis:el('yatis')?.value||'',kalkis:el('kalkis')?.value||'',sure:el('gece-sure')?.value||''},
    uyanmalar,
    genelNot:el('genel-not')?.value?.trim()||'',
  };
}

// ============================================================
// KAYDET
// ============================================================
async function gunlukKaydet() {
  if (!activeProfilId) { showToast('❌ Giriş yapın.'); return; }
  if (!aktifTarih) { showToast('❌ Tarih seçin.'); return; }
  const btn=el('btn-kaydet');
  if (btn) { btn.textContent='⏳ Kaydediliyor...'; btn.disabled=true; }
  try {
    await gunlukFirebaseKaydet(aktifTarih, gunlukTopla());
    renderGecmisList();
    const s=el('save-status');
    if(s){s.classList.add('show');setTimeout(()=>s.classList.remove('show'),3000);}
    showToast('✓ Kaydedildi!');
  } catch(e) {
    showToast('❌ Hata: '+e.message);
  } finally {
    if(btn){btn.textContent='💾 Kaydet';btn.disabled=false;}
  }
}

// ============================================================
// RAPOR MODAL
// ============================================================
function raporModalAc() {
  const tarihler=Object.keys(gunlukCache).sort();
  if (tarihler.length===0) { showToast('❌ Önce günlük kaydedin.'); return; }
  el('rapor-gun-list').innerHTML=tarihler.map((t,i)=>`
    <label class="rapor-gun-item">
      <input type="checkbox" value="${t}" ${i<7?'checked':''}>
      <span>${tarihTR(t)}</span>
    </label>`).join('');
  el('rapor-modal')?.classList.add('open');
}
function raporModalKapat() { el('rapor-modal')?.classList.remove('open'); }

async function raporGonder() {
  const secili=[...document.querySelectorAll('#rapor-gun-list input:checked')].map(c=>c.value);
  if (secili.length===0) { showToast('❌ En az bir gün seçin.'); return; }
  if (aktifTarih&&activeProfilId) {
    try { await gunlukFirebaseKaydet(aktifTarih,gunlukTopla()); } catch(e){}
  }
  let msg='🌙 *UZMAN ANNE REHBERİ — UYKU EĞİTİMİ GÜNLÜĞÜ*\n\n';
  if (aileBilgi) {
    msg+=`👶 *Bebek:* ${aileBilgi.bebekAd}\n👩 *Anne:* ${aileBilgi.anneAd}\n`;
    if (aileBilgi.dogumTarihi) {
      const dt=new Date(aileBilgi.dogumTarihi+'T00:00:00');
      msg+=`📅 *Doğum:* ${dt.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'})}\n`;
    }
    msg+=`📧 ${aileBilgi.email}\n\n`;
  }
  msg+='─────────────────────────\n\n';
  secili.sort().forEach((tarih,idx)=>{
    const g=gunlukCache[tarih]||{};
    msg+=`📓 *${tarihTR(tarih)}*\n`;
    if (g.sabah) msg+=`🌅 Sabah: ${g.sabah}\n`;
    if ((g.gunduz||[]).length>0) {
      msg+=`\n☀️ *Gündüz Uykuları:*\n`;
      g.gunduz.forEach((u,i)=>{
        msg+=`  ${i+1}. uyku: ${u.bas||'?'} → ${u.bit||'?'}${u.sure?' ('+u.sure+')':''}\n`;
        if(u.not) msg+=`  📝 ${u.not}\n`;
      });
    }
    msg+=`\n🌙 *Gece:*\n`;
    if (g.gece?.yatis) msg+=`  ${g.gece.yatis} → ${g.gece.kalkis||'?'}${g.gece.sure?' ('+g.gece.sure+')':''}\n`;
    else msg+=`  Girilmedi\n`;
    if ((g.uyanmalar||[]).length>0) {
      msg+=`\n⬆️ *Uyanmalar:*\n`;
      g.uyanmalar.forEach((u,i)=>{
        msg+=`  ${i+1}. ${u.saat||'?'}${u.sure?' — '+u.sure:''}\n`;
        if(u.not) msg+=`  📝 ${u.not}\n`;
      });
    }
    if (g.genelNot) msg+=`\n📝 ${g.genelNot}\n`;
    msg+='\n─────────────────────────\n\n';
  });
  const waUrl='https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent(msg);
  const a=document.createElement('a'); a.href=waUrl; a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  raporModalKapat();
}

// ============================================================
// SAAT (gece düzeltme sorusu KALDIRILDI)
// ============================================================
function parseSaat(v) {
  if (!v) return [NaN,NaN];
  const p=v.trim().split(/[:.]/).map(Number);
  return [isNaN(p[0])?NaN:p[0], isNaN(p[1])?0:p[1]];
}

function formatSaatInput(inp, blur) {
  if (!blur) return;
  let v=inp.value.replace(/[^0-9:]/g,'');
  if (!v.includes(':')) {
    const d=v.replace(/[^0-9]/g,'');
    if(d.length===3)     v='0'+d[0]+':'+d.slice(1,3);
    else if(d.length>=4) v=d.slice(0,2)+':'+d.slice(2,4);
    else if(d.length===2) v=d+':00';
    else if(d.length===1) v='0'+d+':00';
  }
  if (v.includes(':')) {
    let [h,m]=v.split(':').map(Number);
    if(isNaN(h))h=0; if(isNaN(m))m=0;
    if(h>23)h=23; if(m>59)m=59;
    v=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    // ✅ Gece saati düzeltme sorusu KALDIRILDI
  }
  inp.value=v;
}

function saatInput(id, fn) {
  return '<input type="text" id="'+id+'" placeholder="08:30" inputmode="numeric"'
    +' oninput="formatSaatInput(this);'+(fn||'')+'"'
    +' onblur="formatSaatInput(this,true);'+(fn||'')+'">';
}

function calcGece() {
  const [yh,yd]=parseSaat(el('yatis')?.value);
  const [kh,kd]=parseSaat(el('kalkis')?.value);
  const out=el('gece-sure'); if(!out) return;
  if(isNaN(yh)||isNaN(kh)){out.value='';return;}
  let t=(kh*60+kd)-(yh*60+yd); if(t<0)t+=1440;
  out.value=Math.floor(t/60)+' saat'+(t%60>0?' '+t%60+' dk':'');
  calcUyanikSureler();
}

function calcUyanikSureler() {
  function sDk(s){if(!s)return null;const p=s.trim().split(/[:.]/).map(Number);return isNaN(p[0])?null:p[0]*60+(p[1]||0);}
  function dStr(d){if(!d||d<=0)return null;const h=Math.floor(d/60),m=d%60;return h>0?(h+'s '+(m>0?m+'dk':'')).trim():m+'dk';}
  function balon(s,et){return '<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(196,147,106,0.1);border:1px dashed #C4936A;border-radius:20px;padding:5px 14px;font-size:11.5px;color:#9B6B3A;margin:4px 0;">⏱️ <strong>'+s+'</strong> uyanık'+(et?' <span style="opacity:.7">('+et+')</span>':'')+'</div>';}
  const sabahDk=sDk(el('sabah')?.value);
  const rows=[...document.querySelectorAll('#gunduz-list .gunduz-uyku-row')];
  const sb=el('sabah-uyanik');
  if(sb){
    if(sabahDk!=null&&rows.length>0){
      const ib=sDk(el(rows[0].id+'-bas')?.value);
      if(ib!=null){let f=ib-sabahDk;if(f<0)f+=1440;const s=dStr(f);if(s&&f<600){sb.style.display='block';sb.innerHTML=balon(s,'sabahtan 1. uykuya');}else sb.style.display='none';}
      else sb.style.display='none';
    }else sb.style.display='none';
  }
  rows.forEach((row,idx)=>{
    const rid=row.id;
    let ie=el(rid+'-inter');
    if(!ie){ie=document.createElement('div');ie.id=rid+'-inter';ie.style.cssText='margin:4px 0 8px 0;';row.parentNode.insertBefore(ie,row.nextSibling);}
    if(idx<rows.length-1){
      const bd=sDk(el(rid+'-bit')?.value),nb=sDk(el(rows[idx+1].id+'-bas')?.value);
      if(bd!=null&&nb!=null){let f=nb-bd;if(f<0)f+=1440;ie.innerHTML=(f>0&&f<600)?balon(dStr(f)):'';}else ie.innerHTML='';
    }else{
      const bd=sDk(el(rid+'-bit')?.value),yd=sDk(el('yatis')?.value);
      if(bd!=null&&yd!=null){let gb=yd;if(gb<bd)gb+=1440;const f=gb-bd;ie.innerHTML=(f>0&&f<600)?balon(dStr(f),'son gündüz → gece yatışı'):'';}else ie.innerHTML='';
    }
  });
}

function addGunduzUyku() {
  const l=el('gunduz-list'); if(!l) return;
  const i=gunduzCounter++, rid='gd-'+i;
  const div=document.createElement('div');
  div.className='gunduz-uyku-row'; div.id=rid;
  div.innerHTML='<div class="form-group" style="grid-column:1/-1;padding-bottom:8px;border-bottom:1px solid #E2D5C8;margin-bottom:4px;"><label style="font-size:12px;color:#C4936A;font-weight:600;">'+(i+1)+'. Gündüz Uykusu</label></div>'
    +'<div class="form-group"><label>Başlangıç</label>'+saatInput(rid+'-bas',"calcGunduz('"+rid+"')")+'</div>'
    +'<div class="form-group"><label>Bitiş</label>'+saatInput(rid+'-bit',"calcGunduz('"+rid+"')")+'</div>'
    +'<div class="form-group"><label>Süre</label><input type="text" id="'+rid+'-sure" readonly placeholder="Otomatik" style="background:#F5F0EA;color:#7A5C48;"></div>'
    +'<button type="button" class="btn-remove-uyku" onclick="removeGunduzUyku(\''+rid+'\')">×</button>'
    +'<div class="form-group" style="grid-column:1/-1;"><label>Nasıl uyudu?</label><textarea id="'+rid+'-not" style="min-height:80px;" placeholder="Uykuya nasıl daldı, nasıl uyandı..."></textarea></div>';
  l.appendChild(div);
}

function calcGunduz(rid) {
  calcUyanikSureler();
  const b=el(rid+'-bas')?.value, e=el(rid+'-bit')?.value, o=el(rid+'-sure');
  if(!b||!e||!o) return;
  const p=s=>{const x=s.trim().split(/[:.]/);const h=+x[0],m=+(x[1]||0);return isNaN(h)?null:h*60+m;};
  const bv=p(b),ev=p(e); if(bv===null||ev===null) return;
  let d=ev-bv; if(d<0)d+=1440;
  o.value=Math.floor(d/60)>0?Math.floor(d/60)+'s '+d%60+'dk':d%60+'dk';
}

function removeGunduzUyku(rid) { el(rid)?.remove(); calcUyanikSureler(); }

function addUyanma() {
  const l=el('uyanma-list'); if(!l) return;
  const i=uyanmaCounter++, rid='uy-'+i;
  const div=document.createElement('div'); div.id=rid;
  div.style.cssText='background:rgba(196,147,106,0.06);border:1px solid #E2D5C8;border-radius:10px;padding:12px;margin-bottom:8px;';
  div.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;">'
    +'<div class="form-group" style="margin:0;"><label>Uyanma saati</label>'+saatInput(rid+'-saat')+'</div>'
    +'<div class="form-group" style="margin:0;"><label>Ne kadar sürdü?</label><input type="text" id="'+rid+'-sure" placeholder="örn: 20 dk"></div>'
    +'<button type="button" onclick="el(\''+rid+'\').remove()" style="background:none;border:1.5px solid #E2D5C8;border-radius:6px;padding:8px 10px;cursor:pointer;color:#C4936A;font-size:14px;align-self:end;">×</button>'
    +'</div><div class="form-group" style="margin:0;"><label>Ne yaptınız?</label>'
    +'<textarea id="'+rid+'-not" style="min-height:60px;" placeholder="Emzirdim, kucağımda uyuttum..."></textarea></div>';
  l.appendChild(div);
}

// ============================================================
// UZMAN PANELİ
// ============================================================
async function uzmanLoadAileler() {
  el('aile-list').innerHTML='<div style="padding:20px;text-align:center;color:var(--text-soft);">⏳ Yükleniyor...</div>';
  try {
    const snap=await getDocs(collection(db,'egitim_profilleri'));
    uzmanAileler=[];
    for (const ds of snap.docs) {
      const d=ds.data();
      const gs=await getDocs(collection(db,'egitim_profilleri',ds.id,'gunlukler'));
      const gunlukler={};
      gs.forEach(g=>{gunlukler[g.id]=g.data();});
      uzmanAileler.push({
        id:ds.id, anneAd:d.anne_ad||'İsimsiz', bebekAd:d.bebek_ad||'—',
        dogumTarihi:d.dogum_tarihi||'', email:d.email||'',
        gunlukler, tarih:d.tarih?.toDate?d.tarih.toDate():null,
      });
    }
    uzmanAileler.sort((a,b)=>(!a.tarih&&!b.tarih)?0:!a.tarih?1:!b.tarih?-1:b.tarih-a.tarih);
    renderAileler(); updateUzmanStats();
  } catch(e) { el('aile-list').innerHTML=`<div style="padding:20px;color:#C05050;">❌ ${e.message}</div>`; }
}

function updateUzmanStats() {
  el('stat-toplam').textContent=uzmanAileler.length;
  el('stat-aktif').textContent=uzmanAileler.filter(a=>Object.keys(a.gunlukler).length>0).length;
  if (uzmanAileler.length>0) {
    const s=uzmanAileler[0];
    el('stat-son').textContent=s.bebekAd;
    el('stat-son-sub').textContent=s.tarih?s.tarih.toLocaleDateString('tr-TR',{day:'numeric',month:'short'}):'Yeni';
  }
}

function renderAileler(liste) {
  const l=liste||uzmanAileler, le=el('aile-list'); if(!le) return;
  if(l.length===0){le.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-soft);">Henüz aile yok.</div>';return;}
  le.innerHTML=l.map(a=>{
    const gs=Object.keys(a.gunlukler).length;
    const ds=a.dogumTarihi?new Date(a.dogumTarihi+'T00:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):'—';
    return `<div class="aile-card" onclick="uzmanShowDetail('${a.id}')">
      <div class="aile-avatar">${a.bebekAd.charAt(0).toUpperCase()}</div>
      <div class="aile-info"><strong>${a.bebekAd}</strong><span>${a.anneAd}</span><span style="font-size:11px;color:#9B8878;">📅 ${ds}</span></div>
      <div class="aile-meta"><div class="gunluk-sayac">📓 ${gs} gün</div><div style="margin-top:5px;font-size:11px;">${a.tarih?a.tarih.toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'}):''}</div></div>
    </div>`;
  }).join('');
}

function searchAileler(q) {
  const s=q.trim().toLowerCase();
  if(!s){renderAileler();return;}
  renderAileler(uzmanAileler.filter(a=>a.bebekAd.toLowerCase().includes(s)||a.anneAd.toLowerCase().includes(s)));
}

function uzmanShowDetail(id) {
  const a=uzmanAileler.find(x=>x.id===id); if(!a) return;
  hide('uzman-list-section'); show('uzman-detail');
  el('uzman-detail').classList.add('visible');
  const ds=a.dogumTarihi?new Date(a.dogumTarihi+'T00:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):'—';
  let html=`<div class="form-card" style="margin-bottom:14px;">
    <h3 style="border-bottom:none;padding-bottom:0;margin-bottom:14px;">👶 ${a.bebekAd}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
      <div><span style="color:var(--text-soft);font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">Anne Adı Soyadı</span><strong>${a.anneAd}</strong></div>
      <div><span style="color:var(--text-soft);font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">Doğum Tarihi</span><strong>${ds}</strong><span style="font-size:11px;color:var(--dusty-rose);font-weight:600;margin-top:2px;display:block;">${bebekYasi(a.dogumTarihi)}</span></div>
      <div><span style="color:var(--text-soft);font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">E-posta</span><strong>${a.email||'—'}</strong></div>
      <div><span style="color:var(--text-soft);font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">Kayıt</span><strong>${a.tarih?a.tarih.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):'—'}</strong></div>
    </div></div>`;

  const tarihler=Object.keys(a.gunlukler).sort();
  if(tarihler.length===0){
    html+=`<div style="background:rgba(196,147,106,0.08);border:1px solid rgba(196,147,106,0.2);border-radius:12px;padding:18px;text-align:center;color:var(--text-soft);font-size:13px;">📓 Henüz günlük girilmemiş.</div>`;
  } else {
    const tabs=tarihler.map((t,i)=>`<button class="gunluk-day-tab ${i===0?'active':''}" onclick="uzmanSwitchDay('${t}',this)">${tarihKisa(t)}</button>`).join('');
    const panels=tarihler.map((t,i)=>`<div class="gunluk-day-panel ${i===0?'active':''}" id="uzman-day-${t.replace(/-/g,'')}">${uzmanGunPanel(a.gunlukler[t],t)}</div>`).join('');
    html+=`<div class="form-card" style="margin-top:14px;"><h3>📓 Günlükler</h3><div class="gunluk-day-tabs" style="flex-wrap:wrap;">${tabs}</div>${panels}</div>`;
  }
  el('uzman-detail-content').innerHTML=html;
}

function uzmanGunPanel(g,t) {
  if(!g) return '<p style="color:var(--text-soft);padding:12px 0;">Veri yok.</p>';
  function sDk(s){if(!s)return null;const p=s.trim().split(/[:.]/).map(Number);return isNaN(p[0])?null:p[0]*60+(p[1]||0);}
  function dStr(d){if(d==null||d<=0)return null;const h=Math.floor(d/60),m=d%60;return h>0?(h+' sa '+(m>0?m+' dk':'')).trim():m+' dk';}
  function balon(s){return '<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(196,147,106,0.1);border:1px dashed #C4936A;border-radius:20px;padding:5px 14px;font-size:11.5px;color:#9B6B3A;margin:6px 0;">⏱️ <strong>'+s+'</strong> uyanık</div>';}
  let h=`<div style="font-size:12px;color:var(--text-soft);margin-bottom:12px;font-weight:500;">${tarihTR(t)}</div>`;
  if(g.sabah) h+=`<div class="gunluk-block" style="background:rgba(107,158,120,0.06);border-left:3px solid #8B9E88;margin-bottom:10px;"><span style="font-size:13px;color:#4A7A56;font-weight:600;">🌅 Sabah uyanma: ${g.sabah}</span></div>`;
  const sd=sDk(g.sabah), ig=(g.gunduz||[])[0];
  if(sd!=null&&sd>=6*60&&ig?.bas){const ib=sDk(ig.bas);if(ib!=null){let f=ib-sd;if(f<0)f+=1440;if(f>0&&f<600)h+=balon(dStr(f));}}
  if((g.gunduz||[]).length>0){
    h+='<div class="gunluk-block"><h4>☀️ Gündüz Uykuları</h4><ul class="gunluk-timeline">';
    (g.gunduz||[]).forEach((u,i)=>{
      h+=`<li class="gtl-item uyku"><span class="gtl-saat">${i+1}. ${u.bas||'?'}→${u.bit||'?'}</span><span class="gtl-etiket">${i+1}. gündüz uykusu</span><span class="gtl-sure">${u.sure||''}</span></li>`;
      if(u.not) h+=`<li style="padding:0 12px 8px;list-style:none;"><div class="gtl-not">${u.not}</div></li>`;
      const bd=sDk(u.bit);
      if(bd!=null){
        const sn=(g.gunduz||[])[i+1];
        if(sn?.bas){const nb=sDk(sn.bas);if(nb!=null){let f=nb-bd;if(f<0)f+=1440;if(f>0&&f<600)h+='</ul>'+balon(dStr(f))+'<ul class="gunluk-timeline">';}}
        else if(g.gece?.yatis){const yd=sDk(g.gece.yatis);if(yd!=null){let gb=yd;if(gb<bd)gb+=1440;const f=gb-bd;if(f>0&&f<600)h+='</ul>'+balon(dStr(f)+' (→ gece)')+'<ul class="gunluk-timeline">';}}
      }
    });
    h+='</ul></div>';
  }
  h+='<div class="gunluk-block"><h4>🌙 Gece Uykusu</h4><ul class="gunluk-timeline">';
  if(g.gece?.yatis) h+=`<li class="gtl-item uyku"><span class="gtl-saat">${g.gece.yatis}→${g.gece.kalkis||'?'}</span><span class="gtl-etiket">Gece uykusu</span><span class="gtl-sure">${g.gece.sure||''}</span></li>`;
  if((g.uyanmalar||[]).length>0){
    g.uyanmalar.forEach((u,i)=>{
      h+=`<li class="gtl-item uyanik"><span class="gtl-saat">${u.saat||'?'}</span><span class="gtl-etiket">⬆️ ${i+1}. uyanma${u.sure?' ('+u.sure+')':''}</span></li>`;
      if(u.not) h+=`<li style="padding:0 12px 8px;list-style:none;"><div class="gtl-not">${u.not}</div></li>`;
    });
  } else { h+='<li style="padding:8px 12px;list-style:none;font-size:12.5px;color:#9B8878;">Gece uyanma kaydedilmemiş</li>'; }
  h+='</ul></div>';
  if(g.genelNot) h+=`<div class="gunluk-block"><h4>📝 Genel Notlar</h4><p style="font-size:13px;line-height:1.6;">${g.genelNot}</p></div>`;
  return h;
}

function uzmanSwitchDay(tarih, btn) {
  document.querySelectorAll('#uzman-detail-content .gunluk-day-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#uzman-detail-content .gunluk-day-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  el('uzman-day-'+tarih.replace(/-/g,''))?.classList.add('active');
}

function uzmanBackToList() {
  hide('uzman-detail'); el('uzman-detail').classList.remove('visible'); show('uzman-list-section');
}

// ============================================================
// BAŞLANGIÇ
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('uzmanGiris')==='true') {
    showScreen('dashboard'); uzmanLoadAileler();
  }
});

// GLOBAL
window.showAuthModal=showAuthModal; window.closeAuthModal=closeAuthModal; window.authTab=authTab;
window.showUzmanLogin=showUzmanLogin; window.closeUzmanLogin=closeUzmanLogin;
window.uzmanGiris=uzmanGiris; window.uzmanCikis=uzmanCikis; window.aileCikis=aileCikis;
window.gunlukAc=gunlukAc; window.tarihDegistir=tarihDegistir; window.gunlukKaydet=gunlukKaydet;
window.raporModalAc=raporModalAc; window.raporModalKapat=raporModalKapat; window.raporGonder=raporGonder;
window.addGunduzUyku=addGunduzUyku; window.removeGunduzUyku=removeGunduzUyku;
window.calcGunduz=calcGunduz; window.calcGece=calcGece; window.calcUyanikSureler=calcUyanikSureler;
window.addUyanma=addUyanma; window.formatSaatInput=formatSaatInput; window.saatInput=saatInput;
window.uzmanLoadAileler=uzmanLoadAileler; window.uzmanShowDetail=uzmanShowDetail;
window.uzmanSwitchDay=uzmanSwitchDay; window.uzmanBackToList=uzmanBackToList;
window.searchAileler=searchAileler; window.el=el;
