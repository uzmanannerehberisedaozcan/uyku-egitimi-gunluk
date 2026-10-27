// ============================================================
// FIREBASE
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs,
  doc, updateDoc, serverTimestamp, query, where, getDoc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, sendPasswordResetEmail
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
auth.languageCode = 'tr'; // şifre yenileme e-postası Türkçe gider

const ADMIN_EMAIL = 'sedaozcan@uzmanannerehberi.com';
const WA_NUMBER   = '905074402953';

let activeProfilId = null;
let aileBilgi      = null;
let gunlukCache    = {};
let aktifTarih     = null;
let uzmanAileler   = [];
let gunduzCounter  = 0;
let uyanmaCounter  = 0;
let ruyaCounter    = 0;
let aktifSekme     = 'bugun'; // 'bugun' | 'aktif' | 'mezun' | 'yarim'
let aileProfil     = null;    // ailenin kendi profil kaydı (paket, başlangıç, dondurma...)
let raporSecili    = [];      // rapora eklenen günler

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
  return tarihStr(new Date());
}
function tarihStr(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function tsDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  const d=new Date(v); return isNaN(d)?null:d;
}
function saatStr(d) {
  return d ? String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0') : '';
}

// ============================================================
// PAKET TAKİBİ
// ============================================================
// takipGunleri: 1=Pazartesi ... 5=Cuma. saatSiniri: günlüğün 08.00–11.00 arasında iletilmesi
const PAKETLER = {
  kapsamli: { ad:'Kapsamlı Değerlendirme', renk:'#C9A227', gorusme:2,    gun:28,   takipGunleri:[],          saatSiniri:true  },
  standart: { ad:'Standart',               renk:'#9B7EC8', gorusme:12,   gun:28,   takipGunleri:[1,3,5],     saatSiniri:true  },
  full:     { ad:'Full',                   renk:'#D04545', gorusme:20,   gun:28,   takipGunleri:[1,2,3,4,5], saatSiniri:true  },
  vip:      { ad:'VIP',                    renk:'#4CAF7D', gorusme:20,   gun:28,   takipGunleri:[1,2,3,4,5], saatSiniri:false },
  diger:    { ad:'Diğer',                  renk:'#9A9A9A', gorusme:null, gun:null, takipGunleri:[],          saatSiniri:true  },
};
const PAKET_SIRASI = ['kapsamli','standart','full','vip','diger'];
const SEKRETERLIK_WA = '905304105057';
const GEC_SAAT = 11; // 11.00'den sonra iletilen günlük "geç" sayılır
const UZUN_ARA_GUN = 5; // bu kadar gündür günlük girmeyen aile "Bugün" ekranında işaretlenir

// Portaldan gelen paket (?paket=standart): kayıtta seçili gelir, girişte paket sorulmaz
function portalPaketi() {
  try {
    const k=new URLSearchParams(location.search).get('paket');
    if (PAKETLER[k]) { sessionStorage.setItem('portalPaket',k); return k; }
    const s=sessionStorage.getItem('portalPaket'); return PAKETLER[s]?s:null;
  } catch(e) { return null; }
}

// Ek görüşme paketleri: süresi dolan ya da görüşmesi biten aileye, ödeme sonrası uzman ekler.
// Ek dönemde takip günü yoktur; aile görüşme istediği gün günlüğünü 08.00–11.00 arasında iletir.
const EK_PAKETLER = {
  5: { gorusme:5, gun:30, ad:'5 görüşme (1 ay)', fiyat:'7.500 TL + KDV' },
  1: { gorusme:1, gun:7,  ad:'1 görüşme (1 hafta)', fiyat:'1.800 TL + KDV' },
};
function ekBitis(e) { const d=new Date(e.bas+'T12:00:00'); d.setDate(d.getDate()+e.gun-1); return tarihStr(d); }
function aktifEk(p, bugun=bugunStr()) {
  return [...(p?.ekler||[])].reverse().find(e=>e.bas<=bugun && bugun<=ekBitis(e)) || null;
}

function etkinPaket(p) { const k=p?.paket||p?.paket_secim; return PAKETLER[k]?k:null; }
function paketTag(k, onayli=true) {
  const pk=PAKETLER[k]; if(!pk) return '<span class="paket-tag" style="background:#C9BBAE;">Paket yok</span>';
  return `<span class="paket-tag" style="background:${pk.renk};${onayli?'':'opacity:.65;'}" title="${onayli?'Onaylı paket':'Aile seçti, onay bekliyor'}">${pk.ad}${onayli?'':' ?'}</span>`;
}
function gorusmeHakki(p) {
  const k=etkinPaket(p); if(!k) return null;
  const ana = k==='diger' ? (Number(p.ozel_gorusme_hakki)||0) : PAKETLER[k].gorusme;
  const ek = (p.ekler||[]).reduce((t,e)=>t+(Number(e.gorusme)||0), 0);
  return (ana+ek) || null;
}
function sureGun(p) {
  const k=etkinPaket(p); if(!k) return null;
  if (k==='diger') return Number(p.ozel_gun_sayisi)||null;
  return PAKETLER[k].gun;
}
function kullanilanGorusme(gunlukler) {
  return Object.values(gunlukler||{}).filter(g=>g&&g.arandi).length;
}
function gunFarki(a, b) { // b - a, gün olarak (YYYY-MM-DD)
  return Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00'))/86400000);
}
function donmusMu(p) {
  const d=p?.donmalar||[]; return d.length>0 && !d[d.length-1].bit;
}
function donmaGunleri(p, bugun=bugunStr()) {
  return (p?.donmalar||[]).reduce((t,d)=>t+Math.max(0, gunFarki(d.bas, d.bit||bugun)), 0);
}
// Başlangıçtan bu yana geçen danışmanlık günü (başlangıç günü 1. gün; donmuş günler sayılmaz)
function gecenGun(p, bugun=bugunStr()) {
  if (!p?.baslangic_tarihi) return null;
  const f=gunFarki(p.baslangic_tarihi, bugun);
  if (f<0) return 0;
  return Math.max(1, f+1-donmaGunleri(p, bugun));
}
function bitisTarihi(p) {
  const s=sureGun(p); if(!p?.baslangic_tarihi||!s) return null;
  const d=new Date(p.baslangic_tarihi+'T12:00:00');
  d.setDate(d.getDate()+s-1+donmaGunleri(p));
  return tarihStr(d);
}
function sureDolduMu(p) {
  const s=sureGun(p), g=gecenGun(p);
  return !!s && g!=null && g>s && !donmusMu(p) && !aktifEk(p) && (p.durum||'aktif')==='aktif';
}
// Seda Hanım'ın çalışmadığı günler: her yıl 1–2 Ocak, Ramazan ve Kurban bayramları (arefeler çalışılıyor).
// Bayram tarihleri her yıl Diyanet takviminden eklenmeli.
const TATIL_GUNLERI = new Set([
  '2027-03-09','2027-03-10','2027-03-11',                // Ramazan Bayramı 2027
  '2027-05-16','2027-05-17','2027-05-18','2027-05-19',   // Kurban Bayramı 2027
]);
function tatilMi(tarih) { return TATIL_GUNLERI.has(tarih) || ['01-01','01-02'].includes(tarih.slice(5)); }
function takipGunuMu(k, tarih=bugunStr()) {
  const gun=new Date(tarih+'T12:00:00').getDay();
  return !!PAKETLER[k] && PAKETLER[k].takipGunleri.includes(gun) && !tatilMi(tarih);
}
function takipGunleriMetni(k) {
  if (k==='standart') return 'takip günlerinizde (<b>Pazartesi, Çarşamba ve Cuma</b>)';
  if (k==='full'||k==='vip') return 'takip günlerinizde (<b>hafta içi her gün</b>, Pazartesi–Cuma)';
  return 'danışmanınızın belirttiği takip günlerinde';
}
function raporZamanMetni(k, p=aileProfil) {
  if (p && aktifEk(p)) return 'görüşme istediğiniz gün <b>08.00–11.00 arasında</b>';
  const saat = PAKETLER[k]?.saatSiniri===false ? '' : ' <b>08.00–11.00 arasında</b>';
  return takipGunleriMetni(k)+saat;
}

// ============================================================
// AUTH MODAL
// ============================================================
// Şifremi unuttum: hesabın olup olmadığı söylenmez, her durumda aynı bilgi verilir
async function sifremiUnuttum() {
  const email=el('login-email')?.value.trim()||'';
  const hata=el('login-hata'), bilgi=el('login-bilgi');
  hide('login-hata'); hide('login-bilgi');
  if (!email) { show('login-hata'); hata.textContent='Önce e-posta adresinizi yazın, sonra "Şifremi unuttum"a dokunun.'; return; }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch(e) {
    if (e.code==='auth/invalid-email') { show('login-hata'); hata.textContent='E-posta adresi geçersiz görünüyor.'; return; }
    if (e.code==='auth/too-many-requests') { show('login-hata'); hata.textContent='Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.'; return; }
    if (e.code!=='auth/user-not-found') { show('login-hata'); hata.textContent='Gönderilemedi: '+e.message; return; }
  }
  show('login-bilgi'); bilgi.textContent='✓ Bu e-posta ile kayıtlı bir hesap varsa şifre yenileme bağlantısı gönderildi. Gelen kutunuzu ve gereksiz (spam) klasörünü kontrol edin. Bağlantıya dokunup yeni şifrenizi belirleyin.';
}

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
  const paketSecim=el('reg-paket')?.value||'';
  hide('reg-hata');
  if (!anneAd||!bebekAd||!dogumT||!email||!sifre) { show('reg-hata'); el('reg-hata').textContent='Tüm alanları doldurun.'; return; }
  if (!paketSecim) { show('reg-hata'); el('reg-hata').textContent='Lütfen danışmanlık paketinizi seçin.'; return; }
  if (sifre.length<6) { show('reg-hata'); el('reg-hata').textContent='Şifre en az 6 karakter.'; return; }
  if (sifre!==sifre2) { show('reg-hata'); el('reg-hata').textContent='Şifreler eşleşmiyor.'; return; }
  const btn=el('btn-kayit'); btn.textContent='⏳...'; btn.disabled=true;
  try {
    const cred=await createUserWithEmailAndPassword(auth,email,sifre);
    const profilVeri={
      tarih:serverTimestamp(), uid:cred.user.uid, email,
      anne_ad:anneAd, bebek_ad:bebekAd, dogum_tarihi:dogumT, paket_secim:paketSecim,
    };
    const ref=await addDoc(collection(db,'egitim_profilleri'),profilVeri);
    activeProfilId=ref.id;
    aileBilgi={anneAd,bebekAd,dogumTarihi:dogumT,email};
    aileProfil={...profilVeri, tarih:new Date()};
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

async function uzmanCikis() {
  sessionStorage.removeItem('uzmanGiris');
  showScreen('landing');
  await signOut(auth);
}

// ============================================================
// AUTH STATE
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Uzman veya aile çıkış yaptı, landing aktif değilse göster
    if (!el('screen-landing')?.classList.contains('active')) {
      showScreen('landing');
    }
    return;
  }
  if (user.email===ADMIN_EMAIL) {
    if (sessionStorage.getItem('uzmanGiris')==='true' && !el('screen-dashboard')?.classList.contains('active')) {
      showScreen('dashboard'); uzmanLoadAileler();
    }
    return;
  }
  // Portal zaten açıksa tekrar yükleme
  if (el('screen-portal')?.classList.contains('active')) return;
  try {
    const q=query(collection(db,'egitim_profilleri'),where('uid','==',user.uid));
    const snap=await getDocs(q);
    if (snap.empty) { await signOut(auth); return; }
    const docSnap=snap.docs[0];
    activeProfilId=docSnap.id;
    const data=docSnap.data();
    aileBilgi={anneAd:data.anne_ad||'',bebekAd:data.bebek_ad||'',dogumTarihi:data.dogum_tarihi||'',email:data.email||''};
    aileProfil=data;
    await gunluklerYukle();
    portalYukle();
  } catch(e) { console.error('Auth restore:',e); }
});

