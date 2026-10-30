# VPS Monitor

ตรวจสอบเครื่องด้วย ping แสดงตำแหน่งบนแผนผัง และสั่ง เปิด / ปิด / รีสตาร์ท ได้จากหน้าเว็บ
ใช้ Node.js 20 ขึ้นไป ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

## เริ่มใช้งาน

ดับเบิลคลิก `start.bat` หรือรัน:

```bash
node server.js
```

แล้วเปิด http://127.0.0.1:8787

ครั้งแรกจะมีเครื่องจำลอง 36 เครื่องไว้ทดลอง ไม่มีการ ping หรือสั่งเครื่องจริง
กด "ลบเครื่องจำลองทั้งหมด" ที่หน้า Settings ช่องว่างบนแผนผังจะเป็นรูปบวก กดรูปบวกหรือปุ่มเพิ่มเครื่องในหน้า Monitor เพื่อเพิ่มเครื่องจริง
ตั้งชื่อเครื่องได้ทั้งภาษาไทยและอังกฤษไม่เกิน 32 ตัวอักษร และแก้ไขภายหลังได้จากแผงรายละเอียดเครื่อง

## วิธีตรวจสถานะ

- ping ทุก 15 วินาที (ปรับได้) ถ้าไม่ตอบติดกัน 3 ครั้งจึงนับว่าออฟไลน์ เพื่อไม่ให้แจ้งเตือนผิดจากแพ็กเก็ตหลุดครั้งเดียว
- VPS หลายเจ้าปิด ping ให้ใส่ TCP port สำรอง เช่น 22 หรือ 443 ถ้าพอร์ตนั้นเชื่อมต่อได้จะนับว่าออนไลน์
- เครื่องที่ยังไม่ตั้ง IP แสดงเป็นไม่ทราบสถานะ

## วิธีสั่งเครื่อง

เครื่องที่ดับอยู่รับคำสั่ง SSH ไม่ได้ การเปิดเครื่องจึงต้องสั่งจากภายนอกตัวเครื่องเสมอ

| วิธีควบคุม | เปิด | ปิด | รีสตาร์ท | เหมาะกับ |
|---|---|---|---|---|
| `ssh` | ต้องมี MAC | ได้ | ได้ | Linux |
| `windows` | ต้องมี MAC | ได้ | ได้ | Windows ในโดเมนหรือบัญชีที่มีสิทธิ์ |
| `proxmox` | ได้ | ได้ | ได้ | VM บน Proxmox |
| `http` | ได้ | ได้ | ได้ | API ของผู้ให้บริการ VPS |
| MAC (Wake-on-LAN) | ได้ | - | - | เครื่องจริงใน LAN เดียวกันเท่านั้น ใช้กับ VPS บนคลาวด์ไม่ได้ |

**ssh** ใช้ SSH key เท่านั้น บนเครื่องปลายทางต้องให้ sudo โดยไม่ถามรหัสผ่านเฉพาะคำสั่งที่จำเป็น:

```
monitor ALL=(root) NOPASSWD: /usr/bin/true, /usr/bin/systemctl poweroff, /usr/bin/systemctl reboot
```

```json
{ "type": "ssh", "user": "monitor", "port": 22, "keyPath": "C:\\Users\\you\\.ssh\\id_ed25519" }
```

**windows** เรียก `shutdown /m` ด้วยสิทธิ์ของบัญชีที่รันโปรแกรมนี้ เครื่องปลายทางต้องเปิด Remote Shutdown และ firewall

**proxmox** สร้าง API token ที่มีสิทธิ์ `VM.PowerMgmt` แล้วเก็บใน environment variable
ถ้าใช้ self-signed certificate ให้ตั้ง `NODE_EXTRA_CA_CERTS` ชี้ไปที่ไฟล์ CA ของ Proxmox

```json
{ "type": "proxmox", "apiUrl": "https://pve:8006", "node": "pve1", "vmid": 101, "kind": "qemu", "tokenEnv": "VPSMON_PROXMOX_TOKEN" }
```

