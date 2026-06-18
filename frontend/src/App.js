import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  LayoutDashboard, 
  User as UserIcon, 
  PieChart as ChartIcon, 
  UploadCloud, 
  Printer, 
  DollarSign, 
  Trash2, 
  Search, 
  Calendar, 
  FileText, 
  Shield, 
  AlertCircle, 
  CheckCircle2, 
  FileCode,
  Layers,
  ChevronRight,
  Eye,
  EyeOff,
  Info
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

// Register Chart.js modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_BASE = `http://${window.location.hostname}:5000/api`;

// Setup Axios Interceptor to automatically add Authorization header
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('copier_token');
    if (token) {
      config.headers['Authorization'] = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Helper to mask User ID & Name
function maskValue(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (s.length <= 2) return '**';
  return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1];
}

// Helper to safely format Thai Month and Year from date string to avoid timezone shifting
function formatThaiMonthYear(dateStr) {
  if (!dateStr) return '-';
  const matches = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matches) {
    const year = parseInt(matches[1], 10);
    const month = parseInt(matches[2], 10);
    const localDate = new Date(year, month - 1, 2);
    return localDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

// Custom plugin to draw totals at the top of each stacked bar in Chart.js
const stackedTotalsPlugin = {
  id: 'stackedTotals',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    
    const datasets = chart.data.datasets;
    if (!datasets || datasets.length === 0) return;
    
    const meta0 = chart.getDatasetMeta(0);
    if (!meta0 || !meta0.data) return;
    const dataLength = meta0.data.length;
    
    for (let index = 0; index < dataLength; index++) {
      const stacks = {};
      
      datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;
        
        const stackName = dataset.stack || 'default';
        const val = dataset.data[index] || 0;
        
        if (!stacks[stackName]) {
          stacks[stackName] = {
            total: 0,
            topY: Infinity,
            model: null
          };
        }
        
        stacks[stackName].total += val;
        
        const model = meta.data[index];
        if (model && typeof model.y === 'number' && model.y < stacks[stackName].topY) {
          stacks[stackName].topY = model.y;
          stacks[stackName].model = model;
        }
      });
      
      Object.keys(stacks).forEach(stackName => {
        const stack = stacks[stackName];
        if (stack.total === 0) return;
        
        const model = stack.model;
        if (!model || typeof model.x !== 'number' || typeof model.y !== 'number') return;
        
        ctx.font = 'bold 9px Inter, Outfit, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'center';
        ctx.fillText(stack.total.toLocaleString(), model.x, model.y - 6);
      });
    }
    
    ctx.restore();
  }
};