function aileCikis() {
  signOut(auth).then(()=>{
    activeProfilId=null; aileBilgi=null; aileProfil=null; gunlukCache={}; aktifTarih=null;
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
  // merge: uzmanın işaretleri (arandı vb.) ailenin kaydıyla silinmesin
  const ek = { tarih, guncelleme:serverTimestamp() };
  const ilkKayit = !gunlukCache[tarih]?.ilk_kayit;
  if (ilkKayit) ek.ilk_kayit = serverTimestamp();
  await setDoc(doc(db,'egitim_profilleri',activeProfilId,'gunlukler',tarih),{ ...veri, ...ek }, {merge:true});
  const simdi = new Date();
  gunlukCache[tarih]={ ...(gunlukCache[tarih]||{}), ...veri, tarih, guncelleme:simdi, ...(ilkKayit?{ilk_kayit:simdi}:{}) };
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
  aileUyarilariGoster();
  aileIlkGirisAdimlari();
}

// ============================================================
// AİLE: PAKET NOTLARI, PAKET SEÇİMİ, BİLGİLENDİRME
// ============================================================
// Son takip (görüşme) günü günlük gelmediyse o tarihi döndürür; yoksa null.
// Bugün takip günüyse ve saat 11.00 geçmediyse (VIP'te gün bitmediyse) bugün henüz kaçırılmış sayılmaz.
function kacanTakipGunu(p, gunlukler) {
  const k=etkinPaket(p);
  if (!k || !PAKETLER[k].takipGunleri.length || !p.baslangic_tarihi) return null;
  if (donmusMu(p) || aktifEk(p) || sureDolduMu(p) || (p.durum||'aktif')!=='aktif') return null;
  const bugun=bugunStr(), saatli=PAKETLER[k].saatSiniri!==false;
  const d=new Date(bugun+'T12:00:00');
  for (let i=0; i<8; i++, d.setDate(d.getDate()-1)) {
    const t=tarihStr(d);
    if (t<p.baslangic_tarihi) return null;
    if (!takipGunuMu(k,t)) continue;
    if (t===bugun && (!saatli || new Date().getHours()<GEC_SAAT)) continue;
    if ((p.donmalar||[]).some(x=>x.bas<=t && (!x.bit || t<x.bit))) return null;
    return gunlukler?.[t]?.guncelleme ? null : t;
  }
  return null;
}

function kacanUyariKapat(t) {
  try { localStorage.setItem('kacan-kapat-'+t,'1'); } catch(e) {}
  aileUyarilariGoster();
}

// Bebek kartında tek satırlık danışmanlık süresi bilgisi
function aileSureSatiri(p) {
  if (!p) return '';
  const ekA=aktifEk(p);
  if (ekA) return `➕ Ek görüşme dönemi · bitiş ${tarihKisa(ekBitis(ekA))}`;
  if (!p.baslangic_tarihi || (p.durum||'aktif')!=='aktif') return '';
  if (donmusMu(p)) return '⏸ Paketiniz dondurulmuş';
  const sure=sureGun(p), gg=gecenGun(p);
  if (gg==null) return '';
  if (gg===0) return `📅 Danışmanlık ${tarihKisa(p.baslangic_tarihi)}'de başlayacak`;
  if (!sure) return `📅 Danışmanlığın ${gg}. günü`;
  if (gg>sure) return '📅 Danışmanlık süreniz tamamlandı';
  const kalan=sure-gg;
  return `📅 Danışmanlığın ${gg}. günü · ${kalan?kalan+' gün kaldı':'son gün'} (bitiş ${tarihKisa(bitisTarihi(p))})`;
}

function aileUyarilariGoster() {
  const kutu=el('aile-uyari'); if(!kutu||!aileProfil) return;
  const bs=el('banner-sure'); if (bs) { const m=aileSureSatiri(aileProfil); bs.textContent=m; bs.style.display=m?'':'none'; }
  const k=etkinPaket(aileProfil);
  let html='';
  if (donmusMu(aileProfil)) {
    html+=`<div class="uyari uyari-mavi">⏸ Paketiniz şu an <b>dondurulmuştur</b>. Bu sürede danışmanlık süreniz işlemez.</div>`;
  }
  const hak=gorusmeHakki(aileProfil);
  const ekA=aktifEk(aileProfil);
  if (ekA && hak && hak-kullanilanGorusme(gunlukCache)>1) {
    html+=`<div class="uyari uyari-yesil">➕ Ek görüşme paketiniz tanımlı: <b>${hak-kullanilanGorusme(gunlukCache)} görüşme hakkınız</b> var, bitiş <b>${tarihKisa(ekBitis(ekA))}</b>. Görüşme istediğiniz gün günlüğünüzü <b>08.00–11.00 arasında</b> iletin.</div>`;
  }
  if (hak) {
    const kalan=hak-kullanilanGorusme(gunlukCache);
    if (kalan<=0) {
      const wa='https://wa.me/'+SEKRETERLIK_WA+'?text='+encodeURIComponent('Merhaba, '+(aileBilgi?.bebekAd||'')+' için danışmanlık paketimdeki görüşme sayısı bitti. Ek görüşme paketi hakkında bilgi almak istiyorum.');
      html+=`<div class="uyari uyari-kirmizi">Danışmanlık paketinizdeki görüşme sayısı bitmiştir. Lütfen sekreterlikle iletişime geçin.
        <a class="btn-wa" href="${wa}" target="_blank" rel="noopener">💬 Sekreterliğe WhatsApp ile yazın</a></div>`;
    } else if (kalan===1) {
      html+=`<div class="uyari uyari-sari">📞 Paketinizde <b>son 1 görüşme hakkınız</b> kaldı.</div>`;
    }
  }
  const kacan=kacanTakipGunu(aileProfil, gunlukCache);
  let kapali=false; try { kapali=!!localStorage.getItem('kacan-kapat-'+kacan); } catch(e) {}
  if (kacan && !kapali) {
    const gunAd=new Date(kacan+'T12:00:00').toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'});
    const wa='https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent('Merhaba, '+(aileBilgi?.bebekAd||'')+' için '+gunAd+' günü günlük gönderemedim, bilgi vermek istiyorum.');
    html+=`<div class="uyari uyari-sari" style="position:relative;padding-right:34px;">📅 Son görüşme gününüzde (<b>${gunAd}</b>) günlüğünüz bize ulaşmadı. Paketiniz dondurulmadıysa o günün danışmanlık sürenizden sayıldığını unutmayın. Paketinizi dondurmanız gerekiyorsa lütfen Seda Hanım'a bilgi verin.
      <a class="btn-wa" href="${wa}" target="_blank" rel="noopener">💬 Seda Hanım'a yazın</a>
      <button onclick="kacanUyariKapat('${kacan}')" aria-label="Kapat" style="position:absolute;top:6px;right:8px;background:none;border:none;font-size:18px;cursor:pointer;color:inherit;">×</button></div>`;
  }
  kutu.innerHTML=html;
}

async function aileIlkGirisAdimlari() {
  if (!aileProfil) return;
  if (!etkinPaket(aileProfil)) {
    const pp=portalPaketi();
    if (!pp) { paketModalAc(); return; }
    try {
      await updateDoc(doc(db,'egitim_profilleri',activeProfilId),{paket_secim:pp});
      aileProfil={...aileProfil, paket_secim:pp};
      aileUyarilariGoster();
    } catch(e) { paketModalAc(); return; }
  }
  if (!aileProfil.bilgilendirme_okundu) bilgiModalAc();
}

function paketModalAc() {
  el('paket-secenekler').innerHTML=PAKET_SIRASI.map(k=>{
    const pk=PAKETLER[k];
    const ek=pk.gorusme?pk.gorusme+' görüşme':'';
    return `<label class="paket-opt"><input type="radio" name="paket-secim" value="${k}"><span class="renk" style="background:${pk.renk}"></span>${pk.ad}<span class="ek">${ek}</span></label>`;
  }).join('');
  hide('paket-hata');
  el('paket-modal')?.classList.add('open');
}

async function paketSeciminiKaydet() {
  const sec=document.querySelector('input[name="paket-secim"]:checked')?.value;
  if (!sec) { show('paket-hata'); el('paket-hata').textContent='Lütfen bir paket seçin.'; return; }
  try {
    await updateDoc(doc(db,'egitim_profilleri',activeProfilId),{paket_secim:sec});
    aileProfil={...aileProfil, paket_secim:sec};
    el('paket-modal')?.classList.remove('open');
    aileUyarilariGoster();
    if (!aileProfil.bilgilendirme_okundu) bilgiModalAc();
  } catch(e) { show('paket-hata'); el('paket-hata').textContent='Kaydedilemedi: '+e.message; }
}

function bilgiModalAc() {
  const k=etkinPaket(aileProfil);
  const saatli=PAKETLER[k]?.saatSiniri!==false;
  el('bilgi-metni').innerHTML=
    `<p class="bilgi-madde"><b>1.</b> Her gün günlüğünüzü doldurup <b>Kaydet</b>'e basın.</p>`
   +`<p class="bilgi-madde"><b>2.</b> Ardından ${raporZamanMetni(k)} <span style="color:#1E8A4A;font-weight:600;">"WhatsApp ile Rapor Gönder"</span> butonuyla raporunuzu <b>mutlaka</b> bize iletin.</p>`
   +`<p class="bilgi-madde"><b>3.</b> Paketiniz dondurulmadığı sürece, ${saatli?'<b>08.00–11.00 arasında günlük iletmediğiniz günler de</b>':'<b>takip gününde günlük iletmediğiniz günler de</b>'} danışmanlık sürenizden sayılır ve o günün takibi yapılmış kabul edilir.</p>`;
  el('bilgi-modal')?.classList.add('open');
}

async function bilgilendirmeOkundu() {
  try {
    await updateDoc(doc(db,'egitim_profilleri',activeProfilId),{bilgilendirme_okundu:serverTimestamp()});
    aileProfil={...aileProfil, bilgilendirme_okundu:new Date()};
  } catch(e) { console.error('Bilgilendirme kaydı:',e); }
  el('bilgi-modal')?.classList.remove('open');
}

function kayitSonrasiGoster(tarih) {
  aileUyarilariGoster();
  const kutu=el('kayit-sonrasi'); if(!kutu) return;
  const g=gunlukCache[tarih]; const d=tsDate(g?.guncelleme)||new Date();
  const k=etkinPaket(aileProfil);
  kutu.innerHTML=`<div class="uyari uyari-yesil" style="margin-bottom:8px;">✓ <b>Günlüğünüz kaydedildi</b> · ${tarihKisa(tarih)}, ${saatStr(d)}</div>
    <div class="uyari uyari-sari">Son adım: Raporunuzu ${raporZamanMetni(k)} WhatsApp'tan <b>mutlaka</b> iletin.
      <button class="btn-wa" onclick="raporModalAc()">📤 WhatsApp ile Rapor Gönder</button></div>`;
  kutu.style.display='block';
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
  const satirHtml=t=>{
    const g=gunlukCache[t];
    const geceSure=g?.gece?.sure||'';
    const gunduzSayi=(g?.gunduz||[]).length;
    const aktifCls=t===aktifTarih?'gecmis-item aktif':'gecmis-item';
    const rapor=tsDate(g?.rapor_tiklama);
    return `<div class="${aktifCls}" onclick="gunlukAc('${t}')">
      <div class="gecmis-tarih">${tarihTR(t)}</div>
      <div class="gecmis-ozet">${gunduzSayi>0?'☀️ '+gunduzSayi+' gündüz':''} ${geceSure?'🌙 '+geceSure:''}${rapor?' · <span style="color:#3F6B4A;">📤 rapor '+saatStr(rapor)+'</span>':''}</div>
    </div>`;
  };
  // Günler haftalara bölünür; açık olan günün haftası (bilgisayarda en yeni hafta da) açık gelir
  const gruplar=[];
  for (const t of tarihler) {
    const d=new Date(t+'T12:00:00'); const pzt=new Date(d); pzt.setDate(d.getDate()-((d.getDay()+6)%7));
    const paz=new Date(pzt); paz.setDate(pzt.getDate()+6);
    const anahtar=tarihStr(pzt);
    let g=gruplar.find(x=>x.anahtar===anahtar);
    if (!g) { g={anahtar, etiket:tarihKisa(anahtar)+' – '+tarihKisa(tarihStr(paz)), gunler:[]}; gruplar.push(g); }
    g.gunler.push(t);
  }
  const genis=window.innerWidth>700; // telefonda haftalar kapalı gelir, form yukarıda kalır
  const haftaHtml=(g,i)=>`<details class="hafta-grup aile" ${(i===0&&genis)||g.gunler.includes(aktifTarih)?'open':''}>
    <summary class="hafta-label">${g.etiket} <span class="hafta-ozet">· ${g.gunler.length} gün</span></summary>
    ${g.gunler.map(satirHtml).join('')}</details>`;
  const onceki=gruplar.slice(1);
  const oncekiAcik=onceki.some(g=>g.gunler.includes(aktifTarih));
  listEl.innerHTML=haftaHtml(gruplar[0],0)+(onceki.length?`<details class="onceki-haftalar aile" ${oncekiAcik?'open':''}><summary>Önceki haftalar (${onceki.length})</summary>${onceki.map((g,i)=>haftaHtml(g,i+1)).join('')}</details>`:'');
  const tumuBtn=el('gecmis-tumu'); if (tumuBtn) tumuBtn.style.display='none';
}

function gecmisTumunuGoster() {
  const listEl=el('gecmis-list'); if(!listEl) return;
  listEl.classList.toggle('kisa');
  listEl.dataset.acik=listEl.classList.contains('kisa')?'':'1';
  renderGecmisList();
}

// ============================================================
// GÜNLÜK AÇ
// ============================================================
function gunlukAc(tarih) {
  aktifTarih=tarih;
  el('aktif-tarih-input').value=tarih;
  el('aktif-tarih-label').textContent=tarihTR(tarih);
  formSifirla();
  formYukle(gunlukCache[tarih]||{});
  renderGecmisList();
  show('gunluk-editor');
  hide('bos-durum');
  hide('kayit-sonrasi');
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
  gunduzCounter=0; uyanmaCounter=0; ruyaCounter=0;
  ['sabah','yatis','kalkis','gece-sure'].forEach(id=>{ const i=el(id); if(i) i.value=''; });
  const gn=el('genel-not'); if(gn) gn.value='';
  const ad=el('aksam-dalis'); if(ad) ad.value='';
  const rl=el('ruya-list'); if(rl) rl.innerHTML='';
  const acb=el('arandi-cb'); if(acb) acb.checked=false;
}

function formYukle(g) {
  if (!g) return;
  if (el('sabah')&&g.sabah) el('sabah').value=g.sabah;
  if (el('yatis')&&g.gece?.yatis) el('yatis').value=g.gece.yatis;
  if (el('kalkis')&&g.gece?.kalkis) el('kalkis').value=g.gece.kalkis;
  if (el('genel-not')&&g.genelNot) el('genel-not').value=g.genelNot;
  if (el('aksam-dalis')&&g.aksamDalis) el('aksam-dalis').value=g.aksamDalis;
  calcGece();
  const gl=el('gunduz-list');
  if (gl) {
    gl.innerHTML=''; gunduzCounter=0; // Sayacı DOM'dan ÖNCE sıfırla
    if (g.gunduz&&g.gunduz.length>0) {
      g.gunduz.forEach(gu=>{
        const rid='gd-'+gunduzCounter; // addGunduzUyku çağrısından önce mevcut sayacı oku
        addGunduzUyku();
        if(el(rid+'-bas'))  el(rid+'-bas').value=gu.bas||'';
        if(el(rid+'-bit'))  el(rid+'-bit').value=gu.bit||'';
        if(el(rid+'-sure')) el(rid+'-sure').value=gu.sure||'';
        if(el(rid+'-not'))  el(rid+'-not').value=gu.not||'';
      });
    } else {
      addGunduzUyku(); // Boş kayıtlar için varsayılan satır
    }
  }
  const ul=el('uyanma-list');
  if (ul) {
    ul.innerHTML=''; uyanmaCounter=0; // Sayacı DOM'dan ÖNCE sıfırla
    if (g.uyanmalar&&g.uyanmalar.length>0) {
      g.uyanmalar.forEach(u=>{
        const rid='uy-'+uyanmaCounter;
        addUyanma();
        if(el(rid+'-saat')) el(rid+'-saat').value=u.saat||'';
        if(el(rid+'-sure')) el(rid+'-sure').value=u.sure||'';
        if(el(rid+'-not'))  el(rid+'-not').value=u.not||'';
      });
    }
  }
  // Rüya öğünleri yükle
  const rl=el('ruya-list');
  if(rl){
    rl.innerHTML=''; ruyaCounter=0; // Sayacı DOM'dan ÖNCE sıfırla
    if(g.ruyaOgunleri&&g.ruyaOgunleri.length>0){
      g.ruyaOgunleri.forEach(r=>{
        const rid='ry-'+ruyaCounter;
        addRuya();
        if(el(rid+'-saat')) el(rid+'-saat').value=r.saat||'';
      });
    }
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
  // Rüya öğünleri
  const ruyaList=el('ruya-list');
  const ruyaOgunleri=ruyaList?[...ruyaList.querySelectorAll('input[type=text]')].map(inp=>({
    saat:inp.value?.trim()||'',
  })).filter(u=>u.saat):[];
  return {
    sabah:el('sabah')?.value||'',
    gunduz,
    gece:{yatis:el('yatis')?.value||'',kalkis:el('kalkis')?.value||'',sure:el('gece-sure')?.value||''},
    aksamDalis:el('aksam-dalis')?.value?.trim()||'',
    uyanmalar,
    ruyaOgunleri,
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
    showToast('✓ Kaydedildi!');
    kayitSonrasiGoster(aktifTarih);
    el('kayit-sonrasi')?.scrollIntoView({behavior:'smooth',block:'center'});
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
  show('rapor-adim1'); hide('rapor-adim2');
  el('rapor-modal')?.classList.add('open');
}
function raporModalKapat() { el('rapor-modal')?.classList.remove('open'); }

function raporMesajOlustur(secili) {
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
  secili.sort().forEach((tarih)=>{
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
    if (g.aksamDalis) msg+=`  😴 Uykuya dalış: ${g.aksamDalis}\n`;
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
  return msg;
}

async function raporOlustur() {
  const secili=[...document.querySelectorAll('#rapor-gun-list input:checked')].map(c=>c.value);
  if (secili.length===0) { showToast('❌ En az bir gün seçin.'); return; }
  // Önce mevcut günlüğü kaydet
  if (aktifTarih&&activeProfilId) {
    try { await gunlukFirebaseKaydet(aktifTarih,gunlukTopla()); } catch(e){}
  }
  const msg = raporMesajOlustur(secili);
  raporSecili = secili;
  // Önizleme textarea'ya yaz
  el('rapor-onizleme').value = msg;
  // WhatsApp linkini hazırla
  el('rapor-wa-link').href = 'https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent(msg);
  // Adım 2'ye geç
  hide('rapor-adim1');
  show('rapor-adim2');
}

function raporGeriDon() {
  hide('rapor-adim2');
  show('rapor-adim1');
}

function raporGonder() {
  // Artık kullanılmıyor, eski referanslar için boş bırakıldı
}

// WhatsApp butonuna basıldığında, rapora eklenen günlere gönderim saatini işle.
// (Mesajın WhatsApp'ta gerçekten gönderildiği buradan görülemez.)
async function raporTiklamaKaydet() {
  if (!activeProfilId || raporSecili.length===0) return;
  const simdi=new Date();
  await Promise.all(raporSecili.map(async t=>{
    try {
      await setDoc(doc(db,'egitim_profilleri',activeProfilId,'gunlukler',t),{rapor_tiklama:serverTimestamp()},{merge:true});
      gunlukCache[t]={...(gunlukCache[t]||{}), rapor_tiklama:simdi};
    } catch(e) { console.warn('Rapor saati kaydedilemedi:',e); }
  }));
}
el('rapor-wa-link')?.addEventListener('click', ()=>{ raporTiklamaKaydet(); });

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
  return '<input type="text" id="'+id+'" placeholder="örn. 08:30" inputmode="numeric"'
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
  const h=Math.floor(d/60), m=d%60;
  o.value = h>0 ? (h+'s'+(m>0?' '+m+'dk':'')) : m+'dk';
}

function removeGunduzUyku(rid) {
  const interEl=el(rid+'-inter');
  if(interEl) interEl.remove();
  el(rid)?.remove();
  calcUyanikSureler();
}

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

function addRuya() {
  const l=el('ruya-list'); if(!l) return;
  const i=ruyaCounter++, rid='ry-'+i;
  const div=document.createElement('div'); div.id=rid;
  div.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:8px;';
  div.innerHTML='<div class="form-group" style="margin:0;flex:1;"><label>Saat</label>'+saatInput(rid+'-saat')+'</div>'
    +'<button type="button" onclick="document.getElementById(\''+rid+'\').remove()" style="background:none;border:1.5px solid #E2D5C8;border-radius:6px;padding:8px 10px;cursor:pointer;color:#C4936A;font-size:14px;margin-top:18px;">×</button>';
  l.appendChild(div);
}

// ============================================================
// UZMAN PANELİ
// ============================================================
async function uzmanLoadAileler() {
  el('aile-list').innerHTML='<div style="padding:20px;text-align:center;color:var(--text-soft);">⏳ Yükleniyor...</div>';
  try {
    const snap=await getDocs(collection(db,'egitim_profilleri'));
    // Tüm aileler için günlük + uzman notu isteklerini paralel gönder
    const ailelerRaw = await Promise.all(snap.docs.map(async ds => {
      const d = ds.data();
      const [gunlukSnap, notSnap] = await Promise.all([
        getDocs(collection(db,'egitim_profilleri',ds.id,'gunlukler')),
        getDoc(doc(db,'uzman_notlari',ds.id)).catch(()=>null),
      ]);
      const gunlukler={};
      gunlukSnap.forEach(g=>{ gunlukler[g.id]=g.data(); });
      const uzmanNot = (notSnap&&notSnap.exists())
        ? notSnap.data()
        : {mevcutDurum:[], yaplacaklar:'', diger:''};
      return {
        id:ds.id, anneAd:d.anne_ad||'İsimsiz', bebekAd:d.bebek_ad||'—',
        dogumTarihi:d.dogum_tarihi||'', email:d.email||'',
        durum:d.durum||'aktif',
        gunlukler, tarih:d.tarih?.toDate?d.tarih.toDate():null, uzmanNot,
        profil:d,
      };
    }));
    uzmanAileler = ailelerRaw;
    uzmanAileler.sort((a,b)=>(!a.tarih&&!b.tarih)?0:!a.tarih?1:!b.tarih?-1:b.tarih-a.tarih);
    renderAileler(); updateUzmanStats();
  } catch(e) { el('aile-list').innerHTML=`<div style="padding:20px;color:#C05050;">❌ ${e.message}</div>`; }
}

function switchArsivTab(sekme) {
  aktifSekme = sekme;
  ['bugun','aktif','mezun','yarim'].forEach(s => {
    el('tab-'+s)?.classList.toggle('active', s===sekme);
  });
  const q = el('uzman-search')?.value?.trim()||'';
  if (q) searchAileler(q);
  else renderAileler();
}

function updateUzmanStats() {
  const aktifSayisi  = uzmanAileler.filter(a=>(a.durum||'aktif')==='aktif').length;
  const mezunSayisi  = uzmanAileler.filter(a=>a.durum==='mezun').length;
  const yarimSayisi  = uzmanAileler.filter(a=>a.durum==='yarim').length;
  el('stat-toplam').textContent = uzmanAileler.length;
  el('stat-aktif').textContent  = aktifSayisi;
  if(el('count-aktif')) el('count-aktif').textContent = aktifSayisi;
  if(el('count-mezun')) el('count-mezun').textContent = mezunSayisi;
  if(el('count-yarim')) el('count-yarim').textContent = yarimSayisi;
  if (uzmanAileler.length>0) {
    const s=uzmanAileler[0];
    el('stat-son').textContent=s.bebekAd;
    el('stat-son-sub').textContent=s.tarih?s.tarih.toLocaleDateString('tr-TR',{day:'numeric',month:'short'}):'Yeni';
  }
}

function sekmeFiltresi() {
  // "Bugün" sekmesi aktif aileleri kullanır
  const durum = aktifSekme==='bugun' ? 'aktif' : aktifSekme;
  return uzmanAileler.filter(a=>(a.durum||'aktif')===durum);
}

// Son günlükten bu yana geçen gün (hiç günlük yoksa null)
function sonGunlukGunFarki(a) {
  const tarihler=Object.keys(a.gunlukler).filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t) && a.gunlukler[t]?.guncelleme).sort();
  return tarihler.length ? gunFarki(tarihler[tarihler.length-1], bugunStr()) : null;
}

function sonGunlukMetni(a) {
  const tarihler=Object.keys(a.gunlukler).filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t)).sort();
  if (!tarihler.length) return 'Henüz günlük yok';
  const son=tarihler[tarihler.length-1];
  const f=gunFarki(son, bugunStr());
  return 'Son günlük: '+(f===0?'bugün':f===1?'dün':tarihKisa(son));
}

function aileOzetSatiri(a) {
  const p=a.profil||{};
  const hak=gorusmeHakki(p), kul=kullanilanGorusme(a.gunlukler);
  const sure=sureGun(p), gg=gecenGun(p);
  let h='<div class="sayac-satir">';
  h+=hak ? `<span>📞 <b>${kul} / ${hak}</b>${hak-kul>0?' · '+(hak-kul)+' kaldı':' · <span style="color:#C05050;">bitti</span>'}</span>` : `<span>📞 ${kul} görüşme</span>`;
  if (sure && gg!=null) h+=`<span>📅 <b>Gün ${Math.min(gg,sure)} / ${sure}</b>${donmusMu(p)?' (duruyor)':gg>sure?' · <span style="color:#C05050;">süre doldu</span>':''}</span>`;
  else if (sure) h+=`<span style="color:var(--text-soft);">📅 Başlamadı</span>`;
  const ekA=aktifEk(p); if (ekA) h+=`<span>➕ <b>Ek dönem</b> · bitiş ${tarihKisa(ekBitis(ekA))}</span>`;
  h+='</div>';
  return h;
}

function renderAileler(liste) {
  renderSureDoldu();
  if (aktifSekme==='bugun' && !liste) { renderBugun(); return; }
  const filtre = liste || sekmeFiltresi();
  const le=el('aile-list'); if(!le) return;
  if(filtre.length===0){
    const mesajlar = {bugun:'Aktif danışan yok.',aktif:'Aktif danışan yok.',mezun:'Mezun danışan yok.',yarim:'Yarım kalan danışan yok.'};
    le.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-soft);">${mesajlar[aktifSekme]||'Henüz aile yok.'}</div>`;
    return;
  }
  le.innerHTML=filtre.map(a=>{
    const p=a.profil||{};
    const k=etkinPaket(p);
    const durumBadge = a.durum==='mezun'
      ? '<span class="durum-badge durum-mezun">🎓 Mezun</span>'
      : a.durum==='yarim'
      ? '<span class="durum-badge durum-yarim">⏸️ Yarım</span>'
      : '';
    return `<div class="aile-card" onclick="uzmanShowDetail('${a.id}')">
      <div class="aile-avatar" style="${k?'background:'+PAKETLER[k].renk+';':''}">${a.bebekAd.charAt(0).toUpperCase()}</div>
      <div class="aile-info" style="flex:1;min-width:0;">
        <strong>${a.bebekAd} ${paketTag(k, !!p.paket)} ${donmusMu(p)?'<span class="donma-tag">⏸ Donduruldu</span>':''} ${durumBadge}</strong>
        <span>${a.anneAd}${a.dogumTarihi?' · '+bebekYasi(a.dogumTarihi):''}</span>
        ${aileOzetSatiri(a)}
        <span style="font-size:11px;margin-top:3px;">${sonGunlukMetni(a)}</span>
      </div>
    </div>`;
  }).join('');
}

