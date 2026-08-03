/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links use plain anchors for the hosted auth handoff. */
import {
  Apple,
  ArrowLeft,
  ArrowRight,
  AtSign,
  BadgeCheck,
  CheckCircle2,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export function AuthEntry({
  mode,
  authHref,
  returnTo,
}: {
  mode: "sign-in" | "sign-up";
  authHref: string;
  returnTo: string;
}) {
  const signingUp = mode === "sign-up";
  return (
    <main className="access-auth-shell">
      <a className="access-auth-brand" href="/"><span>F</span><b>FORMEDGE</b></a>
      <section className="access-auth-layout">
        <section className="access-auth-story">
          <span className="access-auth-eyebrow"><i />ONE ACCOUNT · TWO CONTROL PLANES</span>
          <h1>{signingUp ? "Hesabını oluştur. Bütün ürün alanlarını tek yerden yönet." : "Tek girişle bütün FormEdge panellerine ulaş."}</h1>
          <p>{signingUp
            ? "İlk güvenli giriş D1 üzerinde kalıcı ürün profilini oluşturur. Bekleme listesi, onboarding, üyelik ve kişisel analiz geçmişi aynı kimliğe bağlanır."
            : "Kullanıcı dashboardı, üyelik, performans ve yetkin varsa tüm yönetim panelleri aynı doğrulanmış kimlikle açılır."}</p>
          <div className="access-auth-proof">
            <article><ShieldCheck size={18} /><div><b>Sunucu tarafı kimlik</b><small>Yetki yalnız arayüzde saklanmaz.</small></div></article>
            <article><BadgeCheck size={18} /><div><b>Kalıcı hesap</b><small>Profil ve tercihler D1’de tutulur.</small></div></article>
            <article><LockKeyhole size={18} /><div><b>Rol ayrımı</b><small>Kullanıcı ve admin alanları ayrı korunur.</small></div></article>
          </div>
          <footer><CheckCircle2 size={15} />Giriş bahis hesabı açmaz, ödeme almaz ve haricî bahis şirketine veri göndermez.</footer>
        </section>

        <section className="access-auth-card">
          <nav aria-label="Hesap işlemleri">
            <a className={!signingUp ? "active" : ""} href={`/auth/sign-in?next=${encodeURIComponent(returnTo)}`}>Giriş yap</a>
            <a className={signingUp ? "active" : ""} href="/auth/sign-up">Kayıt ol</a>
          </nav>
          <header><span><Sparkles size={19} /></span><div><small>{signingUp ? "CREATE FORMEDGE ACCOUNT" : "WELCOME BACK"}</small><h2>{signingUp ? "Ücretsiz beta hesabı" : "Hesabına devam et"}</h2></div></header>
          <p>{signingUp ? "İlk girişte profil otomatik oluşturulur; kart veya ödeme bilgisi istenmez." : "ChatGPT kimliğin doğrulandıktan sonra erişim rolün otomatik belirlenir."}</p>
          <a className="access-auth-primary" href={authHref}><ShieldCheck size={18} />{signingUp ? "ChatGPT ile hesap oluştur" : "ChatGPT ile güvenli giriş"}<ArrowRight size={16} /></a>
          <div className="access-auth-divider"><span>PUBLIC LANSMAN SAĞLAYICILARI</span></div>
          <div className="access-provider-grid" aria-label="Planlanan giriş yöntemleri">
            <button type="button" disabled><Globe2 size={17} /><span><b>Google</b><small>Lansmanda</small></span></button>
            <button type="button" disabled><Apple size={17} /><span><b>Apple</b><small>Lansmanda</small></span></button>
            <button type="button" disabled><AtSign size={17} /><span><b>E-posta</b><small>Lansmanda</small></span></button>
          </div>
          <div className="access-auth-note"><LockKeyhole size={14} /><p>Şu an çalışan kimlik yolu ChatGPT Sign-in’dir. Hazır olmayan seçenekler giriş yapıyormuş gibi gösterilmez.</p></div>
          <footer>
            <a href="/"><ArrowLeft size={14} />Ana site</a>
            {signingUp ? <a href="/join">Beta bekleme listesi</a> : <a href="/auth/sign-up">Yeni hesap oluştur</a>}
          </footer>
        </section>
      </section>
    </main>
  );
}
