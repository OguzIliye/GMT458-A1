# Web GIS Portfolyo & Harita Yönetim Platformu

Modern web teknolojileri ve coğrafi bilgi sistemleri (GIS) standartları kullanılarak geliştirilmiş, **GitHub Pages** üzerinde sıfır sunucu ve sıfır maliyetle (serverless) çalışan kapsamlı bir Web GIS portfolyosudur.

---

## 🌟 Temel Özellikler

1. **Çift Harita Motoru Desteği (Cross-Platform GeoJSON):**
   - **Leaflet Studio (`leaflet.html`):** Leaflet 1.9 ve Leaflet-Geoman ile serbest poligon/işaretçi çizimi, köşe düzenleme, katman hiyerarşisi, arama ve zengin semboloji rozetleri.
   - **OpenLayers Engine (`openlayers.html`):** Leaflet veya yerel hafızada (`localStorage`) oluşturulan standart GeoJSON (RFC 7946) verisini `EPSG:4326`'dan `EPSG:3857`'ye dönüştürerek yüksek performanslı vektör katmanlarında SVG sembolojileriyle render eder.

2. **Sunucusuz Veri Sürekliliği (Client-Side Persistence):**
   - Çizilen tüm yeni alanlar ve işaretçiler tarayıcı hafızasında (`localStorage`) saklanır.
   - **GeoJSON İçe / Dışa Aktarma (Import / Export):** Çizimler tek tıkla `.geojson` olarak indirilebilir veya mevcut dosyalar yüklenebilir.
   - **Varsayılana Sıfırla:** Tek tıkla varsayılan dummy yerleşke veri setine geri dönülebilir.

3. **Ebeveyn (Parent-Child) Hiyerarşisi & Detaylar Çekmecesi:**
   - Binalar ve alanlar arasında hiyerarşik katman ağacı.
   - Her öğe için fotoğraf galerisi, detaylı açıklama ve Google / harici bağlantılar içeren kayar detay paneli.

4. **Yönetici Girişi (Admin Modu):**
   - Ziyaretçiler haritada arama ve filtreleme yapabilir.
   - Demo giriş ile yönetici modu açılarak çizim araçları aktif hale getirilebilir:
     - **E-posta:** `admin@admin.com`
     - **Şifre:** `password`

---

## 🎯 GMT 458 Ödev Kriterleri & Çözümleri

### Issue 1: Zoom Threshold for Markers
- **Leaflet:** `map.on('zoomend')` olayı dinlenerek kategoriye özel zoom eşikleri (`min_zoom` / `max_zoom`) yönetilir.
- **OpenLayers:** `styleFunction` içerisinde görünürlük filtrelemesi ile dinamik eşik yönetimi sağlandı.

### Issue 2: Earth Repeating Itself (Dünyanın Tekrarlanması)
- **Leaflet:** `L.tileLayer` içinde `noWrap: true` ve harita genelinde `maxBounds: [[-90, -180], [90, 180]]` tanımlanarak sonsuz dünya döngüsü engellendi.
- **OpenLayers:** `ol.source.OSM` ve `ol.source.XYZ` katmanlarında `wrapX: false` tanımlandı.

---

## 📁 Dosya Yapısı (Yalın & GitHub Pages Uyumlu)

```text
├── index.html                     # Web GIS Portfolyo ana vitrini
├── leaflet.html                   # Leaflet Studio (Çizim, Geoman, Katmanlar, Arama)
├── script-leaflet.js              # Leaflet uygulama motoru ve LocalStorage yönetimi
├── openlayers.html                # OpenLayers Engine (Vektör motoru & SVG Rozetler)
├── script-ol.js                   # OpenLayers vektör işleme ve projeksiyon dönüşümü
├── style.css                      # Modern arayüz ve rozet stilleri
├── data/
│   └── gis-data.json              # Başlangıç GeoJSON dummy veri seti
├── Public/                        # GitHub Pages / kök yayın klasörü
├── HBV_Foto.jpeg                  # Örnek yerleşke fotoğrafı
├── laravel_backend_src_backup.zip # Orijinal Laravel + PostGIS backend kaynak kod yedeği
```

---

## 🚀 Canlıya Alma (GitHub Pages)

Projeyi GitHub'a yükledikten sonra:
1. Depo ayarlarından **Settings > Pages** sekmesine gidin.
2. **Branch: main** ve klasör olarak **`/ (root)`** veya **`/Public`** seçeneğini kaydedin.
3. Birkaç saniye içinde portfolyonuz canlıya geçecektir!
