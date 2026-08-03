# FormEdge

**Football intelligence, calibrated.**
FormEdge; maç formu, oyun üstünlüğü ve bağlamsal verileri olasılık tahminlerine dönüştürmek üzere geliştirilen Türkçe/İngilizce futbol analiz platformudur.

> Beta ilkesi: Bir model yüksek isabet gösterse bile zaman sızıntısı, kalibrasyon ve lig × pazar yayın kapılarını geçmeden bahis önerisi üretemez.

## Mevcut checkpoint

- Responsive, 3D destekli ürün landing sayfası
- D1 tabanlı futbol veri çekirdeği ve R2 ham veri arşivi
- Yönetici/analiz editörü için korumalı veri konsolu
- JSON ve kontrollü CSV önizleme/import akışı
- Veri kalite puanı, eşleme incelemesi ve öneri uygunluk kapısı
- Son 5/10 formuna ve oyun dominasyonuna ağırlık veren 1X2 baseline motoru
- Point-in-time denetimi ve kronolojik walk-forward backtest
- Log loss, normalize Brier, ECE, kalibrasyon, CLV ve drawdown ölçümleri
- Değişmez model sürümü, veri/config SHA-256 kimliği ve kalıcı deney geçmişi
- Research → Analysis-only → Shadow → Limited yayın akışı; genel yayın yalnız manuel kararla

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
