# FormEdge Satışa Hazırlık Roadmap v0.3

Tarih: 13 Ağustos 2026

Ana veri kaynağı: SportMonks Football API v3

Ürün durumu: Kapalı araştırma/beta; ücretli genel satış henüz açık değil.

## Go/no-go özeti

FormEdge'in ürün yüzeyi, otomatik maç merkezi, model sürümleme, veri lineage, model kartları, shadow validation, üyelik, bildirim ve kasa takip altyapısı mevcuttur. Ancak bir ürünün teknik olarak açılması ile ücretli satışa hukuken ve operasyonel olarak hazır olması aynı şey değildir.

Ücretli satış için aşağıdaki blokların tamamı kanıtlanmadan `recommendationEligible` veya ticari lansman kapısı açılamaz:

- SportMonks ticari yeniden kullanım, son kullanıcı gösterimi ve saklama haklarının yazılı teyidi
- Satın alınan 30 ligin ve gereken statistics/lineups/odds özelliklerinin hesap kapsamıyla eşleşmesi
- En az üç pilot ligde yeterli ileri-zaman örneği, kalibrasyon, drift ve zamansal holdout kanıtı
- Public kimlik, hesap silme/veri dışa aktarma, KVKK/GDPR metinleri ve destek süreci
- Şirket, vergi, faturalama, ödeme, iade ve ülke bazlı bahis/analiz hukuku incelemesi
- Üretim yedekleme/geri yükleme tatbikatı, alarm/SLO, E2E ve mobil görsel regresyon kanıtı

## Faz 0 — CP17Y–CP17AA: SportMonks tek kaynak ve otomatik analiz hattı

Durum: Uygulandı ve üretime dağıtıldı; gerçek günlük run kabul ölçütleri izleniyor.

- Canlı otomasyondaki bütün yedek sağlayıcı yollarını kaldır.
- Günlük fikstürü yalnız satın alınan 30 lig için sorgula.
- Yaklaşan takımların 365 günlük geçmişini SportMonks takım tarih aralığı endpoint'i ile al.
- Temel takım istatistiklerini (`possession`, toplam şut, isabetli şut, tehlikeli atak) normalize et.
- Eski veri sözleşmesine ait günlük cache'i yeni adapter/cache kimliğiyle geçersiz kıl.
- İstanbul günü başına yalnız bir başarılı upstream snapshot kullan; sonraki turlarda D1/R2 kaydını işle.
- Dört günlük pencerede en fazla 60 maçı otomatik analiz kuyruğuna al.
- Bir tahmin üretilemezse nedeni log ve run özetinde göster; turu sahte yeşil başarıya çevirmeme.
- SportMonks takım adlarını kimlik olarak kullanma; provider takım ID'sini kalıcı kanonik anahtar yap ve güvenilir yeniden importta eski fikstür bağlarını uzlaştır.
- Analizi olmayan her maç kartında son otomasyon denemesinin kesin engelini veya kuyruk durumunu göster.

Kabul ölçütleri:

- Dashboard'da SportMonks kaynağı, maç sayısı ve analiz sayısı sıfır olmayan gerçek üretim kaydıyla görünür.
- Aynı İstanbul gününde ikinci yenileme yeni SportMonks çağrı zinciri başlatmaz.
- Analizi olmayan her maç için açık blocker veya analiz sürümü vardır.
- API-Football, football-data.org ve CSV hiçbir canlı otomasyon kararında çalışmaz.
- Eski Football-Data çekim endpoint'i kapalıdır; mevcut tarihsel kayıtlar yalnız salt-okunur kanıt arşivi olarak korunur.

## Faz 1 — SportMonks veri kapsamı ve kalite kapıları

Durum: Devam ediyor; hesap/rate-limit/lig kapsam kanıtı ve kalıcı takım kimliği CP17Z–CP17AA ile uygulandı.

- [x] Hesap kapsamını `/my` ve coverage endpoint'leriyle sunucu tarafında doğrula; secret değerini saklama veya istemciye çıkarma.
- Statistics, lineups, sidelined/injury ve xG kapsamını lig bazında ölç.
- Kullanıcının satın aldığı odds özelliği varsa yalnız doğrulanmış pre-match 1X2 bookmaker snapshot'larını ayrı endpoint'ten al; paket yoksa değer/kupon kapısını kapalı tut.
- [x] API cevabındaki rate-limit kalan hak ve reset bilgisini operasyon telemetrisine ekle.
- [x] Takım adı değişiminde provider takım ID'sini koruyan kimlik uzlaştırma testi ekle; ertelenen/silinen fikstür ve sezon geçişi senaryolarını tamamla.
- Lig onboarding kalite puanını SportMonks kapsam kanıtına bağla.

Kabul ölçütleri:

