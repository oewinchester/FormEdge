# FormEdge

**Football intelligence, calibrated.**
FormEdge; maç formu, oyun üstünlüğü ve bağlamsal verileri olasılık tahminlerine dönüştürmek üzere geliştirilen Türkçe/İngilizce futbol analiz platformudur.

> Beta ilkesi: Bir model yüksek isabet gösterse bile zaman sızıntısı, kalibrasyon ve lig × pazar yayın kapılarını geçmeden bahis önerisi üretemez.

## Mevcut checkpoint

**v0.7.0-alpha.16 · Checkpoint 17P · Provider Migration Foundation**

- API-Football v3'ü sunucu tarafı secret, sabit endpoint, iki pencereli fikstür/geçmiş çekimi ve normalize D1/R2 importuyla birincil sağlayıcı yapan adaptör
- API-Football yapılandırılmadığında football-data.org'a, o da yoksa kontrollü CSV akışına düşen; sağlayıcıyı run kimliğinde ve provenance kaydında ayıran üç katmanlı geçiş
- Süper Lig dahil bilinen 13 organizasyonu mevcut FormEdge kimlikleriyle eşleyen; diğer API-Football liglerini kararlı sağlayıcı kimliğiyle research-only içeri alan kapsam
- Art arda 25 hataya ve saatlik rate-limit'e yol açan eski Football-Data.co.uk arşiv mutasyonlarını arayüzde kapatan; tarihsel geçişi yeni sağlayıcı anahtarına bağlayan fail-closed kontrol

Önceki checkpoint: **v0.7.0-alpha.15 · Checkpoint 17O · Live Competition Coverage & Rolling History**

- football-data.org ücretsiz pakette sunulan 12 organizasyonun tamamını kapsayan; PPL dahil o gün gerçekten oynanan maçları dar dört-lig filtresinde kaybetmeyen canlı fikstür adaptörü
- API'nin en fazla 10 günlük sorgu sınırını koruyan dört tarihsel + bir yaklaşan pencereyle son 40 günlük sonuçları ve önümüzdeki 72 saati tekilleştirerek D1/R2 katmanına alan veri turu
- Modern API aktifken aynı veriyi eski Football-Data.co.uk sezon çekimiyle tekrar istemeyen ve başarılı canlı turu sahte `partial` durumuna düşürmeyen otomasyon düzeltmesi
- Research Feed üzerinde modern canlı veri turunu doğrudan başlatan; 25 sezonluk eski CSV arşiv kuyruğunu ayrı ve açık biçimde etiketleyen yönetici akışı

Önceki checkpoint: **v0.7.0-alpha.14 · Checkpoint 17N · Owner Access & Live Runtime Wiring**

- Sites çalışma zamanı secret’ını doğrudan Cloudflare env bağından okuyan; zamanlayıcı ve manuel yenilemede aynı güncel API sağlayıcısını kullanan canlı veri bağlantısı
- Tanımlı platform sahibini hangi üye ekranından giriş yaparsa yapsın D1’de aktif `admin` rolüne eşleyen idempotent owner senkronizasyonu
- Aktif iç test hesabını üyelik motorunda otomatik `Expert` plana yükselten sınırsız analiz, tam geçmiş, gelişmiş export, bildirim ve kupon yetkileri
- Token değerini log, istemci payload’ı, Git geçmişi ve kaynak kodundan uzak tutan server-only secret sınırı

Önceki checkpoint: **v0.7.0-alpha.13 · Checkpoint 17M · Bugünün Maç Merkezi**

- İstanbul günü ve takip eden 48 saati kapsayan; gerçek fikstür, kaynak tazeliği, model olasılıkları ve yayın durumunu tek ekranda gösteren kullanıcı maç merkezi
- Research-only model yönünü görünür kılarken doğrulanmış öneriyi ayrı tutan; model/yayın/değer blocker kodlarını açıkça gösteren fail-closed kartlar
- Yönetici yetkili “Veriyi şimdi yenile” eylemiyle fikstür çekimi, tahmin sürümleme ve dashboard yenilemeyi tek idempotent turda çalıştıran operasyon akışı
- `FOOTBALL_DATA_ORG_API_TOKEN` yalnız sunucu ortamında tanımlandığında 12 ücretsiz organizasyon için güncel v4 fikstür API’sini; aksi halde mevcut CSV akışını kullanan çift kaynak adaptörü
- Canlı API oran sağlamadığında ve yeniden kullanım/yayın kanıtı eksikken `researchOnly=true` sınırını koruyan; bahis talimatı veya sahte öneri üretmeyen güvenlik politikası

Önceki checkpoint: **v0.7.0-alpha.12 · Checkpoint 17L · Versioned Model Cards**

- Her model sürümünü konfigürasyon SHA-256 kimliği, feature şeması, tarihsel dataset, walk-forward backtest, zamansal holdout/kalibrasyon ve release gate kaydıyla birleştiren deterministik `model-version-card-v1` sözleşmesi
- Eksik veya uyuşmayan dataset/backtest/evidence/gate bağlarını, leakage ihlalini ve geçersiz OOS metriğini açık blocker kodlarıyla fail-closed tutan kart denetimi
- Aynı kanıt parmak izini yeniden yazmayan; kart, bulgu ve upstream kimliklerini değişmez D1 snapshot’ı ve audit log ile saklayan model yönetişim defteri
- Sürüm seçimi, dört aşamalı kanıt zinciri, OOS ve holdout ölçümleri, uygun/yasak kullanım, sınırlamalar ve snapshot bayatlığını gösteren korumalı responsive Model Kartları konsolu
- Kart belgelense dahi `researchOnly=true`, `recommendationEligible=false`, `cardCanOpenReleaseGate=false` ve `cardCanChangeModelStatus=false` sınırlarını zorunlu tutan belge-only politika

Önceki checkpoint: **v0.7.0-alpha.11 · Checkpoint 17K · League Onboarding Quality Score**

- Her lig–kaynak çiftini lisans `%20`, geçmiş derinliği `%20`, kimlik eşleme `%15`, gelişmiş veri `%15`, kadro `%10`, kickoff öncesi oran bütünlüğü `%10` ve kaynak SLA `%10` ağırlıklarıyla değerlendiren deterministik `league-onboarding-quality-v1` sözleşmesi
- Lisans, minimum 40 bitmiş maç, kimlik eşleme, gelişmiş veri, oran zamanı veya SLA kanıtı eşikleri sağlanmadığında açık blocker kodlarıyla fail-closed kalan araştırma hazırlık kapısı
- Saatlik kanıt penceresini SHA-256 parmak iziyle değişmez D1 assessment kaydına dönüştüren, aynı kanıtı yeniden yazmayan ve her yeni snapshot’ı audit log’a bağlayan kalıcı değerlendirme defteri
- Canlı kanıt ile son kaydedilmiş snapshot arasındaki bayatlığı, yedi bileşenin puan/ağırlıklarını ve bütün blocker/uyarı kodlarını gösteren korumalı responsive Lig Onboarding konsolu
- `ready_for_research` ve 100/100 sonuçlarında dahi `researchOnly=true`, `recommendationEligible=false` ve `scoreCanOpenRecommendationGate=false` sınırlarını zorunlu tutan analiz-only politika

Önceki checkpoint: **v0.7.0-alpha.10 · Checkpoint 17J · Data Lineage Explorer Foundation**

