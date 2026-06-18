# Copier Portal Dashboard

ระบบแดชบอร์ดสำหรับบริหารจัดการและวิเคราะห์ข้อมูลรายงานการใช้งานเครื่องถ่ายเอกสารและเครื่องพิมพ์ (Copier & Printer Usage Reports) รองรับการแสดงผลแบบ Responsive Web Design (RWD) และระบบวิเคราะห์เปรียบเทียบสถิติรายปี (Year-over-Year - YoY)

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)
- **Frontend:** React.js, Chart.js, SheetJS (XLSX Export)
- **Backend:** Node.js, Express.js, PostgreSQL Client (`pg`)
- **Database:** Neon PostgreSQL (Cloud database)

---

## 🚀 สรุปคำสั่งการทำงานทั้งหมด (Command Summary Reference)

กรุณาใช้โปรแกรม **Terminal** หรือ **PowerShell** ในการรันคำสั่งเหล่านี้จากโฟลเดอร์หลักของโปรเจกต์ (`D:\PythonScript`)

### 1. การติดตั้งและเตรียมระบบ (Setup & Installation)

ติดตั้ง Dependencies ทั้งฝั่ง Backend และ Frontend:
```powershell
# ติดตั้งฝั่งเซิร์ฟเวอร์หลังบ้าน
cd backend
npm install

# ติดตั้งฝั่งหน้าเว็บ
cd ../frontend
npm install
cd ..
```

### 2. การสร้างและจัดการฐานข้อมูล (Database Management)

โอนย้ายโครงสร้างตารางข้อมูลและประวัติจาก MSSQL เดิมไปยัง Cloud PostgreSQL (Neon):
```powershell
node backend/migrate_data.js
```
*(คำสั่งนี้จะสร้างตารางข้อมูลทั้งหมดที่จำเป็น พร้อมทั้งดึงข้อมูลเดิมจากเครื่องโลคอลขึ้นคลาวด์ให้อัตโนมัติ)*

### 3. การจำลองข้อมูลสำหรับการทดสอบ (Mock Data Generation)

รันคำสั่งเพื่อสร้างข้อมูลการพิมพ์จำลองย้อนหลัง 24 เดือน (ม.ค. 2025 - ธ.ค. 2026) เพื่อใช้ในการทดสอบกราฟและตารางเปรียบเทียบสถิติรายปี (YoY):
```powershell
node generate_mock_data.js
```
*หลังจากรันสำเร็จ ข้อมูลจำลองไฟล์ CSV ทั้งหมดจะไปแสดงอยู่ในโฟลเดอร์ `d:\PythonScript\mock_data`*

### 4. การรันระบบในโหมดพัฒนาโลคอล (Local Development)

รัน Backend Server และ Frontend Client แยกกันเพื่อทดสอบในเครื่องโลคอล:
```powershell
# รัน Backend Server (ทำงานบนพอร์ต 5000)
cd backend
npm start

# รัน Frontend Client (ทำงานบนพอร์ต 3000)
cd ../frontend
npm start
```
*เปิดเว็บเบราว์เซอร์และเข้าไปที่ [http://localhost:3000](http://localhost:3000) เพื่อเข้าใช้งานระบบหลัก*

### 5. การรันสคริปต์ล้างข้อมูลและทดสอบระบบอัตโนมัติ (Verification & Integration Tests)

สคริปต์รันจำลอง Backend Server, รัน Integration Test ฝั่ง API, สั่งหยุดการทำงาน และตรวจสอบการ Build หน้าเว็บในคำสั่งเดียว:
```powershell
# รันคำสั่งทำความสะอาดไฟล์ขยะ (ถ้ามี)
.\clean.ps1

# รันระบบทดสอบ API Integration Test และตรวจสอบสิทธิ์ R/W ทั้งระบบ
.\verify.ps1
```

### 6. การสร้าง Build สำหรับการใช้งานจริง (Production Build)

คอมไพล์โค้ดฝั่ง React Frontend ให้เป็นไฟล์ HTML/JS ที่พร้อมสำหรับการ Deploy ขึ้นเซิร์ฟเวอร์หลัก:
```powershell
cd frontend
npm run build
cd ..
```
*ไฟล์ที่คอมไพล์เสร็จเรียบร้อยจะถูกบันทึกอยู่ที่โฟลเดอร์ `frontend/build` ซึ่ง Backend จะนำไฟล์นี้ไปจัดเสิร์ฟโดยอัตโนมัติในฝั่งเซิร์ฟเวอร์หลัก*

### 7. การ Deploy อัปเดตไปยังเซิร์ฟเวอร์จริง (Production Deployment)

สั่งอัปโหลดไฟล์ที่มีการเปลี่ยนแปลงล่าสุดทั้งหมดขึ้น GitHub เพื่อให้ Vercel ทำการ Deploy ขึ้นเซิร์ฟเวอร์จริงแบบอัตโนมัติ (CI/CD):
```powershell
.\push_to_github.ps1
```
*(หมายเหตุ: แนะนำให้เปิด PowerShell ด้วยสิทธิ์ **Administrator** ในการรันคำสั่งอัปเดตระบบขึ้น GitHub)*
