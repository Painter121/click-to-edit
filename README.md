# Click-to-Edit & Visual Inspector (`cte`)

เครื่องมือ Debug หน้าเว็บแบบ Universal สำหรับการพัฒนา UI ร่วมกับ AI  
คลิกเลือก Element (รองรับหลายจุด), ลากครอบพื้นที่, แคปภาพหน้าจอ + วาดปากกาเน้นจุด แล้วคัดลอกทั้ง **รูปภาพ + คำสั่ง Prompt** ลง Clipboard เพื่อกด `Ctrl+V` วางในแชทได้ทันที

---

## จุดเด่น

- **ติดตั้งได้ในทุกโปรเจ็กต์:**
  - **Vite / React / Vue / Svelte:** ติดตั้งเป็น Vite Plugin (`apply: 'serve'`) ที่ทำงานเฉพาะตอน `npm run dev` **ไม่ติดเข้าไปในไฟล์ Build จริง (`vite build`)**
  - **Google Apps Script (`dev-server.js`):** อัปเดตไฟล์ `tools/click-to-edit.html` และ `tools/html2canvas.min.js` ให้พร้อมใช้งาน
  - **HTML / PHP / Python / Laravel / Next.js / เว็บทั่วไป:** ฝังไฟล์ `click-to-edit.bundle.js` (Zero-dependency) ลงหน้าเว็บให้อัตโนมัติ
- **ปลอดภัยใน Production:** สคริปต์จะเปิดใช้งานเฉพาะบน `localhost`, `127.0.0.1`, LAN IP (`192.168.*`, `10.*`) หรือ `file://` เท่านั้น
- **ตรวจจับชื่อ React / Vue Component อัตโนมัติ:** แสดงชื่อ Component (เช่น `[BottomNav]`) ให้ใน Highlight Badge และ Prompt
- **รองรับ Tailwind CSS v4 (`oklch` / `oklab` / `color-mix`):** แปลงค่าสีก่อนแคปภาพด้วย `html2canvas`
- **โหมดมาตรฐาน UI ส่วนตัว (Auto-Standard):** ติ๊กเปิดใน Popup เพื่อส่งคำสั่งได้ทันทีโดยไม่ต้องพิมพ์ ระบบจะตรวจจับประเภท Element (เช่น สถานะ = จุดสีด้านหน้า, ปุ่ม = ไม่ซ้อนบรรทัด + ขอบไม่มนเกิน, ภาพรวม = Clean UI) และสร้าง Prompt ให้อัตโนมัติ พร้อมไฟล์ Skill ใน [SKILL.md](.agent/skills/ui-standard/SKILL.md)

---

## คีย์ลัดการใช้งานบนหน้าเว็บ

| คีย์ / ปุ่ม | การทำงาน |
|---|---|
| ปุ่มลอยมุมซ้ายล่าง | คลิกเพื่อเปิด/ปิดเมนู หรือลากไปแปะขอบจอทั้ง 4 ด้านได้ |
| กดเลข `1` | **คลิกเลือก Element** (คลิกได้หลายจุดพร้อมกัน แล้วกด `Enter` เพื่อสรุปรวม) |
| กดเลข `2` | **ลากครอบพื้นที่** (ระบุพิกัดและ Element ภายในกรอบ) |
| กดเลข `3` | **ลากครอบแคปภาพหน้าจอ** + คลิกที่ภาพเพื่อขยายและ **วาดปากกาเน้นจุด** |
| กด `ESC` | เปิด/ปิดเมนู หรือยกเลิกโหมดเลือก |
| กด `Enter` | ยืนยันและคัดลอก **รูปภาพ + ข้อความ Prompt** ลง Clipboard (`Shift+Enter` เพื่อขึ้นบรรทัดใหม่) |

---

## วิธีติดตั้งและใช้งานผ่าน CLI

### 1) ใช้คำสั่งในเครื่อง (`cte`)
หากลิงก์แพ็กเกจไว้ในเครื่องแล้ว (`npm link`) สามารถเข้าไปที่โฟลเดอร์โปรเจ็กต์ใดก็ได้แล้วรัน:

```bash
cte init
```

หรือระบุโฟลเดอร์โปรเจ็กต์ที่ต้องการ:

```bash
cte init ./path/to/project
```

### 2) รันตรงจาก GitHub ด้วย `npx` (ไม่ต้องติดตั้งล่วงหน้า)

```bash
npx github:Painter121/click-to-edit init
```

### 3) ถอนการติดตั้งออกจากโปรเจ็กต์

```bash
cte remove
```

### 4) รัน Sidecar Server (สำหรับโปรเจ็กต์ PHP / Python / HTML เปล่า)
หากต้องการให้บันทึกรูปภาพและคำสั่งลงไฟล์ `mock/last_screenshot.png` และ `mock/last_edit_request.json` ในโปรเจ็กต์ที่ไม่มี Node dev server:

```bash
cte sidecar --port 4899
```

หรือแปะสคริปต์นี้ในหน้า HTML ชั่วคราวระหว่างพัฒนา:

```html
<script src="http://localhost:4899/__cte/click-to-edit.js"></script>
```

---

## วิธีเอาโปรเจ็กต์นี้ขึ้น GitHub

```bash
git branch -M main
git remote add origin https://github.com/Painter121/click-to-edit.git
git push -u origin main
```

หลังจาก Push ขึ้น GitHub แล้ว สามารถติดตั้งข้ามเครื่องหรือข้ามโปรเจ็กต์ได้ด้วย:

```bash
# ติดตั้งเข้าโปรเจ็กต์ด้วยคำสั่งเดียว
npx github:Painter121/click-to-edit init

# หรือติดตั้งเป็น devDependency สำหรับใช้ Vite Plugin โดยตรง
npm install -D github:Painter121/click-to-edit
```

หากติดตั้งแบบ `devDependency` สามารถเรียกใช้ใน `vite.config.js` ได้ดังนี้:

```js
import { defineConfig } from 'vite';
import clickToEdit from 'click-to-edit/vite';

export default defineConfig({
  plugins: [clickToEdit()],
});
```

---

## การพัฒนาและทดสอบแพ็กเกจ

```bash
# สร้างไฟล์ dist/click-to-edit.js และ dist/click-to-edit.bundle.js
npm run build

# รันชุดทดสอบอัตโนมัติ
npm test
```