function App() {
  // Login & Session states
  const [token, setToken] = useState(() => localStorage.getItem('copier_token') || '');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('copier_role') || '');
  const [usernameState, setUsernameState] = useState(() => localStorage.getItem('copier_username') || '');

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMasked, setIsMasked] = useState(true); // Default true following SC-3 logic
  const [reports, setReports] = useState([]);
  const [summaryData, setSummaryData] = useState([]);
  const [categoriesData, setCategoriesData] = useState(null);
  const [categoryTrendData, setCategoryTrendData] = useState([]);
  const [users, setUsers] = useState([]);
  const [rates, setRates] = useState({
    print_bw: 0.50,
    print_color: 1.00,
    copy_bw: 0.50,
    copy_color: 1.00,
    scan: 0.00
  });
  const [editRates, setEditRates] = useState({
    print_bw: '0.50',
    print_color: '1.00',
    copy_bw: '0.50',
    copy_color: '1.00',
    scan: '0.00'
  });
  
  // Loading & Alert states
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPeriod, setUploadPeriod] = useState(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
  });

  // Individual user search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userHistory, setUserHistory] = useState([]);
  const [userFilterPrinter, setUserFilterPrinter] = useState('');
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef(null);

  // Category filter state
  const [catFilterYear, setCatFilterYear] = useState('');
  const [catFilterMonth, setCatFilterMonth] = useState('');

  // Printer filter state
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');

  // User administration states
  const [adminUsers, setAdminUsers] = useState([]);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'user' });
  const [editingUserId, setEditingUserId] = useState(null);

  // System activity logging states
  const [systemLogs, setSystemLogs] = useState([]);
  const [logFilterUser, setLogFilterUser] = useState('');
  const [logFilterType, setLogFilterType] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logTotalCount, setLogTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Printer inventory states
  const [inventoryPrinters, setInventoryPrinters] = useState([]);
  const [inventoryForm, setInventoryForm] = useState({ printer_name: '', serial_number: '', location: '' });
  const [editingInventoryId, setEditingInventoryId] = useState(null);

  // Upload conflict warning modal state
  const [uploadConflict, setUploadConflict] = useState(null); // { filename, reportDate, printerName, conflictDetails, conflictType, fileToUpload }
  const [uploadPrinterName, setUploadPrinterName] = useState('');
  const [selectedUserIdsForImport, setSelectedUserIdsForImport] = useState([]);
  const [showComparisonTable, setShowComparisonTable] = useState(false);

  // Presentation Slide states
  const [aboutSlideTab, setAboutSlideTab] = useState(1);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(logFilterUser);
    }, 500);
    return () => clearTimeout(handler);
  }, [logFilterUser]);

  useEffect(() => {
    if (token) {
      fetchGlobalData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Force user role to only use Masked mode and redirect from unauthorized tabs
  useEffect(() => {
    if (userRole === 'user') {
      setIsMasked(true);
      if (activeTab === 'upload' || activeTab === 'manage-users' || activeTab === 'system-logs' || activeTab === 'printers-inventory') {
        setActiveTab('dashboard');
      }
    }
  }, [activeTab, userRole]);
  
  // Fetch helper
  const fetchGlobalData = async (printer = selectedPrinter) => {
    setLoading(true);
    try {
      const resReports = await axios.get(`${API_BASE}/reports`);
      setReports(resReports.data);

      const resSummary = await axios.get(`${API_BASE}/reports/summary`, {
        params: { printer }
      });
      setSummaryData(resSummary.data);

      const resUsers = await axios.get(`${API_BASE}/users`, {
        params: { printer: userFilterPrinter }
      });
      setUsers(resUsers.data);

      await fetchRates();
      fetchCategoryBreakdown(catFilterYear, catFilterMonth, printer);
      fetchPrinters();
      fetchInventoryPrinters();
    } catch (err) {
      console.error('Error fetching global data:', err);
      if (err.response?.status === 401) {
        handleLogout();
        showAlert('danger', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      } else {
        showAlert('danger', 'ไม่สามารถเชื่อมต่อระบบหลังบ้านหรือฐานข้อมูลได้ กรุณาตรวจสอบการเปิดใช้งาน Server');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoryBreakdown = async (year = catFilterYear, month = catFilterMonth, printer = selectedPrinter) => {
    try {
      const resCat = await axios.get(`${API_BASE}/reports/categories`, {
        params: { year, month, printer }
      });
      setCategoriesData(resCat.data);

      if (year) {
        const resTrend = await axios.get(`${API_BASE}/reports/categories/trend`, {
          params: { year, printer }
        });
        setCategoryTrendData(resTrend.data || []);
      } else {
        setCategoryTrendData([]);
      }
    } catch (err) {
      console.error('Error fetching categories breakdown/trend:', err);
    }
  };

  const fetchPrinters = async () => {
    try {
      const res = await axios.get(`${API_BASE}/printers`);
      setPrinters(res.data);
    } catch (err) {
      console.error('Error fetching printers:', err);
    }
  };

  const fetchInventoryPrinters = async () => {
    try {
      const res = await axios.get(`${API_BASE}/inventory/printers`);
      setInventoryPrinters(res.data);
    } catch (err) {
      console.error('Error fetching inventory printers:', err);
    }
  };

  const handleInventoryFormSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingInventoryId) {
        await axios.put(`${API_BASE}/inventory/printers/${editingInventoryId}`, inventoryForm);
        showAlert('success', 'แก้ไขข้อมูลเครื่องพิมพ์ในคลังสำเร็จ');
      } else {
        await axios.post(`${API_BASE}/inventory/printers`, inventoryForm);
        showAlert('success', 'เพิ่มเครื่องพิมพ์เข้าคลังสำเร็จ');
      }
      setInventoryForm({ printer_name: '', serial_number: '', location: '' });
      setEditingInventoryId(null);
      fetchInventoryPrinters();
      fetchPrinters();
    } catch (err) {
      console.error('Inventory submit error:', err);
      const msg = err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลเครื่องพิมพ์';
      showAlert('danger', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEditInventoryPrinter = (printer) => {
    setEditingInventoryId(printer.id);
    setInventoryForm({
      printer_name: printer.printer_name,
      serial_number: printer.serial_number,
      location: printer.location
    });
  };

  const handleDeleteInventoryPrinter = async (id, name) => {
    if (!window.confirm(`คุณต้องการลบเครื่องพิมพ์ ${name} ออกจากคลังใช่หรือไม่?`)) {
      return;
    }
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/inventory/printers/${id}`);
      showAlert('success', 'ลบเครื่องพิมพ์ออกจากคลังสำเร็จ');
      fetchInventoryPrinters();
      fetchPrinters();
    } catch (err) {
      console.error('Inventory delete error:', err);
      const msg = err.response?.data?.error || 'เกิดข้อผิดพลาดในการลบเครื่องพิมพ์';
      showAlert('danger', msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchRates = async () => {
    try {
      const res = await axios.get(`${API_BASE}/rates`);
      setRates(res.data);
      setEditRates({
        print_bw: res.data.print_bw.toString(),
        print_color: res.data.print_color.toString(),
        copy_bw: res.data.copy_bw.toString(),
        copy_color: res.data.copy_color.toString(),
        scan: res.data.scan.toString()
      });
    } catch (err) {
      console.error('Error fetching rates:', err);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      const res = await axios.post(`${API_BASE}/login`, {
        username: loginUsername,
        password: loginPassword
      });
      const { token, role, username } = res.data;
      localStorage.setItem('copier_token', token);
      localStorage.setItem('copier_role', role);
      localStorage.setItem('copier_username', username);
      setToken(token);
      setUserRole(role);
      setUsernameState(username);
      
      if (role === 'user') {
        setIsMasked(true);
      }
      
      showAlert('success', `ยินดีต้อนรับคุณ ${username} (${role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน'})`);
      setLoginUsername('');
      setLoginPassword('');
      setShowLoginPassword(false);
    } catch (err) {
      console.error('Login error:', err);
      const msg = err.response?.data?.error || 'เข้าสู่ระบบล้มเหลว กรุณาตรวจสอบการเปิดใช้งาน Server';
      setLoginError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('copier_token');
    localStorage.removeItem('copier_role');
    localStorage.removeItem('copier_username');
    setToken('');
    setUserRole('');
    setUsernameState('');
    setSelectedUser(null);
    setUserHistory([]);
    setSearchQuery('');
    setShowLoginPassword(false);
    setActiveTab('dashboard');
  };

  const handleRatesSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/rates`, editRates);
      showAlert('success', 'ปรับปรุงอัตราค่าบริการเรียบร้อยแล้ว');
      setRates(res.data.rates);
    } catch (err) {
      console.error('Error updating rates:', err);
      const msg = err.response?.data?.error || 'เกิดข้อผิดพลาดในการปรับปรุงอัตราค่าบริการ';
      showAlert('danger', msg);
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 6000);
  };

  // Handle file drop/select
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      showAlert('warning', 'กรุณาเลือกไฟล์ CSV หรือ Excel ก่อนกดอัปโหลด');
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    
    // Convert YYYY-MM to YYYY-MM-DD
    const reportDate = `${uploadPeriod}-01`;
    formData.append('report_date', reportDate);
    if (uploadPrinterName) {
      formData.append('printer_name', uploadPrinterName);
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showAlert('success', `นำเข้าข้อมูลสำเร็จ: ${res.data.message} (${res.data.recordsCount} รายการ)`);
      setUploadFile(null);
      setUploadPrinterName('');
      fetchGlobalData();
    } catch (err) {
      console.error('Upload error:', err);
      if (err.response?.status === 409 && err.response?.data?.error === 'DUPLICATE_DETECTED') {
        const uConflict = {
          filename: uploadFile.name,
          reportDate: reportDate,
          printerName: uploadPrinterName || uploadFile.name.replace(/\.[^/.]+$/, "").replace(/_usercounter/i, "").trim(),
          conflictDetails: err.response.data.conflictDetails,
          conflictType: err.response.data.conflictType,
          formData: formData,
          uploadedRows: err.response.data.uploadedRows || [],
          existingRows: err.response.data.existingRows || [],
          renamedFilename: err.response.data.renamedFilename || ''
        };
        setUploadConflict(uConflict);
        // By default, select all uploaded user records
        const allUserIds = (err.response.data.uploadedRows || []).map(r => r.userId);
        setSelectedUserIdsForImport(allUserIds);
      } else {
        const msg = err.response?.data?.error || 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์';
        showAlert('danger', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmForceUpload = async () => {
    if (!uploadConflict) return;
    setLoading(true);
    const { formData } = uploadConflict;
    try {
      // Append only the selected user IDs for import
      formData.delete('selected_user_ids');
      formData.append('selected_user_ids', JSON.stringify(selectedUserIdsForImport));

      const res = await axios.post(`${API_BASE}/upload?force_import=true`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showAlert('success', `นำเข้าข้อมูลเรียบร้อยแล้ว: ${res.data.message} (${res.data.recordsCount} รายการ)`);
      setUploadFile(null);
      setUploadPrinterName('');
      setUploadConflict(null);
      setSelectedUserIdsForImport([]);
      fetchGlobalData();
    } catch (err) {
      console.error('Force upload error:', err);
      const msg = err.response?.data?.error || 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล';
      showAlert('danger', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelUpload = () => {
    setUploadConflict(null);
    setSelectedUserIdsForImport([]);
    setShowComparisonTable(false);
  };

  const handleDeleteReport = async (id) => {
    if (!window.confirm('คุณต้องการลบไฟล์รายงานนี้และข้อมูลการใช้งานที่เกี่ยวข้องทั้งหมดใช่หรือไม่? ข้อมูลนี้จะถูกลบออกจากฐานข้อมูลอย่างถาวร')) {
      return;
    }
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/reports/${id}`);
      showAlert('success', 'ลบไฟล์รายงานเรียบร้อยแล้ว');
      fetchGlobalData();
      if (selectedUser) setSelectedUser(null);
    } catch (err) {
      console.error('Delete error:', err);
      showAlert('danger', 'ไม่สามารถลบไฟล์รายงานได้');
    } finally {
      setLoading(false);
    }
  };

  // User administration API helpers
  const fetchAdminUsers = async () => {
    if (userRole !== 'admin') return;
    try {
      const res = await axios.get(`${API_BASE}/admin/users`);
      setAdminUsers(res.data);
    } catch (err) {
      console.error('Error fetching admin users:', err);
    }
  };

  useEffect(() => {
    if (token && userRole === 'admin' && activeTab === 'manage-users') {
      fetchAdminUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token, userRole]);

  const fetchSystemLogs = async (page = 1, search = logFilterUser, type = logFilterType) => {
    if (userRole !== 'admin') return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/admin/logs`, {
        params: { page, limit: 50, search, type }
      });
      setSystemLogs(res.data.logs || []);
      setLogTotalPages(res.data.totalPages || 1);
      setLogPage(res.data.page || 1);
      setLogTotalCount(res.data.total || 0);
    } catch (err) {
      console.error('Error fetching logs:', err);
      const msg = err.response?.data?.error || err.message || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ';
      showAlert('danger', `ไม่สามารถดึงข้อมูลบันทึกเหตุการณ์ได้: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && userRole === 'admin' && activeTab === 'system-logs') {
      fetchSystemLogs(logPage, debouncedSearch, logFilterType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token, userRole, logPage, debouncedSearch, logFilterType]);

  const handleUserFormSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingUserId) {
        await axios.put(`${API_BASE}/admin/users/${editingUserId}`, userForm);
        showAlert('success', 'แก้ไขข้อมูลผู้ใช้งานสำเร็จ');
      } else {
        await axios.post(`${API_BASE}/admin/users`, userForm);
        showAlert('success', 'สร้างบัญชีผู้ใช้งานสำเร็จ');
      }
      setUserForm({ username: '', password: '', role: 'user' });
      setEditingUserId(null);
      fetchAdminUsers();
    } catch (err) {
      console.error('User submit error:', err);
      const msg = err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกบัญชีผู้ใช้งาน';
      showAlert('danger', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user) => {
    setEditingUserId(user.id);
    setUserForm({ username: user.username, password: user.password, role: user.role });
  };

  const handleDeleteUser = async (id, name) => {
    if (name === 'admin') {
      showAlert('danger', 'ไม่สามารถลบ root user เริ่มต้นได้');
      return;
    }
    if (!window.confirm(`คุณต้องการลบบัญชีผู้ใช้งาน ${name} ใช่หรือไม่?`)) {
      return;
    }
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/admin/users/${id}`);
      showAlert('success', 'ลบบัญชีผู้ใช้งานสำเร็จ');
      fetchAdminUsers();
    } catch (err) {
      console.error('User delete error:', err);
      showAlert('danger', 'เกิดข้อผิดพลาดในการลบบัญชีผู้ใช้งาน');
    } finally {
      setLoading(false);
    }
  };

  // CSV Export helper functions
  const exportMonthlySummary = () => {
    if (summaryData.length === 0) {
      showAlert('warning', 'ไม่มีข้อมูลสำหรับนำออก');
      return;
    }

    axios.post(`${API_BASE}/logs`, {
      action_type: 'EXPORT_SUMMARY',
      action_details: 'นำออกรายงานสถิติยอดการใช้งานเครื่องถ่ายเอกสารรายเดือนทั้งหมด (Export Monthly Summary CSV)'
    }).catch(err => console.error('Failed to log summary export:', err));

    const headers = [
      'ปี (ค.ศ.)',
      'เดือน',
      'จำนวนผู้ใช้งาน',
      'Print B&W (แผ่น)',
      'Print Color (แผ่น)',
      'Copy B&W (แผ่น)',
      'Copy Color (แผ่น)',
      'Scanner (แผ่น)',
      'รวมหน้า (แผ่น)',
      'รวมค่าบริการ (บาท)'
    ];

    const rows = summaryData.map(sum => [
      sum.year,
      new Date(`2026-${String(sum.month).padStart(2, '0')}-02`).toLocaleDateString('th-TH', { month: 'long' }),
      sum.total_users || 0,
      sum.print_bw || 0,
      sum.print_color || 0,
      sum.copy_bw || 0,
      sum.copy_color || 0,
      sum.scanner || 0,
      sum.total_pages || 0,
      sum.total_cost || 0
    ]);

    const sumUsers = rows.reduce((sum, r) => sum + (r[2] || 0), 0);
    const sumPrintBw = rows.reduce((sum, r) => sum + (r[3] || 0), 0);
    const sumPrintColor = rows.reduce((sum, r) => sum + (r[4] || 0), 0);
    const sumCopyBw = rows.reduce((sum, r) => sum + (r[5] || 0), 0);
    const sumCopyColor = rows.reduce((sum, r) => sum + (r[6] || 0), 0);
    const sumScanner = rows.reduce((sum, r) => sum + (r[7] || 0), 0);
    const sumPages = rows.reduce((sum, r) => sum + (r[8] || 0), 0);
    const sumCost = rows.reduce((sum, r) => sum + (r[9] || 0), 0);

    const footerRows = [
      [],
      ['สรุปยอดรวมทั้งสิ้น', '', sumUsers, sumPrintBw, sumPrintColor, sumCopyBw, sumCopyColor, sumScanner, sumPages, sumCost],
      [],
      ['อัตราค่าบริการปัจจุบัน', 'Print B&W', 'Print Color', 'Copy B&W', 'Copy Color', 'Scanner'],
      ['(บาท/แผ่น)', rates.print_bw, rates.print_color, rates.copy_bw, rates.copy_color, rates.scan]
    ];

    const allRows = [...rows, ...footerRows];

    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...allRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `monthly_summary_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const exportUserHistory = () => {
    if (!selectedUser || userHistory.length === 0) {
      showAlert('warning', 'ไม่มีข้อมูลสำหรับนำออก');
      return;
    }

    const headers = [
      'ID User',
      'ชื่อพนักงาน',
      'รอบงวดรายงาน',
      'ชื่อไฟล์รายงาน',
      'Print B&W (แผ่น)',
      'Print Color (แผ่น)',
      'Copy B&W (แผ่น)',
      'Copy Color (แผ่น)',
      'Scanner (แผ่น)',
      'รวมหน้า (แผ่น)',
      'ค่าบริการ (บาท)'
    ];

    const uid = isMasked ? maskValue(selectedUser.user_id) : selectedUser.user_id;
    const name = isMasked ? maskValue(selectedUser.name) : selectedUser.name;

    axios.post(`${API_BASE}/logs`, {
      action_type: 'EXPORT_USER_HISTORY',
      action_details: `นำออกประวัติการใช้งานของพนักงาน '${name}' (ID: ${uid})${userFilterPrinter ? ` เฉพาะเครื่องพิมพ์ '${userFilterPrinter}'` : ''}`
    }).catch(err => console.error('Failed to log user history export:', err));

    const rows = userHistory.map(h => [
      uid,
      name,
      formatThaiMonthYear(h.report_date),
      h.filename,
      h.print_bw || 0,
      h.print_color || 0,
      h.copy_bw || 0,
      h.copy_color || 0,
      h.scanner || 0,
      h.total_pages || 0,
      h.cost || 0
    ]);

    const sumPrintBw = rows.reduce((sum, r) => sum + (r[4] || 0), 0);
    const sumPrintColor = rows.reduce((sum, r) => sum + (r[5] || 0), 0);
    const sumCopyBw = rows.reduce((sum, r) => sum + (r[6] || 0), 0);
    const sumCopyColor = rows.reduce((sum, r) => sum + (r[7] || 0), 0);
    const sumScanner = rows.reduce((sum, r) => sum + (r[8] || 0), 0);
    const sumPages = rows.reduce((sum, r) => sum + (r[9] || 0), 0);
    const sumCost = rows.reduce((sum, r) => sum + (r[10] || 0), 0);

    const footerRows = [
      [],
      ['สรุปยอดรวมทั้งสิ้น', '', '', '', sumPrintBw, sumPrintColor, sumCopyBw, sumCopyColor, sumScanner, sumPages, sumCost],
      [],
      ['อัตราค่าบริการปัจจุบัน', '', '', 'Print B&W', 'Print Color', 'Copy B&W', 'Copy Color', 'Scanner'],
      ['(บาท/แผ่น)', '', '', rates.print_bw, rates.print_color, rates.copy_bw, rates.copy_color, rates.scan]
    ];

    const allRows = [...rows, ...footerRows];

    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...allRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `user_usage_${selectedUser.user_id}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportSelectedMonthDetails = async () => {
    if (!catFilterYear) {
      showAlert('warning', 'กรุณาเลือกปีที่ต้องการนำออกข้อมูล');
      return;
    }

    setLoading(true);
    try {
      const params = {
        year: catFilterYear,
        month: catFilterMonth || undefined,
        printer: selectedPrinter || undefined
      };

      const res = await axios.get(`${API_BASE}/reports/export/details`, { params });
      const details = res.data;

      if (!details || details.length === 0) {
        showAlert('warning', 'ไม่พบรายละเอียดการใช้งานสำหรับเงื่อนไขที่เลือก');
        return;
      }

      const headers = [
        'ID User',
        'ชื่อพนักงาน',
        'รอบงวดรายงาน',
        'เครื่องพิมพ์',
        'ชื่อไฟล์รายงาน',
        'Print B&W (แผ่น)',
        'Print Color (แผ่น)',
        'Copy B&W (แผ่น)',
        'Copy Color (แผ่น)',
        'Scanner (แผ่น)',
        'รวมจำนวนหน้า (แผ่น)',
        'ค่าบริการ (บาท)'
      ];

      const rows = details.map(d => [
        d.user_id,
        d.name,
        formatThaiMonthYear(d.report_date),
        d.printer_name || '-',
        d.filename || '-',
        d.print_bw || 0,
        d.print_color || 0,
        d.copy_bw || 0,
        d.copy_color || 0,
        d.scanner || 0,
        d.total_pages || 0,
        d.cost || 0
      ]);

      const sumPrintBw = rows.reduce((sum, r) => sum + (r[5] || 0), 0);
      const sumPrintColor = rows.reduce((sum, r) => sum + (r[6] || 0), 0);
      const sumCopyBw = rows.reduce((sum, r) => sum + (r[7] || 0), 0);
      const sumCopyColor = rows.reduce((sum, r) => sum + (r[8] || 0), 0);
      const sumScanner = rows.reduce((sum, r) => sum + (r[9] || 0), 0);
      const sumPages = rows.reduce((sum, r) => sum + (r[10] || 0), 0);
      const sumCost = rows.reduce((sum, r) => sum + (r[11] || 0), 0);

      const footerRows = [
        [],
        ['สรุปยอดรวมทั้งสิ้น', '', '', '', '', sumPrintBw, sumPrintColor, sumCopyBw, sumCopyColor, sumScanner, sumPages, sumCost],
        [],
        ['อัตราค่าบริการปัจจุบัน', '', '', '', '', 'Print B&W', 'Print Color', 'Copy B&W', 'Copy Color', 'Scanner'],
        ['(บาท/แผ่น)', '', '', '', '', rates.print_bw, rates.print_color, rates.copy_bw, rates.copy_color, rates.scan]
      ];

      const allRows = [...rows, ...footerRows];

      const csvContent = "\uFEFF" + [
        headers.join(','),
        ...allRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      let filename = '';
      if (catFilterMonth) {
        const thMonth = new Date(`2026-${String(catFilterMonth).padStart(2, '0')}-02`).toLocaleDateString('th-TH', { month: 'long' });
        filename = `usage_details_${catFilterYear}_${thMonth}.csv`;
        
        axios.post(`${API_BASE}/logs`, {
          action_type: 'EXPORT_MONTH_DETAILS',
          action_details: `นำออกรายงานรายละเอียดผู้ใช้งานประจำงวด ${thMonth} ${catFilterYear}${selectedPrinter ? ` เฉพาะเครื่องพิมพ์ ${selectedPrinter}` : ''}`
        }).catch(err => console.error('Failed to log monthly details export:', err));
      } else {
        filename = `usage_details_${catFilterYear}_all_months.csv`;
        
        axios.post(`${API_BASE}/logs`, {
          action_type: 'EXPORT_YEAR_DETAILS',
          action_details: `นำออกรายงานรายละเอียดผู้ใช้งานทั้งปี ${catFilterYear}${selectedPrinter ? ` เฉพาะเครื่องพิมพ์ ${selectedPrinter}` : ''}`
        }).catch(err => console.error('Failed to log yearly details export:', err));
      }

      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showAlert('success', `นำออกรายงานรายละเอียดสำเร็จ: ${filename}`);
    } catch (err) {
      console.error('Error exporting details:', err);
      showAlert('danger', 'เกิดข้อผิดพลาดในการนำออกรายงานรายละเอียดการใช้งาน');
    } finally {
      setLoading(false);
    }
  };

  // Category filter changes
  const handleCategoryFilterChange = (year, month) => {
    setCatFilterYear(year);
    setCatFilterMonth(month);
    fetchCategoryBreakdown(year, month, selectedPrinter);
  };

  // User search logic
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.trim() === '') {
      setUserSuggestions([]);
      setShowSuggestions(false);
    } else {
      const filtered = users.filter(u => 
        u.name.toLowerCase().includes(query.toLowerCase()) || 
        u.user_id.toLowerCase().includes(query.toLowerCase())
      );
      setUserSuggestions(filtered.slice(0, 8));
      setShowSuggestions(true);
    }
  };

  const handlePrinterFilterChange = async (printer) => {
    setUserFilterPrinter(printer);
    setLoading(true);
    try {
      const resUsers = await axios.get(`${API_BASE}/users`, {
        params: { printer }
      });
      setUsers(resUsers.data);
      setSelectedUser(null);
      setUserHistory([]);
      setSearchQuery('');
    } catch (err) {
      console.error('Error fetching users by printer:', err);
      showAlert('danger', 'ไม่สามารถดึงข้อมูลรายชื่อผู้ใช้งานแยกตามเครื่องพิมพ์ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (user, printer = userFilterPrinter) => {
    setSelectedUser(user);
    setUserFilterPrinter(printer);
    setSearchQuery(isMasked ? `${maskValue(user.user_id)} - ${maskValue(user.name)}` : `${user.user_id} - ${user.name}`);
    setShowSuggestions(false);
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/users/${user.user_id}/summary`, {
        params: { printer }
      });
      setUserHistory(res.data);
    } catch (err) {
      console.error('Error fetching user summary:', err);
      showAlert('danger', 'ไม่สามารถดึงข้อมูลประวัติผู้ใช้งานได้');
    } finally {
      setLoading(false);
    }
  };

  // Click outside suggestion list to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Compute stats
  const totalCostAllTime = summaryData.reduce((sum, item) => sum + item.total_cost, 0);
  const totalPagesAllTime = summaryData.reduce((sum, item) => sum + item.total_pages, 0);
  const totalUsersActive = users.length;

  // Chart configs
  const trendChartData = {
    labels: [...summaryData].reverse().map(item => `${item.month}/${item.year}`),
    datasets: [
      {
        type: 'bar',
        label: 'ค่าใช้จ่ายรวม (บาท)',
        data: [...summaryData].reverse().map(item => item.total_cost),
        backgroundColor: 'rgba(59, 130, 246, 0.65)',
        borderColor: '#3b82f6',
        borderWidth: 1,
        yAxisID: 'y1',
      },
      {
        type: 'line',
        label: 'จำนวนแผ่นรวม (แผ่น)',
        data: [...summaryData].reverse().map(item => item.total_pages),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y2',
      }
    ]
  };

  const trendChartOptions = {
    responsive: true,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      x: {
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: { color: '#475569' }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: { color: '#c82333' }
      },
      y2: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: '#8b5cf6' }
      }
    },
    plugins: {
      legend: { labels: { color: '#475569' } }
    }
  };

  // Grouped Comparison Bar Chart config for categories (Stacked Grouped Bar)
  const categoryBarData = categoryTrendData.length > 0 ? (() => {
    const printBwData = Array(12).fill(0);
    const printColorData = Array(12).fill(0);
    const copyBwData = Array(12).fill(0);
    const copyColorData = Array(12).fill(0);
    const scannerData = Array(12).fill(0);

    categoryTrendData.forEach(item => {
      const mIdx = item.month - 1;
      if (mIdx >= 0 && mIdx < 12) {
        printBwData[mIdx] = item.print_bw || 0;
        printColorData[mIdx] = item.print_color || 0;
        copyBwData[mIdx] = item.copy_bw || 0;
        copyColorData[mIdx] = item.copy_color || 0;
        scannerData[mIdx] = item.scanner || 0;
      }
    });

    return {
      labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
      datasets: [
        {
          label: 'Print B&W (ขาวดำ)',
          data: printBwData,
          backgroundColor: 'rgba(30, 41, 59, 0.8)',
          borderColor: '#1e293b',
          borderWidth: 1,
          stack: 'Monochrome',
        },
        {
          label: 'Copy B&W (ขาวดำ)',
          data: copyBwData,
          backgroundColor: 'rgba(100, 116, 139, 0.55)',
          borderColor: '#64748b',
          borderWidth: 1,
          stack: 'Monochrome',
        },
        {
          label: 'Print Color (สี)',
          data: printColorData,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: '#10b981',
          borderWidth: 1,
          stack: 'Color',
        },
        {
          label: 'Copy Color (สี)',
          data: copyColorData,
          backgroundColor: 'rgba(52, 211, 153, 0.55)',
          borderColor: '#34d399',
          borderWidth: 1,
          stack: 'Color',
        },
        {
          label: 'Scanner (สแกน)',
          data: scannerData,
          backgroundColor: 'rgba(245, 158, 11, 0.8)',
          borderColor: '#f59e0b',
          borderWidth: 1,
          stack: 'Scanner',
        }
      ]
    };
  })() : null;

  // Individual user cost trend history
  const userHistoryChartData = userHistory.length > 0 ? {
    labels: [...userHistory].reverse().map(h => formatThaiMonthYear(h.report_date)),
    datasets: [
      {
        label: 'ค่าใช้จ่าย (บาท)',
        data: [...userHistory].reverse().map(h => h.cost),
        borderColor: '#c82333',
        backgroundColor: 'rgba(200, 35, 51, 0.1)',
        tension: 0.4,
        fill: true,
      }
    ]
  } : null;

  if (!token) {
    return (
      <div className="container-fluid min-vh-100 d-flex align-items-center justify-content-center bg-login">
        <div className="col-12 col-sm-8 col-md-6 col-lg-4 p-4 glass-card shadow-lg animate-fade-in">
          <div className="text-center mb-4">
            <div style={{ width: '110px', height: '110px', borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(255,255,255,0.3)', boxShadow: '0 8px 32px rgba(200,35,51,0.4)', margin: '0 auto 1rem auto', background: '#fff' }}>
              <img 
                src="/logo.png" 
                alt="Copier Portal Logo" 
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
            <h4 className="fw-bold text-gradient">ระบบรายงานเครื่องถ่ายเอกสาร</h4>
            <p className="text-muted">Copier Report Portal Dashboard</p>
          </div>
          
          {loginError && (
            <div className="alert alert-danger p-2 text-center" style={{ fontSize: '0.9rem' }}>
                       <li className="w-100">
                <button 
                  onClick={() => setActiveTab('categories')} 
                  className={`nav-link-custom w-100 text-start border-0 ${activeTab === 'categories' ? 'active' : ''}`}
                >
                  <ChartIcon size={20} />
                  <span className="ms-1 d-none d-sm-inline">แยกตามประเภท</span>
                </button>
              </li>
              {userRole === 'admin' && (
                <li className="w-100">
                  <button 
                    onClick={() => setActiveTab('upload')} 
                    className={`nav-link-custom w-100 text-start border-0 ${activeTab === 'upload' ? 'active' : ''}`}
                  >
                    <UploadCloud size={20} />
                    <span className="ms-1 d-none d-sm-inline">นำเข้าข้อมูล</span>
                  </button>
                </li>
              )}
              {userRole === 'admin' && (
                <li className="w-100">
                  <button 
                    onClick={() => setActiveTab('printers-inventory')} 
                    className={`nav-link-custom w-100 text-start border-0 ${activeTab === 'printers-inventory' ? 'active' : ''}`}
                  >
                    <Printer size={20} />
                    <span className="ms-1 d-none d-sm-inline">คลังเครื่องพิมพ์</span>
                  </button>
                </li>
              )}
              {userRole === 'admin' && (
                <li className="w-100">
                  <button 
                    onClick={() => setActiveTab('manage-users')} 
                    className={`nav-link-custom w-100 text-start border-0 ${activeTab === 'manage-users' ? 'active' : ''}`}
                  >
                    <Shield size={20} />
                    <span className="ms-1 d-none d-sm-inline">จัดการผู้ใช้งาน</span>
                  </button>
                </li>
              )}
              {userRole === 'admin' && (
                <li className="w-100">
                  <button 
                    onClick={() => setActiveTab('system-logs')} 
                    className={`nav-link-custom w-100 text-start border-0 ${activeTab === 'system-logs' ? 'active' : ''}`}
                  >
                    <FileText size={20} />
                    <span className="ms-1 d-none d-sm-inline">บันทึกเหตุการณ์ (Logs)</span>
                  </button>
                </li>
              )}
            </ul>
          </div>
          
          {/* Security Controls Status (SC-3 Display) */}
          <div className="w-100 pt-3 border-top border-secondary">
            
            {/* About System Button Card */}
            <div 
              onClick={() => setActiveTab('about')}
              className={`glass-card p-2 d-flex flex-column align-items-center align-items-sm-start mb-2 cursor-pointer w-100 transition-all ${activeTab === 'about' ? 'active-about-card' : 'text-muted'}`}
              style={{ 
                fontSize: '0.8rem', 
                cursor: 'pointer', 
                border: activeTab === 'about' ? '1px solid rgba(220, 53, 69, 0.6)' : '1px solid rgba(255,255,255,0.1)',
                background: activeTab === 'about' ? 'rgba(220, 53, 69, 0.15)' : 'rgba(255,255,255,0.03)',
                boxShadow: activeTab === 'about' ? '0 0 10px rgba(220, 53, 69, 0.25)' : 'none'
              }}
            >
              <div className="d-flex align-items-center mb-1 text-white">
                <Info size={14} className={`me-1 ${activeTab === 'about' ? 'text-danger fw-bold' : 'text-muted'}`} />
                <span className={`fw-semibold ${activeTab === 'about' ? 'text-danger' : 'text-white'}`}>เกี่ยวกับระบบ</span>
              </div>
              <span className="text-secondary d-none d-sm-inline" style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                โครงงานและสไลด์นำเสนอ
              </span>
            </div>

            {/* Manual Link Button Card */}
            <a 
              href="https://docs.google.com/presentation/d/15ggpfnms6tZiTd92T4m7qjmlIu5DgN17dTTw5UHIyus/edit?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card p-2 d-flex flex-column align-items-center align-items-sm-start mb-2 w-100 text-decoration-none text-muted transition-all"
              style={{ 
                fontSize: '0.8rem', 
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.03)'
              }}
            >
              <div className="d-flex align-items-center mb-1 text-white">
                <FileCode size={14} className="me-1 text-danger" />
                <span className="fw-semibold text-white">คู่มือการใช้งานระบบ</span>
              </div>
              <span className="text-secondary d-none d-sm-inline" style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                เปิด Google Slides คู่มือผู้ใช้
              </span>
            </a>

            {userRole === 'admin' ? (
              <div className="glass-card p-2 d-flex flex-column align-items-center align-items-sm-start text-muted" style={{ fontSize: '0.8rem' }}>
                <div className="d-flex align-items-center text-warning mb-1">
                  <Shield size={14} className="me-1" />
                  <span className="d-none d-sm-inline fw-semibold text-warning">Privacy Mode (SC-3)</span>
                </div>
                <div className="form-check form-switch p-0 m-0 d-flex align-items-center">
                  <input 
                    className="form-check-input ms-0 me-2 cursor-pointer" 
                    type="checkbox" 
                    role="switch" 
                    id="maskSwitch" 
                    checked={isMasked}
                    onChange={(e) => setIsMasked(e.target.checked)}
                  />
                  <label className="form-check-label d-none d-sm-inline text-secondary cursor-pointer" htmlFor="maskSwitch">
                    Mask User Data
                  </label>
                </div>
              </div>
            ) : (
              <div className="glass-card p-2 d-flex flex-column align-items-center align-items-sm-start text-muted" style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                <div className="d-flex align-items-center text-success mb-1">
                  <Shield size={14} className="me-1" />
                  <span className="d-none d-sm-inline fw-semibold text-success">PDPA Masking Enabled</span>
                </div>
                <span className="text-secondary d-none d-sm-inline" style={{ fontSize: '0.75rem' }}>
                  ข้อมูลผู้ใช้งานถูกบังคับ Mask ตามนโยบายความปลอดภัย
                </span>
              </div>
            )}
            
            {/* User Account Info & Logout Button */}
            <div className="mt-3 text-center text-sm-start px-2">
              <span className="text-muted d-block" style={{ fontSize: '0.75rem' }}>ลงชื่อเข้าใช้: {usernameState} ({userRole === 'admin' ? 'Admin' : 'User'})</span>
              <button onClick={handleLogout} className="btn btn-sm btn-outline-light w-100 mt-2 py-1" style={{ fontSize: '0.8rem' }}>
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="col py-4 px-4 overflow-auto animate-fade-in" style={{ maxHeight: '100vh' }}>
        
        {/* Global Alerts */}
        {alert && (
          <div className={`alert alert-${alert.type} d-flex align-items-center glass-card border-${alert.type} mb-4`} role="alert">
            {alert.type === 'success' ? <CheckCircle2 className="text-success me-2" /> : <AlertCircle className="text-danger me-2" />}
            <div>{alert.message}</div>
          </div>
        )}

        {/* Global Loading Spinner */}
        {loading && (
          <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="animate-fade-in">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
              <div>
                <h2 className="fw-bold mb-0">สรุปผลยอดการใช้งานเครื่องถ่ายเอกสาร</h2>
                <p className="text-muted mb-0">ระบบแสดงวิเคราะห์ข้อมูลการใช้งานภาพรวมรายเดือนและรายปี</p>
              </div>
              <div className="d-flex align-items-center gap-3">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted text-nowrap" style={{ fontSize: '0.9rem' }}>เครื่องพิมพ์:</span>
                  <select
                    className="form-select form-glass py-1 px-3"
                    value={selectedPrinter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedPrinter(val);
                      fetchGlobalData(val);
                    }}
                    style={{ minWidth: '180px', fontSize: '0.9rem' }}
                  >
                    <option value="">ทั้งหมด (All Printers)</option>
                    {printers.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="text-muted d-none d-lg-block" style={{ fontSize: '0.85rem' }}>
                  อัปเดตล่าสุด: {reports.length > 0 ? new Date(reports[0].uploaded_at).toLocaleDateString('th-TH') : '-'}
                </div>
              </div>
            </div>

            {/* Metrics cards row */}
            <div className="row g-4 mb-4">
              <div className="col-12 col-sm-6 col-xl-3 animate-fade-in delay-1">
                <div className="glass-card d-flex align-items-center justify-content-between">
                  <div>
                    <span className="text-muted d-block mb-1">ค่าใช้จ่ายรวมทั้งหมด</span>
                    <h3 className="fw-bold mb-0 text-gradient-green">{(totalCostAllTime || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</h3>
                  </div>
                  <div className="metric-icon metric-green">
                    <DollarSign size={24} />
                  </div>
                </div>
              </div>

              <div className="col-12 col-sm-6 col-xl-3 animate-fade-in delay-2">
                <div className="glass-card d-flex align-items-center justify-content-between">
                  <div>
                    <span className="text-muted d-block mb-1">จำนวนเอกสารรวม</span>
                    <h3 className="fw-bold mb-0 text-gradient">{(totalPagesAllTime || 0).toLocaleString('th-TH')} แผ่น</h3>
                  </div>
                  <div className="metric-icon metric-blue">
                    <Printer size={24} />
                  </div>
                </div>
              </div>

              <div className="col-12 col-sm-6 col-xl-3 animate-fade-in delay-3">
                <div className="glass-card d-flex align-items-center justify-content-between">
                  <div>
                    <span className="text-muted d-block mb-1">ผู้ใช้บริการทั้งหมด</span>
                    <h3 className="fw-bold mb-0">{totalUsersActive} คน</h3>
                  </div>
                  <div className="metric-icon metric-purple">
                    <UserIcon size={24} />
                  </div>
                </div>
              </div>

              <div className="col-12 col-sm-6 col-xl-3 animate-fade-in delay-4">
                <div className="glass-card d-flex align-items-center justify-content-between">
                  <div>
                    <span className="text-muted d-block mb-1">จำนวนไฟล์รายงานในระบบ</span>
                    <h3 className="fw-bold mb-0">{reports.length} รายงาน</h3>
                  </div>
                  <div className="metric-icon metric-amber">
                    <FileText size={24} />
                  </div>
                </div>
              </div>
            </div>

            {/* Dashboard Graphs & Tables */}
            <div className="row g-4 mb-4">
              <div className="col-12 col-xl-8">
                <div className="glass-card h-100">
                  <h5 className="fw-bold mb-4 d-flex align-items-center">
                    <Layers size={18} className="text-primary me-2" />
                    แนวโน้มการใช้งานรายเดือน (ยอดพิมพ์และค่าใช้จ่าย)
                  </h5>
                  {summaryData.length > 0 ? (
                    <div style={{ height: '350px' }}>
                      <Bar data={trendChartData} options={trendChartOptions} />
                    </div>
                  ) : (
                    <div className="d-flex flex-column align-items-center justify-content-center h-75 text-muted">
                      <AlertCircle size={48} className="mb-2 text-warning" />
                      <p>ยังไม่มีข้อมูลรายงานในฐานข้อมูล</p>
                      <button onClick={() => setActiveTab('upload')} className="btn btn-sm btn-glass-primary">
                        อัปโหลดรายงานชิ้นแรก
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="col-12 col-xl-4">
                <div className="glass-card h-100">
                  <h5 className="fw-bold mb-3 d-flex align-items-center">
                    <FileCode size={18} className="text-warning me-2" />
                    รายงานประจำเดือนที่นำเข้าระบบล่าสุด
                  </h5>
                  <div className="table-responsive" style={{ maxHeight: '350px' }}>
                    {reports.length > 0 ? (
                      <table className="table table-glass">
                        <thead>
                          <tr>
                            <th>เดือน/ปี</th>
                            <th>เครื่องพิมพ์ (ไฟล์)</th>
                            <th className="text-end">ยอดรวม (บาท)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reports.map((rep) => {
                            return (
                              <tr key={rep.id}>
                                <td className="text-white fw-semibold">
                                  {formatThaiMonthYear(rep.report_date)}
                                </td>
                                <td>
                                  <div className="fw-semibold text-info" style={{ fontSize: '0.9rem' }}>{rep.printer_name || '-'}</div>
                                  <div className="text-muted" style={{ fontSize: '0.75rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rep.filename}>
                                    {rep.filename}
                                  </div>
                                </td>
                                <td className="text-end fw-bold">
                                  <span className="text-gradient-green">
                                    {(rep.total_cost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-center text-muted py-5">
                        ไม่มีข้อมูลประวัติไฟล์
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* General monthly table list */}
            <div className="glass-card">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="fw-bold mb-0">สรุปสถิติตามรายเดือน</h5>
                <button onClick={exportMonthlySummary} className="btn btn-sm btn-glass-primary">
                  นำออกรายงาน (Export CSV)
                </button>
              </div>
              <div className="table-responsive">
                <table className="table table-glass">
                  <thead>
                    <tr>
                      <th>ประจำงวด</th>
                      <th>จำนวนผู้ใช้งาน</th>
                      <th className="text-end">Print B&W (แผ่น)</th>
                      <th className="text-end">Print Color (แผ่น)</th>
                      <th className="text-end">Copy B&W (แผ่น)</th>
                      <th className="text-end">Copy Color (แผ่น)</th>
                      <th className="text-end">Scanner (แผ่น)</th>
                      <th className="text-end">รวมจำนวน (แผ่น)</th>
                      <th className="text-end">รวมค่าใช้จ่าย (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.map((sum, index) => (
                      <tr key={index}>
                        <td className="text-white fw-bold">
                          {formatThaiMonthYear(`${sum.year}-${String(sum.month).padStart(2, '0')}-02`)}
                        </td>
                        <td>{sum.total_users} คน</td>
                        <td className="text-end">{(sum.print_bw || 0).toLocaleString()}</td>
                        <td className="text-end">{(sum.print_color || 0).toLocaleString()}</td>
                        <td className="text-end">{(sum.copy_bw || 0).toLocaleString()}</td>
                        <td className="text-end">{(sum.copy_color || 0).toLocaleString()}</td>
                        <td className="text-end">{(sum.scanner || 0).toLocaleString()}</td>
                        <td className="text-end font-weight-bold">
                          <span className="text-gradient">{(sum.total_pages || 0).toLocaleString()}</span>
                        </td>
                        <td className="text-end font-weight-bold">
                          <span className="text-gradient-green">{(sum.total_cost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                        </td>
                      </tr>
                    ))}
                    {summaryData.length === 0 && (
                      <tr>
                        <td colSpan="9" className="text-center text-muted py-4">ไม่พบข้อมูลการพิมพ์รายเดือน</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'users' && (
          <div className="animate-fade-in">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="fw-bold mb-0">ค้นหาและวิเคราะห์การใช้งานรายบุคคล</h2>
                <p className="text-muted mb-0">เลือกผู้ใช้งานเพื่อดูประวัติการพิมพ์/สแกนทั้งหมด รวมถึงคำนวณสัดส่วนค่าบริการ</p>
              </div>
            </div>

            <div className="row g-4 mb-4">
              <div className="col-12 col-md-5 col-lg-4">
                <div className="glass-card position-relative" ref={suggestionRef}>
                  <div className="mb-4">
                    <label className="text-muted mb-1 fw-bold" style={{ fontSize: '0.85rem' }}>เครื่องพิมพ์ (Printer Model)</label>
                    <select
                      className="form-select form-glass py-1.5 px-3 fw-semibold text-white"
                      value={userFilterPrinter}
                      onChange={(e) => handlePrinterFilterChange(e.target.value)}
                      style={{ fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                      <option value="">ทั้งหมด (All Printers)</option>
                      {printers.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <h5 className="fw-bold mb-3 d-flex align-items-center">
                    <Search size={18} className="text-primary me-2" />
                    ค้นหาผู้ใช้งาน (รหัส / ชื่อพนักงาน)
                  </h5>
                  <div className="input-group">
                    <span className="input-group-text form-glass border-end-0">
                      <Search size={18} className="text-muted" />
                    </span>
                    <input 
                      type="text" 
                      className="form-control form-glass border-start-0" 
                      placeholder="เช่น kanapot, 1427..." 
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onFocus={() => setShowSuggestions(true)}
                    />
                  </div>
                  
                  {/* Autosuggest dropdown */}
                  {showSuggestions && userSuggestions.length > 0 && (
                    <ul className="autosuggest-list">
                      {userSuggestions.map((u, i) => (
                        <li 
                          key={i} 
                          className="autosuggest-item text-white"
                          onClick={() => handleSelectUser(u)}
                        >
                          {isMasked ? `${maskValue(u.user_id)} - ${maskValue(u.name)}` : `${u.user_id} - ${u.name}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  
                  <div className="mt-4">
                    <span className="text-muted d-block mb-2">รายชื่อพนักงานทั้งหมด ({users.length} รายการ)</span>
                    <div className="list-group" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                      {users.map((u, i) => (
                        <button 
                          key={i} 
                          className={`list-group-item list-group-item-action bg-transparent border-0 text-white d-flex justify-content-between align-items-center p-2 rounded mb-1 ${selectedUser?.user_id === u.user_id ? 'bg-primary-dark-glow' : ''}`}
                          style={{
                            backgroundColor: selectedUser?.user_id === u.user_id ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                            transition: 'var(--transition-smooth)'
                          }}
                          onClick={() => handleSelectUser(u)}
                        >
                          <span className="text-truncate">
                            {isMasked ? `${maskValue(u.user_id)} - ${maskValue(u.name)}` : `${u.user_id} - ${u.name}`}
                          </span>
                          <ChevronRight size={14} className="text-muted" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-7 col-lg-8">
                {selectedUser ? (
                  <div className="animate-fade-in">
                    <div className="glass-card mb-4">
                      <div className="d-flex align-items-center justify-content-between border-bottom border-secondary pb-3 mb-3">
                        <div>
                          <span className="text-muted d-block">ข้อมูลของพนักงาน</span>
                          <h4 className="fw-bold mb-0 text-gradient">
                            {isMasked ? maskValue(selectedUser.name) : selectedUser.name}
                          </h4>
                          <span className="text-muted fs-6 d-block">
                            ID User: {isMasked ? maskValue(selectedUser.user_id) : selectedUser.user_id}
                          </span>
                          {userFilterPrinter && (
                            <span className="badge bg-secondary text-info mt-2" style={{ fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                              เครื่องพิมพ์: {userFilterPrinter}
                            </span>
                          )}
                        </div>
                        <div className="text-end">
                          <span className="text-muted d-block">ยอดค่าใช้จ่ายสะสม</span>
                          <h4 className="fw-bold mb-0 text-gradient-green">
                            {(userHistory.reduce((sum, h) => sum + (h.cost || 0), 0) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                          </h4>
                        </div>
                      </div>

                      {/* User usage History Graph */}
                      {userHistoryChartData && (
                        <div className="mb-4">
                          <h6 className="fw-bold mb-3 text-muted">กราฟประวัติค่าใช้จ่ายรายเดือนของพนักงาน</h6>
                          <div style={{ height: '200px' }}>
                            <Line 
                              data={userHistoryChartData} 
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: {
                                  x: { grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { color: '#475569' } },
                                  y: { grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { color: '#475569' } }
                                }
                              }} 
                            />
                          </div>
                        </div>
                      )}

                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="fw-bold mb-0 text-muted">รายละเอียดประวัติแต่ละงวดการนำเข้า</h6>
                        <button onClick={exportUserHistory} className="btn btn-sm btn-glass-primary py-1 px-2" style={{ fontSize: '0.8rem' }}>
                          นำออกรายงาน (Export CSV)
                        </button>
                      </div>
                      <div className="table-responsive">
                        <table className="table table-glass">
                          <thead>
                            <tr>
                              <th>งวดรายงาน</th>
                              <th>เครื่องพิมพ์</th>
                              <th>ชื่อรายงานที่นำเข้า</th>
                              <th className="text-end">Print B&W</th>
                              <th className="text-end">Print Color</th>
                              <th className="text-end">Copy B&W</th>
                              <th className="text-end">Copy Color</th>
                              <th className="text-end">Scan</th>
                              <th className="text-end">แผ่นรวม</th>
                              <th className="text-end">เป็นเงิน (บาท)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {userHistory.map((h, i) => {
                              return (
                                <tr key={i}>
                                  <td className="text-white fw-semibold">
                                    {formatThaiMonthYear(h.report_date)}
                                  </td>
                                  <td className="text-info fw-semibold">
                                    {h.printer_name || '-'}
                                  </td>
                                  <td className="text-muted text-truncate" style={{ maxWidth: '180px' }} title={h.filename}>
                                    {h.filename}
                                  </td>
                                  <td className="text-end">{(h.print_bw || 0).toLocaleString()}</td>
                                  <td className="text-end">{(h.print_color || 0).toLocaleString()}</td>
                                  <td className="text-end">{(h.copy_bw || 0).toLocaleString()}</td>
                                  <td className="text-end">{(h.copy_color || 0).toLocaleString()}</td>
                                  <td className="text-end">{(h.scanner || 0).toLocaleString()}</td>
                                  <td className="text-end fw-semibold">
                                    <span className="text-gradient">{(h.total_pages || 0).toLocaleString()}</span>
                                  </td>
                                  <td className="text-end fw-bold">
                                    <span className="text-gradient-green">{(h.cost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="glass-card d-flex flex-column align-items-center justify-content-center text-muted py-5 h-100">
                    <UserIcon size={64} className="mb-3 text-secondary opacity-50" />
                    <h5 className="fw-bold">ยังไม่ได้เลือกผู้ใช้งาน</h5>
                    <p className="text-center px-4">กรุณาพิมพ์ค้นหาชื่อ/รหัสพนักงาน หรือเลือกพนักงานจากเมนูฝั่งซ้าย เพื่อตรวจสอบข้อมูลเชิงลึก</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'categories' && (
          <div className="animate-fade-in">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="fw-bold mb-0">การใช้งานจำแนกตามประเภทบริการ</h2>
                <p className="text-muted mb-0">วิเคราะห์สัดส่วนการใช้บริการแต่ละประเภท (Print vs Copy และ B&W vs Color)</p>
              </div>
            </div>

            {/* Filter Row */}
            <div className="glass-card mb-4">
              <h6 className="fw-bold mb-3 d-flex align-items-center">
                <Calendar size={18} className="text-primary me-2" />
                ตัวกรองปีและเดือนของข้อมูลรายงาน
              </h6>
              <div className="row g-3">
                <div className="col-12 col-sm-6 col-md-3">
                  <label className="text-muted mb-1">เลือกปี (ค.ศ.)</label>
                  <select 
                    className="form-select form-glass" 
                    value={catFilterYear}
                    onChange={(e) => handleCategoryFilterChange(e.target.value, catFilterMonth)}
                  >
                    <option value="">ทั้งหมดทุกปี</option>
                    {[...new Set(summaryData.map(s => s.year))].sort().reverse().map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-sm-6 col-md-2">
                  <label className="text-muted mb-1">เลือกเดือน</label>
                  <select 
                    className="form-select form-glass" 
                    value={catFilterMonth}
                    onChange={(e) => handleCategoryFilterChange(catFilterYear, e.target.value)}
                  >
                    <option value="">ทั้งหมดทุกเดือน</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>
                        {new Date(`2026-${String(m).padStart(2, '0')}-02`).toLocaleDateString('th-TH', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-sm-6 col-md-3">
                  <label className="text-muted mb-1">เครื่องพิมพ์</label>
                  <select 
                    className="form-select form-glass" 
                    value={selectedPrinter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedPrinter(val);
                      fetchCategoryBreakdown(catFilterYear, catFilterMonth, val);
                    }}
                  >
                    <option value="">ทั้งหมด (All Printers)</option>
                    {printers.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-sm-6 col-md-2 d-flex align-items-end">
                  <button 
                    onClick={() => { setCatFilterYear(''); setCatFilterMonth(''); setSelectedPrinter(''); fetchCategoryBreakdown('', '', ''); }} 
                    className="btn btn-outline-secondary form-glass w-100"
                  >
                    ล้างค่า
                  </button>
                </div>
                <div className="col-12 col-sm-6 col-md-2 d-flex align-items-end">
                  <button 
                    onClick={exportSelectedMonthDetails} 
                    className="btn btn-glass-primary w-100"
                    disabled={!catFilterYear}
                  >
                    นำออก (CSV)
                  </button>
                </div>
              </div>
            </div>

            {/* Chart breakdown and data card */}
            {categoriesData ? (
              <div className="row g-4">
                <div className="col-12 col-lg-5">
                  <div className="glass-card d-flex flex-column align-items-center justify-content-center mb-4">
                    <h5 className="fw-bold mb-4 w-100 text-start">
                      {catFilterYear ? `เปรียบเทียบการใช้งานรายเดือน ปี ${catFilterYear}` : 'เปรียบเทียบการใช้งานรายเดือน'}
                    </h5>
                    <div style={{ width: '100%', height: '280px' }} className="d-flex align-items-center justify-content-center">
                      {categoryBarData ? (
                        <Bar 
                          data={categoryBarData} 
                          options={{ 
                            responsive: true, 
                            maintainAspectRatio: false,
                            plugins: { 
                              legend: { position: 'bottom', labels: { color: '#475569' } } 
                            },
                            scales: {
                              x: { stacked: true, grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { color: '#475569' } },
                              y: { stacked: true, grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { color: '#475569' } }
                            }
                          }} 
                          plugins={[stackedTotalsPlugin]}
                        />
                      ) : (
                        <div className="text-center text-muted py-5">
                          <AlertCircle size={36} className="mb-2 text-warning d-inline-block" />
                          <p className="mb-0" style={{ fontSize: '0.85rem' }}>กรุณาเลือกปีตัวกรองเพื่อวิเคราะห์กราฟเปรียบเทียบ</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="glass-card animate-fade-in">
                    <h5 className="fw-bold mb-3 d-flex align-items-center">
                      <Shield size={18} className="text-warning me-2" />
                      ตั้งค่าอัตราค่าบริการ (Rate Settings)
                    </h5>
                    <form onSubmit={handleRatesSubmit}>
                      <div className="row g-2 mb-2">
                        <div className="col-6">
                          <label className="text-muted mb-1" style={{ fontSize: '0.85rem' }}>Print ขาวดำ (บาท)</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            className="form-control form-glass" 
                            value={editRates.print_bw}
                            onChange={(e) => setEditRates({ ...editRates, print_bw: e.target.value })}
                            required
                            disabled={userRole !== 'admin'}
                          />
                        </div>
                        <div className="col-6">
                          <label className="text-muted mb-1" style={{ fontSize: '0.85rem' }}>Print สี (บาท)</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            className="form-control form-glass" 
                            value={editRates.print_color}
                            onChange={(e) => setEditRates({ ...editRates, print_color: e.target.value })}
                            required
                            disabled={userRole !== 'admin'}
                          />
                        </div>
                      </div>
                      <div className="row g-2 mb-2">
                        <div className="col-6">
                          <label className="text-muted mb-1" style={{ fontSize: '0.85rem' }}>Copy ขาวดำ (บาท)</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            className="form-control form-glass" 
                            value={editRates.copy_bw}
                            onChange={(e) => setEditRates({ ...editRates, copy_bw: e.target.value })}
                            required
                            disabled={userRole !== 'admin'}
                          />
                        </div>
                        <div className="col-6">
                          <label className="text-muted mb-1" style={{ fontSize: '0.85rem' }}>Copy สี (บาท)</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            className="form-control form-glass" 
                            value={editRates.copy_color}
                            onChange={(e) => setEditRates({ ...editRates, copy_color: e.target.value })}
                            required
                            disabled={userRole !== 'admin'}
                          />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="text-muted mb-1" style={{ fontSize: '0.85rem' }}>สแกนเนอร์ (บาท)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          className="form-control form-glass" 
                          value={editRates.scan}
                          onChange={(e) => setEditRates({ ...editRates, scan: e.target.value })}
                          required
                          disabled={userRole !== 'admin'}
                        />
                      </div>
                      <button type="submit" className="btn btn-sm btn-glass-primary w-100 py-2" disabled={loading || userRole !== 'admin'}>
                        {userRole !== 'admin' ? 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขได้' : (loading ? 'กำลังบันทึก...' : 'บันทึกอัตราค่าบริการใหม่')}
                      </button>
                    </form>
                  </div>
                </div>

                <div className="col-12 col-lg-7">
                  <div className="glass-card">
                    <h5 className="fw-bold mb-4">รายละเอียดสถิติและอัตราค่าใช้จ่าย</h5>
                    <div className="table-responsive">
                      <table className="table table-glass">
                        <thead>
                          <tr>
                            <th>ประเภทบริการ</th>
                            <th className="text-end">จำนวนแผ่น</th>
                            <th className="text-end">อัตรา (บาท/แผ่น)</th>
                            <th className="text-end">รวมเป็นเงิน (บาท)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="text-white">Print ขาวดำ (Printer B&W)</td>
                            <td className="text-end">{(categoriesData.print_bw || 0).toLocaleString()}</td>
                            <td className="text-end">{(rates.print_bw || 0).toFixed(2)}</td>
                            <td className="text-end fw-bold">
                              <span className="text-gradient-green">
                                {((categoriesData.print_bw || 0) * (rates.print_bw || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td className="text-white">Print สี (Printer Color)</td>
                            <td className="text-end">{(categoriesData.print_color || 0).toLocaleString()}</td>
                            <td className="text-end">{(rates.print_color || 0).toFixed(2)}</td>
                            <td className="text-end fw-bold">
                              <span className="text-gradient-green">
                                {((categoriesData.print_color || 0) * (rates.print_color || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td className="text-white">Copy ขาวดำ (Copier B&W)</td>
                            <td className="text-end">{(categoriesData.copy_bw || 0).toLocaleString()}</td>
                            <td className="text-end">{(rates.copy_bw || 0).toFixed(2)}</td>
                            <td className="text-end fw-bold">
                              <span className="text-gradient-green">
                                {((categoriesData.copy_bw || 0) * (rates.copy_bw || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td className="text-white">Copy สี (Copier Color)</td>
                            <td className="text-end">{(categoriesData.copy_color || 0).toLocaleString()}</td>
                            <td className="text-end">{(rates.copy_color || 0).toFixed(2)}</td>
                            <td className="text-end fw-bold">
                              <span className="text-gradient-green">
                                {((categoriesData.copy_color || 0) * (rates.copy_color || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td className="text-white">สแกนเนอร์ (Scanner)</td>
                            <td className="text-end">{(categoriesData.scanner || 0).toLocaleString()}</td>
                            <td className="text-end">{(rates.scan || 0) > 0 ? (rates.scan || 0).toFixed(2) : 'ฟรี (0.00)'}</td>
                            <td className="text-end fw-bold">
                              <span className="text-gradient-green">
                                {((categoriesData.scanner || 0) * (rates.scan || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                          </tr>
                          <tr className="border-top border-secondary table-primary">
                            <td className="text-white fw-bold">ยอดค่าบริการรวมทั้งหมด</td>
                            <td className="text-end fw-bold">
                              <span className="text-gradient">{(categoriesData.total_pages || 0).toLocaleString()} แผ่น</span>
                            </td>
                            <td className="text-end"></td>
                            <td className="text-end fw-bold" style={{ fontSize: '1.1rem' }}>
                              <span className="text-gradient-green">
                                {(categoriesData.total_cost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-card text-center py-5 text-muted">
                <AlertCircle size={48} className="mb-2 text-warning" />
                <p>ยังไม่มีข้อมูลสำหรับเดือนนี้</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="animate-fade-in">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="fw-bold mb-0">ระบบนำเข้าไฟล์และจัดการรายงาน</h2>
                <p className="text-muted mb-0">อัปโหลดไฟล์สรุปยอดเครื่องพิมพ์ (CSV / Excel) เข้าระบบและเก็บลงในฐานข้อมูล</p>
              </div>
            </div>

            <div className="row g-4 mb-4">
              <div className="col-12 col-lg-5">
                <div className="glass-card">
                  <h5 className="fw-bold mb-3 d-flex align-items-center">
                    <UploadCloud size={18} className="text-primary me-2" />
                    อัปโหลดไฟล์รายงานใหม่
                  </h5>
                  
                  <form onSubmit={handleUploadSubmit}>
                    <div className="mb-3">
                      <label className="text-muted mb-1 d-block">1. ระบุรอบงวดรายงานประจำเดือน/ปี</label>
                      <input 
                        type="month" 
                        className="form-control form-glass" 
                        value={uploadPeriod}
                        onChange={(e) => setUploadPeriod(e.target.value)}
                        required
                      />
                      <small className="text-muted d-block mt-1">
                        ข้อมูลนี้จะใช้จัดหมวดหมู่รายงานเพื่อแสดงสถิติรายเดือนและรายปี
                      </small>
                    </div>

                    <div className="mb-3">
                      <label className="text-muted mb-1 d-block">ระบุเครื่องพิมพ์สำหรับรายงานนี้ (ตัวเลือก)</label>
                      <select
                        className="form-select form-glass"
                        value={uploadPrinterName}
                        onChange={(e) => setUploadPrinterName(e.target.value)}
                      >
                        <option value="">-- วิเคราะห์และตั้งชื่อจากชื่อไฟล์อัตโนมัติ --</option>
                        {inventoryPrinters.map(p => (
                          <option key={p.id} value={p.printer_name}>
                            {p.printer_name} (S/N: {p.serial_number} - {p.location})
                          </option>
                        ))}
                      </select>
                      <small className="text-muted d-block mt-1">
                        หากระบุเครื่องพิมพ์ ระบบจะผูกข้อมูลเข้ากับเครื่องพิมพ์นี้โดยตรงแทนการดึงจากชื่อไฟล์
                      </small>
                    </div>

                    <div className="mb-4">
                      <label className="text-muted mb-1 d-block">2. เลือกไฟล์สรุปยอดการใช้งาน (CSV หรือ Excel)</label>
                      <div className="upload-zone position-relative">
                        <input 
                          type="file" 
                          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                          onChange={handleFileChange}
                          className="position-absolute top-0 start-0 w-100 h-100 opacity-0 cursor-pointer"
                        />
                        <UploadCloud size={32} className="text-muted mb-2 pulse-loading" />
                        {uploadFile ? (
                          <div className="text-gradient fw-bold text-truncate">{uploadFile.name}</div>
                        ) : (
                          <div>
                            <span className="d-block text-white fw-semibold">ลากและวางไฟล์ หรือคลิกเพื่อเปิดหาไฟล์</span>
                            <span className="text-muted fs-6">รองรับไฟล์ CSV (*.csv) หรือ Excel (*.xlsx, *.xls) เท่านั้น</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-glass-primary w-100 py-2"
                      disabled={loading}
                    >
                      {loading ? 'กำลังประมวลผลข้อมูลรายงาน...' : 'เริ่มกระบวนการนำเข้า (Import to Database)'}
                    </button>
                  </form>
                </div>
              </div>

              <div className="col-12 col-lg-7">
                <div className="glass-card">
                  <h5 className="fw-bold mb-3 d-flex align-items-center">
                    <FileText size={18} className="text-warning me-2" />
                    ประวัติไฟล์รายงานทั้งหมดในระบบ
                  </h5>
                  <div className="table-responsive">
                    <table className="table table-glass">
                      <thead>
                        <tr>
                          <th>ชื่อไฟล์รายงาน</th>
                          <th>รอบงวดรายงาน</th>
                          <th className="text-end">ยอดเงินรวม (บาท)</th>
                          <th className="text-center">การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((rep) => {
                          return (
                            <tr key={rep.id}>
                              <td className="text-white text-truncate" style={{ maxWidth: '200px' }} title={rep.filename}>
                                <div className="text-white text-truncate">{rep.filename}</div>
                                {rep.printer_name && (
                                  <span className="badge bg-secondary text-info mt-1" style={{ fontSize: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    {rep.printer_name}
                                  </span>
                                )}
                              </td>
                              <td className="text-muted">
                                {formatThaiMonthYear(rep.report_date)}
                              </td>
                              <td className="text-end fw-bold">
                                <span className="text-gradient-green">
                                  {(rep.total_cost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                </span>
                              </td>
                              <td className="text-center">
                                <button 
                                  onClick={() => handleDeleteReport(rep.id)} 
                                  className="btn btn-sm btn-glass-danger py-1 px-2"
                                  title="ลบรายงานนี้ออกจากฐานข้อมูล"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {reports.length === 0 && (
                          <tr>
                            <td colSpan="4" className="text-center text-muted py-4">ยังไม่พบรายงานนำเข้าในระบบ</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manage-users' && userRole === 'admin' && (
          <div className="animate-fade-in">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="fw-bold mb-0">จัดการบัญชีผู้ใช้งานระบบ</h2>
                <p className="text-muted mb-0">เพิ่ม แก้ไข หรือลบบัญชีผู้ใช้ที่มีสิทธิ์ระดับ Admin หรือ User</p>
              </div>
            </div>

            <div className="row g-4">
              <div className="col-12 col-lg-4">
                <div className="glass-card">
                  <h5 className="fw-bold mb-4 d-flex align-items-center">
                    <Shield size={18} className="text-primary me-2" />
                    {editingUserId ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'สร้างบัญชีผู้ใช้งานใหม่'}
                  </h5>
                  <form onSubmit={handleUserFormSubmit}>
                    <div className="mb-3">
                      <label className="text-muted mb-1">ชื่อผู้ใช้งาน (Username)</label>
                      <input 
                        type="text" 
                        className="form-control form-glass" 
                        placeholder="เช่น pracha, tech_admin" 
                        value={userForm.username}
                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                        required
                        disabled={editingUserId && userForm.username === 'admin'}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="text-muted mb-1">รหัสผ่าน (Password)</label>
                      <input 
                        type="text" 
                        className="form-control form-glass" 
                        placeholder="รหัสผ่านผู้ใช้" 
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        required
                      />
                    </div>
                    <div className="mb-4">
                      <label className="text-muted mb-1">ระดับสิทธิ์การใช้งาน (Role)</label>
                      <select 
                        className="form-select form-glass" 
                        value={userForm.role}
                        onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                        required
                        disabled={editingUserId && userForm.username === 'admin'}
                      >
                        <option value="user">User (อ่านสรุปผลยอดได้อย่างเดียว / บังคับ Mask ข้อมูล)</option>
                        <option value="admin">Admin (ผู้ดูแลระบบสิทธิ์การจัดการและนำเข้าสูงสุด)</option>
                      </select>
                    </div>
                    <div className="d-flex gap-2">
                      <button type="submit" className="btn btn-glass-primary w-100 py-2" disabled={loading}>
                        {editingUserId ? 'บันทึกการแก้ไข' : 'สร้างผู้ใช้ใหม่'}
                      </button>
                      {editingUserId && (
                        <button 
                          type="button" 
                          onClick={() => { setEditingUserId(null); setUserForm({ username: '', password: '', role: 'user' }); }}
                          className="btn btn-outline-secondary form-glass py-2"
                        >
                          ยกเลิก
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              <div className="col-12 col-lg-8">
                <div className="glass-card">
                  <h5 className="fw-bold mb-4">รายชื่อบัญชีผู้ใช้งานระบบทั้งหมด ({adminUsers.length} บัญชี)</h5>
                  <div className="table-responsive">
                    <table className="table table-glass">
                      <thead>
                        <tr>
                          <th>ชื่อผู้ใช้งาน</th>
                          <th>รหัสผ่าน</th>
                          <th>ระดับสิทธิ์</th>
                          <th>วันที่สร้าง</th>
                          <th className="text-center">การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((user) => (
                          <tr key={user.id}>
                            <td className="text-white fw-bold">{user.username}</td>
                            <td className="text-muted">{user.password}</td>
                            <td>
                              <span className={`badge ${user.role === 'admin' ? 'bg-danger' : 'bg-secondary'} px-2.5 py-1.5`}>
                                {user.role.toUpperCase()}
                              </span>
                            </td>
                            <td className="text-muted" style={{ fontSize: '0.85rem' }}>
                              {new Date(user.created_at).toLocaleDateString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="text-center">
                              <button 
                                onClick={() => handleEditUser(user)}
                                className="btn btn-sm btn-outline-secondary form-glass me-2 py-1 px-2"
                                title="แก้ไขข้อมูลผู้ใช้"
                              >
                                แก้ไข
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                className="btn btn-sm btn-glass-danger py-1 px-2"
                                title="ลบผู้ใช้ออกจากระบบ"
                                disabled={user.username === 'admin'}
                              >
                                ลบ
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system-logs' && userRole === 'admin' && (
          <div className="animate-fade-in">
             <div className="d-flex justify-content-between align-items-center mb-4">
               <div>
                 <h2 className="fw-bold mb-0">บันทึกประวัติเหตุการณ์ (System Activity Logs)</h2>
                 <p className="text-muted mb-0">ตรวจสอบบันทึกประวัติการกระทำ การล็อกอิน และการเปลี่ยนแปลงข้อมูลทั้งหมดในระบบ</p>
               </div>
               <button onClick={() => fetchSystemLogs(logPage, debouncedSearch, logFilterType)} className="btn btn-sm btn-glass-primary">
                 รีเฟรชบันทึกเหตุการณ์
               </button>
             </div>

             {/* Filter controls */}
             <div className="glass-card mb-4">
               <div className="row g-3">
                 <div className="col-12 col-sm-4">
                   <label className="text-muted mb-1" style={{ fontSize: '0.85rem' }}>ค้นหาตามผู้ใช้งาน / รายละเอียด</label>
                   <div className="input-group">
                     <span className="input-group-text form-glass bg-transparent text-muted border-end-0">
                       <Search size={16} />
                     </span>
                     <input 
                       type="text" 
                       className="form-control form-glass border-start-0" 
                       placeholder="พิมพ์เพื่อค้นหา..."
                       value={logFilterUser}
                       onChange={(e) => {
                         setLogFilterUser(e.target.value);
                         setLogPage(1);
                       }}
                     />
                   </div>
                 </div>
                 <div className="col-12 col-sm-4">
                   <label className="text-muted mb-1" style={{ fontSize: '0.85rem' }}>ประเภทการกระทำ</label>
                   <select 
                     className="form-select form-glass" 
                     value={logFilterType}
                     onChange={(e) => {
                       setLogFilterType(e.target.value);
                       setLogPage(1);
                     }}
                   >
                     <option value="">ทั้งหมดทุกประเภท</option>
                     <option value="LOGIN">LOGIN (เข้าสู่ระบบสำเร็จ)</option>
                     <option value="LOGIN_FAILED">LOGIN_FAILED (เข้าสู่ระบบไม่สำเร็จ)</option>
                     <option value="UPLOAD">UPLOAD (นำเข้าไฟล์รายงาน)</option>
                     <option value="DELETE_REPORT">DELETE_REPORT (ลบไฟล์รายงาน)</option>
                     <option value="UPDATE_RATES">UPDATE_RATES (แก้ไขอัตราค่าบริการ)</option>
                     <option value="CREATE_USER">CREATE_USER (สร้างบัญชีผู้ใช้งาน)</option>
                     <option value="UPDATE_USER">UPDATE_USER (แก้ไขบัญชีผู้ใช้งาน)</option>
                     <option value="DELETE_USER">DELETE_USER (ลบบัญชีผู้ใช้งาน)</option>
                   </select>
                 </div>
                 <div className="col-12 col-sm-4 d-flex align-items-end">
                   <button 
                     onClick={() => { setLogFilterUser(''); setLogFilterType(''); setLogPage(1); }} 
                     cl        {activeTab === 'about' && (
          <div className="animate-fade-in">
            {/* Header info */}
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center mb-4 gap-3">
              <div>
                <h2 className="fw-bold mb-0 text-white">เกี่ยวกับระบบ (About the System)</h2>
                <p className="text-white-50 mb-0">โครงงานและสไลด์นำเสนอ Copier Portal Dashboard</p>
              </div>
              <div className="d-flex gap-2">
                <a 
                  href="https://docs.google.com/presentation/d/15ggpfnms6tZiTd92T4m7qjmlIu5DgN17dTTw5UHIyus/edit?usp=sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-danger text-white py-2 px-3 fw-bold d-flex align-items-center border-0"
                  style={{ background: '#c82333' }}
                >
                  📖 เปิดคู่มือระบบ (Google Slides)
                </a>
                <button className="btn btn-glass-primary text-white py-2 px-3 fw-bold border" onClick={() => window.print()}>
                  🖨️ สั่งพิมพ์ / บันทึก PDF
                </button>
              </div>
            </div>

            {/* Slide Viewer Card */}
            <div className="glass-card p-4 mb-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.96)', border: '1px solid rgba(255, 255, 255, 0.4)', borderRadius: '20px', color: '#0f172a', boxShadow: '0 15px 35px rgba(0, 0, 0, 0.15)' }}>
              {/* Slide Tabs Navigation */}
              <div className="d-flex flex-wrap gap-2 mb-4 justify-content-center border-bottom pb-3">
                {[1, 2, 3, 4].map(idx => (
                  <button
                    key={idx}
                    onClick={() => setAboutSlideTab(idx)}
                    className={`btn py-2 px-4 fw-bold rounded-pill transition-all ${aboutSlideTab === idx ? 'btn-danger text-white' : 'btn-outline-secondary form-glass'}`}
                    style={aboutSlideTab === idx ? { background: '#c82333', borderColor: '#c82333', boxShadow: '0 4px 12px rgba(200, 35, 51, 0.3)' } : { color: '#475569' }}
                  >
                    สไลด์ที่ {idx}
                  </button>
                ))}
              </div>

              {/* Slide Content rendering */}
              <div className="slide-content-area" style={{ minHeight: '430px' }}>
                {aboutSlideTab === 1 && (
                  <div className="animate-fade-in">
                    <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                      <h3 className="fw-bold text-slate-950 mb-0" style={{ color: '#0f172a' }}>ข้อมูลการนำเสนอโครงงาน</h3>
                      <span className="badge bg-secondary px-3 py-2 fs-6">SLIDE 1 / 4</span>
                    </div>
                    
                    <div className="row g-4 align-items-center">
                      <div className="col-12 col-lg-7">
                        <div className="p-4 bg-white rounded-3 shadow-sm" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                          <span className="badge bg-danger-subtle text-danger px-3 py-1.5 rounded-pill fw-bold mb-3">วิชาที่ 7: AI Engineering / LLM / RAG / AI Workflow</span>
                          <h4 className="fw-bold mb-3 text-gradient text-danger" style={{ fontSize: '1.4rem' }}>Project Pitching Presentation</h4>
                          
                          <div className="row g-3">
                            <div className="col-12 border-bottom pb-2">
                              <span className="fw-bold text-danger d-block mb-1" style={{ fontSize: '0.95rem' }}>Project Topic (หัวข้อโครงงาน):</span>
                              <span className="text-slate-900 fw-bold" style={{ color: '#0f172a', fontSize: '1.1rem', lineHeight: '1.4' }}>
                                ระบบวิเคราะห์ปริมาณการพิมพ์และคำนวณค่าบริการระดับองค์กร พร้อมการรักษาความปลอดภัยข้อมูลตามมาตรฐาน PDPA ด้วย AI Workflow
                              </span>
                            </div>
                            <div className="col-12 col-md-6 border-end-md pb-2">
                              <span className="fw-bold text-danger d-block mb-1" style={{ fontSize: '0.95rem' }}>Topic Number:</span>
                              <span className="text-slate-900 fw-semibold" style={{ color: '#1e293b' }}>Topic 7 (AI Engineering / LLM / RAG)</span>
                            </div>
                            <div className="col-12 col-md-6 pb-2">
                              <span className="fw-bold text-danger d-block mb-1" style={{ fontSize: '0.95rem' }}>Group Name:</span>
                              <span className="text-slate-900 fw-semibold" style={{ color: '#1e293b' }}>IRIS Subject 7 - Group Developer</span>
                            </div>
                            <div className="col-12 border-top pt-2">
                              <span className="fw-bold text-danger d-block mb-1" style={{ fontSize: '0.95rem' }}>Date Submitted:</span>
                              <span className="text-slate-900 fw-semibold" style={{ color: '#1e293b' }}>11 มิถุนายน 2569</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="col-12 col-lg-5">
                        {/* Premium Stacked Collage Mockup */}
                        <div className="position-relative d-flex justify-content-center align-items-center w-100" style={{ minHeight: '320px', padding: '15px' }}>
                          {/* Desktop View Screenshot (Base) */}
                          <div className="shadow-lg rounded-3 border bg-white p-1" style={{ width: '85%', transform: 'translate(-10px, -20px) rotate(-1.5deg)', border: '1px solid rgba(0,0,0,0.1)' }}>
                            <img src="/images/dashboard_desktop.png" alt="Desktop View" className="img-fluid rounded" />
                          </div>
                          {/* System Logs View Screenshot (Overlayed) */}
                          <div className="position-absolute shadow-lg rounded-3 border bg-white p-1" style={{ width: '62%', right: '5px', bottom: '15px', transform: 'translate(5px, 5px) rotate(2deg)', zIndex: 2, border: '1px solid rgba(0,0,0,0.1)' }}>
                            <img src="/images/system_logs.png" alt="Logs View" className="img-fluid rounded" />
                          </div>
                          {/* Mobile View Screenshot (Floating) */}
                          <div className="position-absolute shadow-lg rounded-3 border bg-white p-1" style={{ width: '22%', left: '5px', bottom: '25px', transform: 'translate(-5px, 0px) rotate(-4deg)', zIndex: 3, border: '1px solid rgba(0,0,0,0.1)' }}>
                            <img src="/images/dashboard_mobile.png" alt="Mobile View" className="img-fluid rounded" style={{ backgroundColor: '#fff' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {aboutSlideTab === 2 && (
                  <div className="animate-fade-in">
                    <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                      <h3 className="fw-bold text-slate-950 mb-0" style={{ color: '#0f172a' }}>ภาพรวม ปัญหา และวัตถุประสงค์</h3>
                      <span className="badge bg-secondary px-3 py-2 fs-6">SLIDE 2 / 4</span>
                    </div>
                    
                    <div className="row g-4 mb-4">
                      <div className="col-12 col-md-6">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                          <h5 className="fw-bold text-danger mb-3 d-flex align-items-center" style={{ color: '#c82333' }}>
                            <span className="me-2">📝</span> 1. Project Overview
                          </h5>
                          <div className="mb-2">
                            <strong className="text-slate-900" style={{ color: '#1e293b', fontSize: '0.9rem' }}>Project Title:</strong>
                            <p className="text-slate-800 mt-1 mb-2 fw-semibold" style={{ color: '#0f172a', fontSize: '0.95rem' }}>Copier Portal: AI-Powered Copier Analytics & Privacy Masking Dashboard</p>
                          </div>
                          <div className="mb-2">
                            <strong className="text-slate-900" style={{ color: '#1e293b', fontSize: '0.9rem' }}>Description (ภาษาไทย):</strong>
                            <p className="text-slate-800 mt-1 mb-2" style={{ color: '#0f172a', fontSize: '0.9rem', lineHeight: '1.4' }}>
                              ระบบแดชบอร์ดอัจฉริยะที่ใช้ AI Normalization ในการแปลงข้อมูลรายงานเครื่องพิมพ์ต่างรูปแบบให้อยู่ในฐานข้อมูลเดียวกัน ทำการเข้ารหัสข้อมูลส่วนบุคคล (PDPA Masking) อัตโนมัติก่อนส่งออก และประมวลผลข้อมูลเปรียบเทียบสถิติการเติบโตแบบปีต่อปี (Year-over-Year) เพื่อการควบคุมต้นทุน
                            </p>
                          </div>
                          <div>
                            <strong className="text-slate-900" style={{ color: '#1e293b', fontSize: '0.9rem' }}>Business Context:</strong>
                            <p className="text-slate-800 mt-1 mb-0" style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                              ใช้งานในหน่วยงานสนับสนุนไอทีและฝ่ายการเงินขององค์กรที่ต้องการรวมรวมสถิติการใช้วัสดุสิ้นเปลืองการพิมพ์จากเครื่องพิมพ์หลากหลายยี่ห้อ (เช่น RICOH, Fuji Xerox)
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="col-12 col-md-6">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                          <h5 className="fw-bold text-danger mb-3 d-flex align-items-center" style={{ color: '#c82333' }}>
                            <span className="me-2">🚨</span> 2. Problem Statement
                          </h5>
                          <div className="mb-2">
                            <strong className="text-slate-900" style={{ color: '#1e293b', fontSize: '0.9rem' }}>Current Problem:</strong>
                            <p className="text-slate-800 mt-1 mb-2" style={{ color: '#0f172a', fontSize: '0.9rem', lineHeight: '1.4' }}>
                              โครงสร้างรายงานการพิมพ์ (CSV/Excel) ของผู้ผลิตเครื่องพิมพ์แต่ละยี่ห้อมีคอลัมน์และหัวตารางที่สะกดต่างกัน ทำให้ต้องเขียนโค้ดเฉพาะเจาะจงหรือทำงานแบบแมนนวล และมีข้อมูลส่วนบุคคล เช่น User ID และชื่อพนักงานปะปนอยู่ซึ่งเสี่ยงต่อการผิดกฎหมาย PDPA หากไม่มีระบบกรองที่ดี
                            </p>
                          </div>
                          <div className="mb-2">
                            <strong className="text-slate-900" style={{ color: '#1e293b', fontSize: '0.9rem' }}>Impact of Problem:</strong>
                            <p className="text-slate-800 mt-1 mb-2" style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                              เกิดความผิดพลาดในการรวมสถิติ เสียเวลาวิเคราะห์ และเสี่ยงต่อการรั่วไหลของข้อมูลระบุตัวตนพนักงานเมื่อส่งออกรายงานสรุปสถิติให้ฝ่ายการเงิน
                            </p>
                          </div>
                          <div>
                            <strong className="text-slate-900" style={{ color: '#1e293b', fontSize: '0.9rem' }}>Proposed Solution:</strong>
                            <p className="text-slate-800 mt-1 mb-0" style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                              ใช้ AI ในการจับคู่โครงสร้างคอลัมน์ (Schema Mapping) แบบไดนามิก ผนวกกับระบบ Masking ข้อมูลตามบทบาทผู้ใช้ (Role-based access) เพื่อล้างข้อมูลพนักงานโดยยังสามารถจับคู่ประวัติและเปรียบเทียบค่าใช้จ่ายรายปี (YoY) ได้อย่างถูกต้อง
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="row g-4 align-items-center">
                      <div className="col-12 col-lg-7">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                          <h5 className="fw-bold text-danger mb-3 d-flex align-items-center" style={{ color: '#c82333' }}>
                            <span className="me-2">🎯</span> 3. Objectives — SMART Goals
                          </h5>
                          <ul className="ps-3 mb-0" style={{ color: '#0f172a', fontSize: '0.9rem', lineHeight: '1.4' }}>
                            <li className="mb-2"><strong>ลดเวลาการประมวลผลข้อมูล:</strong> จากการรวมรายงานต่างยี่ห้อแมนนวล 4 ชั่วโมงต่อเดือน เหลือไม่เกิน 2 นาทีด้วยระบบนำเข้าอัตโนมัติ (100% Automated)</li>
                            <li className="mb-2"><strong>การันตีความปลอดภัย PDPA 100%:</strong> ข้อมูลระบุตัวตน (User ID และชื่อ) จะต้องถูกเข้ารหัส / Masking ก่อนการแปลงไฟล์หรือการส่งออกรายงานในกลุ่มผู้ใช้ปกติ</li>
                            <li className="mb-2"><strong>วิเคราะห์ความคุ้มทุนข้ามปี (YoY Growth Analysis):</strong> ระบบต้องคำนวณและชี้วัดสัดส่วนการเติบโตหรือยอดลดลงของค่าบริการได้เป็นเปอร์เซ็นต์แบบปีต่อปีเทียบเดือนตรงกัน</li>
                            <li><strong>ลดโอกาสการเกิดข้อผิดพลาด (SLA Accuracy):</strong> ข้อมูลจำนวนหน้าและราคาค่าบริการรวมต้องคำนวณถูกต้องตามตารางเรตบริการปัจจุบันด้วยความถูกต้อง 100%</li>
                          </ul>
                        </div>
                      </div>
                      
                      <div className="col-12 col-lg-5">
                        {/* Browser Mockup decoration */}
                        <div className="shadow-lg rounded-3 border overflow-hidden bg-light" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                          <div className="d-flex align-items-center bg-light px-3 py-2 border-bottom" style={{ gap: '4px' }}>
                            <span className="bg-danger rounded-circle" style={{ width: '8px', height: '8px' }}></span>
                            <span className="bg-warning rounded-circle" style={{ width: '8px', height: '8px' }}></span>
                            <span className="bg-success rounded-circle" style={{ width: '8px', height: '8px', marginRight: '8px' }}></span>
                            <span className="bg-white border rounded text-muted px-2 py-0.5 w-100 text-center" style={{ fontSize: '0.65rem', maxWidth: '200px' }}>copier-portal.vercel.app</span>
                          </div>
                          <img src="/images/dashboard_desktop.png" alt="Desktop Dashboard" className="img-fluid w-100" style={{ maxHeight: '180px', objectFit: 'cover' }} />
                          <div className="text-center bg-white p-2 text-muted fw-semibold" style={{ fontSize: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                            รูปที่ 1: แดชบอร์ดสรุปยอดและแนวโน้มการใช้งานระบบ
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {aboutSlideTab === 3 && (
                  <div className="animate-fade-in">
                    <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                      <h3 className="fw-bold text-slate-950 mb-0" style={{ color: '#0f172a' }}>ขอบเขต เทคโนโลยี AI และขั้นตอนการทำงาน</h3>
                      <span className="badge bg-secondary px-3 py-2 fs-6">SLIDE 3 / 4</span>
                    </div>

                    <div className="row g-4 mb-4">
                      <div className="col-12 col-md-7">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                          <h5 className="fw-bold text-danger mb-3" style={{ color: '#c82333' }}>🔍 4. Scope (ขอบเขตโปรเจกต์)</h5>
                          <div className="row g-2">
                            <div className="col-6">
                              <strong className="text-primary d-block mb-1" style={{ fontSize: '0.9rem' }}>In Scope:</strong>
                              <ul className="ps-3 mb-0" style={{ fontSize: '0.85rem', color: '#0f172a', lineHeight: '1.4' }}>
                                <li className="mb-1">การนำเข้าไฟล์ CSV/Excel จากเครื่องพิมพ์หลายยี่ห้อ</li>
                                <li className="mb-1">AI Schema Mapping คอลัมน์หัวตารางจัดโครงสร้างกลาง</li>
                                <li className="mb-1">การเข้ารหัส / Masking ข้อมูลตามสิทธิ์บทบาทผู้ใช้งาน (SC-3)</li>
                                <li className="mb-1">แดชบอร์ดสรุปและวิเคราะห์แนวโน้มข้ามรอบปี (YoY)</li>
                                <li>บันทึก Logs กิจกรรมนำเข้าและนำออกทั้งหมด</li>
                              </ul>
                            </div>
                            <div className="col-6 border-start ps-3">
                              <strong className="text-danger d-block mb-1" style={{ fontSize: '0.9rem' }}>Out of Scope:</strong>
                              <ul className="ps-3 mb-0" style={{ fontSize: '0.85rem', color: '#0f172a', lineHeight: '1.4' }}>
                                <li className="mb-1">การดึงข้อมูลการพิมพ์ผ่านระบบ SNMP Real-time</li>
                                <li>การเชื่อมระบบ Payment Gateway สำหรับจ่ายค่าบริการ</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="col-12 col-md-5">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                          <h5 className="fw-bold text-danger mb-3" style={{ color: '#c82333' }}>🤖 5. AI / LLM / RAG Components</h5>
                          <div className="mb-1" style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                            <strong className="text-slate-900" style={{ color: '#1e293b' }}>LLM Model:</strong> Gemini 1.5 Flash / GPT-4o-mini แมปคอลัมน์ที่ไม่ตรงกันให้อยู่ในมาตรฐาน Schema เดียวกัน
                          </div>
                          <div className="mb-1" style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                            <strong className="text-slate-900" style={{ color: '#1e293b' }}>RAG:</strong> ตารางเรตราคาอ้างอิงล่าสุด และประวัติการพิมพ์ย้อนหลังใน Anomaly Detection
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                            <strong className="text-slate-900" style={{ color: '#1e293b' }}>Agent/Workflow:</strong> AI Agent วิเคราะห์แจ้งเตือนกรณีมีการอัปโหลดรอบซ้ำ หรือพบ Anomaly ค่าบริการ/ปริมาณใช้งานสูงผิดปกติ
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-3 shadow-sm mb-2" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                      <h5 className="fw-bold text-danger mb-3" style={{ color: '#c82333' }}>⚙️ 6. Workflow & Architecture (ขั้นตอนการทำงาน)</h5>
                      
                      {/* Responsive Timeline Stepper */}
                      <div className="row g-2 text-center" style={{ fontSize: '0.82rem', color: '#0f172a' }}>
                        <div className="col-6 col-md-2">
                          <div className="p-2 border rounded bg-light-subtle h-100">
                            <span className="badge bg-danger rounded-circle mb-1">1</span>
                            <div className="fw-bold">Upload File</div>
                            <span className="text-muted d-block" style={{ fontSize: '0.7rem' }}>ผู้ใช้อัปโหลดรายงานดิบ</span>
                          </div>
                        </div>
                        <div className="col-6 col-md-2">
                          <div className="p-2 border rounded bg-light-subtle h-100">
                            <span className="badge bg-danger rounded-circle mb-1">2</span>
                            <div className="fw-bold">AI Mapping</div>
                            <span className="text-muted d-block" style={{ fontSize: '0.7rem' }}>LLM จัดรูปคอลัมน์</span>
                          </div>
                        </div>
                        <div className="col-6 col-md-2">
                          <div className="p-2 border rounded bg-light-subtle h-100">
                            <span className="badge bg-danger rounded-circle mb-1">3</span>
                            <div className="fw-bold">PDPA Masking</div>
                            <span className="text-muted d-block" style={{ fontSize: '0.7rem' }}>เข้ารหัส / กรองพนักงาน</span>
                          </div>
                        </div>
                        <div className="col-6 col-md-2">
                          <div className="p-2 border rounded bg-light-subtle h-100">
                            <span className="badge bg-danger rounded-circle mb-1">4</span>
                            <div className="fw-bold">DB Ingest</div>
                            <span className="text-muted d-block" style={{ fontSize: '0.7rem' }}>บันทึกและแคชตาราง</span>
                          </div>
                        </div>
                        <div className="col-6 col-md-2">
                          <div className="p-2 border rounded bg-light-subtle h-100">
                            <span className="badge bg-danger rounded-circle mb-1">5</span>
                            <div className="fw-bold">YoY Render</div>
                            <span className="text-muted d-block" style={{ fontSize: '0.7rem' }}>แสดงผลสถิติกราฟ YoY</span>
                          </div>
                        </div>
                        <div className="col-6 col-md-2">
                          <div className="p-2 border rounded bg-light-subtle h-100">
                            <span className="badge bg-danger rounded-circle mb-1">6</span>
                            <div className="fw-bold">Audit Log</div>
                            <span className="text-muted d-block" style={{ fontSize: '0.7rem' }}>บันทึกกิจกรรมความมั่นคง</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-top row align-items-center">
                        <div className="col-12 col-md-9">
                          <strong style={{ color: '#1e293b', fontSize: '0.9rem' }}>Architecture Notes:</strong>
                          <p className="mb-0 mt-1 text-slate-800" style={{ fontSize: '0.8rem', lineHeight: '1.4', color: '#475569' }}>
                            ระบบทำงานแบบ 3-tier architecture (React, Node.js/Express, PostgreSQL บน Neon Cloud Database) เพื่อเพิ่มประสิทธิภาพการคำนวณ YoY และลดคิวรีค้าง มีการบันทึกประวัติลงแคชประจำเดือน MonthlySummaries เพื่อช่วยลดเวลาการประมวลผลของฐานข้อมูลหลัก
                          </p>
                        </div>
                        <div className="col-12 col-md-3 text-center d-none d-md-block">
                          {/* iPhone-like mockup wrapper */}
                          <div className="shadow border rounded-3 bg-dark p-1 mx-auto text-center" style={{ maxWidth: '80px' }}>
                            <img src="/images/dashboard_mobile.png" alt="Mobile View" className="img-fluid rounded-2" style={{ maxHeight: '100px', backgroundColor: '#fff' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {aboutSlideTab === 4 && (
                  <div className="animate-fade-in">
                    <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                      <h3 className="fw-bold text-slate-950 mb-0" style={{ color: '#0f172a' }}>เครื่องมือ ผลลัพธ์ แผนดำเนินงาน และสมาชิก</h3>
                      <span className="badge bg-secondary px-3 py-2 fs-6">SLIDE 4 / 4</span>
                    </div>

                    <div className="row g-3 mb-3">
                      <div className="col-12 col-md-6">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                          <h5 className="fw-bold text-danger mb-2" style={{ color: '#c82333' }}>🛠️ 7. Tools & Technologies</h5>
                          <div className="mb-2" style={{ fontSize: '0.85rem' }}>
                            <strong className="d-block mb-1">Languages:</strong>
                            <span className="badge bg-light text-dark border me-1">JavaScript (ES6)</span>
                            <span className="badge bg-light text-dark border me-1">Python</span>
                            <span className="badge bg-light text-dark border">SQL</span>
                          </div>
                          <div className="mb-2" style={{ fontSize: '0.85rem' }}>
                            <strong className="d-block mb-1">Database:</strong>
                            <span className="badge bg-light text-dark border">PostgreSQL (Neon Cloud Database)</span>
                          </div>
                          <div className="mb-2" style={{ fontSize: '0.85rem' }}>
                            <strong className="d-block mb-1">Frameworks:</strong>
                            <span className="badge bg-light text-dark border me-1">React.js</span>
                            <span className="badge bg-light text-dark border me-1">Express.js (Node)</span>
                            <span className="badge bg-light text-dark border">Chart.js</span>
                          </div>
                          <div style={{ fontSize: '0.85rem' }}>
                            <strong className="d-block mb-1">Out / Visual:</strong>
                            <span className="badge bg-light text-dark border me-1">React Web RWD</span>
                            <span className="badge bg-light text-dark border">SheetJS XLSX Export</span>
                          </div>
                        </div>
                      </div>

                      <div className="col-12 col-md-6">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                          <h5 className="fw-bold text-danger mb-2" style={{ color: '#c82333' }}>📈 8. Expected Outcomes & Metrics</h5>
                          <div className="mb-2">
                            <strong className="text-slate-900" style={{ color: '#1e293b', fontSize: '0.85rem' }}>Deliverables:</strong>
                            <p className="text-slate-800 mt-1 mb-0" style={{ color: '#0f172a', fontSize: '0.85rem', lineHeight: '1.4' }}>
                              ระบบหน้าเว็บแดชบอร์ดสรุปสถิติมุมมอง Desktop/Mobile นำเข้าไฟล์ผ่าน AI Schema mapping และดาวน์โหลดข้อมูลพนักงานแยกบทบาทเพื่อความมั่นคง พร้อมกลไกแก้ไขข้อมูลชนซ้ำ (Reconciliation warning)
                            </p>
                          </div>
                          <div>
                            <strong className="text-slate-900" style={{ color: '#1e293b', fontSize: '0.85rem' }}>Success Metrics:</strong>
                            <ul className="ps-3 mb-0" style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                              <li><strong>Import Error &lt; 0.1%:</strong> การคัดแยกและ Normalization คีย์คอลัมน์โดย AI มีสัดส่วนผิดพลาดต่ำมาก</li>
                              <li><strong>100% compliance:</strong> ข้อมูลระบุตัวตนพนักงานได้รับการปกป้องอย่างเคร่งครัดตามสิทธิ์บทบาท</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="row g-3 align-items-center mb-3">
                      <div className="col-12 col-lg-7">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                          <h5 className="fw-bold text-danger mb-2" style={{ color: '#c82333' }}>📅 9. Project Timeline (8 สัปดาห์)</h5>
                          <div className="row g-2" style={{ fontSize: '0.75rem', color: '#0f172a' }}>
                            <div className="col-6">
                              <div className="p-1.5 border rounded">
                                <strong className="text-primary">W1-2: DB & Ingestion</strong>
                                <span className="text-muted d-block" style={{ fontSize: '0.68rem' }}>ออกแบบฐานข้อมูล ทำตัววิเคราะห์ Parser และ mock CSV</span>
                              </div>
                            </div>
                            <div className="col-6">
                              <div className="p-1.5 border rounded">
                                <strong className="text-primary">W3-4: UI/UX & Privacy</strong>
                                <span className="text-muted d-block" style={{ fontSize: '0.68rem' }}>UX RWD, ระบบ Masking (SC-3) และบันทึก Audit Logs</span>
                              </div>
                            </div>
                            <div className="col-6">
                              <div className="p-1.5 border rounded">
                                <strong className="text-danger">W5-6: YoY Calculation</strong>
                                <span className="text-muted d-block" style={{ fontSize: '0.68rem' }}>แคช MonthlySummaries สถิติกราฟ/ตารางเปรียบเทียบ YoY</span>
                              </div>
                            </div>
                            <div className="col-6">
                              <div className="p-1.5 border rounded">
                                <strong className="text-danger">W7-8: AI Mapping & Deploy</strong>
                                <span className="text-muted d-block" style={{ fontSize: '0.68rem' }}>เชื่อมต่อ AI Schema mapping, เทส verify, และอัปขึ้น Vercel</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="col-12 col-lg-5">
                        {/* Compact Browser Frame with System Logs */}
                        <div className="shadow-lg rounded bg-light border overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                          <div className="d-flex align-items-center bg-light px-2 py-1 border-bottom" style={{ gap: '3px' }}>
                            <span className="bg-danger rounded-circle" style={{ width: '6px', height: '6px' }}></span>
                            <span className="bg-warning rounded-circle" style={{ width: '6px', height: '6px' }}></span>
                            <span className="bg-success rounded-circle" style={{ width: '6px', height: '6px', marginRight: '6px' }}></span>
                            <span className="bg-white border rounded text-muted px-2 py-0.5 w-100 text-center" style={{ fontSize: '0.6rem', maxWidth: '140px' }}>copier-portal.vercel.app/logs</span>
                          </div>
                          <img src="/images/system_logs.png" alt="Activity Logs View" className="img-fluid w-100" style={{ maxHeight: '110px', objectFit: 'cover' }} />
                          <div className="text-center bg-white p-1 text-muted fw-semibold" style={{ fontSize: '0.7rem' }}>
                            รูปที่ 2: ระบบบันทึกประวัติกิจกรรมและการเข้าถึงข้อมูล (System Logs)
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-3 shadow-sm" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                      <h5 className="fw-bold text-danger mb-2" style={{ color: '#c82333' }}>👥 10. Team Members (สมาชิกผู้ร่วมพัฒนาโครงงาน)</h5>
                      <div className="table-responsive">
                        <table className="table table-bordered table-sm mb-0 text-slate-800" style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                          <thead className="table-light">
                            <tr>
                              <th>ลำดับ</th>
                              <th>ชื่อ-นามสกุล</th>
                              <th>ตำแหน่งงาน</th>
                              <th>บทบาทในโปรเจกต์</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="text-center">1</td>
                              <td className="fw-bold">คุณหัสชัย ปาณะศรี</td>
                              <td>เจ้าหน้าที่สนับสนุนงานเทคโนโลยีสารสนเทศ</td>
                              <td className="text-primary fw-bold">AI Engineer & Backend Developer</td>
                            </tr>
                            <tr>
                              <td className="text-center">2</td>
                              <td className="fw-bold">คุณคณพศ ไพนุสิน</td>
                              <td>ผู้ช่วยผู้จัดการแผนกเทคโนโลยีสารสนเทศ (ตรัง)</td>
                              <td className="text-primary fw-bold">Frontend Developer & UX/UI Designer</td>
                            </tr>
                            <tr>
                              <td className="text-center">3</td>
                              <td className="fw-bold">คุณบุญชัย ศักดิ์สมานชัย</td>
                              <td>ผู้จัดการส่วนงานเทคโนโลยีสารสนเทศ (กรุงเทพฯ)</td>
                              <td className="text-primary fw-bold">Project Manager & Product Owner</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Prev / Next Slide Navigation Controls */}
              <div className="d-flex justify-content-between align-items-center border-top pt-3 mt-4">
                <button
                  onClick={() => setAboutSlideTab(prev => Math.max(1, prev - 1))}
                  className="btn btn-outline-secondary py-2 px-4 fw-bold"
                  disabled={aboutSlideTab === 1}
                  style={{ color: '#475569' }}
                >
                  ◀ ย้อนกลับ (Prev)
                </button>
                <span className="fw-bold fs-5 text-dark">สไลด์ {aboutSlideTab} / 4</span>
                <button
                  onClick={() => setAboutSlideTab(prev => Math.min(4, prev + 1))}
                  className="btn btn-outline-secondary py-2 px-4 fw-bold"
                  disabled={aboutSlideTab === 4}
                  style={{ color: '#475569' }}
                >
                  ถัดไป (Next) ▶
                </button>
              </div>
            </div>
          </div>
        )}ction & Schema Mapping เพื่อแมปคอลัมน์ที่ไม่ตรงกัน
                          </div>
                          <div className="mb-2" style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                            <strong className="text-slate-900" style={{ color: '#1e293b' }}>RAG / Knowledge Base:</strong> ตารางอัตราเรตค่าบริการล่าสุด (Rates) และประวัติการพิมพ์ย้อนหลัง เพื่อใช้ในการวิเคราะห์ความผิดปกติ (Anomaly Detection)
                          </div>
                          <div className="mb-2" style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                            <strong className="text-slate-900" style={{ color: '#1e293b' }}>Agent / Workflow:</strong> AI Agent สำหรับการวิเคราะห์หาปริมาณการพิมพ์และราคาบริการที่สูงผิดปกติข้ามรอบงวดรายงาน
                          </div>
                          <div className="mb-2" style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                            <strong className="text-primary d-block mb-1">AI Processing Workflow:</strong>
                            <span style={{ fontSize: '0.85rem', lineHeight: '1.4', display: 'block', paddingLeft: '8px' }}>
                              • Input: ไฟล์รายงานการพิมพ์ดิบ (CSV/Excel) และอัตราเรตค่าบริการ<br />
                              • AI Processing: LLM ทำ Schema Normalization และกรองความผิดปกติของข้อมูล<br />
                              • Output: ข้อมูลประวัติที่ Masking แล้วพร้อมเข้า DB และคำแนะนำข้อสงสัย Anomaly<br />
                              • Human Review: Admin ตรวจสอบคำเตือน Anomaly และอนุมัติกรณี Force Import
                            </span>
                          </div>
                          <div style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                            <strong className="text-slate-900" style={{ color: '#1e293b' }}>Hallucination Mitigation:</strong> กำหนด Strict JSON Schema ใน Prompt บังคับให้ LLM คืนค่า 100% พร้อมทำ Rule-based boundaries check ใน backend
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-3 shadow-sm mb-2" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                      <h5 className="fw-bold text-danger mb-3" style={{ color: '#c82333' }}>⚙️ 6. Workflow & Architecture (ขั้นตอนการทำงาน)</h5>
                      <div className="row g-3" style={{ fontSize: '0.88rem', color: '#0f172a' }}>
                        <div className="col-12 col-md-4">
                          <div className="p-2 border rounded h-100">
                            <strong>1. Upload File (Ingestion)</strong>
                            <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.8rem' }}>ผู้ใช้ลากวางไฟล์ CSV/Excel รายงานของงวดเดือนและยี่ห้อใดๆ เข้าสู่ระบบ</p>
                          </div>
                        </div>
                        <div className="col-12 col-md-4">
                          <div className="p-2 border rounded h-100">
                            <strong>2. AI Schema Normalization</strong>
                            <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.8rem' }}>AI Engine อ่านคอลัมน์ ยืนยันความถูกต้อง และจัดฟอร์แมตกลางลงฐานข้อมูล</p>
                          </div>
                        </div>
                        <div className="col-12 col-md-4">
                          <div className="p-2 border rounded h-100">
                            <strong>3. PDPA Masking Engine</strong>
                            <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.8rem' }}>เข้ารหัส / Masking รหัสและชื่อพนักงานสำหรับสิทธิ์การดูแบบปกติ (SC-3 Display)</p>
                          </div>
                        </div>
                        <div className="col-12 col-md-4">
                          <div className="p-2 border rounded h-100">
                            <strong>4. DB Ingestion & Cache Update</strong>
                            <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.8rem' }}>บันทึกลง Postgres และอัปเดตแคชตารางสรุปรายเดือน MonthlySummaries</p>
                          </div>
                        </div>
                        <div className="col-12 col-md-4">
                          <div className="p-2 border rounded h-100">
                            <strong>5. YoY Analysis Rendering</strong>
                            <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.8rem' }}>ดึงค่าจาก API แสดงผลรายงาน เปรียบเทียบสถิติรายปี YoY</p>
                          </div>
                        </div>
                        <div className="col-12 col-md-4">
                          <div className="p-2 border rounded h-100">
                            <strong>6. Security Logs & Export</strong>
                            <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.8rem' }}>บันทึกประวัติการใช้สิทธิ์เข้าถึง และการนำออกรายงานสรุปการเงินของ Admin</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-top">
                        <strong style={{ color: '#1e293b', fontSize: '0.9rem' }}>Architecture Notes:</strong>
                        <p className="mb-0 mt-1 text-slate-800" style={{ fontSize: '0.85rem', lineHeight: '1.4', color: '#334155' }}>
                          ระบบทำงานแบบ 3-tier architecture (React, Node.js/Express, PostgreSQL บน Neon Cloud Database) เพื่อเพิ่มประสิทธิภาพในการคิวรีสถิติข้ามปี (YoY) มีการนำเข้าข้อมูลดิบลง UsageDetails และแคชลง MonthlySummaries เพื่อประสิทธิภาพการคำนวณที่รวดเร็ว
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {aboutSlideTab === 4 && (
                  <div className="animate-fade-in">
                    <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                      <h3 className="fw-bold text-slate-950" style={{ color: '#0f172a' }}>เครื่องมือ ผลลัพธ์ แผนดำเนินงาน และสมาชิก</h3>
                      <span className="badge bg-secondary px-3 py-2 fs-6">SLIDE 4 / 4</span>
                    </div>

                    <div className="row g-4 mb-4">
                      <div className="col-12 col-md-6">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                          <h5 className="fw-bold text-danger mb-3" style={{ color: '#c82333' }}>🛠️ 7. Tools & Technologies</h5>
                          <div className="mb-2" style={{ fontSize: '0.9rem' }}>
                            <strong className="d-block mb-1">Languages:</strong>
                            <span className="badge bg-light text-dark border me-1">JavaScript (ES6)</span>
                            <span className="badge bg-light text-dark border me-1">Python</span>
                            <span className="badge bg-light text-dark border">SQL</span>
                          </div>
                          <div className="mb-2" style={{ fontSize: '0.9rem' }}>
                            <strong className="d-block mb-1">Database & Storage:</strong>
                            <span className="badge bg-light text-dark border">PostgreSQL (Neon Cloud Database)</span>
                          </div>
                          <div className="mb-2" style={{ fontSize: '0.9rem' }}>
                            <strong className="d-block mb-1">Frameworks & Libraries:</strong>
                            <span className="badge bg-light text-dark border me-1">React.js</span>
                            <span className="badge bg-light text-dark border me-1">Express.js</span>
                            <span className="badge bg-light text-dark border me-1">Chart.js</span>
                            <span className="badge bg-light text-dark border">SheetJS (xlsx)</span>
                          </div>
                          <div style={{ fontSize: '0.9rem' }}>
                            <strong className="d-block mb-1">Visualization & Output:</strong>
                            <span className="badge bg-light text-dark border me-1">React Web Dashboard (RWD)</span>
                            <span className="badge bg-light text-dark border me-1">Chart.js Graphs</span>
                            <span className="badge bg-light text-dark border">XLSX Export (Excel)</span>
                          </div>
                        </div>
                      </div>

                      <div className="col-12 col-md-6">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                          <h5 className="fw-bold text-danger mb-3" style={{ color: '#c82333' }}>📈 8. Expected Outcomes & Metrics</h5>
                          <div className="mb-3">
                            <strong className="text-slate-900" style={{ color: '#1e293b' }}>Deliverables:</strong>
                            <p className="text-slate-800 mt-1 mb-0" style={{ color: '#0f172a', fontSize: '0.9rem', lineHeight: '1.4' }}>
                              ระบบแดชบอร์ดสรุปวิเคราะห์ค่าบริการการพิมพ์ พร้อมระบบนำเข้าข้อมูลแบบอัตโนมัติ กรองข้อมูลพนักงานรองรับความปลอดภัย PDPA บันทึกกิจกรรมระบบเพื่อความโปร่งใส และนำออกข้อมูลในรูปแบบไฟล์ Excel (XLSX)
                            </p>
                          </div>
                          <div>
                            <strong className="text-slate-900" style={{ color: '#1e293b' }}>Success Metrics:</strong>
                            <ul className="ps-3 mb-0" style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                              <li className="mb-1"><strong>Import Schema Error &lt; 0.1%:</strong> ความแม่นยำในการวิเคราะห์ mapping โดย AI สูงมาก</li>
                              <li><strong>100% compliance:</strong> ข้อมูลระบุตัวตนจะต้องได้รับการ Masking ป้องกันอย่างสมบูรณ์แบบในสิทธิ์ผู้ใช้ทั่วไป</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="row g-4 align-items-center mb-4">
                      <div className="col-12 col-lg-7">
                        <div className="p-3 bg-white rounded-3 shadow-sm h-100" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                          <h5 className="fw-bold text-danger mb-3" style={{ color: '#c82333' }}>📅 9. Project Timeline (8 สัปดาห์)</h5>
                          <div className="row g-2" style={{ fontSize: '0.8rem', color: '#0f172a' }}>
                            <div className="col-6">
                              <div className="p-2 border rounded">
                                <strong className="text-primary">W1-2: ฐานข้อมูลและการนำเข้า</strong>
                                <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.75rem' }}>ออกแบบฐานข้อมูล ทำระบบ Dynamic Parser และ mock CSV ข้อมูลปริมาณการพิมพ์</p>
                              </div>
                            </div>
                            <div className="col-6">
                              <div className="p-2 border rounded">
                                <strong className="text-primary">W3-4: UI/UX ความปลอดภัยและ Log</strong>
                                <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.75rem' }}>UX RWD, ระบบ Masking ข้อมูลพนักงาน และระบบ Audit Activity Logs ในหลังบ้าน</p>
                              </div>
                            </div>
                            <div className="col-6">
                              <div className="p-2 border rounded">
                                <strong className="text-danger">W5-6: YoY Analysis & Chart</strong>
                                <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.75rem' }}>ระบบวิเคราะห์เติบโตข้ามปี YoY, กราฟเปรียบเทียบและตารางเปรียบเทียบปีต่อปี</p>
                              </div>
                            </div>
                            <div className="col-6">
                              <div className="p-2 border rounded">
                                <strong className="text-danger">W7-8: AI Integration & Deploy</strong>
                                <p className="mb-0 text-muted mt-1" style={{ fontSize: '0.75rem' }}>AI Schema mapping, รัน verify.ps1 เทส และขึ้น Vercel / Postgres Neon Cloud</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-lg-5">
                        <div className="bg-white p-2 rounded-3 shadow-sm text-center" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                          <img src="/images/system_logs.png" alt="Activity Logs" className="img-fluid rounded-2 mb-2" style={{ maxHeight: '180px', objectFit: 'cover' }} />
                          <div className="text-muted" style={{ fontSize: '0.8rem', color: '#475569' }}>รูปที่ 3: ระบบบันทึกเหตุการณ์ความปลอดภัย (System Activity Logs)</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-3 shadow-sm" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                      <h5 className="fw-bold text-danger mb-3" style={{ color: '#c82333' }}>👥 10. Team Members (สมาชิกผู้ร่วมพัฒนาโครงงาน)</h5>
                      <div className="table-responsive">
                        <table className="table table-bordered table-sm mb-0 text-slate-800" style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                          <thead className="table-light">
                            <tr>
                              <th>ลำดับ</th>
                              <th>ชื่อ-นามสกุล</th>
                              <th>ตำแหน่งงาน</th>
                              <th>บทบาทในโปรเจกต์</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="text-center">1</td>
                              <td className="fw-bold">คุณหัสชัย ปาณะศรี</td>
                              <td>เจ้าหน้าที่สนับสนุนงานเทคโนโลยีสารสนเทศ</td>
                              <td className="text-primary fw-medium">AI Engineer & Backend Developer</td>
                            </tr>
                            <tr>
                              <td className="text-center">2</td>
                              <td className="fw-bold">คุณคณพศ ไพนุสิน</td>
                              <td>ผู้ช่วยผู้จัดการแผนกเทคโนโลยีสารสนเทศ (ตรัง)</td>
                              <td className="text-primary fw-medium">Frontend Developer & UX/UI Designer</td>
                            </tr>
                            <tr>
                              <td className="text-center">3</td>
                              <td className="fw-bold">คุณบุญชัย ศักดิ์สมานชัย</td>
                              <td>ผู้จัดการส่วนงานเทคโนโลยีสารสนเทศ (กรุงเทพฯ)</td>
                              <td className="text-primary fw-medium">Project Manager & Product Owner</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Prev / Next Slide Navigation Controls */}
              <div className="d-flex justify-content-between align-items-center border-top pt-3 mt-4">
                <button
                  onClick={() => setAboutSlideTab(prev => Math.max(1, prev - 1))}
                  className="btn btn-outline-light text-white form-glass py-2 px-4 fw-bold"
                  disabled={aboutSlideTab === 1}
                >
                  ◀ ย้อนกลับ (Prev)
                </button>
                <span className="fw-bold text-white fs-5">สไลด์ {aboutSlideTab} / 4</span>
                <button
                  onClick={() => setAboutSlideTab(prev => Math.min(4, prev + 1))}
                  className="btn btn-outline-light text-white form-glass py-2 px-4 fw-bold"
                  disabled={aboutSlideTab === 4}
                >
                  ถัดไป (Next) ▶
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Upload Conflict Warning Modal Overlay */}
      {uploadConflict && (() => {
        const hasDetails = (uploadConflict.uploadedRows && uploadConflict.uploadedRows.length > 0) || 
                           (uploadConflict.existingRows && uploadConflict.existingRows.length > 0);

        if (!showComparisonTable || !hasDetails) {
          // State 1: Simple Alert view
          return (
            <div className="custom-modal-overlay">
              <div className="custom-modal-content glass-card animate-fade-in p-4 text-center" style={{ maxWidth: '500px' }}>
                <div className="text-danger mb-3">
                  <AlertCircle size={56} className="pulse-loading d-inline-block text-danger" />
                </div>
                <h4 className="fw-bold text-gradient text-danger mb-2">🚨 ตรวจพบรายงานซ้ำซ้อนในระบบ!</h4>
                <p className="text-muted mb-4" style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>
                  {uploadConflict.conflictDetails}
                </p>
                {uploadConflict.renamedFilename && uploadConflict.renamedFilename !== uploadConflict.filename && (
                  <div className="alert alert-info py-2 px-3 mb-3 text-start animate-fade-in" style={{ fontSize: '0.85rem' }}>
                    <strong>💡 เปลี่ยนชื่อไฟล์อัตโนมัติ:</strong> ระบบจะเปลี่ยนชื่อไฟล์นำเข้าจาก <code>{uploadConflict.filename}</code> เป็น <code>{uploadConflict.renamedFilename}</code> เพื่อระบุรอบงวดและไม่ให้ชื่อไฟล์ซ้ำซ้อน
                  </div>
                )}
                <div className="d-flex flex-column gap-2">
                  <button 
                    onClick={handleConfirmForceUpload} 
                    className="btn btn-danger py-2 w-100 fw-bold"
                  >
                    ตกลงนำเข้า (เขียนทับทั้งหมด)
                  </button>
                  {hasDetails && (
                    <button 
                      onClick={() => setShowComparisonTable(true)} 
                      className="btn btn-glass-primary py-2 w-100 fw-bold text-white"
                      style={{ background: 'var(--accent-red)' }}
                    >
                      🔍 ตรวจสอบข้อมูลซ้ำ
                    </button>
                  )}
                  <button 
                    onClick={handleCancelUpload} 
                    className="btn btn-outline-secondary py-2 w-100"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // State 2: Expanded comparison reconciliation table view
        // Collect all unique userIds across both lists
        const allUserIds = Array.from(new Set([
          ...(uploadConflict.uploadedRows || []).map(r => r.userId),
          ...(uploadConflict.existingRows || []).map(r => r.userId)
        ])).sort();

        // Calculate comparison items
        const comparisonList = allUserIds.map(uid => {
          const uploaded = (uploadConflict.uploadedRows || []).find(r => r.userId === uid);
          const existing = (uploadConflict.existingRows || []).find(r => r.userId === uid);

          let status = 'NEW'; // NEW, EQUAL, DIFFERENT, DB_ONLY
          if (uploaded && existing) {
            const hasDifference = 
              uploaded.printBw !== existing.printBw ||
              uploaded.printColor !== existing.printColor ||
              uploaded.copyBw !== existing.copyBw ||
              uploaded.copyColor !== existing.copyColor ||
              uploaded.scanner !== existing.scanner ||
              uploaded.cost !== existing.cost;
            status = hasDifference ? 'DIFFERENT' : 'EQUAL';
          } else if (existing) {
            status = 'DB_ONLY';
          }

          return {
            userId: uid,
            name: uploaded ? uploaded.name : (existing ? existing.name : ''),
            status,
            uploaded,
            existing
          };
        });

        // Recalculate selected total cost
        const selectedUploadedRows = (uploadConflict.uploadedRows || []).filter(r => selectedUserIdsForImport.includes(r.userId));
        const recalculatedCost = selectedUploadedRows.reduce((sum, r) => sum + r.cost, 0);

        return (
          <div className="custom-modal-overlay">
            <div 
              className="custom-modal-content glass-card animate-fade-in p-4" 
              style={{ 
                maxWidth: '1100px', 
                width: '95%', 
                maxHeight: '90vh', 
                display: 'flex', 
                flexDirection: 'column' 
              }}
            >
              <div className="text-center mb-3">
                <div className="text-danger mb-2">
                  <AlertCircle size={44} className="pulse-loading d-inline-block text-danger" />
                </div>
                <h4 className="fw-bold text-gradient text-danger mb-1">🚨 ตรวจสอบข้อมูลซ้ำซ้อนในระบบ!</h4>
                <p className="text-muted mb-2" style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>
                  {uploadConflict.conflictDetails}
                </p>
                {uploadConflict.renamedFilename && uploadConflict.renamedFilename !== uploadConflict.filename && (
                  <div className="alert alert-info py-2 px-3 mb-2 text-start" style={{ fontSize: '0.85rem' }}>
                    <strong>💡 เปลี่ยนชื่อไฟล์อัตโนมัติ:</strong> ระบบจะเปลี่ยนชื่อไฟล์นำเข้าเป็น <code>{uploadConflict.renamedFilename}</code>
                  </div>
                )}
              </div>

              <div className="flex-grow-1 d-flex flex-column mb-3" style={{ overflow: 'hidden' }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-semibold text-muted" style={{ fontSize: '0.9rem' }}>
                    เปรียบเทียบข้อมูลรายบุคคล (เทียบระหว่าง ข้อมูลในไฟล์ที่จะนำเข้า และ ข้อมูลเดิมในฐานข้อมูล)
                  </span>
                  <div className="d-flex gap-2 align-items-center">
                    <span className="badge bg-success" style={{ fontSize: '0.75rem' }}>ตรงกัน</span>
                    <span className="badge bg-warning text-dark" style={{ fontSize: '0.75rem' }}>แตกต่าง</span>
                    <span className="badge bg-primary" style={{ fontSize: '0.75rem' }}>ข้อมูลใหม่</span>
                    <span className="badge bg-secondary" style={{ fontSize: '0.75rem' }}>เดิมในฐานข้อมูล</span>
                  </div>
                </div>

                <div className="table-responsive border rounded-3" style={{ overflowY: 'auto', maxHeight: '420px', background: '#f8fafc' }}>
                  <table className="table table-bordered table-sm align-middle mb-0" style={{ fontSize: '0.82rem', borderCollapse: 'separate' }}>
                    <thead className="position-sticky top-0 bg-white" style={{ zIndex: 2 }}>
                      <tr className="table-light text-center">
                        <th style={{ width: '40px' }} className="py-2">
                          <input 
                            type="checkbox"
                            className="form-check-input"
                            checked={selectedUserIdsForImport.length === (uploadConflict.uploadedRows || []).length && (uploadConflict.uploadedRows || []).length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUserIdsForImport((uploadConflict.uploadedRows || []).map(r => r.userId));
                              } else {
                                setSelectedUserIdsForImport([]);
                              }
                            }}
                          />
                        </th>
                        <th style={{ width: '90px' }}>สถานะ</th>
                        <th>รหัสผู้ใช้</th>
                        <th>ชื่อพนักงาน</th>
                        <th style={{ width: '120px' }}>แหล่งข้อมูล</th>
                        <th style={{ width: '80px' }}>Print B&W</th>
                        <th style={{ width: '80px' }}>Print Color</th>
                        <th style={{ width: '80px' }}>Copy B&W</th>
                        <th style={{ width: '80px' }}>Copy Color</th>
                        <th style={{ width: '80px' }}>Scan</th>
                        <th style={{ width: '80px' }}>รวมหน้า</th>
                        <th style={{ width: '90px' }}>ค่าบริการ (บาท)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonList.map((item, idx) => {
                        const { userId, name, status, uploaded, existing } = item;
                        const displayUserId = isMasked ? maskValue(userId) : userId;
                        const displayName = isMasked ? maskValue(name) : name;

                        const isChecked = selectedUserIdsForImport.includes(userId);
                        const handleCheckboxChange = () => {
                          if (isChecked) {
                            setSelectedUserIdsForImport(prev => prev.filter(id => id !== userId));
                          } else {
                            setSelectedUserIdsForImport(prev => [...prev, userId]);
                          }
                        };

                        const badgeMap = {
                          EQUAL: <span className="badge bg-success w-100">ตรงกัน</span>,
                          DIFFERENT: <span className="badge bg-warning text-dark w-100">แตกต่าง</span>,
                          NEW: <span className="badge bg-primary w-100">ข้อมูลใหม่</span>,
                          DB_ONLY: <span className="badge bg-secondary w-100">เดิมในฐาน</span>
                        };

                        const diffStyles = (key) => {
                          if (status !== 'DIFFERENT' || !uploaded || !existing) return {};
                          if (uploaded[key] !== existing[key]) {
                            return { backgroundColor: '#fef3c7', fontWeight: 'bold', color: '#b45309' };
                          }
                          return {};
                        };

                        // Render stacked rows
                        const hasUploaded = !!uploaded;
                        const hasExisting = !!existing;

                        const rowSpanVal = (hasUploaded && hasExisting) ? 2 : 1;

                        return (
                          <React.Fragment key={userId}>
                            <tr style={status === 'DIFFERENT' ? { borderTop: '2px solid #e2e8f0' } : {}}>
                              <td rowSpan={rowSpanVal} className="text-center" style={{ background: '#fff' }}>
                                {hasUploaded ? (
                                  <input 
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={isChecked}
                                    onChange={handleCheckboxChange}
                                  />
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td rowSpan={rowSpanVal} className="text-center" style={{ background: '#fff' }}>
                                {badgeMap[status]}
                              </td>
                              <td rowSpan={rowSpanVal} className="fw-semibold text-dark" style={{ background: '#fff' }}>{displayUserId}</td>
                              <td rowSpan={rowSpanVal} className="text-dark" style={{ background: '#fff' }}>{displayName}</td>
                              
                              {hasUploaded ? (
                                <>
                                  <td className="text-primary fw-medium text-center" style={{ background: '#eff6ff' }}>ไฟล์อัปโหลดใหม่</td>
                                  <td className="text-end" style={{ ...diffStyles('printBw'), background: '#eff6ff' }}>{(uploaded.printBw || 0).toLocaleString()}</td>
                                  <td className="text-end" style={{ ...diffStyles('printColor'), background: '#eff6ff' }}>{(uploaded.printColor || 0).toLocaleString()}</td>
                                  <td className="text-end" style={{ ...diffStyles('copyBw'), background: '#eff6ff' }}>{(uploaded.copyBw || 0).toLocaleString()}</td>
                                  <td className="text-end" style={{ ...diffStyles('copyColor'), background: '#eff6ff' }}>{(uploaded.copyColor || 0).toLocaleString()}</td>
                                  <td className="text-end" style={{ ...diffStyles('scanner'), background: '#eff6ff' }}>{(uploaded.scanner || 0).toLocaleString()}</td>
                                  <td className="text-end fw-semibold text-dark" style={{ background: '#eff6ff' }}>{(uploaded.totalPages || 0).toLocaleString()}</td>
                                  <td className="text-end fw-bold text-gradient-green" style={{ ...diffStyles('cost'), background: '#eff6ff' }}>{(uploaded.cost || 0).toFixed(2)}</td>
                                </>
                              ) : (
                                <>
                                  <td className="text-muted text-center" style={{ background: '#f1f5f9' }}>ฐานข้อมูลเดิม</td>
                                  <td className="text-end text-muted" style={{ background: '#f1f5f9' }}>{(existing.printBw || 0).toLocaleString()}</td>
                                  <td className="text-end text-muted" style={{ background: '#f1f5f9' }}>{(existing.printColor || 0).toLocaleString()}</td>
                                  <td className="text-end text-muted" style={{ background: '#f1f5f9' }}>{(existing.copyBw || 0).toLocaleString()}</td>
                                  <td className="text-end text-muted" style={{ background: '#f1f5f9' }}>{(existing.copyColor || 0).toLocaleString()}</td>
                                  <td className="text-end text-muted" style={{ background: '#f1f5f9' }}>{(existing.scanner || 0).toLocaleString()}</td>
                                  <td className="text-end text-muted" style={{ background: '#f1f5f9' }}>{(existing.totalPages || 0).toLocaleString()}</td>
                                  <td className="text-end text-muted" style={{ background: '#f1f5f9' }}>{(existing.cost || 0).toFixed(2)}</td>
                                </>
                              )}
                            </tr>

                            {hasUploaded && hasExisting && (
                              <tr>
                                <td className="text-muted text-center" style={{ background: '#f8fafc' }}>ฐานข้อมูลเดิม</td>
                                <td className="text-end text-muted" style={{ background: '#f8fafc' }}>{(existing.printBw || 0).toLocaleString()}</td>
                                <td className="text-end text-muted" style={{ background: '#f8fafc' }}>{(existing.printColor || 0).toLocaleString()}</td>
                                <td className="text-end text-muted" style={{ background: '#f8fafc' }}>{(existing.copyBw || 0).toLocaleString()}</td>
                                <td className="text-end text-muted" style={{ background: '#f8fafc' }}>{(existing.copyColor || 0).toLocaleString()}</td>
                                <td className="text-end text-muted" style={{ background: '#f8fafc' }}>{(existing.scanner || 0).toLocaleString()}</td>
                                <td className="text-end text-muted" style={{ background: '#f8fafc' }}>{(existing.totalPages || 0).toLocaleString()}</td>
                                <td className="text-end text-muted" style={{ background: '#f8fafc' }}>{(existing.cost || 0).toFixed(2)}</td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="alert alert-secondary py-2 px-3 mt-2 mb-0 d-flex justify-content-between align-items-center" style={{ fontSize: '0.85rem' }}>
                  <span>
                    เลือกแล้ว: <strong>{selectedUserIdsForImport.length}</strong> / <strong>{(uploadConflict.uploadedRows || []).length}</strong> รายการ
                  </span>
                  <span className="fw-bold text-dark">
                    ยอดเงินรวมรายการที่เลือกนำเข้า: <span className="text-gradient-green" style={{ fontSize: '1.05rem' }}>{recalculatedCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</span>
                  </span>
                </div>
              </div>

              <div className="d-flex justify-content-center gap-3">
                <button 
                  onClick={handleConfirmForceUpload} 
                  className="btn btn-danger py-2 px-4 fw-bold"
                  disabled={selectedUserIdsForImport.length === 0}
                >
                  นำเข้าเฉพาะข้อมูลที่เลือก
                </button>
                <button 
                  onClick={() => setShowComparisonTable(false)} 
                  className="btn btn-outline-secondary py-2 px-4"
                >
                  ย้อนกลับ
                </button>
                <button 
                  onClick={handleCancelUpload} 
                  className="btn btn-outline-secondary py-2 px-4"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

export default App;
