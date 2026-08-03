# FormEdge

**Football intelligence, calibrated.**
FormEdge; maç formu, oyun üstünlüğü ve bağlamsal verileri olasılık tahminlerine dönüştürmek üzere geliştirilen Türkçe/İngilizce futbol analiz platformudur.

> Beta ilkesi: Bir model yüksek isabet gösterse bile zaman sızıntısı, kalibrasyon ve lig × pazar yayın kapılarını geçmeden bahis önerisi üretemez.

## Mevcut checkpoint

**v0.7.0-alpha.1 · Checkpoint 17A · Aşama 7 / Research Data Feed & Backtest Bootstrap**

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
| **v0.7.0-alpha.1** | **CP17A** | **Allowlist public CSV adaptörü, R2 ham arşiv, D1 provenance, 25 sezonluk araştırma kuyruğu ve backtest bootstrap konsolu** | **Mevcut** |
| v0.7.0-alpha.2 | CP17B | Gerçek veri üzerinde sıralı dataset/backtest koşuları, shadow validation, drift ve lig × model karşılaştırması | Planlandı |
| v1.0 | CP18 | Hukuk/veri lisansı/şirket/ödeme kapıları geçilirse ücretli web lansmanı | Koşullu |
| v2.0 | — | Web MVP doğrulandıktan sonra iOS ve Android istemcileri | Gelecek |

Ücretli veya herkese açık beta öncesindeki dış bağımlılık kapıları: 3–5 lisanslı pilot lig kaynağı, public site erişimi, üretim kimlik sağlayıcısı, e-posta relay’i, zamanlayıcı, veri revizyon zamanları, şirket/ödeme altyapısı ve ülke bazlı hukuk incelemesidir. CP17A gerçek tarihsel maç verisiyle model araştırmasını başlatır; kaynağı üretim lisanslı veya tarihsel oranları point-in-time kanıtlı gibi göstermez. Kapılar kapanmadan model araştırması ilerleyebilir, kullanıcı daveti ve bahis önerisi yayını ilerleyemez.

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
50. Research Feed sayfa açılışında veya zamanlayıcıyla kendiliğinden haricî veri çekemez; mutasyon yalnız admin eylemiyle başlar, editör salt-okunur kalır ve kullanıcı başına saatlik sınır uygulanır.

## Teknoloji

- Next.js 16, React 19, TypeScript ve Vinext
- Cloudflare Sites/Workers, D1 ve R2
- Drizzle ORM ve sürümlü SQLite migration’ları
- GSAP, Three.js ve standart Web Push
- Node test runner ve ESLint

## Veri depolama mimarisi

- **D1 ana ilişkisel veritabanıdır:** lig, takım, fikstür, istatistik, oran ve bağlam snapshotları, de-vig değer kanıtı, model kanıtı, tahmin yaşam döngüsü, waitlist, şifreli beta davetleri, kapasite ayarı, hız limiti kovaları, erişim operasyon koşuları, kullanıcı profili, risk testi, üyelik olayları, günlük özellik kullanımı, tercih, izleme listesi, kasa/kupon defteri, performans settlement kayıtları, bildirim outbox’ı ve kanal teslimleri burada tutulur.
- **R2 ham ve büyük nesne katmanıdır:** kaynak snapshotları, allowlist üzerinden çekilen değişmez araştırma CSV’leri, kontrollü import dosyaları ve gelecekte üretilecek PDF/CSV dışa aktarımları burada tutulur.
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