function searchAileler(q) {
  const s=q.trim().toLowerCase();
  if(!s){renderAileler();return;}
  const tabFiltre = sekmeFiltresi();
  renderAileler(tabFiltre.filter(a=>a.bebekAd.toLowerCase().includes(s)||a.anneAd.toLowerCase().includes(s)));
}

// Süresi dolmuş aileler: uzmanın kararı için panelin üstünde gösterilir
function renderSureDoldu() {
  const kutu=el('sure-doldu'); if(!kutu) return;
  const liste=uzmanAileler.filter(a=>sureDolduMu(a.profil||{}));
  if (!liste.length || !['bugun','aktif'].includes(aktifSekme)) { kutu.innerHTML=''; return; }
  kutu.innerHTML=`<div class="uyari uyari-sari"><b>Danışmanlık süresi dolanlar (${liste.length})</b>
    ${liste.map(a=>{
      const p=a.profil||{}, hak=gorusmeHakki(p);
      return `<div class="bugun-satir" style="margin-top:8px;cursor:default;">
        <div onclick="uzmanShowDetail('${a.id}')" style="cursor:pointer;"><b>${a.bebekAd}</b> <span style="font-size:12px;color:var(--text-soft);">· ${a.anneAd}</span>
          <div style="font-size:11.5px;">${sureGun(p)} gün doldu${hak?' · 📞 '+kullanilanGorusme(a.gunlukler)+'/'+hak:''}</div></div>
        <div class="sag" style="display:flex;gap:6px;">
          <button class="mini-btn" onclick="durumDegistir('${a.id}','mezun')">🎓 Mezun</button>
          <button class="mini-btn" onclick="durumDegistir('${a.id}','yarim')">⏸️ Yarım kaldı</button>
        </div></div>`;
    }).join('')}</div>`;
}

