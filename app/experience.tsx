"use client";

import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  Clock3,
  CloudSun,
  Database,
  Eye,
  Gauge,
  Globe2,
  Layers3,
  LineChart,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { gsap } from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Material, Mesh, Object3D, Texture } from "three";

type Language = "tr" | "en";
type MatchStatus = "final" | "watch";
type DemoMatch = {
  id: string;
  league: string;
  time: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  homeColor: string;
  awayColor: string;
  probabilities: [number, number, number];
  pick: [string, string];
  odd: string;
  edge: string;
  grade: "A" | "B";
  lineup: "confirmed" | "waiting";
  status: MatchStatus;
  homeForm: string;
  awayForm: string;
  xg: [string, string];
  confidence: number;
};

const demoMatches: DemoMatch[] = [
  {
    id: "atlas-kuzey",
    league: "Türkiye · Süper Lig",
    time: "20:00",
    home: "Atlas İstanbul",
    away: "Kuzey 1967",
    homeCode: "ATL",
    awayCode: "KZY",
    homeColor: "#7d203f",
    awayColor: "#16a892",
    probabilities: [64, 22, 14],
    pick: ["Atlas İstanbul kazanır", "Atlas İstanbul to win"],
    odd: "1.78",
    edge: "+7.8 puan",
    grade: "A",
    lineup: "confirmed",
    status: "final",
    homeForm: "G G G B G",
    awayForm: "M B M M G",
    xg: ["1.92", "0.84"],
    confidence: 81,
  },
  {
    id: "northbridge-riverside",
    league: "England · Premier League",
    time: "22:00",
    home: "Northbridge FC",
    away: "Riverside Town",
    homeCode: "NBR",
    awayCode: "RIV",
    homeColor: "#315cf2",
    awayColor: "#efa92e",
    probabilities: [52, 27, 21],
    pick: ["2,5 gol üstü", "Over 2.5 goals"],
    odd: "1.86",
    edge: "+6.1 puan",
    grade: "A",
    lineup: "waiting",
    status: "watch",
    homeForm: "G B G G M",
    awayForm: "G M B G B",
    xg: ["1.68", "1.21"],
    confidence: 73,
  },
  {
    id: "porto-aveiro",
    league: "Portugal · Primeira Liga",
    time: "23:15",
    home: "Porto Azul",
    away: "Aveiro Athletic",
    homeCode: "PAZ",
    awayCode: "AVE",
    homeColor: "#17264a",
    awayColor: "#ef5675",
    probabilities: [58, 25, 17],
    pick: ["İlk yarı 0,5 üst", "1st half over 0.5"],
    odd: "1.52",
    edge: "+5.4 puan",
    grade: "B",
    lineup: "waiting",
    status: "watch",
    homeForm: "G G B G G",
    awayForm: "B M G M B",
    xg: ["1.74", "0.96"],
    confidence: 68,
  },
];

function Brand() {
  return (
    <span className="brand" aria-label="FormEdge">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <b>FORM<span>EDGE</span></b>
    </span>
  );
}