- Her aktif lig için geçmiş derinliği, istatistik kapsamı, kadro kapsamı ve kaynak tazeliği sayısal görünür.
- Eksik add-on veya hak, sıfır değerle doldurulmaz; ilgili ürün özelliği açık blocker ile kapanır.

## Faz 2 — Model üretimi ve kanıt

Durum: Temel model var; gerçek ileri-zaman kanıtı yetersiz.

- En az üç pilot lig için otomatik forward-shadow gözlemi biriktir.
- Eski tarihsel doğrulama kampanyalarını SportMonks provenance ve sezon snapshot'larıyla yeniden üret; eski CSV arşivini model seçimi girdisi olmaktan çıkar.
- Takım lig değiştirdiğinde geçmiş formunu ayrı bir çapraz-lig normalizasyon politikasıyla ele al; gizli veri doldurma yapma.
- Elo, Poisson, Dixon–Coles ve form-dominance modellerini aynı point-in-time dataset üzerinde karşılaştır.
- Calibration/holdout/ablation raporlarını model kartına bağla.
- Veri tamlığı düşük analizleri görünür “araştırma analizi” olarak tut; öneri sıralamasına sokma.
- Model sürümü, feature cutoff, ham snapshot ve yayın kararı lineage zincirini eksiksiz doğrula.

Kabul ölçütleri:

- Tahmin anından sonra oluşan hiçbir skor, oran, kadro veya istatistik feature'a giremez.
- Her analiz ayrıntı ekranında olasılıklar, veri tamlığı, model sürümü ve blocker'lar görünür.
- Release kararı yalnız ileri-zaman ve holdout kanıtıyla verilir.

## Faz 3 — Otomatik ürün deneyimi

Durum: Temel dashboard tamamlandı; satış UX'i eksik.

- Dashboard'u “Önerilen analizler”, “Bugün”, “Yarın”, “Canlı/başladı” ve “Analiz bekliyor” bölümleriyle sonlandır.
- Maç kartını tek tık ayrıntı ekranına bağla; manuel izleme zorunluluğunu kaldır.
- Analiz üretim durumu ve son veri zamanı için kullanıcıya anlaşılır durum metni göster.
- Free/Pro/Expert limitlerini gerçek ürün planına, sunucu tarafı sayaçlara ve plan değişikliklerine bağla.
- Türkçe/İngilizce içerik bütünlüğü ve erişilebilirlik denetimi yap.

## Faz 4 — Hesap, ödeme ve hukuk

Durum: Dış bağımlılıklar açık.

- Public auth sağlayıcısı, e-posta doğrulama, şifre/oturum kurtarma ve kötüye kullanım koruması.
- Hesap silme, veri dışa aktarma, onay/çerez tercihleri ve saklama politikası.
- Şirket, vergi, fatura, Stripe/alternatif ödeme, iade ve abonelik iptali.
- Kullanım koşulları, gizlilik/KVKK/GDPR, sorumlu kullanım ve ülke bazlı hukuk görüşü.
- SportMonks ticari veri lisansı ve marka/atıf gereksinimlerinin yazılı onayı.

## Faz 5 — Üretim güvenilirliği

Durum: CI ve temel güvenlik var; operasyon kanıtı eksik.

- Scheduler teslim kanıtı, başarısız iş retry/dead-letter politikası ve rate-limit alarmı.
- D1/R2 yedekleme, geri yükleme tatbikatı ve RPO/RTO hedefleri.
- Sentry/PostHog benzeri hata ve ürün telemetrisi; secret ve kişisel veri redaksiyonu.
- API, dashboard ve satın alma akışı için E2E; Samsung/iOS/desktop görsel regresyon.
- SLO: kaynak tazeliği, analiz üretim süresi, hata oranı ve kullanıcıya gösterilen boş durum doğruluğu.

## Faz 6 — Kapalı ücretli pilot ve lansman kararı

Durum: Faz 0–5 tamamlanmadan başlamaz.

- 100–300 kişilik kontrollü pilot, kart gerektirmeyen gözlem dönemi ve destek SLA'sı.
- En az üç ligde forward metrik, kalibrasyon ve drift sonuçlarını haftalık model kartında yayınla.
- Fiyat/plan deneyi, churn/iade, destek yükü ve veri maliyeti raporu.
- Go/no-go kurulu: ürün, model riski, hukuk, finans ve operasyon imzası.

## Bilinçli olarak kapalı kalanlar

- Gerçek para tutma veya bahis şirketine işlem gönderme
- Kanıtı olmayan “kesin” öneri ya da başarı iddiası
- Odds add-on doğrulanmadan değer fırsatı/Kelly stake yayını
- Ticari hak teyidi olmadan ücretli veri gösterimi
- Başlamış maç için geriye dönük tahmin üretimi