```bash
setx VPSMON_PROXMOX_TOKEN "monitor@pve!vpsmon=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**http** กำหนด URL ของแต่ละคำสั่งตามเอกสาร API ของผู้ให้บริการ และอ้าง token ด้วย `${VPSMON_...}`:

```json
{ "type": "http", "actions": {
  "restart": { "method": "POST", "url": "https://api.example.com/v1/servers/123/reboot",
               "headers": { "Authorization": "Bearer ${VPSMON_API_TOKEN}" } }
} }
```

## ความปลอดภัย

- ค่าเริ่มต้นรับการเชื่อมต่อจากเครื่องนี้เท่านั้น
- ถ้าจะเปิดให้เครื่องอื่นเข้าได้ ต้องตั้ง `ADMIN_PASSWORD` มิฉะนั้นโปรแกรมจะไม่ยอมเริ่มทำงาน
  และควรใช้หลัง HTTPS reverse proxy หรือ VPN เพราะรหัสผ่านส่งแบบ Basic Auth

  ```bash
  set HOST=0.0.0.0
  set ADMIN_PASSWORD=รหัสผ่านที่ยาวและเดายาก
  node server.js
  ```

- คำสั่งปิดและรีสตาร์ทต้องพิมพ์ชื่อเครื่องยืนยันทุกครั้ง
- ทุกคำสั่งบันทึกใน `data/audit.log` รวมถึงผลยืนยันจาก ping หลังสั่ง
- อย่าเก็บรหัสผ่านหรือ token ใน `data/config.json` ให้ใช้ environment variable ที่ขึ้นต้นด้วย `VPSMON_`

## ตัวแปรที่ตั้งได้

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `PORT` | `8787` | พอร์ตของเว็บ |
| `HOST` | `127.0.0.1` | ที่อยู่ที่รับการเชื่อมต่อ |
| `ADMIN_PASSWORD` | ว่าง | รหัสผ่านหน้าเว็บ |
| `DATA_DIR` | `./data` | ที่เก็บการตั้งค่าและ log |

## ทดสอบ

```bash
npm test
```

## Console

หน้า Console รันคำสั่งทีละคำสั่งบนเครื่องที่ตั้งวิธีควบคุมเป็น `ssh` หรือ `windows` และแสดงผลทันทีที่เครื่องตอบ

- `ssh` ใช้ SSH key เดียวกับคำสั่ง power และรันด้วยสิทธิ์ของ user นั้น
- `windows` ใช้ `winrs` ต้องเปิด WinRM บนเครื่องปลายทาง
- ไม่รองรับโปรแกรมที่ต้องตอบโต้ เช่น `vim` หรือ `top` คำสั่งหมดเวลาใน 120 วินาที
- ทุกคำสั่งถูกบันทึกใน `data/audit.log` จึงไม่ควรใส่รหัสผ่านในคำสั่ง

## Remote

| วิธี | ใช้กับ | ต้องตั้งค่า |
|---|---|---|
| VNC ในหน้าเว็บ | Linux และ Windows ที่ลง VNC server | ใส่ VNC port เช่น 5900 |
| Remote Desktop | Windows Pro/Server ที่เปิด RDP | ใส่ RDP port เช่น 3389 |

VNC รับส่งแบบไม่เข้ารหัสระหว่างโปรแกรมนี้กับเครื่องปลายทาง ถ้าเครื่องอยู่นอก LAN ให้ใช้ผ่าน VPN หรือ SSH tunnel
ปุ่ม "เปิด Remote Desktop" ใช้ได้เมื่อรันโปรแกรมบน Windows เครื่องเดียวกับที่เปิดเว็บ นอกนั้นให้ใช้ไฟล์ .rdp

ลองหน้า Remote โดยไม่มีเครื่องจริงได้ด้วย VNC จำลอง แล้วเพิ่มเครื่อง host `127.0.0.1` VNC port `5999`:

```bash
node tools/fake-vnc-server.js
```

หน้าคุมจอใช้ [noVNC](https://github.com/novnc/noVNC) 1.6.0 (MPL-2.0) เก็บไว้ใน `public/vendor/novnc`

## ธีม

หน้าตาอยู่ใน `public/theme.css` และ `public/village.css` มีธีมสว่างและมืด สลับได้ที่ปุ่มมุมขวาบน ส่วนช่อง Console ใช้สี One Dark ทั้งสองธีม
NPC และเตียงวาดด้วยโค้ดใน `public/app.js` ไม่มีไฟล์ภาพจากเกม อาชีพของ NPC กำหนดจากรหัสเครื่องจึงไม่เปลี่ยนเมื่อเปลี่ยนชื่อ
ถ้าตั้ง Windows ให้ลดการเคลื่อนไหว โปรแกรมจะปิด animation ให้เอง

ฟอนต์ Chakra Petch และ IBM Plex Sans Thai (SIL OFL) อยู่ใน `public/vendor/fonts` ไอคอนใช้ Lucide (ISC) อยู่ใน `public/icons.js`

## โปรแกรมบน Windows

โปรแกรมเปิดเป็นหน้าต่างของตัวเองด้วย Electron กดปิดหน้าต่างแล้วยังตรวจเครื่องต่อที่ถาดข้างนาฬิกา ออกจริงจากเมนูคลิกขวาที่ไอคอนในถาด

สร้างตัวติดตั้ง `dist/VPS-Monitor-Setup.exe` ด้วยคำสั่งนี้ ควรทำในโฟลเดอร์ที่ path สั้น:

```bash
npm install
npm run dist
```

ข้อมูลอยู่ที่ `%APPDATA%\VPS Monitor\data` และไม่ถูกลบตอนอัปเดต