- Her yeni tahmin sürümüyle aynı D1 batch işleminde yazılan, SHA-256 kimlikli ve değişmez `prediction-lineage-v1` manifesti
- Hedef fikstür, benchmark geçmişi, istatistik, oran, kadro ve bağlam kayıtlarını kaynak ingestion run’larına bağlayan normalize provenance sözleşmesi
- Ham R2 snapshotı → normalize D1 kaydı → point-in-time feature → model sürümü → yayın kararı zincirini beş aşamada denetleyen korumalı Data Lineage gezgini
- Eksik manifest, run, ham snapshot, capture zamanı, lisans, feature cutoff, model veya yayın kararını açık blocker kodlarıyla fail-closed tutan saf denetim motoru
- Ham payload’ı istemciye taşımayan; yalnız kaynak kimliği, checksum ve karar kanıtı gösteren veri minimizasyonu sınırı
- Lineage zinciri tamamlansa bile öneri uygunluğunu açmayan zorunlu `research-only` ve `RECOMMENDATION: OFF` politikası

Önceki checkpoint: **v0.7.0-alpha.9 · Checkpoint 17I · Delivery Integrity & CI Baseline**

- GitHub push ve pull request’lerinde migration bütünlüğü, yüksek güvenli secret taraması, hazırlık özeti, lint, build, artifact doğrulaması ve bütün testleri zorunlu sırada çalıştıran CI kapısı
- JavaScript/TypeScript için haftalık ve değişiklik bazlı CodeQL analizi; npm ve GitHub Actions bağımlılıklarını kontrollü gruplarla izleyen Dependabot politikası
- HTML, API ve görsel optimizasyon yanıtlarına CSP, HSTS, clickjacking, MIME sniffing, referrer ve izin politikalarını tek Worker katmanında uygulayan üretim güvenlik başlıkları
- Drizzle journal, SQL migration ve schema snapshot zincirini sıra, eksik/fazla dosya, JSON geçerliliği ve SHA-256 parmak iziyle fail-closed doğrulayan migration denetimi
- Public beta, owner, davet, scheduler ve bildirim yapılandırmasını yalnız boolean durum/blocker kodlarıyla raporlayan; gizli değerleri hiçbir çıktıya taşımayan launch-readiness sözleşmesi
- CI’nin render testlerini yalnız doğrulanmış üretim artifact’i oluştuktan sonra çalıştırmasını zorunlu kılan açık build → test sıralaması

Önceki checkpoint: **v0.7.0-alpha.8 · Checkpoint 17H · Research Operations Gate**

- Forward ve tarihsel worker sağlığını tek fail-closed araştırma operasyon kapısında birleştiren deterministik değerlendirme
- Worker başlamadı, gecikti veya son turda hata/kısmi sonuç ürettiğinde açık blocker kodları ve operatör görünümü
- İki worker sağlıklı olsa bile sonucu yalnız operasyonel araştırma durumu olarak tanımlayan; öneri ve ticari yayın uygunluğunu kapalı tutan sınır

- Forward ve tarihsel worker sağlığını kalıcı D1 kayıtlarından `sağlıklı`, `dikkat`, `gecikmiş`, `çalışıyor` veya `başlamadı` olarak deterministik özetleyen gözlem katmanı
- Gerçek başarı oranı, ortalama/maksimum süre, ardışık hata ve son başarı/hata zamanlarını örnek veri veya tahmini süre üretmeden hesaplayan saf sağlık motoru
- Son 120 otomasyon kaydını tarayan; tarihsel koşuları lig, tetikleyici, tamamlanan/sıradaki aşama, süre ve hata koduyla gösteren responsive operasyon geçmişi
- Her pilot lig için kaynak/kampanya aşamasını kalıcı kampanya durumundan gösteren lig × aşama ilerleme görünümü
- Retrospektif sonuçları kullanıcı önerisine veya ticari yayın uygunluğuna dönüştürmeyen research-only sınırı

- Her Sites checkpoint commit’ini repo-sınırlı deploy key ile GitHub `main` dalına otomatik ve yalnız fast-forward gönderen versioned post-commit mirror
- Standart SSH erişimi kapalı ortamlarda GitHub’ın resmî `ssh.github.com:443` kanalını mevcut HTTPS CONNECT tünelinden kullanan güvenli taşıma
- Başarısız mirror denemesini Sites checkpoint’ini bozmadan `pending` kaydeden ve sonraki checkpoint’te yeniden deneyen operasyon sözleşmesi
- PAT, özel anahtar, GitHub kimlik bilgisi veya credential içeren remote URL’yi kaynak koduna ve commit geçmişine almayan secret sınırı

- Her saat `:47` çalışan, tarihsel kaynak → dataset → dört-model benchmark → evidence → stabilite zincirinden tur başına yalnız bir ağır aşama ilerleten Cloudflare scheduled worker
- Aktif kampanyayı D1’den kaldığı yerden sürdüren; başarısız bir ligin bütün kuyruğu bloke etmesini dönüşümlü pilot-lig seçimiyle önleyen tarihsel araştırma orkestrasyonu
- Forward gözlem (`:17`) ve tarihsel doğrulama (`:47`) işlerini ayrı kilit, iş türü ve denetim kaydıyla saklayan D1 otomasyon defteri
- Son tarihsel turu, hedef ligi, biten/sıradaki aşamayı, kaynak ilerlemesini ve kampanya sonucunu gerçek veriden gösteren admin konsolu
- Admin için forward ve tarihsel tek-tur kontrolleri; analiz editörü için aynı gerçek operasyon geçmişinin salt-okunur görünümü

- Football-Data.co.uk `fixtures.csv` akışını sabit beş pilot lig allowlist’iyle alan; ham CSV’yi R2, HTTP/ETag/checksum provenance’ını D1 üzerinde saklayan gerçek yaklaşan fikstür adaptörü
- Bet365, Betfred, BetMGM, BetVictor, Bet&Win, Paddy Power ve Betfair Exchange eksiksiz 1X2 üçlülerini araştırma snapshotı olarak alan; upstream capture zamanı doğrulanmadığı için değer/yayın kapısını kapalı tutan oran politikası
- Her saat `:17` çalışan, aynı anda tek tur ve tur başına en fazla altı yaklaşan maç sınırı olan Cloudflare scheduled worker
- Canlı sezon sonuçlarını pilot ligler arasında sırayla güncelleyen; maç başlamadan kaydedilen ilk tahmin sürümünü fixture başına tek, değişmez forward-shadow gözlemine dönüştüren otomasyon
- Tamamlanan maçları 1-X-2 sonucuyla bağlayan, iptal maçlarını void tutan ve lig başına 40 gerçek ileri-zaman örneği dolmadan stabilite kapısını açmayan D1 gözlem defteri
- Son fikstür çekimi, otomasyon turu, bekleyen/sonuçlanan gözlem, lig ilerlemesi ve manuel admin tetiklemesini gerçek veriden gösteren responsive Forward Shadow konsolu
- Takılı kalan kaynak/otomasyon kilitlerini süre aşımında fail-closed bırakan; checksum aynıysa yeni ingestion üretmeyen idempotent operasyon sözleşmesi
- Geliştirme önizlemesinin Node uyumluluğunu üretim Sites manifestinden ayıran; `2026-08-04` üretim tarihini ve boş compatibility flag sözleşmesini koruyan dağıtım düzeltmesi

