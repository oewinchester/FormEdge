"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import { useState } from "react";
import {
  BadgeDollarSign,
  BadgeCheck,
  Banknote,
  Bell,
  Bookmark,
  CheckCircle2,
  CircleGauge,
  Layers3,
  LayoutDashboard,
  LineChart,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import type { UserBankrollWorkspace } from "@/lib/bankroll-store";

export function BankrollWorkspace({
  initialWorkspace,
  signOutPath,
}: {
  initialWorkspace: UserBankrollWorkspace;
  signOutPath: string;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(initialWorkspace.account.currency);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = async () => {
    setWorking("refresh");
    setError(null);
    try {
      const response = await fetch("/api/dashboard/bankroll", { headers: { Accept: "application/json" } });
      const payload = await response.json() as UserBankrollWorkspace & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Kasa alanı yenilenemedi.");
      setWorkspace(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kasa alanı yenilenemedi.");
    } finally {
      setWorking(null);
    }
  };

  const movement = async (entryType: "opening" | "deposit" | "withdrawal") => {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Tutar sıfırdan büyük olmalıdır.");
      return;
    }
    setWorking(entryType);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dashboard/bankroll", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "movement",
          movement: {
            entryType,
            amount: numeric,
            currency,
            idempotencyKey: crypto.randomUUID(),
            note: entryType === "opening" ? "Beta açılış bakiyesi" : "Kullanıcı kasa kaydı",
          },
        }),
      });
      const payload = await response.json() as { result?: { workspace: UserBankrollWorkspace }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Kasa hareketi kaydedilemedi.");
      setWorkspace(payload.result.workspace);
      setCurrency(payload.result.workspace.account.currency);
      setAmount("");
      setNotice("Kasa hareketi değişmez deftere kaydedildi.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kasa hareketi kaydedilemedi.");
    } finally {
      setWorking(null);
    }
  };

  const saveCoupon = async (
    tier: "balanced" | "high_odds",
    assessmentIds: string[],
    key: string,
  ) => {
    setWorking(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dashboard/bankroll", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "save_coupon", tier, assessmentIds }),
      });
      const payload = await response.json() as { result?: { workspace: UserBankrollWorkspace }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Kupon taslağı kaydedilemedi.");
      setWorkspace(payload.result.workspace);
      setNotice("Kupon taslağı oran ve olasılık snapshotlarıyla kaydedildi.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kupon taslağı kaydedilemedi.");
    } finally {
      setWorking(null);
    }
  };

  const account = workspace.account;
  const riskLabel = workspace.profile.riskProfile === "cautious" ? "Temkinli"
    : workspace.profile.riskProfile === "bold" ? "Atak" : "Dengeli";

  return (
    <main className="user-shell bankroll-shell">
      <aside className={`user-sidebar ${menuOpen ? "open" : ""}`}>
        <a className="user-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/dashboard"><LayoutDashboard size={18} />Genel bakış</a>
          <a href="/dashboard#matches"><Bookmark size={18} />Maç analizleri</a>
          <a href="/dashboard/performance"><LineChart size={18} />Performans geçmişi</a>
          <a className="active" href="/dashboard/bankroll"><WalletCards size={18} />Kasa ve kupon<i>{workspace.counts.savedCoupons}</i></a>
          <a href="/dashboard/notifications"><Bell size={18} />Bildirimler</a>
          <a href="/dashboard/membership"><BadgeCheck size={18} />Üyelik ve profil</a>
        </nav>
        <section className="user-plan-card transparency"><ShieldCheck size={17} /><div><small>GÜVENLİK POLİTİKASI</small><b>Çeyrek-Kelly + sert limit</b><p>Hiçbir hesap gerçek para taşımaz; bu alan yalnızca kişisel kayıt ve karar desteğidir.</p></div></section>
        <a className="user-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="user-main">
        <header className="user-topbar">
          <button type="button" className="user-menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Menüyü aç"><Menu size={19} /></button>
          <div><a href="/dashboard">← Dashboard</a><span>KASA DEFTERİ · CP15 ENTITLEMENTS</span></div>
          <div className="user-top-actions"><button type="button" onClick={() => void refresh()} disabled={working !== null} aria-label="Yenile"><RefreshCw size={16} className={working === "refresh" ? "spin" : ""} /></button><span>{initials(workspace.profile.displayName)}</span></div>
        </header>

        <section className="performance-heading bankroll-heading">
          <div><small>ÇEYREK-KELLY · KORELASYON KONTROLÜ</small><h1>Kasa ve kupon çalışma alanı.</h1><p>Olasılıklar oranlardan bağımsızdır. Oran yalnızca değer kapısı ve stake hesabında kullanılır; aynı maçtan iki seçim hiçbir kupona giremez.</p></div>
          <span className="bankroll-risk-pill"><CircleGauge size={15} />{riskLabel} profil</span>
        </section>

        {error && <div className="user-message error"><ShieldAlert size={16} />{error}</div>}
        {notice && <div className="user-message success"><CheckCircle2 size={16} />{notice}<button type="button" onClick={() => setNotice(null)}>×</button></div>}

        <section className="bankroll-safety-strip"><LockKeyhole size={17} /><div><b>Gerçek para ve bahis işlemi yapılmaz.</b><p>Bakiyeler yalnızca takip defteridir. Negatif edge sıfır stake üretir; toplam açık risk {percent(workspace.policy.bankroll.profileCaps[accountRisk(workspace)].totalOpenExposure)} ile sınırlıdır.</p></div><span>TRACKING ONLY</span></section>

        <section className="bankroll-account-grid">
          <article className="bankroll-balance-card"><header><div><small>GÜNCEL KASA</small><h2>{money(account.currentBalance, account.currency)}</h2></div><span><WalletCards size={20} /></span></header><div><p><b>{money(account.currentOpenExposure, account.currency)}</b><small>Açık risk</small></p><p><b>{money(account.totalStaked, account.currency)}</b><small>Toplam stake</small></p><p><b>{money(account.totalReturned, account.currency)}</b><small>Toplam dönüş</small></p></div></article>
          <article className="bankroll-entry-card"><header><div><small>{account.initialized ? "KASA HAREKETİ" : "İLK KURULUM"}</small><h2>{account.initialized ? "Deftere ekle" : "Açılış bakiyesi"}</h2></div><Banknote size={20} /></header><div><input type="number" min="0" step="0.01" placeholder="Tutar" value={amount} onChange={(event) => setAmount(event.target.value)} /><select value={currency} onChange={(event) => setCurrency(event.target.value as typeof currency)} disabled={account.initialized}><option>TRY</option><option>USD</option><option>EUR</option><option>GBP</option></select></div>{account.initialized ? <footer><button type="button" onClick={() => void movement("deposit")} disabled={working !== null}><PlusCircle size={14} />Ekle</button><button type="button" onClick={() => void movement("withdrawal")} disabled={working !== null}><MinusCircle size={14} />Çıkar</button></footer> : <button className="bankroll-open-button" type="button" onClick={() => void movement("opening")} disabled={working !== null}>{working === "opening" ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}Kasayı başlat</button>}</article>
          <article className="bankroll-policy-card"><small>STAKE POLİTİKASI</small><h2>¼ Kelly</h2><p>Tekli üst limit <b>{percent(workspace.policy.bankroll.profileCaps[accountRisk(workspace)].single)}</b></p><p>Kupon üst limit <b>{percent(workspace.policy.bankroll.profileCaps[accountRisk(workspace)].coupon)}</b></p><p>Açık risk üst limit <b>{percent(workspace.policy.bankroll.profileCaps[accountRisk(workspace)].totalOpenExposure)}</b></p></article>
        </section>

        <section className="bankroll-section-card">
          <header><div><small>DEĞER HAVUZU · TEKLİ</small><h2>Sunucu tarafından yeniden hesaplanan stake’ler</h2></div><span>{workspace.singles.length} seçim</span></header>
          {!workspace.singles.length ? <HonestEmpty title="Stake üretilebilecek yayınlanmış seçim yok." text="Araştırma kayıtları, final olmayan analizler veya değer kapısını geçmeyen oranlar kasa ekranına taşınmaz." /> : <div className="bankroll-single-list">{workspace.singles.map((item) => <article key={item.assessmentId}><div><small>{item.leagueLabel} · {date(item.kickoffAt)}</small><b>{item.homeTeamName} — {item.awayTeamName}</b><span>{item.candidate.selection} · {item.bookmaker ?? "Şirket yok"}</span></div><p><small>ORAN</small><b>{item.candidate.decimalOdds.toFixed(2)}</b></p><p><small>MODEL</small><b>{percent(item.candidate.modelProbability)}</b></p><p><small>ÖNERİLEN</small><b>{money(item.stake.recommendedStake, account.currency)}</b></p></article>)}</div>}
        </section>

        <section className="bankroll-coupon-grid">
          <CouponColumn title="3 maçlık dengeli" eyebrow="DENGELİ ALTERNATİFLER" items={workspace.coupons.balanced} tier="balanced" currency={account.currency} working={working} onSave={saveCoupon} locked={workspace.access.balancedLocked} />
          <CouponColumn title="4–6 maç yüksek oran" eyebrow="YÜKSEK ORAN ALTERNATİFLERİ" items={workspace.coupons.highOdds} tier="high_odds" currency={account.currency} working={working} onSave={saveCoupon} locked={workspace.access.highOddsLocked} />
        </section>

        <section className="bankroll-ledger-card"><header><div><small>DEĞİŞMEZ HAREKET DEFTERİ</small><h2>Son kasa kayıtları</h2></div><span>{workspace.entries.length} kayıt</span></header>{!workspace.entries.length ? <HonestEmpty title="Kasa hareketi yok." text="Açılış bakiyesi kaydedildiğinde ilk append-only defter satırı burada görünecek." /> : <div>{workspace.entries.map((entry) => <article key={entry.id}><span className={entry.amountSigned >= 0 ? "positive" : "negative"}>{entry.amountSigned >= 0 ? "+" : "−"}</span><div><b>{entryType(entry.entryType)}</b><small>{date(entry.occurredAt)} · {entry.note ?? "Not yok"}</small></div><p><b>{money(Math.abs(entry.amountSigned), account.currency)}</b><small>Bakiye {money(entry.balanceAfter, account.currency)}</small></p></article>)}</div>}</section>

        <nav className="user-mobile-nav"><a href="/dashboard"><LayoutDashboard size={18} /><small>Genel</small></a><a href="/dashboard/performance"><LineChart size={18} /><small>Geçmiş</small></a><a className="active" href="/dashboard/bankroll"><WalletCards size={18} /><small>Kasa</small></a><a href="/dashboard/notifications"><Bell size={18} /><small>Bildirim</small></a><a href="/dashboard/membership"><BadgeCheck size={18} /><small>Üyelik</small></a></nav>
      </section>
    </main>
  );
}

