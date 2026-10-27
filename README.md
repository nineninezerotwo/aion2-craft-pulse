# Fregion Craft Pulse — GitHub: nineninezerotwo/aion2-craft-pulse

[Public dashboard](https://nineninezerotwo.github.io/aion2-craft-pulse/) · [Feed setup](https://nineninezerotwo.github.io/aion2-craft-pulse/feed-setup.html)

# Fregion Craft Pulse — AION 2 (Asia / Elyos / Fregion)

**สถานะ 27 ต.ค. 2026: Dashboard published / collector code added / live Fregion feed NOT activated.**

ระบบเว็บฟรีสำหรับคัดเลือก **ของคราฟที่คาดว่ากำไรดีและมีสัญญาณว่าสินค้าออกจากตลาด** โดยดูต้นทุนวัตถุดิบ, ราคาตั้งขาย, observed listing decreases, price strength, ROI, net margin และ data confidence. **ไม่มีการอ้างว่า Listings ที่หายไป = ขายสำเร็จ**

> ### อ่านก่อน: ขอบเขตสิทธิ์ข้อมูล
>
> - **Questlog.gg** ระบุชัดใน Terms (แก้ไข 2026-09-29) ว่าห้ามดึงข้อมูลอัตโนมัติหรือรวมฐานข้อมูลเข้าผลิตภัณฑ์อื่นโดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษร: https://questlog.gg/aion-2/ko-nc/terms-of-service
> - ดังนั้น repository **ไม่มี Questlog scraper** และ **ไม่ได้คัดลอกฐานข้อมูล Questlog**. ผู้ใช้เพิ่มสูตรคราฟจากสิ่งที่ตนยืนยันในเกม หรือ Import JSON ที่มีสิทธิ์ใช้ได้.
> - `aion2.exchange` มีเว็บไซต์สาธารณะที่เผยแพร่ราคาและกราฟ Listings และมีโปรเจกต์โอเพนซอร์ซภายนอกแสดงรูปแบบ API ตัวอย่าง (`/api/items` กับ `/api/items/{id}/prices`). **การเข้าถึงไม่ได้เท่ากับได้รับสิทธิ์ทำ collection**. ก่อนเปิดเก็บอัตโนมัติ ต้องตรวจเงื่อนไขหรือขออนุญาตผู้ดูแลเว็บตามที่จำเป็น. ไม่ทำการล็อกอิน, หลีกเลี่ยง CAPTCHA, หลบ 403/429 หรือสร้างโหลดผิดปกติ.
> - **Asia / Elyos / Fregion API Server ID ยังไม่ยืนยันในสภาพแวดล้อมที่สร้างนี้**. ค่า `11507` ในตัวอย่างเป็น provisional ไม่ใช่การยืนยัน.
> - ฟีด completed sales สำหรับ Fregion ยัง **ไม่ได้รับการยืนยันว่ามีอยู่** จึงไม่คำนวณ Sell-through Rate หรือ Avg Days to Sell ปลอม.

## หน้าตาของเว็บ

- `docs/index.html` — หน้าใช้งานจริง; เริ่มต้นจะบอก **WAITING FOR DATA** จนกว่า collector ถูกเปิดอย่างถูกต้อง
- `docs/demo.html` — หน้า **DEMO (Synthetic)** เพื่อทดลองตาราง, filter, ROI, charts, scoring โดยไม่มีตัวเลขจากตลาดจริง
- 9 ช่วง: **3h, 6h, 12h, 24h, 3d, 7d, 14d, 30d, 90d**. ช่วงยาวใช้ได้เต็มเมื่อมี Snapshot ย้อนหลังเพียงพอ
- คัดเฉพาะของคราฟ, สูตรที่ยืนยันและต้นทุนครบ, ของที่คราฟได้ตามเลเวล, อาชีพ, Watchlist
- คอลัมน์ Ask/Listing/Observed Drops/Net Listing Δ/Price Δ/Expected Unit Cost/Expected Profit/ROI/Margin/Investment Score/Action
- กราฟ Listings และราคา, ความเชื่อมั่นข้อมูล/ความครอบคลุม, ไม่มีการสรุปยอดขายจริงจาก Listings
- เพิ่มสูตรจากเกม, Import JSON สูตรที่ได้รับอนุญาต, แก้ราคา input materials, NPC cost, success %, override unit cost, ยืนยันสูตร
- Export / Restore สูตรและค่าตั้งค่า (localStorage ของ browser; ไม่มีบัญชีหรือฐานข้อมูล)

## การเตรียมที่ต้องมี

1. **บัญชี GitHub และ Public Repo ใหม่** (เช่น `aion2-craft-pulse`) เพื่อใช้ GitHub Pages + GitHub Actions ฟรี. ไม่ใช้ repo เดิมของโปรเจกต์อื่น.
2. **ยืนยันตลาดจริง** โดยเลือก Asia → Elyos → Fregion บน https://aion2.exchange/, เปิด DevTools > Network > Fetch/XHR, ดู request ที่เรียก `/api/items?...server=...`. ตรวจว่าพารามิเตอร์ server และผลลัพธ์ถูก Fregion จริง. **อย่าส่ง Cookie, Authorization header หรือ token มาให้เรา**; ID หรือตัวเลขพารามิเตอร์เพียงพอ.
3. **ตรวจสิทธิ์ในการดึงข้อมูลจาก aion2.exchange อัตโนมัติ**. ถ้ายังไม่ชัดเจน อย่าเปิด Collect Action; หน้าเว็บยังคงใช้ Demo, สูตรคราฟ/ต้นทุน/Import ในเบราว์เซอร์ได้.
4. **สูตรคราฟที่ตรวจในเกม** อย่างน้อย 5–10 รายการ: ชื่อ Item, วัตถุดิบต่อคราฟ, จำนวน output, โอกาสสำเร็จ, NPC/Bound cost. ช่วยให้คะแนนไม่ใช้ค่าที่เดา.
5. **เลเวลอาชีพอื่น** (Alchemy ตั้งค่าเริ่มต้นเป็น 100; อื่น ๆ เว้นว่างไว้). กรอกใน Settings เพื่อไม่แนะนำสูตรที่ยังคราฟไม่ได้.

## ติดตั้งบน GitHub Pages

สร้าง Public Repo เปล่า และเปิด Terminal ในโฟลเดอร์ที่แตก ZIP (โฟลเดอร์ที่มี `docs` และ `.github`) จากนั้น:

```bash
git init -b main
git add .
git commit -m "feat: initial Fregion Craft Pulse MVP"
git remote add origin https://github.com/nineninezerotwo/aion2-craft-pulse.git
git push -u origin main
```

เปลี่ยน `nineninezerotwo` เป็นของคุณ. ใน Repo:

1. Settings → Pages → **Source = GitHub Actions** (ใช้ workflow ที่เตรียมไว้ `deploy.yml`)
2. Actions → **Deploy dashboard (initial / manual)** → Run workflow ถ้ารอบแรกยังไม่ได้ deploy
3. เปิด `https://nineninezerotwo.github.io/aion2-craft-pulse/` และตัวอย่าง `.../demo.html`

> ⚠️ กำหนด **Pages = GitHub Actions** ไม่ใช่ Deploy from Branch: Commit โดย `GITHUB_TOKEN` ระหว่าง collector ไม่ได้กระตุ้นการสร้าง Pages ผ่าน push workflow ดังนั้น `collect.yml` จะ Deploy เองหลัง Commit อัปเดต.

### เปิดเก็บข้อมูลจริงอัตโนมัติ (หลังยืนยันสิทธิ์และ ID)

Repo → Settings → Secrets and variables → Actions → **Variables**:

| Variable | Value | ความหมาย |
|---|---|---|
| `MARKET_SERVER_ID` | VERIFIED_ID | รหัสใน API ที่ตรวจจริง ไม่ใช้เดา |
| `CONFIRM_FREGION_SERVER_ID` | VERIFIED_ID | ต้องตรงกัน ป้องกันตลาดผิด |
| `MARKET_SOURCE_PERMISSION_CONFIRMED` | `true` | เปิดเมื่อยืนยันเงื่อนไข/สิทธิ์แล้วเท่านั้น |
| `MARKET_DATA_COLLECTION_ENABLED` | `true` | เปิด collector เป็นรายชั่วโมง |

จากนั้น Actions → **Collect market & refresh Pages** → Run workflow ทดสอบครั้งแรก. Workflow หยุดหากยังไม่ได้ตั้งค่าตามเกณฑ์. หากเว็บต้นทางตอบ 401/403/429 ให้หยุด ไม่พยายามหลบการจำกัด.

ทำงานครั้งละ **หนึ่ง batch ทุกชั่วโมง** โดยขอ `/api/items` แบบ paginate ประมาณ 200 items/request หยุดพักระหว่างหน้า 1.5 วินาที (จำนวนหน้าและความพร้อมขึ้นกับ source). เก็บข้อมูลย้อนหลังโดยลดความละเอียดเก่าลง: ล่าสุด 7 วัน hourly, 8–30 วัน 6h, 31–90 วัน daily; ไม่แทรกยอดขายปลอมระหว่างช่วงข้อมูลขาด.

GitHub Pages/Actions บน Public Repo ฟรีตามกติกาปัจจุบันแต่ขึ้นกับเงื่อนไขและข้อจำกัดของ GitHub. Scheduled Actions อาจถูกปิดหาก public repo ไม่มีกิจกรรมใน 60 วัน.

## รันทดสอบบนเครื่อง (ไม่ต้องต่อ API)

```bash
python -m http.server 8000 --directory docs
# http://localhost:8000/demo.html        -> DEMO SYNTHETIC
# http://localhost:8000/                -> WAITING FOR REAL DATA
```

ทดสอบ Python collector ด้วย fixture **บนสำเนาแยกของโปรเจกต์เท่านั้น** (ไฟล์ output จะถูกเขียนทับ!):

```bash
python scripts/collector.py --fixture tests/fixture.json
```

Collector จะเขียน metadata `demo=true` เพื่อไม่ปะปนกับข้อมูลตลาดจริง. หลังใช้ fixture ให้ restore `docs/data/latest.json` และ `history.json` จาก Git ก่อนจะ publish.

Run tests:

```bash
python -m unittest discover -s tests -v
node tests/test_engine.js
node --check docs/app.js
node --check docs/engine.js
```

## สูตรคำนวณและความหมาย

```
Observed listing drops = Σ max(0, Listings(t-1) - Listings(t))
Observed listing adds  = Σ max(0, Listings(t) - Listings(t-1))
Net listing change     = Listings(end) - Listings(start)

Expected spend per craft = Σ(qty material × asking price) + NPC/Bound cost + crafting fee
Expected cost per output unit = Expected spend / (output qty × success probability)
Expected revenue per output unit = lowest ask × (1 - tax %) - listing fee
Expected profit per unit = Expected revenue - Expected unit cost
ROI (%)       = Expected profit / Expected unit cost × 100
Net Margin (%)= Expected profit / Expected revenue × 100
```

- ต้นทุนฟาร์มเองใช้ราคาตลาดของวัตถุดิบเป็น **opportunity cost**, หรือกรอก override ราคาซื้อจริง.
- ไม่รวม Splendent/Combo output, รายรับจากผลลัพธ์พิเศษ, ค่าเวลาผลิต, ค่า Inventory/กำไรที่เสียไปเมื่อขายไม่ออก, หรือราคาขายที่เกิดขึ้นจริง. สูตรบางชนิดต้องทำแบบ multi-outcome เพิ่มในเวอร์ชันต่อไป.
- Settings ภาษีเริ่มต้น **10% สมมติ**, listing fee เริ่มต้น **0 (ยังไม่ทราบ)**. ต้องตรวจในเกม.
- ทุกสูตรตัวอย่างใน `docs/data/recipes.json` มี `verified=false` และไม่มีใครถูกจัดเป็น `ทดลองล็อตเล็ก` จนกว่าจะยืนยัน.
- สัญญาณตลาด (0–100) คำนวณจาก drops, การลดลงต่อเนื่อง, price strength, supply liquidity และความครอบคลุมเวลาที่สังเกตได้. Score เป็น heuristic **ไม่ใช่ Sell-through probability**.
- Investment Score ถ่วงน้ำหนัก **Profitability 35%, Observed Outflow 30%, Price Strength 20%, Liquidity 15%**, แล้วปรับด้วย confidence. ข้อมูลไม่ครบ / สูตรไม่ยืนยัน / เลเวลไม่พอ = ไม่จัดอันดับ.
- ระบบแนะนำเพียง **ทดลองล็อตเล็ก** (มิใช่คำยืนยันว่าจะขายสำเร็จ); ควรเก็บผลจริงจาก Market Settlement เพื่อ calibrate คะแนน.

## Recipe import schema (คัดกรองเฉพาะข้อมูลที่คุณมีสิทธิ์ใช้)

```json
{
  "recipes": [
    {
      "name": "Example Crafted Item",
      "item_id": "",
      "profession": "Alchemy",
      "level": 25,
      "output_qty": 3,
      "success_rate": 0.95,
      "npc_kinah": 0,
      "ingredients": [
        { "name": "Example Material", "qty": 2 }
      ],
      "verified": false,
      "source": "Recorded by player in game"
    }
  ]
}
```

ผู้ใช้ยังเพิ่มสูตรทีละรายการผ่าน **+ เพิ่ม / ยืนยันสูตรคราฟ** ได้ ระบบบันทึกสูตร/ราคา override ใน `localStorage` ของเครื่องนั้น ไม่ไปเขียน GitHub อัตโนมัติ. ถ้าล้างเบราว์เซอร์ข้อมูลอาจหาย: ใช้ Export เป็นไฟล์ backup ก่อน.

## Files

```
docs/index.html                   live dashboard (no fake real-market values)
docs/demo.html                    synthetic demo
 docs/engine.js                   profit + market signal + confidence + scoring engine
 docs/app.js                      interactive static UI; import/export local recipes
 docs/styles.css                  dark responsive UI
 docs/data/recipes.json           starter recipe examples, UNVERIFIED
 docs/data/latest.json            confirmed market snapshot or empty
 docs/data/history.json           90-day historical snapshots (opt-in)
 docs/data/demo/*                 synthetic sample datasets, explicitly DEMO
scripts/collector.py              guarded read-only paginated item collector
scripts/generate_demo.py          reproducible synthetic demo generator
tests/test_collector.py           Python collector tests
tests/test_engine.js              JS finance/scoring tests
.github/workflows/collect.yml    opt-in hourly collection + explicit Pages deploy
.github/workflows/deploy.yml     initial/manual Pages deploy
```

## Sources and limitations

- [Aion2Market](https://aion2.exchange/) — market prices and listing charts (source authorization not yet verified)
- [Questlog Terms](https://questlog.gg/aion-2/ko-nc/terms-of-service) — prohibits unauthorized database extraction and automated access
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) — free public hosting and Actions deployment
- [GitHub Actions disable schedule](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows) — public inactive 60-day caveat
- [Example open-source use of Aion2Market API](https://github.com/shizukaziye/aion2-market-history/blob/main/tools/pull_global.py) — technical reference only, not an authorization to reuse source data

This is a fan-made unofficial tool, not affiliated with NCSOFT, Questlog, or Aion2Market. MIT license covers this project's original code only and does not grant rights to third-party market/game data.