- Kaynak sezonu → değişmez dataset → dört benchmark → kanıt matrisi → erken/geç dönem drift akışını çağrı başına tek ağır aşamayla ilerleten, D1’de kaldığı yerden devam eden doğrulama kampanyaları
- Süper Lig, Premier League, Bundesliga, La Liga ve Serie A için eksik gerçek sezonları aynı allowlist adaptöründen tek tek çeken yönetici kuyruğu; analiz editörü için salt-okunur ayrıntı görünümü
- Aynı değişmez dataset üzerindeki tamamlanmış dört benchmark koşusunu yeniden kullanan idempotent model karşılaştırması
- OOS tahminleri erken/geç zaman pencerelerinde isabet, log loss, normalize Brier, ECE, veri tamlığı ve olasılık dağılım kaymasıyla ölçen deterministik stabilite motoru
- Kamu CSV’sini canlı shadow performansı gibi göstermeyen; ticari kullanım, revizyon zamanı ve gerçek ileri-zaman kayıt kanıtı yoksa yayın uygunluğunu zorunlu `blocked` tutan kalıcı blocker defteri
- Kampanya aşaması, seçilen model/backtest, kaynak parmak izi, metrik pencereleri, drift eşikleri ve sonuç SHA-256 kimliğini iki yeni D1 tablosunda saklayan denetlenebilir CP17C zinciri
- Yönetici için tek-aşama ve güvenli sıralı-tamamlama kontrolleri; gerçek veri yokken sonuç kartı uydurmayan responsive Shadow Validation paneli
- Ana sayfa, bekleme listesi, giriş, kayıt, birleşik panel merkezi, kullanıcı dashboardları ve yönetim konsollarını tek yönlendirme mimarisinde birleştiren erişim akışı
- ChatGPT SIWC ile çalışan gerçek oturum yolu; hazır olmayan Google, Apple ve e-posta sağlayıcılarını açıkça “Lansmanda” durumunda tutan dürüst giriş ekranı
- İlk güvenli girişte D1 ürün hesabı/profili oluşturan, kullanıcı rolü ile admin/editör rolünü sunucu tarafında ayıran kalıcı hesap katmanı
- Üretim ortamında tanımlanan sahip e-postasını idempotent biçimde aktif admin rolüyle eşleyen; kaynak kodda e-posta veya erişim anahtarı tutmayan owner bootstrap
- Varsayılan ilk-kullanıcı-admin davranışını kapatan, yalnız açık legacy ortam bayrağıyla etkinleşebilen fail-closed yönetim yetkisi
- Kullanıcı için beş dashboardı ve yetkili owner/editör için dokuz operasyon panelini tek ekranda görünür ve doğrudan erişilebilir sunan responsive Panel Merkezi
- Landing üzerindeki temsili ürün ön izlemesini D1 tabanlı gerçek dashboardlardan açıkça ayıran demo/gerçek veri sınırı
- Responsive, 3D destekli ürün landing sayfası
- D1 tabanlı futbol veri çekirdeği ve R2 ham veri arşivi
- Football-Data.co.uk public CSV uçlarını yalnız sabit lig/sezon allowlist’i üzerinden alan, yönlendirmeyi kapatan ve dosya boyutunu 3 MB ile sınırlayan araştırma adaptörü
- Süper Lig, Premier League, Bundesliga, La Liga ve Serie A için 2021-22–2025-26 arası 25 sezonluk kontrollü başlangıç kuyruğu
- Her kaynak çekimini HTTP sonucu, ETag/Last-Modified, SHA-256 içerik kimliği, ham R2 anahtarı, adaptör sürümü ve yönetici kimliğiyle D1 provenance defterinde saklayan veri hattı
- Kesin tarihsel capture zamanı bulunmadığı için oran sütunlarını yalnız ham CSV’de koruyan; `oddsSnapshots`, değer hesabı ve öneri kapısına yazmayan güvenlik politikası
- Kaynak revizyon zamanı ve ticari yeniden kullanım hakkı doğrulanana kadar bütün Football-Data importlarını zorunlu `research-only` tutan fail-closed kapı
- Yöneticiye tek sezon veya eksik sezonları sıralı çekme, editöre salt-okunur durum, çekim geçmişi ve Model Lab aktarımı sunan responsive Research Feed konsolu
- Yönetici/analiz editörü için korumalı veri konsolu
- JSON ve kontrollü CSV önizleme/import akışı
- Veri kalite puanı, eşleme incelemesi ve öneri uygunluk kapısı
- Son 5/10 formuna ve oyun dominasyonuna ağırlık veren 1X2 baseline motoru
- Point-in-time denetimi ve kronolojik walk-forward backtest
- Log loss, normalize Brier, ECE, kalibrasyon, CLV ve drawdown ölçümleri
- Değişmez model sürümü, veri/config SHA-256 kimliği ve kalıcı deney geçmişi
- Gerçek D1 maç geçmişinden tahmin anına göre dondurulan, SHA-256 kimlikli feature datasetleri
- Lig bazında geçmiş/stat/oran hazırlık görünümü ve değişmez dataset denetim geçmişi
- Kronolojik takım gücü, ev avantajı ve beraberlik payı kullanan Dynamic Elo benchmarkı
- 180 günlük yarı ömürlü hücum–savunma gücü ve skor matrisi kullanan Poisson benchmarkı
- Poisson gücüne öğrenilen düşük skor rho düzeltmesi ekleyen iki aşamalı Dixon–Coles benchmarkı
- Dört model dalını aynı dataset, aynı walk-forward fold ve aynı OOS metriklerle karşılaştıran araştırma konsolu
- Form taktiğinin sonuç, dominasyon, recency, saha ve `%4/%8/%12` H2H varyantlarını development-only ablation ile karşılaştıran kanıt motoru
- Kronolojik `%60` geliştirme, `%20` kalibrasyon ve en yeni `%20` dokunulmamış holdout ayrımı; dilimler arasında 6 saat sonuç ambargosu
- Kalibrasyon diliminde öğrenilen, yeterli log loss kazancı yoksa reddedilen tek parametreli temperature scaling
- Holdout isabeti için Wilson `%95` güven aralığı; log loss, Brier, ECE, reliability ve deterministik paired-bootstrap karşılaştırması
- Her değişmez dataset için yalnız bir kez dondurulan lig × pazar kanıt kaydı ve tekrar bakmayı engelleyen kalıcı evidence matrix
- Research → Analysis-only → Shadow → Limited yayın akışı; genel yayın yalnız manuel kararla
- Maçtan 72 saat önce açılan, kullanıcı önerisinden kesin olarak ayrılmış izleme kayıtları
- Tahmin, kadro ve kaynak kanıtını SHA-256 kimliğiyle donduran değişmez tahmin sürümleri
- İzleme → final → geri çekildi / süresi doldu geçişlerini append-only olay geçmişinde saklayan durum makinesi
- İki kesin kadro, `%85` veri tamlığı, açık yayın kapısı ve üretim-onaylı kaynak olmadan finali engelleyen kadro sonrası yayın kapısı
- Seçim değişimi, en az `%8` olasılık kayması veya kesin kadro değişiminde final tahmini otomatik geri çekmeye hazırlayan maddi değişiklik protokolü
- Yönetici ve analiz editörü için korumalı, responsive Prediction Ops konsolu
- ChatGPT oturumuyla korunan, mobil ve masaüstü uyumlu kullanıcı dashboardı
- D1 üzerinde kalıcı kullanıcı profili, görünüm tercihi ve kişisel izleme listesi
- Araştırma-only kayıtları kullanıcı yüzeyinden veri katmanında ayıran yayın projeksiyonu
- Hızlı/detaylı maç analizi; 1-X-2 olasılıkları, form, dominasyon, H2H, kadro ve sürüm kanıtı
- Kazanan, kaybeden, void, geri çekilen ve bekleyen tüm final tahminlerini kalıcı gösteren performans geçmişi
- Dönem, lig, pazar, sonuç ve takım/sürüm aramasıyla filtreleme; filtrelenmiş CSV dışa aktarma
- Final maçları gerçek skorla bağlayan değişmez settlement kayıtları ve yönetici sonuçlandırma işlemi
- 1X2 şirket marjını proportional de-vig ile temizleyen, şirketler arası medyan uzlaşıyı normalleştiren bağımsız değer motoru
- Model olasılığını oranlardan kesin olarak ayıran `%4` minimum edge, `%3` minimum EV ve `1.20` minimum oran kapısı
- `1.20–1.29` aralığını ayrı düşük oran değer havuzunda gösteren yayın politikası
- En az iki eksiksiz şirket, 6 saat tazelik ve 24 saat azami yaş sınırı kullanan piyasa kapsamı kontrolü
- Şirketler arası `%8` adil olasılık ayrışması, `%25` göreli oran veya `%8` adil olasılık hareketinde öneriyi durduran anomali kapısı
- Her tahmin sürümü için model, de-vig piyasa uzlaşısı, en iyi oran/şirket, edge, EV, tazelik ve kanıt SHA’sını D1’de değişmez saklayan değer defteri
- Yönetici ve analiz editörü için korumalı, responsive Value Ops konsolu
- Dashboard, detaylı maç analizi, performans tablosu ve CSV dışa aktarımında dondurulmuş oran/değer kanıtı
- Sakat/cezalı oyuncu, önemli oyuncu formu, teknik direktör görev süresi, dinlenme, seyahat, hava, zemin ve derbi kanıtını point-in-time snapshot olarak saklayan bağlam katmanı
- Eksik veya altı saatten eski bağlamda öneriyi kapatan; doğrulanmış bağlam etkisini tek sonuçta en fazla `%8` olasılık kaymasıyla sınırlayan yeniden skor motoru
- Derbi, hava, zemin ve yeni teknik direktörü yön varsayımı olarak kullanmak yerine olasılıkları merkeze daraltan belirsizlik protokolü
- Taban olasılık ile bağlam sonrası olasılığı aynı değişmez tahmin sürümünde ayrı ayrı saklayan bağlam provenance zinciri
- Yönetici ve analiz editörü için yapılandırılmış kanıt girişi, snapshot geçmişi ve yeni tahmin sürümü üretimi sunan korumalı Context Ops konsolu
- Temkinli, dengeli ve atak risk profilleri için çeyrek-Kelly hesaplayan; tekli bahiste mutlak `%2`, kuponda `%0,75` üst sınırı uygulayan kasa motoru
- Kullanıcının açılış, ekleme ve çıkarma hareketlerini idempotent ve append-only D1 defterinde tutan kişisel kasa alanı
- Aynı maçtan iki seçim, tekrar eden takım, lig yoğunlaşması ve düşük oran yoğunlaşmasını engelleyen deterministik kupon korelasyon motoru
- Değer kapısını geçen seçimlerden en iyi tekliler, 3 maçlık dengeli ve 4–6 maçlık yüksek oran alternatifleri üreten; oran/olasılık snapshotıyla kupon taslağı saklayan kullanıcı çalışma alanı
- Gerçek para veya ödeme hareketi yapmadığını açıkça belirten tracking-only sorumlu kullanım sınırı
- Final analiz, değer fırsatı ve maddi geri çekmeyi ayrı olay türleri olarak yönlendiren saf bildirim sözleşmesi
- Araştırma-only ve önemsiz olayları teslim etmeden `suppressed` kanıtıyla saklayan güvenlik filtresi
- Tahmin olayından D1 outbox’a, kullanıcı hedefinden kanal teslimine kadar idempotent ve yeniden denenebilir bildirim defteri
- Okunma durumu ve olay tercihleri D1’de saklanan korumalı web içi bildirim merkezi
- VAPID anahtarı ve cihaz aboneliği varsa gerçek Web Push gönderen service worker + sunucu adaptörü
- Bot token, webhook sırrı ve 10 dakikalık tek kullanımlık kodla bağlanan Telegram teslim adaptörü
- Kanal yapılandırması eksikse başarı yazmayan; `configuration_required`, `skipped`, `partial` ve `failed` durumlarını ayrı izleyen teslim politikası
- Yönetici ve analiz editörü için uzlaştırma, kuyruk işleme, yeniden deneme ve kanal sağlık görünümü sunan Notification Ops konsolu
- Aynı e-postayı çoğaltmayan, 18+ / sorumlu kullanım / asgari veri onayı isteyen public beta bekleme listesi
- Davet, aktif, bekleyen ve askıdaki beta erişimini paket durumundan ayrı tutan üyelik sözleşmesi
- Beş soruluk deterministik risk profili; kayıp kovalama veya sınırsız tutar yanıtında otomatik Temkinli güvenlik limiti
- Risk profilinin model olasılıklarını hiçbir koşulda değiştirmediğini koruyan üyelik ve kasa sınırı
- Free, Pro ve Expert için sunucu tarafında ortak kullanılan analiz, geçmiş, kupon, export ve bildirim entitlement matrisi
- Free için yerel saat dilimine göre günlük üç farklı maç analizi; aynı maçı tekrar açmayı yeniden saymayan D1 kullanım defteri
- Pro için detaylı analiz, dengeli kupon, tam standart geçmiş, CSV ve browser push; Expert için gelişmiş istatistik, yüksek oran kuponu, gelişmiş export ve Telegram
- Beta boyunca kart istemeyen, tek kullanımlık ve tam 72 saat süren Pro deneme yaşam döngüsü
- Onboarding, risk testi, trial başlangıcı/bitişi ve erişim değişikliklerini append-only üyelik olaylarında saklayan denetim izi
- Kullanıcı için üyelik/profil merkezi; yönetici için PII-korumalı, salt-okunur waitlist ve Member Ops konsolu
- Public erişim, beta bayrağı, desteklenen kimlik, e-posta relay’i, scheduler, token şifreleme, ağ hız limiti ve canonical origin birlikte doğrulanmadan davetleri açmayan sekiz maddeli fail-closed hazırlık kapısı
- İlk beta için yönetici tarafından 100–300 arasında ayarlanan; aktif kullanıcı ve gönderilmemiş/gönderilmiş davetleri atomik olarak birlikte sayan kapasite rezervasyonu
- Yalnız SHA-256 lookup hash’i ve AES-GCM ciphertext’i saklanan, açık metni hiçbir yönetici API’sine dönmeyen, tam 72 saatlik tekil davet tokenı
- Davet edilen e-posta ile ChatGPT SIWC oturum e-postasının birebir eşleşmesini zorunlu tutan idempotent kabul ve onboarding geçişi
- Yapılandırılabilir HTTPS e-posta relay’i, en fazla üç teslim denemesi, geri alma/yeniden deneme ve kalıcı teslim durumu sunan davet outbox’ı
- Global, e-posta ve gizli anahtarla hash’lenen ağ kapsamlarında sabit pencereli public waitlist hız limiti; ham IP adresini saklamayan veri minimizasyonu
- Süresi dolan davetleri ve 72 saatlik Pro trial’ları kapatan, hız limiti kovalarını temizleyen ve davet kuyruğunu işleyen secret-authenticated bakım endpoint’i
- Yöneticiye yazma, analiz editörüne salt-okunur görünüm veren kapasite, hazırlık matrisi, waitlist, davet outbox’ı ve operasyon geçmişi içeren Member Ops konsolu
- Google, Apple ve e-posta/şifre girişini sahte OAuth akışı üretmeden dış kimlik sağlayıcısı aktivasyon kapısında tutan platform sözleşmesi; mevcut Sites çalışma yolunda yalnız ChatGPT SIWC desteklenir

