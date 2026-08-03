"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bell,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Crown,
  FileDown,
  Gauge,
  LayoutDashboard,
  LineChart,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Smartphone,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { RiskAssessmentAnswers } from "@/lib/membership-engine";
import type { UserMembershipCenter } from "@/lib/membership-store";

const QUESTIONNAIRE = [
  {
    id: "volatilityComfort",
    title: "Kasa değerindeki dalgalanmaya yaklaşımın?",
    options: [
      ["low", "Düşük dalgalanma", "Küçük, sınırlı ve seyrek risk"],
      ["medium", "Orta dalgalanma", "Önceden belirlenmiş limitler içinde"],
      ["high", "Yüksek dalgalanma", "Daha geniş sonuç aralığını kabul ederim"],
    ],
  },
  {
    id: "selectionStyle",
    title: "Hangi seçim yapısı sana daha yakın?",
    options: [
      ["single", "Tekli", "Her kararı ayrı değerlendiririm"],
      ["balanced_coupon", "3 maç dengeli", "Korelasyon kontrolüyle sınırlı kupon"],
      ["high_odds_coupon", "4–6 maç yüksek oran", "Daha düşük gerçekleşme olasılığı"],
    ],
  },
  {
    id: "stakeMethod",
    title: "Bahis miktarını nasıl sınırlarsın?",
    options: [
      ["fixed_low", "Sabit küçük birim", "Kasanın çok küçük sabit yüzdesi"],
      ["quarter_kelly", "Çeyrek-Kelly", "Edge ve sert profil tavanı birlikte"],
      ["variable_high", "Değişken yüksek tutar", "Güçlü hissettiğim seçimde limiti büyütürüm"],
    ],
  },
  {
    id: "losingStreakResponse",
    title: "Kayıp serisinde ilk tepkin ne olur?",
    options: [
      ["pause_and_review", "Durup incelerim", "Yeni seçimden önce süreci gözden geçiririm"],
      ["keep_limits", "Limiti korurum", "Önceden belirlenen planı değiştirmem"],
      ["increase_stake", "Tutarı artırırım", "Kaybı daha hızlı geri almaya çalışırım"],
    ],
  },
  {
    id: "primaryGoal",
    title: "Birincil kullanım hedefin?",
    options: [
      ["preserve_bankroll", "Kasayı korumak", "Önce açık riski sınırlamak"],
      ["balanced_process", "Disiplinli süreç", "Karar kalitesini uzun vadede izlemek"],
      ["maximize_return", "Getiriyi büyütmek", "Daha geniş risk aralığını kabul etmek"],
    ],
  },
] as const;