function HeroFootball() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const initialize = async () => {
      const probe = document.createElement("canvas");
      const context = probe.getContext("webgl2") ?? probe.getContext("webgl");
      if (!context) {
        mount.classList.add("football-fallback");
        return;
      }
      context.getExtension("WEBGL_lose_context")?.loseContext();

      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (disposed) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(0, 0.1, 6.3);
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      } catch {
        mount.classList.add("football-fallback");
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.16;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);

      const parallaxRig = new THREE.Group();
      const spinRig = new THREE.Group();
      parallaxRig.add(spinRig);
      scene.add(parallaxRig);

      scene.add(new THREE.HemisphereLight(0xd9edff, 0x07111f, 2.15));
      const keyLight = new THREE.DirectionalLight(0xffffff, 4.4);
      keyLight.position.set(-3.8, 5.2, 5.4);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      scene.add(keyLight);
      const blueRim = new THREE.PointLight(0x4b8dff, 17, 12, 2);
      blueRim.position.set(4.1, 1.5, 2.4);
      scene.add(blueRim);
      const mintRim = new THREE.PointLight(0x67e3c9, 9, 10, 2);
      mintRim.position.set(-3.2, -1.4, 1.2);
      scene.add(mintRim);

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.9, 64),
        new THREE.ShadowMaterial({ color: 0x00050c, opacity: 0.36 }),
      );
      shadow.position.set(0, -2.03, 0);
      shadow.rotation.x = -Math.PI / 2;
      shadow.receiveShadow = true;
      scene.add(shadow);

      const disposeMaterial = (material: Material) => {
        Object.values(material).forEach((value) => {
          if (value && typeof value === "object" && "isTexture" in value && (value as Texture).isTexture) {
            (value as Texture).dispose();
          }
        });
        material.dispose();
      };
      const disposeTree = (root: Object3D) => {
        root.traverse((object) => {
          if (!(object as Mesh).isMesh) return;
          const mesh = object as Mesh;
          mesh.geometry.dispose();
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(disposeMaterial);
        });
      };

      let frame = 0;
      const pointer = { x: 0, y: 0 };
      const onMove = (event: PointerEvent) => {
        const rect = mount.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 0.8;
        pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 0.58;
      };
      const resize = () => {
        const width = mount.clientWidth;
        const height = mount.clientHeight;
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      const observer = new ResizeObserver(resize);
      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        mount.removeEventListener("pointermove", onMove);
        disposeTree(scene);
        renderer.dispose();
        renderer.domElement.remove();
      };

      let model: Object3D;
      try {
        const gltf = await new GLTFLoader().loadAsync("/models/simple-soccer-football.glb");
        model = gltf.scene;
      } catch {
        cleanup();
        cleanup = undefined;
        mount.classList.add("football-fallback");
        return;
      }
      if (disposed) {
        disposeTree(model);
        cleanup?.();
        return;
      }

      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 3.75 / Math.max(size.x, size.y, size.z, 0.001);
      model.position.set(-center.x, -center.y, -center.z);
      model.scale.setScalar(scale);
      model.traverse((object) => {
        if (!(object as Mesh).isMesh) return;
        const mesh = object as Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      spinRig.add(model);
      spinRig.rotation.set(-0.12, 0.48, -0.08);
      mount.classList.add("football-ready");

      mount.addEventListener("pointermove", onMove, { passive: true });
      observer.observe(mount);
      resize();

      const render = () => {
        const now = performance.now();
        parallaxRig.rotation.x += (-0.08 - pointer.y * 0.24 - parallaxRig.rotation.x) * 0.035;
        parallaxRig.rotation.y += (pointer.x * 0.34 - parallaxRig.rotation.y) * 0.035;
        parallaxRig.position.y = reduced ? 0 : Math.sin(now * 0.00115) * 0.075;
        if (!reduced) {
          spinRig.rotation.y += 0.0032;
        }
        renderer.render(scene, camera);
        if (!reduced) frame = requestAnimationFrame(render);
      };
      render();
    };

    void initialize().catch(() => mount.classList.add("football-fallback"));
    return () => {
      disposed = true;
      const dispose = cleanup;
      cleanup = undefined;
      dispose?.();
    };
  }, []);

  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="football-glow" />
      <div className="football-mount" ref={mountRef} />
      <div className="football-ground" />
      <div className="float-card probability"><span>1</span><div><b>%64</b><small>+7.8 EDGE</small></div></div>
      <div className="float-card form"><Activity size={15} /><div><small>FORM</small><b>88</b></div></div>
      <div className="float-card grade"><ShieldCheck size={15} /><div><small>DATA</small><b>A</b></div></div>
      <div className="data-caption"><i />14.280 VERİ NOKTASI</div>
    </div>
  );
}

function FormDots({ form }: { form: string }) {
  return (
    <span className="form-dots" aria-label={form}>
      {form.split(" ").map((item, index) => <i className={item === "G" ? "win" : item === "B" ? "draw" : "loss"} key={`${item}-${index}`}>{item}</i>)}
    </span>
  );
}

function ProbabilityBar({ values }: { values: [number, number, number] }) {
  return (
    <div className="probability">
      <div className="prob-labels"><span><b>1</b>{values[0]}%</span><span><b>X</b>{values[1]}%</span><span><b>2</b>{values[2]}%</span></div>
      <div className="prob-track" aria-hidden="true"><i style={{ width: `${values[0]}%` }} /><i style={{ width: `${values[1]}%` }} /><i style={{ width: `${values[2]}%` }} /></div>
    </div>
  );
}