## Sürüm ve checkpoint yol haritası

| Sürüm | Checkpoint | Kapsam | Durum |
| --- | --- | --- | --- |
| v0.1 | CP01–CP03 | Responsive landing, mobil yüzen panel, gerçek 3D futbol topu | Tamamlandı |
| v0.2 | CP04–CP05 | D1/R2 veri çekirdeği, kontrollü JSON/CSV importu, veri sağlığı ve eşleme incelemesi | Tamamlandı |
| v0.3.1 | CP06 | Form + dominasyon baseline, sızıntı denetimi, walk-forward ve yayın kapıları | Tamamlandı |
| v0.3.2 | CP07 | Gerçek D1 point-in-time dataset builder ve değişmez provenance | Tamamlandı |
| v0.3.3 | CP08 | Elo ve Poisson/Dixon–Coles karşılaştırma modelleri | Tamamlandı |
| v0.3.4 | CP09 | Ablation, kalibrasyon, holdout ve lig × pazar kanıt matrisi | Tamamlandı |
| v0.4.0 | CP10 | Değişmez tahmin sürümleri, izleme/final/geri çekme durum makinesi ve Prediction Ops | Tamamlandı |
| v0.4.1 | CP11 | Kullanıcı dashboardı, maç analizi ve filtrelenebilir, şeffaf performans geçmişi | Tamamlandı |
| v0.5.0 | CP12 | De-vig piyasa uzlaşısı, değişmez oran/değer kanıtı ve anomali kontrolleri | Tamamlandı |
| v0.5.1 | CP13 | Kadro/bağlam yeniden skoru, kupon korelasyon kontrolü ve çeyrek-Kelly kasa defteri | Tamamlandı |
| v0.5.2 | CP14 | İdempotent outbox, web içi bildirim merkezi, Web Push/Telegram adaptörleri ve Notification Ops | Tamamlandı |
| v0.6.0 | CP15 | Waitlist, onboarding/risk testi, Free–Pro–Expert entitlement ve kartsız 72 saatlik deneme temeli | Tamamlandı |
| v0.6.1 | CP16 | Fail-closed davet/kapasite operasyonu, şifreli token, rate limit, teslim outbox’ı ve zamanlayıcı sözleşmesi | Tamamlandı |
| v0.7.0-alpha.1 | CP17A | Allowlist public CSV adaptörü, R2 ham arşiv, D1 provenance, 25 sezonluk araştırma kuyruğu ve backtest bootstrap konsolu | Tamamlandı |
| v0.7.0-alpha.2 | CP17B | Birleşik giriş/kayıt akışı, D1 hesap başlangıcı, env-tanımlı owner rolü ve kullanıcı + admin Panel Merkezi | Tamamlandı |
| v0.7.0-alpha.3 | CP17C | Gerçek veri üzerinde kalıcı sıralı dataset/backtest kampanyaları, fail-closed shadow readiness, drift ve lig × model karşılaştırması | Tamamlandı |
| v0.7.0-alpha.4 | CP17D | Saatlik gerçek fikstür/sonuç toplama, değişmez ileri-zaman gözlemleri ve lig bazlı Forward Shadow konsolu | Tamamlandı |
| v0.7.0-alpha.5 | CP17E | Ayrı saatlik tarihsel kampanya worker’ı, D1 iş ayrımı ve kademeli backtest ilerleme konsolu | Tamamlandı |
| v0.7.0-alpha.6 | CP17F | Repo-sınırlı deploy key, fast-forward checkpoint mirror, HTTPS tüneli ve yeniden-deneme durumu | Tamamlandı |
| v0.7.0-alpha.7 | CP17G | D1 tabanlı otomasyon sağlığı, süre/hata geçmişi ve lig × aşama Research Observatory | Tamamlandı |
| v0.7.0-alpha.8 | CP17H | Forward + tarihsel worker için birleşik fail-closed Research Operations Gate ve açık blocker kodları | Tamamlandı |
| v0.7.0-alpha.9 | CP17I | CI, CodeQL, Dependabot, üretim güvenlik başlıkları, migration/secret doğrulaması ve secret-safe launch readiness | Tamamlandı |
| v0.7.0-alpha.10 | CP17J | Değişmez prediction lineage manifesti, kaynak/run/R2/feature/model/yayın zinciri ve fail-closed Data Lineage gezgini | Tamamlandı |
| v0.7.0-alpha.11 | CP17K | Fail-closed lig–kaynak onboarding kalite puanı, değişmez snapshot ve korumalı kalite konsolu | Tamamlandı |
| v0.7.0-alpha.12 | CP17L | Sürüm bazlı değişmez model kartları, OOS/holdout/release kanıtı ve belge-only yönetişim konsolu | Tamamlandı |
| v0.7.0-alpha.13 | CP17M | Bugünün gerçek fikstürleri, kaynak tazeliği, araştırma model yönü ve fail-closed öneri ayrımı | Tamamlandı |
| **v0.7.0-alpha.14** | **CP17N** | **Owner hesabının Admin + Expert eşlenmesi ve canlı API secret’ının Worker runtime’a bağlanması** | **Mevcut** |
| v1.0 | CP18 | Hukuk/veri lisansı/şirket/ödeme kapıları geçilirse ücretli web lansmanı | Koşullu |
| v2.0 | — | Web MVP doğrulandıktan sonra iOS ve Android istemcileri | Gelecek |

