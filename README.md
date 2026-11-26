# Get Rich Pendant Finder (ค้นหาเซ็ตจี้เกมเศรษฐี)

เว็บช่วยค้นหาและจัดเซ็ตจี้ (เครื่องราง) สำหรับเกม LINE เกมเศรษฐี — เลือกสกิลที่ต้องการ
ตัวละคร และเงื่อนไขต่าง ๆ แล้วระบบจะช่วยหาเซ็ต 4 จี้ที่ตรงที่สุดพร้อมจัดอันดับให้อัตโนมัติ

> โปรเจกต์นี้จัดทำโดยบุคคลทั่วไป ไม่มีส่วนเกี่ยวข้องกับ LINE เกมเศรษฐี

เว็บไซต์: https://lgrfind.com

## ฟีเจอร์
- เลือกสกิลที่ต้องการ / ไม่ต้องการ แล้วค้นหาเซ็ตจี้ที่เหมาะสม (คำนวณในเครื่องด้วย Web Worker)
- ล็อกจี้ `[ลิงก์]` ตามตัวละครที่เลือกโดยอัตโนมัติ
- กรองประเภทจี้ `[ดาร์ค]` / `[ไวท์]` / อื่น ๆ เลือกได้หลายอัน (ไม่เลือก = ทุกจี้)
- เลือก**ทั้งกลุ่ม**ความสามารถได้ (เช่น "โล่ แบบไหนก็ได้" นับ 1 ช่อง) จากปุ่ม "📂 เลือกจากกลุ่ม" หรือปุ่ม "+ ทุกแบบ" ในผลค้นหา — กลุ่มมาจากคอลัมน์ `group` ในแท็บ `Abilities`
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
| `js/data-model.js` | แปลงตารางชีต → ข้อมูลจี้ `{ id, prefix, type, allowedChars, substats }` + ตรวจแถวที่ผิด |
| `js/search-core.js` | ตรรกะค้นหาเซ็ต (pure function ใช้ร่วมกันทั้งหน้าเว็บ, worker และเทสต์) |
| `js/search-worker.js` | Web Worker ที่รันการค้นหา |
| `js/main.js` | โหลดข้อมูล, `calculate()` (รวมการล็อกจี้ [ลิงก์]), แสดงผล |
| `js/filter-state.js` | **state ของ Filter ที่เดียว**: อ่าน/ใส่ฟอร์ม, ทำความสะอาด, สรุป, แปลงเป็นลิงก์แชร์ |
| `js/share.js` | ลิงก์แชร์ / QR / อ่าน state จาก URL |
| `js/saved-data.js` | เซ็ตจี้ที่บันทึก, Filter ที่บันทึก, นำเข้า/ส่งออก |
| `js/chip-picker.js` | เลือกสกิลที่ต้องการ / ไม่ต้องการ |
| `js/char-select.js` | รายชื่อตัวละคร (จากชีตตัวละคร) |
| `js/tutorial.js`, `js/feedback.js`, `js/persist-form.js`, `js/ui/*` | UI เสริม |
| `manifest.json` | PWA manifest |
| `fonts/` | ฟอนต์ LINE Seed Sans TH |
| `sitemap.xml`, `robots.txt` | SEO |

ไฟล์ JS เป็น classic script (ไม่ใช่ ES module) โหลดตามลำดับใน `index.html` และใช้ตัวแปร global ร่วมกัน
— **ลำดับของ `<script>` มีผล** อย่าสลับโดยไม่จำเป็น

## รันในเครื่อง
เพราะเป็น static site ล้วน เปิดผ่าน HTTP server ธรรมดาก็พอ (ข้อมูลโหลดจาก Google Sheets)
— ต้องเปิดผ่าน HTTP เท่านั้น เปิดไฟล์ตรง ๆ (`file://`) Web Worker จะไม่ทำงาน:

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
| `test/search.golden.test.js` | ผลค้นหา 16 สถานการณ์ต้องตรงกับ `test/golden/search-results.json` ทุกตัว + กฎล็อกจี้ [ลิงก์] |
| `test/compat.test.js` | ลิงก์แชร์รูปแบบเก่า/ใหม่, Filter ที่บันทึก, คลังจี้, ไฟล์นำเข้า ยังใช้ได้ |
| `test/search-core.test.js`, `test/data-model.test.js` | unit test ของตรรกะค้นหาและการแปลงชีต (รันใน Node ล้วน) |
| `test/smoke.test.js` | คลิกเลือกสกิล → ค้นหา → มีการ์ดผลลัพธ์ |

- อัปเดตข้อมูล fixture จากชีตจริง: `node scripts/update-fixtures.js`
- ตั้งใจเปลี่ยนผลการค้นหา: `npm run test:update-golden` แล้วตรวจ diff ของไฟล์ golden ก่อน commit

## ความเป็นส่วนตัว
ข้อมูลคลังจี้ / Filter / เซ็ตจี้ที่บันทึก จะถูกเก็บไว้เฉพาะบนอุปกรณ์และเบราว์เซอร์ของผู้ใช้
(`localStorage`) เท่านั้น ไม่ได้ถูกส่งไปยังเซิร์ฟเวอร์ของเว็บไซต์
