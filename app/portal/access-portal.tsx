/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links use plain anchors in this server-rendered hub. */
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BadgeDollarSign,
  BarChart3,
  BellRing,
  BookOpenCheck,
  CheckCircle2,
  CloudSun,
  Database,
  DatabaseZap,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  LineChart,
  ListChecks,
  LockKeyhole,
  LogOut,
  Radar,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { AccessPortalOverview } from "@/lib/access-portal-store";

const USER_SURFACES = [
  { href: "/dashboard", label: "Kullanıcı dashboardı", note: "Maç analizleri, izleme ve karar ekranı", icon: LayoutDashboard },
  { href: "/dashboard/membership", label: "Üyelik ve profil", note: "Onboarding, risk profili ve paket hakları", icon: BadgeCheck },
  { href: "/dashboard/performance", label: "Performans geçmişi", note: "Kazanan, kaybeden ve geri çekilen kayıtlar", icon: LineChart },
  { href: "/dashboard/bankroll", label: "Kasa ve kupon", note: "Takip defteri ve korelasyon kontrollü kupon", icon: WalletCards },
  { href: "/dashboard/notifications", label: "Bildirim merkezi", note: "Web içi, browser push ve Telegram durumu", icon: BellRing },
] as const;

const ADMIN_SURFACES = [
  { href: "/admin", label: "Veri konsolu", note: "Kaynaklar, importlar ve veri sağlığı", icon: Database },
  { href: "/admin/research-feed", label: "Research Feed", note: "Gerçek CSV çekimi ve ham kaynak arşivi", icon: DatabaseZap },
  { href: "/admin/data-lineage", label: "Data Lineage", note: "Kaynaktan yayın kararına değişmez kanıt zinciri", icon: GitBranch },
  { href: "/admin/model-lab", label: "Model Lab", note: "Dataset, benchmark ve kanıt matrisi", icon: FlaskConical },
  { href: "/admin/shadow-validation", label: "Shadow Validation", note: "Gerçek veri kuyruğu, backtest ve zamansal drift", icon: Radar },
  { href: "/admin/predictions", label: "Prediction Ops", note: "İzleme, final ve geri çekme yaşam döngüsü", icon: ListChecks },
  { href: "/admin/value-ops", label: "Value Ops", note: "Oran uzlaşısı, edge ve anomali kapısı", icon: BadgeDollarSign },
  { href: "/admin/context-ops", label: "Context Ops", note: "Kadro, hava, seyahat ve bağlam kanıtı", icon: CloudSun },
  { href: "/admin/notification-ops", label: "Notification Ops", note: "Outbox, teslim ve kanal sağlığı", icon: BellRing },
  { href: "/admin/member-ops", label: "Member Ops", note: "Waitlist, davet, kapasite ve beta erişimi", icon: UsersRound },
] as const;