export function MembershipCenter({ initialCenter, signOutPath }: { initialCenter: UserMembershipCenter; signOutPath: string }) {
  const [center, setCenter] = useState(initialCenter);
  const [answers, setAnswers] = useState<Partial<RiskAssessmentAnswers>>({});
  const [locale, setLocale] = useState<"tr" | "en">(center.profile.locale);
  const [countryCode, setCountryCode] = useState(center.profile.countryCode ?? "TR");
  const [timezone, setTimezone] = useState(center.preferences.timezone);
  const [view, setView] = useState<"quick" | "detailed">(center.preferences.defaultAnalysisView);
  const [age, setAge] = useState(false);
  const [responsible, setResponsible] = useState(false);
  const [disposable, setDisposable] = useState(false);
  const [terms, setTerms] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const questionnaireComplete = useMemo(() => QUESTIONNAIRE.every((question) => answers[question.id]), [answers]);
  const submitOnboarding = async () => {
    if (!questionnaireComplete || !age || !responsible || !disposable || !terms) {
      setError("Tüm soruları ve zorunlu güvenlik onaylarını tamamlayın.");
      return;
    }
    await run("onboarding", {
      action: "complete_onboarding",
      onboarding: {
        locale,
        countryCode,
        timezone,
        defaultAnalysisView: view,
        ageConfirmed: age,
        responsibleUseConfirmed: responsible,
        disposableFundsOnly: disposable,
        termsAccepted: terms,
        answers,
      },
    }, "Onboarding tamamlandı ve risk profili kaydedildi.");
  };
  const startTrial = async () => run("trial", { action: "start_trial" }, "72 saatlik kartsız Pro denemesi başladı.");
  const run = async (key: string, body: Record<string, unknown>, success: string) => {
    setWorking(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dashboard/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { result?: UserMembershipCenter; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Üyelik işlemi tamamlanamadı.");
      setCenter(payload.result);
      setNotice(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Üyelik işlemi tamamlanamadı.");
    } finally {
      setWorking(null);
    }
  };

  const membership = center.membership;
  return (
    <main className="user-shell membership-shell">
      <aside className={`user-sidebar ${menuOpen ? "open" : ""}`}>
        <a className="user-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><CircleGauge size={18} />Panel merkezi</a>
          <a href="/dashboard"><LayoutDashboard size={18} />Genel bakış</a>
          <a href="/dashboard#matches"><Bookmark size={18} />Maç analizleri</a>
          <a href="/dashboard/performance"><LineChart size={18} />Performans geçmişi</a>
          <a href="/dashboard/bankroll"><WalletCards size={18} />Kasa ve kupon</a>
          <a href="/dashboard/notifications"><Bell size={18} />Bildirimler</a>
          <a className="active" href="/dashboard/membership"><BadgeCheck size={18} />Üyelik ve profil</a>
        </nav>
        <section className="user-plan-card"><Sparkles size={17} /><div><small>ETKİN PAKET</small><b>{membership.effectivePlan.toUpperCase()}</b><p>{accessText(membership.accessStatus, membership.isInternalTester)}</p></div></section>
        <a className="user-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="user-main">
        <header className="user-topbar"><div><button className="user-menu-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menüyü aç"><Menu size={18} /></button><a href="/dashboard"><ArrowLeft size={14} />Dashboard</a><span>MEMBERSHIP · PHASE 06 · CP15</span></div><div className="user-top-actions"><span>{initials(center.profile.displayName)}</span></div></header>
        <section className="membership-heading"><div><small>ACCESS · RISK · ENTITLEMENTS</small><h1>{center.profile.onboardingStatus === "completed" ? "Üyelik kontrol merkezi." : "Kısa profil testini tamamla."}</h1><p>Risk profili model olasılığını değiştirmez. Yalnız seçim görünümü, kupon erişimi ve çeyrek-Kelly üst limitlerini sınırlar.</p></div><span className={`membership-access ${membership.accessStatus}`}><i />{accessLabel(membership.accessStatus, membership.isInternalTester)}</span></section>
        {error && <div className="user-message error"><ShieldAlert size={16} />{error}</div>}
        {notice && <div className="user-message"><CheckCircle2 size={16} />{notice}</div>}

        {center.profile.onboardingStatus !== "completed" ? <OnboardingForm
          answers={answers}
          setAnswers={setAnswers}
          locale={locale}
          setLocale={setLocale}
          countryCode={countryCode}
          setCountryCode={setCountryCode}
          timezone={timezone}
          setTimezone={setTimezone}
          view={view}
          setView={setView}
          checks={{ age, responsible, disposable, terms }}
          setters={{ setAge, setResponsible, setDisposable, setTerms }}
          complete={questionnaireComplete}
          working={working === "onboarding"}
          onSubmit={() => void submitOnboarding()}
        /> : <MembershipOverview center={center} working={working} onStartTrial={() => void startTrial()} />}

        <footer className="user-footer"><span>FormEdge membership policy · {center.policy.membershipPolicyVersion}</span><a href="/dashboard">Dashboard<ChevronRight size={13} /></a></footer>
      </section>
      <nav className="user-mobile-nav"><a href="/dashboard"><LayoutDashboard size={19} /><span>Ana sayfa</span></a><a href="/dashboard/performance"><LineChart size={19} /><span>Geçmiş</span></a><a href="/dashboard/bankroll"><WalletCards size={19} /><span>Kasa</span></a><a href="/dashboard/notifications"><Bell size={19} /><span>Bildirim</span></a><a className="active" href="/dashboard/membership"><BadgeCheck size={19} /><span>Üyelik</span></a></nav>
    </main>
  );
}

function OnboardingForm(props: {
  answers: Partial<RiskAssessmentAnswers>;
  setAnswers: React.Dispatch<React.SetStateAction<Partial<RiskAssessmentAnswers>>>;
  locale: "tr" | "en";
  setLocale: (value: "tr" | "en") => void;
  countryCode: string;
  setCountryCode: (value: string) => void;
  timezone: string;
  setTimezone: (value: string) => void;
  view: "quick" | "detailed";
  setView: (value: "quick" | "detailed") => void;
  checks: { age: boolean; responsible: boolean; disposable: boolean; terms: boolean };
  setters: { setAge: (value: boolean) => void; setResponsible: (value: boolean) => void; setDisposable: (value: boolean) => void; setTerms: (value: boolean) => void };
  complete: boolean;
  working: boolean;
  onSubmit: () => void;
}) {
  return <section className="onboarding-layout">
    <section className="onboarding-card">
      <header><div><small>01 · RİSK PROFİLİ</small><h2>Beş kısa karar sorusu</h2></div><Gauge size={20} /></header>
      <div className="onboarding-questions">{QUESTIONNAIRE.map((question, index) => <fieldset key={question.id}><legend><span>{String(index + 1).padStart(2, "0")}</span>{question.title}</legend><div>{question.options.map(([value, label, note]) => <label className={props.answers[question.id] === value ? "selected" : ""} key={value}><input type="radio" name={question.id} value={value} checked={props.answers[question.id] === value} onChange={() => props.setAnswers((current) => ({ ...current, [question.id]: value }))} /><span><b>{label}</b><small>{note}</small></span><i><Check size={13} /></i></label>)}</div></fieldset>)}</div>
    </section>
    <aside className="onboarding-side">
      <section><header><small>02 · HESAP AYARI</small><UserRoundCheck size={18} /></header><label><span>Dil</span><select value={props.locale} onChange={(event) => props.setLocale(event.target.value as "tr" | "en")}><option value="tr">Türkçe</option><option value="en">English</option></select></label><label><span>Ülke</span><select value={props.countryCode} onChange={(event) => props.setCountryCode(event.target.value)}><option value="TR">Türkiye</option><option value="GB">United Kingdom</option><option value="DE">Germany</option><option value="ES">Spain</option><option value="IT">Italy</option><option value="FR">France</option><option value="NL">Netherlands</option><option value="PT">Portugal</option><option value="US">United States</option><option value="BR">Brazil</option><option value="AR">Argentina</option><option value="JP">Japan</option></select></label><label><span>Saat dilimi</span><select value={props.timezone} onChange={(event) => props.setTimezone(event.target.value)}><option value="Europe/Istanbul">Europe/Istanbul</option><option value="Europe/London">Europe/London</option><option value="Europe/Berlin">Europe/Berlin</option><option value="America/New_York">America/New_York</option><option value="America/Sao_Paulo">America/Sao_Paulo</option><option value="Asia/Tokyo">Asia/Tokyo</option></select></label><label><span>Varsayılan analiz</span><select value={props.view} onChange={(event) => props.setView(event.target.value as "quick" | "detailed")}><option value="quick">Hızlı görünüm</option><option value="detailed">Detaylı görünüm</option></select></label></section>
      <section className="onboarding-consent"><header><small>03 · GÜVENLİK ONAYI</small><ShieldCheck size={18} /></header><CheckRow checked={props.checks.age} onChange={props.setters.setAge} text="18 yaş veya üzerindeyim." /><CheckRow checked={props.checks.responsible} onChange={props.setters.setResponsible} text="Garanti kazanç olmadığını ve sistemin bahis oynatmadığını anlıyorum." /><CheckRow checked={props.checks.disposable} onChange={props.setters.setDisposable} text="Yalnız kaybetmeyi göze alabileceğim bütçeyi kullanacağım." /><CheckRow checked={props.checks.terms} onChange={props.setters.setTerms} text="Beta kullanım ve veri koşullarını kabul ediyorum." /><footer><AlertTriangle size={14} />Kayıp kovalamayı veya sınırsız tutarı seçmek, profili otomatik olarak Temkinli limite çeker.</footer></section>
      <button className="onboarding-submit" type="button" disabled={!props.complete || !Object.values(props.checks).every(Boolean) || props.working} onClick={props.onSubmit}>{props.working ? <LoaderCircle className="spin" size={17} /> : <BadgeCheck size={17} />}Profili tamamla<ChevronRight size={16} /></button>
    </aside>
  </section>;
}

function MembershipOverview({ center, working, onStartTrial }: { center: UserMembershipCenter; working: string | null; onStartTrial: () => void }) {
  const membership = center.membership;
  const plans = (["free", "pro", "expert"] as const).map((plan) => ({ plan, entitlements: center.plans[plan] }));
  return <>
    {center.latestAssessment?.safetyOverride && <section className="membership-safety-banner"><AlertTriangle size={18} /><div><b>Güvenlik limiti uygulandı.</b><p>Kayıp kovalama veya sınırsız tutar yanıtı nedeniyle profil Temkinli olarak sabitlendi. Bu sonuç olasılıkları değiştirmez.</p></div><span>{center.latestAssessment.safetyFlags.join(" · ")}</span></section>}
    <section className="membership-kpis">
      <article><span><Crown size={18} /></span><small>ETKİN PAKET</small><b>{membership.effectivePlan.toUpperCase()}</b><p>Kaydedilen: {membership.storedPlan}</p></article>
      <article><span><Gauge size={18} /></span><small>RİSK PROFİLİ</small><b>{riskLabel(center.profile.riskProfile)}</b><p>Model olasılığına etkisi yok</p></article>
      <article><span><Clock3 size={18} /></span><small>PRO DENEMESİ</small><b>{trialLabel(membership.trial.state)}</b><p>{membership.trial.state === "active" ? `${Math.ceil(membership.trial.remainingSeconds / 3600)} saat kaldı` : "Tek kullanım · 72 saat"}</p></article>
      <article><span><ShieldCheck size={18} /></span><small>BETA ERİŞİMİ</small><b>{accessLabel(membership.accessStatus, membership.isInternalTester)}</b><p>100–300 kullanıcı kapasitesi</p></article>
    </section>
    <section className="membership-grid">
      <section className="membership-plan-table"><header><div><small>ENTITLEMENT MATRIX</small><h2>Paket sınırları</h2></div><LockKeyhole size={18} /></header><div>{plans.map(({ plan, entitlements }) => <article className={membership.effectivePlan === plan ? "current" : ""} key={plan}><header><span>{plan[0].toUpperCase()}</span><div><b>{plan.toUpperCase()}</b><small>{membership.effectivePlan === plan ? "ETKİN" : "PAKET"}</small></div></header><ul><li><CheckCircle2 size={13} />{entitlements.dailyAnalysisLimit === null ? "Sınırsız analiz" : `Günde ${entitlements.dailyAnalysisLimit} analiz`}</li><li><CheckCircle2 size={13} />{entitlements.historyDays === null ? "Tüm performans geçmişi" : `${entitlements.historyDays} günlük geçmiş`}</li><li className={entitlements.detailedAnalysis ? "" : "off"}><CheckCircle2 size={13} />Detaylı analiz</li><li className={entitlements.couponTiers.length ? "" : "off"}><CheckCircle2 size={13} />{entitlements.couponTiers.includes("high_odds") ? "Tüm kupon tipleri" : entitlements.couponTiers.includes("balanced") ? "Dengeli kupon" : "Kupon kapalı"}</li><li className={entitlements.exportFormats.length ? "" : "off"}><FileDown size={13} />{entitlements.exportFormats.length ? entitlements.exportFormats.join(" · ").toUpperCase() : "Export kapalı"}</li></ul></article>)}</div></section>
      <aside className="membership-actions-card"><small>BETA DURUMU</small><h2>{membership.trial.state === "eligible" ? "Pro’yu üç gün dene." : membership.trial.state === "active" ? "Pro denemen aktif." : "Erişim kontrollü."}</h2><p>{membership.trial.state === "eligible" ? "Kart bilgisi alınmaz. Süre dolunca hesap otomatik Free beta sınırına döner; ücret doğmaz." : membership.trial.state === "active" ? `Deneme ${formatDate(membership.trial.endsAt!)} tarihinde biter. Otomatik ücretlendirme yoktur.` : accessText(membership.accessStatus, membership.isInternalTester)}</p>{membership.trial.state === "eligible" && <button type="button" onClick={onStartTrial} disabled={working !== null}>{working === "trial" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}Kartsız denemeyi başlat</button>}<div className="membership-identity"><Smartphone size={17} /><div><b>Kimlik sağlayıcısı kapısı</b><p>Özel beta şu an ChatGPT oturumuyla korunur. Google, Apple ve e-posta girişi public provider seçimi sonrası açılır.</p></div></div></aside>
    </section>
    <section className="membership-events"><header><div><small>APPEND-ONLY MEMBERSHIP LOG</small><h2>Üyelik olayları</h2></div><BadgeCheck size={18} /></header>{center.events.length ? <div>{center.events.map((event) => <article key={event.id}><span><i /></span><div><b>{eventLabel(event.eventType)}</b><small>{event.reasonCode}</small></div><p>{event.fromPlan ?? "—"} → {event.toPlan ?? "—"}</p><time>{formatDate(event.occurredAt)}</time></article>)}</div> : <div className="user-empty-state compact"><Clock3 size={20} /><b>İlk üyelik olayı bekleniyor.</b></div>}</section>
  </>;
}

function CheckRow({ checked, onChange, text }: { checked: boolean; onChange: (value: boolean) => void; text: string }) {
  return <label className="onboarding-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i><Check size={12} /></i><span>{text}</span></label>;
}

function accessLabel(value: UserMembershipCenter["membership"]["accessStatus"], internal: boolean) { return internal ? "İç test" : value === "active" ? "Aktif" : value === "invited" ? "Davetli" : value === "suspended" ? "Askıda" : "Bekliyor"; }
function accessText(value: UserMembershipCenter["membership"]["accessStatus"], internal: boolean) { return internal ? "Yönetici/analiz editörü için iç test erişimi." : value === "active" ? "Davetli beta erişimi açık." : value === "invited" ? "Davet kabulü ve onboarding bekleniyor." : value === "suspended" ? "Ürün erişimi güvenlik nedeniyle askıda." : "Bekleme listesi daveti henüz gönderilmedi."; }
function riskLabel(value: string | null) { return value === "cautious" ? "Temkinli" : value === "balanced" ? "Dengeli" : value === "bold" ? "Atak" : "Bekliyor"; }
function trialLabel(value: UserMembershipCenter["membership"]["trial"]["state"]) { return value === "eligible" ? "Uygun" : value === "active" ? "Aktif" : value === "expired" ? "Sona erdi" : value === "used" ? "Kullanıldı" : "Kapalı"; }
function eventLabel(value: UserMembershipCenter["events"][number]["eventType"]) { return value === "onboarding_completed" ? "Onboarding tamamlandı" : value === "trial_started" ? "Pro denemesi başladı" : value === "trial_expired" ? "Pro denemesi bitti" : value === "access_changed" ? "Erişim değişti" : "Paket değişti"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function initials(value: string) { return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE"; }