function MatchCard({ match, language, onOpen }: { match: DemoMatch; language: Language; onOpen: () => void }) {
  const tx = (tr: string, en: string) => language === "tr" ? tr : en;
  return (
    <article className="match-card reveal-card">
      <div className="match-meta"><span><Globe2 size={13} />{match.league}</span><b><Clock3 size={13} />{match.time}</b></div>
      <div className="teams">
        <div className="team home"><span className="team-badge" style={{ "--club": match.homeColor } as React.CSSProperties}>{match.homeCode}</span><strong>{match.home}</strong><FormDots form={match.homeForm} /></div>
        <span className="versus">VS</span>
        <div className="team away"><span className="team-badge" style={{ "--club": match.awayColor } as React.CSSProperties}>{match.awayCode}</span><strong>{match.away}</strong><FormDots form={match.awayForm} /></div>
      </div>
      <div className="prob-section"><small>{tx("1-X-2 OLASILIĞI", "1-X-2 PROBABILITY")}</small><ProbabilityBar values={match.probabilities} /></div>
      <div className="pick-row">
        <div><span className={`status ${match.status}`}>{match.status === "final" ? <Check size={13} /> : <Eye size={13} />}{match.status === "final" ? tx("Nihai öneri", "Final pick") : tx("İzleme listesi", "Watchlist")}</span><strong>{match.pick[language === "tr" ? 0 : 1]}</strong></div>
        <div className="odd"><small>{tx("Piyasa ort.", "Market avg.")}</small><b>{match.odd}</b><em>{match.edge}</em></div>
      </div>
      <footer><span className={`quality ${match.grade.toLowerCase()}`}>DATA {match.grade}</span><span className={match.lineup === "confirmed" ? "lineup confirmed" : "lineup"}>{match.lineup === "confirmed" ? <ShieldCheck size={14} /> : <Clock3 size={14} />}{match.lineup === "confirmed" ? tx("Kadro doğrulandı", "Lineup confirmed") : tx("Kadro bekleniyor", "Awaiting lineup")}</span><button type="button" onClick={onOpen}>{tx("Analizi aç", "Open analysis")}<ChevronRight size={16} /></button></footer>
    </article>
  );
}

function TrendChart() {
  return (
    <svg className="trend-chart" viewBox="0 0 420 150" role="img" aria-label="Temsili performans eğrisi">
      <defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#315cf2" stopOpacity=".23" /><stop offset="1" stopColor="#315cf2" stopOpacity="0" /></linearGradient></defs>
      <g className="chart-grid"><line x1="0" x2="420" y1="28" y2="28" /><line x1="0" x2="420" y1="75" y2="75" /><line x1="0" x2="420" y1="122" y2="122" /></g>
      <path className="chart-area" d="M0,124 C28,118 43,104 70,109 C102,115 108,82 139,91 C168,99 180,62 211,75 C244,87 253,48 285,58 C317,68 336,35 365,44 C389,50 403,27 420,22 L420,150 L0,150Z" />
      <path className="chart-line" d="M0,124 C28,118 43,104 70,109 C102,115 108,82 139,91 C168,99 180,62 211,75 C244,87 253,48 285,58 C317,68 336,35 365,44 C389,50 403,27 420,22" />
      <circle cx="420" cy="22" r="5" />
    </svg>
  );
}

