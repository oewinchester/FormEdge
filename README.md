# FormEdge

**Football intelligence, calibrated.**
FormEdge; maç formu, oyun üstünlüğü ve bağlamsal verileri olasılık tahminlerine dönüştürmek üzere geliştirilen Türkçe/İngilizce futbol analiz platformudur.

> Beta ilkesi: Bir model yüksek isabet gösterse bile zaman sızıntısı, kalibrasyon ve lig × pazar yayın kapılarını geçmeden bahis önerisi üretemez.

## Mevcut checkpoint

**v0.3.2 · Checkpoint 07 · Aşama 3 / Offline Model Lab**

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
- Research → Analysis-only → Shadow → Limited yayın akışı; genel yayın yalnız manuel kararla

## Sürüm ve checkpoint yol haritası

| Sürüm | Checkpoint | Kapsam | Durum |
| --- | --- | --- | --- |
| v0.1 | CP01–CP03 | Responsive landing, mobil yüzen panel, gerçek 3D futbol topu | Tamamlandı |
| v0.2 | CP04–CP05 | D1/R2 veri çekirdeği, kontrollü JSON/CSV importu, veri sağlığı ve eşleme incelemesi | Tamamlandı |
| v0.3.1 | CP06 | Form + dominasyon baseline, sızıntı denetimi, walk-forward ve yayın kapıları | Tamamlandı |
| **v0.3.2** | **CP07** | **Gerçek D1 point-in-time dataset builder ve değişmez provenance** | **Mevcut** |
| v0.3.3 | CP08 | Elo ve Poisson/Dixon–Coles karşılaştırma modelleri | Sıradaki |
| v0.3.4 | CP09 | Ablation, kalibrasyon, holdout ve lig × pazar kanıt matrisi | Planlandı |
| v0.4 | CP10–CP11 | Tahmin sürümleme, izleme/final durum makinesi, maç analizleri ve şeffaf performans geçmişi | Planlandı |
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
9. Otomasyon genel öneri aşamasına geçemez.

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