Ücretli veya herkese açık beta öncesindeki dış bağımlılık kapıları: 3–5 lisanslı pilot lig kaynağı, public site erişimi, public üretim kimlik sağlayıcısı, e-posta relay’i, zamanlayıcı, veri revizyon zamanları, şirket/ödeme altyapısı ve ülke bazlı hukuk incelemesidir. CP17A gerçek tarihsel maç verisiyle model araştırmasını başlatır; CP17B bütün gerçek panelleri tek erişim merkezinde görünür kılar; CP17C araştırma verisini yeniden başlatılabilir dataset/backtest/stabilite kampanyalarına bağlar; CP17D sonuç bilinmeden önce ileri-zaman gözlemi biriktirir; CP17E tarihsel kampanyaları kademeli ve otomatik ilerletir. Bu kayıtlar tek başına ticari yayın izni değildir. Kapılar kapanmadan model araştırması ilerleyebilir, kullanıcı daveti ve bahis önerisi yayını ilerleyemez.

## Model güvenlik kuralları

1. Özellikler ve oranlar tahmin anından sonra üretilemez.
2. Eğitim sonuçları, test döneminden önce bilinmiş ve embargo süresini geçmiş olmalıdır.
3. Başlangıç eğitim penceresi başarı metriğine katılmaz; yalnız out-of-sample tahminler ölçülür.
4. H2H ağırlığı varsayılan olarak `0` ve backtest ile kanıtlansa bile en fazla `%12` olabilir.
5. Oran tahmini belirlemez; yalnız minimum `1.20` ve değer filtresinde kullanılır.
6. Kasa simülasyonu çeyrek Kelly kullanır ve tek seçimde mutlak `%2` tavanını aşamaz.
7. Gelişmiş veri tamlığı `%85` altındaki maç analiz edilir fakat öneri havuzuna giremez.
8. Sentetik QA koşuları hiçbir gerçek lig yayın kapısını yükseltemez.
9. Kaynak revizyon zamanı doğrulanmamış tarihsel datasetler yalnız araştırma amaçlıdır ve hiçbir yayın kapısını yükseltemez.
10. Ablation ve model seçimi yalnız geliştirme diliminde, temperature scaling yalnız kalibrasyon diliminde yapılır.
11. En yeni holdout seçime geri beslenmez; holdout lideri yalnız rapordur ve üretim tercihi değildir.
12. H2H varyantı en az 400 geliştirme örneği ve önceden tanımlı log loss/Brier eşiği olmadan seçilemez.
13. Aynı değişmez dataset için tamamlanan evidence koşusu yeniden hesaplanmaz; mevcut denetim kaydı geri döndürülür.
14. Kaynak revizyon zamanları doğrulanmadığı sürece tüm kanıt hücreleri `blocked` ve research-only kalır.
15. Otomasyon genel öneri aşamasına geçemez.
16. Yayınlanmış bir tahmin güncellenemez veya silinemez; her yeniden skor ayrı sürüm, her durum değişikliği ayrı olaydır.
17. İzleme kaydı kullanıcı önerisi değildir; final etiketi yalnız kesin kadro ve tüm yayın kapıları birlikte geçildiğinde verilebilir.
18. Final tahminde seçim/kadro değişimi veya en az `%8` olasılık kayması geri çekme olayı üretir; eski sürüm denetim geçmişinde kalır.
19. Araştırma-only tahminler kullanıcı sorgularında filtrelenir; yalnız yayın kapısını geçmiş sürümler dashboarda taşınabilir.
20. Final sonuçları tahmin sürümü ve yayın olayı başına yalnız bir kez yazılır; kazanan veya kaybeden kayıt sonradan silinemez.
21. Model olasılıkları oran verisiyle yeniden yazılamaz; oran yalnız de-vig piyasa karşılaştırması, değer filtresi ve anomali kapısıdır.
22. Değer fırsatı için en az iki taze ve eksiksiz 1X2 şirket snapshotı, en az `%4` edge, `%3` EV ve `1.20` oran birlikte gerekir.
23. Şirket ayrışması veya maddi oran hareketi tahmini silmez; bahis uygunluğunu kapatır ve yeni sürüm kanıtında görünür kalır.
24. Her yayın geçmişi kendi tahmin sürümüne bağlı oran/değer snapshotını taşır; sonraki oran değişimi geçmiş kaydı yeniden yazamaz.
25. Bağlam snapshotı yoksa taban olasılık korunur; eksik veri sıfırla doldurulmaz ve öneri kapısı açılmaz.
26. Bağlam yeniden skoru tek sonuçta en fazla `%8` olasılık kayması üretebilir; yönü kanıtlanamayan hava, zemin, derbi ve teknik direktör değişimi yalnız belirsizliği artırır.
27. Bağlam snapshotı tahmin anından sonra veya kickoff sonrasında yakalanamaz; altı saatten eski ya da `%80` altı tamlıktaki bağlam öneriye uygun değildir.
28. Kasa önerisi çeyrek-Kelly kullanır; negatif edge her risk profilinde sıfır stake üretir ve risk profili model olasılığını değiştiremez.
29. Aynı maçtan iki seçim, tekrar eden takım veya ikiden fazla aynı lig seçimi otomatik kupona giremez.
30. Kasa alanı gerçek para tutmaz ve bahis şirketine işlem göndermez; tüm bakiyeler kişisel takip defteridir.
31. Araştırma-only tahmin olayları hiçbir kullanıcı kanalına teslim edilemez; bastırma gerekçesi outbox defterinde kalır.
32. Final olmayan veya maddi olmayan değişiklikler anlık bildirim üretemez; geri çekme yalnız yaşam döngüsü olayından türetilir.
33. Bildirim olayı, kullanıcı kaydı ve her kanal teslimi idempotent anahtarla yazılır; yeniden deneme aynı bildirimi çoğaltamaz.
34. Web Push veya Telegram çalışma sırları eksikse teslim başarılı gösterilemez; yapılandırma gereksinimi ayrı durum olarak saklanır.
35. Telegram bot tokenı, webhook sırrı ve Web Push private key’i kaynak koduna veya kullanıcı API yanıtına yazılamaz.
36. Risk profili model olasılığını değiştiremez; yalnız görünüm, kupon ve çeyrek-Kelly üst limitlerini sınırlar.
37. Free günlük analiz limiti sunucu tarafında, kullanıcının saat diliminde ve farklı fikstür bazında uygulanır; aynı fikstürü yeniden açmak kotayı tekrar tüketmez.
38. Bekleme listesine kayıt ürün erişimi vermez; normal kullanıcı için aktif davet ve tamamlanmış onboarding birlikte gerekir.
39. Beta Pro denemesi tek kullanımlık, kartsız ve tam 72 saattir; süre sonunda ücret veya otomatik abonelik oluşmaz.
40. Paket kısıtları yalnız arayüzde gizlenmez; geçmiş, kupon ve dış bildirim işlemleri sunucu tarafında aynı entitlement sözleşmesiyle doğrulanır.
41. Beta daveti sekiz dış hazırlık kapısının tamamı açıkça doğrulanmadan etkinleştirilemez; eksik konfigürasyon başarısız değil hazır gibi gösterilemez.
42. Davet tokenının açık metni D1’de, loglarda, yönetici yanıtlarında veya Git geçmişinde tutulamaz; lookup için hash, kontrollü yeniden teslim için AES-GCM ciphertext kullanılır.
43. Beta kapasitesi 100–300 aralığındadır; aktif kullanıcılar ile etkin davet rezervasyonları aynı atomik ekleme sorgusunda birlikte sayılır.
44. Davet kabulü yalnız token etkin, süre dolmamış ve oturum e-postası davet e-postasıyla eşleşmişse yapılabilir; tekrar kabul aynı üyelik olayını çoğaltamaz.
45. Scheduler ve ağ hız limiti sırları en az 32 karakter olmalı, kaynak koda yazılmamalı ve public API yanıtlarına dönmemelidir.
46. Haricî araştırma çekimleri yalnız derleme zamanında sabitlenmiş lig ve sezon allowlist’inden üretilebilir; istemci URL, host veya path gönderemez ve yönlendirme izlenmez.
47. Football-Data CSV’sindeki tarihsel oran kolonları kesin capture zamanı taşımadığı için `oddsSnapshots` tablosuna, değer motoruna veya yayın kanıtına yazılamaz; yalnız değişmez ham dosyada kalır.
48. Kaynak revizyon zamanı ve ticari yeniden kullanım izni açıkça doğrulanmadığı sürece bu adaptörden gelen her ingestion zorunlu research-only kalır ve recommendation-eligible olamaz.
49. Her haricî çekim dosya boyutu, içerik şeması, lig kodu, skor–sonuç tutarlılığı ve tekrar fikstür açısından doğrulanmalı; ham dosya SHA-256 ile R2’de, provenance kaydı D1’de saklanmalıdır.
50. Tarihsel Research Feed sayfa açılışında kendiliğinden veri çekemez; mutasyon yalnız admin eylemi veya derleme-zamanı allowlist’ine bağlı sabit tarihsel worker ile başlar. Editör salt-okunur kalır; istemci kaynak URL’si veya serbest lig/sezon gönderemez.
51. CP17C kampanyası her istekte yalnız bir ağır aşama çalıştırır; kaynak, dataset, benchmark, evidence ve stabilite bağlantıları D1’de kalıcı tutulur ve sayfa kapanması zinciri sıfırlayamaz.
52. Aynı değişmez dataset için güncel dört benchmark koşusu varsa yeni koşu üretilmez; model başına tamamlanmış kayıt idempotent biçimde yeniden kullanılır.
53. Retrospektif erken/geç dönem stabilitesi, sonuçtan önce kaydedilmiş ileri-zaman shadow performansı sayılamaz; `forwardObserved=false` iken yayın uygunluğu her metrikte `blocked` kalır.
54. Ticari kullanım, revizyon zamanı veya kanıt koşusu eksikliği metrik kartından gizlenemez; her engel koduyla birlikte değişmez shadow validation sonucunda saklanır.
55. Forward Shadow gözlemi yalnız tahmin sürümü ve gözlem kaydı kickoff’tan önce, feature cutoff tahmin anından geç değilse geçerlidir; fixture başına yalnız ilk kayıt korunur.
56. Saatlik araştırma worker’ı tur başına en fazla altı tahmin sürümü oluşturabilir, aynı anda ikinci tur başlatamaz ve zaman aşımına uğrayan kilidi başarısız kayıt bırakarak serbest bırakır.
57. Fikstür akışındaki oranlar tahmini değiştiremez; upstream capture zamanı doğrulanmadığı için yalnız research snapshot olarak kalır ve recommendation-eligible olamaz.
58. Bir lig için en az 40 sonuçlanmış gerçek ileri-zaman gözlemi, iki 20’lik zaman penceresi ve bütün kalite/drift kapıları tamamlanmadan forward stabilite adayı üretilemez.
59. Tarihsel worker her saat `:47` için tek kampanya aşaması ilerletir; `:17` forward worker’ıyla kilit paylaşmaz, bütün tur ve hata sonuçlarını iş türüyle D1’e yazar ve retrospektif sonucu hiçbir zaman forward gözlem gibi işaretleyemez.
60. Tahmin lineage manifestindeki kaynak/run/R2/feature/model/yayın bağlarından biri eksik veya doğrulanamazsa zincir fail-closed bloklanır; tam lineage kaydı tek başına kullanıcı önerisi ya da ticari yayın uygunluğu üretemez.
61. Lig onboarding puanı yalnız araştırma hazırlığını belgeler; lisans, kimlik, geçmiş, gelişmiş veri, oran zamanı veya SLA blocker’ı varken hazır sayılamaz ve hiçbir puan öneri kapısını açamaz.
62. Model kartı yalnız model sürümünün mevcut kanıtını belgeler; eksik dataset/backtest/holdout/release bağı kartı bloklar ve belgelenmiş kart dahi model statüsünü veya öneri/release kapısını değiştiremez.