// Bir ailenin bugünkü hareketleri: günlük kaydı, rapor butonu, arandı
function bugunHareketleri(a) {
  const bugun=bugunStr();
  let kayit=null, rapor=null, arandi=false;
  for (const g of Object.values(a.gunlukler)) {
    const gd=tsDate(g?.guncelleme), rd=tsDate(g?.rapor_tiklama), ad=tsDate(g?.arandi_zaman);
    if (gd && tarihStr(gd)===bugun && (!kayit||gd>kayit)) kayit=gd;
    if (rd && tarihStr(rd)===bugun && (!rapor||rd<rapor)) rapor=rd;
    if (g?.arandi && ad && tarihStr(ad)===bugun) arandi=true;
  }
  return { kayit, rapor, arandi, geldi: !!(kayit||rapor) };
}

function renderBugun() {
  const le=el('aile-list'); if(!le) return;
  const bugun=bugunStr();
  const tatil=tatilMi(bugun);
  const haftaSonu=tatil || [0,6].includes(new Date(bugun+'T12:00:00').getDay());
  const aktifler=uzmanAileler.filter(a=>(a.durum||'aktif')==='aktif');
  const aranacak=[], arananlar=[], gelmeyen=[], uzunAra=[], donmusGelen=[];
  for (const a of aktifler) {
    const h=bugunHareketleri(a), p=a.profil||{}, k=etkinPaket(p);
    const ara=sonGunlukGunFarki(a);
    if (h.arandi) arananlar.push({a,h});
    else if (donmusMu(p)) { if (h.geldi) donmusGelen.push({a,h}); }
    else if (h.geldi) aranacak.push({a,h});
    else if (k && ara!=null && ara>=UZUN_ARA_GUN && !donmusMu(p) && !aktifEk(p)) uzunAra.push({a,h,ara});
    else if (!haftaSonu && p.baslangic_tarihi && !donmusMu(p) && takipGunuMu(k, bugun) && !sureDolduMu(p)) gelmeyen.push({a,h});
  }
  const ilk=(h)=>h.rapor||h.kayit;
  aranacak.sort((x,y)=>ilk(x.h)-ilk(y.h));
  const satir=({a,h}, sagHtml)=>{
    const p=a.profil||{}, k=etkinPaket(p), hak=gorusmeHakki(p), sure=sureGun(p), gg=gecenGun(p);
    const alt=[hak?`📞 ${kullanilanGorusme(a.gunlukler)}/${hak}`:'', (sure&&gg!=null)?`Gün ${Math.min(gg,sure)}/${sure}`:''].filter(Boolean).join(' · ');
    return `<div class="bugun-satir" onclick="uzmanShowDetail('${a.id}')">
      <div class="aile-avatar" style="width:36px;height:36px;font-size:16px;${k?'background:'+PAKETLER[k].renk+';':''}">${a.bebekAd.charAt(0).toUpperCase()}</div>
      <div><b>${a.bebekAd}</b> <span style="font-size:12px;color:var(--text-soft);">· ${a.anneAd}</span>${alt?`<div style="font-size:11.5px;">${alt}</div>`:''}</div>
      <div class="sag">${sagHtml}</div></div>`;
  };
  const saatHtml=({a,h})=>{
    const k=etkinPaket(a.profil||{});
    const zaman=ilk(h);
    const saatli=aktifEk(a.profil||{}) ? true : (PAKETLER[k]?.saatSiniri!==false && takipGunuMu(k,bugun));
    const gec=zaman && saatli && zaman.getHours()>=GEC_SAAT;
    const parcalar=[];
    if (h.kayit) parcalar.push('Kaydetti '+saatStr(h.kayit));
    if (h.rapor) parcalar.push('Rapor '+saatStr(h.rapor));
    return `<span style="color:${gec?'#C05050':'#4A7A56'};">${parcalar.join('<br>')}${gec?' ⚠︎ geç':' ✓'}</span>`;
  };
  let html=`<div style="font-size:13px;color:var(--text-soft);">${tarihTR(bugun)}${tatil?' · Tatil — takip yok':haftaSonu?' · Hafta sonu — takip yok':''}</div>`;
  html+=`<div class="bugun-baslik" style="color:var(--dusty-rose);">Günlüğü geldi · aranacak (${aranacak.length})</div>`;
  html+=aranacak.length?aranacak.map(x=>satir(x,saatHtml(x))).join(''):'<div style="font-size:12.5px;color:var(--text-soft);padding:4px 2px;">Şimdilik yok.</div>';
  html+=`<div class="bugun-baslik" style="color:var(--success);">Arandı (${arananlar.length})</div>`;
  html+=arananlar.length?arananlar.map(x=>satir(x,'📞 ✓')).join(''):'<div style="font-size:12.5px;color:var(--text-soft);padding:4px 2px;">Henüz yok.</div>';
  if (!haftaSonu) {
    html+=`<div class="bugun-baslik" style="color:var(--text-soft);">Takip günü · günlük gelmedi (${gelmeyen.length})</div>`;
    html+=gelmeyen.length?gelmeyen.map(x=>satir(x,`<span style="color:var(--text-soft);">${sonGunlukMetni(x.a).replace('Son günlük: ','son: ')}</span>`)).join(''):'<div style="font-size:12.5px;color:var(--text-soft);padding:4px 2px;">Herkes iletti.</div>';
  }
  if (donmusGelen.length) {
    html+=`<div class="bugun-baslik" style="color:var(--text-soft);">⏸ Paketi dondurulmuş ama günlük gönderdi (${donmusGelen.length})</div>`;
    html+=donmusGelen.map(x=>satir(x,`<span style="color:var(--text-soft);">Yeniden başladı mı?</span><br><button class="mini-btn" style="margin-top:4px;" onclick="event.stopPropagation();if(confirm('${x.a.bebekAd.replace(/'/g,'')} için danışmanlık yeniden başlasın mı?'))uzmanDevamEt('${x.a.id}')">▶ Yeniden başladık</button>`)).join('');
  }
  if (uzunAra.length) {
    uzunAra.sort((x,y)=>x.ara-y.ara);
    html+=`<div class="bugun-baslik" style="color:#C05050;">${UZUN_ARA_GUN}+ gündür günlük yok (${uzunAra.length})</div>`;
    html+=uzunAra.map(x=>satir(x,`<span style="color:#C05050;">${x.ara} gündür yok</span><br><button class="mini-btn" style="margin-top:4px;" onclick="event.stopPropagation();if(confirm('${x.a.bebekAd.replace(/'/g,'')} Yarım kaldı sekmesine taşınsın mı?'))durumDegistir('${x.a.id}','yarim')">⏸️ Yarım</button>`)).join('');
  }
  le.innerHTML=html;
}

