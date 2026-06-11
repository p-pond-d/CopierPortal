# 📋 Copier Report Portal — อธิบายขั้นตอนการทำงานทั้งระบบ

---

## 1. ภาพรวม Architecture (โครงสร้างระบบ)

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                     │
│              React SPA  (frontend/build/)                │
└───────────────────┬─────────────────────────────────────┘
                    │  HTTP Request (port 5000)
                    ▼
┌─────────────────────────────────────────────────────────┐
│                  Express.js Server                       │
│                 backend/server.js                        │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Routes (แยกไฟล์ตามหมวด)                         │   │
│  │  ├── auth.js     → /api/login                    │   │
│  │  ├── reports.js  → /api/reports, /api/upload...  │   │
│  │  ├── users.js    → /api/users, /api/admin/users  │   │
│  │  ├── rates.js    → /api/rates                    │   │
│  │  └── logs.js     → /api/logs, /api/admin/logs    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │ middleware/      │  │ utils/                       │  │
│  │ auth.js (JWT)   │  │ ├── helpers.js (parse/mask)  │  │
│  └─────────────────┘  │ └── dbInit.js (DB setup)     │  │
│                       └──────────────────────────────┘  │
└───────────────────┬─────────────────────────────────────┘
                    │  mssql (TCP port 1433)
                    ▼
┌─────────────────────────────────────────────────────────┐
│               Microsoft SQL Server                       │
│              Database: CopierReportDB                    │
│   Tables: Users, Reports, UsageDetails,                  │
│           MonthlySummaries, SystemLogs                   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. โครงสร้างฐานข้อมูล (SQL Server Tables)

### `Users` — บัญชีผู้ใช้งานระบบ
| Column | Type | คำอธิบาย |
|---|---|---|
| id | INT IDENTITY | Primary Key |
| username | NVARCHAR(100) | ชื่อผู้ใช้ (unique) |
| password | NVARCHAR(255) | bcrypt hash |
| role | NVARCHAR(50) | `admin` หรือ `user` |
| created_at | DATETIME | วันที่สร้าง |

### `Reports` — ไฟล์รายงานที่นำเข้า
| Column | Type | คำอธิบาย |
|---|---|---|
| id | INT IDENTITY | Primary Key |
| filename | NVARCHAR | ชื่อไฟล์ต้นฉบับที่อัปโหลด |
| **printer_name** | NVARCHAR(100) | **ชื่อเครื่องพิมพ์ (แยกจากชื่อไฟล์)** |
| report_date | DATE | งวดรอบบิล |
| total_cost | DECIMAL(18,2) | ยอดรวมค่าบริการ |
| uploaded_at | DATETIME | วันที่นำเข้า |

### `UsageDetails` — รายละเอียดการใช้งานรายบุคคล
| Column | Type | คำอธิบาย |
|---|---|---|
| id | INT IDENTITY | Primary Key |
| report_id | INT | FK → Reports.id |
| user_id | NVARCHAR | รหัสพนักงาน |
| name | NVARCHAR | ชื่อพนักงาน |
| print_bw / print_color | INT | จำนวนแผ่นพิมพ์ขาวดำ/สี |
| copy_bw / copy_color | INT | จำนวนแผ่นถ่ายเอกสารขาวดำ/สี |
| scanner | INT | จำนวนแผ่นสแกน |
| total_pages | INT | รวมทุกประเภท |
| cost | DECIMAL(18,2) | ค่าบริการคำนวณแล้ว |

### `MonthlySummaries` — ตาราง Cache สรุปรายเดือน
> สร้าง/อัปเดตใหม่ทุกครั้งที่มีการ Upload หรือ Delete ไฟล์รายงาน

### `SystemLogs` — บันทึกกิจกรรมในระบบ
> บันทึกทุก action สำคัญ เช่น LOGIN, UPLOAD, DELETE_REPORT, EXPORT ฯลฯ

---

## 3. การเริ่มต้นระบบ (Startup Flow)

```
npm run dev
    │
    ├─► [backend] node backend/server.js
    │       │
    │       ├─ โหลด .env (DB credentials, JWT_SECRET, PORT)
    │       ├─ เชื่อมต่อ SQL Server ผ่าน config/db.js
    │       │       └─ สร้าง Connection Pool (mssql)
    │       ├─ Mount routes ทั้งหมดที่ /api/*
    │       ├─ Serve static files จาก frontend/build/
    │       └─ เรียก initDatabase() ตอน server start
    │               │
    │               ├─ สร้าง Tables ถ้ายังไม่มี (IF NOT EXISTS)
    │               ├─ Seed admin/user บัญชีเริ่มต้น (password: 123456)
    │               ├─ เพิ่มคอลัมน์ printer_name ถ้ายังไม่มี
    │               ├─ Migrate printer_name จากชื่อไฟล์เก่า
    │               ├─ สร้าง Indexes (printer_name, cost)
    │               └─ rebuildMonthlySummaries() สร้าง Cache ล่าสุด
    │
    └─► [frontend] npm start (React dev server port 3000)
            └─ Proxy API requests → port 5000
```