## Teknoloji

- Next.js 16, React 19, TypeScript ve Vinext
- Cloudflare Sites/Workers, D1 ve R2
- Drizzle ORM ve sürümlü SQLite migration’ları
- GSAP, Three.js ve standart Web Push
- Node test runner ve ESLint

## GitHub checkpoint mirror

Sites `origin` deposu birincil ve değişmez kaynak olmaya devam eder. Repo-sınırlı
GitHub deploy key çalışma alanında hazır olduğunda `.githooks/post-commit`, her
yeni checkpoint commit’ini GitHub’ın resmî SSH-over-HTTPS `443` yoluyla
`oewinchester/FormEdge` deposunun
`main` dalına yalnız fast-forward olarak gönderir. Force-push yapılmaz; GitHub
geçici olarak erişilemezse Sites checkpoint’i engellenmez, durum `.git` altında
`pending` kaydedilir ve sonraki checkpoint’te yeniden denenir.

- `npm run mirror:setup`: sabit GitHub remote’unu, doğrulanmış host anahtarlarını
  ve versioned hook yolunu hazırlar. Kısıtlı çalışma ortamlarında GitHub’ın
  `ssh.github.com:443` kanalı mevcut HTTPS CONNECT tünelinden geçirilir.
- `npm run mirror:push`: bekleyen commit’i elle yeniden gönderir.
- `npm run mirror:status`: son eşzamanlama durumunu gösterir.

