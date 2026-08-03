# FormEdge

**Football intelligence, calibrated.**
FormEdge; maç formu, oyun üstünlüğü ve bağlamsal verileri olasılık tahminlerine dönüştürmek üzere geliştirilen Türkçe/İngilizce futbol analiz platformudur.

> Beta ilkesi: Bir model yüksek isabet gösterse bile zaman sızıntısı, kalibrasyon ve lig × pazar yayın kapılarını geçmeden bahis önerisi üretemez.

## Mevcut checkpoint

**v0.4.0 · Checkpoint 10 · Aşama 4 / Prediction Lifecycle**

- Responsive, 3D destekli ürün landing sayfası
- D1 tabanlı futbol veri çekirdeği ve R2 ham veri arşivi
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

## Sürüm ve checkpoint yol haritası

| Sürüm | Checkpoint | Kapsam | Durum |
| --- | --- | --- | --- |
| v0.1 | CP01–CP03 | Responsive landing, mobil yüzen panel, gerçek 3D futbol topu | Tamamlandı |
| v0.2 | CP04–CP05 | D1/R2 veri çekirdeği, kontrollü JSON/CSV importu, veri sağlığı ve eşleme incelemesi | Tamamlandı |
| v0.3.1 | CP06 | Form + dominasyon baseline, sızıntı denetimi, walk-forward ve yayın kapıları | Tamamlandı |
| v0.3.2 | CP07 | Gerçek D1 point-in-time dataset builder ve değişmez provenance | Tamamlandı |
| v0.3.3 | CP08 | Elo ve Poisson/Dixon–Coles karşılaştırma modelleri | Tamamlandı |
| v0.3.4 | CP09 | Ablation, kalibrasyon, holdout ve lig × pazar kanıt matrisi | Tamamlandı |
| **v0.4.0** | **CP10** | **Değişmez tahmin sürümleri, izleme/final/geri çekme durum makinesi ve Prediction Ops** | **Mevcut** |
| v0.4.1 | CP11 | Kullanıcı maç analizleri ve filtrelenebilir, şeffaf performans geçmişi | Sıradaki |
| v0.5 | CP12–CP14 | De-vig/değer filtresi, kadro-bağlam yeniden skoru, kupon, kasa ve bildirim motoru | Planlandı |
| v0.6 | CP15–CP16 | Waitlist, Free/Pro/Expert, kartsız beta denemesi ve 100–300 kişilik davetli beta | Planlandı |
| v0.7 | CP17 | Shadow validation, drift takibi, performans ve fiyat araştırması | Planlandı |
| v1.0 | CP18 | Hukuk/veri lisansı/şirket/ödeme kapıları geçilirse ücretli web lansmanı | Koşullu |
| v2.0 | — | Web MVP doğrulandıktan sonra iOS ve Android istemcileri | Gelecek |

Ücretli veya herkese açık beta öncesindeki dış bağımlılık kapıları: 3–5 lisanslı pilot lig kaynağı, public kimlik sağlayıcısı, zamanlayıcı, veri revizyon zamanları, şirket/ödeme altyapısı ve ülke bazlı hukuk incelemesidir. Bu kapılar kapanmadan model araştırması ilerleyebilir; kullanıcıya bahis önerisi yayını ilerleyemez.

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

## Teknoloji

- Next.js 16, React 19, TypeScript ve Vinext
- Cloudflare Sites/Workers, D1 ve R2
- Drizzle ORM ve sürümlü SQLite migration’ları
- GSAP ve Three.js
- Node test runner ve ESLint

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