function CouponColumn({ title, eyebrow, items, tier, currency, working, locked, onSave }: {
  title: string;
  eyebrow: string;
  items: UserBankrollWorkspace["coupons"]["balanced"];
  tier: "balanced" | "high_odds";
  currency: string;
  working: string | null;
  locked: boolean;
  onSave: (tier: "balanced" | "high_odds", ids: string[], key: string) => Promise<void>;
}) {
  return <section className="bankroll-section-card coupon-column"><header><div><small>{eyebrow}</small><h2>{title}</h2></div><Layers3 size={18} /></header>{locked ? <div className="bankroll-entitlement-lock"><LockKeyhole size={22} /><b>{tier === "high_odds" ? "Expert paketi gerekli." : "Pro veya Expert paketi gerekli."}</b><p>Hazır kuponlar Free pakette kapalıdır. Üyelik sınırı veri katmanında da uygulanır.</p><a href="/dashboard/membership">Paketleri karşılaştır</a></div> : !items.length ? <HonestEmpty title="Uygun kombinasyon yok." text="Aynı maç, tekrar eden takım, lig yoğunluğu ve düşük oran yoğunluğu kontrollerinin tamamı geçilmeden alternatif üretilmez." /> : <div className="coupon-list">{items.map((item, index) => { const key = `${tier}-${index}`; const ids = item.legs.map((leg) => leg.assessmentId); return <article key={item.evaluation.selectionIds.join("|")}><header><span>#{index + 1}</span><p><small>BİRLEŞİK ORAN</small><b>{item.evaluation.combinedOdds.toFixed(2)}</b></p><p><small>OLASILIK</small><b>{percent(item.evaluation.combinedProbability)}</b></p></header><div>{item.legs.map((leg) => <p key={leg.assessmentId}><ShieldCheck size={12} /><span>{"homeTeamName" in leg ? `${leg.homeTeamName} — ${leg.awayTeamName}` : leg.candidate.fixtureId}</span><b>{leg.candidate.selection} · {leg.candidate.decimalOdds.toFixed(2)}</b></p>)}</div><footer><span><BadgeDollarSign size={13} />{money(item.stake.recommendedStake, currency)}</span><button type="button" onClick={() => void onSave(tier, ids, key)} disabled={working !== null}>{working === key ? <LoaderCircle className="spin" size={13} /> : <Sparkles size={13} />}Taslağı kaydet</button></footer></article>; })}</div>}</section>;
}

function HonestEmpty({ title, text }: { title: string; text: string }) {
  return <div className="bankroll-empty"><ShieldAlert size={22} /><b>{title}</b><p>{text}</p></div>;
}

function accountRisk(workspace: UserBankrollWorkspace): "cautious" | "balanced" | "bold" {
  return workspace.profile.riskProfile ?? "balanced";
}

function percent(value: number) { return `%${(value * 100).toFixed(value * 100 < 1 ? 2 : 1).replace(".0", "")}`; }
function money(value: number, currency: string) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
function date(value: string) { return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE"; }
function entryType(value: string) { return value === "opening" ? "Açılış bakiyesi" : value === "deposit" ? "Kasa ekleme" : value === "withdrawal" ? "Kasa çıkarma" : value; }