Deploy key hiçbir zaman kaynak dosyalarına, Git remote URL’sine, loglara veya
commit geçmişine yazılmaz.

## Veri depolama mimarisi

- **D1 ana ilişkisel veritabanıdır:** lig, takım, fikstür, istatistik, oran ve bağlam snapshotları, de-vig değer kanıtı, model kanıtı, doğrulama kampanyaları, shadow stabilite sonuçları, saatlik araştırma koşuları, değişmez forward gözlemleri, tahmin yaşam döngüsü, waitlist, şifreli beta davetleri, kapasite ayarı, hız limiti kovaları, erişim operasyon koşuları, kullanıcı profili, risk testi, üyelik olayları, günlük özellik kullanımı, tercih, izleme listesi, kasa/kupon defteri, performans settlement kayıtları, bildirim outbox’ı ve kanal teslimleri burada tutulur.
- **R2 ham ve büyük nesne katmanıdır:** kaynak snapshotları, allowlist üzerinden çekilen değişmez tarihsel ve yaklaşan fikstür CSV’leri, kontrollü import dosyaları ve gelecekte üretilecek PDF/CSV dışa aktarımları burada tutulur.
- MVP için ayrı bir PostgreSQL veya analitik veritabanı gerekmez. Trafik ve tarihsel hacim D1 sorgu sınırlarını anlamlı biçimde aşarsa yalnız raporlama amaçlı bir warehouse eklenir; ürünün doğruluk kaynağı D1 kalır.
- Tarayıcı depolaması kalıcı ürün verisi için kullanılmaz; yalnız geçici arayüz durumu için kullanılabilir.

## Dış bildirim kanalı aktivasyonu

- Web Push için üretim ortamında `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` ve `VAPID_SUBJECT` gerekir. Yalnız public key kullanıcı API’sine dönebilir.
- Telegram için `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` ve `TELEGRAM_WEBHOOK_SECRET` gerekir. Telegram webhook hedefi `/api/integrations/telegram/webhook` rotasıdır.
- Bu değerlerin hiçbiri kaynak koda veya Git geçmişine yazılmaz. Eksik yapılandırma `configuration_required` olarak görünür; başarılı teslim gibi sayılmaz.
- Zamanlayıcı bağlanana kadar yeni outbox kayıtları Notification Ops üzerinden uzlaştırılıp işlenebilir. Otomatik periyodik işleme davetli beta açılmadan önce zorunlu operasyon kapısıdır.