---

## 4. ระบบ Authentication (การเข้าสู่ระบบ)

### ขั้นตอน Login
```
User กรอก username + password
    │
    ▼
POST /api/login
    │
    ├─ Query: SELECT จาก Users WHERE username = @username
    ├─ bcrypt.compare(password, hash) → ตรวจสอบรหัสผ่าน
    ├─ ถ้าถูกต้อง → jwt.sign({ username, role }, JWT_SECRET, { expiresIn: '24h' })
    ├─ บันทึก Log: LOGIN สำเร็จ
    └─ ส่ง token กลับ client
```

### JWT Token การทำงาน
```
Client เก็บ token ใน localStorage
    │
    ▼ ทุก request หลังจากนี้
axios interceptor → headers['Authorization'] = token
    │
    ▼
middleware/auth.js
    ├─ jwt.verify(token, JWT_SECRET)
    ├─ ถอดรหัส → req.role, req.username
    └─ next() → route handler ต่อไป
```

### สิทธิ์การเข้าถึง
| Role | สิทธิ์ |
|---|---|
| `admin` | ทุก endpoint รวมถึง Upload, Delete, จัดการผู้ใช้, ดู Logs |
| `user` | อ่านข้อมูลได้ แต่ข้อมูลส่วนบุคคลจะถูก Mask |

---

## 5. การอัปโหลดไฟล์รายงาน (Upload Flow)

```
Admin เลือกไฟล์ CSV/Excel + เลือกงวดเดือน
    │
    ▼
POST /api/upload (multipart/form-data)
    │
    ├─ [1] ตรวจสอบนามสกุลไฟล์ (.csv / .xlsx / .xls)
    │
    ├─ [2] Parse ไฟล์:
    │       CSV  → parseCSV(buffer)  → ใช้ csv-parser
    │       Excel → parseExcel(buffer) → ใช้ xlsx library
    │
    ├─ [3] Fuzzy Match column headers (ยืดหยุ่น รองรับชื่อคอลัมน์หลายแบบ):
    │       User ID   → 'user', 'userid', 'id', 'user id'
    │       Name      → 'name', 'fullname', 'full name'
    │       Print B&W → columns มีคำ 'printer' + 'black/bw/b&w'
    │       Print Col → columns มีคำ 'printer' + 'color'
    │       Copy B&W  → columns มีคำ 'copier/document' + 'black'
    │       Copy Col  → columns มีคำ 'copier/document' + 'color'
    │       Scanner   → columns มีคำ 'scanner/scan'
    │
    ├─ [4] แยกชื่อเครื่องพิมพ์จากชื่อไฟล์:
    │       "RICOH IM 2702_usercounter_2025.csv"
    │        └─► printer_name = "RICOH IM 2702"
    │       (ตัดทุกอย่างที่อยู่หลัง "_usercounter")
    │
    ├─ [5] คำนวณ cost แต่ละ row:
    │       cost = (print_bw × rate_bw) + (print_color × rate_color)
    │            + (copy_bw × rate_copy_bw) + (copy_color × rate_copy_color)
    │            + (scanner × rate_scan)
    │
    ├─ [6] SQL Transaction (Atomic):
    │       INSERT INTO Reports (filename, report_date, total_cost, printer_name)
    │       → ได้ report_id
    │       INSERT INTO UsageDetails (report_id, user_id, name, ...) สำหรับทุก row
    │       COMMIT หรือ ROLLBACK ถ้ามี error
    │
    ├─ [7] rebuildMonthlySummaries() → อัปเดต Cache
    └─ [8] logActivity('UPLOAD', ...)
```

---

## 6. ระบบ Printer Filter (การแยกตามเครื่องพิมพ์)

### แยกชื่อเครื่องพิมพ์จากชื่อไฟล์ (ตอน Upload)
```javascript
// ชื่อไฟล์: "RICOH IM 2702_usercounter_May2025.csv"
let printerName = originalname.replace(/\.[^/.]+$/, ""); // ตัด extension
const pMatch = printerName.match(/^(.*?)_usercounter/i);
if (pMatch) printerName = pMatch[1].trim();
// → printer_name = "RICOH IM 2702"
```

