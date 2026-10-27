# Fregion Craft Pulse

[เปิดเว็บไซต์](https://nineninezerotwo.github.io/aion2-craft-pulse/) · [คู่มือสถานะ Feed](https://nineninezerotwo.github.io/aion2-craft-pulse/feed-setup.html) · [ตรวจ GitHub Actions](https://github.com/nineninezerotwo/aion2-craft-pulse/actions)

**สถานะ 27 ตุลาคม 2026: Market Feed ใช้งานจริงแล้ว** — GitHub Actions เก็บ Snapshot แรกได้ **707 items**, **439 items ที่มีราคาตั้งขาย**, ที่ **2026-10-27 05:34:11 UTC**. Source: aion2.exchange. ข้อมูลส่วนนี้ไม่ใช่ยอดขายสำเร็จ

ตลาดล็อกเป็น **Global / Asia / Elyos / Fregion**: game server key **1507**, Aion2Market API server ID **11507**. ตรวจ mapping จาก `https://aion2.exchange/api/servers` แล้ว; Collector ตรวจ mapping ใหม่ก่อนเก็บทุกครั้งและจะหยุดทันทีถ้า ID ไม่ตรง

## ทำงานอย่างไร

- `docs/index.html` เป็น Dashboard ใช้ GitHub Pages ฟรี อ่าน JSON ล่าสุดจาก GitHub Raw เป็นหลัก (สำรองด้วยไฟล์ Pages)
- `scripts/collector.py` ดึงเฉพาะ **ราคาเสนอขายและจำนวน Active Listings** จาก Aion2Market ผ่าน API ที่ตอบข้อมูลแบบสาธารณะ ไม่มีการเข้าสู่ระบบหรือเก็บข้อมูลบัญชีเกม
- `.github/workflows/collect.yml` ทำงานทุกชั่วโมงที่นาที 23 UTC และสามารถรันเองได้จาก Actions (กำหนดการของ GitHub อาจคลาดเคลื่อนหรือถูกปิดตามข้อกำหนด)
- `docs/data/latest.json` คือ Snapshot ล่าสุด; `docs/data/history.json` คือประวัติตามช่วงเวลา 90 วัน โดยคงข้อมูล 7 วันแรกเป็นรายชั่วโมง, วันที่ 8–30 ทุก 6 ชั่วโมง และวันที่ 31–90 รายวัน
- UI มีช่วง 3h, 6h, 12h, 24h, 3d, 7d, 14d, 30d, 90d; ต้องมี Snapshot ครอบคลุมช่วงเวลาพอก่อนให้สัญญาณการลงทุน
- `docs/data/recipes.json` มีสูตรเริ่มต้น **13 สูตรที่ยังไม่ได้รับการยืนยัน**. ต้องตรวจวัตถุดิบและโอกาสคราฟจากในเกมหรือชุดข้อมูลที่ได้รับอนุญาตก่อนจัดอันดับ ROI
- กราฟ `Listings Drops` คือ **การลดลงของจำนวนประกาศระหว่าง Snapshot** ไม่สามารถยืนยันว่าเกิดจากการขายสำเร็จ; อาจเกิดจากการถอนหรือประกาศหมดอายุ

## ข้อมูลต้นทางและข้อควรระวัง

Aion2Market เผยแพร่ API สาธารณะและ `robots.txt` ณ วันที่ 27 ตุลาคม 2026 อนุญาตให้ user-agent ของเราอ่านเส้นทาง /api/items ได้ผ่านการทดสอบ. ตัว Collector ตรวจ robots.txt ทุกครั้งและหยุดเมื่อมีการปฏิเสธ 401, 403, 429; ไม่มีการหลบ rate limits, CAPTCHA หรือใช้ cookies. การเข้าถึง API **ไม่ได้เป็นการรับรองสิทธิ์การเผยแพร่ข้อมูลซ้ำ** หากผู้ให้บริการเปลี่ยนเงื่อนไขหรือไม่อนุญาตการนำข้อมูลไปใช้ต่อ ให้ระงับ Collector และติดต่อผู้ให้บริการ

Questlog ไม่ได้เป็นแหล่งข้อมูลของ Collector และไม่มีการคัดลอกฐานข้อมูลสูตรคราฟจาก Questlog เพราะต้องมีสิทธิ์การนำไปใช้ตามเงื่อนไขของเว็บไซต์

## สถานะการวิเคราะห์

| ส่วน | สถานะ |
|---|---|
| ราคาตั้งขายและ Listings ของ Fregion | เชื่อมแล้ว |
| ประวัติ Snapshot หลายช่วงเวลา | เริ่มสะสมแล้ว |
| ROI / Margin / ต้นทุนวัตถุดิบ | มี Engine, ต้องยืนยันสูตรก่อน |
| Listing Drop / Price Strength | แสดงหลังข้อมูลย้อนหลังเพียงพอ |
| ยอดขายสำเร็จจริงของ Fregion | ยังไม่มี Feed ที่ยืนยันได้ |

### สูตรหลัก

```text
Observed Listing Drops = Σ max(0, Listings(previous) - Listings(next))
Expected Cost per Unit = (Σ material quantity × ask price + NPC fee + craft fee) / (output quantity × success rate)
Expected Net Revenue per Unit = cheapest ask × (1 - assumed market tax) - listing fee
Expected Profit per Unit = Expected Net Revenue - Expected Cost
ROI = Expected Profit / Expected Cost × 100
Net Margin = Expected Profit / Expected Net Revenue × 100
```

ตัวอย่างเริ่มต้นค่าภาษีในเว็บเป็นสมมติฐาน 10%; ผู้ใช้งานต้องตรวจในเกม. ไม่มีการรับประกันว่าราคาตั้งขายคือราคาขายได้จริง

## การดูแลระบบ

- [ดูรอบเก็บข้อมูลและ Error logs](https://github.com/nineninezerotwo/aion2-craft-pulse/actions)
- [ตรวจราคาล่าสุดใน Repository](https://github.com/nineninezerotwo/aion2-craft-pulse/blob/main/docs/data/latest.json)
- [ตรวจประวัติ Snapshot](https://github.com/nineninezerotwo/aion2-craft-pulse/blob/main/docs/data/history.json)
- [การตั้งค่า Pages](https://github.com/nineninezerotwo/aion2-craft-pulse/settings/pages) — Currently using main /docs is fine: webpage loads current data from GitHub Raw
- ถ้าหน้าเว็บยังเห็นค่าเก่า ให้ Hard Refresh (**Ctrl + Shift + R**), รอสักครู่ แล้วตรวจสถานะ workflow ล่าสุด

## ทดสอบแบบ Offline

```bash
python -m unittest discover -s tests -v
node tests/test_engine.js
node --check docs/app.js
node --check docs/engine.js
python -m http.server 8000 --directory docs
```

หากต้องการทดลอง Fixture ให้ใช้ **สำเนาแยกจาก Repo จริง** เพราะ `python scripts/collector.py --fixture tests/fixture.json` จะเขียนทับ Snapshot ใน `docs/data/`. ต้องไม่อัปโหลดผล Fixture เป็นข้อมูลตลาดจริง

## สิทธิ์ในการใช้

โค้ดต้นแบบเป็น Community Tool ที่ไม่ได้เป็นผลิตภัณฑ์หรือส่วนหนึ่งของ NCSoft, Aion2Market หรือ Questlog. เครดิตข้อมูลราคาตลาด: [aion2.exchange](https://aion2.exchange/). Github Pages/Actions เป็น Free Tier สำหรับ Public Repository ตามเงื่อนไขและการใช้งานของ GitHub