function AnalysisDrawer({ match, language, onClose }: { match: DemoMatch; language: Language; onClose: () => void }) {
  const tx = (tr: string, en: string) => language === "tr" ? tr : en;
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    document.body.classList.add("drawer-open");
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("drawer-open"); };
  }, [onClose]);

  return (
    <div className="drawer-layer" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <aside className="analysis-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-handle" />
        <header><div><span className="eyebrow dark">{tx("TEMSİLİ MAÇ ANALİZİ", "ILLUSTRATIVE MATCH ANALYSIS")}</span><h2 id="drawer-title">{tx("Model bu seçimi neden öne çıkarıyor?", "Why does the model surface this selection?")}</h2></div><button type="button" onClick={onClose} aria-label={tx("Kapat", "Close")} autoFocus><X size={20} /></button></header>
        <div className="drawer-match">
          <div><span className="team-badge large" style={{ "--club": match.homeColor } as React.CSSProperties}>{match.homeCode}</span><strong>{match.home}</strong></div>
          <span><small>1-X-2</small><b>{match.probabilities.join("–")}</b></span>
          <div><span className="team-badge large" style={{ "--club": match.awayColor } as React.CSSProperties}>{match.awayCode}</span><strong>{match.away}</strong></div>
        </div>
        <div className="confidence"><div><small>{tx("Model uyumu", "Model agreement")}</small><b>{tx("Yüksek", "High")}</b></div><span><i style={{ width: `${match.confidence}%` }} /></span><strong>{match.confidence}/100</strong></div>
        <div className="signals">
          <article><span><TrendingUp size={18} /></span><div><small>{tx("Yakın form", "Recent form")}</small><strong>{match.homeForm} / {match.awayForm}</strong><p>{tx("Ev sahibi rakip gücü düzeltmesi sonrasında da daha istikrarlı.", "The home side remains stronger after opponent-strength adjustment.")}</p></div></article>
          <article><span><Target size={18} /></span><div><small>{tx("Oyun hâkimiyeti", "Match dominance")}</small><strong>xG {match.xg[0]} — {match.xg[1]}</strong><p>{tx("Şut kalitesi ve ceza sahası üretimi aynı yönde sinyal veriyor.", "Shot quality and box entries point in the same direction.")}</p></div></article>
          <article className="neutral"><span><CloudSun size={18} /></span><div><small>{tx("Kadro ve bağlam", "Lineup & context")}</small><strong>{match.lineup === "confirmed" ? tx("Kadro doğrulandı", "Lineup confirmed") : tx("Kadro bekleniyor", "Awaiting lineup")}</strong><p>{tx("Hava ve saha koşullarında modeli bozan güçlü bir anomali görünmüyor.", "No major weather or pitch anomaly currently conflicts with the model.")}</p></div></article>
        </div>
        <div className="drawer-note"><ShieldCheck size={18} /><p>{tx("Bu ekran yalnızca ürün deneyimini gösteren demo veridir; yayımlanmış bahis önerisi veya canlı model sonucu değildir.", "This screen uses demo product data; it is not a published betting recommendation or live model output.")}</p></div>
      </aside>
    </div>
  );
}

