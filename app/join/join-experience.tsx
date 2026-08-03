"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleGauge,
  Database,
  LoaderCircle,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { FormEvent, useState } from "react";

type Language = "tr" | "en";

export function JoinExperience() {
  const [language, setLanguage] = useState<Language>("tr");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const tx = (tr: string, en: string) => language === "tr" ? tr : en;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          displayName: data.get("displayName"),
          email: data.get("email"),
          countryCode: data.get("countryCode"),
          locale: language,
          ageConfirmed: data.get("ageConfirmed") === "on",
          responsibleUseConfirmed: data.get("responsibleUseConfirmed") === "on",
          privacyAcknowledged: data.get("privacyAcknowledged") === "on",
          website: data.get("website"),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? tx("Kayıt tamamlanamadı.", "Registration could not be completed."));
      setCompleted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tx("Kayıt tamamlanamadı.", "Registration could not be completed."));
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="join-shell">
      <header className="join-header">
        <a href="/" className="join-wordmark"><span>F</span><b>FORMEDGE</b></a>
        <nav><a href="/"><ArrowLeft size={15} />{tx("Ana site", "Home")}</a><button type="button" onClick={() => setLanguage(language === "tr" ? "en" : "tr")}>{language === "tr" ? "EN" : "TR"}</button></nav>
      </header>
      <section className="join-grid">
        <section className="join-story">
          <span className="join-eyebrow"><i />CONTROLLED BETA · 100–300</span>
          <h1>{tx("Daha çok seçim değil, daha iyi karar disiplini.", "Not more picks — better decision discipline.")}</h1>
          <p>{tx("İlk beta ücretsiz ve davetlidir. Kart bilgisi alınmaz; hiçbir sonuç garanti edilmez. Her kayıp da kazanç kadar kalıcı performans geçmişinde görünür.", "The first beta is free and invite-only. No card is collected and no outcome is guaranteed. Every loss remains as visible as every win.")}</p>
          <div className="join-proof-grid">
            <article><Database size={19} /><b>{tx("Değişmez geçmiş", "Immutable record")}</b><small>{tx("Kazanan ve kaybeden tüm finaller", "Every winning and losing final")}</small></article>
            <article><CircleGauge size={19} /><b>{tx("Kalibre olasılık", "Calibrated probability")}</b><small>{tx("Oran tahmini değiştirmez", "Odds never rewrite the model")}</small></article>
            <article><ShieldCheck size={19} /><b>{tx("Sıkı yayın kapısı", "Strict release gate")}</b><small>{tx("Veri yoksa öneri yok", "No evidence, no recommendation")}</small></article>
          </div>
          <footer><LockKeyhole size={15} /><span>{tx("Google, Apple ve e-posta girişi public kimlik sağlayıcısı seçildikten sonra açılacak. Mevcut özel beta ChatGPT oturumuyla korunur.", "Google, Apple and email sign-in will open after a public identity provider is selected. The current private beta is protected by ChatGPT sign-in.")}</span></footer>
        </section>

        <section className="join-form-card">
          {completed ? <div className="join-complete"><span><CheckCircle2 size={29} /></span><small>BETA WAITLIST</small><h2>{tx("Talebin kaydedildi.", "Your request is recorded.")}</h2><p>{tx("Davetler kapasite, ülke uygunluğu ve test kapsamına göre gönderilecek. Aynı e-postayla yeniden gönderim sıranı değiştirmez.", "Invites will be sent according to capacity, country eligibility and testing scope. Re-submitting the same email does not change your place.")}</p><a href="/">{tx("Ana siteye dön", "Return home")}<ArrowRight size={16} /></a></div> : <form onSubmit={submit}>
            <header><span><Users size={19} /></span><div><small>FREE PRIVATE BETA</small><h2>{tx("Bekleme listesine katıl", "Join the waitlist")}</h2></div></header>
            <p>{tx("Kısa üyelik testi davet sonrasında hesabında açılır. Bu form yalnız iletişim ve uygunluk için gerekli asgari veriyi toplar.", "The short membership assessment opens in your account after invitation. This form only collects the minimum data needed for contact and eligibility.")}</p>
            {error && <div className="join-error"><ShieldAlert size={15} />{error}</div>}
            <div className="join-fields">
              <label><span>{tx("Ad", "Name")}</span><input name="displayName" maxLength={80} autoComplete="name" placeholder={tx("Nasıl hitap edelim?", "How should we address you?")} /></label>
              <label><span>{tx("E-posta", "Email")}</span><input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="name@example.com" /></label>
              <label><span>{tx("Ülke", "Country")}</span><select name="countryCode" required defaultValue="TR"><option value="TR">Türkiye</option><option value="GB">United Kingdom</option><option value="DE">Deutschland</option><option value="ES">España</option><option value="IT">Italia</option><option value="FR">France</option><option value="NL">Nederland</option><option value="PT">Portugal</option><option value="US">United States</option><option value="BR">Brasil</option><option value="AR">Argentina</option><option value="JP">Japan</option></select></label>
              <label className="join-honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>
            <div className="join-checks">
              <label><input name="ageConfirmed" type="checkbox" required /><span>{tx("18 yaş veya üzerindeyim.", "I am 18 or older.")}</span></label>
              <label><input name="responsibleUseConfirmed" type="checkbox" required /><span>{tx("FormEdge’in garanti kazanç sunmadığını ve bahis oynatmadığını anlıyorum.", "I understand FormEdge offers no guaranteed return and does not place bets.")}</span></label>
              <label><input name="privacyAcknowledged" type="checkbox" required /><span>{tx("E-postamın yalnız beta daveti ve ürün erişimi için saklanmasını kabul ediyorum.", "I agree that my email may be stored only for beta invitation and product access.")}</span></label>
            </div>
            <button className="join-submit" type="submit" disabled={working}>{working ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{tx("Davet talebini kaydet", "Record invite request")}<ArrowRight size={16} /></button>
            <footer>{tx("Satış veya abonelik başlamaz · Kart bilgisi istenmez", "No sale or subscription starts · No card is requested")}</footer>
          </form>}
        </section>
      </section>
    </main>
  );
}