### Filter ข้อมูลตามเครื่องพิมพ์ (ตอนดู)
```
GET /api/users?printer=RICOH IM 2702
    │
    ▼  (users.js)
SELECT DISTINCT ud.user_id, ud.name
FROM UsageDetails ud
JOIN Reports r ON ud.report_id = r.id
WHERE r.printer_name = @printer    ← filter ตรงนี้
ORDER BY ud.name ASC
```

---

## 7. ค้นหาและวิเคราะห์รายบุคคล (Tab 2 Flow)

```
[Tab: ข้อมูลรายบุคคล]
    │
    ▼
STEP 1: เลือกเครื่องพิมพ์จาก Dropdown บนซ้าย
    │
    ├─ handlePrinterFilterChange(printer)
    │       └─ GET /api/users?printer={printer}
    │               └─ SQL: DISTINCT users ที่ใช้เครื่องพิมพ์นั้น
    │
    └─ รายชื่อพนักงานในกล่องซ้ายถูก filter ตามเครื่องพิมพ์

STEP 2: ค้นหา หรือ คลิกเลือกพนักงาน
    │
    ├─ พิมพ์ค้นหา → handleSearchChange()
    │       └─ filter จาก users[] ที่โหลดไว้แล้ว (client-side)
    │
    └─ คลิกชื่อ → handleSelectUser(user)
            └─ GET /api/users/{user_id}/summary?printer={printer}
                    │
                    └─ SQL:
                       SELECT r.report_date, r.filename, r.printer_name,
                              ud.print_bw, ud.print_color, ud.copy_bw,
                              ud.copy_color, ud.scanner, ud.total_pages, ud.cost
                       FROM UsageDetails ud
                       JOIN Reports r ON ud.report_id = r.id
                       WHERE ud.user_id = @user_id
                         AND r.printer_name = @printer  ← ถ้าเลือกไว้
                       ORDER BY r.report_date DESC

STEP 3: แสดงผลฝั่งขวา
    │
    ├─ ข้อมูลพนักงาน: ชื่อ, ID User, Badge เครื่องพิมพ์, ยอดรวม
    ├─ กราฟเส้น: ประวัติค่าใช้จ่ายรายเดือน (Chart.js Line)
    └─ ตาราง: รายละเอียดแต่ละงวด (เดือน/ปี, เครื่องพิมพ์, ยอดพิมพ์, ค่าบริการ)
```

---

## 8. ระบบ PDPA Masking (การปิดบังข้อมูล)

```
Role: admin → สามารถ toggle Mask ได้ด้วย Switch ในแถบซ้าย
Role: user  → บังคับ Mask เสมอ (ไม่สามารถปิดได้)
```

### การ Mask ฝั่ง Frontend (แสดงผล)
```javascript
// maskValue() ใน App.js
"kanapot"  → "k*****t"
"สมชาย"   → "ส**ย"
"1427"     → "1**7"
```

### การ Mask ฝั่ง Backend (API Response)
```javascript
// helpers.js — encodeId() & maskName()
// สำหรับ role === 'user':
user_id: encodeId(r.user_id)  // base64 encode ป้องกันดู ID ตรงๆ
name: maskName(r.name)        // ซ่อนตัวอักษรกลาง
```

> **หมายเหตุ:** admin เห็นข้อมูลจริงทั้งหมด, user เห็นเฉพาะข้อมูล masked

---

## 9. ระบบอัตราค่าบริการ (Rates)

```
rates.json (ใน backend/config/)
{
  "print_bw":    0.50,   ← บาทต่อแผ่น
  "print_color": 1.00,
  "copy_bw":     0.50,
  "copy_color":  1.00,
  "scan":        0.00
}
```

- **โหลด** ตอน Upload ไฟล์ → คำนวณ cost ทันที
- **เปลี่ยน** ผ่าน `/api/rates` (admin only) → บันทึกใหม่ใน rates.json
- **ข้อสังเกต:** rate เปลี่ยนไม่ย้อนหลัง ข้อมูลที่บันทึกไปแล้วยังคง cost เดิม

---

## 10. ระบบ Summary Cache (MonthlySummaries)

เพื่อความเร็ว แทนที่จะ query UsageDetails ทุกครั้ง ระบบใช้ cache table:

```
ทุกครั้งที่ Upload หรือ Delete ไฟล์:
    │
    ▼
rebuildMonthlySummaries(pool)
    │
    ├─ DELETE FROM MonthlySummaries  (ล้างทั้งหมด)
    └─ INSERT ใหม่:
       SELECT YEAR, MONTH, COUNT(DISTINCT user_id), SUM(pages), SUM(cost)
       FROM Reports r JOIN UsageDetails ud
       GROUP BY YEAR(report_date), MONTH(report_date)
```

