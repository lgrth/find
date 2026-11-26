# Get Rich Pendant Finder (ค้นหาเซ็ตจี้เกมเศรษฐี)

เว็บช่วยค้นหาและจัดเซ็ตจี้ (เครื่องราง) สำหรับเกม LINE เกมเศรษฐี — เลือกสกิลที่ต้องการ
ตัวละคร และเงื่อนไขต่าง ๆ แล้วระบบจะช่วยหาเซ็ต 4 จี้ที่ตรงที่สุดพร้อมจัดอันดับให้อัตโนมัติ

> โปรเจกต์นี้จัดทำโดยบุคคลทั่วไป ไม่มีส่วนเกี่ยวข้องกับ LINE เกมเศรษฐี

เว็บไซต์: https://lgrfind.com

## ฟีเจอร์
- เลือกสกิลที่ต้องการ / ไม่ต้องการ แล้วค้นหาเซ็ตจี้ที่เหมาะสม (คำนวณในเครื่องด้วย Web Worker)
- ล็อกจี้ `[ลิงก์]` ตามตัวละครที่เลือกโดยอัตโนมัติ
- คลังจี้ของฉัน, บันทึก Filter และเซ็ตจี้ที่ชอบ (เก็บใน `localStorage` ของเบราว์เซอร์)
- นำเข้า / ส่งออกข้อมูลเป็นไฟล์ `.json` เพื่อสำรองหรือย้ายอุปกรณ์
- แชร์เซ็ตจี้ให้เพื่อนผ่านลิงก์และ QR code

## โครงสร้าง
เว็บไซต์เป็น static site ไฟล์เดียว (`index.html`) เผยแพร่ผ่าน GitHub Pages
ข้อมูลจี้และตัวละครดึงมาจาก Google Sheets แบบ read-only ผ่าน GViz JSONP

| ไฟล์ | หน้าที่ |
|------|---------|
| `index.html` | โครง HTML + meta/SEO |
| `css/app.css` | สไตล์ทั้งหมด |
| `js/main.js` | โหลดข้อมูลชีต, สร้าง candidate, Web Worker ค้นหา, แสดงผล |
| `js/share.js` | ลิงก์แชร์ / QR / อ่าน state จาก URL |
| `js/saved-data.js` | เซ็ตจี้ที่บันทึก, Filter ที่บันทึก, นำเข้า/ส่งออก |
| `js/chip-picker.js` | เลือกสกิลที่ต้องการ / ไม่ต้องการ |
| `js/char-link.js`, `js/char-select.js` | เลือกตัวละคร + ล็อกจี้ [ลิงก์] |
| `js/tutorial.js`, `js/feedback.js`, `js/persist-form.js`, `js/ui/*` | UI เสริม |
| `manifest.json` | PWA manifest |
| `fonts/` | ฟอนต์ LINE Seed Sans TH |
| `sitemap.xml`, `robots.txt` | SEO |

ไฟล์ JS เป็น classic script (ไม่ใช่ ES module) โหลดตามลำดับใน `index.html` และใช้ตัวแปร global ร่วมกัน
— **ลำดับของ `<script>` มีผล** อย่าสลับโดยไม่จำเป็น

## รันในเครื่อง
เพราะเป็น static site ล้วน เปิดผ่าน HTTP server ธรรมดาก็พอ (ข้อมูลโหลดจาก Google Sheets):

```bash
python3 -m http.server 8080
# แล้วเปิด http://localhost:8080/
```

## ทดสอบ (Tests)
ชุดทดสอบใช้ Node 22 + Playwright (Chromium) และ mock ทุกอย่างที่ต่อเน็ต
(Google Sheets ใช้ snapshot ใน `test/fixtures/`, ไลบรารี CDN ใช้จาก `node_modules`)

```bash
npm ci
npx playwright install chromium   # ครั้งแรกครั้งเดียว
npm test
```

| ไฟล์ | ตรวจอะไร |
|------|---------|
| `test/search.golden.test.js` | ผลค้นหา 16 สถานการณ์ต้องตรงกับ `test/golden/search-results.json` ทุกตัว |
| `test/compat.test.js` | ลิงก์แชร์รูปแบบเก่า/ใหม่, Filter ที่บันทึก, คลังจี้, ไฟล์นำเข้า ยังใช้ได้ |
| `test/smoke.test.js` | คลิกเลือกสกิล → ค้นหา → มีการ์ดผลลัพธ์ |

- อัปเดตข้อมูล fixture จากชีตจริง: `node scripts/update-fixtures.js`
- ตั้งใจเปลี่ยนผลการค้นหา: `npm run test:update-golden` แล้วตรวจ diff ของไฟล์ golden ก่อน commit

## ความเป็นส่วนตัว
ข้อมูลคลังจี้ / Filter / เซ็ตจี้ที่บันทึก จะถูกเก็บไว้เฉพาะบนอุปกรณ์และเบราว์เซอร์ของผู้ใช้
(`localStorage`) เท่านั้น ไม่ได้ถูกส่งไปยังเซิร์ฟเวอร์ของเว็บไซต์
