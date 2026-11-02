# เอกสารออกแบบเกม Fate Battle Royale (GDD v5.2)

กระดาษออกแบบฉบับปัจจุบันคือ **v5.2 (29 ต.ค. 2026)** แยกเป็นไฟล์ตามหัวข้อ เลขข้อเหมือนฉบับเดิมทุกข้อ เวลาเห็น "ข้อ 8.0" ในเอกสาร ให้ดูตารางด้านล่างว่าอยู่ไฟล์ไหน

**แก้กระดาษที่ไฟล์ในโฟลเดอร์นี้เท่านั้น** (เดิมอยู่ที่ project files `design/game-design.md` ซึ่งเลิกใช้แล้ว)

## สารบัญ

| ไฟล์ | ข้อ | เนื้อหา |
|---|---|---|
| [00-sources.md](00-sources.md) | หัวเอกสาร, 0 | สรุปแต่ละเวอร์ชัน แหล่งข้อมูล ป้าย [p.N] [FD] [NW] ⚠️ |
| [01-overview.md](01-overview.md) | 1–3 | ภาพรวม ขอบเขตเดโม อุปกรณ์ |
| [02-board-ui.md](02-board-ui.md) | 4 | กระดานกลาง กระดาน Master สิ่งที่คนอื่นเห็น หน้าจอคอม/มือถือ หน้าจอที่สั่งเพิ่ม (4.6) |
| [03-masters.md](03-masters.md) | 5 | Master 7 คน |
| [04-servants.md](04-servants.md) | 6 | Servant 9 ตน, Gilgamesh/True Assassin (6.1), ค่าที่เลือกเองในเดโม (6.2) |
| [05-setup-and-round.md](05-setup-and-round.md) | 7–8 | การเตรียมเกม ผังเฟสและช่วงใช้การ์ด (8.0) เฟสทั้ง 4 |
| [06-cards-cs-events.md](06-cards-cs-events.md) | 9–11 | การ์ดและป้ายบนการ์ด Command Spell การ์ดสถานการณ์/อีเวนต์ |
| [07-climax-and-modes.md](07-climax-and-modes.md) | 12–13 | ไคลแมกซ์ การคัดออก ผู้ชนะ เล่น 3–4 คน (NPC) โหมดง่าย |
| [08-open-questions.md](08-open-questions.md) | 14–15 | ส่วนที่คู่มือไม่ได้บอก สิ่งที่เดโมแก้จาก v4.1 |
| [09-changelog.md](09-changelog.md) | 16–17 | ประวัติการเปลี่ยนแปลง ข้อสังเกตลิขสิทธิ์ |

## ข้อมูลประกอบ (`reference/`)

- [fandom-servants.md](reference/fandom-servants.md): ข้อมูล Master/Servant/อีเวนต์/เป้าหมายจาก Fate/Domination wiki [FD]
- [fd-card-database.md](reference/fd-card-database.md): ฐานข้อมูลการ์ด Fate/Domination [DB] ของ 9 Servant ในเดโม
- [fd-keywords.md](reference/fd-keywords.md): หน้า Keywords ของ Fate/Domination [FD] Keywords
- [v5-card-placeholders.md](reference/v5-card-placeholders.md): ตัวเลขการ์ดที่ยังเป็นค่าแทนใน v5.2
- [manual-notes.md](reference/manual-notes.md): บันทึกเกี่ยวกับคู่มือ Dominate Grail War (ตัวไฟล์ PDF ไม่ได้ใส่ใน repo เพราะเป็นงานมีลิขสิทธิ์)
- [images/](reference/images/): รูปการ์ดจริงจาก Fate/Domination ที่คุณส่งมา (มีลิขสิทธิ์ ใช้ในต้นแบบส่วนตัวเท่านั้น ต้องเปลี่ยนก่อนเปิดสาธารณะ)
- [board-v5/](reference/board-v5/): รูปแบบกระดาน (จอคอม กระดาน Master มือถือ หน้าการ์ด) ทั้ง .svg และ .png

## ฉบับเก่า (`archive/`)

กระดาษทุกเวอร์ชันก่อนหน้า (v0.1–v5.1) ไฟล์ค่าแทนการ์ด v3/v4 และข้อเสนอหลังเล่นทดสอบ v1.8 เก็บไว้อ่านอย่างเดียว ไม่แก้