- Dashboard `/api/reports/summary` อ่านจาก MonthlySummaries (เร็ว)
- Filter ตามเครื่องพิมพ์ → query จาก Reports+UsageDetails ตรง (dynamic)

---

## 11. ระบบ SystemLogs (Activity Logging)

ทุก action สำคัญถูกบันทึกอัตโนมัติ:

| action_type | เมื่อไหร่ |
|---|---|
| `LOGIN` | เข้าสู่ระบบสำเร็จ |
| `LOGIN_FAILED` | กรอกรหัสผ่านผิด |
| `UPLOAD` | อัปโหลดไฟล์รายงาน |
| `DELETE_REPORT` | ลบไฟล์รายงาน |
| `CREATE_USER` | สร้างบัญชีผู้ใช้ใหม่ |
| `UPDATE_USER` | แก้ไขบัญชีผู้ใช้ |
| `DELETE_USER` | ลบบัญชีผู้ใช้ |
| `EXPORT_SUMMARY` | Export รายงานรายเดือน CSV |
| `EXPORT_USER_HISTORY` | Export ประวัติรายบุคคล CSV |
| `EXPORT_MONTH_DETAILS` | Export รายละเอียดประจำเดือน CSV |

> ดูได้ที่ Tab **บันทึกเหตุการณ์ (Logs)** — เฉพาะ admin เท่านั้น

---

## 12. โครงสร้างไฟล์ Backend (Modular)

```
backend/
├── server.js              ← Entry point: mount routes, start server
├── .env                   ← DB credentials, JWT_SECRET, PORT
├── config/
│   ├── db.js              ← SQL Server connection pool
│   └── rates.json         ← อัตราค่าบริการปัจจุบัน
├── middleware/
│   └── auth.js            ← JWT verify, adminOnly guard
├── routes/
│   ├── auth.js            ← POST /api/login
│   ├── reports.js         ← GET/POST/DELETE /api/reports, /api/upload
│   ├── users.js           ← GET /api/users, /api/users/:id/summary
│   ├── rates.js           ← GET/POST /api/rates
│   └── logs.js            ← POST /api/logs, GET /api/admin/logs
└── utils/
    ├── helpers.js          ← parse CSV/Excel, mask, rates, logActivity
    └── dbInit.js           ← สร้าง Tables, Seed users, Migration
```

---

## 13. โครงสร้างไฟล์ Frontend (React)

```
frontend/src/
└── App.js      ← Single-file React App (2,100+ บรรทัด)
    │
    ├── State Management (useState):
    │   ├── token, userRole, usernameState  → Session
    │   ├── reports, summaryData, users     → Data
    │   ├── selectedPrinter                 → Dashboard filter
    │   ├── userFilterPrinter, selectedUser → Tab 2 filter
    │   ├── isMasked                        → Privacy toggle
    │   └── systemLogs, adminUsers          → Admin tabs
    │
    ├── API Calls (axios):
    │   ├── fetchGlobalData()      → โหลดข้อมูลทั้งหมดเมื่อ login
    │   ├── handlePrinterFilterChange() → filter users ตามเครื่องพิมพ์
    │   ├── handleSelectUser()     → โหลดประวัติรายบุคคล
    │   └── exportXxx()            → Export CSV
    │
    └── UI Tabs:
        ├── dashboard    → ภาพรวม + กราฟ + ตารางรายเดือน
        ├── users        → ค้นหารายบุคคล (Printer Filter → User List → Detail)
        ├── categories   → วิเคราะห์ตามประเภทบริการ (Pie Chart)
        ├── upload       → อัปโหลดไฟล์ [admin only]
        ├── manage-users → จัดการบัญชีผู้ใช้ [admin only]
        └── system-logs  → บันทึกเหตุการณ์ [admin only]
```

---

## 14. Security Controls สรุป

| มาตรการ | รายละเอียด |
|---|---|
| JWT Authentication | token หมดอายุ 24 ชั่วโมง |
| bcrypt Password | hash รหัสผ่านด้วย salt rounds 10 |
| SQL Parameterized Query | ทุก query ใช้ `.input()` ป้องกัน SQL Injection |
| RBAC | admin/user แยกสิทธิ์ชัดเจน |
| PDPA Masking | user role เห็นแค่ข้อมูล masked เสมอ |
| Base64 User ID | encodeId() ป้องกัน user เห็น raw ID ใน network |
| DB Indexes | ลด query time สำหรับ printer_name และ cost |