function uzmanShowDetail(id, kaydir=true) {
  const a=uzmanAileler.find(x=>x.id===id); if(!a) return;
  hide('uzman-list-section'); show('uzman-detail');
  el('uzman-detail').classList.add('visible');
  const statlar=document.querySelector('#screen-dashboard .stats-row'); if(statlar) statlar.style.display='none';
  if (kaydir) window.scrollTo(0,0);
  const ds=a.dogumTarihi?new Date(a.dogumTarihi+'T00:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):'—';
  const n=a.uzmanNot||{mevcutDurum:[],yaplacaklar:'',diger:''};
  const SECENEKLER=['Meme ile uyuyor','Rüya öğünü yapılacak','Sakinleşme düzenlenecek','Kucakta sallama ile uyuyor','Ayakta sallama ile uyuyor','Kucakta sabit duruş ile uyuyor','Pilates topu ile uyuyor','Emzik ile uyuyor'];
  const secHtml=SECENEKLER.map(s=>`<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;background:${(n.mevcutDurum||[]).includes(s)?'rgba(196,147,106,0.15)':'transparent'};border:1px solid ${(n.mevcutDurum||[]).includes(s)?'#C4936A':'var(--border)'};margin-bottom:6px;font-size:13px;">
    <input type="checkbox" value="${s}" ${(n.mevcutDurum||[]).includes(s)?'checked':''} style="accent-color:#C4936A;width:16px;height:16px;"> ${s}
  </label>`).join('');

  // Toplam görüşme sayısı
  const gorusmeSayisi=Object.values(a.gunlukler).filter(g=>g.arandi).length;

  const durumRenk  = a.durum==='mezun' ? '#8A6020' : a.durum==='yarim' ? '#C05050' : '#4A7A56';
  const durumLabel = a.durum==='mezun' ? '🎓 Mezun' : a.durum==='yarim' ? '⏸️ Yarım Kaldı' : '✅ Aktif';

  let html=`<div>`;

  // Profil kartı
  html+=`<div class="form-card" style="margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="border-bottom:none;padding-bottom:0;margin:0;">👶 ${a.bebekAd}</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <div style="position:relative;">
          <button id="durum-btn-${a.id}" onclick="durumMenuToggle('${a.id}')" style="background:rgba(61,43,31,0.06);border:1.5px solid var(--border);padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;color:${durumRenk};font-weight:600;">${durumLabel} ▾</button>
          <div id="durum-menu-${a.id}" style="display:none;position:absolute;right:0;top:110%;background:white;border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:200;min-width:160px;overflow:hidden;">
            <button onclick="durumDegistir('${a.id}','aktif')" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;font-family:inherit;font-size:13px;cursor:pointer;color:#4A7A56;border-bottom:1px solid var(--border);">✅ Aktif</button>
            <button onclick="durumDegistir('${a.id}','mezun')" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;font-family:inherit;font-size:13px;cursor:pointer;color:#8A6020;border-bottom:1px solid var(--border);">🎓 Mezun</button>
            <button onclick="durumDegistir('${a.id}','yarim')" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;font-family:inherit;font-size:13px;cursor:pointer;color:#C05050;">⏸️ Yarım Kaldı</button>
          </div>
        </div>
        <button onclick="uzmanNotDuzenle('${a.id}')" style="background:rgba(196,147,106,0.1);border:1.5px solid #C4936A;padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;color:var(--mid-brown);">📋 Notlarım</button>
        <button onclick="uzmanDuzenleAc('${a.id}')" style="background:none;border:1.5px solid var(--border);padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;color:var(--mid-brown);">✏️ Düzenle</button>
      </div>
    </div>
    <div id="uzman-duzenle-form-${a.id}" style="display:none;margin-bottom:14px;background:rgba(196,147,106,0.06);border-radius:10px;padding:14px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label style="font-size:11px;color:var(--text-soft);display:block;margin-bottom:4px;">Bebek Adı</label><input id="edit-bebek-${a.id}" value="${a.bebekAd}" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px;box-sizing:border-box;"></div>
        <div><label style="font-size:11px;color:var(--text-soft);display:block;margin-bottom:4px;">Anne Adı Soyadı</label><input id="edit-anne-${a.id}" value="${a.anneAd}" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px;box-sizing:border-box;"></div>
        <div><label style="font-size:11px;color:var(--text-soft);display:block;margin-bottom:4px;">Doğum Tarihi</label><input type="date" id="edit-dogum-${a.id}" value="${a.dogumTarihi}" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px;box-sizing:border-box;"></div>
      </div>
      <button onclick="uzmanProfiliKaydet('${a.id}')" style="background:var(--dusty-rose);color:#fff;border:none;padding:8px 18px;border-radius:8px;font-family:inherit;font-size:13px;cursor:pointer;">💾 Kaydet</button>
      <button onclick="el('uzman-duzenle-form-${a.id}').style.display='none'" style="background:none;border:1px solid var(--border);padding:8px 14px;border-radius:8px;font-family:inherit;font-size:13px;cursor:pointer;margin-left:8px;">İptal</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
      <div><span style="color:var(--text-soft);font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">Anne Adı Soyadı</span><strong>${a.anneAd}</strong></div>
      <div><span style="color:var(--text-soft);font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">Doğum Tarihi</span><strong>${ds}</strong><span style="font-size:11px;color:var(--dusty-rose);font-weight:600;margin-top:2px;display:block;">${bebekYasi(a.dogumTarihi)}</span></div>
      <div><span style="color:var(--text-soft);font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">E-posta</span><strong>${a.email||'—'}</strong></div>
      <div><span style="color:var(--text-soft);font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">Toplam Görüşme</span><strong data-gorusme-sayac style="color:${gorusmeSayisi>0?'#C4936A':'var(--text-main)'};">📞 ${gorusmeSayisi} görüşme</strong></div>
    </div></div>`;

  html+=paketKartHtml(a);

  const tarihler=Object.keys(a.gunlukler).sort().reverse();
  if(tarihler.length===0){
    html+=`<div style="background:rgba(196,147,106,0.08);border:1px solid rgba(196,147,106,0.2);border-radius:12px;padding:18px;text-align:center;color:var(--text-soft);font-size:13px;">📓 Henüz günlük girilmemiş.</div>`;
  } else {
    // Günleri hafta hafta grupla (başlangıç tarihi varsa danışmanlık haftasına göre)
    const bas=a.profil?.baslangic_tarihi;
    const gruplar=[];
    tarihler.forEach((t,i)=>{
      let anahtar, etiket;
      if (bas && t>=bas) { const n=Math.floor(gunFarki(bas,t)/7)+1; anahtar='h'+n; etiket=n+'. hafta'; }
      else if (bas) { anahtar='once'; etiket='Başlangıç öncesi'; }
      else {
        const d=new Date(t+'T12:00:00'); const fark=(d.getDay()+6)%7;
        const pzt=new Date(d); pzt.setDate(d.getDate()-fark); const paz=new Date(pzt); paz.setDate(pzt.getDate()+6);
        anahtar=tarihStr(pzt); etiket=tarihKisa(tarihStr(pzt))+' – '+tarihKisa(tarihStr(paz));
      }
      let g=gruplar.find(x=>x.anahtar===anahtar);
      if(!g){ g={anahtar,etiket,html:'',gun:0,arama:0}; gruplar.push(g); }
      const arandi=a.gunlukler[t]?.arandi;
      g.gun++; if (arandi) g.arama++;
      g.html+=`<button class="gunluk-day-tab ${i===0?'active':''}" onclick="uzmanSwitchDay('${t}',this)">${tarihKisa(t)}${arandi?' 📞':''}</button>`;
    });
    const haftaHtml=(g,acik)=>`<details class="hafta-grup" ${acik?'open':''}><summary class="hafta-label">${g.etiket} <span class="hafta-ozet">· ${g.gun} gün${g.arama?' · 📞 '+g.arama:''}</span></summary><div class="gunluk-day-tabs" style="flex-wrap:wrap;margin-bottom:4px;">${g.html}</div></details>`;
    // Sadece son hafta görünür; eski haftalar tek bir "Önceki haftalar" düğmesinin altında
    const onceki=gruplar.slice(1);
    const tabs=haftaHtml(gruplar[0],true)+(onceki.length?`<details class="onceki-haftalar"><summary>Önceki haftalar (${onceki.length})</summary><div style="padding-left:6px;">${onceki.map(g=>haftaHtml(g,false)).join('')}</div></details>`:'');
    const panels=tarihler.map((t,i)=>{
      const arandi=a.gunlukler[t]?.arandi||false;
      return `<div class="gunluk-day-panel ${i===0?'active':''}" id="uzman-day-${t.replace(/-/g,'')}">
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
          <button onclick="uzmanArandiToggle('${a.id}','${t}',this)"
            style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:20px;font-family:inherit;font-size:12px;cursor:pointer;font-weight:600;border:1.5px solid ${arandi?'#C4936A':'var(--border)'};background:${arandi?'rgba(196,147,106,0.12)':'white'};color:${arandi?'#9B6B3A':'var(--text-soft)'};">
            📞 ${arandi?'Arandı ✓':'Aranmadı'}
          </button>
        </div>
        ${uzmanGunPanel(a.gunlukler[t],t)}
      </div>`;
    }).join('');
    html+=`<div class="form-card" style="margin-top:14px;"><h3>📓 Günlükler</h3>${tabs}<div style="margin-top:12px;">${panels}</div></div>`;
  }

  // Kalıcı silme: listeden kaldırıldı, burada bebeğin adı yazılarak onaylanır
  html+=`<div class="form-card" style="margin-top:24px;border-color:#E8B4B4;">
    <div style="font-size:13px;font-weight:600;color:#C05050;margin-bottom:4px;">Aileyi kalıcı olarak sil</div>
    <p style="font-size:12px;color:var(--text-soft);margin-bottom:10px;line-height:1.5;">Bu işlem geri alınamaz; ailenin profili, tüm günlükleri ve notlarınız silinir. Silmek yerine "Mezun" ya da "Yarım kaldı" olarak işaretlemeyi düşünün.</p>
    <label style="font-size:12px;color:var(--text-soft);display:block;margin-bottom:4px;">Onaylamak için bebeğin adını yazın: <b>${a.bebekAd}</b></label>
    <input id="sil-onay-${a.id}" autocomplete="off" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px;box-sizing:border-box;margin-bottom:8px;">
    <button onclick="aileSil('${a.id}')" style="background:#FFF0F0;border:1px solid #E8B4B4;color:#C05050;border-radius:8px;padding:9px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">🗑 Kalıcı olarak sil</button>
  </div>`;

  html+=`</div>`;

  // NOTLAR MODAL
  html+=`<div id="not-modal-${a.id}" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;align-items:center;justify-content:center;">
    <div style="background:#fff;border-radius:16px;padding:24px;max-width:480px;width:90%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.15);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <strong style="font-size:16px;">📋 Notlarımı Düzenle</strong>
        <button onclick="el('not-modal-${a.id}').style.display='none'" style="background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;font-weight:600;color:var(--mid-brown);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px;">Mevcut Durum</div>
        ${secHtml}
        <div style="margin-top:8px;"><label style="font-size:12px;color:var(--text-soft);display:block;margin-bottom:4px;">Diğer (isteğe bağlı):</label>
        <input id="not-diger-${a.id}" value="${n.diger||''}" placeholder="Eklemek istediğiniz durum..." style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px;box-sizing:border-box;"></div>
      </div>
      <div style="margin-bottom:18px;">
        <div style="font-size:12px;font-weight:600;color:var(--mid-brown);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Yapılacaklar</div>
        <textarea id="not-yaplacaklar-${a.id}" style="width:100%;min-height:100px;padding:10px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px;resize:vertical;box-sizing:border-box;">${n.yaplacaklar||''}</textarea>
      </div>
      <button onclick="uzmanNotKaydet('${a.id}')" style="width:100%;background:var(--dusty-rose);color:#fff;border:none;padding:12px;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;">💾 Notları Kaydet</button>
    </div>
  </div>`;

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
  if(g.aksamDalis) h+=`<div class="gunluk-block"><h4>😴 Akşam uykuya nasıl daldı?</h4><p style="font-size:13px;line-height:1.6;">${g.aksamDalis}</p></div>`;
  if((g.ruyaOgunleri||[]).length>0){
    h+='<div class="gunluk-block"><h4>🍼 Rüya Öğünleri</h4><ul class="gunluk-timeline">';
    g.ruyaOgunleri.forEach(r=>{
      h+=`<li class="gtl-item" style="border-left:3px solid #9B8878;"><span class="gtl-saat">${r.saat||'?'}</span><span class="gtl-etiket">🍼 Rüya öğünü yapıldı</span></li>`;
    });
    h+='</ul></div>';
  }
  if(g.genelNot) h+=`<div class="gunluk-block"><h4>📝 Genel Notlar</h4><p style="font-size:13px;line-height:1.6;">${g.genelNot}</p></div>`;
  return h;
}

function uzmanSwitchDay(tarih, btn) {
  document.querySelectorAll('#uzman-detail-content .gunluk-day-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#uzman-detail-content .gunluk-day-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  el('uzman-day-'+tarih.replace(/-/g,''))?.classList.add('active');
}


async function aileSil(id) {
  const a=uzmanAileler.find(x=>x.id===id); if(!a) return;
  const yazilan=(el('sil-onay-'+id)?.value||'').trim().toLocaleLowerCase('tr-TR');
  if (!yazilan || yazilan!==a.bebekAd.trim().toLocaleLowerCase('tr-TR')) {
    showToast('❌ Silmek için bebeğin adını aynen yazın.'); return;
  }
  if (!confirm(a.bebekAd + '\n\nSon onay: Bu aile ve tüm günlükleri kalıcı olarak silinecek. Bu işlem geri alınamaz.')) return;
  try {
    const gs = await getDocs(collection(db,'egitim_profilleri',id,'gunlukler'));
    for (const d of gs.docs) { await deleteDoc(d.ref); }
    await deleteDoc(doc(db,'uzman_notlari',id)).catch(()=>{});
    await deleteDoc(doc(db,'egitim_profilleri',id));
    showToast('✓ Aile silindi.');
    uzmanBackToList();
    uzmanLoadAileler();
  } catch(e) { showToast('❌ Hata: '+e.message); }
}


async function uzmanArandiToggle(aileId, tarih, btn) {
  const a=uzmanAileler.find(x=>x.id===aileId); if(!a) return;
  const mevcutDeger=a.gunlukler[tarih]?.arandi||false;
  const yeniDeger=!mevcutDeger;
  try {
    await setDoc(doc(db,'egitim_profilleri',aileId,'gunlukler',tarih),
      {arandi: yeniDeger, arandi_zaman: yeniDeger?serverTimestamp():null}, {merge:true});
    if(!a.gunlukler[tarih]) a.gunlukler[tarih]={};
    a.gunlukler[tarih].arandi=yeniDeger;
    a.gunlukler[tarih].arandi_zaman=yeniDeger?new Date():null;
    const pk=el('paket-sayac-'+aileId); if(pk) pk.innerHTML=gorusmeSayacHtml(a);
    // Butonu güncelle
    btn.style.border=`1.5px solid ${yeniDeger?'#C4936A':'var(--border)'}`;
    btn.style.background=yeniDeger?'rgba(196,147,106,0.12)':'white';
    btn.style.color=yeniDeger?'#9B6B3A':'var(--text-soft)';
    btn.textContent=`📞 ${yeniDeger?'Arandı ✓':'Aranmadı'}`;
    // Tab işaretini güncelle
    const tabBtn=document.querySelector(`#uzman-detail-content .gunluk-day-tab.active`);
    if(tabBtn){
      const base=tarihKisa(tarih);
      tabBtn.textContent=yeniDeger?base+' 📞':base;
    }
    // Profil kartındaki görüşme sayısını güncelle
    const yeniSayi=Object.values(a.gunlukler).filter(g=>g.arandi).length;
    const sayacEl=document.querySelector(`#uzman-detail-content [data-gorusme-sayac]`);
    if(sayacEl) sayacEl.textContent=`📞 ${yeniSayi} görüşme`;
    showToast(yeniDeger?'📞 Görüşme kaydedildi!':'Görüşme işareti kaldırıldı.');
    if (yeniDeger) baslangicOner(a);
  } catch(e){ showToast('❌ Hata: '+e.message); }
}

// Başlangıç tarihi girilmemiş ailede ilk görüşme gününü danışmanlık başlangıcı olarak önerir
function baslangicOner(a) {
  const p=a.profil||{};
  if (p.baslangic_tarihi || !etkinPaket(p) || (a.durum||'aktif')!=='aktif') return;
  const ilk=Object.keys(a.gunlukler).filter(t=>a.gunlukler[t]?.arandi).sort()[0];
  if (!ilk) return;
  const metin=gunFarki(ilk, bugunStr())===0
    ? 'Danışmanlık bugün başladı mı?\n\n"Tamam" derseniz başlangıç tarihi bugün olarak kaydedilir.'
    : `Bu ailenin ilk görüşmesi ${tarihKisa(ilk)} tarihinde işaretlenmiş.\n\nDanışmanlık başlangıcı ${tarihKisa(ilk)} olarak kaydedilsin mi?`;
  setTimeout(()=>{ if (confirm(metin)) uzmanProfilGuncelle(a.id, {baslangic_tarihi:ilk}, '▶ Danışmanlık başlangıcı kaydedildi.'); }, 50);
}

function uzmanNotDuzenle(id) {
  const modal=el('not-modal-'+id);
  if(modal){ modal.style.display='flex'; }
}

async function uzmanNotKaydet(id) {
  const modal=el('not-modal-'+id); if(!modal) return;
  const secili=[...modal.querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value);
  const digerEl=modal.querySelector('#not-diger-'+id);
  const yaplacaklarEl=modal.querySelector('#not-yaplacaklar-'+id);
  const diger=digerEl?.value?.trim()||'';
  const yaplacaklar=yaplacaklarEl?.value?.trim()||'';
  const veri={mevcutDurum:secili, diger, yaplacaklar};
  const btn=modal.querySelector('button[onclick*="uzmanNotKaydet"]');
  if(btn){btn.textContent='⏳ Kaydediliyor...';btn.disabled=true;}
  try {
    await setDoc(doc(db,'uzman_notlari',id), veri);
    const a=uzmanAileler.find(x=>x.id===id);
    if(a) a.uzmanNot=veri;
    modal.style.display='none';
    showToast('✓ Notlar kaydedildi!');
  } catch(e){
    console.error('Not kayıt hatası:',e);
    showToast('❌ Kayıt hatası: '+e.message);
  } finally {
    if(btn){btn.textContent='💾 Notları Kaydet';btn.disabled=false;}
  }
}

function uzmanDuzenleAc(id) {
  const f=el('uzman-duzenle-form-'+id);
  if(f) f.style.display=f.style.display==='none'?'block':'none';
}

async function uzmanProfiliKaydet(id) {
  const bebekAd=el('edit-bebek-'+id)?.value?.trim();
  const anneAd=el('edit-anne-'+id)?.value?.trim();
  const dogumTarihi=el('edit-dogum-'+id)?.value;
  if(!bebekAd||!anneAd){ showToast('❌ Ad alanları boş olamaz.'); return; }
  try {
    await updateDoc(doc(db,'egitim_profilleri',id),{bebek_ad:bebekAd, anne_ad:anneAd, dogum_tarihi:dogumTarihi||''});
    const a=uzmanAileler.find(x=>x.id===id);
    if(a){ a.bebekAd=bebekAd; a.anneAd=anneAd; a.dogumTarihi=dogumTarihi||''; }
    el('uzman-duzenle-form-'+id).style.display='none';
    showToast('✓ Profil güncellendi!');
    uzmanShowDetail(id);
  } catch(e){ showToast('❌ Hata: '+e.message); }
}

function durumMenuToggle(id) {
  const menu = el('durum-menu-'+id);
  if (!menu) return;
  const isOpen = menu.style.display === 'block';
  // Önce tüm açık menüleri kapat
  document.querySelectorAll('[id^="durum-menu-"]').forEach(m => m.style.display='none');
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    // Dışarı tıklanınca kapat
    setTimeout(()=>{
      document.addEventListener('click', function closeMenu(e) {
        if(!menu.contains(e.target) && e.target.id!=='durum-btn-'+id) {
          menu.style.display='none';
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 10);
  }
}

async function durumDegistir(id, yeniDurum) {
  const menu = el('durum-menu-'+id); if(menu) menu.style.display='none';
  const a = uzmanAileler.find(x=>x.id===id); if(!a) return;
  if(a.durum===yeniDurum) return;
  try {
    await updateDoc(doc(db,'egitim_profilleri',id), {durum: yeniDurum});
    a.durum = yeniDurum;
    const durumLabel = yeniDurum==='mezun' ? '🎓 Mezun' : yeniDurum==='yarim' ? '⏸️ Yarım Kaldı' : '✅ Aktif';
    const durumRenk  = yeniDurum==='mezun' ? '#8A6020' : yeniDurum==='yarim' ? '#C05050' : '#4A7A56';
    const btn = el('durum-btn-'+id);
    if(btn){ btn.textContent=durumLabel+' ▾'; btn.style.color=durumRenk; }
    updateUzmanStats();
    if (!el('uzman-detail')?.classList.contains('visible')) renderAileler();
    showToast(`✓ Durum "${durumLabel}" olarak güncellendi.`);
  } catch(e) { showToast('❌ Hata: '+e.message); }
}

function uzmanBackToList() {
  hide('uzman-detail'); el('uzman-detail').classList.remove('visible'); show('uzman-list-section');
  const statlar=document.querySelector('#screen-dashboard .stats-row'); if(statlar) statlar.style.display='';
  renderAileler();
}

// ============================================================
// UZMAN: PAKET, SÜRE VE DONDURMA
// ============================================================
function gorusmeSayacHtml(a) {
  const p=a.profil||{}, hak=gorusmeHakki(p), kul=kullanilanGorusme(a.gunlukler);
  if (!hak) return `📞 <b>${kul}</b> görüşme${etkinPaket(p)==='diger'?' · <span style="color:var(--text-soft);">hak girilmedi</span>':''}`;
  const kalan=hak-kul;
  return `📞 <b>${kul} / ${hak}</b> · ${kalan>0?kalan+' kaldı':'<span style="color:#C05050;">bitti</span>'}`;
}

function paketKartHtml(a) {
  const p=a.profil||{}, id=a.id;
  const secili=p.paket||p.paket_secim||'';
  const onayBekliyor=p.paket_secim && !p.paket;
  const sure=sureGun(p), gg=gecenGun(p), donmus=donmusMu(p);
  const secenekler=PAKET_SIRASI.map(k=>`<option value="${k}" ${k===secili?'selected':''}>${PAKETLER[k].ad}${PAKETLER[k].gorusme?' ('+PAKETLER[k].gorusme+' görüşme)':''}</option>`).join('');
  let h=`<div class="form-card" style="margin-bottom:14px;"><h3>📦 Paket ve Süre</h3>`;

  // Paket (kayıtlı ve onaylıysa sade görünür; değiştirme alanı "Paketi değiştir" altında)
  const paketKayitli=!!p.paket && !onayBekliyor;
  h+=`<div class="panel-kutu">
    ${paketKayitli?`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">${paketTag(p.paket)}<span id="paket-sayac-${id}" style="font-size:13px;">${gorusmeSayacHtml(a)}</span></div>
    <details class="duzenle-acilir"><summary>✎ Paketi değiştir</summary><div style="margin-top:8px;">`:''}
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <select id="paket-sec-${id}" onchange="el('diger-alan-${id}').style.display=this.value==='diger'?'flex':'none'" style="padding:8px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px;">
        <option value="">Paket seçin…</option>${secenekler}</select>
      <button class="mini-btn ana" onclick="uzmanPaketKaydet('${id}')">${onayBekliyor?'✓ Onayla':'💾 Kaydet'}</button>
    </div>
    <div id="diger-alan-${id}" style="display:${secili==='diger'?'flex':'none'};gap:8px;margin-top:8px;flex-wrap:wrap;font-size:12px;align-items:center;">
      Görüşme hakkı <input id="diger-gorusme-${id}" type="number" min="0" value="${p.ozel_gorusme_hakki||''}" style="width:70px;padding:6px;border-radius:6px;border:1px solid var(--border);">
      Gün sayısı <input id="diger-gun-${id}" type="number" min="0" value="${p.ozel_gun_sayisi||''}" style="width:70px;padding:6px;border-radius:6px;border:1px solid var(--border);">
      <span style="color:var(--text-soft);">Boş bırakılırsa sayaç ve uyarı çıkmaz.</span>
    </div>
    ${onayBekliyor?`<div style="font-size:12px;color:#8A6020;margin-top:8px;">Aile "<b>${PAKETLER[p.paket_secim]?.ad||p.paket_secim}</b>" seçti — onayınızı bekliyor.</div>`:''}
    ${!secili?'<div style="font-size:12px;color:var(--text-soft);margin-top:8px;">Aile henüz paket seçmedi. Bir sonraki girişinde seçmesi istenecek; isterseniz buradan siz de girebilirsiniz.</div>':''}
    ${paketKayitli?'</div></details>':`<div id="paket-sayac-${id}" style="font-size:13px;margin-top:10px;">${gorusmeSayacHtml(a)}</div>`}
  </div>`;

  // Süre
  h+=`<div class="panel-kutu">`;
  if (!p.baslangic_tarihi) {
    h+=`<div style="font-size:13px;margin-bottom:8px;"><b>Danışmanlık süresi</b> <span class="durum-badge" style="background:#F3EDE6;color:var(--text-soft);">Başlamadı</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="baslangic-${id}" value="${bugunStr()}" style="padding:7px;border-radius:8px;border:1px solid var(--border);font-family:inherit;">
        <button class="mini-btn ana" onclick="uzmanBaslat('${id}')">▶ Danışmanlık başladı</button>
      </div>
      <div style="font-size:11.5px;color:var(--text-soft);margin-top:6px;">Süre bu günden itibaren ${sure||'—'} gün sayılır. Regülasyon dönemi bu süreye dahil değildir.</div>`;
  } else {
    const bitis=bitisTarihi(p);
    const yuzde=sure?Math.min(100,Math.round(Math.min(gg,sure)/sure*100)):0;
    h+=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <b style="font-size:13px;">Danışmanlık süresi</b>
        ${donmus?'<span class="donma-tag">⏸ Donduruldu</span>':sureDolduMu(p)?'<span class="durum-badge durum-yarim">Süre doldu</span>':'<span class="durum-badge durum-aktif">Devam ediyor</span>'}
      </div>
      <div style="font-size:12.5px;margin-bottom:6px;">Başladı: ${tarihKisa(p.baslangic_tarihi)}${sure?` · <b>Gün ${Math.min(gg,sure)} / ${sure}</b>`:` · ${gg}. gün`}${bitis?` · Bitiş: ${tarihKisa(bitis)}`:''}</div>
      ${sure?`<div style="height:6px;background:#EFE6DC;border-radius:6px;overflow:hidden;margin-bottom:10px;"><i style="display:block;height:100%;width:${yuzde}%;background:linear-gradient(90deg,var(--sage),var(--dusty-rose));"></i></div>`:''}`;
    if (donmus) {
      const son=p.donmalar[p.donmalar.length-1];
      h+=`<div style="font-size:12.5px;margin-bottom:8px;">${tarihKisa(son.bas)}'den beri · <b>${gunFarki(son.bas,bugunStr())} gündür</b>${son.not?' · Not: '+son.not:''}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <label for="devam-tarih-${id}" style="font-size:12px;color:var(--text-soft);">Yeniden başladığı gün</label>
          <input type="date" id="devam-tarih-${id}" value="${bugunStr()}" min="${son.bas}" max="${bugunStr()}" title="Yeniden başladığı gün" style="padding:7px;border-radius:8px;border:1px solid var(--border);font-family:inherit;">
          <button class="mini-btn ana" onclick="uzmanDevamEt('${id}')">▶ Yeniden başladık</button>
        </div>`;
    }
    h+=`<details class="duzenle-acilir"><summary>⚙ Düzenle</summary><div style="margin-top:8px;">`;
    if (!donmus) {
      h+=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <label for="donma-tarih-${id}" style="font-size:12px;color:var(--text-soft);">Dondurmanın başladığı gün</label>
          <input type="date" id="donma-tarih-${id}" value="${bugunStr()}" min="${[p.baslangic_tarihi, ...(p.donmalar||[]).map(d=>d.bit).filter(Boolean)].sort().pop()}" max="${bugunStr()}" title="Dondurmanın başladığı gün" style="padding:7px;border-radius:8px;border:1px solid var(--border);font-family:inherit;">
          <input id="donma-not-${id}" placeholder="Not (isteğe bağlı) örn. bebek ateşli" style="flex:1;min-width:160px;padding:8px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:12.5px;">
          <button class="mini-btn" onclick="uzmanDondur('${id}')">⏸ Paketi dondur</button>
        </div>`;
    }
    const gecmis=(p.donmalar||[]).filter(d=>d.bit);
    if (gecmis.length) h+=`<div style="font-size:11.5px;color:var(--text-soft);margin-top:8px;">Önceki donmalar: ${gecmis.map(d=>`${tarihKisa(d.bas)}–${tarihKisa(d.bit)} (${gunFarki(d.bas,d.bit)} gün)${d.not?' · '+d.not:''}`).join('; ')}</div>`;
    h+=`<details style="margin-top:10px;font-size:12px;"><summary style="cursor:pointer;color:var(--text-soft);">Başlangıç tarihini düzelt</summary>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;">
          <input type="date" id="baslangic-${id}" value="${p.baslangic_tarihi}" style="padding:6px;border-radius:8px;border:1px solid var(--border);font-family:inherit;">
          <button class="mini-btn" onclick="uzmanBaslat('${id}')">Kaydet</button>
        </div></details>`;
    h+=`</div></details>`;
  }
  h+=`</div>`;

  // Ek görüşme
  if (etkinPaket(p)) {
    const ekA=aktifEk(p), ekler=p.ekler||[];
    h+=`<div class="panel-kutu">
      ${ekA?`<div style="font-size:12.5px;margin-bottom:8px;">➕ <b>Ek dönem</b> · ${tarihKisa(ekA.bas)} – ${tarihKisa(ekBitis(ekA))}</div>`:''}
      <details class="ek-acilir"><summary class="mini-btn">➕ Ek görüşme ekle</summary>
      <div style="margin-top:10px;">
      <div style="font-size:11.5px;color:var(--text-soft);margin-bottom:8px;">Ödeme alındıktan sonra ekleyin. Ek dönemde takip günü yoktur; aile görüşme istediği gün günlüğünü 08.00–11.00 arasında iletir.</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="ek-bas-${id}" value="${bugunStr()}" style="padding:7px;border-radius:8px;border:1px solid var(--border);font-family:inherit;">
        <input id="ek-not-${id}" placeholder="Not örn. ödeme 24 Ekim, havale" style="flex:1;min-width:160px;padding:8px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:12.5px;">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        ${Object.entries(EK_PAKETLER).sort((x,y)=>y[0]-x[0]).map(([n,e])=>`<button class="mini-btn ana" onclick="uzmanEkEkle('${id}',${n})">➕ ${e.ad} · ${e.fiyat}</button>`).join('')}
      </div>
      ${ekler.length?`<div style="font-size:11.5px;color:var(--text-soft);margin-top:10px;">Eklenenler: ${ekler.map(e=>`${tarihKisa(e.bas)}–${tarihKisa(ekBitis(e))} · ${e.gorusme} görüşme${e.not?' · '+e.not:''}`).join('; ')}
        · <a href="#" onclick="event.preventDefault();uzmanEkGeriAl('${id}')" style="color:#C05050;">son eklemeyi geri al</a></div>`:''}
      </div></details>
    </div>`;
  }

  // Bilgilendirme
  const okundu=tsDate(p.bilgilendirme_okundu);
  h+=`<div style="font-size:12px;color:${okundu?'#4A7A56':'var(--text-soft)'};">${okundu?`✓ Bilgilendirmeyi okudu: ${okundu.toLocaleDateString('tr-TR',{day:'numeric',month:'long'})} ${saatStr(okundu)}`:'Bilgilendirme penceresini henüz onaylamadı.'}</div>`;
  h+=`</div>`;
  return h;
}

async function uzmanProfilGuncelle(id, veri, mesaj) {
  const a=uzmanAileler.find(x=>x.id===id); if(!a) return;
  try {
    await updateDoc(doc(db,'egitim_profilleri',id), veri);
    a.profil={...(a.profil||{}), ...veri};
    showToast(mesaj);
    uzmanShowDetail(id, false);
  } catch(e) { showToast('❌ Hata: '+e.message); }
}

function uzmanPaketKaydet(id) {
  const k=el('paket-sec-'+id)?.value;
  if (!PAKETLER[k]) { showToast('❌ Paket seçin.'); return; }
  const veri={paket:k};
  if (k==='diger') {
    veri.ozel_gorusme_hakki=Number(el('diger-gorusme-'+id)?.value)||null;
    veri.ozel_gun_sayisi=Number(el('diger-gun-'+id)?.value)||null;
  }
  uzmanProfilGuncelle(id, veri, '✓ Paket kaydedildi.');
}

function uzmanBaslat(id) {
  const t=el('baslangic-'+id)?.value;
  if (!t) { showToast('❌ Tarih seçin.'); return; }
  uzmanProfilGuncelle(id, {baslangic_tarihi:t}, '▶ Danışmanlık başlangıcı kaydedildi.');
}

function uzmanEkEkle(id, n) {
  const a=uzmanAileler.find(x=>x.id===id); const e=EK_PAKETLER[n]; if(!a||!e) return;
  const bas=el('ek-bas-'+id)?.value||bugunStr();
  const yeni={bas, gorusme:e.gorusme, gun:e.gun, not:(el('ek-not-'+id)?.value||'').trim()};
  const durumNotu=(a.durum||'aktif')!=='aktif' ? '\n\nAile yeniden "Aktif" sekmesine taşınacak.' : '';
  if (!confirm(`${a.bebekAd} için ek ${e.ad} eklensin mi?\n\n${tarihKisa(bas)} – ${tarihKisa(ekBitis(yeni))} · ${e.fiyat}\nÖdemenin alındığından emin olun.${durumNotu}`)) return;
  const veri={ekler:[...(a.profil?.ekler||[]), yeni]};
  if ((a.durum||'aktif')!=='aktif') { veri.durum='aktif'; a.durum='aktif'; }
  uzmanProfilGuncelle(id, veri, '➕ Ek görüşme eklendi.');
}

function uzmanEkGeriAl(id) {
  const a=uzmanAileler.find(x=>x.id===id); const ekler=[...(a?.profil?.ekler||[])]; if(!ekler.length) return;
  const son=ekler[ekler.length-1];
  if (!confirm(`Son eklenen ek görüşme (${tarihKisa(son.bas)}, ${son.gorusme} görüşme) geri alınsın mı?`)) return;
  ekler.pop();
  uzmanProfilGuncelle(id, {ekler}, 'Son ek görüşme geri alındı.');
}

function uzmanDondur(id) {
  const a=uzmanAileler.find(x=>x.id===id); if(!a) return;
  const p=a.profil||{}, bugun=bugunStr();
  const bas=el('donma-tarih-'+id)?.value||bugun;
  const enErken=[p.baslangic_tarihi, ...(p.donmalar||[]).map(d=>d.bit).filter(Boolean)].sort().pop()||'';
  if (bas>bugun) { showToast('❌ İleri bir tarih seçilemez.'); return; }
  if (enErken && bas<enErken) { showToast('❌ Tarih, danışmanlık başlangıcından ya da önceki donmanın bitişinden önce olamaz.'); return; }
  const not=(el('donma-not-'+id)?.value||'').trim();
  if (bas!==bugun && !confirm(`Paket ${tarihKisa(bas)} tarihinden itibaren dondurulmuş olarak kaydedilsin mi?`)) return;
  const donmalar=[...(p.donmalar||[]), {bas, bit:null, not}];
  uzmanProfilGuncelle(id, {donmalar}, '⏸ Paket donduruldu.');
}

function uzmanDevamEt(id) {
  const a=uzmanAileler.find(x=>x.id===id); if(!a) return;
  const donmalar=(a.profil?.donmalar||[]).map(d=>({...d}));
  if (!donmalar.length) return;
  const son=donmalar[donmalar.length-1], bugun=bugunStr();
  const bit=el('devam-tarih-'+id)?.value||bugun; // Bugün ekranından basılırsa bugün
  if (bit>bugun || bit<son.bas) { showToast('❌ Tarih, donmanın başladığı gün ile bugün arasında olmalı.'); return; }
  son.bit=bit;
  uzmanProfilGuncelle(id, {donmalar}, '▶ Danışmanlık yeniden başladı.');
}

// ============================================================
// BAŞLANGIÇ
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const pp=portalPaketi();
  if (pp && el('reg-paket')) { el('reg-paket').value=pp; show('reg-paket-not'); }
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
window.raporOlustur=raporOlustur; window.raporGeriDon=raporGeriDon;
window.addGunduzUyku=addGunduzUyku; window.removeGunduzUyku=removeGunduzUyku;
window.calcGunduz=calcGunduz; window.calcGece=calcGece; window.calcUyanikSureler=calcUyanikSureler;
window.addUyanma=addUyanma; window.formatSaatInput=formatSaatInput; window.saatInput=saatInput;
window.uzmanLoadAileler=uzmanLoadAileler; window.uzmanShowDetail=uzmanShowDetail;
window.uzmanSwitchDay=uzmanSwitchDay; window.uzmanBackToList=uzmanBackToList;
window.searchAileler=searchAileler; window.aileSil=aileSil; window.el=el;
window.uzmanNotDuzenle=uzmanNotDuzenle; window.uzmanNotKaydet=uzmanNotKaydet;
window.uzmanDuzenleAc=uzmanDuzenleAc; window.uzmanProfiliKaydet=uzmanProfiliKaydet;
window.addRuya=addRuya; window.uzmanArandiToggle=uzmanArandiToggle;
window.switchArsivTab=switchArsivTab; window.durumMenuToggle=durumMenuToggle; window.durumDegistir=durumDegistir; window.sifremiUnuttum=sifremiUnuttum; window.kacanUyariKapat=kacanUyariKapat; window.uzmanEkEkle=uzmanEkEkle; window.uzmanEkGeriAl=uzmanEkGeriAl;
window.paketSeciminiKaydet=paketSeciminiKaydet; window.gecmisTumunuGoster=gecmisTumunuGoster; window.bilgilendirmeOkundu=bilgilendirmeOkundu;
window.uzmanPaketKaydet=uzmanPaketKaydet; window.uzmanBaslat=uzmanBaslat; window.uzmanDondur=uzmanDondur; window.uzmanDevamEt=uzmanDevamEt;