export function AccessPortal({ overview, signOutPath }: { overview: AccessPortalOverview; signOutPath: string }) {
  const firstName = overview.identity.displayName.split(/\s+|@/)[0] || "Üye";
  const onboardingDone = overview.profile.onboardingStatus === "completed";
  return (
    <main className="access-portal-shell">
      <aside className="access-portal-sidebar">
        <a className="access-portal-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a className="active" href="#overview"><LayoutDashboard size={17} />Panel merkezi</a>
          <a href="#member"><UserRound size={17} />Kullanıcı alanı</a>
          {overview.admin.authorized && <a href="#admin"><ShieldCheck size={17} />Yönetim alanı</a>}
          <a href="/dashboard/membership"><BadgeCheck size={17} />Hesap ve üyelik</a>
        </nav>
        <section><LockKeyhole size={17} /><div><small>KİMLİK SAĞLAYICISI</small><b>ChatGPT Sign-in</b><p>Oturum, ürün profili ve yönetim rolü sunucuda eşleştirildi.</p></div></section>
        <a className="access-portal-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="access-portal-main">
        <header className="access-portal-topbar"><div><small>FORMEDGE ACCESS CONTROL</small><span>Tek kimlik · rol bazlı yönlendirme</span></div><div><span>{initials(overview.identity.displayName)}</span><p><b>{overview.identity.displayName}</b><small>{overview.admin.authorized ? `${overview.admin.role} · internal tester` : overview.membership.effectivePlan}</small></p></div></header>

        <section className="access-portal-hero" id="overview">
          <div><small>HOŞ GELDİN, {firstName.toLocaleUpperCase("tr-TR")}</small><h1>Bütün FormEdge alanları artık tek kapıda.</h1><p>Kullanıcı hesabın hazır. Yetkine göre açılan her gerçek dashboard ve operasyon paneline aşağıdan doğrudan girebilirsin.</p><div><a href="/dashboard">Dashboarda gir<ArrowRight size={16} /></a>{overview.admin.authorized && <a className="secondary" href="/admin/research-feed">Veri çekimini aç<DatabaseZap size={16} /></a>}</div></div>
          <section><span><CheckCircle2 size={22} /></span><small>ERİŞİM DURUMU</small><b>{overview.admin.authorized ? "Owner + Expert test erişimi" : "Ürün hesabı aktif"}</b><p>{overview.admin.configuredOwner ? "Platform sahibi admin rolüyle otomatik eşlendi." : "Kullanıcı rolü üyelik kurallarına göre uygulanıyor."}</p></section>
        </section>

        {!onboardingDone && <section className="access-onboarding-banner"><BookOpenCheck size={19} /><div><b>Profil testi henüz tamamlanmadı.</b><p>Bu durum admin erişimini engellemez; kullanıcı deneyimi, risk profili ve görünüm tercihi için onboarding’i tamamla.</p></div><a href="/dashboard/membership">Onboarding’i aç<ArrowRight size={14} /></a></section>}

        <section className="access-status-grid">
          <article><span><UserRound size={17} /></span><small>ÜRÜN HESABI</small><b>Hazır</b><p>{overview.identity.email}</p></article>
          <article><span><BadgeCheck size={17} /></span><small>ÜYELİK</small><b>{overview.membership.effectivePlan.toUpperCase()}</b><p>{overview.membership.productAccess ? "Ürün erişimi açık" : "Davet/onboarding bekliyor"}</p></article>
          <article><span><ShieldCheck size={17} /></span><small>YÖNETİM ROLÜ</small><b>{overview.admin.role?.toUpperCase() ?? "YOK"}</b><p>{overview.admin.authorized ? "Admin API’leri açık" : "Kullanıcı alanıyla sınırlı"}</p></article>
          <article><span><Activity size={17} /></span><small>ONBOARDING</small><b>{onboardingDone ? "TAMAM" : "BEKLİYOR"}</b><p>{overview.profile.riskProfile ?? "Risk profili seçilmedi"}</p></article>
        </section>

        <section className="access-surface-section" id="member">
          <header><div><small>MEMBER SPACE</small><h2>Kullanıcı dashboardları</h2></div><span>{USER_SURFACES.length} canlı alan</span></header>
          <div className="access-surface-grid">{USER_SURFACES.map(({ href, label, note, icon: Icon }) => <a href={href} key={href}><span><Icon size={19} /></span><div><b>{label}</b><p>{note}</p></div><ArrowRight size={15} /></a>)}</div>
        </section>

        <section className="access-surface-section admin-surfaces" id="admin">
          <header><div><small>CONTROL PLANE</small><h2>Yönetim ve analiz panelleri</h2></div><span>{overview.admin.authorized ? `${ADMIN_SURFACES.length} yetkili alan` : "Yetki gerekli"}</span></header>
          {overview.admin.authorized ? <div className="access-surface-grid">{ADMIN_SURFACES.map(({ href, label, note, icon: Icon }) => <a href={href} key={href}><span><Icon size={19} /></span><div><b>{label}</b><p>{note}</p></div><ArrowRight size={15} /></a>)}</div> : <div className="access-admin-locked"><LockKeyhole size={20} /><div><b>Bu hesapta yönetim rolü yok.</b><p>Yönetim rotaları yalnız aktif admin veya analiz editörüne sunulur.</p></div></div>}
        </section>

        <section className="access-truth-card"><BarChart3 size={19} /><div><b>Gerçek veri ile örnek arayüz ayrımı</b><p>Landing sayfasındaki maçlar yalnız ürün önizlemesidir. Bu merkezden açılan dashboardlar D1’deki gerçek hesap, veri, model ve yayın kayıtlarını kullanır; boş durumlar sahte içerikle doldurulmaz.</p></div></section>
        <footer className="access-portal-footer"><span>FormEdge unified access · CP17C</span><a href="/">Ana site<ArrowRight size={13} /></a></footer>
      </section>
    </main>
  );
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
