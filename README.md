# Fate Battle Royale

เว็บเกม Battle Royale ธีม Fate/stay night (Vite + JavaScript)

ตอนนี้เป็นเดโมออฟไลน์ตาม M1 ในเอกสารออกแบบ: ผู้เล่น 1 คนปะทะบอท 7 ตัวในเบราว์เซอร์

## รัน

```
npm install
npm run dev
```

แล้วเปิด http://localhost:5173

เอกสารออกแบบเกม: [docs/game-design.md](docs/game-design.md)

## โครงสร้างโค้ด

- `src/data.js` — ข้อมูลพื้นที่ คลาส Servant 14 ตน และการ์ด 12 ใบ
- `src/engine.js` — กติกาทั้งหมด (เฟส ซ่อนตัว เผชิญหน้า ต่อสู้ Command Seal จอก) ไม่มีโค้ด DOM จึงย้ายไปรันบน server ได้ภายหลัง
- `src/bot.js` — บอทระดับปกติ ตอบผ่านช่องทางเดียวกับผู้เล่น
- `src/ui.js`, `src/style.css` — หน้าจอ
- `npm run sim` — จำลองเกมบอทล้วน 200 เกม แล้วพิมพ์ค่าเฉลี่ยไว้ปรับบาลานซ์