## Kontrollü beta aktivasyonu

CP16 davet operasyonunu varsayılan olarak kapalı getirir. Açılabilmesi için üretim ortamında aşağıdaki değerlerin tamamı gerekir:

- `PUBLIC_SITE_ACCESS_CONFIRMED=true` ve `PUBLIC_BETA_ENABLED=true`
- Mevcut Sites kimlik yolu için `PUBLIC_IDENTITY_PROVIDER=chatgpt_siwc`; Google, Apple ve e-posta/şifre ayrı sağlayıcı entegrasyonu tamamlanana kadar planlı kalır
- HTTPS canonical adresi için `PUBLIC_APP_ORIGIN`
- Relay sözleşmesi için `INVITE_EMAIL_ENDPOINT`, `INVITE_EMAIL_TOKEN` ve `INVITE_EMAIL_FROM`
- Birbirinden bağımsız, en az 32 karakterlik `INVITE_TOKEN_SECRET`, `WAITLIST_RATE_LIMIT_SECRET` ve `MEMBERSHIP_SCHEDULER_SECRET`

Scheduler, `POST /api/integrations/membership/scheduler` isteğinde `x-formedge-scheduler-secret` başlığını doğrular. Hiçbir secret kaynak koda, migration’a veya istemci yanıtına yazılmaz.

## Ana dizinler

```text
app/                         Ürün, yönetici ekranları ve korumalı API rotaları
db/                          D1 şeması ve bağlantı katmanı
drizzle/                     Değişmez veritabanı migration’ları
lib/model-lab.ts             Saf feature, backtest ve yayın kararı çekirdeği
lib/model-lab-store.ts       Kalıcı model/deney/yayın kapısı kayıtları
lib/point-in-time-dataset.ts Saf ve deterministik tarihsel dataset üreticisi
lib/point-in-time-dataset-store.ts D1 dataset/provenance kayıt zinciri
lib/benchmark-models.ts      Elo, Poisson ve iki aşamalı Dixon–Coles çekirdeği
lib/benchmark-suite-store.ts Aynı dataset üzerinde dört dallı deney orkestrasyonu
lib/evidence-lab.ts          Ablation, kalibrasyon ve temporal holdout çekirdeği
lib/evidence-lab-store.ts    Tek-seferlik kanıt koşusu ve lig × pazar matrisi
lib/shadow-validation.ts     Saf erken/geç dönem kalite, drift ve fail-closed blocker motoru
lib/shadow-validation-store.ts D1 kampanya kuyruğu, aşama orkestrasyonu ve değişmez stabilite sonuçları
lib/prediction-lifecycle.ts  Saf durum makinesi, final kapısı ve maddi değişiklik protokolü
lib/prediction-lifecycle-store.ts D1 tahmin sürümü, olay günlüğü ve operasyon projeksiyonu
lib/prediction-settlement-store.ts Final yayınları gerçek maç sonucuyla değişmez biçimde bağlayan settlement akışı
lib/user-dashboard-store.ts      Kullanıcı profili, izleme, maç analizi ve performans projeksiyonu
lib/user-performance.ts          Saf sonuçlandırma ve performans özetleme kuralları
lib/value-engine.ts              Saf de-vig, piyasa uzlaşısı, değer ve anomali motoru
lib/value-assessment-store.ts    Tahmin sürümüne bağlı değişmez D1 değer kanıtı ve Value Ops projeksiyonu
lib/context-engine.ts            Sınırlandırılmış bağlam yeniden skoru ve bağlam yayın kapısı
lib/context-ops-store.ts         Değişmez D1 bağlam snapshotı ve Context Ops projeksiyonu
lib/bankroll-engine.ts           Çeyrek-Kelly, risk profili ve açık risk üst limitleri
lib/coupon-engine.ts             Aynı maç/takım/lig korelasyon korumaları ve deterministik alternatifler
lib/bankroll-store.ts            Kullanıcı kasa defteri, stake projeksiyonu ve kupon taslakları
lib/notification-engine.ts       Saf olay yönlendirme, kanal planlama ve outbox durum sözleşmesi
lib/notification-store.ts        D1 outbox, web içi kayıt, Web Push/Telegram adaptörleri ve Notification Ops
lib/membership-engine.ts         Risk testi, Free/Pro/Expert entitlement ve 72 saatlik trial sözleşmesi
lib/membership-store.ts          Waitlist, onboarding, üyelik olayları, kullanım limiti ve Member Ops D1 akışı
lib/beta-access-engine.ts        Kapasite, hazırlık, davet süresi ve kabul için saf fail-closed sözleşme
lib/beta-access-store.ts         Şifreli davet outbox’ı, rate limit, scheduler ve kontrollü beta D1 operasyonları
lib/football-data-source.ts      Allowlist URL üretimi ve saf Football-Data CSV doğrulama/normalizasyon adaptörü
lib/football-data-source-store.ts Haricî çekim, R2 ham arşiv, D1 provenance ve research-only import orkestrasyonu
lib/football-data-fixture-feed.ts Yaklaşan fikstür ve araştırma 1X2 snapshotlarını normalize eden saf allowlist adaptörü
lib/research-automation-store.ts Saatlik fikstür/sonuç toplama, tahmin kilitleme, settlement ve forward-shadow projeksiyonu
lib/league-onboarding-quality.ts Saf lig–kaynak onboarding puanı, eşikler ve fail-closed blocker sözleşmesi
lib/league-onboarding-store.ts Canlı kalite kanıtı, değişmez D1 snapshot’ı ve yönetim projeksiyonu
lib/model-card.ts             Saf sürüm bazlı model kartı, bulgu ve belge-only yönetişim sözleşmesi
lib/model-card-store.ts       Canlı model kanıtı, değişmez D1 snapshot’ı ve yönetim projeksiyonu
lib/user-account-store.ts        Ürün profili ve kullanıcı tercihleri için idempotent hesap başlangıcı
lib/admin-data.ts            Veri alımı, kalite ve yönetici yetkilendirmesi
tests/                       Veri ve model güvenlik testleri
```

## Yerel doğrulama

Node.js `>=22.13.0` gerekir.

```bash
npm run install:ci
npm run lint
npm run build
node --test tests/*.test.mjs
```

Şema değişikliğinden sonra yeni migration üretmek için:

```bash
npm run db:generate
```

## Beta kapsamı

İlk sürüm web tabanlı ve davetli 100–300 kullanıcıya yöneliktir. Futbol veri kaynakları yalnız kullanım hakkı ve hukuki durumu incelenmiş kontrollü adaptörler üzerinden sisteme alınır. Mobil iOS/Android istemcileri web MVP doğrulandıktan sonra planlanmaktadır.

## Sorumlu kullanım

FormEdge kesin kazanç vaadi sunmaz. Olasılıklar belirsizlik içerir; risk seviyeleri, geçmiş kayıplar ve model performansı kullanıcıdan saklanmaz. Ürün yalnız yasal yaş ve mevzuat koşullarının sağlandığı pazarlarda sunulmalıdır.