export function FormEdgeExperience() {
  const [language, setLanguage] = useState<Language>("tr");
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | MatchStatus>("all");
  const [risk, setRisk] = useState<"cautious" | "balanced" | "bold">("balanced");
  const [annual, setAnnual] = useState(false);
  const [selected, setSelected] = useState<DemoMatch | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tx = (tr: string, en: string) => language === "tr" ? tr : en;
  const visible = useMemo(() => demoMatches.filter((match) => filter === "all" || match.status === filter), [filter]);

  const scrollTo = (selector: string) => {
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!rootRef.current) return;
    const context = gsap.context(() => {
      gsap.from("[data-intro]", { opacity: 0, y: 28, duration: 0.85, stagger: 0.1, ease: "power3.out" });
      gsap.from(".hero-visual", { opacity: 0, scale: 0.9, duration: 1.2, delay: 0.18, ease: "power3.out" });
    }, rootRef);
    return () => context.revert();
  }, []);

  useEffect(() => {
    const nodes = document.querySelectorAll(".reveal, .reveal-card");
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); }
    }), { threshold: 0.12 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [filter]);

  const nav = [
    [tx("Bugün", "Today"), "#bugun"],
    [tx("Nasıl çalışır?", "How it works"), "#metod"],
    [tx("Performans", "Performance"), "#performans"],
    [tx("Paketler", "Plans"), "#paketler"],
  ];

  return (
    <div className="site-shell" ref={rootRef}>
      <header className="floating-header">
        <button type="button" className="header-icon mobile-only" onClick={() => setMenuOpen(!menuOpen)} aria-label={tx("Menü", "Menu")} aria-expanded={menuOpen}>{menuOpen ? <X size={22} /> : <Menu size={23} />}</button>
        <button type="button" className="header-icon mobile-only" aria-label={tx("Ara", "Search")}><Search size={21} /></button>
        <button className="brand-button" type="button" onClick={() => scrollTo("#top")}><Brand /></button>
        <nav className="desktop-nav">{nav.map(([label, href]) => <button type="button" key={href} onClick={() => scrollTo(href)}>{label}</button>)}</nav>
        <div className="header-actions">
          <button className="language" type="button" onClick={() => setLanguage(language === "tr" ? "en" : "tr")}>{language === "tr" ? "EN" : "TR"}</button>
          <button className="header-icon notification" type="button" aria-label={tx("Bildirimler", "Notifications")}><Bell size={19} /><i>2</i></button>
          <button className="login" type="button"><UserRound size={18} /><span>{tx("Giriş", "Sign in")}</span></button>
          <button className="trial" type="button" onClick={() => scrollTo("#paketler")}>{tx("Beta listesine katıl", "Join the beta")}<ArrowUpRight size={16} /></button>
        </div>
      </header>
      {menuOpen && <nav className="mobile-menu">{nav.map(([label, href]) => <button type="button" key={href} onClick={() => scrollTo(href)}>{label}<ChevronRight size={18} /></button>)}<button type="button"><span className="menu-alert"><Bell size={16} />{tx("Bildirimler", "Notifications")}<i>2</i></span><ChevronRight size={18} /></button><button className="menu-cta" type="button" onClick={() => scrollTo("#paketler")}>{tx("Beta listesine katıl", "Join the beta")}<ArrowUpRight size={17} /></button></nav>}

      <main>
        <section className="hero" id="top">
          <div className="hero-grid" /><div className="aurora one" /><div className="aurora two" />
          <div className="hero-inner">
            <div className="hero-copy">
              <div className="hero-eyebrow" data-intro><span><i /></span>{tx("BAHİS VAADİ DEĞİL — VERİYLE SINANAN ANALİZ", "NOT A BETTING PROMISE — ANALYSIS TESTED WITH DATA")}</div>
              <h1 data-intro><span>{tx("Formu gör.", "See the form.")}</span><span>{tx("Belirsizliği ölç.", "Measure uncertainty.")}</span><em>{tx("Kararı sen ver.", "Make your call.")}</em></h1>
              <p data-intro>{tx("Güncel formu, oyun hâkimiyetini ve kadro etkisini tek bakışta birleştiren yeni nesil futbol analiz deneyimi.", "A new football analysis experience combining recent form, match dominance and lineup impact in one clear view.")}</p>
              <div className="hero-actions" data-intro><button type="button" className="primary" onClick={() => scrollTo("#bugun")}>{tx("Örnek analizi incele", "Explore sample analysis")}<ArrowRight size={18} /></button><button type="button" className="secondary" onClick={() => scrollTo("#metod")}><CircleGauge size={17} />{tx("Yöntemi keşfet", "Discover the method")}</button></div>
              <div className="beta-proof" data-intro><span><i>UI</i><i>DA</i><i>ML</i></span><p><strong>100–300</strong> {tx("kişilik kontrollü beta", "user controlled beta")}</p></div>
            </div>
            <HeroFootball />
          </div>
          <div className="hero-stats"><div><b>42</b><span>{tx("model taraması", "model scans")}</span></div><div><b>20</b><span>{tx("öncelikli lig", "priority leagues")}</span></div><div><b>100%</b><span>{tx("değişmez geçmiş", "immutable history")}</span></div><button type="button" onClick={() => scrollTo("#bugun")}>{tx("Aşağı kaydır", "Scroll to explore")}<ArrowDown size={18} /></button></div>
        </section>

        <section className="dashboard-section" id="bugun">
          <div className="section-heading reveal"><div><span className="eyebrow dark">{tx("ÜRÜN ÖN İZLEMESİ", "PRODUCT PREVIEW")}</span><h2>{tx("Karmaşık veriyi, net bir karar ekranına çevirir.", "Complex evidence, translated into one clear decision screen.")}</h2></div><p>{tx("Her maç analiz edilir. Yalnızca veri, model ve değer kapılarının tamamını geçen seçimler öneriye dönüşür.", "Every match is analyzed. Only selections passing every data, model and value gate become recommendations.")}</p></div>
          <div className="dashboard reveal">
            <aside className="sidebar"><Brand /><nav><button className="active"><CalendarDays size={18} />{tx("Bugünün maçları", "Today’s matches")}</button><button><Eye size={18} />{tx("İzleme listesi", "Watchlist")}<i>7</i></button><button><Zap size={18} />{tx("Nihai öneriler", "Final picks")}<i>4</i></button><button><Layers3 size={18} />{tx("Kupon kurucu", "Coupon builder")}</button><button><LineChart size={18} />{tx("Performans", "Performance")}</button><button><WalletCards size={18} />{tx("Kasa", "Bankroll")}</button></nav><div className="side-beta"><Sparkles size={19} /><b>{tx("Beta erişimi", "Beta access")}</b><span>{tx("3 günlük Pro denemesi", "3-day Pro trial")}</span><button>{tx("Davet iste", "Request invite")}<ArrowUpRight size={14} /></button></div></aside>
            <div className="dash-main">
              <header className="dash-header"><div><span><CalendarDays size={14} />03 Ağustos, Pazartesi</span><h3>{tx("Bugünün maçları", "Today’s matches")}</h3><p><i />{tx("Son güncelleme 18:42 · Demo veri", "Updated 18:42 · Demo data")}</p></div><div><button className="search-button" aria-label={tx("Ara", "Search")}><Search size={18} /></button><button className="avatar">UM</button></div></header>
              <div className="summary-grid">
                <article className="summary radar"><header><span><CircleGauge size={16} />{tx("Model radarı", "Model radar")}</span><ChevronRight size={16} /></header><div className="radar-values"><p><b>42</b><span>{tx("Analiz", "Analyzed")}</span></p><p className="accent"><b>11</b><span>{tx("Eşiği geçti", "Qualified")}</span></p><p><b>31</b><span>{tx("Çekimser", "Abstained")}</span></p></div><div className="tiny-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div></article>
                <article className="summary form-summary"><header><span><TrendingUp size={16} />{tx("Form üstünlüğü", "Form dominance")}</span><em>+18%</em></header><div><b>88</b><span>/100</span><i>↑</i></div><p>{tx("Son 5/10, rakip gücü, saha ve oyun hâkimiyeti.", "Last 5/10, opponent strength, venue and dominance.")}</p></article>
                <article className="summary coverage"><div className="coverage-ring"><span><b>83%</b><small>{tx("Yüksek", "High")}</small></span></div><div><small>{tx("VERİ KAPSAMI", "DATA COVERAGE")}</small><b>{tx("A kalite maçlar", "Grade A matches")}</b><p>35 / 42</p></div></article>
              </div>
              <div className="match-toolbar"><div>{(["all", "final", "watch"] as const).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? tx("Tümü", "All") : item === "final" ? tx("Nihai", "Final") : tx("İzleme", "Watch")}<span>{item === "all" ? 42 : item === "final" ? 4 : 7}</span></button>)}</div><button className="league-filter">{tx("Tüm ligler", "All leagues")}<ChevronDown size={15} /></button></div>
              <div className="match-list">{visible.map((match) => <MatchCard key={match.id} match={match} language={language} onOpen={() => setSelected(match)} />)}</div>
              <div className="lower-grid"><article className="risk-card reveal-card"><span><Gauge size={20} /></span><div><small>{tx("GÖRÜNÜM PROFİLİ", "VIEW PROFILE")}</small><h4>{risk === "cautious" ? tx("Temkinli", "Cautious") : risk === "balanced" ? tx("Dengeli", "Balanced") : tx("Atak", "Bold")}</h4><p>{tx("Olasılık değişmez; yalnızca seçim havuzu daralır.", "Probabilities stay fixed; only the selection pool changes.")}</p></div><nav>{(["cautious", "balanced", "bold"] as const).map((item) => <button aria-label={item} type="button" className={risk === item ? "active" : ""} key={item} onClick={() => setRisk(item)} />)}</nav></article><article className="agreement-card reveal-card"><div><small>{tx("MODEL UYUMU", "MODEL AGREEMENT")}</small><h4>{tx("Yüksek", "High")}</h4><p>{tx("4 modelden 4'ü aynı yönü destekliyor.", "4 of 4 branches support the same direction.")}</p></div><span><i /><i /><i /><i /></span></article></div>
            </div>
          </div>
        </section>

        <section className="method-section" id="metod">
          <div className="section-heading inverse reveal"><div><span className="eyebrow">{tx("MODEL MİMARİSİ", "MODEL ARCHITECTURE")}</span><h2>{tx("Bir kural değil, dört ayrı kanıt katmanı.", "Not one rule — four independent layers of evidence.")}</h2></div><p>{tx("Form taktiği güçlü bir sinyal olarak test edilir; takım gücü, gol dağılımı ve kalibre edilmiş istatistiksel modelle doğrulanır.", "The form thesis is tested as a strong signal, then checked against team strength, score distribution and a calibrated model.")}</p></div>
          <div className="method-grid reveal">
            {[
              [Activity, "01", tx("Form üstünlüğü", "Form dominance"), tx("Son 5/10 maç, oyun hâkimiyeti, saha ve rakip gücü.", "Last 5/10, dominance, venue and opponent strength.")],
              [CircleGauge, "02", tx("Takım gücü", "Team strength"), tx("Dinamik Elo, hücum-savunma gücü ve lig seviyesi.", "Dynamic Elo, attack/defence strength and league level.")],
              [Target, "03", tx("Gol dağılımı", "Score distribution"), tx("Poisson/Dixon–Coles ile tutarlı pazar olasılıkları.", "Consistent market probabilities via Poisson/Dixon–Coles.")],
              [ShieldCheck, "04", tx("Kalibrasyon kapısı", "Calibration gate"), tx("Veri, kadro, belirsizlik ve değer geçmeden öneri yok.", "No pick until data, lineup, uncertainty and value pass.")],
            ].map(([Icon, no, title, text]) => <article className="method-card reveal-card" key={String(no)}><small>{String(no)}</small><span><Icon size={22} /></span><h3>{String(title)}</h3><p>{String(text)}</p></article>)}
          </div>
          <div className="method-note reveal"><span><Database size={20} />POINT-IN-TIME DATA</span><b>{tx("Veri yoksa, öneri de yok.", "No data means no recommendation.")}</b><p>{tx("Her maçta konuşmak zorunda değiliz. Çekimser kalmak modelin bir özelliğidir.", "The system does not have to speak on every match. Abstention is a model feature.")}</p></div>
        </section>

        <section className="performance-section" id="performans">
          <div className="section-heading reveal"><div><span className="eyebrow dark">{tx("ŞEFFAFLIK", "TRANSPARENCY")}</span><h2>{tx("Kazananı gösterip kaybedeni saklamayan geçmiş.", "A record that never hides the losses.")}</h2></div><p>{tx("Yayımlanan her olasılık; zamanı, model sürümü ve kadro durumuyla değiştirilemez biçimde kaydedilir.", "Every published probability is stored permanently with its timestamp, model version and lineup state.")}</p></div>
          <div className="demo-warning reveal"><ShieldCheck size={16} />{tx("Canlı beta henüz başlamadı · Aşağıdaki performans verileri temsili", "Live beta has not started · Performance figures below are illustrative")}</div>
          <div className="performance-grid">
            <article className="performance-chart reveal-card"><header><div><small>{tx("KÜMÜLATİF NET BİRİM", "CUMULATIVE NET UNITS")}</small><b>+18.42</b><em>+12.8%</em></div><button>90 {tx("gün", "days")}<ChevronDown size={14} /></button></header><TrendChart /><footer><span>01 May</span><span>01 Jun</span><span>01 Jul</span><span>03 Aug</span></footer></article>
            <article className="metric reveal-card"><span><TrendingUp size={20} /></span><small>ROI</small><b>12.8%</b><p><em>↑ 2.4</em> {tx("önceki döneme göre", "vs previous")}</p></article>
            <article className="metric calibration-metric reveal-card"><span><Target size={20} /></span><small>{tx("KALİBRASYON", "CALIBRATION")}</small><b>0.043</b><p>Brier · <em>{tx("iyi", "good")}</em></p></article>
            <article className="calibration-panel reveal-card"><header><div><small>{tx("OLASILIK KALİBRASYONU", "PROBABILITY CALIBRATION")}</small><h3>{tx("Söylenenle gerçekleşen", "Predicted vs observed")}</h3></div><span>DATA A</span></header><div className="calibration-plot"><i className="perfect" />{[20, 35, 49, 64, 78].map((point, index) => <i key={point} style={{ left: `${18 + index * 17}%`, bottom: `${point}%` }} />)}</div></article>
            <article className="matrix-panel reveal-card"><header><div><small>{tx("LİG × PAZAR", "LEAGUE × MARKET")}</small><h3>{tx("Yayın kapısı", "Release gate")}</h3></div><BarChart3 size={17} /></header>{[["Premier League", "Sınırlı"], ["Süper Lig", "Gölge"], ["Bundesliga", "Uygun"], ["Serie A", "Analiz"]].map(([league, state], row) => <div className="matrix-row" key={league}><span>{league}</span><i className="good" /><i className={row === 1 ? "mid" : "good"} /><i className={row === 2 ? "good" : row === 1 ? "low" : "mid"} /><b>{language === "tr" ? state : ["Limited", "Shadow", "Ready", "Analysis"][row]}</b></div>)}</article>
          </div>
        </section>

        <section className="pricing-section" id="paketler">
          <div className="center-heading reveal"><span className="eyebrow dark">{tx("ÜYELİK", "MEMBERSHIP")}</span><h2>{tx("Aynı dürüst model. İhtiyacın kadar derinlik.", "The same honest model. The depth you need.")}</h2><p>{tx("Expert daha iyi tahmin satmaz; daha fazla doğrulanmış pazar, otomasyon ve analiz derinliği sunar.", "Expert does not sell better predictions; it adds validated markets, automation and depth.")}</p></div>
          <div className="billing reveal"><button className={!annual ? "active" : ""} onClick={() => setAnnual(false)}>{tx("Aylık", "Monthly")}</button><button className={annual ? "active" : ""} onClick={() => setAnnual(true)}>{tx("Yıllık · 2 ay avantajlı", "Annual · 2 months included")}</button></div>
          <div className="pricing-grid">
            {[
              { name: "Free", price: "0", className: "free", desc: ["Sistemi güvenle keşfet.", "Explore the system safely."], features: [["Günde 3 hızlı analiz", "3 quick analyses daily"], ["7 günlük performans", "7-day performance"], ["Temel sanal kasa", "Basic virtual bankroll"]] },
              { name: "Pro", price: annual ? "279" : "329", className: "pro", desc: ["Tüm nihai öneriler ve derin analiz.", "All final picks and deep analysis."], features: [["Sınırsız maç analizi", "Unlimited match analysis"], ["Doğrulanmış ana pazarlar", "Validated core markets"], ["Kupon kurucu ve web push", "Coupon builder and web push"], ["Tam standart geçmiş", "Full standard history"]] },
              { name: "Expert", price: annual ? "499" : "579", className: "expert", desc: ["Uzman filtreler ve otomasyon.", "Expert filters and automation."], features: [["Tüm doğrulanmış pazarlar", "All validated markets"], ["Gelişmiş geçmiş ve export", "Advanced history and export"], ["Telegram + özel bildirim", "Telegram + custom alerts"], ["Top 5 kupon alternatifi", "Top 5 coupon alternatives"]] },
            ].map((plan) => <article className={`price-card ${plan.className} reveal-card`} key={plan.name}>{plan.name === "Pro" && <em className="popular">{tx("EN DENGELİ", "MOST BALANCED")}</em>}<header><span>{plan.name[0]}</span><b>{plan.name}</b></header><p>{plan.desc[language === "tr" ? 0 : 1]}</p><div className="price"><small>₺</small><b>{plan.price}</b><span>/{tx("ay", "mo")}</span></div>{annual && plan.name !== "Free" && <em className="annual-note">{tx("Yıllık faturalandırılır", "Billed annually")}</em>}<ul>{plan.features.map((feature) => <li key={feature[0]}><Check size={15} />{feature[language === "tr" ? 0 : 1]}</li>)}</ul><button>{plan.name === "Free" ? tx("Ücretsiz başla", "Start free") : tx("Paketi incele", "Explore plan")}<ArrowUpRight size={16} /></button></article>)}
          </div>
          <p className="price-note reveal">{tx("Fiyatlar yalnızca beta konumlandırma hipotezidir; satış teklifi değildir.", "Prices are beta positioning hypotheses only and are not a sales offer.")}</p>
        </section>

        <section className="final-cta"><div className="cta-orbit"><i /><i /><i /></div><div className="reveal"><span className="eyebrow">CONTROLLED BETA · 100–300 USERS</span><h2>{tx("Tahmini değil, karar kalitesini geliştir.", "Improve the quality of the decision — not the promise.")}</h2><p>{tx("İlk ücretsiz beta için bekleme listesine katıl. Kart bilgisi gerekmez.", "Join the waitlist for the first free beta. No card required.")}</p><button className="primary">{tx("Beta listesine katıl", "Join the beta")}<ArrowRight size={18} /></button></div></section>
      </main>

      <footer className="site-footer"><div><Brand /><p>{tx("FormEdge bir analiz prototipidir. Garanti kazanç sunmaz ve kullanıcı adına bahis oynatmaz.", "FormEdge is an analysis prototype. It does not guarantee returns or place bets for users.")}</p><span>TR / EN</span></div><div><span>© 2026 FormEdge · Beta product prototype</span><nav><a href="#metod">{tx("Metodoloji", "Methodology")}</a><a href="#performans">{tx("Şeffaflık", "Transparency")}</a><a href="#top">18+ · {tx("Sorumlu kullanım", "Responsible use")}</a><a href="https://poly.pizza/m/57u6P7Sr7K0" target="_blank" rel="noreferrer">3D: Smirnoff Alexander</a><a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a></nav></div></footer>
      {selected && <AnalysisDrawer match={selected} language={language} onClose={() => setSelected(null)} />}
    </div>
  );
}
