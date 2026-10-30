# VPS Monitor: บันทึกสำหรับทำงานต่อ

ตอบผู้ใช้เป็นภาษาไทย ผู้ใช้ไม่ใช่นักพัฒนาเต็มตัว อธิบายสั้น ตรง และบอกวิธีกดทีละขั้น

## โปรแกรมนี้คืออะไร

โปรแกรม Windows สำหรับเช็กว่าเครื่อง VPS/PC ดับไหมด้วย ping และสั่งเปิด ปิด รีสตาร์ท รันคำสั่ง
และคุมหน้าจอได้ หน้าตาสว่างสะอาดแบบ launcher มี dark theme แผนผังห้องแสดงเครื่องเป็น NPC พ่อค้า
เครื่องดับคือ NPC นอนบนเตียง กดที่เครื่องแล้วเมนูขึ้นตรงจุดที่กด แถบคุณสมบัติลอยทับแผนผังโดยไม่ดันพื้นที่

## โครงสร้าง

- `main.py` หน้าต่างโปรแกรมด้วย pywebview และไอคอนถาดด้วย pystray (`--preview` ใช้ข้อมูลจำลองแยกต่างหาก)
- `app/` backend Python ไม่ใช้ไลบรารีนอก: `server.py` HTTP และ API, `monitor.py` ping และตารางเวลา,
  `power.py` เปิดปิดเครื่อง, `console.py` รันคำสั่ง, `vnc.py` WebSocket proxy, `radmin.py`, `store.py`
- `public/` หน้าจอ HTML/CSS/JS ต้องคงไว้ เพราะหน้าต่างแสดงผลด้วยไฟล์เหล่านี้ `public/vendor` คือ noVNC และฟอนต์
- `tests/` เทสต์ทั้งหมด `tools/` สคริปต์ build และ VNC จำลอง `installer/` สคริปต์ติดตั้ง

ข้อมูลจริงอยู่ที่ `%APPDATA%\VPS Monitor\data` ห้าม commit เพราะมี IP ภายใน

## คำสั่ง

- เปิดดูก่อน: `preview.bat`
- สร้างตัวติดตั้ง: `build.bat` ได้ไฟล์ `dist\setup.exe` (รันเทสต์ให้ก่อน)
- รันเทสต์: `python -m unittest discover -s tests`

ต้องมี Python 3.11 ขึ้นไป ไฟล์ .bat สร้าง environment ให้เองที่ `%LOCALAPPDATA%\VPSMonitorDev\venv`

## งานที่ต้องทำต่อ ทำตามลำดับ

ย้ายจาก Node/Electron มาเป็น Python แล้ว เหลือ:

1. รัน `preview.bat` แล้วเปิดดูหน้าจอจริง เช็กว่าหน้า Map, Monitor, Console, Remote, Schedule, Settings แสดงถูกต้อง
2. ทดสอบในหน้าต่าง pywebview ซึ่งยังไม่เคยลอง: กดกากบาทแล้วย่อลงถาด, เมนูถาด, เปิดโปรแกรมซ้ำแล้วหน้าต่างเดิมขึ้นมา,
   ธีมถูกจำหลังเปิดใหม่, ดาวน์โหลดไฟล์ .rdp, กล่องยืนยันของ `window.confirm`
3. รัน `build.bat` ยังไม่เคยรันเลย อาจต้องแก้ `tools/build_setup.py` เช่น hidden import
4. ติดตั้ง `dist\setup.exe` จริง แล้วทดสอบเปิดโปรแกรม ถอนการติดตั้ง และติดตั้งทับ
5. เขียน README ใหม่ ตอนนี้ยังอธิบายแบบ Node/Electron เดิม (start.bat, server.js, ไฟล์ .js, electron-builder)
   และตัวอย่าง Proxmox ต้องเปลี่ยนจาก `NODE_EXTRA_CA_CERTS` เป็น `SSL_CERT_FILE`
6. ลบคอมเมนต์หรือ CSS ที่ไม่ใช้แล้ว เช่น `.tile.selected` ที่ซ้ำซ้อน ถ้ามี

## จุดที่เคยติด อย่าทำซ้ำ

- เก็บโปรเจกต์ใน path สั้น เช่น `C:\dev\Server-Checker` ไฟล์ noVNC ลึกมาก path ยาวเกิน 260 ตัวอักษรจะพังทั้ง git, Python และ cmd
- `git config core.longpaths true` ถ้า clone ไม่ครบ
- ไฟล์ `.bat .cmd .ps1` ต้องเป็น CRLF ไม่อย่างนั้น `goto` ใน cmd พัง `.gitattributes` กำหนดไว้แล้ว
- Claude Code ตั้ง `NoDefaultCurrentDirectoryInExePath=1` ถ้าสั่งจากเครื่องมือของ Claude ให้เรียก `.\preview.bat` ไม่ใช่ `preview.bat`
- `pywebview` ต้องใช้ WebView2 Runtime ซึ่งมีมากับ Windows 10/11 ส่วนใหญ่
- ไฟล์ setup ไม่ได้เซ็นดิจิทัล Windows SmartScreen จะเตือน และชื่อ `setup.exe` มักทำให้ UAC ขึ้น
- ห้ามใส่รหัสผ่านหรือ token ในไฟล์ตั้งค่า ใช้ environment variable ที่ขึ้นต้นด้วย `VPSMON_`
- เครื่องจริงต้องอยู่ LAN เดียวกันหรือผ่าน VPN จึงจะทดสอบได้ นอกวงทดสอบได้แค่เครื่องจำลองและ `tools/fake_vnc_server.py`

## ข้อตกลงกับผู้ใช้

- ธีม: สว่างเป็นค่าเริ่มต้น สลับมืดได้ ช่อง Console ใช้สี One Dark แบบ VS Code ทั้งสองธีม
- ฟอนต์ Chakra Petch และ IBM Plex Sans Thai ไอคอน Lucide เก็บในโปรแกรม ใช้ได้ไม่ต้องมีอินเทอร์เน็ต
- ปิดและรีสตาร์ทต้องพิมพ์ชื่อเครื่องยืนยันเสมอ
- Map ดูแผนผัง Monitor จัดการรายการเครื่อง Settings ตั้งค่าโปรแกรมอย่างเดียว อย่าให้ซ้ำกัน
- Radmin เปิดโปรแกรม Radmin Viewer แยกหน้าต่าง คุมในหน้า Remote ไม่ได้ VNC คุมในโปรแกรมได้ แต่ RealVNC รุ่นใหม่อาจต่อไม่ได้
- ยังไม่เคยทดสอบกับเครื่องจริงจนสำเร็จ: การปิด/รีสตาร์ท, SSH, winrs, Wake-on-LAN, VNC จริง
