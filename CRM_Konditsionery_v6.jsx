import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  createCity,
  createContactReason,
  createContactStatus,
  createSource,
  createStatus,
  deleteCity as deleteCityRemote,
  deleteContact,
  deleteContactReason,
  deleteContactStatus,
  deleteEmployee,
  deleteSource,
  deleteStatus,
  deleteOrder,
  loadEmployeePresence,
  loadCrmState,
  provisionEmployeeAccess,
  saveCrmState,
  toggleBusySlotRemote,
  toggleDayOffRemote,
  touchPresence,
  upsertContact,
  updateEmployeeAccess,
  updateEmployeePermissions,
  updateSource,
  syncSlotLocksRemote,
  releaseSlotLocksRemote,
  releaseCurrentUserSlotLocksRemote,
  upsertServiceNode,
  upsertEmployee,
  upsertOrder,
  buildReturnToOfficeOrderPatch,
  deleteServiceNode,
} from "./src/api/crmRepository.js";
import { getStoredSession, isSupabaseConfigured, signInWithPassword, signOut, storeSession } from "./src/lib/supabase.js";
import CustomSelect from "./src/shared/ui/CustomSelect.jsx";

const INIT_CITIES = {
  "Краснодар": { color: "#2E7D32", lat: 45.0355, lng: 38.9753 },
  "Ростов-на-Дону": { color: "#1565C0", lat: 47.2357, lng: 39.7015 },
  "Севастополь": { color: "#6A1B9A", lat: 44.6167, lng: 33.5254 },
  "Симферополь": { color: "#E65100", lat: 44.9521, lng: 34.1024 },
  "Астрахань": { color: "#AD1457", lat: 46.3497, lng: 48.0408 },
  "Волгоград": { color: "#00695C", lat: 48.7080, lng: 44.5133 },
};
const EMPLOYEE_TYPES = {
  technician: { label: "Мастер", icon: "👷" },
  call_center: { label: "Колл-центр", icon: "🎧" },
  admin: { label: "Админ", icon: "🔐" },
};
const INIT_EMPLOYEES = [
  { name: "Артем", city: "Краснодар", color: "#4FC3F7", phone: "", passport: "", type: "technician" },
  { name: "Эрик", city: "Краснодар", color: "#AED581", phone: "", passport: "", type: "technician" },
  { name: "Гриша", city: "Краснодар", color: "#FFB74D", phone: "", passport: "", type: "technician" },
  { name: "Алексей", city: "Ростов-на-Дону", color: "#4FC3F7", phone: "", passport: "", type: "technician" },
  { name: "Дмитрий", city: "Ростов-на-Дону", color: "#AED581", phone: "", passport: "", type: "technician" },
  { name: "Дима", city: "Севастополь", color: "#4FC3F7", phone: "", passport: "", type: "technician" },
  { name: "Иван", city: "Симферополь", color: "#4FC3F7", phone: "", passport: "", type: "technician" },
  { name: "Игорь", city: "Астрахань", color: "#4FC3F7", phone: "", passport: "", type: "technician" },
  { name: "Сергей", city: "Волгоград", color: "#4FC3F7", phone: "", passport: "", type: "technician" },
  { name: "Мария", city: "", color: "#F48FB1", phone: "", passport: "", type: "call_center" },
  { name: "Анна", city: "", color: "#CE93D8", phone: "", passport: "", type: "call_center" },
  { name: "Наталья", city: "", color: "#80CBC4", phone: "", passport: "", type: "call_center" },
];
const WORKDAY_START_HOUR = 8;
const TIMES = Array.from({ length: 13 }, (_, idx) => `${String(WORKDAY_START_HOUR + idx).padStart(2,"0")}:00`);
const WEEKDAY_BUTTONS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
];
const DEFAULT_ORDER_DURATION_SLOTS = 2;
const NEW_ORDER_DURATION_SLOTS = 1;
const INIT_STATUSES = [
  { name:"Новый", shortLabel:"НОВЫЙ", tone:"amber", sortOrder:0 },
  { name:"Прозвонен", shortLabel:"ПРОЗВ.", tone:"sky", sortOrder:1 },
  { name:"Подтверждён", shortLabel:"ПОДТВ.", tone:"green", sortOrder:2 },
  { name:"Подтвержден мастером", shortLabel:"МАСТЕР", tone:"green", sortOrder:3 },
  { name:"В пути", shortLabel:"В ПУТИ", tone:"blue", sortOrder:4 },
  { name:"На объекте", shortLabel:"ОБЪЕКТ", tone:"violet", sortOrder:5 },
  { name:"Выполнен", shortLabel:"ВЫПОЛН.", tone:"pink", sortOrder:6 },
  { name:"Отменён", shortLabel:"ОТМЕН.", tone:"red", sortOrder:7 },
  { name:"Перенесён", shortLabel:"ПЕРЕН.", tone:"yellow", sortOrder:8 },
  { name:"Возврат в офис", shortLabel:"ВОЗВР.", tone:"red", sortOrder:9 },
];
const INIT_CONTACT_STATUSES = [
  { name:"Новый", tone:"blue", sortOrder:0, systemKey:"new", isDefault:true },
  { name:"Перезвонить", tone:"yellow", sortOrder:1, systemKey:"callback", isDefault:false },
  { name:"Недозвонился", tone:"orange", sortOrder:2, systemKey:"missed", isDefault:false },
  { name:"Неактуально", tone:"red", sortOrder:3, systemKey:"inactive", isDefault:false },
  { name:"Записан", tone:"green", sortOrder:4, systemKey:"booked", isDefault:false },
];
const INIT_CONTACT_REASONS = [
  { id:"callback-busy", name:"Занят", statusName:"Перезвонить", sortOrder:0 },
  { id:"callback-later", name:"Просил позже", statusName:"Перезвонить", sortOrder:1 },
  { id:"callback-talk", name:"Неудобно говорить", statusName:"Перезвонить", sortOrder:2 },
  { id:"callback-decide", name:"Нужно посоветоваться", statusName:"Перезвонить", sortOrder:3 },
  { id:"missed-no-answer", name:"Не взял трубку", statusName:"Недозвонился", sortOrder:0 },
  { id:"missed-reset", name:"Сбросил", statusName:"Недозвонился", sortOrder:1 },
  { id:"missed-offline", name:"Вне зоны", statusName:"Недозвонился", sortOrder:2 },
  { id:"missed-wrong", name:"Неверный номер", statusName:"Недозвонился", sortOrder:3 },
  { id:"inactive-serviced", name:"Уже обслужили", statusName:"Неактуально", sortOrder:0 },
  { id:"inactive-no-interest", name:"Неинтересно", statusName:"Неактуально", sortOrder:1 },
  { id:"inactive-error", name:"Ошибочный контакт", statusName:"Неактуально", sortOrder:2 },
  { id:"inactive-moved", name:"Переехал", statusName:"Неактуально", sortOrder:3 },
  { id:"inactive-no-ac", name:"Нет кондиционера", statusName:"Неактуально", sortOrder:4 },
];
const INIT_CONTACTS = [];
const STATUS_TONES = {
  amber: {
    cardBg:"#F6E8C9", cardBorder:"#E6D1A3", cardText:"#3E3120",
    pillBg:"#F2D28B", pillBorder:"#D7B25D", pillText:"#3E3120",
    accent:"#D7B25D", icon:"🆕",
  },
  sky: {
    cardBg:"#DCEEFF", cardBorder:"#B9D9F5", cardText:"#1E3550",
    pillBg:"#A9D6FF", pillBorder:"#69AEEF", pillText:"#1E3550",
    accent:"#69AEEF", icon:"📞",
  },
  green: {
    cardBg:"#DDF3E4", cardBorder:"#B5DABD", cardText:"#173824",
    pillBg:"#8FD3A4", pillBorder:"#54AF72", pillText:"#173824",
    accent:"#54AF72", icon:"✅",
  },
  blue: {
    cardBg:"#D9F2FF", cardBorder:"#B0DDEF", cardText:"#12384E",
    pillBg:"#7CC7F2", pillBorder:"#3E9DD4", pillText:"#12384E",
    accent:"#3E9DD4", icon:"🚗",
  },
  violet: {
    cardBg:"#E7DFFF", cardBorder:"#CBBDEE", cardText:"#2E2454",
    pillBg:"#B7A4F6", pillBorder:"#8D75E0", pillText:"#2E2454",
    accent:"#8D75E0", icon:"🏠",
  },
  pink: {
    cardBg:"#DDF1E3", cardBorder:"#B7D8C1", cardText:"#173824",
    pillBg:"#5DBB7A", pillBorder:"#348E56", pillText:"#FFFFFF",
    accent:"#348E56", icon:"🏁",
  },
  red: {
    cardBg:"#FFD9DC", cardBorder:"#F0B7BF", cardText:"#4F1F28",
    pillBg:"#F4A4AE", pillBorder:"#D96B79", pillText:"#4F1F28",
    accent:"#D96B79", icon:"✖",
  },
  yellow: {
    cardBg:"#FFF3C9", cardBorder:"#E7DFA7", cardText:"#4A3D14",
    pillBg:"#F2DE77", pillBorder:"#D4BC42", pillText:"#4A3D14",
    accent:"#D4BC42", icon:"↪",
  },
  teal: {
    cardBg:"#D9F2FF", cardBorder:"#B0DDEF", cardText:"#12384E",
    pillBg:"#7CC7F2", pillBorder:"#3E9DD4", pillText:"#12384E",
    accent:"#3E9DD4", icon:"📊",
  },
  slate: {
    cardBg:"#E2E8F0", cardBorder:"#CBD5E1", cardText:"#1E293B",
    pillBg:"#94A3B8", pillBorder:"#64748B", pillText:"#FFFFFF",
    accent:"#64748B", icon:"•",
  },
};
const CONTACT_STATUS_TONES = {
  blue: { bg:"rgba(255,255,255,0.92)", border:"rgba(219,226,240,0.95)", text:"#20263a", accent:"#ffffff", pillBg:"#F4F7FB", pillBorder:"#D6DFED", pillText:"#20263A" },
  yellow: { bg:"rgba(255,120,120,0.16)", border:"rgba(255,120,120,0.4)", text:"#ffb3b3", accent:"#FF7A7A", pillBg:"#F4A4AE", pillBorder:"#D96B79", pillText:"#4F1F28" },
  orange: { bg:"rgba(255,179,102,0.18)", border:"rgba(255,179,102,0.45)", text:"#ffd2a6", accent:"#FFB347", pillBg:"#F2D28B", pillBorder:"#D7B25D", pillText:"#4A3410" },
  red: { bg:"rgba(124,199,242,0.18)", border:"rgba(124,199,242,0.42)", text:"#c8e6ff", accent:"#7CC7F2", pillBg:"#A9D6FF", pillBorder:"#69AEEF", pillText:"#1E3550" },
  green: { bg:"rgba(129,199,132,0.18)", border:"rgba(129,199,132,0.45)", text:"#b9efbc", accent:"#81C784", pillBg:"#8FD3A4", pillBorder:"#54AF72", pillText:"#173824" },
  gray: { bg:"rgba(148,163,184,0.16)", border:"rgba(148,163,184,0.4)", text:"#d5deea", accent:"#94A3B8", pillBg:"#94A3B8", pillBorder:"#64748B", pillText:"#FFFFFF" },
};
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const INIT_SOURCES = ["Авито","Листовка","Яндекс","Рекомендация","2ГИС","Сайт"];
const INIT_SERVICES = [];
const MCOLORS = ["#4FC3F7","#AED581","#FFB74D","#F48FB1","#CE93D8","#80CBC4","#FFCC80","#EF9A9A","#A5D6A7","#90CAF9"];
const ck = (c,m,d,t) => `${c}|${m}|${d}|${t}`;
const dok = (c,m,d) => `off|${c}|${m}|${d}`;
const bok = (c,m,d,t) => `busy|${c}|${m}|${d}|${t}`;
const lok = (c,m,d,t) => `lock|${c}|${m}|${d}|${t}`;
const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const fd = (d) => { const n=["Вс","Пн","Вт","Ср","Чт","Пт","Сб"]; return `${d.getDate().toString().padStart(2,"0")}.${(d.getMonth()+1).toString().padStart(2,"0")} ${n[d.getDay()]}`; };
const daysIn = (y,m) => { const r=[]; for(let i=1;i<=new Date(y,m+1,0).getDate();i++) r.push(new Date(y,m,i)); return r; };
const formatMonthYearLabel = (month, year) => `${MONTHS[month] || ""} ${String(year).slice(-2)}`;
const fmtPh = (raw) => { const d=raw.replace(/\D/g,"").slice(0,10); if(!d)return""; let f="("+d.slice(0,3); if(d.length>3)f+=") "+d.slice(3,6); if(d.length>6)f+="-"+d.slice(6,8); if(d.length>8)f+="-"+d.slice(8,10); return f; };
const fmtTs = (v) => new Date(v).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const empKey = (e) => `${e.type}|${e.city || "all"}|${e.name}`;
const describeEmployee = (e) => e.type === "technician" ? `${EMPLOYEE_TYPES[e.type].label} · ${e.city}` : EMPLOYEE_TYPES[e.type].label;
const makeHistoryEntry = (actor, action, details) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, actor, action, details, at: new Date().toISOString() });
const CounterAlarmIcon = ({ color = "#ff9e7a" }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M5 1.75 3.2 3.5M11 1.75l1.8 1.75" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="8" cy="9" r="4.5" stroke={color} strokeWidth="1.6" />
    <path d="M8 6.8v2.5l1.8 1.1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CounterUserIcon = ({ color = "#b16cff" }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="5.1" r="2.3" fill={color} />
    <path d="M3.75 13.25c.42-2.05 2.14-3.35 4.25-3.35s3.83 1.3 4.25 3.35" fill={color} />
  </svg>
);
const OrderFilterIcon = ({ color = "#9fdfff" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2.25 3.25h11.5L9.5 8.1v4.1l-3 1.55V8.1L2.25 3.25Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);
const StatusEditIcon = ({ color = "#9fdfff" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 11.8 3.4 9.3 9.9 2.8a1.2 1.2 0 0 1 1.7 0l1.6 1.6a1.2 1.2 0 0 1 0 1.7l-6.5 6.5-2.5.4Z" stroke={color} strokeWidth="1.35" strokeLinejoin="round"/>
    <path d="M8.9 3.8 12.2 7.1" stroke={color} strokeWidth="1.35" strokeLinecap="round"/>
  </svg>
);
const APP_BG = "#0e1021";
const PANEL_BG = "#1a1f3a";
const PANEL_BG_ALT = "#202746";
const PANEL_BR = "1px solid rgba(132,146,191,0.18)";
const GLOW = "0 14px 36px rgba(6,10,28,0.35)";
const ONLINE_WINDOW_MS = 10 * 60 * 1000;
const SLOT_LOCK_TTL_MS = 5 * 60 * 1000;
const STATUS_TONE_KEYS = Object.keys(STATUS_TONES);

const ConfirmDialog = ({ title, onConfirm, onCancel, confirmLabel = "Да", cancelLabel = "Нет" }) => (
  <>
    <div onClick={onCancel} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.46)",zIndex:1500}} />
    <div style={{position:"fixed",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:"min(92vw, 360px)",borderRadius:18,background:"linear-gradient(180deg,#202746,#171c34)",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 24px 60px rgba(0,0,0,0.46)",padding:"20px 18px",zIndex:1501}}>
      <div style={{fontSize:18,fontWeight:800,color:"#f4f7ff",textAlign:"center"}}>{title}</div>
      <div style={{display:"flex",justifyContent:"center",gap:10,marginTop:18}}>
        <button type="button" onClick={onConfirm} className="tb" style={{minWidth:110,height:40,padding:"0 16px",borderRadius:12,border:"1px solid rgba(100,255,218,0.28)",background:"linear-gradient(135deg,#65ffdd,#18c5be)",color:"#0a0a23",fontSize:13,fontWeight:800,fontFamily:"inherit"}}>{confirmLabel}</button>
        <button type="button" onClick={onCancel} className="tb" style={{minWidth:110,height:40,padding:"0 16px",borderRadius:12,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.04)",color:"#dbe4ff",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>{cancelLabel}</button>
      </div>
    </div>
  </>
);
const getStatusTone = (statusItem) => STATUS_TONES[statusItem?.tone] || STATUS_TONES.teal;
const makeStatusMap = (statuses = INIT_STATUSES) => new Map((statuses || []).map((status, index) => [status.name, { ...status, sortOrder: Number(status.sortOrder ?? index) }]));
const defaultStatusName = (statuses = INIT_STATUSES) => statuses?.[0]?.name || "Новый";
const makeStatusShortLabel = (name = "") => {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "СТАТУС";
  const upper = trimmed.toUpperCase();
  if (upper.length <= 7) return upper;
  return `${upper.slice(0, 6)}.`;
};
const makeContactStatusMap = (statuses = INIT_CONTACT_STATUSES) => new Map((statuses || []).map((status, index) => [status.name, { ...status, sortOrder: Number(status.sortOrder ?? index) }]));
const getContactStatusTone = (statusItem) => CONTACT_STATUS_TONES[statusItem?.tone] || CONTACT_STATUS_TONES.gray;
const defaultContactStatusName = (statuses = INIT_CONTACT_STATUSES) => statuses.find((item) => item.isDefault)?.name || statuses?.[0]?.name || "Новый";
const normalizePhoneDigits = (value = "") => String(value || "").replace(/\D/g, "").slice(-10);
const formatContactPhone = (value = "") => {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  return `+7 ${fmtPh(digits)}`;
};
const toDateInputValue = (value) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dottedMatch = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dottedMatch) return `${dottedMatch[3]}-${dottedMatch[2]}-${dottedMatch[1]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return dstr(parsed);
};
const contactStatusMeta = (status, statusMap) => {
  const statusItem = statusMap?.get(status) || { name: status, tone: "gray" };
  const tone = getContactStatusTone(statusItem);
  return { ...tone, pillBg: tone.pillBg || tone.bg, pillBorder: tone.pillBorder || tone.border, pillText: tone.pillText || tone.text, name: statusItem.name || status };
};
const formatOrderAddressLine = (address = "", apartment = "", floor = "") => {
  const parts = [address];
  if (String(apartment || "").trim()) parts.push(`кв. ${String(apartment).trim()}`);
  if (String(floor || "").trim()) parts.push(`этаж ${String(floor).trim()}`);
  return parts.filter(Boolean).join(", ");
};
const formatDateRu = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ru-RU");
};
const formatDateTimeRu = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const escapeSpreadsheetValue = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const downloadExcelTable = ({ fileName, sheetName, columns, rows }) => {
  if (typeof window === "undefined") return;
  const headerHtml = columns.map((column) => `<th>${escapeSpreadsheetValue(column)}</th>`).join("");
  const bodyHtml = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeSpreadsheetValue(cell)}</td>`).join("")}</tr>`).join("");
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${escapeSpreadsheetValue(sheetName)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml>
        <style>
          table { border-collapse: collapse; font-family: Segoe UI, Arial, sans-serif; font-size: 12px; }
          th, td { border: 1px solid #cfd7ea; padding: 6px 8px; vertical-align: top; }
          th { background: #e9f2ff; font-weight: 700; }
        </style>
      </head>
      <body>
        <table>
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName.endsWith(".xls") ? fileName : `${fileName}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
const floatingCloseButtonStyle = {
  position: "absolute",
  top: 10,
  right: 10,
  width: 40,
  height: 40,
  borderRadius: 0,
  border: "none",
  background: "transparent",
  color: "#0a0a23",
  fontSize: 30,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundImage: "linear-gradient(135deg,#65ffdd,#18c5be)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  boxShadow: "none",
  lineHeight: 1,
  padding: 0,
  zIndex: 40,
};
const SERVICE_TYPE_META = {
  direction: { label: "Направление", icon: "📁" },
  subcategory: { label: "Поднаправление", icon: "🗂" },
  service: { label: "Услуга", icon: "🧰" },
};

const isEmployeeOnline = (employee) => {
  if (!employee?.lastSeen) return false;
  return (Date.now() - new Date(employee.lastSeen).getTime()) < ONLINE_WINDOW_MS;
};

const canViewTechnicianCards = (currentUser) => currentUser?.role === "admin" || Boolean(currentUser?.canViewTechnicianCards);
const canManageEmployees = (currentUser) => currentUser?.role === "admin";
const canDeleteOrders = (currentUser) => currentUser?.role === "admin";
const canEditOrders = (currentUser) => currentUser?.role === "admin" || currentUser?.role === "call_center";
const canSeeSummary = (currentUser) => currentUser?.role === "admin";
const maskTechnicianOrder = (order, currentUser) => {
  if (currentUser?.role !== "technician") return order;
  if (technicianVisibleStatuses.has(order?.status)) return order;
  return {
    ...order,
    phone: "",
    address: "",
  };
};

const parseDateStr = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const formatShortDate = (dateStr) => {
  const date = parseDateStr(dateStr);
  if (!date) return dateStr;
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const masterInitial = (name = "") => {
  const clean = String(name || "").trim();
  return clean ? clean[0].toUpperCase() : "•";
};

const statusMeta = (status, statusMap) => {
  const statusItem = statusMap?.get(status) || { name: status, shortLabel: makeStatusShortLabel(status), tone: "teal" };
  const tone = getStatusTone(statusItem);
  const isTechnicianConfirmed = statusItem.name === "Подтвержден мастером";
  const cardBg = isTechnicianConfirmed ? tone.pillBg : tone.cardBg;
  const cardBorder = isTechnicianConfirmed ? tone.pillBorder : tone.cardBorder;
  const cardText = isTechnicianConfirmed ? (tone.pillText || "#333") : (tone.cardText || "#333");
  const pillBg = isTechnicianConfirmed ? tone.cardBg : tone.pillBg;
  const pillBorder = isTechnicianConfirmed ? tone.cardBorder : tone.pillBorder;
  const pillText = isTechnicianConfirmed ? (tone.cardText || "#333") : (tone.pillText || "#333");
  return {
    icon: tone.icon || "•",
    left: tone.accent || "#90CAF9",
    accent: tone.accent || "#90CAF9",
    cardBg,
    cardBorder,
    cardText,
    pillBg,
    pillBorder,
    pillText,
    bg: cardBg,
    border: cardBorder,
    text: cardText,
    shortLabel: statusItem.shortLabel || makeStatusShortLabel(statusItem.name),
    name: statusItem.name || status,
  };
};

const buildServiceTree = (services) => {
  const map = new Map((services || []).map((node) => [node.id, { ...node, children: [] }]));
  const roots = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (nodes) => nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, "ru"));
  const walk = (nodes) => {
    sortNodes(nodes);
    nodes.forEach((node) => walk(node.children));
    return nodes;
  };
  return walk(roots);
};

const buildServiceIndex = (services) => {
  const tree = buildServiceTree(services || []);
  const byId = new Map();
  const childrenByParent = new Map();
  (services || []).forEach((node) => {
    byId.set(node.id, node);
    const parentKey = node.parentId || "__root__";
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(node);
  });
  childrenByParent.forEach((nodes) => {
    nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, "ru"));
  });
  return { tree, byId, childrenByParent };
};

const getServiceChildren = (serviceIndex, parentId, type) => {
  const list = serviceIndex.childrenByParent.get(parentId || "__root__") || [];
  return type ? list.filter((node) => node.type === type) : list;
};

const normalizeServiceItems = (items = [], serviceIndex) => items
  .filter((item) => item?.serviceId && serviceIndex.byId.has(item.serviceId))
  .map((item) => {
    const serviceNode = serviceIndex.byId.get(item.serviceId);
    const unitPriceRaw = item.unitPrice ?? item.price ?? serviceNode?.price ?? 0;
    const unitPrice = String(unitPriceRaw ?? "").replace(/[^\d]/g, "");
    const quantity = Math.max(1, Number(item.quantity || 1));
    return {
      serviceId: item.serviceId,
      name: item.name || serviceNode?.name || "",
      quantity,
      unitPrice,
      totalPrice: quantity * Number(unitPrice || 0),
    };
  });

const calculateServiceItemsTotal = (items = []) => items.reduce((sum, item) => (
  sum + Math.max(1, Number(item.quantity || 1)) * Number(item.unitPrice || 0)
), 0);

const summarizeServiceItems = (items = []) => items
  .filter((item) => item?.name && Number(item.quantity || 0) > 0)
  .map((item) => `${item.name} x${Math.max(1, Number(item.quantity || 1))}`)
  .join(", ");
const sumLineItems = (items = []) => items.reduce((sum, item) => (
  sum + Math.max(1, Number(item.quantity || 1)) * Number(item.unitPrice || item.price || 0)
), 0);
const normalizeCompletionItems = (items = []) => items
  .filter((item) => item?.name && String(item.name).trim())
  .map((item, index) => ({
    id: item.id || `complete-${index}-${String(item.name).trim().toLowerCase()}`,
    name: String(item.name).trim(),
    quantity: Math.max(1, Number(item.quantity || 1)),
    unitPrice: String(item.unitPrice ?? item.price ?? "").replace(/[^\d]/g, ""),
    serviceId: item.serviceId || null,
    officeLocked: Boolean(item.officeLocked),
  }));
const formatCompletionItemsText = (items = []) => normalizeCompletionItems(items)
  .map((item) => `${item.name} x${item.quantity}${Number(item.unitPrice || 0) ? ` (${Number(item.unitPrice)}₽)` : ""}`)
  .join(", ");
const stripTechnicianComment = (comment = "") => String(comment || "")
  .replace(/\n{0,2}Комментарий мастера:[\s\S]*$/u, "")
  .trim();
const stripReturnToOfficeComment = (comment = "") => String(comment || "")
  .replace(/\n{0,2}Возврат в офис(?: \([^)]+\))?:[\s\S]*$/u, "")
  .trim();
const mergeTechnicianComment = ({ baseComment = "", technicianComment = "", technicianName = "" }) => {
  const base = stripReturnToOfficeComment(stripTechnicianComment(baseComment));
  const tech = String(technicianComment || "").trim();
  if (!tech) return base;
  const authorSuffix = technicianName ? ` (${technicianName})` : "";
  return [base, `Комментарий мастера${authorSuffix}: ${tech}`].filter(Boolean).join("\n\n");
};
const mergeReturnToOfficeComment = ({ baseComment = "", reason = "", technicianName = "" }) => {
  const base = stripTechnicianComment(stripReturnToOfficeComment(baseComment));
  const trimmed = String(reason || "").trim();
  if (!trimmed) return base;
  const authorSuffix = technicianName ? ` (${technicianName})` : "";
  return [base, `Возврат в офис${authorSuffix}: ${trimmed}`].filter(Boolean).join("\n\n");
};
const technicianVisibleStatuses = new Set(["Подтверждён", "Подтвержден мастером", "Возврат в офис", "В пути", "На объекте", "Выполнен"]);
const orderNeedsTechnicianConfirmation = (order) => order?.status === "Подтверждён" && !order?.technicianConfirmedAt;
const orderConfirmedByTechnician = (order) => order?.status === "Подтвержден мастером" || Boolean(order?.technicianConfirmedAt);
const orderReturnedToOffice = (order) => order?.status === "Возврат в офис" || Boolean(order?.officeAttentionRequired);
const getOfficeAttentionIndicator = (order) => orderReturnedToOffice(order) ? "!" : "";
const SPECIAL_ADMIN_ORDER_STATUSES = new Set(["Подтвержден мастером", "Возврат в офис"]);
const statusCounterLabel = (statusName = "") => statusName === "Подтвержден мастером" ? "Мастер. подт." : statusName;
const canUserSelectOrderStatus = (currentUser, statusName) => {
  if (currentUser?.role === "admin") return true;
  if (currentUser?.role === "call_center" && SPECIAL_ADMIN_ORDER_STATUSES.has(statusName)) return false;
  return true;
};

const pluralizeOrders = (count) => {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} заказ`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} заказа`;
  return `${value} заказов`;
};

const pluralizeTechnicians = (count) => {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} мастер`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} мастера`;
  return `${value} мастеров`;
};

const formatScheduleEmployeeName = (name = "") => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  const [first, last] = parts;
  if (last.length <= 6) return `${first} ${last}`;
  return `${first} ${last.slice(0, 6)}.`;
};
const createDefaultWorkSchedule = () => Object.fromEntries(
  Array.from({ length: 7 }, (_, dayIdx) => [String(dayIdx), Array(TIMES.length).fill(true)]),
);
const normalizeWorkSchedule = (schedule) => {
  const base = createDefaultWorkSchedule();
  if (!schedule || typeof schedule !== "object") return base;
  return Object.fromEntries(
    Array.from({ length: 7 }, (_, dayIdx) => {
      const raw = schedule[dayIdx] ?? schedule[String(dayIdx)];
      if (!Array.isArray(raw)) return [String(dayIdx), base[String(dayIdx)].slice()];
      return [String(dayIdx), TIMES.map((_, slotIdx) => raw[slotIdx] !== false)];
    }),
  );
};
const getDayIndexFromDateStr = (dateStr = "") => {
  if (!dateStr) return null;
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getDay();
};
const isScheduleActiveFromDate = (employee, dateStr) => {
  const effectiveFrom = String(employee?.workScheduleEffectiveFrom || "").trim();
  if (!dateStr || !effectiveFrom) return true;
  return dateStr >= effectiveFrom;
};
const isEmployeeWorkingAt = (employee, dateStr, slotIdx) => {
  if (employee?.type !== "technician") return true;
  if (!isScheduleActiveFromDate(employee, dateStr)) return true;
  const dayIdx = getDayIndexFromDateStr(dateStr);
  if (dayIdx == null) return true;
  const schedule = normalizeWorkSchedule(employee?.workSchedule);
  return Boolean(schedule[String(dayIdx)]?.[slotIdx] ?? true);
};

const timeAgoRu = (value) => {
  if (!value) return "только что";
  const diffMs = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diffMs / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor(minutes / 60);
  const hoursRest = hours % 24;
  const minsRest = minutes % 60;
  const plural = (num, one, two, five) => {
    const n = Math.abs(num) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
  };
  if (days > 0) {
    if (hoursRest === 0 && minsRest === 0) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
    if (minsRest === 0) return `${days} ${plural(days, "день", "дня", "дней")} ${hoursRest} ${plural(hoursRest, "час", "часа", "часов")} назад`;
    return `${days} ${plural(days, "день", "дня", "дней")} ${hoursRest} ${plural(hoursRest, "час", "часа", "часов")} ${minsRest} ${plural(minsRest, "минута", "минуты", "минут")} назад`;
  }
  if (hours <= 0) {
    const mins = Math.max(1, minutes);
    return `${mins} ${plural(mins, "минута", "минуты", "минут")} назад`;
  }
  if (minsRest === 0) return `${hours} ${plural(hours, "час", "часа", "часов")} назад`;
  return `${hours} ${plural(hours, "час", "часа", "часов")} ${minsRest} ${plural(minsRest, "минута", "минуты", "минут")} назад`;
};

const slotLabel = (slotIdx) => `${String(WORKDAY_START_HOUR + Number(slotIdx || 0)).padStart(2, "0")}:00`;
const getOrderDurationSlots = (order) => Math.max(1, Number(order?.durationSlots ?? DEFAULT_ORDER_DURATION_SLOTS));
const getOrderEndLabel = (order) => slotLabel(Number(order?.timeIdx || 0) + getOrderDurationSlots(order));
const getOrderSlotIndices = (order) => {
  const start = Number(order?.timeIdx || 0);
  const duration = getOrderDurationSlots(order);
  return Array.from({ length: duration }, (_, idx) => start + idx).filter((idx) => idx >= 0 && idx < TIMES.length);
};
const getLockSlotIndices = (lock = {}) => {
  const start = Number(lock?.timeIdx || 0);
  const duration = Math.max(1, Number(lock?.durationSlots || 1));
  return Array.from({ length: duration }, (_, idx) => start + idx).filter((idx) => idx >= 0 && idx < TIMES.length);
};
const pruneExpiredSlotLocks = (slotLocks = {}) => Object.entries(slotLocks || {}).reduce((acc, [key, value]) => {
  const expiresAt = value?.expiresAt ? new Date(value.expiresAt).getTime() : 0;
  if (!expiresAt || expiresAt <= Date.now()) return acc;
  acc[key] = value;
  return acc;
}, {});
const orderCoversSlot = (order, slotIdx) => {
  const start = Number(order?.timeIdx || 0);
  const duration = getOrderDurationSlots(order);
  return slotIdx >= start && slotIdx < (start + duration);
};
const formatDurationLabel = (durationSlots) => {
  const value = Math.max(1, Number(durationSlots || 1));
  return `${value} ${value === 1 ? "час" : (value >= 2 && value <= 4 ? "часа" : "часов")}`;
};
const formatSelectedRange = (startIdx, durationSlots) => `${slotLabel(startIdx)}-${slotLabel(Number(startIdx) + Number(durationSlots || 1))}`;
const formatHistoryValue = (field, value, related = {}) => {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "dateStr") return formatShortDate(value);
  if (field === "timeIdx") return formatSelectedRange(Number(value), related.durationSlots);
  if (field === "durationSlots") return formatDurationLabel(value);
  return String(value);
};
const buildTransferHistoryDetails = (before = {}, after = {}) => (
  `Перенос с: ${before.master || "—"} ${formatShortDate(before.dateStr)} (${formatSelectedRange(before.timeIdx, before.durationSlots)})`
  + ` на ${after.master || "—"} ${formatShortDate(after.dateStr)} (${formatSelectedRange(after.timeIdx, after.durationSlots)})`
);
const formatOrderNumber = (value) => `№${value ?? 0}`;
const buildOrderLayoutMap = (orders, city, master, dateStr) => {
  const rowOrders = Object.entries(orders)
    .filter(([key]) => {
      const [c, m, d] = key.split("|");
      return c === city && m === master && d === dateStr;
    })
    .map(([key, order]) => ({ key, order }))
    .sort((a, b) => Number(a.order.timeIdx) - Number(b.order.timeIdx));
  const map = {};
  rowOrders.forEach(({ key, order }) => {
    const start = Number(order.timeIdx || 0);
    const duration = getOrderDurationSlots(order);
    map[start] = { type: "start", key, order, span: duration };
    for (let idx = start + 1; idx < start + duration; idx += 1) {
      map[idx] = { type: "covered", key, order, span: 0 };
    }
  });
  return map;
};

const LoginGate = ({ onLogin, pending, error }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#0a0a1a",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:380,maxWidth:"100%",background:"#1a1a2e",borderRadius:16,boxShadow:"0 25px 60px rgba(0,0,0,0.55)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"16px 20px"}}>
          <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>Вход в CRM</div>
          <div style={{fontSize:11,color:"#8892b0",marginTop:4}}>Войди под своей учётной записью Supabase</div>
        </div>
        <div style={{padding:18,display:"flex",flexDirection:"column",gap:12}}>
          <Fld label="Email" value={email} onChange={setEmail} placeholder="name@company.com" type="email" />
          <Fld label="Пароль" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
          {error && <div style={{padding:"10px 12px",borderRadius:10,background:"rgba(255,82,82,0.12)",border:"1px solid rgba(255,82,82,0.2)",color:"#ff8a80",fontSize:11}}>{error}</div>}
          <button onClick={()=>onLogin({ email, password })} disabled={!email || !password || pending} style={{padding:"11px 0",borderRadius:10,border:"none",background:(!email || !password || pending)?"#333":"linear-gradient(135deg,#64ffda,#00bfa5)",color:(!email || !password || pending)?"#666":"#0a0a23",fontWeight:800,fontSize:13,cursor:(!email || !password || pending)?"not-allowed":"pointer",fontFamily:"inherit"}}>{pending ? "Входим..." : "Войти"}</button>
        </div>
      </div>
    </div>
  );
};

const initOrders = () => {
  const o={};
  o[ck("Краснодар","Гриша","2026-04-02",0)]={price:"200",district:"Прик прав",name:"Людмила",phone:"9181204599",address:"ул. Николая Семашко, 15",comment:"",status:"Подтверждён",source:"Авито",workDone:"",workOrder:"Чистка внутреннего блока",city:"Краснодар",timeIdx:0,durationSlots:2};
  o[ck("Краснодар","Гриша","2026-04-02",2)]={price:"200",district:"Прик прав",name:"Антон",phone:"9189571724",address:"ул. Чайковского, 23",comment:"эт6",status:"Подтверждён",source:"Яндекс",workDone:"",workOrder:"Заправка фреоном",city:"Краснодар",timeIdx:2,durationSlots:2};
  o[ck("Краснодар","Эрик","2026-04-02",6)]={price:"200",district:"Центр",name:"Сергей",phone:"9184410824",address:"ул. Стасова, 182/1",comment:"",status:"Выполнен",source:"2ГИС",workDone:"Чистка внутреннего блока, замена фильтров",workOrder:"Чистка + диагностика",city:"Краснодар",timeIdx:6,durationSlots:2};
  o[ck("Краснодар","Артем","2026-04-03",0)]={price:"300",district:"Кар",name:"Ирина Петровна",phone:"9182154721",address:"Новознаменский, ул. Садовая",comment:"",status:"Подтверждён",source:"Рекомендация",workDone:"",workOrder:"Ремонт компрессора",city:"Краснодар",timeIdx:0,durationSlots:2};
  o[ck("Краснодар","Артем","2026-04-03",4)]={price:"200",district:"Центр",name:"Евгения",phone:"9189441266",address:"Гимназическая ул., 65",comment:"КОФЕ",status:"Отменён",source:"Авито",workDone:"",workOrder:"ТО кондиционера",city:"Краснодар",timeIdx:4,durationSlots:2};
  return o;
};

const PhoneInput = ({value,onChange,disabled,hasError=false}) => (
  <div style={{position:"relative"}}>
    <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:hasError?"#ff8f9a":"#64ffda",fontSize:13,fontWeight:700,fontFamily:"monospace",pointerEvents:"none"}}>+7</div>
    <input disabled={disabled} type="tel" value={fmtPh(value)} onChange={e=>onChange(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="(000) 000-00-00"
      style={{width:"100%",background:hasError?"rgba(255,107,107,0.09)":"rgba(255,255,255,0.06)",border:hasError?"1px solid rgba(255,107,107,0.52)":"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"9px 10px 9px 32px",color:disabled?"#8892b0":"#e6f1ff",fontSize:13,fontFamily:"monospace",outline:"none",boxSizing:"border-box",boxShadow:hasError?"0 0 0 1px rgba(255,107,107,0.08) inset":"none"}} />
  </div>
);

/* ====== YANDEX MAP WIDGET ====== */
const MapWidget = ({lat, lon, address, city, onClose, onSelect}) => {
  const [pin, setPin] = useState({lat, lon});
  const [addr, setAddr] = useState(address || "");
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(16);

  const mapUrl = `https://static-maps.yandex.ru/v1?ll=${pin.lon},${pin.lat}&z=${zoom}&size=650,450&l=map&pt=${pin.lon},${pin.lat},pm2rdm&lang=ru_RU&apikey=f3a0fe3a-b07e-4840-a1da-06f18b2ddf13`;

  const handleMapClick = async (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;
    const scale = Math.pow(2, zoom);
    const metersPerPixel = 156543.03392 * Math.cos(pin.lat * Math.PI / 180) / scale;
    const mapWidthM = 650 * metersPerPixel;
    const mapHeightM = 450 * metersPerPixel;
    const dLon = (clickX - 0.5) * mapWidthM / (111320 * Math.cos(pin.lat * Math.PI / 180));
    const dLat = -(clickY - 0.5) * mapHeightM / 111320;
    const newLat = pin.lat + dLat;
    const newLon = pin.lon + dLon;
    setPin({lat: newLat, lon: newLon});
    setLoading(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLon}&accept-language=ru&zoom=18`);
      const d = await r.json();
      if (d.display_name) {
        const parts = d.display_name.split(",");
        setAddr(parts.slice(0, Math.min(4, parts.length)).join(",").trim());
      }
    } catch {} finally { setLoading(false); }
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)"}} />
      <div style={{position:"relative",width:680,maxWidth:"95vw",borderRadius:14,overflow:"hidden",boxShadow:"0 25px 60px rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.1)",animation:"popIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",background:"#1a1a2e"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:13}}>📍 Карта — {city||"Россия"} <span style={{fontSize:10,color:"#8892b0",fontWeight:400}}>кликните для выбора адреса</span></span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{position:"relative",cursor:"crosshair"}} onClick={handleMapClick}>
          <img src={mapUrl} alt="Карта" style={{width:"100%",height:"auto",display:"block",minHeight:300}} onError={(e)=>{e.target.style.display="none";}} />
          <div style={{position:"absolute",right:8,top:8,display:"flex",flexDirection:"column",gap:2,zIndex:5}}>
            <button onClick={e=>{e.stopPropagation();setZoom(z=>Math.min(z+1,18));}} style={{width:32,height:32,borderRadius:6,border:"none",background:"rgba(255,255,255,0.9)",color:"#333",fontSize:18,fontWeight:700,cursor:"pointer"}}>+</button>
            <button onClick={e=>{e.stopPropagation();setZoom(z=>Math.max(z-1,8));}} style={{width:32,height:32,borderRadius:6,border:"none",background:"rgba(255,255,255,0.9)",color:"#333",fontSize:18,fontWeight:700,cursor:"pointer"}}>−</button>
          </div>
        </div>
        <div style={{padding:"10px 16px",display:"flex",gap:8,alignItems:"center",background:"#16213e"}}>
          <div style={{flex:1,padding:"8px 12px",background:"rgba(255,255,255,0.06)",borderRadius:8,color:addr?"#e6f1ff":"#5a6a8a",fontSize:12,minHeight:20}}>
            {loading?"⏳ Определяю адрес...":addr||"Кликните на карту для выбора адреса"}
          </div>
          <button disabled={!addr} onClick={e=>{e.stopPropagation();onSelect(addr,pin.lat,pin.lon);}} style={{padding:"8px 16px",borderRadius:8,border:"none",background:addr?"linear-gradient(135deg,#64ffda,#00bfa5)":"#333",color:addr?"#0a0a23":"#666",fontWeight:700,fontSize:12,cursor:addr?"pointer":"not-allowed",fontFamily:"inherit",whiteSpace:"nowrap"}}>✓ Выбрать</button>
        </div>
      </div>
    </div>
  );
};

/* ====== MULTI-PIN MAP MODAL ====== */
const YANDEX_PIN_COLORS = ["bl","gn","or","vv","lb","pn","yw","rd","dg","db"];
const hexToPinColor = (hex, idx = 0) => {
  const map = {"#4FC3F7":"lb","#AED581":"gn","#FFB74D":"or","#F48FB1":"pk","#CE93D8":"vv","#80CBC4":"gn","#FFCC80":"yw","#EF9A9A":"rd","#A5D6A7":"gn","#90CAF9":"bl"};
  return map[hex] || YANDEX_PIN_COLORS[idx % YANDEX_PIN_COLORS.length];
};
const fitBounds = (pins) => {
  if (!pins.length) return { lat: 45.03, lon: 38.97, zoom: 12 };
  if (pins.length === 1) return { lat: pins[0].lat, lon: pins[0].lon, zoom: 15 };
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  pins.forEach(p => { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon); });
  const cLat = (minLat + maxLat) / 2, cLon = (minLon + maxLon) / 2;
  const dLat = maxLat - minLat, dLon = maxLon - minLon;
  const span = Math.max(dLat, dLon, 0.005);
  const z = Math.max(8, Math.min(16, Math.round(Math.log2(360 / span) - 1)));
  return { lat: cLat, lon: cLon, zoom: z };
};
const geocodeAddress = async (address, city) => {
  try {
    const q = city ? `${city}, ${address}` : address;
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&accept-language=ru`);
    const d = await r.json();
    if (d[0]) return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) };
  } catch {}
  return null;
};
const latToMercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
const pinToPixelPercent = (pin, center, zoom) => {
  const scale = Math.pow(2, zoom);
  const worldPx = 256 * scale;
  const cx = (center.lon + 180) / 360 * worldPx;
  const cy = (0.5 - latToMercY(center.lat) / (2 * Math.PI)) * worldPx;
  const px = (pin.lon + 180) / 360 * worldPx;
  const py = (0.5 - latToMercY(pin.lat) / (2 * Math.PI)) * worldPx;
  return { x: ((px - cx) / 650 + 0.5) * 100, y: ((py - cy) / 450 + 0.5) * 100 };
};
const YMAPS_API_KEY = "f3a0fe3a-b07e-4840-a1da-06f18b2ddf13";
let ymapsLoadPromise = null;
const loadYmaps = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.ymaps && window.ymaps.Map) return Promise.resolve(window.ymaps);
  if (ymapsLoadPromise) return ymapsLoadPromise;
  ymapsLoadPromise = new Promise((resolve, reject) => {
    const finalize = () => {
      if (!window.ymaps || !window.ymaps.ready) { reject(new Error("ymaps missing")); return; }
      window.ymaps.ready(() => resolve(window.ymaps));
    };
    const existing = document.querySelector("script[data-ymaps-loader]");
    if (existing) {
      existing.addEventListener("load", finalize, { once: true });
      existing.addEventListener("error", () => { ymapsLoadPromise = null; reject(new Error("load failed")); }, { once: true });
      if (window.ymaps) finalize();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${YMAPS_API_KEY}&lang=ru_RU`;
    s.async = true;
    s.dataset.ymapsLoader = "1";
    s.onload = finalize;
    s.onerror = () => { ymapsLoadPromise = null; reject(new Error("load failed")); };
    document.head.appendChild(s);
  });
  return ymapsLoadPromise;
};

const MultiPinMapModal = ({ pins = [], homePins = [], title = "Карта заказов", onClose, highlightPin = null, cityCenter = null, selectedPinId = null, slotRows = null, onSlotSelect = null }) => {
  const [resolvedPins, setResolvedPins] = useState([]);
  const [geocoding, setGeocoding] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const listRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const placemarksRef = useRef([]);
  const didInitialFitRef = useRef(false);
  const slotsScrollRef = useRef(null);
  const [slotsScroll, setSlotsScroll] = useState({ hasOverflow: false, atBottom: true });
  const recomputeSlotsScroll = useCallback(() => {
    const el = slotsScrollRef.current;
    if (!el) { setSlotsScroll((prev) => (prev.hasOverflow || !prev.atBottom) ? { hasOverflow: false, atBottom: true } : prev); return; }
    const hasOverflow = el.scrollHeight - el.clientHeight > 1;
    const atBottom = !hasOverflow || Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 2;
    setSlotsScroll((prev) => (prev.hasOverflow === hasOverflow && prev.atBottom === atBottom) ? prev : { hasOverflow, atBottom });
  }, []);
  useEffect(() => { recomputeSlotsScroll(); }, [recomputeSlotsScroll, slotRows?.length]);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      setGeocoding(true);
      const results = [];
      for (const p of pins) {
        if (p.lat && p.lon) { results.push(p); continue; }
        if (!p.address) continue;
        const coords = await geocodeAddress(p.address, p.city || "");
        if (cancelled) return;
        if (coords) results.push({ ...p, lat: coords.lat, lon: coords.lon });
        else results.push(null);
      }
      if (!cancelled) { setResolvedPins(results.filter(Boolean)); setGeocoding(false); }
    };
    const withCoords = pins.filter(p => p.lat && p.lon);
    const needGeocode = pins.filter(p => !p.lat && !p.lon && p.address);
    if (needGeocode.length === 0) { setResolvedPins(withCoords); setGeocoding(false); }
    else { setResolvedPins(withCoords); resolve(); }
    return () => { cancelled = true; };
  }, [pins]);

  const orderPins = useMemo(() => (
    highlightPin ? [...resolvedPins, highlightPin] : resolvedPins
  ), [resolvedPins, highlightPin]);
  const allPins = useMemo(() => [...orderPins, ...homePins], [orderPins, homePins]);
  const defaultCenter = cityCenter || { lat: 45.03, lon: 38.97 };
  const pinIndexById = useMemo(() => new Map(orderPins.map((pin, index) => [pin.id, index])), [orderPins]);

  // Initialize ymaps once
  useEffect(() => {
    let cancelled = false;
    loadYmaps().then((ymaps) => {
      if (cancelled || !mapContainerRef.current) return;
      const map = new ymaps.Map(mapContainerRef.current, {
        center: [defaultCenter.lat, defaultCenter.lon],
        zoom: 12,
        controls: ["zoomControl"],
      }, {
        suppressMapOpenBlock: true,
        yandexMapDisablePoiInteractivity: true,
      });
      mapInstanceRef.current = map;
      setMapReady(true);
    }).catch((err) => {
      if (!cancelled) setMapError(String(err?.message || err));
    });
    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.destroy(); } catch {}
        mapInstanceRef.current = null;
      }
      placemarksRef.current = [];
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit bounds / focus once pins are resolved
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || didInitialFitRef.current) return;
    // Wait for the target pin to be resolved before choosing a focus
    if (selectedPinId) {
      const sel = orderPins.find(p => p.id === selectedPinId);
      if (sel && sel.lat && sel.lon) {
        didInitialFitRef.current = true;
        map.setCenter([sel.lat, sel.lon], 16, { duration: 250 });
        return;
      }
      if (geocoding) return; // wait a bit longer
    }
    if (highlightPin && highlightPin.lat && highlightPin.lon) {
      didInitialFitRef.current = true;
      map.setCenter([highlightPin.lat, highlightPin.lon], 16, { duration: 250 });
      return;
    }
    if (!allPins.length) return;
    didInitialFitRef.current = true;
    if (allPins.length === 1) {
      map.setCenter([allPins[0].lat, allPins[0].lon], 15, { duration: 250 });
    } else {
      const minLat = Math.min(...allPins.map(p => p.lat));
      const maxLat = Math.max(...allPins.map(p => p.lat));
      const minLon = Math.min(...allPins.map(p => p.lon));
      const maxLon = Math.max(...allPins.map(p => p.lon));
      map.setBounds([[minLat, minLon], [maxLat, maxLon]], { checkZoomRange: true, zoomMargin: 80, duration: 250 });
    }
  }, [mapReady, allPins, orderPins, highlightPin, selectedPinId, geocoding]);

  // Re-render placemarks when data or selection changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const ymaps = typeof window !== "undefined" ? window.ymaps : null;
    if (!map || !ymaps || !mapReady) return;
    placemarksRef.current.forEach(pm => { try { map.geoObjects.remove(pm); } catch {} });
    placemarksRef.current = [];

    const pinLayout = ymaps.templateLayoutFactory.createClass(
      '<div class="crm-pin-wrap" style="position:relative;width:$[properties.boxW]px;height:$[properties.boxH]px;transform:translate(-50%,-100%);pointer-events:auto;overflow:visible;">' +
        '{% if properties.isSel %}' +
          '<div class="crm-pin-shadow" style="position:absolute;left:50%;bottom:4px;width:$[properties.width]px;height:14px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,0.75) 0%,rgba(0,0,0,0.35) 45%,transparent 75%);animation:crmPinShadow 1.3s ease-in-out infinite;pointer-events:none;"></div>' +
          '<div class="crm-pin-halo" style="position:absolute;left:50%;bottom:-2px;width:$[properties.width]px;height:$[properties.width]px;transform:translate(-50%,50%);border-radius:50%;background:radial-gradient(circle,$[properties.color]aa 0%,$[properties.color]33 50%,transparent 72%);animation:crmPinHalo 1.3s ease-in-out infinite;pointer-events:none;"></div>' +
        '{% endif %}' +
        '<svg class="crm-pin-svg{% if properties.isSel %} crm-pin-bounce{% endif %}" width="$[properties.width]" height="$[properties.height]" viewBox="-2 -2 32 44" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:50%;top:0;transform:translateX(-50%);overflow:visible;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.55));">' +
          '<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="$[properties.color]" stroke="#ffffff" stroke-width="2.5"/>' +
          '<circle cx="14" cy="14" r="5" fill="#ffffff"/>' +
        '</svg>' +
      '</div>'
    );
    const homeLayout = ymaps.templateLayoutFactory.createClass(
      '<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:auto;"><div style="font-size:$[properties.size]px;line-height:1;filter:drop-shadow(0 0 4px $[properties.color]);">🏠</div><div style="font-size:9px;color:#fff;font-weight:800;text-shadow:0 0 3px #000,0 0 6px #000;white-space:nowrap;margin-top:-2px;">$[properties.name]</div></div>'
    );

    orderPins.forEach((p, i) => {
      const isSel = i === selectedIdx;
      const baseColor = p.highlight ? "#ff5252" : (p.legendColor || "#64ffda");
      const width = isSel ? 38 : 28;
      const height = isSel ? 54 : 40;
      const boxW = isSel ? Math.round(width * 2.2) : width + 6;
      const boxH = isSel ? Math.round(height * 1.6) : height + 6;
      const pm = new ymaps.Placemark([p.lat, p.lon], {
        hintContent: p.label || "Заказ",
        color: baseColor,
        width,
        height,
        boxW,
        boxH,
        isSel,
      }, {
        iconLayout: pinLayout,
        iconShape: { type: "Rectangle", coordinates: [[-boxW/2, -boxH], [boxW/2, 0]] },
        zIndex: isSel ? 1000 : (p.highlight ? 500 : 100),
        hasBalloon: false,
      });
      pm.events.add("click", (e) => {
        e.stopPropagation();
        setSelectedIdx(prev => prev === i ? null : i);
      });
      map.geoObjects.add(pm);
      placemarksRef.current.push(pm);
    });

    homePins.forEach((hp, i) => {
      const idx = orderPins.length + i;
      const isSel = idx === selectedIdx;
      const pm = new ymaps.Placemark([hp.lat, hp.lon], {
        hintContent: hp.label,
        color: hp.legendColor || "#64ffda",
        size: isSel ? 28 : 22,
        name: (hp.label || "").replace(/^🏠\s*/, ""),
      }, {
        iconLayout: homeLayout,
        iconShape: { type: "Rectangle", coordinates: [[-16, -34], [16, 0]] },
        zIndex: isSel ? 900 : 50,
        hasBalloon: false,
      });
      pm.events.add("click", (e) => {
        e.stopPropagation();
        setSelectedIdx(prev => prev === idx ? null : idx);
      });
      map.geoObjects.add(pm);
      placemarksRef.current.push(pm);
    });
  }, [mapReady, orderPins, homePins, selectedIdx]);

  // Auto-select by id (e.g. the currently edited order)
  useEffect(() => {
    if (selectedPinId == null) { setSelectedIdx(null); return; }
    const idx = orderPins.findIndex(p => p.id === selectedPinId);
    if (idx >= 0) setSelectedIdx(idx);
  }, [selectedPinId, orderPins]);

  // Pan to selected pin & scroll the list
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;
    if (selectedIdx == null || !allPins[selectedIdx]) return;
    const p = allPins[selectedIdx];
    try { map.panTo([p.lat, p.lon], { flying: true, duration: 300 }); } catch {}
    if (listRef.current) {
      const el = listRef.current.children[selectedIdx];
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedIdx, mapReady, allPins]);

  const handleListClick = (idx) => {
    if (!allPins[idx]) return;
    setSelectedIdx(prev => prev === idx ? null : idx);
  };

  const handleSlotPinClick = (pinId) => {
    if (!pinId || !pinIndexById.has(pinId)) return;
    const idx = pinIndexById.get(pinId);
    setSelectedIdx((prev) => prev === idx ? null : idx);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{`
        @keyframes crmPinBounce{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-7px)}}
        @keyframes crmPinShadow{0%,100%{opacity:0.95;transform:translateX(-50%) scale(1)}50%{opacity:0.55;transform:translateX(-50%) scale(0.55)}}
        @keyframes crmPinHalo{0%,100%{opacity:0.85;transform:translate(-50%,50%) scale(1)}50%{opacity:0.25;transform:translate(-50%,50%) scale(1.9)}}
        .crm-pin-bounce{animation:crmPinBounce 1.3s ease-in-out infinite;transform-origin:50% 100%}
        @keyframes crmSlotArrow{0%,100%{transform:translateY(0);opacity:0.7}50%{transform:translateY(3px);opacity:1}}
      `}</style>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)"}} />
      <div style={{position:"relative",width:1440,maxWidth:"95vw",height:"80vh",maxHeight:"80vh",display:"flex",flexDirection:"column",borderRadius:14,overflow:"hidden",boxShadow:"0 25px 60px rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.1)",animation:"popIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",background:"#1a1a2e"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:13}}>{title} <span style={{fontSize:10,color:"#8892b0",fontWeight:400}}>({allPins.length} {allPins.length === 1 ? "точка" : "точек"}{geocoding ? ", загружаю..." : ""})</span></span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {geocoding && <div style={{padding:"6px 16px",background:"rgba(100,255,218,0.08)",fontSize:11,color:"#64ffda",textAlign:"center"}}>⏳ Определяю координаты по адресам заказов...</div>}
        <div style={{position:"relative",background:"#1a1a2e",flex:"1 1 auto",minHeight:0,display:"flex"}}>
          <div ref={mapContainerRef} style={{width:"100%",height:"100%",minHeight:0,background:"#0a1a2e"}} />
          {!mapReady && !mapError && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#64ffda",fontSize:12,pointerEvents:"none"}}>⏳ Загрузка карты…</div>}
          {mapError && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#ff7a7a",fontSize:12,padding:20,textAlign:"center"}}>Не удалось загрузить карту: {mapError}</div>}
        </div>
        {slotRows?.length ? (
          <div style={{padding:"10px 16px 14px",background:"#1a1a2e",flex:"0 0 auto",overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
              <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>Свободные часы</div>
              <span style={{fontSize:10,color:"#64ffda",fontWeight:700,letterSpacing:0.3}}>Кол-во мастеров: {slotRows.length}</span>
            </div>
            {(() => {
              const rowsCount = slotRows.length;
              const visibleRows = Math.min(2, Math.max(1, rowsCount));
              const rowPx = 50;
              const headerPx = 34;
              const peekPx = rowsCount > visibleRows ? 28 : 4;
              const slotsMaxHeight = headerPx + visibleRows * rowPx + peekPx;
              const showScrollHint = slotsScroll.hasOverflow && !slotsScroll.atBottom;
              return (
            <div style={{position:"relative"}}>
            <div ref={slotsScrollRef} onScroll={recomputeSlotsScroll} style={{background:"rgba(255,255,255,0.03)",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)",overflow:"auto",maxHeight:slotsMaxHeight}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                <thead>
                  <tr>
                    <th style={{padding:"10px 10px",color:"#5a6a8a",textAlign:"left",position:"sticky",left:0,top:0,zIndex:3,background:"#1a1a2e",borderBottom:"1px solid rgba(255,255,255,0.06)",width:116,minWidth:116,fontSize:11}}>Мастер</th>
                    {TIMES.map((t)=><th key={t} style={{padding:"10px 4px",color:"#64ffda",textAlign:"center",position:"sticky",top:0,zIndex:2,background:"#1a1a2e",borderBottom:"1px solid rgba(255,255,255,0.06)",fontFamily:"monospace",fontSize:10,fontWeight:800,minWidth:78}}>{t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {slotRows.map(({ master, slots }) => (
                    <tr key={master.name}>
                      <td style={{padding:"10px 10px",color:"#ccd6f6",fontWeight:600,whiteSpace:"nowrap",position:"sticky",left:0,background:"#1a1a2e",width:116,minWidth:116,fontSize:11,overflow:"hidden",textOverflow:"ellipsis"}}>
                        <span style={{display:"inline-block",width:8,height:8,borderRadius:5,background:master.color,marginRight:8}} />
                        {master.name}
                      </td>
                      {slots.map((slot) => {
                        const selectedPin = slot.pinId && pinIndexById.get(slot.pinId) === selectedIdx;
                        return (
                          <td key={`${master.name}-${slot.ti}`} style={{padding:3,textAlign:"center"}}>
                            {slot.off ? (
                              <div style={{padding:"10px 4px",borderRadius:8,background:"rgba(255,255,255,0.03)",color:"#555",fontSize:9,minWidth:64}}>вых</div>
                            ) : slot.notWorking ? (
                              <div style={{padding:"10px 4px",borderRadius:8,background:"repeating-linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 5px, rgba(255,255,255,0.06) 5px, rgba(255,255,255,0.06) 10px)",border:"1px solid rgba(255,255,255,0.08)",color:"#6c748f",fontSize:9,fontWeight:700,minWidth:64}}>не раб</div>
                            ) : slot.free || slot.selected ? (
                              <div
                                onClick={() => {
                                  if (typeof onSlotSelect === "function" && slot.clickable) onSlotSelect(master.name, slot.ti);
                                }}
                                style={{padding:"10px 4px",borderRadius:8,background:slot.selected ? "rgba(100,255,218,0.3)" : "rgba(100,255,218,0.06)",border:slot.selected ? "2px solid #64ffda" : "1px solid rgba(100,255,218,0.15)",color:"#64ffda",fontWeight:800,fontSize:11,minWidth:64,cursor:slot.clickable ? "pointer" : "default"}}
                              >
                                ✓
                              </div>
                            ) : slot.pinId ? (
                              <div
                                onClick={() => handleSlotPinClick(slot.pinId)}
                                style={{padding:"10px 4px",borderRadius:8,background:selectedPin?"rgba(255,193,7,0.2)":"rgba(255,82,82,0.1)",border:selectedPin?"2px solid #ffd166":"1px solid rgba(255,82,82,0.25)",color:selectedPin?"#ffd166":"#ef5350",fontSize:10,fontWeight:selectedPin?800:700,minWidth:64,cursor:"pointer"}}
                              >
                                занят
                              </div>
                            ) : (
                              <div style={{padding:"10px 4px",borderRadius:8,background:"rgba(255,82,82,0.1)",color:"#ef5350",fontSize:10,fontWeight:700,minWidth:64}}>занят</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {showScrollHint && (
              <div style={{position:"absolute",left:0,right:0,bottom:0,height:30,pointerEvents:"none",background:"linear-gradient(to top, rgba(26,26,46,0.96) 10%, rgba(26,26,46,0))",borderBottomLeftRadius:12,borderBottomRightRadius:12,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:3}}>
                <span style={{fontSize:16,color:"#64ffda",fontWeight:900,lineHeight:1,animation:"crmSlotArrow 1.2s ease-in-out infinite",textShadow:"0 0 8px rgba(100,255,218,0.5)"}}>⌄</span>
              </div>
            )}
            </div>
              );
            })()}
          </div>
        ) : allPins.length > 0 && (
          <div ref={listRef} style={{padding:"8px 16px",background:"#1a1a2e",maxHeight:160,overflowY:"auto"}}>
            {allPins.map((p, i) => {
              const sel = i === selectedIdx;
              const clr = p.legendColor || "#999";
              return (
                <div key={i} onClick={() => handleListClick(i)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",marginBottom:2,borderRadius:8,background:sel?`${clr}22`:"transparent",border:sel?`1px solid ${clr}66`:"1px solid transparent",cursor:"pointer",transition:"all 0.15s ease"}}>
                  <div style={{width:sel?12:8,height:sel?12:8,borderRadius:6,background:clr,flexShrink:0,transition:"all 0.15s ease",boxShadow:sel?`0 0 10px ${clr}, 0 0 20px ${clr}88`:"none"}} />
                  <span style={{fontSize:11,color:sel?clr:p.highlight?"#ff9e9e":"#a9bbdc",fontWeight:sel||p.highlight?700:400}}>{p.label || "Заказ"}</span>
                  {p.address && <span style={{fontSize:10,color:sel?clr:"#6f82a8",marginLeft:"auto",textAlign:"right",maxWidth:"50%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.address}</span>}
                </div>
              );
            })}
          </div>
        )}
        {!allPins.length && !geocoding && <div style={{padding:"20px 16px",textAlign:"center",color:"#6f82a8",fontSize:12}}>Нет заказов с адресами для отображения</div>}
      </div>
    </div>
  );
};

/* ====== ADDRESS INPUT ====== */
const AddressInput = ({value, onChange, city, cities, onDistrictChange, onCoordsChange, disabled, initialCoords=null, hasError=false}) => {
  const [sugs, setSugs] = useState([]);
  const [show, setShow] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [coords, setCoords] = useState(initialCoords);
  const db = useRef(null);

  useEffect(() => {
    setCoords(initialCoords);
  }, [initialCoords?.lat, initialCoords?.lon]);

  const fetchSugs = useCallback((q) => {
    if (q.length < 2) { setSugs([]); return; }
    clearTimeout(db.current);
    db.current = setTimeout(async () => {
      try {
        const ci = cities[city];
        const fullQ = city ? `${city}, ${q}` : q;
        const bias = ci ? `&viewbox=${ci.lng-0.4},${ci.lat+0.3},${ci.lng+0.4},${ci.lat-0.3}&bounded=1` : "";
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQ)}&limit=6&accept-language=ru&addressdetails=1${bias}`);
        const data = await r.json();
        setSugs(data.map(x => {
          const a = x.address || {};
          const road = [a.road, a.house_number].filter(Boolean).join(", ");
          const dist = a.city_district || a.suburb || a.neighbourhood || "";
          return { display: road || x.display_name.split(",").slice(0,3).join(",").trim(), lat: parseFloat(x.lat), lon: parseFloat(x.lon), district: dist };
        }));
        setShow(true);
      } catch { setSugs([]); }
    }, 300);
  }, [city, cities]);

  const selectSug = (s) => {
    onChange(s.display);
    if (onDistrictChange && s.district) onDistrictChange(s.district);
    setCoords({lat:s.lat,lon:s.lon});
    if (onCoordsChange) onCoordsChange({ lat: s.lat, lng: s.lon });
    setShow(false);
  };

  const openMap = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (coords) { setMapOpen(true); return; }
    const ci = cities[city];
    if (value && value.length > 3) {
      try {
        const q = city ? `${city}, ${value}` : value;
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&accept-language=ru`);
        const d = await r.json();
        if (d[0]) { setCoords({lat:parseFloat(d[0].lat),lon:parseFloat(d[0].lon)}); setMapOpen(true); return; }
      } catch {}
    }
    if (ci) { setCoords({lat:ci.lat,lon:ci.lng}); } else { setCoords({lat:55.75,lon:37.62}); }
    setMapOpen(true);
  };

  return (
    <div style={{position:"relative"}}>
      <div style={{display:"flex",gap:4}}>
        <input disabled={disabled} value={value} onChange={e=>{onChange(e.target.value);fetchSugs(e.target.value);}} onFocus={()=>{if(sugs.length)setShow(true);}} onBlur={()=>setTimeout(()=>setShow(false),300)}
          placeholder={city?`Адрес в г. ${city}...`:"Введите адрес..."} style={{flex:1,background:hasError?"rgba(255,107,107,0.09)":"rgba(255,255,255,0.06)",border:hasError?"1px solid rgba(255,107,107,0.52)":"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"9px 10px",color:disabled?"#8892b0":"#e6f1ff",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",boxShadow:hasError?"0 0 0 1px rgba(255,107,107,0.08) inset":"none"}} />
        <button disabled={disabled} onClick={openMap} type="button" style={{width:36,height:36,borderRadius:8,background:hasError?"rgba(255,107,107,0.16)":"rgba(100,255,218,0.15)",border:hasError?"1px solid rgba(255,107,107,0.4)":"1px solid rgba(100,255,218,0.3)",color:disabled?"#66739b":hasError?"#ff8f9a":"#64ffda",fontSize:14,cursor:disabled?"not-allowed":"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}} title="Показать на карте">📍</button>
      </div>
      {!disabled && show && sugs.length > 0 && (
        <div style={{position:"absolute",top:"100%",left:0,right:40,zIndex:100,background:"#1e1e38",border:"1px solid rgba(100,255,218,0.2)",borderRadius:8,marginTop:4,maxHeight:200,overflow:"auto",boxShadow:"0 8px 30px rgba(0,0,0,0.5)"}}>
          {sugs.map((s,i) => (
            <div key={i} onMouseDown={e=>{e.preventDefault();selectSug(s);}} style={{padding:"9px 12px",fontSize:12,color:"#e6f1ff",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",gap:6}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(100,255,218,0.1)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:"#64ffda",flexShrink:0}}>📍</span><span>{s.display}</span>
              {s.district&&<span style={{color:"#8892b0",fontSize:10,marginLeft:"auto",whiteSpace:"nowrap"}}>({s.district})</span>}
            </div>
          ))}
        </div>
      )}
      {!disabled && mapOpen && coords && <MapWidget lat={coords.lat} lon={coords.lon} address={value} city={city} onClose={()=>setMapOpen(false)} onSelect={(a,lt,ln)=>{onChange(a);setCoords({lat:lt,lon:ln});if (onCoordsChange) onCoordsChange({ lat: lt, lng: ln });setMapOpen(false);}} />}
    </div>
  );
};

/* ====== SMALL COMPONENTS ====== */
const SourceSelect = ({value,onChange,sources,onAdd,disabled,hasError=false}) => {
  return (<div><div style={{fontSize:10,color:hasError?"#ff8f9a":"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Откуда узнали</div>
    <div style={{display:"flex",gap:4,flexWrap:"wrap",padding:hasError?6:0,borderRadius:10,border:hasError?"1px solid rgba(255,107,107,0.45)":"none",background:hasError?"rgba(255,107,107,0.06)":"transparent"}}>
      {sources.map(s=>(<button key={s} disabled={disabled} onClick={()=>onChange(s)} style={{padding:"4px 10px",borderRadius:7,fontSize:10,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",border:value===s?"2px solid #64ffda":hasError?"1px solid rgba(255,107,107,0.22)":"1px solid rgba(255,255,255,0.1)",background:value===s?"rgba(100,255,218,0.15)":hasError?"rgba(255,107,107,0.06)":"rgba(255,255,255,0.04)",color:value===s?"#64ffda":hasError?"#ffb0b9":"#8892b0",fontWeight:value===s?700:400}}>{s}</button>))}
    </div></div>);
};

const Fld = ({label,value,onChange,multiline,type,placeholder,disabled,inputMode,autoComplete="off",name,suppressAutofillIcon=false,disabledTextColor,hasError=false}) => (
  <div><div style={{fontSize:10,color:hasError?"#ff8f9a":"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
    {multiline?<textarea disabled={disabled} autoComplete={autoComplete} autoCorrect="off" autoCapitalize="off" spellCheck={false} value={value||""} onChange={e=>onChange(e.target.value)} rows={2} placeholder={placeholder} style={{width:"100%",background:hasError?"rgba(255,107,107,0.09)":"rgba(255,255,255,0.06)",border:hasError?"1px solid rgba(255,107,107,0.52)":"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"8px 10px",color:disabled?"#8892b0":"#e6f1ff",fontSize:12,resize:"vertical",fontFamily:"inherit",outline:"none",boxSizing:"border-box",boxShadow:hasError?"0 0 0 1px rgba(255,107,107,0.08) inset":"none"}} />
    :<input disabled={disabled} name={name} className={suppressAutofillIcon?"no-autofill-icon":undefined} type={type||"text"} inputMode={inputMode} autoComplete={autoComplete} autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-form-type="other" value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",height:38,background:hasError?"rgba(255,107,107,0.09)":"rgba(255,255,255,0.06)",border:hasError?"1px solid rgba(255,107,107,0.52)":"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"0 10px",color:disabled?(disabledTextColor || "#8892b0"):"#e6f1ff",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",appearance:"textfield",MozAppearance:"textfield",boxShadow:hasError?"0 0 0 1px rgba(255,107,107,0.08) inset":"none"}} />}</div>
);

const PickerField = ({label,value,onChange,options,disabled,placeholder="Выбери..."}) => {
  return (
    <div>
      <div style={{fontSize:10,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
      <CustomSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        menuZIndex={1400}
        triggerStyle={{ minHeight: 38, borderRadius: 10 }}
      />
    </div>
  );
};

const MonthYearPicker = ({ month, year, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const monthColRef = useRef(null);
  const yearColRef = useRef(null);
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = Math.min(currentYear - 1, year);
    const endYear = Math.max(currentYear + 3, year);
    return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  }, [year]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (wrapRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const monthNode = monthColRef.current?.querySelector(`[data-month="${month}"]`);
    const yearNode = yearColRef.current?.querySelector(`[data-year="${year}"]`);
    monthNode?.scrollIntoView({ block: "center" });
    yearNode?.scrollIntoView({ block: "center" });
  }, [month, year, open]);

  const applyMonth = (nextMonth) => onChange({ month: nextMonth, year });
  const applyYear = (nextYear) => onChange({ month, year: nextYear });

  return (
    <div ref={wrapRef} className="pill" style={{height:38,padding:"0 12px",borderRadius:12,display:"inline-flex",alignItems:"center",position:"relative"}}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="tb"
        style={{height:38,display:"inline-flex",alignItems:"center",gap:8,background:"transparent",border:"none",padding:0,color:"#9fb1d1",fontSize:12,fontWeight:600,fontFamily:"inherit"}}
      >
        <span>{formatMonthYearLabel(month, year)}</span>
        <span style={{fontSize:11,opacity:0.8}}>▾</span>
      </button>
      {open && (
        <div style={{position:"absolute",top:44,left:0,width:260,borderRadius:16,background:"linear-gradient(180deg,#1d2140,#15182e)",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 24px 60px rgba(0,0,0,0.42)",padding:12,zIndex:1300}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 88px",gap:10}}>
            <div>
              <div style={{fontSize:10,color:"#8fa1ca",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Месяц</div>
              <div ref={monthColRef} style={{maxHeight:260,overflowY:"auto",paddingRight:4}}>
                {MONTHS.map((monthName, monthIndex) => (
                  <button
                    key={monthName}
                    data-month={monthIndex}
                    type="button"
                    onClick={() => applyMonth(monthIndex)}
                    className="tb"
                    style={{width:"100%",height:34,padding:"0 10px",borderRadius:10,border:month===monthIndex?"1px solid rgba(120,230,255,0.42)":"1px solid transparent",background:month===monthIndex?"rgba(80,220,255,0.16)":"transparent",color:month===monthIndex?"#dff7ff":"#c7d4f6",fontSize:12,fontWeight:month===monthIndex?800:600,textAlign:"left",fontFamily:"inherit"}}
                  >
                    {monthName}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:10,color:"#8fa1ca",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Год</div>
              <div ref={yearColRef} style={{maxHeight:260,overflowY:"auto",paddingRight:4}}>
                {years.map((itemYear) => (
                  <button
                    key={itemYear}
                    data-year={itemYear}
                    type="button"
                    onClick={() => applyYear(itemYear)}
                    className="tb"
                    style={{width:"100%",height:34,padding:"0 10px",borderRadius:10,border:year===itemYear?"1px solid rgba(120,230,255,0.42)":"1px solid transparent",background:year===itemYear?"rgba(80,220,255,0.16)":"transparent",color:year===itemYear?"#dff7ff":"#c7d4f6",fontSize:12,fontWeight:year===itemYear?800:600,textAlign:"left",fontFamily:"inherit"}}
                  >
                    {String(itemYear).slice(-2)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DatePickerField = ({label,value,onChange,disabled}) => (
  <div>
    <div style={{fontSize:10,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
    <div style={{position:"relative"}}>
      <input
        disabled={disabled}
        type="date"
        value={toDateInputValue(value)}
        onChange={e=>onChange(fromDateInputValue(e.target.value))}
        style={{width:"100%",height:38,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"0 40px 0 12px",color:disabled?"#8892b0":"#e6f1ff",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",boxShadow:"none",appearance:"none",WebkitAppearance:"none",MozAppearance:"none"}}
      />
      <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#64ffda",fontSize:14,pointerEvents:"none"}}>🗓</span>
    </div>
  </div>
);

const ContactDateField = ({ label, value, onChange, error = false, placeholder = "Выбрать дату" }) => (
  <div>
    <div style={{fontSize:10,color:error?"#ff9ea8":"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
    <div style={{position:"relative"}}>
      <div
        style={{
          width:"100%",
          height:38,
          background:error?"rgba(255,107,107,0.08)":"rgba(255,255,255,0.06)",
          border:error?"1px solid rgba(255,107,107,0.45)":"1px solid rgba(255,255,255,0.1)",
          borderRadius:10,
          padding:"0 34px 0 10px",
          color:value ? "#e6f1ff" : "#5a6a8a",
          fontSize:12,
          fontFamily:"inherit",
          boxSizing:"border-box",
          display:"flex",
          alignItems:"center",
          overflow:"hidden",
          whiteSpace:"nowrap",
          textOverflow:"ellipsis",
        }}
      >
        {value ? formatDateRu(value) : placeholder}
      </div>
      <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:error?"#ff9ea8":"#64ffda",fontSize:14,pointerEvents:"none"}}>🗓</span>
      <input
        type="date"
        value={toDateInputValue(value)}
        onChange={(e)=>onChange(e.target.value)}
        style={{
          position:"absolute",
          inset:0,
          opacity:0,
          width:"100%",
          height:"100%",
          cursor:"pointer",
        }}
      />
    </div>
  </div>
);

const DateRangeField = ({ label, value, onChange, onReset }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [open]);
  const hasRange = Boolean(value?.from || value?.to);
  const summary = hasRange
    ? `${value?.from ? formatDateRu(value.from) : "С"} ${value?.to ? `— ${formatDateRu(value.to)}` : "— По дату"}`
    : "Все даты";
  return (
    <div ref={boxRef}>
      <div style={{fontSize:10,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
      <div style={{position:"relative"}}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          style={{width:"100%",height:38,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"0 40px 0 12px",color:hasRange ? "#e6f1ff" : "#8f9bb9",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",display:"flex",alignItems:"center",textAlign:"left",cursor:"pointer"}}
        >
          <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{summary}</span>
        </button>
        <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#8fa1ca",fontSize:12,pointerEvents:"none"}}>🗓</span>
        {open && (
          <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:50,width:320,padding:12,borderRadius:16,background:"linear-gradient(180deg,#242842,#1a1f35)",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 20px 40px rgba(0,0,0,0.35)",display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div style={{fontSize:10,color:"#8892b0",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>С</div>
                <input type="date" value={value?.from || ""} onChange={(e)=>onChange({ from: e.target.value, to: value?.to || "" })} style={{width:"100%",height:38,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"0 10px",color:"#e6f1ff",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",colorScheme:"dark"}} />
              </div>
              <div>
                <div style={{fontSize:10,color:"#8892b0",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>По</div>
                <input type="date" value={value?.to || ""} onChange={(e)=>onChange({ from: value?.from || "", to: e.target.value })} style={{width:"100%",height:38,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"0 10px",color:"#e6f1ff",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",colorScheme:"dark"}} />
              </div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"space-between"}}>
              {[
                { label: "Сегодня", from: dstr(new Date()), to: dstr(new Date()) },
                { label: "7 дней", from: dstr(new Date(Date.now() - 6 * 86400000)), to: dstr(new Date()) },
                { label: "30 дней", from: dstr(new Date(Date.now() - 29 * 86400000)), to: dstr(new Date()) },
              ].map((preset) => (
                <button key={preset.label} type="button" onClick={()=>onChange({ from: preset.from, to: preset.to })} style={{flex:1,height:32,borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#dbe4ff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{preset.label}</button>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
              <button type="button" onClick={()=>{onReset?.();setOpen(false);}} style={{height:34,padding:"0 12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.04)",color:"#dbe4ff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Сбросить</button>
              <button type="button" onClick={()=>setOpen(false)} style={{height:34,padding:"0 12px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#65ffdd,#18c5be)",color:"#0a0a23",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Готово</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CellPreview = ({data, statusMap, scheduleConflict = false}) => {
  const meta = statusMeta(data.status || "Новый", statusMap);
  const attention = getOfficeAttentionIndicator(data);
  const contentInset = attention ? 28 : 0;
  const statusLabel = data.status === "Подтвержден мастером" ? "Мастер. подт." : (data.status || "Новый");
  const statusFontSize = statusLabel.length > 20 ? 7.7 : 8.8;
  return (
  <div style={{fontSize:8,lineHeight:1.05,overflow:"hidden",height:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between",gap:3,color:scheduleConflict?"#c9ccd7":meta.cardText,textDecoration:scheduleConflict?"line-through":"none",opacity:scheduleConflict?0.86:1,filter:scheduleConflict?"grayscale(0.92)":"none"}}>
    <div style={{minHeight:0,overflow:"hidden"}}>
      <div style={{position:"relative",paddingLeft:contentInset}}>
        {attention && <span style={{position:"absolute",left:0,top:0,display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,borderRadius:999,background:"rgba(217,107,121,0.18)",border:"1px solid rgba(217,107,121,0.5)",color:"#B4243A",fontSize:12,fontWeight:900}}>{attention}</span>}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:6}}>
          <div style={{fontWeight:900,color:scheduleConflict?"#d4d7e3":meta.cardText,fontSize:10.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:"1 1 auto"}}>{data.district}</div>
          {!!data.displayPrice && <div style={{color:scheduleConflict?"#d4d7e3":meta.cardText,fontSize:10.5,fontWeight:900,whiteSpace:"nowrap",flexShrink:0,textAlign:"right",paddingRight:2}}>{data.displayPrice}₽</div>}
        </div>
        <div style={{display:"flex",alignItems:"baseline",gap:5,marginTop:2,minWidth:0}}>
          <div style={{color:scheduleConflict?"#d4d7e3":meta.cardText,fontWeight:500,fontSize:9.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:"1 1 auto"}}>{data.name}</div>
          <div style={{color:scheduleConflict?"rgba(212,215,227,0.84)":"rgba(30,53,80,0.72)",fontSize:8,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flexShrink:0,textAlign:"right",paddingRight:2}}>+7{fmtPh(data.phone)}</div>
        </div>
      </div>
    </div>
    <div style={{paddingTop:3,borderTop:`1px solid ${scheduleConflict ? "rgba(255,255,255,0.16)" : meta.cardBorder}`,display:"flex",gap:6,alignItems:"center",justifyContent:"space-between",flexWrap:"nowrap",minWidth:0,flexShrink:0}}>
      <span style={{padding:"3px 9px",borderRadius:8,background:scheduleConflict?"rgba(255,255,255,0.14)":"rgba(255,196,77,0.88)",color:scheduleConflict?"#eef2ff":"#2b2200",fontSize:8.8,fontWeight:900,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"32%"}}>{data.createdByName || "Без автора"}</span>
      <span style={{padding:"3px 12px",borderRadius:999,background:scheduleConflict?"rgba(255,255,255,0.12)":meta.pillBg,border:`1px solid ${scheduleConflict ? "rgba(255,255,255,0.24)" : meta.pillBorder}`,color:scheduleConflict?"#eef2ff":meta.pillText,fontSize:statusFontSize,fontWeight:900,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"68%",marginLeft:"auto",boxSizing:"border-box"}}>{statusLabel}</span>
    </div>
  </div>
  );
};

const parsePassportCard = (passport = "") => {
  const parts = passport.split(" || ").map((part) => part.trim()).filter(Boolean);
  const result = {
    seriesNumber: "",
    issuedBy: "",
    code: "",
    issuedAt: "",
  };
  parts.forEach((part) => {
    if (part.startsWith("Серия и номер:")) result.seriesNumber = part.replace("Серия и номер:", "").trim();
    if (part.startsWith("Кем выдан:")) result.issuedBy = part.replace("Кем выдан:", "").trim();
    if (part.startsWith("Код подразделения:")) result.code = part.replace("Код подразделения:", "").trim();
    if (part.startsWith("Когда выдан:")) result.issuedAt = part.replace("Когда выдан:", "").trim();
  });
  if (!parts.length && passport) result.seriesNumber = passport;
  return result;
};

const serializePassportCard = ({ seriesNumber, issuedBy, code, issuedAt }) => {
  const parts = [];
  if (seriesNumber?.trim()) parts.push(`Серия и номер: ${seriesNumber.trim()}`);
  if (issuedBy?.trim()) parts.push(`Кем выдан: ${issuedBy.trim()}`);
  if (code?.trim()) parts.push(`Код подразделения: ${code.trim()}`);
  if (issuedAt?.trim()) parts.push(`Когда выдан: ${issuedAt.trim()}`);
  return parts.join(" || ");
};

const fromDateInputValue = (value = "") => {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
};

const OrderHistoryPopup = ({entries,onClose}) => (
  <><div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1001}} />
  <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1002,width:420,maxWidth:"92vw",maxHeight:"78vh",background:"#141427",borderRadius:14,boxShadow:"0 25px 60px rgba(0,0,0,0.6)",overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
    <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{color:"#fff",fontWeight:700,fontSize:14}}>ℹ История изменений</span>
      <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
    </div>
    <div style={{padding:14,overflowY:"auto",maxHeight:"calc(78vh - 52px)",display:"flex",flexDirection:"column",gap:8}}>
      {entries.length ? entries.map((entry) => (
        <div key={entry.id} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,marginBottom:4}}>
            <div style={{color:"#64ffda",fontSize:11,fontWeight:700}}>{entry.actor}</div>
            <div style={{color:"#5a6a8a",fontSize:10,whiteSpace:"nowrap"}}>{fmtTs(entry.at)}</div>
          </div>
          <div style={{color:"#ccd6f6",fontSize:11,fontWeight:600,marginBottom:3}}>{entry.action}</div>
          <div style={{color:"#8892b0",fontSize:10,lineHeight:1.5,whiteSpace:"pre-line"}}>{entry.details}</div>
        </div>
      )) : <div style={{textAlign:"center",padding:"28px 16px",color:"#5a6a8a"}}>История пока пустая</div>}
    </div>
  </div></>
);

const PastDateOrderConfirmPopup = ({ today, targetDate, onConfirm, onClose }) => (
  <>
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1001}} />
    <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1002,width:460,maxWidth:"92vw",background:"#141427",borderRadius:16,boxShadow:"0 25px 60px rgba(0,0,0,0.6)",overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
      <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
        <span style={{color:"#fff",fontWeight:700,fontSize:14}}>Подтверждение даты заказа</span>
        <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </div>
      <div style={{padding:18,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{color:"#dbe4ff",fontSize:13,lineHeight:1.6}}>
          <div>Сегодня {formatShortDate(today)}.</div>
          <div>Вы пытаетесь создать заказ на {formatShortDate(targetDate)}.</div>
        </div>
        <div style={{color:"#ffd166",fontSize:12,fontWeight:700}}>Вы точно хотите создать заказ?</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onConfirm} style={{flex:1,padding:"11px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,#64ffda,#00bfa5)",color:"#0a0a23",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Создать</button>
          <button onClick={onClose} style={{flex:1,padding:"11px 0",borderRadius:12,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",color:"#ccd6f6",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Отменить</button>
        </div>
      </div>
    </div>
  </>
);

const EmployeeEditorPopup = ({employee,currentUser,cities,services,onSave,onClose,onProvisionAccess,onEditAccess,onOpenPermissions,saving,dimmed}) => {
  const isNew = !employee?.id;
  const readOnly = !canManageEmployees(currentUser);
  const isAdminViewer = currentUser?.role === "admin";
  const isLimitedCallCenterViewer = currentUser?.role === "call_center";
  const passportCard = parsePassportCard(employee?.passport || "");
  const serviceIndex = useMemo(() => buildServiceIndex(services || []), [services]);
  const directions = useMemo(() => getServiceChildren(serviceIndex, null, "direction"), [serviceIndex]);
  const [form,setForm]=useState({
    id: employee?.id || null,
    name: employee?.name || "",
    type: employee?.type || "",
    city: employee?.city || "",
    color: employee?.color || MCOLORS[0],
    phone: employee?.phone || "",
    login: employee?.authEmail || "",
    password: "",
    serviceScopes: employee?.serviceScopes || [],
    passportSeriesNumber: passportCard.seriesNumber,
    passportIssuedBy: passportCard.issuedBy,
    passportCode: passportCard.code,
    passportIssuedAt: passportCard.issuedAt,
    residenceAddress: employee?.residenceAddress || "",
    residenceLat: employee?.residenceLat ?? null,
    residenceLng: employee?.residenceLng ?? null,
    workSchedule: normalizeWorkSchedule(employee?.workSchedule),
    workScheduleEffectiveFrom: employee?.workScheduleEffectiveFrom || "",
  });
  const [scopeDraft,setScopeDraft]=useState({ directionId:"", subcategoryId:"" });
  useEffect(() => {
    const nextPassport = parsePassportCard(employee?.passport || "");
    setForm({
      id: employee?.id || null,
      name: employee?.name || "",
      type: employee?.type || "",
      city: employee?.city || "",
      color: employee?.color || MCOLORS[0],
      phone: employee?.phone || "",
      login: employee?.authEmail || "",
      password: "",
      serviceScopes: employee?.serviceScopes || [],
      passportSeriesNumber: nextPassport.seriesNumber,
      passportIssuedBy: nextPassport.issuedBy,
      passportCode: nextPassport.code,
      passportIssuedAt: nextPassport.issuedAt,
      residenceAddress: employee?.residenceAddress || "",
      residenceLat: employee?.residenceLat ?? null,
      residenceLng: employee?.residenceLng ?? null,
      workSchedule: normalizeWorkSchedule(employee?.workSchedule),
      workScheduleEffectiveFrom: employee?.workScheduleEffectiveFrom || "",
    });
    setScopeDraft({ directionId:"", subcategoryId:"" });
  }, [employee]);
  const canSave = !readOnly && !!form.name.trim() && !!form.type && (form.type !== "technician" || !!form.city);
  const entityLabel = form.type === "technician" ? "мастера" : "сотрудника";
  const skillDirectionOptions = useMemo(() => directions.map((node) => ({ value: node.id, label: node.name })), [directions]);
  const skillSubcategoryOptions = useMemo(() => (
    scopeDraft.directionId
      ? getServiceChildren(serviceIndex, scopeDraft.directionId, "subcategory").map((node) => ({ value: node.id, label: node.name }))
      : []
  ), [scopeDraft.directionId, serviceIndex]);
  const groupedScopes = useMemo(() => {
    const map = new Map();
    (form.serviceScopes || []).forEach((scope) => {
      if (!map.has(scope.directionId)) {
        map.set(scope.directionId, {
          directionId: scope.directionId,
          directionName: scope.directionName,
          subcategories: [],
        });
      }
      map.get(scope.directionId).subcategories.push(scope);
    });
    return Array.from(map.values()).map((group) => ({
      ...group,
      subcategories: group.subcategories.sort((a, b) => a.subcategoryName.localeCompare(b.subcategoryName, "ru")),
    }));
  }, [form.serviceScopes]);
  const addScope = () => {
    if (readOnly) return;
    const directionNode = serviceIndex.byId.get(scopeDraft.directionId);
    const subcategoryNode = serviceIndex.byId.get(scopeDraft.subcategoryId);
    if (!directionNode || !subcategoryNode) return;
    setForm((prev) => {
      if (prev.serviceScopes.some((scope) => scope.subcategoryId === subcategoryNode.id)) return prev;
      return {
        ...prev,
        serviceScopes: [...prev.serviceScopes, { directionId: directionNode.id, directionName: directionNode.name, subcategoryId: subcategoryNode.id, subcategoryName: subcategoryNode.name }],
      };
    });
    setScopeDraft((prev) => ({ ...prev, subcategoryId:"" }));
  };
  const removeScope = (subcategoryId) => {
    if (readOnly) return;
    setForm((prev) => ({ ...prev, serviceScopes: prev.serviceScopes.filter((scope) => scope.subcategoryId !== subcategoryId) }));
  };
  const removeDirectionScopes = (directionId) => {
    if (readOnly) return;
    setForm((prev) => ({ ...prev, serviceScopes: prev.serviceScopes.filter((scope) => scope.directionId !== directionId) }));
  };
  const toggleWorkSlot = (dayIdx, slotIdx) => {
    if (readOnly) return;
    setForm((prev) => {
      const nextSchedule = normalizeWorkSchedule(prev.workSchedule);
      nextSchedule[String(dayIdx)][slotIdx] = !nextSchedule[String(dayIdx)][slotIdx];
      return { ...prev, workSchedule: nextSchedule, workScheduleEffectiveFrom: dstr(new Date()) };
    });
  };
  const selectedScheduleDays = useMemo(() => {
    const schedule = normalizeWorkSchedule(form.workSchedule);
    return WEEKDAY_BUTTONS.filter((day) => (schedule[String(day.value)] || []).some(Boolean));
  }, [form.workSchedule]);
  const selectedScheduleRow = useMemo(() => {
    const schedule = normalizeWorkSchedule(form.workSchedule);
    if (!selectedScheduleDays.length) return Array(TIMES.length).fill(false);
    return TIMES.map((_, slotIdx) => selectedScheduleDays.every((day) => schedule[String(day.value)]?.[slotIdx] !== false));
  }, [form.workSchedule, selectedScheduleDays]);
  const toggleScheduleDay = (dayIdx) => {
    if (readOnly) return;
    setForm((prev) => {
      const nextSchedule = normalizeWorkSchedule(prev.workSchedule);
      const key = String(dayIdx);
      const isSelected = (nextSchedule[key] || []).some(Boolean);
      nextSchedule[key] = Array(TIMES.length).fill(!isSelected);
      return { ...prev, workSchedule: nextSchedule, workScheduleEffectiveFrom: dstr(new Date()) };
    });
  };
  const toggleSelectedScheduleSlot = (slotIdx) => {
    if (readOnly || !selectedScheduleDays.length) return;
    setForm((prev) => {
      const nextSchedule = normalizeWorkSchedule(prev.workSchedule);
      const shouldEnable = !selectedScheduleDays.every((day) => nextSchedule[String(day.value)]?.[slotIdx] !== false);
      selectedScheduleDays.forEach((day) => {
        nextSchedule[String(day.value)][slotIdx] = shouldEnable;
      });
      return { ...prev, workSchedule: nextSchedule, workScheduleEffectiveFrom: dstr(new Date()) };
    });
  };
  const cardWidth = isLimitedCallCenterViewer ? "min(96vw, 860px)" : "min(98vw, 1480px)";
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1003,backdropFilter:"blur(2px)"}} />
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1004,width:cardWidth,maxHeight:"92vh",background:"#141427",borderRadius:18,boxShadow:"0 25px 60px rgba(0,0,0,0.6)",overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)",filter:dimmed?"blur(2px) saturate(0.9)":"none",opacity:dimmed?0.82:1,pointerEvents:dimmed?"none":"auto",transition:"filter 0.18s ease, opacity 0.18s ease"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:14}}>{isNew ? "🧑‍💼 Новый сотрудник" : "Карточка сотрудника"}</span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{padding:18,display:"flex",flexDirection:"column",gap:14,overflowY:"auto",maxHeight:"calc(92vh - 58px)"}}>
          <div style={{display:"grid",gridTemplateColumns:isLimitedCallCenterViewer?"minmax(0,1fr)":"minmax(340px,420px) minmax(0,1fr)",gap:14,alignItems:"start"}}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{padding:"14px 16px",borderRadius:14,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",gap:10}}>
                <Fld label={`Имя ${entityLabel}`} disabled={readOnly} value={form.name} onChange={(value)=>setForm((prev)=>({...prev,name:value}))} placeholder="Иван Петров" />
                <div><div style={{fontSize:10,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Телефон {entityLabel}</div><PhoneInput disabled={readOnly} value={form.phone} onChange={(value)=>setForm((prev)=>({...prev,phone:value}))} /></div>
                {isAdminViewer && <PickerField label="Роль сотрудника" disabled={readOnly} value={form.type} onChange={(value)=>setForm((prev)=>({...prev,type:value,city:value==="technician"?prev.city:""}))} options={[{ value:"technician", label:"Мастер" }, { value:"call_center", label:"Колл-центр" }]} placeholder="Выберите роль" />}
                {form.type==="technician" && isAdminViewer && <PickerField label="Город" disabled={readOnly} value={form.city} onChange={(value)=>setForm((prev)=>({...prev,city:value}))} options={Object.keys(cities).map((cityName) => ({ value:cityName, label:cityName }))} placeholder="Выберите город" />}
                <div>
                  <div style={{fontSize:10,color:"#8892b0",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Цвет</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{MCOLORS.map(c=>(<div key={c} onClick={()=>{if(readOnly)return;setForm((prev)=>({...prev,color:c}));}} style={{width:26,height:26,borderRadius:7,background:c,cursor:readOnly?"default":"pointer",border:form.color===c?"3px solid #fff":"3px solid transparent"}} />))}</div>
                </div>
                {form.type === "technician" && isAdminViewer && (
                  <div>
                    <div style={{fontSize:10,color:"#8892b0",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Адрес фактического проживания</div>
                    <AddressInput
                      disabled={readOnly || !isAdminViewer}
                      value={form.residenceAddress}
                      onChange={(value)=>setForm((prev)=>({...prev,residenceAddress:value}))}
                      onCoordsChange={({ lat, lng })=>setForm((prev)=>({...prev,residenceLat:lat,residenceLng:lng}))}
                      city={form.city}
                      cities={cities}
                      initialCoords={form.residenceLat != null && form.residenceLng != null ? { lat: form.residenceLat, lon: form.residenceLng } : null}
                    />
                  </div>
                )}
                {!isNew && isAdminViewer && <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:isEmployeeOnline(employee) ? "#8ce99a" : "#ff8a80"}}>
                  <span style={{width:10,height:10,borderRadius:5,background:isEmployeeOnline(employee) ? "#4caf50" : "#ef5350",display:"inline-block"}} />
                  {isEmployeeOnline(employee) ? "в сети" : "не в сети"}
                </div>}
                {isLimitedCallCenterViewer && <div style={{fontSize:10,color:"#5a6a8a"}}>Колл-центр видит только имя, телефон и цвет сотрудника.</div>}
              </div>
              {isAdminViewer && (
                <div style={{padding:"14px 16px",borderRadius:14,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <Fld label={`Логин ${entityLabel}`} disabled disabledTextColor="#8899bd" value={form.login} onChange={(value)=>setForm((prev)=>({...prev,login:value}))} placeholder="Введите логин" />
                    <Fld label={`Пароль ${entityLabel}`} disabled disabledTextColor="#8899bd" value={form.password} onChange={(value)=>setForm((prev)=>({...prev,password:value}))} placeholder={employee?.authUserId ? "Пароль скрыт" : "Введите пароль"} type="password" />
                  </div>
                  <div style={{fontSize:10,color:"#5a6a8a"}}>{employee?.authUserId ? "Логин хранится в CRM. Пароль после выдачи доступа не показывается, его можно только изменить." : "Эти данные можно использовать для выдачи доступа в CRM."}</div>
                  {!isNew && <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {!employee?.authUserId && <button onClick={onProvisionAccess} style={{padding:"8px 10px",borderRadius:8,border:"1px solid rgba(100,255,218,0.2)",background:"rgba(100,255,218,0.08)",color:"#64ffda",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Выдать доступ</button>}
                    {employee?.authUserId && <button onClick={onEditAccess} style={{padding:"8px 10px",borderRadius:8,border:"1px solid rgba(121,134,203,0.22)",background:"rgba(121,134,203,0.10)",color:"#b9c4ff",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Изменить доступ</button>}
                    {form.type==="call_center" && <button onClick={onOpenPermissions} style={{padding:"8px 10px",borderRadius:8,border:"1px solid rgba(100,255,218,0.2)",background:"rgba(100,255,218,0.08)",color:"#64ffda",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Права доступа</button>}
                  </div>}
                  {employee?.authUserId && !isNew && <div style={{fontSize:10,color:"#8ce99a"}}>Доступ в CRM выдан</div>}
                  {!employee?.authUserId && !isNew && <div style={{fontSize:10,color:"#ffb4bf"}}>Доступ в CRM ещё не выдан</div>}
                </div>
              )}
            </div>

            {!isLimitedCallCenterViewer && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {isAdminViewer && (
                  <div style={{padding:"14px 16px",borderRadius:14,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>Паспортные данные</div>
                    <Fld label="Серия и номер" disabled={readOnly || !isAdminViewer} value={form.passportSeriesNumber} onChange={(value)=>setForm((prev)=>({...prev,passportSeriesNumber:value}))} placeholder="0000 000000" />
                    <Fld label="Кем выдан" disabled={readOnly || !isAdminViewer} value={form.passportIssuedBy} onChange={(value)=>setForm((prev)=>({...prev,passportIssuedBy:value}))} placeholder={"Отделением УФМС...\nРайон...\nГород..."} multiline />
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <Fld label="Код организации" disabled={readOnly || !isAdminViewer} value={form.passportCode} onChange={(value)=>setForm((prev)=>({...prev,passportCode:value}))} placeholder="000-000" />
                      <DatePickerField label="Когда выдан" disabled={readOnly || !isAdminViewer} value={form.passportIssuedAt} onChange={(value)=>setForm((prev)=>({...prev,passportIssuedAt:value}))} />
                    </div>
                  </div>
                )}
                {form.type==="technician" && isAdminViewer && <div style={{padding:"14px 16px",borderRadius:14,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:10,color:"#8892b0",marginBottom:2,textTransform:"uppercase",letterSpacing:1}}>Навыки</div>
                  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.1fr) minmax(0,1.1fr) 68px",gap:8,alignItems:"end"}}>
                    <PickerField label="Направление" disabled={readOnly || !skillDirectionOptions.length} value={scopeDraft.directionId} onChange={(value)=>setScopeDraft({ directionId:value, subcategoryId:"" })} options={skillDirectionOptions} placeholder="Выбрать" />
                    <PickerField label="Подуслуга" disabled={readOnly || !scopeDraft.directionId} value={scopeDraft.subcategoryId} onChange={(value)=>setScopeDraft((prev)=>({...prev,subcategoryId:value}))} options={skillSubcategoryOptions} placeholder="Выбрать" />
                    <button type="button" disabled={readOnly || !scopeDraft.directionId || !scopeDraft.subcategoryId} onClick={addScope} style={{height:38,width:"100%",padding:0,borderRadius:10,border:"1px solid rgba(100,255,218,0.22)",background:(!readOnly && scopeDraft.directionId && scopeDraft.subcategoryId)?"rgba(100,255,218,0.1)":"rgba(255,255,255,0.08)",color:(!readOnly && scopeDraft.directionId && scopeDraft.subcategoryId)?"#cffff3":"#8f9bb9",fontSize:11,fontWeight:800,cursor:(!readOnly && scopeDraft.directionId && scopeDraft.subcategoryId)?"pointer":"not-allowed",fontFamily:"inherit",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{color:(!readOnly && scopeDraft.directionId && scopeDraft.subcategoryId)?"#64ffda":"#8f9bb9",fontSize:24,lineHeight:1,fontWeight:900}}>+</span>
                    </button>
                  </div>
                  {form.serviceScopes.length ? <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {groupedScopes.map((group) => (
                      <div key={group.directionId} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:999,border:"1px solid rgba(100,255,218,0.22)",background:"rgba(100,255,218,0.1)",color:"#cffff3",fontSize:10,fontWeight:700}}>
                        <span>{group.directionName} / {group.subcategories.map((scope) => scope.subcategoryName).join(", ")}</span>
                        <button type="button" disabled={readOnly} onClick={() => removeDirectionScopes(group.directionId)} style={{background:"transparent",border:"none",padding:0,color:readOnly?"#7f92ba":"#64ffda",fontSize:12,cursor:readOnly?"not-allowed":"pointer",fontFamily:"inherit"}}>✕</button>
                      </div>
                    ))}
                  </div> : <div style={{fontSize:10,color:"#7f92ba"}}>Сначала выбери направление и подуслугу, потом добавь навык мастеру.</div>}
                  {!skillDirectionOptions.length && <div style={{fontSize:10,color:"#7f92ba"}}>Сначала добавь направления и типы работ в справочнике услуг.</div>}
                </div>}
                {form.type==="technician" && isAdminViewer && (
                  <div style={{padding:"14px 16px",borderRadius:14,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                      <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>График мастера</div>
                      <div style={{fontSize:10,color:"#7f92ba"}}>Выбери рабочие дни, затем отметь рабочие часы</div>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {WEEKDAY_BUTTONS.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          disabled={readOnly}
                          onClick={()=>toggleScheduleDay(day.value)}
                          style={{padding:"6px 12px",borderRadius:999,border:selectedScheduleDays.some((item)=>item.value===day.value)?"1px solid #64ffda":"1px solid rgba(255,255,255,0.1)",background:selectedScheduleDays.some((item)=>item.value===day.value)?"rgba(100,255,218,0.14)":"rgba(255,255,255,0.04)",color:selectedScheduleDays.some((item)=>item.value===day.value)?"#64ffda":"#9fb1d1",fontSize:11,fontWeight:700,cursor:readOnly?"default":"pointer",fontFamily:"inherit"}}
                        >{day.label}</button>
                      ))}
                    </div>
	                    <div style={{background:"rgba(7,12,34,0.45)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"12px 12px 14px",display:"flex",flexDirection:"column",gap:10}}>
	                      <div style={{display:"grid",gridTemplateColumns:`repeat(${TIMES.length}, minmax(0, 1fr))`,gap:6}}>
	                        {TIMES.map((time)=>(
	                          <div key={time} style={{padding:"4px 0 8px",textAlign:"center",color:"#64ffda",fontFamily:"monospace",fontWeight:800,fontSize:11}}>{time}</div>
	                        ))}
	                      </div>
	                      {selectedScheduleDays.length ? (
	                        <div style={{display:"grid",gridTemplateColumns:`repeat(${TIMES.length}, minmax(0, 1fr))`,gap:6}}>
	                          {TIMES.map((_, slotIdx) => {
	                            const working = selectedScheduleRow[slotIdx] !== false;
	                            return (
	                              <button
	                                key={slotIdx}
	                                type="button"
	                                disabled={readOnly}
	                                onClick={()=>toggleSelectedScheduleSlot(slotIdx)}
	                                style={{width:"100%",height:44,borderRadius:12,border:working?"1px solid rgba(100,255,218,0.2)":"1px solid rgba(255,255,255,0.08)",background:working?"rgba(100,255,218,0.08)":"repeating-linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 5px, rgba(255,255,255,0.06) 5px, rgba(255,255,255,0.06) 10px)",color:working?"#64ffda":"#6f7690",fontSize:10,fontWeight:800,cursor:readOnly?"default":"pointer",fontFamily:"inherit",padding:0}}
	                              >
	                                {working ? "✓" : "не раб"}
	                              </button>
	                            );
	                          })}
	                        </div>
	                      ) : (
	                        <div style={{padding:"12px 8px 4px",textAlign:"center",fontSize:11,color:"#7f92ba"}}>Выбери рабочие дни недели. Невыбранные дни считаются нерабочими.</div>
	                      )}
	                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button onClick={()=>{if(canSave)onSave({...form, passport: serializePassportCard({ seriesNumber: form.passportSeriesNumber, issuedBy: form.passportIssuedBy, code: form.passportCode, issuedAt: form.passportIssuedAt }), workSchedule: normalizeWorkSchedule(form.workSchedule)});}} disabled={!canSave || saving} style={{padding:"12px 0",borderRadius:12,border:"none",background:(canSave && !saving)?"linear-gradient(135deg,#64ffda,#00bfa5)":"#333",color:(canSave && !saving)?"#0a0a23":"#666",fontWeight:800,fontSize:14,cursor:(canSave && !saving)?"pointer":"not-allowed",fontFamily:"inherit"}}>{saving ? "Сохраняю..." : (isNew ? "+ Добавить" : "Сохранить карточку")}</button>
          {readOnly && <div style={{fontSize:10,color:"#5a6a8a",textAlign:"center"}}>Редактирование карточки доступно только админу</div>}
        </div>
      </div>
    </>
  );
};

const EmployeePermissionsPopup = ({employee,onSave,onClose,saving}) => {
  const [canViewCards,setCanViewCards] = useState(Boolean(employee?.canViewTechnicianCards));
  useEffect(()=>{ setCanViewCards(Boolean(employee?.canViewTechnicianCards)); },[employee]);
  if (!employee) return null;
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(3,6,19,0.62)",backdropFilter:"blur(7px)",zIndex:1010}} />
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1011,width:420,maxWidth:"92vw",background:"#141427",borderRadius:18,boxShadow:"0 25px 60px rgba(0,0,0,0.65)",overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:14}}>Права доступа</span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:12,color:"#ccd6f6",fontWeight:700}}>{employee.name}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,padding:"14px 16px",borderRadius:14,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div>
              <div style={{fontSize:12,color:"#e6f1ff",fontWeight:700,marginBottom:4}}>Доступ к просмотру карточек мастеров</div>
              <div style={{fontSize:10,color:"#8892b0",lineHeight:1.45}}>Если выключен, мастера скрыты в разделе сотрудников и их карточки не открываются.</div>
            </div>
            <button onClick={()=>setCanViewCards(v=>!v)} type="button" aria-pressed={canViewCards} style={{width:78,height:38,borderRadius:19,border:"1px solid rgba(255,255,255,0.12)",background:canViewCards?"linear-gradient(135deg,rgba(100,255,218,0.42),rgba(0,191,165,0.25))":"rgba(255,255,255,0.06)",padding:4,cursor:"pointer",position:"relative",flexShrink:0,transition:"background 0.2s ease, border-color 0.2s ease"}}>
              <span style={{position:"absolute",top:4,left:canViewCards?42:4,width:30,height:30,borderRadius:15,background:canViewCards?"#64ffda":"#94a0c9",boxShadow:canViewCards?"0 6px 18px rgba(100,255,218,0.35)":"0 6px 18px rgba(0,0,0,0.25)",transition:"left 0.2s ease, background 0.2s ease, box-shadow 0.2s ease"}} />
            </button>
          </div>
          <button onClick={()=>onSave(canViewCards)} disabled={saving} style={{padding:"10px 0",borderRadius:10,border:"none",background:saving?"#333":"linear-gradient(135deg,#64ffda,#00bfa5)",color:saving?"#666":"#0a0a23",fontWeight:800,fontSize:13,cursor:saving?"not-allowed":"pointer",fontFamily:"inherit"}}>{saving?"Сохраняю...":"Сохранить права"}</button>
        </div>
      </div>
    </>
  );
};

const EmployeeAccessPopup = ({employee,onSave,onClose,saving,error}) => {
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [showPassword,setShowPassword] = useState(true);
  useEffect(()=>{
    setEmail("");
    setPassword("");
    setShowPassword(true);
  },[employee]);
  if (!employee) return null;
  const canSubmit = !!email.trim() && !!password.trim() && !saving;
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(3,6,19,0.62)",backdropFilter:"blur(7px)",zIndex:1010}} />
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1011,width:380,maxWidth:"92vw",background:"#141427",borderRadius:14,boxShadow:"0 25px 60px rgba(0,0,0,0.6)",overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:14}}>Выдать доступ в CRM</span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:12,color:"#ccd6f6",fontWeight:700}}>{employee.name}</div>
          <Fld label="Email для входа" value={email} onChange={setEmail} placeholder="employee@company.com" />
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
              <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>Временный пароль</div>
              <button type="button" onClick={()=>setShowPassword((prev)=>!prev)} style={{background:"transparent",border:"none",color:"#64ffda",fontSize:10,fontWeight:700,cursor:"pointer",padding:0,fontFamily:"inherit"}}>{showPassword ? "Скрыть" : "Показать"}</button>
            </div>
            <Fld value={password} onChange={setPassword} placeholder="Минимум 6 символов" type={showPassword ? "text" : "password"} />
          </div>
          <div style={{fontSize:10,color:"#8892b0"}}>После создания логина сотрудник сможет войти в CRM под этим email и паролем.</div>
          {error && <div style={{padding:"9px 10px",borderRadius:10,background:"rgba(255,82,82,0.12)",border:"1px solid rgba(255,82,82,0.22)",color:"#ff9ea1",fontSize:11,lineHeight:1.4}}>{error}</div>}
          <button onClick={()=>onSave({ email, password })} disabled={!canSubmit} style={{padding:"10px 0",borderRadius:10,border:"none",background:canSubmit?"linear-gradient(135deg,#64ffda,#00bfa5)":"#333",color:canSubmit?"#0a0a23":"#666",fontWeight:800,fontSize:13,cursor:canSubmit?"pointer":"not-allowed",fontFamily:"inherit"}}>{saving?"Создаю доступ...":"Создать доступ"}</button>
        </div>
      </div>
    </>
  );
};

const EmployeeAccessEditPopup = ({employee,onSave,onClose,saving,error}) => {
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [showPassword,setShowPassword] = useState(true);
  useEffect(()=>{
    setEmail("");
    setPassword("");
    setShowPassword(true);
  },[employee]);
  if (!employee) return null;
  const canSubmit = (!saving) && (!!email.trim() || !!password.trim());
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(3,6,19,0.62)",backdropFilter:"blur(7px)",zIndex:1010}} />
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1011,width:380,maxWidth:"92vw",background:"#141427",borderRadius:14,boxShadow:"0 25px 60px rgba(0,0,0,0.6)",overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:14}}>Изменить доступ</span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:12,color:"#ccd6f6",fontWeight:700}}>{employee.name}</div>
          <Fld label="Новый email" value={email} onChange={setEmail} placeholder="Оставь пустым, если логин не меняется" />
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
              <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>Новый пароль</div>
              <button type="button" onClick={()=>setShowPassword((prev)=>!prev)} style={{background:"transparent",border:"none",color:"#64ffda",fontSize:10,fontWeight:700,cursor:"pointer",padding:0,fontFamily:"inherit"}}>{showPassword ? "Скрыть" : "Показать"}</button>
            </div>
            <Fld value={password} onChange={setPassword} placeholder="Оставь пустым, если пароль не меняется" type={showPassword ? "text" : "password"} />
          </div>
          <div style={{fontSize:10,color:"#8892b0"}}>Можно изменить только логин, только пароль или сразу оба поля.</div>
          {error && <div style={{padding:"9px 10px",borderRadius:10,background:"rgba(255,82,82,0.12)",border:"1px solid rgba(255,82,82,0.22)",color:"#ff9ea1",fontSize:11,lineHeight:1.4}}>{error}</div>}
          <button onClick={()=>onSave({ email, password })} disabled={!canSubmit} style={{padding:"10px 0",borderRadius:10,border:"none",background:canSubmit?"linear-gradient(135deg,#64ffda,#00bfa5)":"#333",color:canSubmit?"#0a0a23":"#666",fontWeight:800,fontSize:13,cursor:canSubmit?"pointer":"not-allowed",fontFamily:"inherit"}}>{saving?"Сохраняю...":"Обновить доступ"}</button>
        </div>
      </div>
    </>
  );
};

/* ====== ORDER FORM ====== */
const buildOrderFormState = (data, fixedSlot, defaultStatus = "Новый") => {
  const empty = {
    phone:"",
    name:"",
    city:fixedSlot?.city||"",
    district:"",
    address:"",
    apartment:"",
    floor:"",
    workOrder:"",
    comment:"",
    workDone:"",
    price:"",
    finalPrice:"",
    status:defaultStatus,
    source:"",
    master:fixedSlot?.master||"",
    dateStr:fixedSlot?.dateStr||"",
    timeIdx:fixedSlot?.timeIdx!=null?fixedSlot.timeIdx:"",
    durationSlots:fixedSlot?.durationSlots || NEW_ORDER_DURATION_SLOTS,
    serviceDirectionId:"",
    serviceDirectionName:"",
    serviceSubcategoryId:"",
    serviceSubcategoryName:"",
    serviceItems:[],
    lat:"",
    lng:"",
  };
  return data ? {...empty,...data} : empty;
};

const OrderForm = ({data,initialData,isNew,onSave,onClose,onDelete,sources,onAddSource,cities,employees,orders,dayOffs,busySlots,slotLocks,fixedSlot,historyEntries,currentUser,readOnly,allowDelete,orderNumber,services,statuses,onDraftSlotChange}) => {
  const currentRole = currentUser?.role || "";
  const lockOwnerId = currentUser?.id || currentUser?.name || "local-user";
  const statusMap = useMemo(() => makeStatusMap(statuses), [statuses]);
  const preferredStatus = useMemo(() => defaultStatusName(statuses), [statuses]);
  const formSeed = data || initialData || null;
  const [f,setF]=useState(buildOrderFormState(maskTechnicianOrder(formSeed, currentUser), fixedSlot, preferredStatus));
  const [showHistory,setShowHistory]=useState(false);
  const [savePending,setSavePending]=useState(false);
  const [deletePending,setDeletePending]=useState(false);
  const [isCompact,setIsCompact]=useState(typeof window !== "undefined" ? window.innerWidth < 1180 : false);
  const [showCityMap, setShowCityMap] = useState(false);
  const [slotMapOrder, setSlotMapOrder] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingServiceId, setPendingServiceId] = useState("");
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [preferredDurationSlots, setPreferredDurationSlots] = useState(() => Math.max(1, Number(buildOrderFormState(maskTechnicianOrder(formSeed, currentUser), fixedSlot, preferredStatus).durationSlots || NEW_ORDER_DURATION_SLOTS)));
  const [slotSelectionWarning, setSlotSelectionWarning] = useState("");
  const datePopoverRef = useRef(null);
  const dateButtonRef = useRef(null);
  const slotsScrollRef = useRef(null);
  const [slotsScrollState, setSlotsScrollState] = useState({ hasOverflow: false, atBottom: true });
  const serviceIndex = useMemo(() => buildServiceIndex(services || []), [services]);
  const directions = useMemo(() => getServiceChildren(serviceIndex, null, "direction"), [serviceIndex]);
  const subcategories = useMemo(() => (
    f.serviceDirectionId ? getServiceChildren(serviceIndex, f.serviceDirectionId, "subcategory") : []
  ), [f.serviceDirectionId, serviceIndex]);
  const availableServices = useMemo(() => (
    f.serviceSubcategoryId ? getServiceChildren(serviceIndex, f.serviceSubcategoryId, "service") : []
  ), [f.serviceSubcategoryId, serviceIndex]);
  const directionOptions = useMemo(() => directions.map((node) => ({ value:node.id, label:node.name })), [directions]);
  const subcategoryOptions = useMemo(() => subcategories.map((node) => ({ value:node.id, label:node.name })), [subcategories]);
  const normalizedServiceItems = useMemo(() => normalizeServiceItems(f.serviceItems || [], serviceIndex), [f.serviceItems, serviceIndex]);
  const selectedServiceIds = useMemo(() => new Set(normalizedServiceItems.map((item) => item.serviceId)), [normalizedServiceItems]);
  const remainingServiceOptions = useMemo(() => (
    availableServices
      .filter((serviceNode) => !selectedServiceIds.has(serviceNode.id))
      .map((serviceNode) => ({ value: serviceNode.id, label: `${serviceNode.name} · ${serviceNode.price || 0} ₽` }))
  ), [availableServices, selectedServiceIds]);
  const upd=(k,v)=>setF(p=>({...p,[k]:v}));
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};document.addEventListener("keydown",h);return()=>document.removeEventListener("keydown",h);},[onClose]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setIsCompact(window.innerWidth < 1180);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(()=>{
    const nextState = buildOrderFormState(maskTechnicianOrder(formSeed, currentUser), fixedSlot, preferredStatus);
    nextState.serviceItems = normalizeServiceItems(nextState.serviceItems, serviceIndex);
    if (!nextState.workOrder && nextState.serviceItems.length) {
      nextState.workOrder = summarizeServiceItems(nextState.serviceItems);
    }
    if (nextState.serviceItems.length) {
      nextState.price = String(calculateServiceItemsTotal(nextState.serviceItems));
    }
    setF(nextState);
    setShowHistory(false);
    setSavePending(false);
    setDeletePending(false);
    setShowDatePicker(false);
    setPendingServiceId("");
    setSaveAttempted(false);
    setPreferredDurationSlots(Math.max(1, Number(nextState.durationSlots || NEW_ORDER_DURATION_SLOTS)));
    setSlotSelectionWarning("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[currentRole, fixedSlot, formSeed, preferredStatus]);
  // Re-normalize serviceItems without clobbering other fields when catalog updates
  useEffect(() => {
    setF(prev => {
      if (!prev?.serviceItems?.length) return prev;
      const next = normalizeServiceItems(prev.serviceItems, serviceIndex);
      if (JSON.stringify(next) === JSON.stringify(prev.serviceItems)) return prev;
      return { ...prev, serviceItems: next };
    });
  }, [serviceIndex]);
  useEffect(() => {
    if (!slotSelectionWarning) return undefined;
    const timerId = window.setTimeout(() => setSlotSelectionWarning(""), 2200);
    return () => window.clearTimeout(timerId);
  }, [slotSelectionWarning]);
  useEffect(() => {
    if (!showDatePicker) return undefined;
    const closeOnOutside = (event) => {
      if (datePopoverRef.current?.contains(event.target) || dateButtonRef.current?.contains(event.target)) return;
      setShowDatePicker(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
    };
  }, [showDatePicker]);
  useEffect(() => {
    if (!statuses?.length) return;
    if (((data || initialData)?.status || f.status) && statusMap.has(f.status)) return;
    setF((prev) => ({ ...prev, status: preferredStatus }));
  }, [data, f.status, initialData, preferredStatus, statusMap, statuses]);
  useEffect(() => {
    if (!isNew || typeof onDraftSlotChange !== "function") return undefined;
    if (!f.city || !f.master || !f.dateStr || f.timeIdx === "" || f.timeIdx == null) {
      onDraftSlotChange(null);
      return undefined;
    }
    onDraftSlotChange({
      city: f.city,
      master: f.master,
      dateStr: f.dateStr,
      timeIdx: Number(f.timeIdx),
      durationSlots: Math.max(1, Number(f.durationSlots || 1)),
    });
    return undefined;
  }, [f.city, f.dateStr, f.durationSlots, f.master, f.timeIdx, isNew, onDraftSlotChange]);

  const cityMasters=useMemo(()=>{
    if (!f.serviceDirectionId || !f.serviceSubcategoryId) return [];
    const base = employees.filter((employee) => employee.type==="technician"&&employee.city===f.city);
    return base.filter((employee) => (employee.skillSubcategoryIds || []).includes(f.serviceSubcategoryId));
  },[employees,f.city,f.serviceDirectionId,f.serviceSubcategoryId]);
  const originalPlacement = useMemo(() => {
    if (!data) return null;
    return {
      city: data.city,
      master: data.master,
      dateStr: data.dateStr,
      timeIdx: Number(data.timeIdx),
      durationSlots: getOrderDurationSlots(data),
    };
  }, [data]);
  const currentRange = useMemo(() => {
    if (f.timeIdx === "" || f.timeIdx == null) return [];
    const start = Number(f.timeIdx);
    const duration = Math.max(1, Number(f.durationSlots || 1));
    return Array.from({ length: duration }, (_, idx) => start + idx).filter((idx) => idx >= 0 && idx < TIMES.length);
  }, [f.durationSlots, f.timeIdx]);
  const serviceItemsTotal = useMemo(() => calculateServiceItemsTotal(f.serviceItems || []), [f.serviceItems]);
  const serviceSummary = useMemo(() => summarizeServiceItems(f.serviceItems || []), [f.serviceItems]);

  useEffect(() => {
    if (!f.serviceDirectionId) return;
    if (directions.some((node) => node.id === f.serviceDirectionId)) return;
    setF((prev) => ({
      ...prev,
      serviceDirectionId: "",
      serviceDirectionName: "",
      serviceSubcategoryId: "",
      serviceSubcategoryName: "",
      serviceItems: [],
      price: "",
      workOrder: "",
    }));
  }, [directions, f.serviceDirectionId]);

  useEffect(() => {
    if (!f.serviceSubcategoryId) return;
    if (subcategories.some((node) => node.id === f.serviceSubcategoryId)) return;
    setF((prev) => ({
      ...prev,
      serviceSubcategoryId: "",
      serviceSubcategoryName: "",
      serviceItems: [],
      price: "",
      workOrder: "",
      master: "",
      timeIdx: "",
      durationSlots: NEW_ORDER_DURATION_SLOTS,
    }));
  }, [f.serviceSubcategoryId, subcategories]);

  useEffect(() => {
    setPendingServiceId("");
  }, [f.serviceDirectionId, f.serviceSubcategoryId]);

  useEffect(() => {
    if (!f.master) return;
    if (cityMasters.some((employee) => employee.name === f.master)) return;
    setF((prev) => ({ ...prev, master: "", timeIdx: "", durationSlots: NEW_ORDER_DURATION_SLOTS }));
  }, [cityMasters, f.master]);

  useEffect(() => {
    const validServiceIds = new Set(availableServices.map((node) => node.id));
    setF((prev) => {
      const nextItems = normalizeServiceItems(prev.serviceItems || [], serviceIndex)
        .filter((item) => validServiceIds.has(item.serviceId));
      const total = calculateServiceItemsTotal(nextItems);
      const nextWorkOrder = nextItems.length ? summarizeServiceItems(nextItems) : prev.workOrder;
      const changed = nextItems.length !== (prev.serviceItems || []).length
        || nextItems.some((item, idx) => {
          const prevItem = (prev.serviceItems || [])[idx];
          return !prevItem || prevItem.serviceId !== item.serviceId || Number(prevItem.quantity) !== Number(item.quantity) || String(prevItem.unitPrice) !== String(item.unitPrice);
        });
      if (!changed && String(prev.price || "") === String(total || "")) return prev;
      return {
        ...prev,
        serviceItems: nextItems,
        price: nextItems.length ? String(total) : prev.price,
        workOrder: nextItems.length ? nextWorkOrder : prev.workOrder,
      };
    });
  }, [availableServices, serviceIndex]);

  const selectDirection = (directionNode) => {
    if (readOnly) return;
    setF((prev) => ({
      ...prev,
      serviceDirectionId: directionNode.id,
      serviceDirectionName: directionNode.name,
      serviceSubcategoryId: "",
      serviceSubcategoryName: "",
      serviceItems: [],
      price: "",
      workOrder: "",
      master: "",
      timeIdx: "",
      durationSlots: NEW_ORDER_DURATION_SLOTS,
    }));
  };

  const selectSubcategory = (subcategoryNode) => {
    if (readOnly) return;
    setF((prev) => ({
      ...prev,
      serviceSubcategoryId: subcategoryNode.id,
      serviceSubcategoryName: subcategoryNode.name,
      serviceItems: [],
      price: "",
      workOrder: "",
      master: "",
      timeIdx: "",
      durationSlots: NEW_ORDER_DURATION_SLOTS,
    }));
  };
  const selectDirectionById = (directionId) => {
    const directionNode = serviceIndex.byId.get(directionId);
    if (!directionNode) return;
    selectDirection(directionNode);
  };
  const selectSubcategoryById = (subcategoryId) => {
    const subcategoryNode = serviceIndex.byId.get(subcategoryId);
    if (!subcategoryNode) return;
    selectSubcategory(subcategoryNode);
  };

  const addServiceItem = (serviceId) => {
    if (readOnly) return;
    const serviceNode = serviceIndex.byId.get(serviceId);
    if (!serviceNode) return;
    setPendingServiceId("");
    setF((prev) => {
      const exists = (prev.serviceItems || []).some((item) => item.serviceId === serviceNode.id);
      if (exists) return prev;
      const nextItems = [...normalizeServiceItems(prev.serviceItems || [], serviceIndex), {
        serviceId: serviceNode.id,
        name: serviceNode.name,
        quantity: 1,
        unitPrice: String(serviceNode.price || 0),
        totalPrice: Number(serviceNode.price || 0),
      }];
      const total = calculateServiceItemsTotal(nextItems);
      return {
        ...prev,
        serviceItems: nextItems,
        price: nextItems.length ? String(total) : "",
        workOrder: nextItems.length ? summarizeServiceItems(nextItems) : "",
      };
    });
  };

  const removeServiceItem = (serviceId) => {
    if (readOnly) return;
    setF((prev) => {
      const nextItems = (prev.serviceItems || []).filter((item) => item.serviceId !== serviceId);
      const total = calculateServiceItemsTotal(nextItems);
      return {
        ...prev,
        serviceItems: nextItems,
        price: nextItems.length ? String(total) : "",
        workOrder: nextItems.length ? summarizeServiceItems(nextItems) : "",
      };
    });
  };

  const updateServiceQuantity = (serviceId, delta) => {
    if (readOnly) return;
    setF((prev) => {
      const nextItems = normalizeServiceItems(prev.serviceItems || [], serviceIndex).flatMap((item) => {
        if (item.serviceId !== serviceId) return [item];
        const nextQuantity = Math.max(1, Number(item.quantity || 1) + delta);
        return [{ ...item, quantity: nextQuantity, totalPrice: nextQuantity * Number(item.unitPrice || 0) }];
      });
      const total = calculateServiceItemsTotal(nextItems);
      return {
        ...prev,
        serviceItems: nextItems,
        price: nextItems.length ? String(total) : "",
        workOrder: nextItems.length ? summarizeServiceItems(nextItems) : "",
      };
    });
  };
  const freeSlots=useMemo(()=>{
    if(!f.city||!f.dateStr)return[];
    const weekdayIdx = getDayIndexFromDateStr(f.dateStr);
    return cityMasters.map((m) => {
      const off = !!dayOffs[dok(f.city,m.name,f.dateStr)];
      const scheduleActive = isScheduleActiveFromDate(m, f.dateStr);
      const workSchedule = normalizeWorkSchedule(m.workSchedule);
      const rowOrders = Object.values(orders)
        .filter((order) => order.city === f.city && order.master === m.name && order.dateStr === f.dateStr && order._id !== data?._id);
      return {
        master:m,
        slots:TIMES.map((t,ti)=>{
          const order = rowOrders.find((item) => orderCoversSlot(item, ti));
          const lock = slotLocks?.[lok(f.city,m.name,f.dateStr,ti)] || null;
          const ownLock = lock && lock.employeeId === lockOwnerId;
          const working = !scheduleActive || weekdayIdx == null ? true : Boolean(workSchedule[String(weekdayIdx)]?.[ti] ?? true);
          return {
            ti,
            time:t,
            free: working && !off && !order && !busySlots[bok(f.city,m.name,f.dateStr,ti)] && (!lock || ownLock),
            busy: !!busySlots[bok(f.city,m.name,f.dateStr,ti)],
            lock,
            ownLock,
            off,
            notWorking: !working,
            order,
          };
        }),
      };
    });
  },[busySlots, f.city,f.dateStr,cityMasters,lockOwnerId,orders,dayOffs,slotLocks]);

  const applySlotSelection = (masterName, slotIdx) => {
    if (readOnly) return;
    const masterRow = freeSlots.find((item) => item.master.name === masterName);
    const isFreeCell = (idx) => !!masterRow?.slots?.[idx]?.free;

    // No selection yet OR different master → start fresh with 1 hour on this cell
    if (f.master !== masterName || f.timeIdx === "" || f.timeIdx == null) {
      if (!isFreeCell(slotIdx)) {
        setSlotSelectionWarning("Эта ячейка недоступна.");
        return;
      }
      setPreferredDurationSlots(1);
      setSlotSelectionWarning("");
      setF((prev) => ({ ...prev, master: masterName, timeIdx: slotIdx, durationSlots: 1 }));
      return;
    }

    const start = Number(f.timeIdx);
    const duration = Math.max(1, Number(f.durationSlots || 1));
    const end = start + duration - 1;

    // Click on first selected cell → shrink from start (or deselect if duration was 1)
    if (slotIdx === start) {
      if (duration === 1) {
        setSlotSelectionWarning("");
        setF((prev) => ({ ...prev, timeIdx: "", durationSlots: 1 }));
        setPreferredDurationSlots(1);
        return;
      }
      setSlotSelectionWarning("");
      setF((prev) => ({ ...prev, timeIdx: start + 1, durationSlots: duration - 1 }));
      setPreferredDurationSlots(duration - 1);
      return;
    }

    // Click on last selected cell → shrink from end
    if (slotIdx === end) {
      setSlotSelectionWarning("");
      setF((prev) => ({ ...prev, durationSlots: duration - 1 }));
      setPreferredDurationSlots(duration - 1);
      return;
    }

    // Click inside middle of selection → warn, do nothing
    if (slotIdx > start && slotIdx < end) {
      setSlotSelectionWarning("Снимай часы только с краёв выделения.");
      return;
    }

    // Click immediately left of selection → extend left by 1 hour
    if (slotIdx === start - 1) {
      if (!isFreeCell(slotIdx)) {
        setSlotSelectionWarning("Ячейка недоступна.");
        return;
      }
      setSlotSelectionWarning("");
      setF((prev) => ({ ...prev, timeIdx: slotIdx, durationSlots: duration + 1 }));
      setPreferredDurationSlots(duration + 1);
      return;
    }

    // Click immediately right of selection → extend right by 1 hour
    if (slotIdx === end + 1) {
      if (slotIdx >= TIMES.length) {
        setSlotSelectionWarning("Окно выходит за рабочий день.");
        return;
      }
      if (!isFreeCell(slotIdx)) {
        setSlotSelectionWarning("Ячейка недоступна.");
        return;
      }
      setSlotSelectionWarning("");
      setF((prev) => ({ ...prev, durationSlots: duration + 1 }));
      setPreferredDurationSlots(duration + 1);
      return;
    }

    // Click far from selection → restart with 1 hour on this cell
    if (!isFreeCell(slotIdx)) {
      setSlotSelectionWarning("Эта ячейка недоступна.");
      return;
    }
    setSlotSelectionWarning("");
    setF((prev) => ({ ...prev, master: masterName, timeIdx: slotIdx, durationSlots: 1 }));
    setPreferredDurationSlots(1);
  };

  const recomputeSlotsScrollState = useCallback(() => {
    const el = slotsScrollRef.current;
    if (!el) { setSlotsScrollState((prev) => (prev.hasOverflow || !prev.atBottom) ? { hasOverflow: false, atBottom: true } : prev); return; }
    const hasOverflow = el.scrollHeight - el.clientHeight > 1;
    const atBottom = !hasOverflow || Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 2;
    setSlotsScrollState((prev) => (prev.hasOverflow === hasOverflow && prev.atBottom === atBottom) ? prev : { hasOverflow, atBottom });
  }, []);
  useEffect(() => {
    recomputeSlotsScrollState();
  }, [recomputeSlotsScrollState, freeSlots.length, f.dateStr, f.city]);

  const requiredOrderErrors = useMemo(() => ({
    phone: normalizePhoneDigits(f.phone).length < 10,
    name: !String(f.name || "").trim(),
    city: !String(f.city || "").trim(),
    address: !String(f.address || "").trim(),
    date: !String(f.dateStr || "").trim(),
    source: !String(f.source || "").trim(),
  }), [f.address, f.city, f.dateStr, f.name, f.phone, f.source]);
  const hasRequiredOrderErrors = Object.values(requiredOrderErrors).some(Boolean);
  const canSave = !savePending && !hasRequiredOrderErrors && !!f.master && f.timeIdx!=="" && !!f.dateStr && !!f.city && !!f.serviceDirectionId && !!f.serviceSubcategoryId && Number(f.durationSlots) > 0;
  const scheduleChanged = useMemo(() => {
    if (!originalPlacement) return false;
    return (
      originalPlacement.city !== f.city ||
      originalPlacement.master !== f.master ||
      originalPlacement.dateStr !== f.dateStr ||
      Number(originalPlacement.timeIdx) !== Number(f.timeIdx) ||
      Number(originalPlacement.durationSlots) !== Number(f.durationSlots)
    );
  }, [f.city, f.dateStr, f.durationSlots, f.master, f.timeIdx, originalPlacement]);
  const statusHistoryMeta = useMemo(() => {
    const entries = historyEntries || [];
    const explicitStatusEntry = entries.find((entry) => `${entry.details || ""}`.includes("Статус:"));
    const fallbackEntry = entries[0] || null;
    const entry = explicitStatusEntry || fallbackEntry;
    return {
      status: f.status || data?.status || preferredStatus,
      changedAt: entry?.at || data?._createdAt || null,
    };
  }, [data?._createdAt, data?.status, f.status, historyEntries, preferredStatus]);
  const save=async ()=>{
    if(readOnly)return;
    setSaveAttempted(true);
    if(!canSave)return;
    setSavePending(true);
    try{
      await onSave(ck(f.city,f.master,f.dateStr,f.timeIdx),{...f,timeIdx:Number(f.timeIdx),durationSlots:Math.max(1, Number(f.durationSlots || 1))});
    }finally{
      setSavePending(false);
    }
  };
  const remove=async ()=>{
    if(readOnly||!allowDelete||!onDelete||deletePending||savePending)return;
    setShowDeleteConfirm(false);
    setDeletePending(true);
    try{
      await onDelete();
    }finally{
      setDeletePending(false);
    }
  };
  const openDatePicker = () => {
    if (readOnly) return;
    setShowDatePicker((prev) => !prev);
  };

  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,backdropFilter:"blur(2px)"}} />
      <div style={{position:"fixed",inset:isCompact?8:16,zIndex:1000,background:"#1a1a2e",borderRadius:20,boxShadow:"0 25px 60px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.08)",overflow:"hidden",animation:"modalIn 0.22s cubic-bezier(0.2,0.8,0.2,1)",display:"flex",flexDirection:"column"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"16px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#fff",fontWeight:700,fontSize:16}}>{isNew?"➕ Новый заказ":`📋 Заказ ${formatOrderNumber(orderNumber)}`}</span>
            {!isNew&&<button onClick={()=>setShowHistory(true)} title="История изменений" style={{background:"rgba(100,255,218,0.12)",border:"1px solid rgba(100,255,218,0.25)",color:"#64ffda",width:26,height:26,borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>i</button>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:10,color:"#5a6a8a"}}>{currentUser?.name || "Пользователь"} · {EMPLOYEE_TYPES[currentUser?.role]?.label || currentUser?.role || "—"}</div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        </div>
        <div style={{padding:"18px 22px",display:"grid",gridTemplateColumns:isCompact?"minmax(0, 1fr)":"minmax(320px, 480px) minmax(0, 1fr)",gap:18,overflowY:"auto",flex:1,alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{padding:"14px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:3}}>
                  <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>Телефон клиента</div>
                  {!isNew && <div style={{fontSize:8,color:"#8892b0",textTransform:"uppercase",letterSpacing:0.8,fontWeight:700,whiteSpace:"nowrap"}}>{statusHistoryMeta.status} · {timeAgoRu(statusHistoryMeta.changedAt)}</div>}
                </div>
                <PhoneInput disabled={readOnly} value={f.phone} onChange={v=>upd("phone",v)} hasError={saveAttempted && requiredOrderErrors.phone} />
              </div>
              <Fld label="Имя клиента" disabled={readOnly} value={f.name} onChange={v=>upd("name",v)} placeholder="Имя Фамилия" hasError={saveAttempted && requiredOrderErrors.name} />
              <div><div style={{fontSize:10,color:saveAttempted && requiredOrderErrors.city?"#ff8f9a":"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Город</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",padding:saveAttempted && requiredOrderErrors.city?6:0,borderRadius:10,border:saveAttempted && requiredOrderErrors.city?"1px solid rgba(255,107,107,0.45)":"none",background:saveAttempted && requiredOrderErrors.city?"rgba(255,107,107,0.06)":"transparent"}}>{Object.keys(cities).map(c=>(<button key={c} disabled={readOnly} onClick={()=>setF((prev)=>({...prev,city:c,master:"",timeIdx:"",durationSlots:NEW_ORDER_DURATION_SLOTS}))} style={{padding:"5px 11px",borderRadius:8,fontSize:11,cursor:readOnly?"not-allowed":"pointer",fontFamily:"inherit",border:f.city===c?`2px solid ${cities[c].color}`:saveAttempted && requiredOrderErrors.city?"1px solid rgba(255,107,107,0.22)":"1px solid rgba(255,255,255,0.1)",background:f.city===c?cities[c].color+"22":saveAttempted && requiredOrderErrors.city?"rgba(255,107,107,0.06)":"rgba(255,255,255,0.04)",color:f.city===c?"#fff":saveAttempted && requiredOrderErrors.city?"#ffb0b9":"#8892b0",fontWeight:f.city===c?700:400}}>{c}</button>))}</div></div>
              <Fld label="Район" disabled={readOnly} value={f.district} onChange={v=>upd("district",v)} placeholder="Район" />
              <div><div style={{fontSize:10,color:saveAttempted && requiredOrderErrors.address?"#ff8f9a":"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Адрес</div><AddressInput disabled={readOnly} hasError={saveAttempted && requiredOrderErrors.address} value={f.address} onChange={v=>upd("address",v)} onDistrictChange={v=>upd("district",v)} onCoordsChange={({lat,lng})=>setF(p=>({...p,lat,lng}))} city={f.city} cities={cities} initialCoords={f.lat&&f.lng?{lat:Number(f.lat),lon:Number(f.lng)}:null} /></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <Fld label="" disabled={readOnly} value={f.apartment} onChange={v=>upd("apartment", v.replace(/[^\dA-Za-zА-Яа-я\-]/g,""))} placeholder="кв." />
                <Fld label="" disabled={readOnly} value={f.floor} onChange={v=>upd("floor", v.replace(/[^\d\-]/g,""))} placeholder="этаж" />
              </div>
              <div>
                <div style={{fontSize:10,color:saveAttempted && requiredOrderErrors.date?"#ff8f9a":"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Дата</div>
                <div style={{position:"relative"}}>
                  <button ref={dateButtonRef} type="button" disabled={readOnly} onClick={openDatePicker} style={{width:"100%",background:saveAttempted && requiredOrderErrors.date?"rgba(255,107,107,0.09)":"rgba(255,255,255,0.06)",border:saveAttempted && requiredOrderErrors.date?"1px solid rgba(255,107,107,0.52)":"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"14px 16px",color:f.dateStr?"#e6f1ff":"#7f8ca8",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",textAlign:"left",cursor:readOnly?"not-allowed":"pointer",boxShadow:saveAttempted && requiredOrderErrors.date?"0 0 0 1px rgba(255,107,107,0.08) inset":"none"}}>
                    {f.dateStr ? fromDateInputValue(f.dateStr) : "выбрать дату"}
                  </button>
                  {showDatePicker && !readOnly && (
                    <div ref={datePopoverRef} style={{position:"absolute",left:0,top:"calc(100% + 8px)",zIndex:30,padding:10,borderRadius:12,background:"linear-gradient(180deg,#1d2140,#15182e)",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 24px 60px rgba(0,0,0,0.42)"}}>
                      <input
                        autoFocus
                        type="date"
                        value={f.dateStr}
                        onChange={(e)=>{upd("dateStr",e.target.value); setShowDatePicker(false);}}
                        onKeyDown={(e)=>{if (e.key === "Escape") setShowDatePicker(false);}}
                        style={{width:230,height:38,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"0 10px",color:"#e6f1ff",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",colorScheme:"dark"}}
                      />
                    </div>
                  )}
                </div>
              </div>
              <SourceSelect disabled={readOnly} hasError={saveAttempted && requiredOrderErrors.source} value={f.source} onChange={v=>upd("source",v)} sources={sources} onAdd={onAddSource} />
            </div>

            <div style={{padding:"14px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:10}}>
              <Fld label="🔧 Заказ работ" disabled={readOnly} value={f.workOrder} onChange={v=>upd("workOrder",v)} placeholder="Сформируется автоматически по выбранным услугам или введи вручную" />
              <Fld label="💬 Комментарий мастеру" disabled={readOnly} value={f.comment} onChange={v=>upd("comment",v)} multiline placeholder="Домофон, этаж, особенности..." />
              <Fld label="✅ Выполненные работы" disabled={readOnly} value={f.workDone} onChange={v=>upd("workDone",v)} multiline placeholder="Что сделал мастер..." />
              <Fld label="💰 Стоимость (₽)" disabled={readOnly} value={f.price} onChange={v=>upd("price",v.replace(/[^\d]/g,""))} type="text" inputMode="numeric" name="estimated-cost" suppressAutofillIcon placeholder="Предварительная оценка" />
              {!!(f.serviceItems || []).length && <div style={{fontSize:10,color:"#64ffda"}}>Стоимость заполняется из выбранных услуг и их количества.</div>}
              <Fld label="💳 Окончательная стоимость (₽)" disabled={readOnly} value={f.finalPrice} onChange={v=>upd("finalPrice",v.replace(/[^\d]/g,""))} type="text" inputMode="numeric" name="final-cost" suppressAutofillIcon placeholder="Сколько получено по факту" />
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{padding:"14px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                <div style={{fontSize:11,color:"#dbe4ff",fontWeight:800}}>Подбор мастера</div>
                {f.serviceSubcategoryName && <div style={{fontSize:10,color:"#64ffda"}}>по навыку: {f.serviceSubcategoryName}</div>}
              </div>
              <div style={{padding:"12px",borderRadius:12,background:"rgba(7,12,34,0.45)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontSize:11,color:"#dbe4ff",fontWeight:800}}>Услуги по заявке</div>
                <div style={{display:"grid",gridTemplateColumns:isCompact?"1fr":"1fr 1fr",gap:10}}>
                  <PickerField label="Направление" disabled={readOnly || !directionOptions.length} value={f.serviceDirectionId} onChange={selectDirectionById} options={directionOptions} placeholder="Выбери направление" />
                  <PickerField label="Подуслуга" disabled={readOnly || !f.serviceDirectionId} value={f.serviceSubcategoryId} onChange={selectSubcategoryById} options={subcategoryOptions} placeholder="Выбери подуслугу" />
                </div>
                <div style={{padding:"12px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                    <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>Состав работ</div>
                    <div style={{fontSize:11,color:"#64ffda",fontWeight:800}}>{serviceItemsTotal ? `${serviceItemsTotal} ₽` : "0 ₽"}</div>
                  </div>
                  {normalizedServiceItems.length ? normalizedServiceItems.map((selectedItem) => {
                    const serviceNode = serviceIndex.byId.get(selectedItem.serviceId) || { id: selectedItem.serviceId, name: selectedItem.name, price: selectedItem.unitPrice };
                    return (
                      <div key={serviceNode.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,alignItems:"center",padding:"10px 12px",borderRadius:10,background:"rgba(100,255,218,0.08)",border:"1px solid rgba(100,255,218,0.22)"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,color:"inherit",fontFamily:"inherit",textAlign:"left"}}>
                          <span style={{width:18,height:18,borderRadius:5,border:"2px solid #64ffda",background:"rgba(100,255,218,0.2)",display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#64ffda",fontSize:11,fontWeight:900,flexShrink:0}}>✓</span>
                          <span>
                            <div style={{fontSize:12,color:"#e6f1ff",fontWeight:700}}>{serviceNode.name}</div>
                            <div style={{fontSize:10,color:"#8fa1ca"}}>{serviceNode.price || 0} ₽ за единицу</div>
                          </span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{display:"inline-flex",alignItems:"center",borderRadius:9,overflow:"hidden",border:"1px solid rgba(255,255,255,0.1)"}}>
                            <button type="button" disabled={readOnly} onClick={()=>updateServiceQuantity(serviceNode.id,-1)} style={{width:30,height:30,border:"none",background:"rgba(255,255,255,0.05)",color:"#dbe4ff",cursor:readOnly?"not-allowed":"pointer",fontSize:16,fontFamily:"inherit"}}>-</button>
                            <div style={{minWidth:34,textAlign:"center",fontSize:12,color:"#fff",fontWeight:800}}>{selectedItem.quantity}</div>
                            <button type="button" disabled={readOnly} onClick={()=>updateServiceQuantity(serviceNode.id,1)} style={{width:30,height:30,border:"none",background:"rgba(255,255,255,0.05)",color:"#dbe4ff",cursor:readOnly?"not-allowed":"pointer",fontSize:16,fontFamily:"inherit"}}>+</button>
                          </div>
                          <div style={{fontSize:11,color:"#64ffda",fontWeight:800,minWidth:66,textAlign:"right"}}>{selectedItem.totalPrice} ₽</div>
                          <button type="button" disabled={readOnly} onClick={()=>removeServiceItem(serviceNode.id)} style={{width:30,height:30,borderRadius:9,border:"1px solid rgba(255,82,82,0.25)",background:"rgba(255,82,82,0.12)",color:"#ff9ea1",fontSize:15,cursor:readOnly?"not-allowed":"pointer",fontFamily:"inherit",flexShrink:0}}>×</button>
                        </div>
                      </div>
                    );
                  }) : <div style={{fontSize:11,color:"#7f92ba"}}>{f.serviceSubcategoryId ? "Выбери услугу, и она появится в составе работ." : "Выбери направление и подуслугу, затем добавь нужные услуги."}</div>}
                  <PickerField
                    label=""
                    disabled={readOnly || !f.serviceSubcategoryId || !remainingServiceOptions.length}
                    value={pendingServiceId}
                    onChange={(value)=>{ setPendingServiceId(value); addServiceItem(value); }}
                    options={remainingServiceOptions}
                    placeholder={
                      !f.serviceSubcategoryId
                        ? "Сначала выбери подуслугу"
                        : remainingServiceOptions.length
                          ? "Выбери услугу"
                          : "Все услуги уже добавлены"
                    }
                  />
                </div>
              </div>
              {(!f.serviceDirectionId || !f.serviceSubcategoryId) && <div style={{fontSize:11,color:"#7f92ba"}}>Сначала выбери направление и подуслугу. Пока они не выбраны, мастера и свободные часы скрыты.</div>}
              {f.serviceDirectionId && f.serviceSubcategoryId && !cityMasters.length && <div style={{fontSize:11,color:"#ffb35a"}}>В городе «{f.city || "—"}» пока нет мастеров с этим навыком.</div>}
              {f.serviceDirectionId&&f.serviceSubcategoryId&&f.city&&f.dateStr&&cityMasters.length>0&&(<div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:10,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>Свободные часы</div>
                    <span style={{fontSize:10,color:"#64ffda",fontWeight:700,letterSpacing:0.3}}>Кол-во мастеров: {freeSlots.length}</span>
                  </div>
                  <button onClick={()=>setShowCityMap(true)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid rgba(100,255,218,0.25)",background:"rgba(100,255,218,0.1)",color:"#64ffda",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>🗺 Показать на карте</button>
                </div>
                {(() => {
                  const rowsCount = freeSlots.length;
                  const visibleRows = Math.min(3, Math.max(1, rowsCount));
                  const rowPx = 44;
                  const headerPx = 32;
                  const slotsMaxHeight = headerPx + visibleRows * rowPx + 4;
                  const showScrollHint = slotsScrollState.hasOverflow && !slotsScrollState.atBottom;
                  return (
                    <div style={{position:"relative"}}>
                      <style>{`@keyframes crmSlotArrow{0%,100%{transform:translateY(0);opacity:0.7}50%{transform:translateY(3px);opacity:1}}`}</style>
                      <div ref={slotsScrollRef} onScroll={recomputeSlotsScrollState} style={{background:"rgba(255,255,255,0.03)",borderRadius:10,border:"1px solid rgba(255,255,255,0.06)",overflow:"auto",maxHeight:slotsMaxHeight}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}><thead><tr>
                          <th style={{padding:"8px 8px",color:"#5a6a8a",textAlign:"left",position:"sticky",left:0,top:0,zIndex:3,background:"#1a1a2e",borderBottom:"1px solid rgba(255,255,255,0.06)",width:"14%",minWidth:76,maxWidth:84,fontSize:11}}>Мастер</th>
                          {TIMES.map(t=><th key={t} style={{padding:"8px 4px",color:"#64ffda",textAlign:"center",position:"sticky",top:0,zIndex:2,background:"#1a1a2e",borderBottom:"1px solid rgba(255,255,255,0.06)",fontFamily:"monospace",fontSize:10,fontWeight:800,minWidth:52}}>{t}</th>)}
                        </tr></thead><tbody>
                          {freeSlots.map(({master:m,slots})=>(<tr key={m.name}>
                            <td style={{padding:"8px 8px",color:"#ccd6f6",fontWeight:600,whiteSpace:"nowrap",position:"sticky",left:0,background:"#1a1a2e",width:"14%",minWidth:76,maxWidth:84,fontSize:10,overflow:"hidden",textOverflow:"ellipsis"}}><span style={{display:"inline-block",width:8,height:8,borderRadius:5,background:m.color,marginRight:6}} />{m.name}</td>
                            {slots.map(s=>(<td key={s.ti} style={{padding:2,textAlign:"center"}}>
                              {s.off?<div style={{padding:"8px 4px",borderRadius:6,background:"rgba(255,255,255,0.03)",color:"#555",fontSize:9,minWidth:48}}>вых</div>
                              :s.order?<div onClick={()=>{if(s.order && (s.order.address || (s.order.lat && s.order.lng))) setSlotMapOrder(s.order);}} style={{padding:"8px 4px",borderRadius:6,background:s.busy?"rgba(255,193,7,0.12)":"rgba(255,82,82,0.1)",color:s.busy?"#ffd166":"#ef5350",fontSize:9,minWidth:48,cursor:(s.order?.address||s.order?.lat)?"pointer":"default"}}>{s.busy?"занят":"занят"}</div>
                              :s.notWorking?<div style={{padding:"8px 4px",borderRadius:6,background:"repeating-linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 5px, rgba(255,255,255,0.06) 5px, rgba(255,255,255,0.06) 10px)",border:"1px solid rgba(255,255,255,0.08)",color:"#6c748f",fontSize:8.5,minWidth:48,fontWeight:700}}>не раб</div>
                              :s.free|| (f.master===m.name && currentRange.includes(s.ti)) ?<div onClick={()=>applySlotSelection(m.name,s.ti)} style={{padding:"8px 4px",borderRadius:6,background:f.master===m.name&&currentRange.includes(s.ti)?"rgba(100,255,218,0.3)":"rgba(100,255,218,0.06)",border:f.master===m.name&&currentRange.includes(s.ti)?"2px solid #64ffda":"1px solid rgba(100,255,218,0.15)",color:"#64ffda",cursor:readOnly?"default":"pointer",fontWeight:f.master===m.name&&currentRange.includes(s.ti)?800:500,fontSize:11,minWidth:48}}>{f.master===m.name&&currentRange.includes(s.ti)?"✓":"✓"}</div>
                              :s.lock && !s.ownLock ?<div style={{padding:"5px 4px",borderRadius:6,background:"rgba(255,82,82,0.12)",border:"1px solid rgba(255,82,82,0.4)",color:"#ff6f7d",fontSize:8,minWidth:48,lineHeight:1.2}}><div style={{fontWeight:800}}>оформ.</div><div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.lock.employeeName || "Сотр."}</div></div>
                              :<div style={{padding:"8px 4px",borderRadius:6,background:s.busy?"rgba(255,193,7,0.12)":"rgba(255,82,82,0.1)",color:s.busy?"#ffd166":"#ef5350",fontSize:9,minWidth:48}}>{s.busy?"занят":"занят"}</div>}
                            </td>))}
                          </tr>))}
                        </tbody></table>
                      </div>
                      {showScrollHint && (
                        <div style={{position:"absolute",left:0,right:0,bottom:0,height:28,pointerEvents:"none",background:"linear-gradient(to top, rgba(26,26,46,0.96) 10%, rgba(26,26,46,0))",borderBottomLeftRadius:10,borderBottomRightRadius:10,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:2}}>
                          <span style={{fontSize:16,color:"#64ffda",fontWeight:900,lineHeight:1,animation:"crmSlotArrow 1.2s ease-in-out infinite",textShadow:"0 0 8px rgba(100,255,218,0.5)"}}>⌄</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {f.master&&f.timeIdx!==""&&<div style={{marginTop:6,fontSize:11,color:"#64ffda",fontWeight:600}}>✓ {f.master} · {formatSelectedRange(f.timeIdx, f.durationSlots)} · {formatDurationLabel(f.durationSlots)}</div>}
                {!!slotSelectionWarning && <div style={{marginTop:6,fontSize:11,color:"#ffb35a",fontWeight:600}}>{slotSelectionWarning}</div>}
              </div>)}
              {(f.serviceDirectionId&&f.serviceSubcategoryId&&(!f.city || !f.dateStr)) && <div style={{fontSize:11,color:"#7f92ba"}}>Выбери город и дату, чтобы увидеть доступные окна.</div>}
              <div style={{padding:"12px",borderRadius:12,background:"rgba(7,12,34,0.45)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>Статус</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{(statuses || []).map((statusItem)=>{const meta=statusMeta(statusItem.name, statusMap);const statusAllowed=canUserSelectOrderStatus(currentUser,statusItem.name);const disabled=readOnly||!statusAllowed;return(<button key={statusItem.name} disabled={disabled} onClick={()=>upd("status",statusItem.name)} style={{padding:"5px 10px",borderRadius:999,fontSize:10,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",border:f.status===statusItem.name?`1px solid ${meta.pillBorder}`:"1px solid rgba(255,255,255,0.1)",background:f.status===statusItem.name?meta.pillBg:(disabled?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.04)"),color:f.status===statusItem.name?meta.pillText:(disabled?"#637292":"#8892b0"),fontWeight:f.status===statusItem.name?800:400,opacity:disabled&&f.status!==statusItem.name?0.6:1}}>{statusItem.name}</button>);})}</div>
              </div>
            </div>

            {!!originalPlacement && (
              <div style={{padding:"10px 12px",borderRadius:10,background:scheduleChanged?"rgba(255,193,7,0.1)":"rgba(255,255,255,0.04)",border:scheduleChanged?"1px solid rgba(255,193,7,0.25)":"1px solid rgba(255,255,255,0.08)"}}>
                <div style={{fontSize:10,color:"#8fa1ca",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Перемещение заявки</div>
                <div style={{fontSize:11,color:"#b7c6e8",lineHeight:1.5}}>
                  <div>Сейчас: <span style={{color:"#e6f1ff",fontWeight:700}}>{originalPlacement.master} · {formatShortDate(originalPlacement.dateStr)} · {formatSelectedRange(originalPlacement.timeIdx, originalPlacement.durationSlots)}</span></div>
                  <div>После сохранения: <span style={{color:scheduleChanged?"#ffd166":"#64ffda",fontWeight:700}}>{f.master || "—"} · {f.dateStr ? formatShortDate(f.dateStr) : "—"} · {f.timeIdx!=="" ? formatSelectedRange(f.timeIdx, f.durationSlots) : "—"}</span></div>
                </div>
                {scheduleChanged && <div style={{fontSize:10,color:"#ffd166",marginTop:6}}>После нажатия «Сохранить» заявка переедет в новое окно.</div>}
              </div>
            )}

            {f.name&&f.phone&&(<div style={{background:"rgba(100,255,218,0.06)",border:"1px solid rgba(100,255,218,0.15)",borderRadius:10,padding:10}}>
              <div style={{fontSize:9,color:"#64ffda",marginBottom:4,fontWeight:700,letterSpacing:1}}>СООБЩЕНИЕ МАСТЕРУ</div>
              <div style={{fontSize:10,color:"#ccd6f6",lineHeight:1.6,fontFamily:"monospace",whiteSpace:"pre-line"}}>{`📞 ${f.name} +7${fmtPh(f.phone)}\n📍 ${f.city}, ${formatOrderAddressLine(f.address, f.apartment, f.floor)}${f.district?`, ${f.district}`:""}\n📁 ${f.serviceDirectionName||"—"} / ${f.serviceSubcategoryName||"—"}\n🔧 ${f.workOrder||"—"}\n💬 ${f.comment||"—"}\n💰 ${f.price?f.price+"₽":"—"}\n📊 ${f.status}`}</div>
            </div>)}

            <div style={{display:"flex",gap:8,marginTop:"auto",paddingTop:4}}>
              {!readOnly&&<button onClick={save} disabled={savePending} style={{flex:1,padding:"12px 0",borderRadius:12,border:"none",background:canSave?"linear-gradient(135deg,#64ffda,#00bfa5)":"#333",color:canSave?"#0a0a23":"#8f9bb9",fontWeight:800,fontSize:14,cursor:savePending?"not-allowed":"pointer",fontFamily:"inherit"}}>{savePending?"⏳ Сохраняю...":"💾 Сохранить"}</button>}
              {readOnly&&<div style={{flex:1,padding:"12px 0",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#7d88aa",fontWeight:700,fontSize:12,textAlign:"center"}}>Только просмотр</div>}
              {data&&allowDelete&&<button onClick={()=>setShowDeleteConfirm(true)} disabled={deletePending||savePending} style={{padding:"12px 16px",borderRadius:12,border:"1px solid rgba(255,82,82,0.3)",background:(deletePending||savePending)?"rgba(255,255,255,0.06)":"rgba(255,82,82,0.1)",color:(deletePending||savePending)?"#66739b":"#ff5252",fontWeight:700,fontSize:13,cursor:(deletePending||savePending)?"not-allowed":"pointer",fontFamily:"inherit"}}>{deletePending?"⏳":"🗑"}</button>}
            </div>
          </div>
        </div>
      </div>
      {showDeleteConfirm && <ConfirmDialog title="Удалить заявку?" onConfirm={remove} onCancel={()=>setShowDeleteConfirm(false)} />}
      {showHistory&&<OrderHistoryPopup entries={historyEntries} onClose={()=>setShowHistory(false)} />}
      {showCityMap && (() => {
        const masterColorMap = {};
        const cityTechs = employees.filter(e => e.type === "technician" && e.city === f.city);
        cityTechs.forEach(e => { masterColorMap[e.name] = e.color; });
        const cityOrders = Object.values(orders).filter(o => o.city === f.city && o.dateStr === f.dateStr && (o.address || (o.lat && o.lng)));
        const orderKey = (o) => `${o.city}|${o.master}|${o.dateStr}|${o.timeIdx}`;
        const mapPins = cityOrders.map((o, i) => ({
          id: orderKey(o),
          lat: o.lat ? Number(o.lat) : 0, lon: o.lng ? Number(o.lng) : 0,
          pinColor: hexToPinColor(masterColorMap[o.master] || "#999", i),
          label: `${o.master} · ${slotLabel(o.timeIdx)}–${getOrderEndLabel(o)}`,
          address: o.address || "",
          city: f.city,
          legend: o.master,
          legendColor: masterColorMap[o.master] || "#999",
        }));
        const homePins = cityTechs.filter(e => e.residenceLat && e.residenceLng).map((e, i) => ({
          lat: Number(e.residenceLat), lon: Number(e.residenceLng),
          pinColor: hexToPinColor(e.color, i),
          label: `🏠 ${e.name}`,
          address: e.residenceAddress || "",
          legend: `🏠 ${e.name}`,
          legendColor: e.color,
          isHome: true,
        }));
        const cityData = cities[f.city];
        const cc = cityData ? { lat: cityData.lat, lon: cityData.lng } : null;
        const newOrderCoords = isNew && f.lat && f.lng ? { lat: Number(f.lat), lon: Number(f.lng), pinColor: "rd", label: "Новая заявка", address: f.address || "", highlight: true, legend: "Новая заявка", legendColor: "#ff5252" } : null;
        const currentOrderId = !isNew && data ? orderKey(data) : null;
        const slotRows = freeSlots.map(({ master, slots }) => ({
          master,
          slots: slots.map((slot) => ({
            ti: slot.ti,
            off: slot.off,
            notWorking: slot.notWorking,
            free: slot.free,
            selected: f.master === master.name && currentRange.includes(slot.ti),
            clickable: !readOnly && !slot.notWorking && (slot.free || (f.master === master.name && currentRange.includes(slot.ti))),
            pinId: slot.order ? orderKey(slot.order) : null,
          })),
        }));
        return <MultiPinMapModal pins={mapPins} homePins={homePins} highlightPin={newOrderCoords} cityCenter={cc} selectedPinId={currentOrderId} slotRows={slotRows} onSlotSelect={applySlotSelection} title={`🗺 Заказы · ${f.city} · ${f.dateStr ? formatShortDate(f.dateStr) : ""}`} onClose={() => setShowCityMap(false)} />;
      })()}
      {slotMapOrder && (() => {
        const masterColorMap = {};
        const cityTechs = employees.filter(e => e.type === "technician" && e.city === f.city);
        cityTechs.forEach(e => { masterColorMap[e.name] = e.color; });
        const existingPin = {
          lat: slotMapOrder.lat ? Number(slotMapOrder.lat) : 0, lon: slotMapOrder.lng ? Number(slotMapOrder.lng) : 0,
          pinColor: hexToPinColor(masterColorMap[slotMapOrder.master] || "#999", 0),
          label: `${slotMapOrder.master} · ${slotLabel(slotMapOrder.timeIdx)}–${getOrderEndLabel(slotMapOrder)}`,
          address: slotMapOrder.address || "",
          city: f.city,
          legend: slotMapOrder.master,
          legendColor: masterColorMap[slotMapOrder.master] || "#999",
        };
        const homePins = cityTechs.filter(e => e.residenceLat && e.residenceLng).map((e, i) => ({
          lat: Number(e.residenceLat), lon: Number(e.residenceLng),
          pinColor: hexToPinColor(e.color, i),
          label: `🏠 ${e.name}`,
          address: e.residenceAddress || "",
          legend: `🏠 ${e.name}`,
          legendColor: e.color,
          isHome: true,
        }));
        const cityData = cities[f.city];
        const cc = cityData ? { lat: cityData.lat, lon: cityData.lng } : null;
        const newOrderCoords = isNew && f.lat && f.lng ? { lat: Number(f.lat), lon: Number(f.lng), pinColor: "rd", label: "Новая заявка", address: f.address || "", highlight: true, legend: "Новая заявка", legendColor: "#ff5252" } : null;
        return <MultiPinMapModal pins={[existingPin]} homePins={homePins} highlightPin={newOrderCoords} cityCenter={cc} title={`📍 Заказ · ${slotMapOrder.master} · ${slotLabel(slotMapOrder.timeIdx)}`} onClose={() => setSlotMapOrder(null)} />;
      })()}
    </>
  );
};

/* ====== ADD EMPLOYEE ====== */
const AddEmployeePopup = ({cities,onAdd,onClose}) => {
  const [name,setName]=useState("");
  const [type,setType]=useState("technician");
  const [city,setCity]=useState(Object.keys(cities)[0]||"");
  const [color,setColor]=useState(MCOLORS[0]);
  const [phone,setPhone]=useState("");
  const [passport,setPassport]=useState("");
  const canSave = name.trim() && (type !== "technician" || city);
  return (<><div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:999}} />
    <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1000,background:"#1a1a2e",borderRadius:14,width:380,boxShadow:"0 25px 60px rgba(0,0,0,0.5)",overflow:"hidden",animation:"modalIn 0.22s cubic-bezier(0.2,0.8,0.2,1)"}}>
      <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{color:"#fff",fontWeight:700,fontSize:14}}>👥 Новый сотрудник</span><button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button></div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:10}}>
        <Fld label="Имя сотрудника" value={name} onChange={setName} placeholder="Иван Петров" />
        <div><div style={{fontSize:10,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Тип сотрудника</div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{["technician","call_center"].map((v)=>(<button key={v} onClick={()=>setType(v)} style={{padding:"5px 10px",borderRadius:7,fontSize:10,cursor:"pointer",fontFamily:"inherit",border:type===v?"2px solid #64ffda":"1px solid rgba(255,255,255,0.1)",background:type===v?"rgba(100,255,218,0.15)":"rgba(255,255,255,0.04)",color:type===v?"#64ffda":"#8892b0",fontWeight:type===v?700:400}}>{EMPLOYEE_TYPES[v].icon} {EMPLOYEE_TYPES[v].label}</button>))}</div></div>
        <div><div style={{fontSize:10,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Телефон сотрудника</div><PhoneInput value={phone} onChange={setPhone} /></div>
        <Fld label="Паспортные данные" value={passport} onChange={setPassport} placeholder="Только для админа" />
        {type==="technician"&&<div><div style={{fontSize:10,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Город</div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{Object.keys(cities).map(c=>(<button key={c} onClick={()=>setCity(c)} style={{padding:"5px 10px",borderRadius:7,fontSize:10,cursor:"pointer",fontFamily:"inherit",border:city===c?`2px solid ${cities[c].color}`:"1px solid rgba(255,255,255,0.1)",background:city===c?cities[c].color+"22":"rgba(255,255,255,0.04)",color:city===c?"#fff":"#8892b0",fontWeight:city===c?700:400}}>{c}</button>))}</div></div>}
        <div><div style={{fontSize:10,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Цвет</div><div style={{display:"flex",gap:6}}>{MCOLORS.map(c=>(<div key={c} onClick={()=>setColor(c)} style={{width:24,height:24,borderRadius:6,background:c,cursor:"pointer",border:color===c?"3px solid #fff":"3px solid transparent"}} />))}</div></div>
        <button onClick={()=>{if(canSave){onAdd({name:name.trim(),city:type==="technician"?city:"",color,phone,passport,type});onClose();}}} disabled={!canSave} style={{padding:"10px 0",borderRadius:10,border:"none",background:canSave?"linear-gradient(135deg,#64ffda,#00bfa5)":"#333",color:canSave?"#0a0a23":"#666",fontWeight:800,fontSize:13,cursor:canSave?"pointer":"not-allowed",fontFamily:"inherit"}}>+ Добавить сотрудника</button>
      </div></div></>);
};

/* ====== ADD CITY ====== */
const AddCityPopup = ({onAdd,onClose}) => {
  const [name,setName]=useState("");const [color,setColor]=useState("#1565C0");
  const cc=["#1565C0","#2E7D32","#6A1B9A","#E65100","#AD1457","#00695C","#F57F17","#283593","#4E342E","#37474F"];
  return (<><div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:999}} />
    <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1000,background:"#1a1a2e",borderRadius:14,width:340,boxShadow:"0 25px 60px rgba(0,0,0,0.5)",overflow:"hidden",animation:"modalIn 0.22s cubic-bezier(0.2,0.8,0.2,1)"}}>
      <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{color:"#fff",fontWeight:700,fontSize:14}}>🏙️ Новый город</span><button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button></div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
        <Fld label="Название" value={name} onChange={setName} placeholder="Москва" />
        <div><div style={{fontSize:10,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>Цвет</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{cc.map(c=>(<div key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:6,background:c,cursor:"pointer",border:color===c?"3px solid #fff":"3px solid transparent"}} />))}</div></div>
        <button onClick={()=>{if(name.trim()){onAdd(name.trim(),color);onClose();}}} disabled={!name.trim()} style={{padding:"10px 0",borderRadius:10,border:"none",background:name.trim()?"linear-gradient(135deg,#64ffda,#00bfa5)":"#333",color:name.trim()?"#0a0a23":"#666",fontWeight:800,fontSize:13,cursor:name.trim()?"pointer":"not-allowed",fontFamily:"inherit"}}>+ Добавить город</button>
      </div></div></>);
};

const TechnicianDashboard = ({ technician, orders, dayOffs, busySlots, onToggleBusySlot, onStatusChange, onAcknowledgeOrder, onReturnToOffice, onCompleteOrder, onLogout, statuses = INIT_STATUSES, services = INIT_SERVICES }) => {
  const [mode, setMode] = useState("week");
  const [workFilter, setWorkFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState(dstr(new Date()));
  const [completeDraft, setCompleteDraft] = useState(null);
  const [returnDraft, setReturnDraft] = useState(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 760 : true);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const statusMap = useMemo(() => makeStatusMap(statuses), [statuses]);
  const serviceIndex = useMemo(() => buildServiceIndex(services || []), [services]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setIsMobile(window.innerWidth < 760);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const today = dstr(new Date());
  const now = new Date();
  const weekDays = useMemo(() => {
    const base = parseDateStr(selectedDate) || new Date();
    const dayIndex = (base.getDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, idx) => new Date(base.getFullYear(), base.getMonth(), base.getDate() - dayIndex + idx));
  }, [selectedDate]);
  const monthDays = useMemo(() => daysIn(calYear, calMonth), [calMonth, calYear]);
  const masterOrders = useMemo(() => Object.entries(orders)
    .map(([key, value]) => ({ ...value, key }))
    .filter((order) => order._masterId === technician.id)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr) || Number(a.timeIdx) - Number(b.timeIdx)), [orders, technician.id]);
  const filteredOrders = useMemo(() => {
    if (workFilter === "all") return masterOrders;
    const patterns = {
      clean: ["чист"],
      refill: ["заправ"],
      diag: ["диаг"],
      repair: ["ремонт"],
      replace: ["замен"],
    };
    return masterOrders.filter((order) => {
      const hay = `${order.workOrder || ""} ${order.workDone || ""}`.toLowerCase();
      return patterns[workFilter]?.some((token) => hay.includes(token));
    });
  }, [masterOrders, workFilter]);
  const byDate = useMemo(() => filteredOrders.reduce((acc, order) => {
    if (!acc[order.dateStr]) acc[order.dateStr] = [];
    acc[order.dateStr].push(order);
    return acc;
  }, {}), [filteredOrders]);
  const todayItems = byDate[today] || [];
  const todayConfirmed = todayItems.filter((order) => order.status === "Подтверждён" || order.status === "Подтвержден мастером").length;
  const todayNew = todayItems.filter((order) => order.status === "Новый").length;
  const nowSlot = Math.max(0, now.getHours() - WORKDAY_START_HOUR);
  const nearestToday = todayItems.find((order) => Number(order.timeIdx) + getOrderDurationSlots(order) > nowSlot) || todayItems[0] || null;
  const todayOff = !!dayOffs[dok(technician.city, technician.name, today)];
  const todayWorkingSlots = new Set(TIMES.map((_, ti) => ti).filter((ti) => isEmployeeWorkingAt(technician, today, ti)));
  const todayBusySet = new Set(TIMES.map((_, ti) => ti).filter((ti) => !!busySlots[bok(technician.city, technician.name, today, ti)]));
  const todayOrderOccupied = new Set(todayItems.flatMap((order) => getOrderSlotIndices(order)));
  const freeToday = todayOff ? 0 : Math.max(0, todayWorkingSlots.size - [...todayOrderOccupied].filter((slot) => todayWorkingSlots.has(slot)).length - [...todayBusySet].filter((slot) => todayWorkingSlots.has(slot)).length);
  const dayOrders = byDate[selectedDate] || [];
  const selectedOff = !!dayOffs[dok(technician.city, technician.name, selectedDate)];
  const selectedWorkingSlots = useMemo(() => new Set(TIMES.map((_, ti) => ti).filter((ti) => isEmployeeWorkingAt(technician, selectedDate, ti))), [selectedDate, technician]);
  const selectedBusySet = useMemo(() => new Set(TIMES.map((_, ti) => ti).filter((ti) => !!busySlots[bok(technician.city, technician.name, selectedDate, ti)])), [busySlots, technician.city, technician.name, selectedDate]);
  const freeIntervals = useMemo(() => {
    if (selectedOff) return [];
    const occupied = new Set([...dayOrders.flatMap((order) => getOrderSlotIndices(order)), ...selectedBusySet]);
    const ranges = [];
    let start = null;
    for (let i = 0; i < TIMES.length; i += 1) {
      const unavailable = occupied.has(i) || !selectedWorkingSlots.has(i);
      if (!unavailable && start === null) start = i;
      if ((unavailable || i === TIMES.length - 1) && start !== null) {
        const end = unavailable ? i - 1 : i;
        ranges.push(`${slotLabel(start)}–${slotLabel(end + 1)}`);
        start = null;
      }
    }
    return ranges;
  }, [dayOrders, selectedBusySet, selectedOff, selectedWorkingSlots]);
  const occupiedDaySlots = new Set(dayOrders.flatMap((order) => getOrderSlotIndices(order)));
  const loadPercent = selectedOff || !selectedWorkingSlots.size ? 0 : Math.round((((occupiedDaySlots.size) + selectedBusySet.size) / selectedWorkingSlots.size) * 100);
  const mobileTimelineItems = useMemo(() => {
    const items = [];
    for (let idx = 0; idx < TIMES.length; idx += 1) {
      const startingOrder = dayOrders.find((order) => Number(order.timeIdx) === idx);
      if (startingOrder) {
        items.push({
          key: `order-${startingOrder.key}`,
          kind: "order",
          idx,
          order: startingOrder,
          label: `${slotLabel(startingOrder.timeIdx)}-${getOrderEndLabel(startingOrder)}`,
        });
        idx += Math.max(1, getOrderDurationSlots(startingOrder)) - 1;
        continue;
      }
      if (dayOrders.some((order) => orderCoversSlot(order, idx))) continue;
      items.push({
        key: `slot-${idx}`,
        kind: selectedOff ? "off" : (!selectedWorkingSlots.has(idx) ? "nonwork" : (selectedBusySet.has(idx) ? "busy" : "free")),
        idx,
        label: TIMES[idx],
      });
    }
    return items;
  }, [dayOrders, selectedBusySet, selectedOff, selectedWorkingSlots]);

  const renderDayButton = (date, compactOff = "выходн.") => {
    const ds = dstr(date);
    const count = (byDate[ds] || []).length;
    const off = !!dayOffs[dok(technician.city, technician.name, ds)];
    const selected = ds === selectedDate;
    const loadColor = off ? "#7d8597" : count <= 1 ? "#7ce4cf" : count <= 3 ? "#ffd166" : "#ff6b6b";
    return (
      <button key={ds} onClick={() => setSelectedDate(ds)} style={{ position: "relative", overflow: "hidden", padding: "6px 4px", borderRadius: 10, border: selected ? "1px solid #64ffda" : "1px solid rgba(255,255,255,0.1)", background: off ? "rgba(125,133,151,0.14)" : "rgba(255,255,255,0.03)", color: "#dce8ff", cursor: "pointer", fontFamily: "inherit" }}>
        {off && <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg, rgba(255,82,82,0.12), rgba(255,82,82,0.12) 6px, rgba(255,82,82,0) 6px, rgba(255,82,82,0) 12px)", pointerEvents: "none" }} />}
        <div style={{ fontSize: 10, color: "#90a2c9" }}>{["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][date.getDay()]}</div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{String(date.getDate()).padStart(2, "0")}</div>
        <div style={{ position: "relative", fontSize: 9, fontWeight: 700, color: off ? "#7d8597" : (count === 0 ? "#7d8597" : "#7ce4cf") }}>{off ? compactOff : `${count} зак.`}</div>
      </button>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a1a", color: "#e6f1ff", paddingBottom: isMobile ? 72 : 16, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#16213e,#1a1a2e,#0f3460)", padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#64ffda" }}>👷 {technician.name}</div>
          <div style={{ fontSize: 11, color: "#8ea2cf" }}>{technician.city} · {todayOff ? "🌙 Выходной" : "🟢 На смене"}</div>
        </div>
        <button onClick={onLogout} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.07)", color: "#d7e3ff", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Выйти</button>
      </div>

      <div style={{ padding: isMobile ? 10 : 12, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5,minmax(120px,1fr))", gap: 8, marginBottom: 10 }}>
          {[{ l: "Сегодня", v: pluralizeOrders(todayItems.length) }, { l: "Подтверждено", v: String(todayConfirmed) }, { l: "Новых", v: String(todayNew) }, { l: "Свободных окон", v: String(freeToday) }, { l: "Ближайший", v: nearestToday ? `${slotLabel(nearestToday.timeIdx)}–${getOrderEndLabel(nearestToday)}` : "—" }].map((item) => (
            <div key={item.l} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 10, color: "#7f92bb" }}>{item.l}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#dfe9ff" }}>{item.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {[
            ["today", "Сегодня"],
            ["week", "Неделя"],
            ["month", "Месяц"],
          ].map(([value, label]) => (
            <button key={value} onClick={() => setMode(value)} style={{ padding: "6px 10px", borderRadius: 8, border: mode === value ? "1px solid #64ffda" : "1px solid rgba(255,255,255,0.12)", background: mode === value ? "rgba(100,255,218,0.13)" : "rgba(255,255,255,0.03)", color: mode === value ? "#64ffda" : "#9fb1d1", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
          ))}
          {!isMobile && (
            <CustomSelect
              value={workFilter}
              onChange={setWorkFilter}
              options={[
                { value: "all", label: "Все работы" },
                { value: "clean", label: "Чистка" },
                { value: "refill", label: "Заправка" },
                { value: "diag", label: "Диагностика" },
                { value: "repair", label: "Ремонт" },
                { value: "replace", label: "Замена деталей" },
              ]}
              className="calendar-work-filter"
              triggerStyle={{ marginLeft: "auto", minHeight: 30, borderRadius: 8, padding: "6px 30px 6px 8px", fontSize: 11, color: "#dce8ff", width: 150 }}
              menuZIndex={1200}
            />
          )}
        </div>

        {mode !== "month" && <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 10 }}>{weekDays.map((date) => renderDayButton(date))}</div>}
        {mode === "month" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 8, marginBottom: 8 }}>
              <CustomSelect
                value={calMonth}
                onChange={(nextValue) => setCalMonth(parseInt(nextValue, 10))}
                options={MONTHS.map((monthName, idx) => ({ value: idx, label: monthName }))}
                triggerStyle={{ borderRadius: 10 }}
                menuZIndex={1200}
              />
              <CustomSelect
                value={calYear}
                onChange={(nextValue) => setCalYear(parseInt(nextValue, 10))}
                options={Array.from({ length: 9 }, (_, idx) => new Date().getFullYear() - 2 + idx).map((yearValue) => ({ value: yearValue, label: String(yearValue) }))}
                triggerStyle={{ borderRadius: 10 }}
                menuZIndex={1200}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>{monthDays.map((date) => renderDayButton(date, "вых"))}</div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", gap: 10, marginBottom: 10 }}>
          <div style={{ borderRadius: 12, padding: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, color: "#8fa3cd", marginBottom: 4 }}>Загрузка дня: <b style={{ color: "#dce8ff" }}>{loadPercent}%</b></div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${loadPercent}%`, background: loadPercent > 70 ? "#ff6b6b" : loadPercent > 40 ? "#ffd166" : "#64ffda" }} />
            </div>
            <div style={{ fontSize: 11, color: "#a3b6d8" }}>{occupiedDaySlots.size + selectedBusySet.size} из {selectedWorkingSlots.size || TIMES.length} слотов занято</div>
            <div style={{ fontSize: 11, color: "#a3b6d8", marginTop: 4 }}>Свободно: {selectedOff ? "выходной" : (freeIntervals.length ? freeIntervals.join(", ") : "нет окон")}</div>
          </div>
          <div style={{ borderRadius: 12, padding: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#dce8ff", marginBottom: 8 }}>Таймлайн дня · {formatShortDate(selectedDate)}</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3,1fr)" : "repeat(6,1fr)", gap: 6 }}>
              {(isMobile ? mobileTimelineItems : TIMES.map((time, idx) => ({ key: time, kind: "slot", idx, label: time }))).map((item) => {
                const idx = item.idx;
                const order = item.kind === "order" ? item.order : dayOrders.find((entry) => orderCoversSlot(entry, idx));
                const busy = selectedBusySet.has(idx);
                const isStart = order ? Number(order.timeIdx) === idx : false;
                const timeLabel = item.kind === "order" ? item.label : item.label;
                const stateLabel = selectedOff ? "вых" : !selectedWorkingSlots.has(idx) ? "не раб" : order ? (isStart ? "заказ" : "прод.") : busy ? "занят" : "свободно";
                return (
                  <button
                    key={item.key}
                    onClick={() => { if (!order && !selectedOff && selectedWorkingSlots.has(idx)) onToggleBusySlot(technician.city, technician.name, selectedDate, idx); }}
                    style={{ borderRadius: 8, padding:"8px 6px", textAlign: "center", border: "1px solid rgba(255,255,255,0.1)", background: selectedOff ? "rgba(125,133,151,0.14)" : !selectedWorkingSlots.has(idx) ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 5px, rgba(255,255,255,0.06) 5px, rgba(255,255,255,0.06) 10px)" : order ? "rgba(100,255,218,0.16)" : busy ? "rgba(255,193,7,0.16)" : "rgba(255,255,255,0.03)", cursor: (!order && !selectedOff && selectedWorkingSlots.has(idx)) ? "pointer" : "default", fontFamily: "inherit", minHeight: 50 }}
                  >
                    <div style={{ fontSize: item.kind === "order" ? 10.5 : 10, color: "#95a8d1", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{timeLabel}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: selectedOff ? "#7d8597" : order ? "#64ffda" : busy ? "#ffd166" : "#7f92ba", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{stateLabel}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(280px,1fr))", gap: 8 }}>
          {dayOrders.map((order) => {
            const canSee = technicianVisibleStatuses.has(order.status);
            const meta = statusMeta(order.status, statusMap);
            const phoneClean = (order.phone || "").replace(/\D/g, "");
            const routeHref = order.address ? `https://yandex.ru/maps/?text=${encodeURIComponent(order.address)}` : "#";
            const orderServicesSummary = summarizeServiceItems(order.serviceItems || []);
            const needsAck = orderNeedsTechnicianConfirmation(order);
            const confirmedByTech = orderConfirmedByTechnician(order);
            const returnedToOffice = orderReturnedToOffice(order);
            return (
              <div key={order.key} style={{ borderRadius: 10, padding: 10, background: meta.cardBg, border: `1px solid ${meta.cardBorder}`, borderLeft: `4px solid ${meta.left}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                    {returnedToOffice && <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,borderRadius:999,background:"rgba(217,107,121,0.18)",border:"1px solid rgba(217,107,121,0.5)",color:"#B4243A",fontSize:12,fontWeight:900,flexShrink:0}}>!</span>}
                    <div style={{ fontSize: 12, fontWeight: 800, color: meta.cardText, minWidth:0 }}>{formatShortDate(order.dateStr)} · {slotLabel(order.timeIdx)}–{getOrderEndLabel(order)}</div>
                  </div>
                  <div style={{ padding: "4px 10px", borderRadius: 10, background: meta.pillBg, border: `1px solid ${meta.pillBorder}`, boxShadow:`inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 14px ${meta.pillBorder}24`, fontSize: 9.5, color: meta.pillText, fontWeight: 900 }}>{meta.icon} {order.status}</div>
                </div>
                {needsAck && (
                  <div style={{marginBottom:8,padding:"10px 11px",borderRadius:12,background:"linear-gradient(135deg,#bff9ea,#8de7d9)",border:"1px solid rgba(24,197,190,0.42)",boxShadow:"0 10px 24px rgba(24,197,190,0.16)",color:"#13352f"}}>
                    <div style={{fontSize:11,fontWeight:900,color:"#0d2d28"}}>Офис подтвердил заявку</div>
                    <div style={{fontSize:10,color:"#24524b",marginTop:2}}>Нажми «Подтвердить», чтобы офис увидел, что ты принял заказ.</div>
                  </div>
                )}
                {confirmedByTech && (
                  <div style={{marginBottom:8,padding:"9px 11px",borderRadius:12,background:"rgba(221,243,228,0.96)",border:"1px solid rgba(52,142,86,0.34)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.35)",fontSize:10.5,color:"#1e5c35",fontWeight:900}}>
                    Заявка подтверждена мастером
                  </div>
                )}
                {returnedToOffice && (
                  <div style={{marginBottom:8,padding:"9px 11px",borderRadius:12,background:"rgba(255,226,230,0.96)",border:"1px solid rgba(217,107,121,0.42)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.35)",fontSize:10.5,color:"#6f2330",fontWeight:900}}>
                    Возврат в офис{order.returnToOfficeComment ? `: ${order.returnToOfficeComment}` : ""}
                  </div>
                )}
                <div style={{ fontSize: 12, color: meta.cardText, marginBottom: 4 }}><b>Клиент:</b> {order.name || "—"}</div>
                <div style={{ fontSize: 12, color: meta.cardText, opacity:0.82, marginBottom: 4 }}><b>Телефон:</b> {canSee ? `+7${fmtPh(order.phone || "")}` : "Скрыто до подтверждения"}</div>
                <div style={{ fontSize: 12, color: meta.cardText, opacity:0.82, marginBottom: 4 }}><b>Адрес:</b> {canSee ? (order.address || "—") : "Скрыто до подтверждения"}</div>
                <div style={{ fontSize: 12, color: meta.cardText, opacity:0.82, marginBottom: 4 }}><b>Работы:</b> {orderServicesSummary || order.workOrder || "—"}</div>
                <div style={{ fontSize: 12, color: meta.cardText, opacity:0.82, marginBottom: 4, whiteSpace:"pre-line" }}><b>Комментарий:</b> {order.comment || "—"}</div>
                <div style={{ fontSize: 12, color: meta.cardText, opacity:0.82, marginBottom: 6 }}><b>Стоимость:</b> {(order.finalPrice || order.price) ? `${order.finalPrice || order.price}₽` : "—"}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    onClick={() => onAcknowledgeOrder?.(order.key)}
                    disabled={!needsAck}
                    style={{ padding: "6px 10px", borderRadius: 9, border: needsAck ? "1px solid rgba(24,197,190,0.72)" : "1px solid rgba(189,205,247,0.18)", background: needsAck ? "linear-gradient(135deg,#65ffdd,#18c5be)" : "rgba(255,255,255,0.08)", color: needsAck ? "#082723" : "#9bb0d5", fontSize: 10.5, fontWeight: 900, cursor: needsAck ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: needsAck ? "0 12px 26px rgba(24,197,190,0.22)" : "none" }}
                  >
                    Подтвердить
                  </button>
                  <button
                    onClick={() => setReturnDraft({ key: order.key, reason: order.returnToOfficeComment || "", baseComment: stripTechnicianComment(stripReturnToOfficeComment(order.comment || "")), order })}
                    disabled={!confirmedByTech}
                    style={{ padding: "6px 10px", borderRadius: 9, border: confirmedByTech ? "1px solid rgba(217,107,121,0.58)" : "1px solid rgba(189,205,247,0.16)", background: confirmedByTech ? "linear-gradient(135deg,#ffd8dd,#f4a4ae)" : "rgba(255,255,255,0.08)", color: confirmedByTech ? "#7f2433" : "#9bb0d5", fontSize: 10.5, fontWeight: 900, cursor: confirmedByTech ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: confirmedByTech ? "0 10px 20px rgba(217,107,121,0.14)" : "none" }}
                  >
                    Вернуть в офис
                  </button>
                  <a href={canSee && phoneClean ? `tel:+7${phoneClean}` : "#"} style={{ padding: "6px 9px", borderRadius: 9, background: canSee && phoneClean ? "linear-gradient(135deg,#cbfff0,#9df1dd)" : "rgba(255,255,255,0.08)", border: canSee && phoneClean ? "1px solid rgba(24,197,190,0.34)" : "1px solid rgba(189,205,247,0.16)", color: canSee && phoneClean ? "#1c6a5c" : "#9bb0d5", fontSize: 10.5, fontWeight: 800, textDecoration: "none", pointerEvents: canSee && phoneClean ? "auto" : "none", opacity: 1, boxShadow: canSee && phoneClean ? "0 10px 20px rgba(24,197,190,0.08)" : "none" }}>Позвонить</a>
                  <a href={canSee && order.address ? routeHref : "#"} target="_blank" rel="noreferrer" style={{ padding: "6px 9px", borderRadius: 9, background: canSee && order.address ? "linear-gradient(135deg,#d9ecff,#b6d8ff)" : "rgba(255,255,255,0.08)", border: canSee && order.address ? "1px solid rgba(105,174,239,0.38)" : "1px solid rgba(189,205,247,0.16)", color: canSee && order.address ? "#295b8c" : "#9bb0d5", fontSize: 10.5, fontWeight: 800, textDecoration: "none", pointerEvents: canSee && order.address ? "auto" : "none", opacity: 1, boxShadow: canSee && order.address ? "0 10px 20px rgba(105,174,239,0.1)" : "none" }}>Маршрут</a>
                  <button onClick={() => onStatusChange(order.key, "В пути")} disabled={returnedToOffice} style={{ padding: "6px 9px", borderRadius: 9, border: returnedToOffice ? "1px solid rgba(189,205,247,0.16)" : "1px solid rgba(62,157,212,0.44)", background: returnedToOffice ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#d9f2ff,#a9ddfb)", color: returnedToOffice ? "#9bb0d5" : "#245f81", fontSize: 10.5, fontWeight: 800, cursor: returnedToOffice ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: returnedToOffice ? "none" : "0 10px 20px rgba(62,157,212,0.12)" }}>В пути</button>
                  <button onClick={() => onStatusChange(order.key, "На объекте")} disabled={returnedToOffice} style={{ padding: "6px 9px", borderRadius: 9, border: returnedToOffice ? "1px solid rgba(189,205,247,0.16)" : "1px solid rgba(141,117,224,0.44)", background: returnedToOffice ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#eee5ff,#d2c0ff)", color: returnedToOffice ? "#9bb0d5" : "#4b3990", fontSize: 10.5, fontWeight: 800, cursor: returnedToOffice ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: returnedToOffice ? "none" : "0 10px 20px rgba(141,117,224,0.12)" }}>На объекте</button>
                  <button onClick={() => setCompleteDraft({
                    key: order.key,
                    baseComment: stripTechnicianComment(order.comment || ""),
                    technicianComment: "",
                    availableServices: getServiceChildren(serviceIndex, order.serviceSubcategoryId, "service").map((serviceNode) => ({
                      serviceId: serviceNode.id,
                      name: serviceNode.name,
                      unitPrice: String(serviceNode.price || ""),
                    })),
                    serviceItems: normalizeCompletionItems((order.serviceItems || []).map((item) => ({
                      ...item,
                      unitPrice: item.unitPrice || item.price || "",
                      officeLocked: true,
                    }))),
                    finalPrice: String(sumLineItems(order.serviceItems || []) || order.finalPrice || order.price || ""),
                  })} disabled={returnedToOffice} style={{ padding: "6px 9px", borderRadius: 9, border: returnedToOffice ? "1px solid rgba(189,205,247,0.16)" : "1px solid rgba(52,142,86,0.42)", background: returnedToOffice ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#dff6e6,#9bddb2)", color: returnedToOffice ? "#9bb0d5" : "#205c36", fontSize: 10.5, fontWeight: 800, cursor: returnedToOffice ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: returnedToOffice ? "none" : "0 10px 20px rgba(52,142,86,0.12)" }}>Завершить</button>
                </div>
              </div>
            );
          })}
        </div>

        {!dayOrders.length && <div style={{ textAlign: "center", padding: 28, color: "#6f82a8" }}>{mode === "today" ? "Сегодня заказов нет" : "Нет заказов на выбранный день"}</div>}
      </div>

      {isMobile && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "grid", gridTemplateColumns: "repeat(2,1fr)", background: "rgba(9,14,34,0.96)", borderTop: "1px solid rgba(255,255,255,0.1)", zIndex: 50 }}>
          {[
            { label: "📦 Заказы", active: !showRouteMap, action: () => { setShowRouteMap(false); setMode("week"); } },
            { label: "🧭 Маршрут", active: showRouteMap, action: () => setShowRouteMap(true) },
          ].map((item) => (
            <button key={item.label} onClick={item.action} style={{ height: 52, background: "transparent", border: "none", color: item.active ? "#64ffda" : "#91a4cb", fontSize: 11, fontFamily: "inherit", fontWeight: item.active ? 800 : 600 }}>{item.label}</button>
          ))}
        </div>
      )}

      {completeDraft && (
        <>
          <div onClick={() => setCompleteDraft(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200 }} />
          <div style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 1201, width: "min(430px,94vw)", background: "#1a1a2e", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 48px rgba(0,0,0,0.55)", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: "linear-gradient(135deg,#16213e,#0f3460)", fontSize: 14, fontWeight: 800, color: "#fff" }}>✅ Завершение заказа</div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase",letterSpacing:1}}>Выполненные работы</div>
                <button onClick={() => setCompleteDraft((prev) => ({ ...prev, serviceItems: [...(prev.serviceItems || []), { id: `manual-${Date.now()}`, serviceId: "", name: "", quantity: 1, unitPrice: "", officeLocked: false }] }))} style={{width:28,height:28,borderRadius:8,border:"1px solid rgba(100,255,218,0.25)",background:"rgba(100,255,218,0.12)",color:"#64ffda",fontSize:18,lineHeight:1,cursor:"pointer",fontFamily:"inherit"}}>+</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(completeDraft.serviceItems || []).map((item, index) => (
                  <div key={item.id || index} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 70px 94px 34px",gap:8,alignItems:"center"}}>
                    <CustomSelect
                      disabled={item.officeLocked}
                      value={item.serviceId || ""}
                      onChange={(nextValue) => {
                        const nextService = (completeDraft.availableServices || []).find((serviceItem) => serviceItem.serviceId === nextValue);
                        setCompleteDraft((prev) => ({
                          ...prev,
                          serviceItems: prev.serviceItems.map((serviceItem, serviceIndex) => serviceIndex === index ? {
                            ...serviceItem,
                            serviceId: nextValue,
                            name: nextService?.name || "",
                          } : serviceItem),
                        }));
                      }}
                      placeholder={completeDraft.availableServices?.length ? "Выбери услугу" : "Нет услуг в подуслуге"}
                      options={(completeDraft.availableServices || []).map((serviceOption) => ({ value: serviceOption.serviceId, label: serviceOption.name }))}
                      triggerStyle={{ minHeight: 38, borderRadius: 10, fontSize: 16, background: item.officeLocked ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)", color: item.officeLocked ? "#9fb1d1" : undefined }}
                      menuZIndex={1400}
                    />
                    <Fld disabled={item.officeLocked} value={String(item.quantity || 1)} onChange={(value) => setCompleteDraft((prev) => ({ ...prev, serviceItems: prev.serviceItems.map((serviceItem, serviceIndex) => serviceIndex === index ? { ...serviceItem, quantity: Math.max(1, Number(value.replace(/[^\d]/g, "") || 1)) } : serviceItem) }))} placeholder="1" />
                    <Fld disabled={item.officeLocked} value={String(item.unitPrice || "")} onChange={(value) => setCompleteDraft((prev) => ({ ...prev, serviceItems: prev.serviceItems.map((serviceItem, serviceIndex) => serviceIndex === index ? { ...serviceItem, unitPrice: value.replace(/[^\d]/g, "") } : serviceItem) }))} placeholder="Цена" />
                    <button disabled={item.officeLocked} onClick={() => setCompleteDraft((prev) => ({ ...prev, serviceItems: prev.serviceItems.filter((_, serviceIndex) => serviceIndex !== index) }))} style={{height:38,borderRadius:10,border:"1px solid rgba(255,82,82,0.25)",background:item.officeLocked?"rgba(255,255,255,0.04)":"rgba(255,82,82,0.12)",color:item.officeLocked?"#7282a5":"#ff9ea1",fontSize:14,cursor:item.officeLocked?"not-allowed":"pointer",fontFamily:"inherit"}}>×</button>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11,color:"#8fa1ca"}}>Итог по работам: <span style={{color:"#dff7ff",fontWeight:800}}>{formatCompletionItemsText(completeDraft.serviceItems || []) || "—"}</span></div>
              <Fld label="Комментарий по заказу" value={completeDraft.technicianComment} onChange={(value) => setCompleteDraft((prev) => ({ ...prev, technicianComment: value }))} multiline placeholder="Комментарий мастера по клиенту/заказу" />
              <div style={{padding:"10px 12px",borderRadius:10,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",fontSize:12,color:"#dff7ff",fontWeight:800}}>
                Окончательная стоимость: {sumLineItems(completeDraft.serviceItems || [])}₽
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCompleteDraft(null)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.05)", color: "#bcd0f7", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Отмена</button>
                <button onClick={async () => {
                  const normalizedItems = normalizeCompletionItems(completeDraft.serviceItems || []);
                  await onCompleteOrder(completeDraft.key, {
                    workDone: formatCompletionItemsText(normalizedItems),
                    finalPrice: String(sumLineItems(normalizedItems)),
                    comment: mergeTechnicianComment({ baseComment: completeDraft.baseComment, technicianComment: completeDraft.technicianComment, technicianName: technician?.name }),
                    serviceItems: normalizedItems,
                  });
                  setCompleteDraft(null);
                }} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#64ffda,#00bfa5)", color: "#0a0a23", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Сохранить</button>
              </div>
            </div>
          </div>
        </>
      )}

      {returnDraft && (
        <>
          <div onClick={() => setReturnDraft(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200 }} />
          <div style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 1201, width: "min(430px,94vw)", background: "#1a1a2e", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 48px rgba(0,0,0,0.55)", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: "linear-gradient(135deg,#3a1622,#6a1d2d)", fontSize: 14, fontWeight: 800, color: "#fff" }}>↩ Вернуть в офис</div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{fontSize:11,color:"#d8e2ff"}}>Укажи причину возврата. Офис увидит её в комментарии к заказу и на карточке появится отметка внимания.</div>
              <Fld
                label="Причина возврата"
                value={returnDraft.reason}
                onChange={(value) => setReturnDraft((prev) => ({ ...prev, reason: value }))}
                multiline
                placeholder="Причина возврата"
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setReturnDraft(null)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.05)", color: "#bcd0f7", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Отмена</button>
                <button
                  onClick={async () => {
                    const trimmedReason = String(returnDraft.reason || "").trim();
                    if (!trimmedReason) return;
                    await onReturnToOffice?.(returnDraft.key, trimmedReason);
                    setReturnDraft(null);
                  }}
                  disabled={!String(returnDraft.reason || "").trim()}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: String(returnDraft.reason || "").trim() ? "linear-gradient(135deg,#ff8a98,#e5536d)" : "#3a3f57", color: String(returnDraft.reason || "").trim() ? "#fff" : "#8893b0", fontSize: 12, fontWeight: 800, cursor: String(returnDraft.reason || "").trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}
                >
                  Отправить
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showRouteMap && (() => {
        const routePins = dayOrders
          .filter(o => o.address || (o.lat && o.lng))
          .map((o, i) => ({
            lat: o.lat ? Number(o.lat) : 0, lon: o.lng ? Number(o.lng) : 0,
            pinColor: hexToPinColor(technician.color, i),
            label: `${slotLabel(o.timeIdx)}–${getOrderEndLabel(o)} · ${o.name || "Клиент"} · ${o.status}`,
            address: o.address || "",
            city: technician.city,
            legend: technician.name,
            legendColor: technician.color,
          }));
        return <MultiPinMapModal pins={routePins} title={`🧭 Маршрут · ${technician.name} · ${formatShortDate(selectedDate)}`} onClose={() => setShowRouteMap(false)} />;
      })()}
    </div>
  );
};

/* ====== SUMMARY ====== */
const SummaryView = ({orders,activeCity,statuses = INIT_STATUSES,onOrderClick,onClose}) => {
  const isMobileView = typeof window !== "undefined" ? window.innerWidth < 760 : false;
  const co=Object.entries(orders).filter(([k])=>k.startsWith(activeCity+"|")).map(([k,v])=>{const p=k.split("|");return{...v,master:p[1],dateStr:p[2],timeIdx:parseInt(p[3]),key:k};}).sort((a,b)=>a.dateStr.localeCompare(b.dateStr)||a.timeIdx-b.timeIdx);
  const statusMap = useMemo(() => makeStatusMap(statuses), [statuses]);
  const byM={};co.forEach(o=>{if(!byM[o.master])byM[o.master]=[];byM[o.master].push(o);});
  const byS={};co.forEach(o=>{byS[o.status]=(byS[o.status]||0)+1;});
  const bySrc={};co.forEach(o=>{if(o.source)bySrc[o.source]=(bySrc[o.source]||0)+1;});
  const rev=co.reduce((s,o)=>s+(parseInt(o.price)||0),0);
  return (<div style={{padding:20,maxWidth:1200,margin:"0 auto",position:"relative"}}>
    <div style={{position:"relative",marginBottom:16,paddingRight:onClose ? 52 : 0}}>
      {onClose && <button type="button" onClick={onClose} style={{...floatingCloseButtonStyle, top: 6, right: 6}}>×</button>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8}}>
      {[{l:"Всего",v:co.length,c:"#64ffda"},{l:"Подтв.",v:byS["Подтверждён"]||0,c:"#81c784"},{l:"Выполн.",v:byS["Выполнен"]||0,c:"#ce93d8"},{l:"Новых",v:byS["Новый"]||0,c:"#ffab40"},{l:"Отменён",v:byS["Отменён"]||0,c:"#ef5350"},{l:"Выручка",v:`${rev.toLocaleString()}₽`,c:"#fff"}].map((s,i)=>(<div key={i} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px",border:"1px solid rgba(255,255,255,0.06)"}}><div style={{fontSize:9,color:"#5a6a8a",letterSpacing:1}}>{s.l}</div><div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div></div>))}
      </div>
    </div>
    {Object.keys(bySrc).length>0&&(<div style={{marginBottom:16,padding:12,background:"rgba(255,255,255,0.03)",borderRadius:10,border:"1px solid rgba(255,255,255,0.05)"}}><div style={{fontSize:10,color:"#64ffda",fontWeight:700,marginBottom:6}}>📢 ИСТОЧНИКИ</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).map(([s,n])=>(<div key={s} style={{padding:"4px 10px",borderRadius:7,background:"rgba(255,255,255,0.06)",fontSize:11}}><span style={{color:"#ccd6f6"}}>{s}</span><span style={{color:"#64ffda",fontWeight:800,marginLeft:4}}>{n}</span></div>))}</div></div>)}
    {Object.entries(byM).map(([m,mo])=>(<div key={m} style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:800,color:"#64ffda",marginBottom:5,padding:"5px 10px",background:"rgba(100,255,218,0.06)",borderRadius:7,display:"inline-block"}}>👷 {m} — {mo.length} · {mo.reduce((s,o)=>s+(parseInt(o.price)||0),0).toLocaleString()}₽</div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>{mo.map((o,i)=>{const meta=statusMeta(o.status, statusMap);return(<div key={i} onClick={()=>onOrderClick(o.key)} style={{display:"grid",gridTemplateColumns:isMobileView?"48px 72px minmax(0,1fr) 84px":"55px 55px 1fr 70px 95px",gap:isMobileView?4:8,padding:"7px 10px",background:meta.cardBg,borderRadius:7,border:`1px solid ${meta.cardBorder}`,alignItems:"center",fontSize:11,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        <div style={{fontWeight:700,color:meta.cardText,whiteSpace:"nowrap"}}>{o.dateStr.slice(8)}.{o.dateStr.slice(5,7)}</div>
        <div style={{color:meta.accent,fontWeight:700,fontFamily:"monospace",fontSize:10,whiteSpace:"nowrap",marginLeft:isMobileView?-2:0}}>{slotLabel(o.timeIdx)}-{getOrderEndLabel(o)}</div>
        <div style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",color:meta.cardText}}><b style={{color:meta.cardText}}>{o.name}</b>{!isMobileView && <> <span style={{color:meta.cardText,fontSize:10,opacity:0.78}}>🔧 {o.workOrder||"—"}</span> <span style={{color:meta.cardText,fontSize:10,opacity:0.64}}>· {o.address}</span></>}</div>
        {!isMobileView && <div style={{fontSize:9,color:meta.cardText,opacity:0.8}}>{o.price?o.price+"₽":""}</div>}
        <div style={{padding:"3px 10px",borderRadius:999,fontSize:8,fontWeight:800,textAlign:"center",background:meta.pillBg,border:`1px solid ${meta.pillBorder}`,color:meta.pillText,whiteSpace:"nowrap"}}>{o.status}</div>
      </div>);})}</div></div>))}
    {co.length===0&&<div style={{textAlign:"center",padding:50,color:"#5a6a8a"}}>📋 Нет заказов</div>}
  </div>);
};

const ServiceEditorPopup = ({ draft, parentNode, saving, onSave, onClose }) => {
  const [name, setName] = useState(draft?.name || "");
  const [price, setPrice] = useState(draft?.price || "");
  const meta = SERVICE_TYPE_META[draft.type];
  const canSave = name.trim() && (draft.type !== "service" || price !== "");

  useEffect(() => {
    setName(draft?.name || "");
    setPrice(draft?.price || "");
  }, [draft]);

  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.46)",zIndex:1200,backdropFilter:"blur(6px)"}} />
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1201,width:430,maxWidth:"calc(100vw - 24px)",borderRadius:16,overflow:"hidden",background:"#181b33",border:"1px solid rgba(255,255,255,0.08)",boxShadow:"0 30px 80px rgba(0,0,0,0.42)",animation:"modalIn 0.22s cubic-bezier(0.2,0.8,0.2,1)"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{color:"#fff",fontWeight:800,fontSize:18}}>{draft.id ? "Редактировать" : "Добавить"} · {meta.label}</div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:34,height:34,borderRadius:10,cursor:"pointer",fontSize:15}}>✕</button>
        </div>
        <div style={{padding:18,display:"flex",flexDirection:"column",gap:14}}>
          {parentNode && <div style={{padding:"10px 12px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",fontSize:12,color:"#9fb1d1"}}>Внутри: <span style={{color:"#dbe4ff",fontWeight:700}}>{parentNode.name}</span></div>}
          <div>
            <div style={{fontSize:11,color:"#8fa1ca",fontWeight:700,marginBottom:6}}>НАЗВАНИЕ</div>
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder={draft.type === "direction" ? "Например: Кондиционеры" : draft.type === "subcategory" ? "Например: Ремонт" : "Например: Чистка"} style={{width:"100%",height:46,borderRadius:12,border:"1px solid rgba(255,255,255,0.09)",background:"rgba(255,255,255,0.045)",padding:"0 14px",color:"#e6f1ff",fontSize:15,outline:"none"}} />
          </div>
          {draft.type === "service" && <div>
            <div style={{fontSize:11,color:"#8fa1ca",fontWeight:700,marginBottom:6}}>СТОИМОСТЬ</div>
            <input value={price} onChange={(e)=>setPrice(e.target.value.replace(/[^\d]/g,""))} placeholder="Например: 2500" style={{width:"100%",height:46,borderRadius:12,border:"1px solid rgba(255,255,255,0.09)",background:"rgba(255,255,255,0.045)",padding:"0 14px",color:"#e6f1ff",fontSize:15,outline:"none"}} />
          </div>}
          <button disabled={!canSave || saving} onClick={()=>onSave({ ...draft, name: name.trim(), price: draft.type === "service" ? price : "" })} style={{height:52,borderRadius:14,border:"none",background:(!canSave || saving) ? "rgba(255,255,255,0.12)" : "linear-gradient(135deg,#65ffdd,#18c5be)",color:(!canSave || saving) ? "#8f9bb9" : "#0a0a23",fontSize:16,fontWeight:900,cursor:(!canSave || saving) ? "not-allowed" : "pointer",fontFamily:"inherit"}}>{saving ? "Сохраняю..." : draft.id ? "Сохранить" : draft.type === "direction" ? "Добавить направление" : draft.type === "subcategory" ? "Добавить тип работ" : "Добавить услугу"}</button>
        </div>
      </div>
    </>
  );
};

const ServiceCatalogView = ({ services, onAddRoot, onAddChild, onEdit, onDelete, currentUser, onClose }) => {
  const isMobileView = typeof window !== "undefined" ? window.innerWidth < 760 : false;
  const tree = useMemo(() => buildServiceTree(services), [services]);
  const [expanded, setExpanded] = useState(() => {
    const next = {};
    (services || []).forEach((node) => {
      if (node.type !== "service") next[node.id] = true;
    });
    return next;
  });

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      (services || []).forEach((node) => {
        if (node.type !== "service" && next[node.id] === undefined) next[node.id] = true;
      });
      return next;
    });
  }, [services]);

  const renderNode = (node, depth = 0) => {
    const meta = SERVICE_TYPE_META[node.type];
    const hasChildren = node.children?.length > 0;
    const isExpanded = expanded[node.id] !== false;
    const mobileIndent = depth === 0 ? 0 : depth === 1 ? 14 : 28;
    return (
      <div key={node.id} style={{marginBottom:8}}>
        <div style={{display:"flex",alignItems:isMobileView?"stretch":"center",justifyContent:"space-between",flexDirection:isMobileView?"column":"row",gap:isMobileView?10:12,padding:isMobileView?"12px":"12px 14px",paddingLeft:isMobileView?12 + mobileIndent:14 + depth * 26,borderRadius:14,background:node.type === "direction" ? "rgba(100,255,218,0.08)" : node.type === "subcategory" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.035)",border:node.type === "direction" ? "1px solid rgba(100,255,218,0.18)" : "1px solid rgba(255,255,255,0.08)"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
            {node.type !== "service" ? (
              <button onClick={()=>setExpanded((prev)=>({ ...prev, [node.id]: !isExpanded }))} style={{width:28,height:28,borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#dbe4ff",cursor:"pointer",fontSize:13}}>
                {hasChildren ? (isExpanded ? "▾" : "▸") : "•"}
              </button>
            ) : <div style={{width:28,height:28}} />}
            <div style={{minWidth:0}}>
              <div style={{fontSize:15,fontWeight:800,color:"#e6f1ff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{meta.icon} {node.name}</div>
              <div style={{fontSize:11,color:"#8fa1ca",marginTop:3}}>{meta.label}{node.type === "service" ? ` · ${Number(node.price || 0).toLocaleString("ru-RU")} ₽` : ""}</div>
            </div>
          </div>
          {currentUser?.role === "admin" && <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap",marginLeft:isMobileView?40:0}}>
            {node.type !== "service" && <button onClick={()=>onAddChild(node)} className="tb" style={{padding:"7px 10px",borderRadius:9,border:"1px solid rgba(100,255,218,0.2)",background:"rgba(100,255,218,0.08)",color:"#64ffda",fontSize:11,fontWeight:700}}>{node.type === "direction" ? "+ Тип работ" : "+ Услуга"}</button>}
            <button onClick={()=>onEdit(node)} className="tb" style={{padding:"7px 10px",borderRadius:9,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",color:"#dbe4ff",fontSize:11,fontWeight:700}}>Изменить</button>
            <button onClick={()=>onDelete(node)} className="tb" style={{padding:"7px 10px",borderRadius:9,border:"1px solid rgba(255,82,82,0.26)",background:"rgba(255,82,82,0.12)",color:"#ff9ea1",fontSize:11,fontWeight:700}}>Удалить</button>
          </div>}
        </div>
        {hasChildren && isExpanded && <div style={{marginTop:8}}>
          {node.children.map((child) => renderNode(child, depth + 1))}
        </div>}
      </div>
    );
  };

  return (
    <div style={{padding:isMobileView?14:20,maxWidth:1260,margin:"0 auto",position:"relative"}}>
      {onClose && <button type="button" onClick={onClose} style={floatingCloseButtonStyle}>×</button>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:isMobileView?"stretch":"center",flexDirection:isMobileView?"column":"row",gap:12,flexWrap:"wrap",marginBottom:18,paddingRight:56}}>
        <div>
          <div style={{fontSize:26,fontWeight:900,color:"#dff7ff"}}>Справочник услуг</div>
          <div style={{fontSize:13,color:"#8fa1ca",marginTop:4}}>Иерархия: направление → тип работ → услуга со стоимостью</div>
        </div>
        {currentUser?.role === "admin" && <button onClick={onAddRoot} className="tb" style={{height:44,padding:"0 16px",borderRadius:12,fontSize:13,fontWeight:800,background:"linear-gradient(135deg,#65ffdd,#18c5be)",color:"#0a0a23"}}>+ Добавить направление</button>}
      </div>
      <div style={{padding:16,borderRadius:18,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)"}}>
        {tree.length ? tree.map((node) => renderNode(node)) : (
          <div style={{padding:"32px 18px",textAlign:"center",color:"#7f92ba"}}>
            <div style={{fontSize:38,marginBottom:8}}>🗂</div>
            <div style={{fontSize:16,fontWeight:700,color:"#c7d3f5"}}>Справочник пока пуст</div>
            <div style={{fontSize:13,marginTop:6}}>Начни с создания первого направления услуг.</div>
          </div>
        )}
      </div>
    </div>
  );
};

const EmployeesPage = ({
  employees,
  groupedEmployees,
  visibleCities,
  currentUser,
  onOpenEmployee,
  onAddEmployee,
  onProvisionAccess,
  onEditAccess,
  onOpenPermissions,
  onDeleteEmployee,
  onClose,
}) => {
  const isMobileView = typeof window !== "undefined" ? window.innerWidth < 760 : false;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");

  const accessCount = employees.filter((employee) => employee.authUserId).length;
  const noAccessCount = employees.length - accessCount;

  const filterMeta = [
    { key: "all", label: `Все · ${employees.length}`, dot: "#64ffda", activeBg: "#64ffda", activeColor: "#0a0a23" },
    { key: "admin", label: `Владельцы · ${groupedEmployees.admins.length}`, dot: "#FFB74D" },
    { key: "call_center", label: `Колл-центр · ${groupedEmployees.callCenter.length}`, dot: "#F48FB1" },
    { key: "technician", label: `Мастера · ${groupedEmployees.technicians.length}`, dot: "#4FC3F7" },
    { key: "no_access", label: `Без доступа · ${noAccessCount}`, dot: "#5a6a8a" },
  ];

  const matchesSearch = useCallback((employee) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [
      employee.name,
      employee.phone,
      employee.city,
      employee.authEmail,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
  }, [search]);

  const matchesFilter = useCallback((employee) => {
    if (filter === "all") return true;
    if (filter === "no_access") return !employee.authUserId;
    return employee.type === filter;
  }, [filter]);

  const matchesCity = useCallback((employee) => {
    if (cityFilter === "all") return true;
    return (employee.city || "") === cityFilter;
  }, [cityFilter]);

  const matchesAccess = useCallback((employee) => {
    if (accessFilter === "all") return true;
    if (accessFilter === "with_access") return Boolean(employee.authUserId);
    if (accessFilter === "no_access") return !employee.authUserId;
    return true;
  }, [accessFilter]);

  const visibleEmployees = useMemo(() => employees.filter((employee) => matchesFilter(employee) && matchesSearch(employee) && matchesCity(employee) && matchesAccess(employee)), [employees, matchesAccess, matchesCity, matchesFilter, matchesSearch]);
  const visibleIds = new Set(visibleEmployees.map((employee) => employee.id));
  const filteredGroups = {
    admins: groupedEmployees.admins.filter((employee) => visibleIds.has(employee.id)),
    callCenter: groupedEmployees.callCenter.filter((employee) => visibleIds.has(employee.id)),
    technicians: groupedEmployees.technicians.filter((employee) => visibleIds.has(employee.id)),
  };

  const EmployeeRow = ({ employee, compactMeta }) => (
    <div onClick={() => onOpenEmployee(employee, { fromList: true })} style={{display:"flex",alignItems:isMobileView?"stretch":"center",justifyContent:"space-between",flexDirection:isMobileView?"column":"row",gap:isMobileView?10:12,padding:isMobileView?"10px 12px":"0 16px",minHeight:isMobileView?0:56,borderRadius:10,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0,width:isMobileView?"100%":"auto"}}>
        <div style={{width:28,height:28,borderRadius:14,background:`${employee.color}33`,border:`1px solid ${employee.color}66`,display:"flex",alignItems:"center",justifyContent:"center",color:employee.color,fontSize:12,fontWeight:800,flexShrink:0}}>{masterInitial(employee.name)}</div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:13,color:"#e6f1ff",fontWeight:600,whiteSpace:isMobileView?"normal":"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.15}}>{employee.name}</div>
          <div style={{fontSize:10,color:"#5a6a8a",marginTop:2}}>
            {employee.authUserId ? "Доступ выдан" : "Без доступа"}{compactMeta ? ` · ${compactMeta}` : ""}
          </div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap",width:isMobileView?"100%":"auto",justifyContent:isMobileView?"flex-start":"flex-end"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:isEmployeeOnline(employee) ? "#81c784" : "#5a6a8a",marginRight:isMobileView?6:0}}>
          <span style={{width:6,height:6,borderRadius:3,background:isEmployeeOnline(employee) ? "#4caf50" : "#5a6a8a",display:"inline-block"}} />
          {isEmployeeOnline(employee) ? "в сети" : "не в сети"}
        </div>
        {!employee.authUserId && canManageEmployees(currentUser) && <button onClick={(e)=>{e.stopPropagation();onProvisionAccess(employee);}} className="tb" style={{height:28,padding:"0 12px",borderRadius:6,border:"1px solid rgba(100,255,218,0.25)",background:"rgba(100,255,218,0.08)",color:"#64ffda",fontSize:11,fontWeight:500}}>Выдать доступ</button>}
        {employee.authUserId && canManageEmployees(currentUser) && <button onClick={(e)=>{e.stopPropagation();onEditAccess(employee);}} className="tb" style={{height:28,padding:"0 12px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#ccd6f6",fontSize:11,fontWeight:500}}>Доступ</button>}
        {canManageEmployees(currentUser) && employee.type === "call_center" && <button onClick={(e)=>{e.stopPropagation();onOpenPermissions(employee);}} className="tb" style={{height:28,padding:"0 12px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#ccd6f6",fontSize:11,fontWeight:500}}>Права</button>}
        {canManageEmployees(currentUser) && <button onClick={(e)=>{e.stopPropagation();onDeleteEmployee(employee);}} className="tb" style={{width:22,height:28,borderRadius:6,border:"1px solid rgba(255,82,82,0.3)",background:"rgba(255,82,82,0.1)",color:"#ff5252",fontSize:11,fontWeight:700}}>×</button>}
      </div>
    </div>
  );

  return (
    <div style={{padding:"18px 20px 28px",maxWidth:1260,margin:"0 auto",position:"relative"}}>
      {onClose && <button type="button" onClick={onClose} style={floatingCloseButtonStyle}>×</button>}
      <div style={{fontSize:11,color:"#5a6a8a",marginBottom:18}}>Главная <span style={{margin:"0 6px"}}>›</span> <span style={{color:"#e6f1ff",fontWeight:500}}>Сотрудники</span></div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap",marginBottom:14,paddingRight:56}}>
        <div>
          <div style={{fontSize:28,fontWeight:500,color:"#e6f1ff",lineHeight:1.1}}>Сотрудники</div>
          <div style={{fontSize:11,color:"#5a6a8a",marginTop:10}}>
            {employees.length} человек · {accessCount} с активным доступом · {noAccessCount} без доступа
          </div>
        </div>
        {canManageEmployees(currentUser) && <button onClick={onAddEmployee} className="tb" style={{height:30,padding:"0 18px",borderRadius:6,background:"#64ffda",color:"#0a0a23",fontSize:11,fontWeight:500}}>+ Добавить сотрудника</button>}
      </div>

      <div style={{padding:"10px 12px",borderRadius:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",marginBottom:16}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          {filterMeta.map((item) => {
            const active = filter === item.key;
            return (
              <button key={item.key} onClick={() => setFilter(item.key)} className="tb" style={{height:24,padding:"0 12px",borderRadius:6,border:active ? "none" : "1px solid rgba(255,255,255,0.08)",background:active ? item.activeBg || "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",color:active ? item.activeColor || "#0a0a23" : "#8892b0",fontSize:10,fontWeight:500,display:"inline-flex",alignItems:"center",gap:8}}>
                {!active && <span style={{width:6,height:6,borderRadius:3,background:item.dot,display:"inline-block"}} />}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{display:"flex",gap:10,alignItems:"center",padding:"0 12px",height:40,borderRadius:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",marginBottom:22}}>
        <div style={{fontSize:11,color:"#5a6a8a"}}>🔍</div>
        <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Поиск по имени, телефону, городу..." style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#dbe4ff",fontSize:11,fontFamily:"inherit"}} />
        <CustomSelect
          value={cityFilter}
          onChange={setCityFilter}
          options={[{ value: "all", label: "Все города" }, ...Object.keys(visibleCities).map((cityName) => ({ value: cityName, label: cityName }))]}
          triggerStyle={{ minHeight: 24, padding: "4px 26px 4px 10px", borderRadius: 6, fontSize: 10, width: 120, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8892b0" }}
          menuZIndex={1200}
        />
        <CustomSelect
          value={accessFilter}
          onChange={setAccessFilter}
          options={[
            { value: "all", label: "Все статусы" },
            { value: "with_access", label: "С доступом" },
            { value: "no_access", label: "Без доступа" },
          ]}
          triggerStyle={{ minHeight: 24, padding: "4px 26px 4px 10px", borderRadius: 6, fontSize: 10, width: 120, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8892b0" }}
          menuZIndex={1200}
        />
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        {filteredGroups.admins.length > 0 && (
          <div>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"4px 10px",borderRadius:5,background:"rgba(255,183,77,0.08)",marginBottom:10}}>
              <span style={{width:3,height:14,borderRadius:2,background:"#FFB74D",display:"inline-block"}} />
              <span style={{fontSize:12,fontWeight:700,color:"#ffd580"}}>Владельцы · {filteredGroups.admins.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {filteredGroups.admins.map((employee) => <EmployeeRow key={employee.id || empKey(employee)} employee={employee} compactMeta={null} />)}
            </div>
          </div>
        )}

        {filteredGroups.callCenter.length > 0 && (
          <div>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"4px 10px",borderRadius:5,background:"rgba(244,143,177,0.08)",marginBottom:10}}>
              <span style={{width:3,height:14,borderRadius:2,background:"#F48FB1",display:"inline-block"}} />
              <span style={{fontSize:12,fontWeight:700,color:"#ffb8cc"}}>Колл-центр · {filteredGroups.callCenter.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {filteredGroups.callCenter.map((employee) => <EmployeeRow key={employee.id || empKey(employee)} employee={employee} compactMeta={null} />)}
            </div>
          </div>
        )}

        {canViewTechnicianCards(currentUser) && Object.keys(visibleCities).map((cityName) => {
          const rows = filteredGroups.technicians.filter((employee) => employee.city === cityName);
          if (!rows.length) return null;
          return (
            <div key={cityName}>
              <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"4px 10px",borderRadius:5,background:`${visibleCities[cityName].color}1a`,marginBottom:10}}>
                <span style={{width:3,height:14,borderRadius:2,background:visibleCities[cityName].color,display:"inline-block"}} />
              <span style={{fontSize:12,fontWeight:700,color:visibleCities[cityName].color}}>{cityName} · {pluralizeTechnicians(rows.length)}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {rows.map((employee) => <EmployeeRow key={employee.id || empKey(employee)} employee={employee} compactMeta={employee.city} />)}
              </div>
            </div>
          );
        })}

        {!canViewTechnicianCards(currentUser) && currentUser?.role === "call_center" && (
          <div style={{padding:"12px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",fontSize:12,color:"#8892b0"}}>
            Доступ к карточкам мастеров выключен. В расписании мастера видны по имени, но на странице сотрудников они скрыты.
          </div>
        )}

        {!visibleEmployees.length && (
          <div style={{padding:"42px 16px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",textAlign:"center",color:"#7f92ba"}}>
            По текущему фильтру сотрудники не найдены.
          </div>
        )}
      </div>
    </div>
  );
};

const CityDeletePopup = ({ draft, employees, onChooseMode, onConfirm, onClose }) => {
  if (!draft?.cityName) return null;
  const techniciansCount = employees.filter((employee) => employee.type === "technician" && employee.city === draft.cityName).length;
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.46)",zIndex:1300,backdropFilter:"blur(6px)"}} />
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1301,width:420,maxWidth:"calc(100vw - 24px)",borderRadius:16,overflow:"hidden",background:"#181b33",border:"1px solid rgba(255,255,255,0.08)",boxShadow:"0 30px 80px rgba(0,0,0,0.42)"}}>
        <div style={{background:"linear-gradient(135deg,#16213e,#0f3460)",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{color:"#fff",fontWeight:800,fontSize:18}}>Удаление города</div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",width:34,height:34,borderRadius:10,cursor:"pointer",fontSize:15}}>✕</button>
        </div>
        <div style={{padding:18,display:"flex",flexDirection:"column",gap:14}}>
          {draft.step === 1 ? (
            <>
              <div style={{fontSize:14,color:"#dbe4ff",fontWeight:700}}>Что удалить для города «{draft.cityName}»?</div>
              <button onClick={() => onChooseMode("city_only")} className="tb" style={{height:48,borderRadius:12,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",color:"#dbe4ff",fontSize:14,fontWeight:700}}>Удалить город</button>
              <button onClick={() => onChooseMode("with_employees")} className="tb" style={{height:48,borderRadius:12,border:"1px solid rgba(255,82,82,0.22)",background:"rgba(255,82,82,0.12)",color:"#ffb2b6",fontSize:14,fontWeight:700}}>Удалить город с мастерами</button>
              <div style={{fontSize:12,color:"#8fa1ca"}}>Сейчас в городе мастеров: {techniciansCount}</div>
            </>
          ) : (
            <>
              <div style={{fontSize:14,color:"#dbe4ff",fontWeight:700}}>Вы уверены, что хотите удалить?</div>
              <div style={{fontSize:12,color:"#8fa1ca"}}>{draft.mode === "with_employees" ? `Будут удалены город, мастера и связанные заявки для «${draft.cityName}».` : `Будет удалён только город «${draft.cityName}».`}</div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={onClose} className="tb" style={{flex:1,height:46,borderRadius:12,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",color:"#dbe4ff",fontSize:14,fontWeight:700}}>Отмена</button>
                <button onClick={onConfirm} className="tb" style={{flex:1,height:46,borderRadius:12,border:"none",background:"linear-gradient(135deg,#ff8a80,#ff5252)",color:"#fff",fontSize:14,fontWeight:800}}>Да, удалить</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

const DataAccordionCard = ({ title, description, expanded, onToggle, children }) => (
  <div style={{padding:14,borderRadius:18,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",gap:10}}>
    <button
      type="button"
      onClick={onToggle}
      style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,background:"transparent",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}
    >
      <div>
        <div style={{fontSize:18,fontWeight:800,color:"#dff7ff"}}>{title}</div>
        {!!description && <div style={{fontSize:12,color:"#8fa1ca",marginTop:3}}>{description}</div>}
      </div>
      <span style={{fontSize:14,color:"#8fa1ca",transform:expanded ? "rotate(90deg)" : "rotate(0deg)",transition:"transform .2s ease",paddingTop:4}}>▸</span>
    </button>
    <div style={{display:"grid",gridTemplateRows:expanded ? "1fr" : "0fr",transition:"grid-template-rows .24s ease"}}>
      <div style={{overflow:"hidden"}}>
        <div style={{paddingTop:expanded ? 2 : 0,opacity:expanded ? 1 : 0,transform:expanded ? "translateY(0)" : "translateY(-6px)",transition:"opacity .2s ease, transform .2s ease"}}>
          {children}
        </div>
      </div>
    </div>
  </div>
);

const DataAdminView = ({
  cities,
  sources,
  statuses,
  contactStatuses,
  contactReasons,
  currentUser,
  onAddCity,
  onDeleteCity,
  onUpdateSource,
  onDeleteSource,
  onAddSource,
  onAddStatus,
  onDeleteStatus,
  onAddContactStatus,
  onDeleteContactStatus,
  onAddContactReason,
  onDeleteContactReason,
  onClose,
}) => {
  const isMobileView = typeof window !== "undefined" ? window.innerWidth < 760 : false;
  const [cityName, setCityName] = useState("");
  const [cityColor, setCityColor] = useState("#1565C0");
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [cityCoords, setCityCoords] = useState(null);
  const [sourceName, setSourceName] = useState("");
  const [statusName, setStatusName] = useState("");
  const [contactStatusName, setContactStatusName] = useState("");
  const [contactReasonName, setContactReasonName] = useState("");
  const [contactReasonStatus, setContactReasonStatus] = useState("");
  const [editingSource, setEditingSource] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [expandedReasonGroups, setExpandedReasonGroups] = useState({});
  const [expandedDataSections, setExpandedDataSections] = useState({
    cities: false,
    sources: false,
    orderStatuses: false,
    callStatuses: false,
    callStatusReasons: false,
  });
  const cityPalette = ["#1565C0","#2E7D32","#6A1B9A","#E65100","#AD1457","#00695C","#F57F17","#283593","#4E342E","#37474F"];
  const groupedContactReasons = useMemo(() => {
    const grouped = new Map();
    (contactReasons || []).forEach((reason) => {
      if (!grouped.has(reason.statusName)) grouped.set(reason.statusName, []);
      grouped.get(reason.statusName).push(reason);
    });
    return Array.from(grouped.entries()).map(([statusName, reasons]) => ({
      statusName,
      reasons: [...reasons].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, "ru")),
    })).sort((a, b) => {
      const aIndex = (contactStatuses || []).findIndex((item) => item.name === a.statusName);
      const bIndex = (contactStatuses || []).findIndex((item) => item.name === b.statusName);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
  }, [contactReasons, contactStatuses]);

  useEffect(() => {
    if (!cityName.trim() || cityName.trim().length < 2) {
      setCitySuggestions([]);
      return undefined;
    }
    const timerId = window.setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}&limit=6&accept-language=ru&featuretype=city`);
        const data = await response.json();
        const nextSuggestions = data.map((item) => {
          const parts = `${item.display_name || ""}`.split(",");
          return {
            label: (parts[0] || "").trim(),
            lat: Number(item.lat),
            lng: Number(item.lon),
          };
        }).filter((item, index, arr) => item.label && arr.findIndex((candidate) => candidate.label.toLowerCase() === item.label.toLowerCase()) === index);
        setCitySuggestions(nextSuggestions);
      } catch {
        setCitySuggestions([]);
      }
    }, 250);
    return () => window.clearTimeout(timerId);
  }, [cityName]);

  useEffect(() => {
    setExpandedReasonGroups((prev) => {
      const next = {};
      groupedContactReasons.forEach((group, index) => {
        next[group.statusName] = prev[group.statusName] ?? index === 0;
      });
      return next;
    });
  }, [groupedContactReasons]);

  return (
      <div style={{padding:isMobileView?"14px 12px 20px":"18px 20px",maxWidth:1260,margin:"0 auto",display:"flex",flexDirection:"column",gap:14,position:"relative"}}>
      {onClose && <button type="button" onClick={onClose} style={floatingCloseButtonStyle}>×</button>}
      <div>
        <div style={{fontSize:26,fontWeight:900,color:"#dff7ff"}}>Данные</div>
        <div style={{fontSize:13,color:"#8fa1ca",marginTop:4}}>Города для основной сетки CRM и источники заявок для карточки заказа.</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobileView?"1fr":"minmax(320px, 0.95fr) minmax(420px, 1.05fr)",gap:14,alignItems:"start"}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <DataAccordionCard
          title="Города"
          description={`${Object.keys(cities).length} активных городов`}
          expanded={expandedDataSections.cities}
          onToggle={() => setExpandedDataSections((prev) => ({ ...prev, cities: !prev.cities }))}
        >
          <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
            {Object.entries(cities).map(([name, city]) => (
              <div key={name} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 9px 7px 11px",borderRadius:999,background:`${city.color}22`,border:`1px solid ${city.color}55`,color:"#e6f1ff",fontSize:11,fontWeight:700}}>
                <span style={{width:8,height:8,borderRadius:4,background:city.color,display:"inline-block"}} />
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() => onDeleteCity?.(name)}
                  style={{width:22,height:22,borderRadius:11,border:"1px solid rgba(255,120,120,0.24)",background:"rgba(255,82,82,0.1)",color:"#ff9ea1",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}
                  title={`Удалить город ${name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{paddingTop:6,borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:8}}>
            <div style={{position:"relative"}}>
              <Fld label="Новый город" value={cityName} onChange={(value)=>{setCityName(value);setCityCoords(null);}} placeholder="Начни вводить название города" />
              {!!citySuggestions.length && (
                <div style={{position:"absolute",left:0,right:0,top:"calc(100% - 2px)",zIndex:20,background:"#1e1e38",border:"1px solid rgba(100,255,218,0.18)",borderRadius:12,overflow:"hidden",boxShadow:"0 10px 30px rgba(0,0,0,0.35)"}}>
                  {citySuggestions.map((item) => (
                    <button key={`${item.label}-${item.lat}-${item.lng}`} type="button" onClick={()=>{setCityName(item.label);setCityCoords({ lat:item.lat, lng:item.lng });setCitySuggestions([]);}} style={{width:"100%",textAlign:"left",padding:"10px 12px",border:"none",borderTop:"1px solid rgba(255,255,255,0.05)",background:"transparent",color:"#dbe4ff",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={{fontSize:10,color:"#8892b0",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Цвет города</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{cityPalette.map((color)=><button key={color} type="button" onClick={()=>setCityColor(color)} style={{width:24,height:24,borderRadius:7,border:cityColor===color?"2px solid #fff":"1px solid rgba(255,255,255,0.12)",background:color,cursor:"pointer"}} />)}</div>
            </div>
            <button type="button" disabled={!cityName.trim()} onClick={()=>{onAddCity(cityName.trim(), cityColor, cityCoords);setCityName("");setCityCoords(null);setCitySuggestions([]);}} style={{height:36,borderRadius:11,border:"none",background:cityName.trim()?"linear-gradient(135deg,#65ffdd,#18c5be)":"rgba(255,255,255,0.12)",color:cityName.trim()?"#0a0a23":"#8f9bb9",fontSize:11,fontWeight:800,cursor:cityName.trim()?"pointer":"not-allowed",fontFamily:"inherit"}}>+ Добавить город</button>
            {!!cityCoords && <div style={{fontSize:10,color:"#64ffda"}}>Город выбран из подсказок, координаты подставятся автоматически.</div>}
          </div>
        </DataAccordionCard>

        <DataAccordionCard
          title="Статусы звонков"
          description="Справочник статусов для экрана контактов и быстрых табов колл-центра."
          expanded={expandedDataSections.callStatuses}
          onToggle={() => setExpandedDataSections((prev) => ({ ...prev, callStatuses: !prev.callStatuses }))}
        >
          <div style={{display:"grid",gridTemplateColumns:isMobileView?"1fr":"repeat(2,minmax(0,1fr))",gap:7}}>
            {(contactStatuses || []).map((statusItem) => {
              const meta = contactStatusMeta(statusItem.name, makeContactStatusMap(contactStatuses));
              return (
                <div key={statusItem.name} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"center",padding:"8px 10px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}>
                  <span style={{padding:"4px 8px",borderRadius:8,background:meta.bg,border:`1px solid ${meta.border}`,color:meta.text,fontSize:10,fontWeight:800,textAlign:"center",whiteSpace:"nowrap",justifySelf:"start"}}>{statusItem.name}</span>
                  <button type="button" onClick={()=>onDeleteContactStatus(statusItem.name)} style={{height:32,padding:"0 10px",borderRadius:10,border:"1px solid rgba(255,82,82,0.25)",background:"rgba(255,82,82,0.12)",color:"#ff9ea1",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Удалить</button>
                </div>
              );
            })}
          </div>
          <div style={{paddingTop:6,borderTop:"1px solid rgba(255,255,255,0.06)",display:"grid",gridTemplateColumns:isMobileView?"1fr":"1fr 108px",gap:8,alignItems:"end"}}>
            <Fld label="Новый статус контакта" value={contactStatusName} onChange={setContactStatusName} placeholder="Например: Тёплый интерес" />
            <button type="button" disabled={!contactStatusName.trim()} onClick={()=>{onAddContactStatus(contactStatusName.trim());setContactStatusName("");}} style={{height:38,padding:"0 12px",borderRadius:10,border:"none",background:contactStatusName.trim()?"linear-gradient(135deg,#65ffdd,#18c5be)":"rgba(255,255,255,0.12)",color:contactStatusName.trim()?"#0a0a23":"#8f9bb9",fontSize:11,fontWeight:800,cursor:contactStatusName.trim()?"pointer":"not-allowed",fontFamily:"inherit"}}>+ Добавить</button>
          </div>
        </DataAccordionCard>

        <DataAccordionCard
          title="Причины статусов контактов"
          description="Причины сгруппированы по статусам, и можно не создавать причины для тех статусов, где они не нужны."
          expanded={expandedDataSections.callStatusReasons}
          onToggle={() => setExpandedDataSections((prev) => ({ ...prev, callStatusReasons: !prev.callStatusReasons }))}
        >
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {groupedContactReasons.map((group) => (
              <div key={group.statusName} style={{padding:"10px 12px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:8}}>
                <button
                  type="button"
                  onClick={() => setExpandedReasonGroups((prev) => ({ ...prev, [group.statusName]: !prev[group.statusName] }))}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,background:"transparent",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}
                >
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:14,color:"#8fa1ca",transform:expandedReasonGroups[group.statusName] ? "rotate(90deg)" : "rotate(0deg)",transition:"transform .15s ease"}}>▸</span>
                    <div style={{fontSize:14,fontWeight:800,color:"#dff7ff"}}>{group.statusName}</div>
                  </div>
                  <div style={{fontSize:11,color:"#7f92ba"}}>{group.reasons.length} причин</div>
                </button>
                {expandedReasonGroups[group.statusName] && (!!group.reasons.length ? (
                  <div style={{display:"grid",gridTemplateColumns:isMobileView?"1fr":"repeat(2,minmax(0,1fr))",gap:7}}>
                    {group.reasons.map((reason) => (
                      <div key={`${reason.statusName}-${reason.name}`} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"center",padding:"8px 10px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}>
                        <div style={{fontSize:12,color:"#dbe4ff",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{reason.name}</div>
                        <button type="button" onClick={()=>onDeleteContactReason(reason)} style={{height:32,padding:"0 10px",borderRadius:10,border:"1px solid rgba(255,82,82,0.25)",background:"rgba(255,82,82,0.12)",color:"#ff9ea1",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Удалить</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px dashed rgba(255,255,255,0.08)",fontSize:12,color:"#7f92ba"}}>Для этого статуса пока нет причин.</div>
                ))}
              </div>
            ))}
          </div>
          <div style={{paddingTop:6,borderTop:"1px solid rgba(255,255,255,0.06)",display:"grid",gridTemplateColumns:isMobileView?"1fr":"1fr 1fr 108px",gap:8,alignItems:"end"}}>
            <Fld label="Новая причина" value={contactReasonName} onChange={setContactReasonName} placeholder="Например: Занят" />
            <PickerField label="Статус" value={contactReasonStatus} onChange={setContactReasonStatus} options={(contactStatuses || []).map((item) => ({ value: item.name, label: item.name }))} placeholder="Выбрать" />
            <button type="button" disabled={!contactReasonName.trim() || !contactReasonStatus} onClick={()=>{onAddContactReason({ name: contactReasonName.trim(), statusName: contactReasonStatus });setContactReasonName("");setContactReasonStatus("");}} style={{height:38,padding:"0 12px",borderRadius:10,border:"none",background:(contactReasonName.trim() && contactReasonStatus)?"linear-gradient(135deg,#65ffdd,#18c5be)":"rgba(255,255,255,0.12)",color:(contactReasonName.trim() && contactReasonStatus)?"#0a0a23":"#8f9bb9",fontSize:11,fontWeight:800,cursor:(contactReasonName.trim() && contactReasonStatus)?"pointer":"not-allowed",fontFamily:"inherit"}}>+ Добавить</button>
          </div>
        </DataAccordionCard>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <DataAccordionCard
          title="Источники"
          description="Откуда клиент узнал о вас: Яндекс, листовки, рекомендации и другие каналы."
          expanded={expandedDataSections.sources}
          onToggle={() => setExpandedDataSections((prev) => ({ ...prev, sources: !prev.sources }))}
        >
          <div style={{display:"grid",gridTemplateColumns:isMobileView?"1fr":"repeat(2,minmax(0,1fr))",gap:7}}>
            {sources.map((source) => {
              const isEditing = editingSource === source;
              return (
                <div key={source} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"center",padding:"8px 10px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}>
                  {isEditing ? (
                    <input value={editingValue} onChange={(e)=>setEditingValue(e.target.value)} style={{width:"100%",height:34,borderRadius:10,border:"1px solid rgba(100,255,218,0.25)",background:"rgba(255,255,255,0.06)",padding:"0 10px",color:"#e6f1ff",fontSize:12,outline:"none",fontFamily:"inherit"}} />
                  ) : (
                    <div style={{fontSize:13,color:"#dbe4ff",fontWeight:700}}>{source}</div>
                  )}
                  {isEditing ? (
                    <button type="button" onClick={()=>{if (editingValue.trim() && editingValue.trim() !== source) onUpdateSource(source, editingValue.trim());setEditingSource(null);setEditingValue("");}} style={{height:34,padding:"0 11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#65ffdd,#18c5be)",color:"#0a0a23",fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Сохранить</button>
                  ) : (
                    <button type="button" onClick={()=>{setEditingSource(source);setEditingValue(source);}} style={{height:34,padding:"0 11px",borderRadius:10,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",color:"#dbe4ff",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Изменить</button>
                  )}
                  <button type="button" onClick={()=>isEditing ? (setEditingSource(null), setEditingValue("")) : onDeleteSource(source)} style={{height:34,padding:"0 11px",borderRadius:10,border:"1px solid rgba(255,82,82,0.25)",background:"rgba(255,82,82,0.12)",color:isEditing ? "#dbe4ff" : "#ff9ea1",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{isEditing ? "Отмена" : "Удалить"}</button>
                </div>
              );
            })}
          </div>
          <div style={{paddingTop:6,borderTop:"1px solid rgba(255,255,255,0.06)",display:"grid",gridTemplateColumns:isMobileView?"1fr":"1fr 108px",gap:8,alignItems:"end"}}>
            <Fld label="Новый источник" value={sourceName} onChange={setSourceName} placeholder="Например: Telegram" />
            <button type="button" disabled={!sourceName.trim()} onClick={()=>{onAddSource(sourceName.trim());setSourceName("");}} style={{height:38,padding:"0 12px",borderRadius:10,border:"none",background:sourceName.trim()?"linear-gradient(135deg,#65ffdd,#18c5be)":"rgba(255,255,255,0.12)",color:sourceName.trim()?"#0a0a23":"#8f9bb9",fontSize:11,fontWeight:800,cursor:sourceName.trim()?"pointer":"not-allowed",fontFamily:"inherit"}}>+ Добавить</button>
          </div>
        </DataAccordionCard>
        <DataAccordionCard
          title="Статусы заказов"
          description="Статусы заявок для карточки заказа и верхней сводки на сегодняшний день."
          expanded={expandedDataSections.orderStatuses}
          onToggle={() => setExpandedDataSections((prev) => ({ ...prev, orderStatuses: !prev.orderStatuses }))}
        >
          <div style={{display:"grid",gridTemplateColumns:isMobileView?"1fr":"repeat(2,minmax(0,1fr))",gap:7}}>
            {(statuses || []).map((statusItem) => {
              const meta = statusMeta(statusItem.name, makeStatusMap(statuses));
              return (
                <div key={statusItem.name} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"center",padding:"8px 10px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                    <span style={{width:122,padding:"4px 10px",borderRadius:999,background:meta.pillBg,border:`1px solid ${meta.pillBorder}`,color:meta.pillText,fontSize:10,fontWeight:800,textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",boxSizing:"border-box"}}>{statusItem.name}</span>
                  </div>
                  <button type="button" onClick={()=>onDeleteStatus(statusItem.name)} style={{height:32,padding:"0 10px",borderRadius:10,border:"1px solid rgba(255,82,82,0.25)",background:"rgba(255,82,82,0.12)",color:"#ff9ea1",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Удалить</button>
                </div>
              );
            })}
          </div>
          <div style={{paddingTop:6,borderTop:"1px solid rgba(255,255,255,0.06)",display:"grid",gridTemplateColumns:isMobileView?"1fr":"1fr 108px",gap:8,alignItems:"end"}}>
            <Fld label="Новый статус" value={statusName} onChange={setStatusName} placeholder="Например: Ожидание оплаты" />
            <button type="button" disabled={!statusName.trim()} onClick={()=>{onAddStatus(statusName.trim());setStatusName("");}} style={{height:38,padding:"0 12px",borderRadius:10,border:"none",background:statusName.trim()?"linear-gradient(135deg,#65ffdd,#18c5be)":"rgba(255,255,255,0.12)",color:statusName.trim()?"#0a0a23":"#8f9bb9",fontSize:11,fontWeight:800,cursor:statusName.trim()?"pointer":"not-allowed",fontFamily:"inherit"}}>+ Добавить</button>
          </div>
        </DataAccordionCard>
        </div>
      </div>

      {currentUser?.role !== "admin" && <div style={{padding:"12px 14px",borderRadius:12,background:"rgba(255,82,82,0.12)",border:"1px solid rgba(255,82,82,0.18)",color:"#ff9ea1",fontSize:12}}>Раздел доступен только владельцу.</div>}
    </div>
  );
};

const OrdersExplorerView = ({
  orders,
  deletedOrders,
  cities,
  employees,
  currentUser,
  services,
  statuses,
  sources,
  onOpenOrder,
  onOpenNew,
  onClose,
}) => {
  const isMobileView = typeof window !== "undefined" ? window.innerWidth < 760 : false;
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [statusFilter, setStatusFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [masterFilter, setMasterFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [counterFilter, setCounterFilter] = useState("all");
  const statusMap = useMemo(() => makeStatusMap(statuses), [statuses]);
  const serviceIndex = useMemo(() => buildServiceIndex(services || []), [services]);
  const todayValue = dstr(new Date());
  const tomorrowValue = dstr(new Date(Date.now() + 86400000));
  const visibleOrders = showArchived ? (deletedOrders || {}) : (orders || {});

  const orderRows = useMemo(() => {
    const rows = Object.entries(visibleOrders).map(([key, order]) => {
      const [cityFromKey = "", masterFromKey = "", dateFromKey = "", timeIdxFromKey = "0"] = key.split("|");
      const masterEmployee = employees.find((employee) => employee.id === order?._masterId) || employees.find((employee) => employee.name === masterFromKey && employee.type === "technician");
      return {
        ...order,
        key,
        city: order?.city || cityFromKey,
        district: order?.district || "",
        masterName: masterEmployee?.name || masterFromKey || "—",
        masterId: order?._masterId || masterEmployee?.id || null,
        dateStr: order?.dateStr || dateFromKey,
        timeIdx: Number(order?.timeIdx ?? timeIdxFromKey ?? 0),
        durationSlots: getOrderDurationSlots(order),
        displayRange: formatSelectedRange(order?.timeIdx ?? timeIdxFromKey ?? 0, getOrderDurationSlots(order)),
        displayPrice: order?.finalPrice || order?.price || "",
        serviceDirectionName: order?.serviceDirectionName || "",
        serviceSubcategoryName: order?.serviceSubcategoryName || "",
        source: order?.source || "",
        archivedAt: order?.archivedAt || null,
      };
    });
    if (currentUser?.role === "technician") return rows.filter((row) => row.masterId === currentUser.id);
    return rows;
  }, [currentUser?.id, currentUser?.role, employees, visibleOrders]);

  const cityOptions = useMemo(() => Object.keys(cities || {}).sort((a, b) => a.localeCompare(b, "ru")).map((city) => ({ value: city, label: city })), [cities]);
  const statusOptions = useMemo(() => (statuses || []).map((status) => ({ value: status.name, label: status.name })), [statuses]);
  const districtOptions = useMemo(() => Array.from(new Set(orderRows.map((row) => row.district).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru")).map((district) => ({ value: district, label: district })), [orderRows]);
  const directionOptions = useMemo(() => getServiceChildren(serviceIndex, null, "direction").map((node) => ({ value: node.id, label: node.name })), [serviceIndex]);
  const subcategoryOptions = useMemo(() => (services || []).filter((node) => node.type === "subcategory").sort((a, b) => a.name.localeCompare(b.name, "ru")).map((node) => ({ value: node.id, label: node.name })), [services]);
  const masterOptions = useMemo(() => employees.filter((employee) => employee.type === "technician").sort((a, b) => a.name.localeCompare(b.name, "ru")).map((employee) => ({ value: employee.id, label: employee.name })), [employees]);
  const sourceOptions = useMemo(() => (sources || []).sort((a, b) => a.localeCompare(b, "ru")).map((source) => ({ value: source, label: source })), [sources]);
  const matchesDateRange = useCallback((row) => {
    if (!dateRange.from && !dateRange.to) return true;
    const value = toDateInputValue(row.dateStr);
    if (!value) return false;
    if (dateRange.from && value < dateRange.from) return false;
    if (dateRange.to && value > dateRange.to) return false;
    return true;
  }, [dateRange]);

  const applyCounterFilter = useCallback((row, counterId) => {
    if (counterId === "all") return true;
    if (counterId === "today") return row.dateStr === todayValue;
    if (counterId === "tomorrow") return row.dateStr === tomorrowValue;
    if (counterId === "confirmed") return row.status === "Подтверждён";
    if (counterId === "rescheduled") return row.status === "Перенесён";
    if (counterId === "completed") return row.status === "Выполнен";
    if (counterId === "cancelled") return row.status === "Отменён";
    return true;
  }, [todayValue, tomorrowValue]);

  const baseFilteredRows = useMemo(() => {
    const rawQuery = query.trim().toLowerCase();
    const queryDigits = normalizePhoneDigits(rawQuery);
    return orderRows.filter((row) => {
      if (rawQuery) {
        const haystack = `${row.name || ""} ${row.address || ""} ${row.phone || ""}`.toLowerCase();
        const phoneDigits = normalizePhoneDigits(row.phone || "");
        if (!haystack.includes(rawQuery) && !(queryDigits && phoneDigits.includes(queryDigits))) return false;
      }
      if (statusFilter && row.status !== statusFilter) return false;
      if (cityFilter && row.city !== cityFilter) return false;
      if (districtFilter && row.district !== districtFilter) return false;
      if (directionFilter && row.serviceDirectionId !== directionFilter) return false;
      if (subcategoryFilter && row.serviceSubcategoryId !== subcategoryFilter) return false;
      if (masterFilter && row.masterId !== masterFilter) return false;
      if (sourceFilter && row.source !== sourceFilter) return false;
      if (!matchesDateRange(row)) return false;
      return true;
    });
  }, [cityFilter, directionFilter, districtFilter, masterFilter, matchesDateRange, orderRows, query, sourceFilter, statusFilter, subcategoryFilter]);

  const counters = useMemo(() => ({
    all: baseFilteredRows.length,
    today: baseFilteredRows.filter((row) => row.dateStr === todayValue).length,
    tomorrow: baseFilteredRows.filter((row) => row.dateStr === tomorrowValue).length,
    confirmed: baseFilteredRows.filter((row) => row.status === "Подтверждён").length,
    rescheduled: baseFilteredRows.filter((row) => row.status === "Перенесён").length,
    completed: baseFilteredRows.filter((row) => row.status === "Выполнен").length,
    cancelled: baseFilteredRows.filter((row) => row.status === "Отменён").length,
  }), [baseFilteredRows, todayValue, tomorrowValue]);

  const counterTabs = [
    { id: "all", label: "Все", value: counters.all, color: "#55d8ff" },
    { id: "today", label: "Сегодня", value: counters.today, color: "#60c0ff" },
    { id: "tomorrow", label: "Завтра", value: counters.tomorrow, color: "#ffc857" },
    { id: "confirmed", label: "Подтвержденные", value: counters.confirmed, color: "#9ee37d" },
    { id: "rescheduled", label: "Перенесенные", value: counters.rescheduled, color: "#ff8e8e" },
    { id: "completed", label: "Выполненные", value: counters.completed, color: "#b8e6a1" },
    { id: "cancelled", label: "Отмененные", value: counters.cancelled, color: "#ff8c8c" },
  ];

  const filteredRows = useMemo(() => baseFilteredRows.filter((row) => applyCounterFilter(row, counterFilter)).sort((a, b) => {
    if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
    return Number(a.timeIdx) - Number(b.timeIdx);
  }), [applyCounterFilter, baseFilteredRows, counterFilter]);
  const exportOrders = () => {
    downloadExcelTable({
      fileName: `orders-${todayValue}`,
      sheetName: "Заказы",
      columns: ["№ заявки", "Дата", "Время заявки", "Имя", "Телефон", "Город", "Адрес", "Статус", "Направление", "Подуслуга", "Мастер", "Стоимость"],
      rows: filteredRows.map((row) => [
        formatOrderNumber(row.orderNumber),
        formatShortDate(row.dateStr),
        row.displayRange,
        row.name || "—",
        formatContactPhone(row.phone),
        row.city || "—",
        row.address || "—",
        row.status || "—",
        row.serviceDirectionName || "—",
        row.serviceSubcategoryName || "—",
        row.masterName || "—",
        row.displayPrice ? `${row.displayPrice}₽` : "—",
      ]),
    });
  };

    const resetFilters = () => {
    setQuery("");
    setDateRange({ from: "", to: "" });
    setStatusFilter("");
    setCityFilter("");
    setDistrictFilter("");
    setDirectionFilter("");
    setSubcategoryFilter("");
    setMasterFilter("");
    setSourceFilter("");
    setCounterFilter("all");
  };

  const tableColumns = "0.78fr 0.72fr 0.98fr 0.95fr 0.95fr 0.9fr 1.3fr 0.88fr 0.95fr 0.95fr 0.95fr 0.82fr";

  return (
    <div style={{padding:isMobileView?"14px 12px 18px":"18px 20px",display:"flex",flexDirection:"column",gap:14,position:"relative"}}>
      <button type="button" onClick={onClose} style={floatingCloseButtonStyle}>×</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:48,height:48,borderRadius:14,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#9fdfff"}}>📞</div>
            <div>
              <div style={{fontSize:28,fontWeight:900,color:"#dff7ff"}}>Заказы</div>
              <div style={{fontSize:13,color:"#8fa1ca",marginTop:4}}>Все заявки, фильтрация и быстрый переход в карточку.</div>
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,paddingRight:62}}>
          <button type="button" onClick={exportOrders} style={{height:42,padding:"0 16px",borderRadius:12,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.04)",color:"#dbe4ff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:15}}>⇪</span>
            Экспорт
          </button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobileView?"repeat(2,minmax(0,1fr))":"minmax(180px,1.15fr) minmax(220px,1fr) repeat(4,minmax(140px,0.8fr))",gap:10,alignItems:"end",flexShrink:0}}>
        <Fld label="Поиск" value={query} onChange={setQuery} placeholder="+7 / имя / адрес" />
        <DateRangeField label="Период" value={dateRange} onChange={setDateRange} onReset={()=>setDateRange({ from: "", to: "" })} />
        <PickerField label="Статус" value={statusFilter} onChange={setStatusFilter} options={statusOptions} placeholder="Все статусы" />
        <PickerField label="Город" value={cityFilter} onChange={setCityFilter} options={cityOptions} placeholder="Все города" />
        <PickerField label="Район" value={districtFilter} onChange={setDistrictFilter} options={districtOptions} placeholder="Все районы" />
        {!isMobileView && <div />}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobileView?"repeat(2,minmax(0,1fr))":"repeat(4,minmax(160px,1fr)) auto auto auto",gap:10,alignItems:"end",flexShrink:0}}>
        <PickerField label="Направление" value={directionFilter} onChange={setDirectionFilter} options={directionOptions} placeholder="Все направления" />
        <PickerField label="Подуслуга" value={subcategoryFilter} onChange={setSubcategoryFilter} options={subcategoryOptions} placeholder="Все подуслуги" />
        <PickerField label="Мастер" value={masterFilter} onChange={setMasterFilter} options={masterOptions} placeholder="Все мастера" />
        <PickerField label="Откуда узнали" value={sourceFilter} onChange={setSourceFilter} options={sourceOptions} placeholder="Все источники" />
        {!isMobileView && <div />}
        <button type="button" onClick={resetFilters} style={{height:38,padding:"0 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.04)",color:"#dbe4ff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Сбросить</button>
        <button type="button" onClick={()=>setShowArchived((prev)=>!prev)} style={{height:38,padding:"0 14px",borderRadius:10,border:showArchived?"1px solid rgba(120,230,255,0.42)":"1px solid rgba(255,255,255,0.12)",background:showArchived?"rgba(80,220,255,0.16)":"rgba(255,255,255,0.04)",color:showArchived?"#dff7ff":"#dbe4ff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{showArchived ? "Обычные заказы" : "Архив"}</button>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-start",flexShrink:0}}>
        {counterTabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setCounterFilter(tab.id)} style={{padding:"10px 14px",borderRadius:12,border:counterFilter===tab.id?"1px solid rgba(120,230,255,0.42)":"1px solid rgba(255,255,255,0.08)",background:counterFilter===tab.id?"rgba(80,220,255,0.16)":"rgba(255,255,255,0.04)",color:counterFilter===tab.id?"#dff7ff":"#9bb0d4",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:9}}>
            <span style={{width:10,height:10,borderRadius:5,background:tab.color,boxShadow:"0 0 0 2px rgba(255,255,255,0.04)"}} />
            <span>{tab.label} {tab.value}</span>
          </button>
        ))}
      </div>

      <div style={{borderRadius:18,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
        {!isMobileView && <div style={{display:"grid",gridTemplateColumns:tableColumns,gap:0,padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,0.08)",fontSize:11,color:"#7f92ba",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>
          {["№ заявки","Дата","Время заявки","Имя","Телефон","Город","Адрес","Статус","Направление","Подуслуга","Мастер","Стоимость"].map((label, index) => (
            <div key={label} style={{minWidth:0,paddingLeft:index?14:0,paddingRight:10,borderLeft:index?"1px solid rgba(255,255,255,0.06)":"none",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>{label}</div>
          ))}
        </div>}
        <div style={{maxHeight:isMobileView?"none":"calc(100vh - 330px)",overflow:isMobileView?"visible":"auto",minHeight:0}}>
          {filteredRows.map((row) => {
            const meta = statusMeta(row.status, statusMap);
            if (isMobileView) {
              return (
                <div key={row.key} onClick={() => !showArchived && onOpenOrder(row.key, row)} style={{padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)",cursor:showArchived?"default":"pointer",background:meta.cardBg,display:"grid",gridTemplateColumns:"78px 1fr 84px",gap:10,alignItems:"center"}}>
                  <div style={{fontSize:12,fontWeight:900,color:meta.cardText,lineHeight:1.25}}>
                    <div>{formatOrderNumber(row.orderNumber)}</div>
                    <div style={{opacity:0.82,marginTop:2}}>{row.displayRange}</div>
                  </div>
                  <div style={{minWidth:0,fontSize:12.5,color:meta.cardText,lineHeight:1.3}}>
                    <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:700}}>{row.address || "—"}</div>
                  </div>
                  <div style={{minWidth:0,fontSize:12.5,color:meta.cardText,lineHeight:1.3,textAlign:"right",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{row.masterName || "—"}</div>
                </div>
              );
            }
            return (
              <div key={row.key} onClick={() => !showArchived && onOpenOrder(row.key, row)} style={{display:"grid",gridTemplateColumns:tableColumns,gap:0,padding:"12px 14px",alignItems:"stretch",borderBottom:"1px solid rgba(255,255,255,0.06)",cursor:showArchived?"default":"pointer",background:meta.cardBg}}>
                <div style={{minWidth:0,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",fontSize:13,fontWeight:800,color:meta.cardText}}>{formatOrderNumber(row.orderNumber)}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>{formatShortDate(row.dateStr)}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{row.displayRange}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"normal",lineHeight:1.25}}>{row.name || "—"}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",opacity:0.84}}>{formatContactPhone(row.phone)}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"normal",lineHeight:1.25,opacity:0.84}}>{row.city || "—"}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"normal",lineHeight:1.25,opacity:0.84}}>{row.address || "—"}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{width:122,height:30,display:"inline-flex",alignItems:"center",justifyContent:"center",background:meta.pillBg,border:`1px solid ${meta.pillBorder}`,borderRadius:999,color:meta.pillText,fontSize:11,fontWeight:800,padding:"0 12px",textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",boxSizing:"border-box"}}>{row.status || "—"}</div>
                </div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"normal",lineHeight:1.25,opacity:0.84}}>{row.serviceDirectionName || "—"}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"normal",lineHeight:1.25,opacity:0.84}}>{row.serviceSubcategoryName || "—"}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"normal",lineHeight:1.25}}>{row.masterName || "—"}</div>
                <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:meta.cardText,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>{row.displayPrice ? `${row.displayPrice}₽` : "—"}</div>
              </div>
            );
          })}
          {!filteredRows.length && <div style={{padding:"54px 24px",textAlign:"center",color:"#7f92ba"}}>{showArchived ? "Удаленные заявки по текущим фильтрам не найдены." : "Заказы по текущим фильтрам не найдены."}</div>}
        </div>
      </div>
    </div>
  );
};

const buildContactDraft = (contact, contactStatuses) => ({
  id: contact?.id || null,
  name: contact?.name || "",
  phone: normalizePhoneDigits(contact?.phone || ""),
  city: contact?.city || "",
  status: contact?.status || defaultContactStatusName(contactStatuses),
  reason: contact?.reason || "",
  comment: contact?.comment || "",
  callbackDate: toDateInputValue(contact?.callbackDate),
  createdAt: contact?.createdAt || null,
  createdByName: contact?.createdByName || "",
  assignedToId: contact?.assignedToId || null,
  assignedToName: contact?.assignedToName || "",
  lastCallAt: contact?.lastCallAt || null,
  convertedOrderId: contact?.convertedOrderId || null,
});

const ContactsView = ({
  cities,
  employees,
  currentUser,
  contacts,
  contactStatuses,
  contactReasons,
  onSaveContact,
  onDeleteContact,
  onCreateOrderFromContact,
  onClose,
}) => {
  const isMobileView = typeof window !== "undefined" ? window.innerWidth < 760 : false;
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [createdDateRange, setCreatedDateRange] = useState({ from: "", to: "" });
  const [commentPresenceFilter, setCommentPresenceFilter] = useState("");
  const [reasonPresenceFilter, setReasonPresenceFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [counterFilter, setCounterFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [contactSaveAttempted, setContactSaveAttempted] = useState(false);
  const statusMap = useMemo(() => makeContactStatusMap(contactStatuses), [contactStatuses]);
  const cityOptions = useMemo(() => Object.keys(cities).map((city) => ({ value: city, label: city })), [cities]);
  const statusOptions = useMemo(() => (contactStatuses || []).map((status) => ({ value: status.name, label: status.name })), [contactStatuses]);
  const responsibleEmployees = useMemo(() => employees.filter((employee) => employee.type === "call_center" || employee.type === "admin"), [employees]);
  const responsibleOptions = useMemo(() => responsibleEmployees.map((employee) => ({ value: employee.id, label: employee.name })), [responsibleEmployees]);
  const todayValue = dstr(new Date());
  const creatorOptions = useMemo(() => {
    const uniqueNames = Array.from(new Set((contacts || []).map((contact) => contact.createdByName).filter(Boolean)));
    return uniqueNames.map((name) => ({ value: name, label: name }));
  }, [contacts]);
  const commentPresenceOptions = [
    { value: "", label: "Все комментарии" },
    { value: "with", label: "С комментарием" },
    { value: "without", label: "Без комментария" },
  ];
  const reasonPresenceOptions = [
    { value: "", label: "Все причины" },
    { value: "with", label: "С причиной" },
    { value: "without", label: "Без причины" },
  ];
  const isOverdueContact = (contact) => {
    if (contact.status !== "Перезвонить") return false;
    const callback = toDateInputValue(contact.callbackDate);
    return Boolean(callback && callback < todayValue);
  };
  const matchesCreatedDateFilter = (contact) => {
    const createdDate = toDateInputValue(contact.createdAt);
    if (!createdDateRange.from && !createdDateRange.to) return true;
    if (!createdDate) return false;
    if (createdDateRange.from && createdDate < createdDateRange.from) return false;
    if (createdDateRange.to && createdDate > createdDateRange.to) return false;
    return true;
  };
  const matchesExtendedFilters = (contact) => {
    if (responsibleFilter && contact.assignedToId !== responsibleFilter) return false;
    if (creatorFilter && contact.createdByName !== creatorFilter) return false;
    if (!matchesCreatedDateFilter(contact)) return false;
    if (commentPresenceFilter === "with" && !String(contact.comment || "").trim()) return false;
    if (commentPresenceFilter === "without" && String(contact.comment || "").trim()) return false;
    if (reasonPresenceFilter === "with" && !String(contact.reason || "").trim()) return false;
    if (reasonPresenceFilter === "without" && String(contact.reason || "").trim()) return false;
    if (overdueOnly && !isOverdueContact(contact)) return false;
    return true;
  };
  const applyCounterFilter = (contact, counterId) => {
    if (counterId === "all") return true;
    if (counterId === "today") return toDateInputValue(contact.createdAt) === todayValue;
    if (counterId === "new") return contact.status === "Новый";
    if (counterId === "callback_today") return contact.status === "Перезвонить" && toDateInputValue(contact.callbackDate) === todayValue;
    if (counterId === "overdue") return isOverdueContact(contact);
    if (counterId === "missed") return contact.status === "Недозвонился";
    if (counterId === "mine") return contact.assignedToId === currentUser?.id;
    return true;
  };
  const contactsForReasonFilter = useMemo(() => {
    const phoneQuery = normalizePhoneDigits(query);
    return (contacts || []).filter((contact) => {
      if (phoneQuery && !normalizePhoneDigits(contact.phone).includes(phoneQuery)) return false;
      if (cityFilter && contact.city !== cityFilter) return false;
      if (statusFilter && contact.status !== statusFilter) return false;
      if (!matchesExtendedFilters(contact)) return false;
      if (!applyCounterFilter(contact, counterFilter)) return false;
      return true;
    });
  }, [cityFilter, contacts, counterFilter, query, statusFilter, responsibleFilter, creatorFilter, createdDateRange, commentPresenceFilter, reasonPresenceFilter, overdueOnly, todayValue, currentUser?.id]);

  const filteredContacts = useMemo(() => {
    const phoneQuery = normalizePhoneDigits(query);
    return (contacts || []).filter((contact) => {
      if (phoneQuery && !normalizePhoneDigits(contact.phone).includes(phoneQuery)) return false;
      if (cityFilter && contact.city !== cityFilter) return false;
      if (statusFilter && contact.status !== statusFilter) return false;
      if (reasonFilter && contact.reason !== reasonFilter) return false;
      if (!matchesExtendedFilters(contact)) return false;
      if (!applyCounterFilter(contact, counterFilter)) return false;
      return true;
    });
  }, [cityFilter, contacts, counterFilter, query, reasonFilter, statusFilter, responsibleFilter, creatorFilter, createdDateRange, commentPresenceFilter, reasonPresenceFilter, overdueOnly, todayValue, currentUser?.id]);

  const counters = useMemo(() => ({
    all: (contacts || []).length,
    today: (contacts || []).filter((contact) => toDateInputValue(contact.createdAt) === todayValue).length,
    new: (contacts || []).filter((contact) => contact.status === "Новый").length,
    callback_today: (contacts || []).filter((contact) => contact.status === "Перезвонить" && toDateInputValue(contact.callbackDate) === todayValue).length,
    overdue: (contacts || []).filter((contact) => isOverdueContact(contact)).length,
    missed: (contacts || []).filter((contact) => contact.status === "Недозвонился").length,
    mine: (contacts || []).filter((contact) => contact.assignedToId === currentUser?.id).length,
  }), [contacts, todayValue, currentUser?.id]);

  const selectedContact = useMemo(() => {
    if (draft) return draft;
    const found = (contacts || []).find((contact) => contact.id === selectedId);
    return found ? buildContactDraft(found, contactStatuses) : null;
  }, [contactStatuses, contacts, draft, selectedId]);
  const duplicatePhoneContact = useMemo(() => {
    const digits = normalizePhoneDigits(selectedContact?.phone || "");
    if (digits.length < 10) return null;
    return (contacts || []).find((contact) => normalizePhoneDigits(contact.phone || "") === digits && contact.id !== selectedContact?.id) || null;
  }, [contacts, selectedContact?.id, selectedContact?.phone]);
  const exportContacts = () => {
    downloadExcelTable({
      fileName: `contacts-${todayValue}`,
      sheetName: "Контакты",
      columns: ["Телефон", "Город", "Статус", "Причина", "Дата перезвона", "Ответственный", "Дата создания", "Комментарий"],
      rows: filteredContacts.map((contact) => [
        formatContactPhone(contact.phone),
        contact.city || "—",
        contact.status || "—",
        contact.reason || "—",
        contact.callbackDate ? formatDateRu(contact.callbackDate) : "—",
        contact.assignedToName || contact.createdByName || "—",
        formatDateRu(contact.createdAt),
        contact.comment || "—",
      ]),
    });
  };
  const selectedStatus = selectedContact?.status || "";
  const reasonOptions = useMemo(() => (contactReasons || [])
    .filter((reason) => !selectedStatus || reason.statusName === selectedStatus)
    .map((reason) => ({ value: reason.name, label: reason.name })), [contactReasons, selectedStatus]);
  const allReasonOptions = useMemo(() => {
    const usedReasons = new Set((contactsForReasonFilter || []).map((contact) => contact.reason).filter(Boolean));
    return (contactReasons || [])
      .filter((reason) => usedReasons.has(reason.name))
      .map((reason) => ({ value: reason.name, label: reason.name }));
  }, [contactReasons, contactsForReasonFilter]);

  useEffect(() => {
    if (!selectedId || draft) return;
    const exists = (contacts || []).some((contact) => contact.id === selectedId);
    if (!exists) setSelectedId(null);
  }, [contacts, draft, selectedId]);

  const openExisting = (contact) => {
    setSelectedId(contact.id);
    setDraft(null);
    setContactSaveAttempted(false);
  };

  const openNew = () => {
    const nextDraft = buildContactDraft({
      assignedToId: currentUser?.id || null,
      assignedToName: currentUser?.name || "",
    }, contactStatuses);
    setDraft(nextDraft);
    setSelectedId("new-contact");
    setContactSaveAttempted(false);
  };

  const closeSelectedContact = () => {
    setDraft(null);
    setSelectedId(null);
    setContactSaveAttempted(false);
  };

  const updateDraft = (field, value) => {
    const base = selectedContact || buildContactDraft(null, contactStatuses);
    const next = { ...base, [field]: value };
    if (field === "status") {
      next.callbackDate = "";
      const allowedReasons = (contactReasons || []).filter((reason) => reason.statusName === value).map((reason) => reason.name);
      if (!allowedReasons.includes(next.reason)) next.reason = "";
    }
    const assignedName = responsibleEmployees.find((employee) => employee.id === next.assignedToId)?.name || next.assignedToName || "";
    next.assignedToName = assignedName;
    setDraft(next);
  };

  const saveDisabledReason = useMemo(() => {
    if (!selectedContact) return "";
    const phoneDigits = normalizePhoneDigits(selectedContact.phone || "");
    if (phoneDigits.length < 10) return "Укажи телефон (10 цифр)";
    if (!selectedContact.city) return "Выбери город";
    if (duplicatePhoneContact) return "Такой номер уже есть в базе";
    return "";
  }, [selectedContact, duplicatePhoneContact]);
  const saveDisabled = saving || Boolean(saveDisabledReason);
  const callbackDateError = Boolean(contactSaveAttempted && selectedContact?.status === "Перезвонить" && !selectedContact?.callbackDate);

  const saveDraft = async () => {
    if (!selectedContact) return;
    setContactSaveAttempted(true);
    if (saveDisabled || callbackDateError) return;
    setSaving(true);
    try {
      await onSaveContact({
        ...selectedContact,
        assignedToId: selectedContact.assignedToId || currentUser?.id || null,
        assignedToName: responsibleEmployees.find((employee) => employee.id === selectedContact.assignedToId)?.name || currentUser?.name || "",
      });
      setDraft(null);
      setContactSaveAttempted(false);
    } finally {
      setSaving(false);
    }
  };

  const deleteCurrentContact = async () => {
    if (!selectedContact?.id || selectedContact.id === "new-contact") return;
    if (typeof onDeleteContact !== "function") return;
    if (typeof window !== "undefined" && !window.confirm("Удалить этот контакт?")) return;
    setDeleting(true);
    try {
      const ok = await onDeleteContact(selectedContact);
      if (ok) {
        setDraft(null);
        setSelectedId(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const quickStatusChange = async (contact, nextStatus) => {
    if (nextStatus === "Перезвонить" && !toDateInputValue(contact.callbackDate)) {
      setSelectedId(contact.id);
      setDraft(buildContactDraft({
        ...contact,
        status: nextStatus,
        reason: "",
        callbackDate: "",
        assignedToId: contact.assignedToId || currentUser?.id || null,
        assignedToName: contact.assignedToName || currentUser?.name || "",
      }, contactStatuses));
      return;
    }
    const allowedReasons = (contactReasons || []).filter((reason) => reason.statusName === nextStatus).map((reason) => reason.name);
    await onSaveContact({
      ...contact,
      status: nextStatus,
      reason: allowedReasons.includes(contact.reason) ? contact.reason : "",
      callbackDate: nextStatus === "Перезвонить" ? contact.callbackDate : "",
      assignedToId: contact.assignedToId || currentUser?.id || null,
      assignedToName: contact.assignedToName || currentUser?.name || "",
    });
  };

  const counterTabs = [
    { id: "all", label: "Все", value: counters.all },
    { id: "today", label: "Сегодня", value: counters.today },
    { id: "new", label: "Новые", value: counters.new },
    { id: "callback_today", label: "Перезвонить сегодня", value: counters.callback_today },
    { id: "overdue", label: "Просроченные", value: counters.overdue },
    { id: "missed", label: "Недозвонился", value: counters.missed },
    { id: "mine", label: "Мои", value: counters.mine },
  ];
  const counterIconMap = {
    overdue: <CounterAlarmIcon color="#ff8c6f" />,
    mine: <CounterUserIcon color="#ad68ff" />,
  };
  const resetFilters = () => {
    setQuery("");
    setCityFilter("");
    setStatusFilter("");
    setReasonFilter("");
    setResponsibleFilter("");
    setCreatorFilter("");
    setCreatedDateRange({ from: "", to: "" });
    setCommentPresenceFilter("");
    setReasonPresenceFilter("");
    setOverdueOnly(false);
    setCounterFilter("all");
  };
  const contactsTableColumns = "1.05fr 1.15fr 0.95fr 1.05fr 0.82fr 0.9fr 0.82fr 1.35fr";

  return (
    <div style={{padding:isMobileView?"14px 12px 18px":"18px 20px",display:"flex",flexDirection:"column",gap:14,position:"relative"}}>
      <button type="button" onClick={onClose} style={floatingCloseButtonStyle}>×</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:48,height:48,borderRadius:14,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#9fdfff"}}>📞</div>
            <div style={{fontSize:28,fontWeight:900,color:"#dff7ff"}}>Контакты</div>
          </div>
          <div style={{fontSize:13,color:"#8fa1ca",marginTop:4}}>Быстрый список обзвона для колл-центра с созданием заказа из контакта.</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,paddingRight:62}}>
          <button type="button" onClick={exportContacts} style={{height:42,padding:"0 16px",borderRadius:12,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.04)",color:"#dbe4ff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:15}}>⇪</span>
            Экспорт
          </button>
          <button type="button" onClick={openNew} style={{height:42,padding:"0 18px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#65ffdd,#18c5be)",color:"#0a0a23",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>+ Новый контакт</button>
        </div>
      </div>

      {isMobileView && selectedContact && (
        <div style={{borderRadius:18,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",padding:16,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
            <div style={{fontSize:18,fontWeight:800,color:"#dff7ff"}}>Контакт</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:12,color:"#64ffda",fontWeight:700}}>{selectedContact.name || "Без имени"}</div>
              <button type="button" onClick={closeSelectedContact} style={{width:30,height:30,borderRadius:10,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.04)",color:"#dbe4ff",fontSize:16,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <PhoneInput value={selectedContact.phone} onChange={(value) => updateDraft("phone", value)} hasError={Boolean(duplicatePhoneContact)} />
            {duplicatePhoneContact && (
              <div style={{padding:"9px 10px",borderRadius:10,background:"rgba(255,107,107,0.12)",border:"1px solid rgba(255,107,107,0.28)",color:"#ff9ea8",fontSize:11,fontWeight:700,lineHeight:1.35}}>
                Такой контакт уже есть в базе: {duplicatePhoneContact.name || "Без имени"} · {duplicatePhoneContact.city || "Без города"}
              </div>
            )}
          </div>
          <Fld label="Имя" value={selectedContact.name} onChange={(value)=>updateDraft("name", value)} placeholder="Как зовут клиента" />
          <PickerField label="Город" value={selectedContact.city} onChange={(value)=>updateDraft("city", value)} options={cityOptions} placeholder="Выбрать город" />
          <PickerField label="Статус" value={selectedContact.status} onChange={(value)=>updateDraft("status", value)} options={statusOptions} placeholder="Выбрать статус" />
          {selectedContact.status === "Перезвонить" && (
            <ContactDateField label="Дата перезвона" value={selectedContact.callbackDate || ""} onChange={(value)=>updateDraft("callbackDate", value)} error={callbackDateError} placeholder="Выбрать дату" />
          )}
          <PickerField label="Причина" value={selectedContact.reason} onChange={(value)=>updateDraft("reason", value)} options={reasonOptions} placeholder="Выбрать причину" />
          <Fld label="Комментарий" value={selectedContact.comment} onChange={(value)=>updateDraft("comment", value)} multiline placeholder="Что сказал клиент, когда просил перезвонить, есть ли интерес..." />
          <PickerField label="Ответственный" value={selectedContact.assignedToId || ""} onChange={(value)=>updateDraft("assignedToId", value)} options={responsibleOptions} placeholder="Выбрать сотрудника" />
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",fontSize:12,color:"#9fb1d1"}}>
              Дата и время создания
              <div style={{marginTop:4,fontSize:13,color:"#e6f1ff",fontWeight:700}}>{formatDateTimeRu(selectedContact.createdAt) || "Сейчас"}</div>
            </div>
            <div style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",fontSize:12,color:"#9fb1d1"}}>
              Создал
              <div style={{marginTop:4,fontSize:13,color:"#e6f1ff",fontWeight:700}}>{selectedContact.createdByName || currentUser?.name || "—"}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button type="button" disabled={saveDisabled} onClick={saveDraft} style={{flex:1,height:42,borderRadius:12,border:"none",background:saveDisabled?"rgba(255,255,255,0.12)":"linear-gradient(135deg,#65ffdd,#18c5be)",color:saveDisabled?"#8f9bb9":"#0a0a23",fontSize:13,fontWeight:800,cursor:saveDisabled?"not-allowed":"pointer",fontFamily:"inherit"}}>{saving ? "Сохраняю..." : "Сохранить"}</button>
            <button type="button" onClick={()=>onCreateOrderFromContact(selectedContact)} style={{flex:1,height:42,borderRadius:12,border:"1px solid rgba(129,199,132,0.34)",background:"rgba(129,199,132,0.18)",color:"#b9efbc",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Создать заказ</button>
          </div>
          {(saveDisabledReason || callbackDateError) && <div style={{fontSize:11,color:"#ffb36b",fontWeight:600,marginTop:-4}}>{saveDisabledReason || "Укажи дату перезвона"}</div>}
          {selectedContact.id && selectedContact.id !== "new-contact" && typeof onDeleteContact === "function" && (
            <button type="button" disabled={deleting} onClick={deleteCurrentContact} style={{height:40,borderRadius:12,border:"1px solid rgba(255,82,82,0.35)",background:"rgba(255,82,82,0.14)",color:"#ff9ea1",fontSize:12,fontWeight:800,cursor:deleting?"not-allowed":"pointer",fontFamily:"inherit"}}>{deleting ? "Удаляю..." : "Удалить контакт"}</button>
          )}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:isMobileView?"repeat(2,minmax(0,1fr))":"minmax(180px,1.2fr) repeat(6,minmax(120px,0.8fr)) auto",gap:8,alignItems:"end",flexShrink:0}}>
        <Fld label="Поиск по номеру" value={query} onChange={setQuery} placeholder="+7..." />
        <PickerField label="Город" value={cityFilter} onChange={setCityFilter} options={cityOptions} placeholder="Все города" />
        <PickerField label="Статус" value={statusFilter} onChange={setStatusFilter} options={statusOptions} placeholder="Все статусы" />
        <PickerField label="Причина" value={reasonPresenceFilter} onChange={setReasonPresenceFilter} options={reasonPresenceOptions.slice(1)} placeholder="Все причины" />
        <PickerField label="Ответственный" value={responsibleFilter} onChange={setResponsibleFilter} options={responsibleOptions} placeholder="Все ответственные" />
        <PickerField label="Создатель" value={creatorFilter} onChange={setCreatorFilter} options={creatorOptions} placeholder="Все создатели" />
        <DateRangeField label="Дата создания" value={createdDateRange} onChange={setCreatedDateRange} onReset={() => setCreatedDateRange({ from: "", to: "" })} />
        <button type="button" onClick={resetFilters} style={{height:38,padding:"0 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.04)",color:"#dbe4ff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Сбросить</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobileView?"repeat(2,minmax(0,1fr))":"minmax(180px,1.2fr) auto",gap:8,alignItems:"end",justifyContent:"start",maxWidth:isMobileView?"none":"calc(180px + 8px + 210px)",flexShrink:0}}>
        <PickerField label="Комментарии" value={commentPresenceFilter} onChange={setCommentPresenceFilter} options={commentPresenceOptions.slice(1)} placeholder="Все комментарии" />
        <button type="button" onClick={() => setOverdueOnly((prev) => !prev)} style={{height:38,padding:"0 14px",borderRadius:10,border:overdueOnly?"1px solid rgba(255,209,102,0.45)":"1px solid rgba(255,255,255,0.12)",background:overdueOnly?"rgba(255,209,102,0.16)":"rgba(255,255,255,0.04)",color:overdueOnly?"#ffe19b":"#dbe4ff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Только просроченные</button>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",flexShrink:0}}>
        {counterTabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setCounterFilter(tab.id)} style={{padding:"10px 14px",borderRadius:12,border:counterFilter===tab.id?"1px solid rgba(120,230,255,0.42)":"1px solid rgba(255,255,255,0.08)",background:counterFilter===tab.id?"rgba(80,220,255,0.16)":"rgba(255,255,255,0.04)",color:counterFilter===tab.id?"#dff7ff":"#9bb0d4",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:9}}>
            {counterIconMap[tab.id] ? (
              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:0}}>{counterIconMap[tab.id]}</span>
            ) : (
              <span style={{width:10,height:10,borderRadius:5,background:tab.id==="all"?"#55d8ff":tab.id==="today"?"#60c0ff":tab.id==="new"?"#4c8dff":tab.id==="callback_today"?"#ffc857":tab.id==="overdue"?"#ff7a59":tab.id==="missed"?"#ffb347":"#b16cff",boxShadow:"0 0 0 2px rgba(255,255,255,0.04)"}} />
            )}
            <span>{tab.label} {tab.value}</span>
          </button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobileView?"1fr":"minmax(0,1fr) 440px",gap:14,alignItems:"start",paddingBottom:isMobileView?84:0}}>
        <div style={{borderRadius:18,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden",minHeight:0}}>
          {!isMobileView && <div style={{display:"grid",gridTemplateColumns:contactsTableColumns,gap:0,padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,0.08)",fontSize:11,color:"#7f92ba",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>
            {["Телефон","Город","Статус","Причина","Дата перезвона","Ответственный","Дата создания","Комментарий"].map((label, index) => (
              <div key={label} style={{minWidth:0,paddingLeft:index?14:0,paddingRight:10,borderLeft:index?"1px solid rgba(255,255,255,0.06)":"none",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>{label}</div>
            ))}
          </div>}
          <div style={{maxHeight:isMobileView?"none":"calc(100vh - 300px)",overflow:isMobileView?"visible":"auto"}}>
            {filteredContacts.map((contact) => {
              const meta = contactStatusMeta(contact.status, statusMap);
              if (isMobileView) {
                return (
                  <div key={contact.id} onClick={() => openExisting(contact)} style={{padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",background:selectedId===contact.id && !draft ? "rgba(80,220,255,0.08)" : "transparent",display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:14,color:"#dbe4ff",fontWeight:700,wordBreak:"break-word"}}>{formatContactPhone(contact.phone)}</div>
                        <div style={{fontSize:18,color:"#e6f1ff",fontWeight:800,marginTop:2,lineHeight:1.15}}>{contact.name || "Контакт"}</div>
                        <div style={{fontSize:12,color:"#8fa1ca",marginTop:2}}>{contact.comment ? contact.comment : "Без имени"}</div>
                      </div>
                      <div style={{fontSize:11,color:"#8fa1ca",whiteSpace:"nowrap",paddingTop:2}}>{contact.city || "—"}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                      <div style={{fontSize:11,color:"#8fa1ca",whiteSpace:"nowrap"}}>{contact.assignedToName || contact.createdByName || "—"}</div>
                      <div style={{maxWidth:140,height:30,display:"inline-flex",alignItems:"center",justifyContent:"center",background:meta.pillBg,border:`1px solid ${meta.pillBorder}`,borderRadius:999,color:meta.pillText,fontSize:10,fontWeight:700,padding:"0 12px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flexShrink:0}}>{contact.status || "—"}</div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={contact.id} onClick={() => openExisting(contact)} style={{display:"grid",gridTemplateColumns:contactsTableColumns,gap:0,padding:"12px 14px",alignItems:"stretch",borderBottom:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",background:selectedId===contact.id && !draft ? "rgba(80,220,255,0.08)" : "transparent"}}>
                  <div style={{minWidth:0,display:"flex",flexDirection:"column",gap:4,alignItems:"center",justifyContent:"center",textAlign:"center"}}>
                    <div style={{fontSize:14,color:"#dbe4ff",fontWeight:700,whiteSpace:"nowrap"}}>{formatContactPhone(contact.phone)}</div>
                    <div style={{fontSize:12,color:"#8fa1ca",whiteSpace:"normal",lineHeight:1.2}}>{contact.name || "Без имени"}</div>
                  </div>
                  <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:"#b5c5e4",whiteSpace:"normal",lineHeight:1.25,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>{contact.city || "—"}</div>
                  <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{width:120,maxWidth:"100%",height:28,display:"inline-flex",alignItems:"center",justifyContent:"center",background:meta.pillBg,border:`1px solid ${meta.pillBorder}`,borderRadius:999,color:meta.pillText,fontSize:10,fontWeight:800,padding:"0 10px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",boxSizing:"border-box"}}>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{contact.status || "—"}</span>
                    </div>
                  </div>
                  <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:"#b5c5e4",lineHeight:1.3,whiteSpace:"normal",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>{contact.reason || "—"}</div>
                  <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:"#b5c5e4",whiteSpace:"nowrap",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>{contact.callbackDate ? formatDateRu(contact.callbackDate) : "—"}</div>
                  <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:"#b5c5e4",whiteSpace:"normal",lineHeight:1.25,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>{contact.assignedToName || contact.createdByName || "—"}</div>
                  <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:"#8fa1ca",whiteSpace:"nowrap",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>{formatDateRu(contact.createdAt)}</div>
                  <div style={{minWidth:0,paddingLeft:14,paddingRight:10,borderLeft:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:"#8fa1ca",lineHeight:1.3,whiteSpace:"normal",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                      {contact.comment || "—"}
                    </div>
                  </div>
                </div>
              );
            })}
            {!filteredContacts.length && <div style={{padding:"48px 24px",textAlign:"center",color:"#7f92ba"}}>Контакты по текущим фильтрам не найдены.</div>}
          </div>
        </div>

        {!isMobileView && <div style={{borderRadius:18,background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.08)",padding:16,display:"flex",flexDirection:"column",gap:12,position:"sticky",top:16,minHeight:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
            <div style={{fontSize:18,fontWeight:800,color:"#dff7ff"}}>Контакт</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {selectedContact && <div style={{fontSize:12,color:"#64ffda",fontWeight:700}}>{selectedContact.name || "Без имени"}</div>}
              {selectedContact && (
                <button type="button" onClick={closeSelectedContact} style={{width:30,height:30,borderRadius:10,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.04)",color:"#dbe4ff",fontSize:16,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
              )}
            </div>
          </div>
          {!selectedContact ? (
            <div style={{padding:"40px 12px",textAlign:"center",color:"#7f92ba"}}>Выбери строку из таблицы или создай новый контакт.</div>
          ) : (
            <>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <PhoneInput value={selectedContact.phone} onChange={(value) => updateDraft("phone", value)} hasError={Boolean(duplicatePhoneContact)} />
                {duplicatePhoneContact && (
                  <div style={{padding:"9px 10px",borderRadius:10,background:"rgba(255,107,107,0.12)",border:"1px solid rgba(255,107,107,0.28)",color:"#ff9ea8",fontSize:11,fontWeight:700,lineHeight:1.35}}>
                    Такой контакт уже есть в базе: {duplicatePhoneContact.name || "Без имени"} · {duplicatePhoneContact.city || "Без города"}
                  </div>
                )}
              </div>
              <Fld label="Имя" value={selectedContact.name} onChange={(value)=>updateDraft("name", value)} placeholder="Как зовут клиента" />
              <PickerField label="Город" value={selectedContact.city} onChange={(value)=>updateDraft("city", value)} options={cityOptions} placeholder="Выбрать город" />
              <PickerField label="Статус" value={selectedContact.status} onChange={(value)=>updateDraft("status", value)} options={statusOptions} placeholder="Выбрать статус" />
              {selectedContact.status === "Перезвонить" && (
                <ContactDateField label="Дата перезвона" value={selectedContact.callbackDate || ""} onChange={(value)=>updateDraft("callbackDate", value)} error={callbackDateError} placeholder="Выбрать дату" />
              )}
              <PickerField label="Причина" value={selectedContact.reason} onChange={(value)=>updateDraft("reason", value)} options={reasonOptions} placeholder="Выбрать причину" />
              <Fld label="Комментарий" value={selectedContact.comment} onChange={(value)=>updateDraft("comment", value)} multiline placeholder="Что сказал клиент, когда просил перезвонить, есть ли интерес..." />
              <PickerField label="Ответственный" value={selectedContact.assignedToId || ""} onChange={(value)=>updateDraft("assignedToId", value)} options={responsibleOptions} placeholder="Выбрать сотрудника" />
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",fontSize:12,color:"#9fb1d1"}}>
                  Дата и время создания
                  <div style={{marginTop:4,fontSize:13,color:"#e6f1ff",fontWeight:700}}>{formatDateTimeRu(selectedContact.createdAt) || "Сейчас"}</div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",fontSize:12,color:"#9fb1d1"}}>
                  Создал
                  <div style={{marginTop:4,fontSize:13,color:"#e6f1ff",fontWeight:700}}>{selectedContact.createdByName || currentUser?.name || "—"}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button type="button" disabled={saveDisabled} onClick={saveDraft} style={{flex:1,height:42,borderRadius:12,border:"none",background:saveDisabled?"rgba(255,255,255,0.12)":"linear-gradient(135deg,#65ffdd,#18c5be)",color:saveDisabled?"#8f9bb9":"#0a0a23",fontSize:13,fontWeight:800,cursor:saveDisabled?"not-allowed":"pointer",fontFamily:"inherit"}}>{saving ? "Сохраняю..." : "Сохранить"}</button>
                <button type="button" onClick={()=>onCreateOrderFromContact(selectedContact)} style={{flex:1,height:42,borderRadius:12,border:"1px solid rgba(129,199,132,0.34)",background:"rgba(129,199,132,0.18)",color:"#b9efbc",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Создать заказ</button>
              </div>
              {(saveDisabledReason || callbackDateError) && <div style={{fontSize:11,color:"#ffb36b",fontWeight:600}}>{saveDisabledReason || "Укажи дату перезвона"}</div>}
              {selectedContact.id && selectedContact.id !== "new-contact" && typeof onDeleteContact === "function" && (
                <button type="button" disabled={deleting} onClick={deleteCurrentContact} style={{height:40,borderRadius:12,border:"1px solid rgba(255,82,82,0.35)",background:"rgba(255,82,82,0.14)",color:"#ff9ea1",fontSize:12,fontWeight:800,cursor:deleting?"not-allowed":"pointer",fontFamily:"inherit"}}>{deleting ? "Удаляю..." : "Удалить контакт"}</button>
              )}
            </>
          )}
        </div>}
      </div>
    </div>
  );
};

/* ====== MOBILE DASHBOARD (admin / call_center) ====== */
const MobileDashboard = ({
  cities,
  visibleCities,
  activeCity,
  setActiveCity,
  orders,
  employees,
  statuses,
  services,
  sources,
  currentUser,
  todayStatusCards,
  visibleStatusNames,
  setVisibleStatusNames,
  onOpenOrder,
  onOpenNew,
  onOpenServiceCatalog,
  onOpenOrdersExplorer,
  onOpenEmployees,
  onOpenContacts,
  onOpenSummary,
  onOpenData,
  onLogout,
  onConfigureStatuses,
  cloudLabel,
  cloudColor,
  cloudBg,
  cloudBorder,
  remoteError,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState("menu");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMaster, setFilterMaster] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterTimeFrom, setFilterTimeFrom] = useState("");
  const [filterTimeTo, setFilterTimeTo] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [counterFilter, setCounterFilter] = useState("today");
  const [statusPanelOpen, setStatusPanelOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);

  const statusMap = useMemo(() => makeStatusMap(statuses), [statuses]);
  const today = dstr(new Date());
  const tomorrow = dstr(new Date(Date.now() + 86400000));

  useEffect(() => {
    if (drawerOpen) {
      setDrawerMounted(true);
      document.body.style.overflow = "hidden";
    } else {
      const t = window.setTimeout(() => setDrawerMounted(false), 320);
      document.body.style.overflow = "";
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [drawerOpen]);

  const cityList = useMemo(() => Object.keys(visibleCities || {}), [visibleCities]);
  const masterList = useMemo(() => employees.filter((e) => e.type === "technician" && (!filterCity || e.city === filterCity || e.city === activeCity)), [employees, filterCity, activeCity]);

  const allOrderRows = useMemo(() => {
    const targetCity = filterCity || activeCity;
    return Object.entries(orders || {})
      .filter(([key]) => !targetCity || key.startsWith(`${targetCity}|`))
      .map(([key, value]) => {
        const parts = key.split("|");
        const masterEmployee = employees.find((e) => e.id === value?._masterId) || employees.find((e) => e.name === parts[1] && e.type === "technician");
        return {
          ...value,
          key,
          city: parts[0] || value?.city || "",
          masterName: masterEmployee?.name || parts[1] || "—",
          masterId: masterEmployee?.id || value?._masterId || null,
          masterKey: masterEmployee ? empKey(masterEmployee) : null,
          masterColor: masterEmployee?.color || "#7eb1ff",
          dateStr: parts[2] || value?.dateStr || "",
          timeIdx: Number(value?.timeIdx ?? parts[3] ?? 0),
          durationSlots: getOrderDurationSlots(value),
          displayPrice: value?.finalPrice || value?.price || "",
        };
      });
  }, [orders, activeCity, filterCity, employees]);

  const filteredRows = useMemo(() => {
    return allOrderRows.filter((row) => {
      if (filterStatus && row.status !== filterStatus) return false;
      if (filterMaster && row.masterId !== filterMaster && row.masterKey !== filterMaster) return false;
      if (filterDate && row.dateStr !== filterDate) return false;
      if (filterTimeFrom && Number(row.timeIdx) < Number(filterTimeFrom)) return false;
      if (filterTimeTo && Number(row.timeIdx) >= Number(filterTimeTo)) return false;
      if (counterFilter === "today" && row.dateStr !== today) return false;
      if (counterFilter === "tomorrow" && row.dateStr !== tomorrow) return false;
      if (counterFilter === "week") {
        const todayDate = new Date();
        const target = parseDateStr(row.dateStr);
        if (!target) return false;
        const diff = (target.getTime() - todayDate.setHours(0, 0, 0, 0)) / 86400000;
        if (diff < 0 || diff > 7) return false;
      }
      if (counterFilter === "all") return true;
      return true;
    }).sort((a, b) => (a.dateStr || "").localeCompare(b.dateStr || "") || Number(a.timeIdx) - Number(b.timeIdx));
  }, [allOrderRows, filterStatus, filterMaster, filterDate, filterTimeFrom, filterTimeTo, counterFilter, today, tomorrow]);

  const activeFilterCount = (filterStatus ? 1 : 0) + (filterMaster ? 1 : 0) + (filterDate ? 1 : 0) + (filterTimeFrom || filterTimeTo ? 1 : 0) + (filterCity ? 1 : 0);
  const resetFilters = () => {
    setFilterStatus("");
    setFilterMaster("");
    setFilterDate("");
    setFilterTimeFrom("");
    setFilterTimeTo("");
    setFilterCity("");
  };

  const counterTabs = [
    { id: "today", label: "Сегодня" },
    { id: "tomorrow", label: "Завтра" },
    { id: "week", label: "Неделя" },
    { id: "all", label: "Все" },
  ];

  const navItems = [
    { label: "📦 Заказы (список)", action: () => { setDrawerOpen(false); onOpenOrdersExplorer(); } },
    { label: "👷 Сотрудники", action: () => { setDrawerOpen(false); onOpenEmployees(); } },
    currentUser?.role === "call_center" || currentUser?.role === "admin" ? { label: "☎ Контакты", action: () => { setDrawerOpen(false); onOpenContacts(); } } : null,
    currentUser?.role === "admin" ? { label: "🗂 Справочник услуг", action: () => { setDrawerOpen(false); onOpenServiceCatalog(); } } : null,
    currentUser?.role === "admin" ? { label: "📊 Сводка", action: () => { setDrawerOpen(false); onOpenSummary(); } } : null,
    currentUser?.role === "admin" ? { label: "🛠 Данные", action: () => { setDrawerOpen(false); onOpenData(); } } : null,
  ].filter(Boolean);

  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: "radial-gradient(circle at top left,#1a264a 0%,#0a0a1a 26%,#0c0f20 100%)", minHeight: "100vh", color: "#e6f1ff", paddingBottom: 92 }}>
      <style>{`
        @keyframes mDrawerIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        @keyframes mDrawerOut{from{transform:translateX(0)}to{transform:translateX(-100%)}}
        @keyframes mFade{from{opacity:0}to{opacity:1}}
        @keyframes mFadeOut{from{opacity:1}to{opacity:0}}
        @keyframes mCardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes mFabPulse{0%,100%{box-shadow:0 12px 26px rgba(24,197,190,0.42),0 0 0 0 rgba(24,197,190,0.55)}50%{box-shadow:0 18px 36px rgba(24,197,190,0.48),0 0 0 14px rgba(24,197,190,0)}}
        @keyframes mPanelDown{from{opacity:0;transform:translateY(-6px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
        .m-card{animation:mCardIn .25s ease both}
        .m-fab{animation:mFabPulse 2.4s ease-in-out infinite}
        .m-tap{transition:transform .15s ease,background .15s ease,box-shadow .15s ease}
        .m-tap:active{transform:scale(0.97)}
        .m-chip{transition:all .2s ease}
        .m-drawer{animation:mDrawerIn .32s cubic-bezier(.2,.8,.2,1) both}
        .m-drawer-out{animation:mDrawerOut .28s cubic-bezier(.4,0,.2,1) both}
        .m-overlay{animation:mFade .22s ease both}
        .m-overlay-out{animation:mFadeOut .2s ease both}
        .m-panel{animation:mPanelDown .18s ease both}
        .m-input{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#e6f1ff;padding:10px 12px;font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box}
        .m-input:focus{border-color:rgba(120,230,255,0.5);background:rgba(255,255,255,0.08)}
        .m-section-title{font-size:10px;color:#7f92ba;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px}
      `}</style>

      {/* Top app bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 60, background: "linear-gradient(135deg,#0f2142,#1a1a2e,#14386a)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className="m-tap"
          onClick={() => { setDrawerTab("menu"); setDrawerOpen(true); }}
          aria-label="Меню"
          style={{ width: 42, height: 42, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#dbe4ff", fontSize: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          ☰
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#8ea2cf", lineHeight: 1 }}>{currentUser?.name || "—"} · {EMPLOYEE_TYPES[currentUser?.role]?.label || "—"}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#56efe5", lineHeight: 1.2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>❄ {filterCity || activeCity}</div>
        </div>
        <button
          className="m-tap"
          onClick={() => { setDrawerTab("filters"); setDrawerOpen(true); }}
          aria-label="Фильтры"
          style={{ position: "relative", width: 42, height: 42, borderRadius: 12, border: activeFilterCount ? "1px solid rgba(120,230,255,0.5)" : "1px solid rgba(255,255,255,0.12)", background: activeFilterCount ? "rgba(80,220,255,0.16)" : "rgba(255,255,255,0.05)", color: activeFilterCount ? "#d8f7ff" : "#dbe4ff", fontSize: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          ⚙
          {activeFilterCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "linear-gradient(135deg,#65ffdd,#18c5be)", color: "#0a0a23", fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(24,197,190,0.4)" }}>{activeFilterCount}</span>}
        </button>
      </div>

      {/* Cloud / error strip */}
      <div style={{ padding: "8px 14px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, height: 30, padding: "0 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, color: cloudColor, background: cloudBg, border: cloudBorder, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>☁ {cloudLabel}</div>
        <button
          className="m-tap"
          onClick={() => setStatusPanelOpen((prev) => !prev)}
          style={{ height: 30, padding: "0 12px", borderRadius: 10, border: statusPanelOpen ? "1px solid rgba(120,230,255,0.45)" : "1px solid rgba(255,255,255,0.1)", background: statusPanelOpen ? "rgba(80,220,255,0.16)" : "rgba(255,255,255,0.05)", color: statusPanelOpen ? "#d8f7ff" : "#9bb0d4", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span>⚙</span><span>Статусы</span>
        </button>
      </div>

      {statusPanelOpen && (
        <div className="m-panel" style={{ margin: "8px 14px 0", padding: 10, borderRadius: 12, background: "linear-gradient(180deg,#1d2140,#15182e)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 18px 40px rgba(0,0,0,0.42)" }}>
          <div className="m-section-title">Статусы в верхней строке</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
            {(statuses || []).map((s) => {
              const checked = visibleStatusNames.includes(s.name);
              return (
                <label key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <input type="checkbox" checked={checked} onChange={() => setVisibleStatusNames((prev) => checked ? prev.filter((n) => n !== s.name) : [...prev, s.name])} style={{ accentColor: "#65ffdd" }} />
                  <span style={{ fontSize: 12, color: "#dbe4ff", fontWeight: 700 }}>{s.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Status counter chips (horizontal scroll) */}
      <div style={{ marginTop: 10, padding: "0 14px" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {todayStatusCards.map((item) => (
            <div key={item.name} className="m-card" style={{ flex: "0 0 auto", minWidth: 96, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 9, color: "#7f92ba", letterSpacing: 0.4, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{statusCounterLabel(item.name)}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: item.meta.left, lineHeight: 1.05, marginTop: 4 }}>{item.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick date filter chips */}
      <div style={{ marginTop: 10, padding: "0 14px" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {counterTabs.map((tab) => {
            const active = counterFilter === tab.id;
            return (
              <button key={tab.id} className="m-tap m-chip" onClick={() => setCounterFilter(tab.id)} style={{ flex: "0 0 auto", padding: "8px 14px", borderRadius: 999, border: active ? "1px solid rgba(120,230,255,0.5)" : "1px solid rgba(255,255,255,0.1)", background: active ? "rgba(80,220,255,0.18)" : "rgba(255,255,255,0.04)", color: active ? "#dff7ff" : "#9bb0d4", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{tab.label}</button>
            );
          })}
        </div>
      </div>

      {remoteError && <div style={{ margin: "10px 14px 0", padding: "10px 12px", borderRadius: 10, background: "rgba(255,82,82,0.12)", border: "1px solid rgba(255,82,82,0.2)", color: "#ff8a80", fontSize: 12 }}>{remoteError}</div>}

      {/* Active filters chips */}
      {activeFilterCount > 0 && (
        <div style={{ marginTop: 10, padding: "0 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {filterCity && <FilterChip label={`Город: ${filterCity}`} onClear={() => setFilterCity("")} />}
          {filterStatus && <FilterChip label={`Статус: ${filterStatus}`} onClear={() => setFilterStatus("")} />}
          {filterMaster && <FilterChip label={`Мастер: ${employees.find((e) => e.id === filterMaster || empKey(e) === filterMaster)?.name || ""}`} onClear={() => setFilterMaster("")} />}
          {filterDate && <FilterChip label={`Дата: ${formatShortDate(filterDate)}`} onClear={() => setFilterDate("")} />}
          {(filterTimeFrom || filterTimeTo) && <FilterChip label={`Время: ${filterTimeFrom ? TIMES[filterTimeFrom] : "00:00"}–${filterTimeTo ? TIMES[filterTimeTo] || `${WORKDAY_START_HOUR + Number(filterTimeTo)}:00` : "—"}`} onClear={() => { setFilterTimeFrom(""); setFilterTimeTo(""); }} />}
          <button className="m-tap" onClick={resetFilters} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,82,82,0.3)", background: "rgba(255,82,82,0.1)", color: "#ff9ea1", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Сбросить все</button>
        </div>
      )}

      {/* Order list */}
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {filteredRows.length === 0 && (
          <div style={{ padding: "40px 18px", textAlign: "center", color: "#7f92ba", borderRadius: 14, background: "rgba(255,255,255,0.025)", border: "1px dashed rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#bbcaee" }}>Заказов нет</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Попробуй изменить фильтры или добавить новый заказ</div>
          </div>
        )}
        {filteredRows.map((row, idx) => {
          const meta = statusMeta(row.status, statusMap);
          const phoneClean = (row.phone || "").replace(/\D/g, "");
          return (
            <div
              key={row.key}
              className="m-card m-tap"
              onClick={() => onOpenOrder(row.key, row)}
              style={{ animationDelay: `${Math.min(idx, 8) * 35}ms`, padding: 12, borderRadius: 14, background: meta.cardBg, border: `1px solid ${meta.cardBorder}`, borderLeft: `4px solid ${meta.left}`, cursor: "pointer", boxShadow: "0 6px 14px rgba(0,0,0,0.18)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: meta.cardText, opacity: 0.95 }}>{formatOrderNumber(row.orderNumber)}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: meta.cardText }}>{formatShortDate(row.dateStr)} · {slotLabel(row.timeIdx)}–{getOrderEndLabel(row)}</div>
                </div>
                <div style={{ padding: "5px 10px", borderRadius: 999, background: meta.pillBg, border: `1px solid ${meta.pillBorder}`, color: meta.pillText, fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }}>{meta.icon} {row.status || "—"}</div>
              </div>

              <div style={{ fontSize: 14, fontWeight: 800, color: meta.cardText, marginBottom: 4 }}>{row.name || "Без имени"}</div>
              {row.address && <div style={{ fontSize: 12, color: meta.cardText, opacity: 0.84, marginBottom: 4 }}>📍 {row.address}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: meta.cardText, opacity: 0.84, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 7, background: row.masterColor, display: "inline-block", boxShadow: `0 0 0 1px ${row.masterColor}55` }} />
                  <span style={{ fontWeight: 700 }}>{row.masterName}</span>
                </span>
                {row.displayPrice && <span style={{ fontWeight: 800, color: meta.cardText }}>· {row.displayPrice}₽</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {phoneClean && (
                  <a
                    onClick={(e) => e.stopPropagation()}
                    href={`tel:+7${phoneClean}`}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 10, background: "rgba(100,255,218,0.14)", border: "1px solid rgba(100,255,218,0.3)", color: "#101522", fontSize: 12, fontWeight: 800, textAlign: "center", textDecoration: "none" }}
                  >
                    📞 +7{fmtPh(row.phone || "")}
                  </a>
                )}
                {row.address && (
                  <a
                    onClick={(e) => e.stopPropagation()}
                    href={`https://yandex.ru/maps/?text=${encodeURIComponent(row.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(105,174,239,0.14)", border: "1px solid rgba(105,174,239,0.34)", color: "#9ed4ff", fontSize: 12, fontWeight: 800, textDecoration: "none" }}
                  >
                    🧭
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Action Button */}
      {canEditOrders(currentUser) && (
        <button
          onClick={onOpenNew}
          aria-label="Новый заказ"
          className="m-fab m-tap"
          style={{ position: "fixed", right: 18, bottom: 22, width: 64, height: 64, borderRadius: 32, border: "none", background: "linear-gradient(135deg,#65ffdd,#18c5be)", color: "#0a0a23", fontSize: 32, fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 70, fontFamily: "inherit" }}
        >
          +
        </button>
      )}

      {/* Drawer overlay */}
      {drawerMounted && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            className={drawerOpen ? "m-overlay" : "m-overlay-out"}
            style={{ position: "fixed", inset: 0, background: "rgba(4,8,22,0.6)", backdropFilter: "blur(3px)", zIndex: 1100 }}
          />
          <div
            className={drawerOpen ? "m-drawer" : "m-drawer-out"}
            style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: "min(86vw,340px)", background: "linear-gradient(180deg,#161b34,#0d1126)", borderRight: "1px solid rgba(255,255,255,0.08)", boxShadow: "16px 0 40px rgba(0,0,0,0.55)", zIndex: 1101, display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#65ffdd,#18c5be)", color: "#0a0a23", fontSize: 22, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{(currentUser?.name || "?")[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#dff7ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser?.name}</div>
                  <div style={{ fontSize: 11, color: "#8ea2cf", marginTop: 2 }}>{EMPLOYEE_TYPES[currentUser?.role]?.label || currentUser?.role}</div>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="m-tap" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#dbe4ff", fontSize: 18, cursor: "pointer", fontFamily: "inherit" }}>×</button>
              </div>
              <div style={{ display: "flex", marginTop: 14, padding: 4, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {[{ id: "menu", label: "Меню" }, { id: "filters", label: `Фильтры${activeFilterCount ? " · " + activeFilterCount : ""}` }].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setDrawerTab(tab.id)}
                    className="m-tap"
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 9, border: "none", background: drawerTab === tab.id ? "linear-gradient(135deg,#65ffdd,#18c5be)" : "transparent", color: drawerTab === tab.id ? "#0a0a23" : "#9bb0d4", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                  >{tab.label}</button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 18px" }}>
              {drawerTab === "menu" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="m-section-title">Город</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {cityList.map((c) => {
                      const active = c === activeCity;
                      const cnt = Object.keys(orders).filter((k) => k.startsWith(c + "|")).length;
                      return (
                        <button key={c} className="m-tap m-chip" onClick={() => { setActiveCity(c); setDrawerOpen(false); }} style={{ padding: "8px 14px", borderRadius: 999, border: active ? "1px solid rgba(120,230,255,0.45)" : "1px solid rgba(255,255,255,0.1)", background: active ? "rgba(80,220,255,0.18)" : "rgba(255,255,255,0.04)", color: active ? "#dff7ff" : "#9bb0d4", fontSize: 12, fontWeight: active ? 800 : 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {c}
                          {cnt > 0 && <span style={{ background: "rgba(255,255,255,0.14)", borderRadius: 8, padding: "1px 6px", fontSize: 9 }}>{cnt}</span>}
                        </button>
                      );
                    })}
                  </div>

                  <div className="m-section-title">Навигация</div>
                  {navItems.map((item) => (
                    <button key={item.label} className="m-tap" onClick={item.action} style={{ width: "100%", textAlign: "left", padding: "13px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.035)", color: "#dbe4ff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{item.label}</button>
                  ))}

                  <button className="m-tap" onClick={() => { setDrawerOpen(false); onLogout(); }} style={{ marginTop: 14, width: "100%", padding: "13px 14px", borderRadius: 12, border: "1px solid rgba(255,82,82,0.3)", background: "rgba(255,82,82,0.12)", color: "#ff9ea1", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>↪ Выход</button>
                </div>
              )}

              {drawerTab === "filters" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div className="m-section-title">Город</div>
                    <CustomSelect
                      value={filterCity}
                      onChange={setFilterCity}
                      placeholder={`Текущий (${activeCity})`}
                      options={cityList.map((c) => ({ value: c, label: c }))}
                      triggerStyle={{ minHeight: 44, borderRadius: 12, fontSize: 13, background: "rgba(255,255,255,0.035)" }}
                      menuZIndex={1400}
                    />
                  </div>

                  <div>
                    <div className="m-section-title">Статус</div>
                    <CustomSelect
                      value={filterStatus}
                      onChange={setFilterStatus}
                      placeholder="Все статусы"
                      options={(statuses || []).map((s) => ({ value: s.name, label: s.name }))}
                      triggerStyle={{ minHeight: 44, borderRadius: 12, fontSize: 13, background: "rgba(255,255,255,0.035)" }}
                      menuZIndex={1400}
                    />
                  </div>

                  <div>
                    <div className="m-section-title">Мастер</div>
                    <CustomSelect
                      value={filterMaster}
                      onChange={setFilterMaster}
                      placeholder="Все мастера"
                      options={masterList.map((m) => ({ value: m.id || empKey(m), label: `${m.name}${m.city ? ` · ${m.city}` : ""}` }))}
                      triggerStyle={{ minHeight: 44, borderRadius: 12, fontSize: 13, background: "rgba(255,255,255,0.035)" }}
                      menuZIndex={1400}
                    />
                  </div>

                  <div>
                    <div className="m-section-title">Дата</div>
                    <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="m-input" />
                  </div>

                  <div>
                    <div className="m-section-title">Время (от — до)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <CustomSelect
                        value={filterTimeFrom}
                        onChange={setFilterTimeFrom}
                        placeholder="с любого"
                        options={TIMES.map((t, idx) => ({ value: idx, label: t }))}
                        triggerStyle={{ minHeight: 44, borderRadius: 12, fontSize: 13, background: "rgba(255,255,255,0.035)" }}
                        menuZIndex={1400}
                      />
                      <CustomSelect
                        value={filterTimeTo}
                        onChange={setFilterTimeTo}
                        placeholder="до любого"
                        options={TIMES.map((t, idx) => ({ value: idx + 1, label: slotLabel(idx + 1) }))}
                        triggerStyle={{ minHeight: 44, borderRadius: 12, fontSize: 13, background: "rgba(255,255,255,0.035)" }}
                        menuZIndex={1400}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button className="m-tap" onClick={resetFilters} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#dbe4ff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Сбросить</button>
                    <button className="m-tap" onClick={() => setDrawerOpen(false)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#65ffdd,#18c5be)", color: "#0a0a23", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Применить</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const FilterChip = ({ label, onClear }) => (
  <button onClick={onClear} className="m-tap" style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(120,230,255,0.35)", background: "rgba(80,220,255,0.14)", color: "#dff7ff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span>{label}</span>
    <span style={{ fontSize: 13, lineHeight: 1, opacity: 0.7 }}>×</span>
  </button>
);

/* ====== MAIN ====== */
export default function CRM() {
  const [cities,setCities]=useState(INIT_CITIES);
  const [employees,setEmployees]=useState(INIT_EMPLOYEES);
  const [orders,setOrders]=useState(initOrders);
  const [orderHistory,setOrderHistory]=useState({});
  const [dayOffs,setDayOffs]=useState({});
  const [busySlots,setBusySlots]=useState({});
  const [slotLocks,setSlotLocks]=useState({});
  const [activeCity,setActiveCity]=useState("Краснодар");
  const [popup,setPopup]=useState(null);
  const [pastOrderDraft,setPastOrderDraft]=useState(null);
  const [draftSlotSelection,setDraftSlotSelection]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [showAddEmployee,setShowAddEmployee]=useState(false);
  const [showAddCity,setShowAddCity]=useState(false);
  const [showEmployeeList,setShowEmployeeList]=useState(false);
  const [showContactsView,setShowContactsView]=useState(false);
  const [showOrdersExplorerView,setShowOrdersExplorerView]=useState(false);
  const [showAdminMenu,setShowAdminMenu]=useState(false);
  const [showStatusCounterConfig,setShowStatusCounterConfig]=useState(false);
  const [employeeCard,setEmployeeCard]=useState(null);
  const [employeeCardReturnToList,setEmployeeCardReturnToList]=useState(false);
  const [employeeSavePending,setEmployeeSavePending]=useState(false);
  const [permissionsEmployee,setPermissionsEmployee]=useState(null);
  const [permissionsSaving,setPermissionsSaving]=useState(false);
  const [accessEmployee,setAccessEmployee]=useState(null);
  const [accessSaving,setAccessSaving]=useState(false);
  const [editAccessEmployee,setEditAccessEmployee]=useState(null);
  const [editAccessSaving,setEditAccessSaving]=useState(false);
  const [month,setMonth]=useState(3);
  const [year,setYear]=useState(2026);
  const [showSummary,setShowSummary]=useState(false);
  const [showServiceCatalog,setShowServiceCatalog]=useState(false);
  const [showDataView,setShowDataView]=useState(false);
  const [cityDeleteDraft,setCityDeleteDraft]=useState(null);
  const [sources,setSources]=useState(INIT_SOURCES);
  const [services,setServices]=useState(INIT_SERVICES);
  const [statuses,setStatuses]=useState(INIT_STATUSES);
  const [visibleStatusNames,setVisibleStatusNames]=useState(()=>INIT_STATUSES.map((status)=>status.name));
  const [contacts,setContacts]=useState(INIT_CONTACTS);
  const [contactStatuses,setContactStatuses]=useState(INIT_CONTACT_STATUSES);
  const [contactReasons,setContactReasons]=useState(INIT_CONTACT_REASONS);
  const [deletedOrders,setDeletedOrders]=useState({});
  const [deleteEmployeeDraft,setDeleteEmployeeDraft]=useState(null);
  const [contactToOrderDraft,setContactToOrderDraft]=useState(null);
  const [serviceEditor,setServiceEditor]=useState(null);
  const [serviceSaving,setServiceSaving]=useState(false);
  const [isHydrated,setIsHydrated]=useState(false);
  const [authSession,setAuthSession]=useState(()=>getStoredSession());
  const [currentUser,setCurrentUser]=useState(null);
  const [authPending,setAuthPending]=useState(false);
  const [authError,setAuthError]=useState("");
  const [remoteError,setRemoteError]=useState("");
  const [isMobile,setIsMobile]=useState(typeof window !== "undefined" ? window.innerWidth < 760 : false);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setIsMobile(window.innerWidth < 760);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const scheduleScrollRef = useRef(null);
  const todayRowRef = useRef(null);
  const heldDraftLockRef = useRef(null);
  const defaultSnapshot = useMemo(() => ({
    cities: INIT_CITIES,
    employees: INIT_EMPLOYEES,
    orders: initOrders(),
    orderHistory: {},
    dayOffs: {},
    busySlots: {},
    slotLocks: {},
    activeCity: "Краснодар",
    month: 3,
    year: 2026,
    showSummary: false,
    showServiceCatalog: false,
    showDataView: false,
    showContactsView: false,
    showOrdersExplorerView: false,
    visibleStatusNames: INIT_STATUSES.map((status)=>status.name),
    sources: INIT_SOURCES,
    services: INIT_SERVICES,
    statuses: INIT_STATUSES,
    contacts: INIT_CONTACTS,
    contactStatuses: INIT_CONTACT_STATUSES,
    contactReasons: INIT_CONTACT_REASONS,
    deletedOrders: {},
    currentUser: null,
  }), []);

  const visibleCities = useMemo(() => {
    if (currentUser?.role === "technician" && currentUser?.city && cities[currentUser.city]) {
      return { [currentUser.city]: cities[currentUser.city] };
    }
    return cities;
  }, [cities, currentUser]);
  const dates=useMemo(()=>daysIn(year,month),[year,month]);
  const cityMasters=useMemo(()=>{
    const techs = employees.filter(m=>m.type==="technician"&&m.city===activeCity);
    if (currentUser?.role === "technician") return techs.filter((m) => m.id === currentUser.id);
    return techs;
  },[employees,activeCity,currentUser]);
  const groupedEmployees=useMemo(()=>({
    technicians: employees.filter((e)=>e.type==="technician"),
    callCenter: employees.filter((e)=>e.type==="call_center"),
    admins: employees.filter((e)=>e.type==="admin"),
  }),[employees]);
  const today=dstr(new Date());
  const activeSlotLocks = useMemo(() => pruneExpiredSlotLocks(slotLocks), [slotLocks]);
  const statusMap = useMemo(() => makeStatusMap(statuses), [statuses]);
  const knownStatusNamesRef = useRef((INIT_STATUSES || []).map((status) => status.name));
  const allOrders=useMemo(()=>{
    const scoped = Object.entries(orders).filter(([k])=>k.startsWith(activeCity+"|"));
    if (currentUser?.role === "technician") {
      return scoped.filter(([,v]) => v._masterId === currentUser.id);
    }
    return scoped;
  },[orders,activeCity,currentUser]);
  const todayOrders = useMemo(() => allOrders.filter(([, value]) => value.dateStr === today), [allOrders, today]);
  const todayStatusCards = useMemo(() => {
    const visibleSet = new Set(visibleStatusNames?.length ? visibleStatusNames : (statuses || []).map((status)=>status.name));
    return (statuses || []).filter((status) => visibleSet.has(status.name)).map((status) => ({
      ...status,
      count: todayOrders.filter(([, value]) => value.status === status.name).length,
      meta: statusMeta(status.name, statusMap),
    }));
  }, [statusMap, statuses, todayOrders, visibleStatusNames]);
  useEffect(() => {
    setVisibleStatusNames((prev) => {
      const allNames = (statuses || []).map((status) => status.name);
      if (!allNames.length) return prev;
      if (!prev?.length) {
        knownStatusNamesRef.current = allNames;
        return allNames;
      }
      const previousKnown = knownStatusNamesRef.current || [];
      const keep = prev.filter((name) => allNames.includes(name));
      const added = allNames.filter((name) => !previousKnown.includes(name) && !keep.includes(name));
      knownStatusNamesRef.current = allNames;
      return added.length ? [...keep, ...added] : keep;
    });
  }, [statuses]);
  const newOrderInitialData = useMemo(() => (
    contactToOrderDraft ? {
      phone: contactToOrderDraft.phone,
      name: contactToOrderDraft.name || "",
      city: contactToOrderDraft.city,
      source: "Контакты",
    } : null
  ), [contactToOrderDraft]);
  const revenue=allOrders.reduce((s,[,v])=>s+(parseInt(v.price)||0),0);

  const pushHistory = useCallback((orderKey, entry) => {
    setOrderHistory((prev)=>({
      ...prev,
      [orderKey]: [entry, ...(prev[orderKey] || [])],
    }));
  },[]);

  const currentLockOwnerId = useMemo(() => currentUser?.id || currentUser?.name || "local-user", [currentUser?.id, currentUser?.name]);
  const applyLocalSlotLock = useCallback((selection) => {
    if (!selection?.city || !selection?.master || !selection?.dateStr || selection?.timeIdx === "" || selection?.timeIdx == null) return;
    const expiresAt = new Date(Date.now() + SLOT_LOCK_TTL_MS).toISOString();
    setSlotLocks((prev) => {
      const next = pruneExpiredSlotLocks(prev);
      getLockSlotIndices(selection).forEach((slotIdx) => {
        next[lok(selection.city, selection.master, selection.dateStr, slotIdx)] = {
          employeeId: currentLockOwnerId,
          employeeName: currentUser?.name || "Сотрудник",
          expiresAt,
        };
      });
      return next;
    });
  }, [currentLockOwnerId, currentUser?.name]);

  const releaseLocalSlotLock = useCallback((selection) => {
    if (!selection?.city || !selection?.master || !selection?.dateStr || selection?.timeIdx === "" || selection?.timeIdx == null) return;
    setSlotLocks((prev) => {
      const next = { ...prev };
      getLockSlotIndices(selection).forEach((slotIdx) => {
        const key = lok(selection.city, selection.master, selection.dateStr, slotIdx);
        if (next[key]?.employeeId === currentLockOwnerId) delete next[key];
      });
      return next;
    });
  }, [currentLockOwnerId]);
  const releaseAllMyLocalSlotLocks = useCallback(() => {
    setSlotLocks((prev) => Object.entries(prev || {}).reduce((acc, [key, value]) => {
      if (value?.employeeId === currentLockOwnerId) return acc;
      acc[key] = value;
      return acc;
    }, {}));
  }, [currentLockOwnerId]);
  const closeOrderDraftAndReleaseLocks = useCallback(() => {
    releaseAllMyLocalSlotLocks();
    heldDraftLockRef.current = null;
    setDraftSlotSelection(null);
    setPopup(null);
    setShowNew(false);
    setContactToOrderDraft(null);
    if (isSupabaseConfigured() && authSession?.access_token) {
      releaseCurrentUserSlotLocksRemote({ currentUser, session: authSession }).catch(() => {});
    }
  }, [authSession, currentUser, releaseAllMyLocalSlotLocks]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setSlotLocks((prev) => pruneExpiredSlotLocks(prev));
    }, 30000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const previousSelection = heldDraftLockRef.current;
    if (!draftSlotSelection) {
      if (previousSelection) {
        if (isSupabaseConfigured() && authSession?.access_token) {
          releaseSlotLocksRemote({
            activeCity: previousSelection.city,
            masterName: previousSelection.master,
            dateStr: previousSelection.dateStr,
            timeIdx: previousSelection.timeIdx,
            durationSlots: previousSelection.durationSlots,
            employees,
            currentUser,
            session: authSession,
          }).catch(() => {});
        }
        releaseLocalSlotLock(previousSelection);
        heldDraftLockRef.current = null;
      }
      return undefined;
    }

    const sameSelection = previousSelection
      && previousSelection.city === draftSlotSelection.city
      && previousSelection.master === draftSlotSelection.master
      && previousSelection.dateStr === draftSlotSelection.dateStr
      && Number(previousSelection.timeIdx) === Number(draftSlotSelection.timeIdx)
      && Number(previousSelection.durationSlots) === Number(draftSlotSelection.durationSlots);

    if (!sameSelection && previousSelection) {
      if (isSupabaseConfigured() && authSession?.access_token) {
        releaseSlotLocksRemote({
          activeCity: previousSelection.city,
          masterName: previousSelection.master,
          dateStr: previousSelection.dateStr,
          timeIdx: previousSelection.timeIdx,
          durationSlots: previousSelection.durationSlots,
          employees,
          currentUser,
          session: authSession,
        }).catch(() => {});
      }
      releaseLocalSlotLock(previousSelection);
    }

    let cancelled = false;
    const syncLock = async () => {
      applyLocalSlotLock(draftSlotSelection);
      if (isSupabaseConfigured() && authSession?.access_token) {
        try {
          await syncSlotLocksRemote({
            activeCity: draftSlotSelection.city,
            masterName: draftSlotSelection.master,
            dateStr: draftSlotSelection.dateStr,
            timeIdx: draftSlotSelection.timeIdx,
            durationSlots: draftSlotSelection.durationSlots,
            employees,
            currentUser,
            session: authSession,
          });
        } catch (error) {
          if (!cancelled) {
            releaseLocalSlotLock(draftSlotSelection);
            setRemoteError(error.message);
            setDraftSlotSelection(null);
            setPopup(null);
            setShowNew(false);
          }
          return;
        }
      }
      if (!cancelled) heldDraftLockRef.current = draftSlotSelection;
    };

    syncLock();
    const timerId = window.setInterval(syncLock, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [applyLocalSlotLock, authSession, currentUser, draftSlotSelection, employees, releaseLocalSlotLock]);

  const refreshFromSource = useCallback(async (sessionOverride = authSession, options = {}) => {
    const preserveUiState = options.preserveUiState !== false;
    const snapshot = await loadCrmState(defaultSnapshot, sessionOverride);
    setCities(snapshot.cities);
    setEmployees(snapshot.employees);
    setOrders(snapshot.orders);
    setOrderHistory(snapshot.orderHistory);
    setDayOffs(snapshot.dayOffs);
    setBusySlots(snapshot.busySlots || {});
    setSlotLocks(pruneExpiredSlotLocks(snapshot.slotLocks || {}));
    setDeletedOrders(snapshot.deletedOrders || {});
    setContacts(snapshot.contacts || INIT_CONTACTS);
    setContactStatuses(snapshot.contactStatuses || INIT_CONTACT_STATUSES);
    setContactReasons(snapshot.contactReasons || INIT_CONTACT_REASONS);
    if (preserveUiState) {
      setActiveCity((prev) => snapshot.cities?.[prev] ? prev : (Object.keys(snapshot.cities || {})[0] || "Краснодар"));
      setMonth((prev) => prev ?? 3);
      setYear((prev) => prev ?? 2026);
      setShowSummary((prev) => prev);
      setShowServiceCatalog((prev) => prev);
      setShowDataView((prev) => prev);
      setShowContactsView((prev) => prev);
    } else {
      setActiveCity(snapshot.activeCity || "Краснодар");
      setMonth(snapshot.month ?? 3);
      setYear(snapshot.year ?? 2026);
      setShowSummary(Boolean(snapshot.showSummary));
      setShowServiceCatalog(Boolean(snapshot.showServiceCatalog));
      setShowDataView(Boolean(snapshot.showDataView));
      setShowContactsView(Boolean(snapshot.showContactsView));
    }
    setSources(snapshot.sources);
    setServices(snapshot.services || INIT_SERVICES);
    setStatuses(snapshot.statuses || INIT_STATUSES);
    setCurrentUser(snapshot.currentUser);
    setIsHydrated(true);
  }, [authSession, defaultSnapshot]);

  useEffect(() => {
    if (!(isSupabaseConfigured() && authSession?.access_token && currentUser?.id)) return;
    releaseCurrentUserSlotLocksRemote({ currentUser, session: authSession }).catch(() => {});
    releaseAllMyLocalSlotLocks();
    heldDraftLockRef.current = null;
    setDraftSlotSelection(null);
  }, [authSession, currentUser?.id, releaseAllMyLocalSlotLocks]);

  const openEmployeeCard = useCallback((employee, options = {}) => {
    const fromList = Boolean(options.fromList);
    setEmployeeCardReturnToList(fromList);
    setEmployeeCard(employee);
  }, []);

  const closeEmployeeCard = useCallback(() => {
    setEmployeeCard(null);
    setShowAddEmployee(false);
    setEmployeeCardReturnToList(false);
  }, []);

  const handleSave=useCallback(async (key,formData)=>{
    if (!canEditOrders(currentUser)) {
      setRemoteError("У тебя нет прав на изменение заявок");
      return;
    }
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        const before = popup?.data || null;
        const previousKey = popup?.key || null;
        const result = await upsertOrder({
          formData,
          existingOrder: before,
          snapshot: { cities, employees, sources, currentUser, orders, dayOffs, busySlots },
          session: authSession,
        });
        const optimisticOrder = {
          ...(before || {}),
          ...formData,
          _id: result?.savedRow?.id || before?._id,
          orderNumber: result?.savedRow?.order_number ?? before?.orderNumber ?? null,
          _cityId: result?.savedRow?.city_id || before?._cityId,
          _masterId: result?.savedRow?.technician_id || before?._masterId,
          _sourceId: result?.savedRow?.source_id || before?._sourceId,
          _directionId: result?.savedRow?.direction_id || formData.serviceDirectionId || before?._directionId || null,
          _subcategoryId: result?.savedRow?.subcategory_id || formData.serviceSubcategoryId || before?._subcategoryId || null,
          _createdAt: before?._createdAt || new Date().toISOString(),
          createdByName: before?.createdByName || currentUser?.name || "",
          finalPrice: formData.finalPrice || before?.finalPrice || "",
          serviceDirectionId: formData.serviceDirectionId || before?.serviceDirectionId || "",
          serviceDirectionName: formData.serviceDirectionName || before?.serviceDirectionName || "",
          serviceSubcategoryId: formData.serviceSubcategoryId || before?.serviceSubcategoryId || "",
          serviceSubcategoryName: formData.serviceSubcategoryName || before?.serviceSubcategoryName || "",
          serviceItems: formData.serviceItems || before?.serviceItems || [],
        };
        setOrders((prev) => {
          const next = { ...prev };
          if (previousKey && previousKey !== key) {
            delete next[previousKey];
          }
          next[key] = optimisticOrder;
          return next;
        });

        const transferFields = new Set(["master", "dateStr", "timeIdx", "durationSlots"]);
        const detailKeys = [
          ["status","Статус"],
          ["master","Мастер"],
          ["dateStr","Дата"],
          ["timeIdx","Время"],
          ["durationSlots","Длительность"],
          ["price","Стоимость"],
          ["address","Адрес"],
          ["comment","Комментарий"],
          ["workOrder","Заказ работ"],
        ];
        const transferChanged = before && (
          String(before.master ?? "") !== String(formData.master ?? "")
          || String(before.dateStr ?? "") !== String(formData.dateStr ?? "")
          || String(before.timeIdx ?? "") !== String(formData.timeIdx ?? "")
          || String(getOrderDurationSlots(before)) !== String(formData.durationSlots ?? "")
        );
        const changes = before ? detailKeys
          .filter(([field]) => String(before[field] ?? "") !== String(formData[field] ?? ""))
          .filter(([field]) => !(transferChanged && transferFields.has(field)))
          .map(([field,label]) => `${label}: ${formatHistoryValue(field, before[field], { durationSlots: getOrderDurationSlots(before) })} → ${formatHistoryValue(field, formData[field], { durationSlots: formData.durationSlots })}`)
          : [];
        if (transferChanged) {
          changes.unshift(buildTransferHistoryDetails({
            master: before.master,
            dateStr: before.dateStr,
            timeIdx: before.timeIdx,
            durationSlots: getOrderDurationSlots(before),
          }, {
            master: formData.master,
            dateStr: formData.dateStr,
            timeIdx: formData.timeIdx,
            durationSlots: formData.durationSlots,
          }));
        }
        pushHistory(key, makeHistoryEntry(currentUser?.name || "Пользователь", before ? (transferChanged ? "Перенёс заказ" : "Обновил заказ") : "Создал заказ", before ? (changes.length ? changes.join("\n") : "Без видимых изменений полей") : `Клиент: ${formData.name || "—"}\nАдрес: ${formData.address || "—"}`));

        if (!before && contactToOrderDraft) {
          await markContactBooked(contactToOrderDraft, result?.savedRow?.id || null);
          setContactToOrderDraft(null);
        }
        setRemoteError("");
        if (isSupabaseConfigured() && authSession?.access_token) {
          await releaseCurrentUserSlotLocksRemote({ currentUser, session: authSession });
        }
        releaseAllMyLocalSlotLocks();
        heldDraftLockRef.current = null;
        setDraftSlotSelection(null);
        setPopup(null);
        setShowNew(false);
        return;
      } catch (error) {
        setRemoteError(error.message);
        return;
      }
    }

    setOrders((prev)=>{
      const before = prev[key];
      const next = {...prev,[key]:formData};
      const transferFields = new Set(["master", "dateStr", "timeIdx", "durationSlots"]);
      const detailKeys = [
        ["status","Статус"],
        ["master","Мастер"],
        ["dateStr","Дата"],
        ["timeIdx","Время"],
        ["durationSlots","Длительность"],
        ["price","Стоимость"],
        ["address","Адрес"],
        ["comment","Комментарий"],
        ["workOrder","Заказ работ"],
      ];
      const transferChanged = before && (
        String(before.master ?? "") !== String(formData.master ?? "")
        || String(before.dateStr ?? "") !== String(formData.dateStr ?? "")
        || String(before.timeIdx ?? "") !== String(formData.timeIdx ?? "")
        || String(getOrderDurationSlots(before)) !== String(formData.durationSlots ?? "")
      );
      const changes = before ? detailKeys
        .filter(([field]) => String(before[field] ?? "") !== String(formData[field] ?? ""))
        .filter(([field]) => !(transferChanged && transferFields.has(field)))
        .map(([field,label]) => `${label}: ${formatHistoryValue(field, before[field], { durationSlots: getOrderDurationSlots(before) })} → ${formatHistoryValue(field, formData[field], { durationSlots: formData.durationSlots })}`)
        : [];
      if (transferChanged) {
        changes.unshift(buildTransferHistoryDetails({
          master: before.master,
          dateStr: before.dateStr,
          timeIdx: before.timeIdx,
          durationSlots: getOrderDurationSlots(before),
        }, {
          master: formData.master,
          dateStr: formData.dateStr,
          timeIdx: formData.timeIdx,
          durationSlots: formData.durationSlots,
        }));
      }
      pushHistory(key, makeHistoryEntry(currentUser?.name || "Локальный пользователь", before ? (transferChanged ? "Перенёс заказ" : "Обновил заказ") : "Создал заказ", before ? (changes.length ? changes.join("\n") : "Без видимых изменений полей") : `Клиент: ${formData.name || "—"}\nАдрес: ${formData.address || "—"}`));
      return next;
    });
    if (!popup?.data && contactToOrderDraft) {
      await markContactBooked(contactToOrderDraft, null);
      setContactToOrderDraft(null);
    }
    if (isSupabaseConfigured() && authSession?.access_token) {
      await releaseCurrentUserSlotLocksRemote({ currentUser, session: authSession });
    }
    releaseAllMyLocalSlotLocks();
    heldDraftLockRef.current = null;
    setDraftSlotSelection(null);
    setPopup(null);
    setShowNew(false);
  },[authSession, busySlots, cities, contactToOrderDraft, currentUser, dayOffs, employees, markContactBooked, orders, popup?.data, pushHistory, refreshFromSource, releaseAllMyLocalSlotLocks, sources]);
  const handleDelete=useCallback(async ()=>{
    if(!popup)return;
    if (!canDeleteOrders(currentUser)) {
      setRemoteError("Удаление заявок доступно только админу");
      return;
    }
    setRemoteError("");
    const archivedOrder = popup.data ? { ...popup.data, archivedAt: new Date().toISOString() } : null;
    if (isSupabaseConfigured() && authSession?.access_token && popup.data?._id) {
      const previousPopup = popup;
      const previousOrder = popup.data;
      const previousHistory = orderHistory[popup.key] || [];
      if (archivedOrder) {
        setDeletedOrders((prev) => ({ ...prev, [popup.key]: archivedOrder }));
      }
      setOrders((prev) => {
        const next = { ...prev };
        delete next[popup.key];
        return next;
      });
      setOrderHistory((prev) => {
        const next = { ...prev };
        delete next[popup.key];
        return next;
      });
      setPopup(null);
      try {
        await deleteOrder({ orderId: popup.data._id, session: authSession });
        return;
      } catch (error) {
        setOrders((prev) => ({ ...prev, [previousPopup.key]: previousOrder }));
        setOrderHistory((prev) => ({ ...prev, [previousPopup.key]: previousHistory }));
        setDeletedOrders((prev) => {
          const next = { ...prev };
          delete next[previousPopup.key];
          return next;
        });
        setPopup(previousPopup);
        setRemoteError(error.message);
        return;
      }
    }
    pushHistory(popup.key, makeHistoryEntry(currentUser?.name || "Локальный пользователь", "Удалил заказ", `${popup.data?.name || "Без имени"} · ${popup.data?.address || "Без адреса"}`));
    if (archivedOrder) {
      setDeletedOrders((prev) => ({ ...prev, [popup.key]: archivedOrder }));
    }
    setOrders(p=>{const n={...p};delete n[popup.key];return n;});
    setPopup(null);
  },[authSession, currentUser, orderHistory, popup, pushHistory, refreshFromSource]);
  const toggleOff=useCallback(async (c,m,d)=>{
    const k = dok(c,m,d);
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token) {
      const previousValue = Boolean(dayOffs[k]);
      setDayOffs((prev) => ({ ...prev, [k]: !previousValue }));
      try {
        await toggleDayOffRemote({ activeCity: c, masterName: m, dateStr: d, employees, session: authSession });
        return;
      } catch (error) {
        setDayOffs((prev) => ({ ...prev, [k]: previousValue }));
        setRemoteError(error.message);
        return;
      }
    }
    setDayOffs(p=>({...p,[k]:!p[k]}));
  },[authSession, dayOffs, employees]);

  const toggleBusy = useCallback(async (c, m, d, ti) => {
    const key = bok(c, m, d, ti);
    const previousValue = Boolean(busySlots[key]);
    setRemoteError("");
    setBusySlots((prev) => ({ ...prev, [key]: !previousValue }));
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await toggleBusySlotRemote({
          activeCity: c,
          masterName: m,
          dateStr: d,
          timeIdx: ti,
          employees,
          session: authSession,
        });
        return;
      } catch (error) {
        setBusySlots((prev) => ({ ...prev, [key]: previousValue }));
        setRemoteError(error.message);
        return;
      }
    }
  }, [authSession, busySlots, employees]);

  const handleTechnicianOrderUpdate = useCallback(async (orderKey, patch, options = {}) => {
    const existingOrder = orders[orderKey];
    if (!existingOrder) return;
    const nextOrder = { ...existingOrder, ...patch };
    const previousOrder = existingOrder;
    const previousHistory = orderHistory[orderKey] || [];
    if (options.historyEntry) pushHistory(orderKey, options.historyEntry);
    setRemoteError("");
    setOrders((prev) => ({ ...prev, [orderKey]: nextOrder }));
    try {
      if (isSupabaseConfigured() && authSession?.access_token && existingOrder._id) {
        await upsertOrder({
          formData: nextOrder,
          existingOrder,
          snapshot: { cities, employees, sources, currentUser, orders, dayOffs, busySlots },
          session: authSession,
        });
      }
    } catch (error) {
      setOrders((prev) => ({ ...prev, [orderKey]: previousOrder }));
      setOrderHistory((prev) => ({ ...prev, [orderKey]: previousHistory }));
      setRemoteError(error.message);
    }
  }, [authSession, busySlots, cities, currentUser, dayOffs, employees, orderHistory, orders, pushHistory, sources]);

  const handleTechnicianAcknowledge = useCallback(async (orderKey) => {
    const order = orders[orderKey];
    if (!order || !orderNeedsTechnicianConfirmation(order)) return;
    const nowIso = new Date().toISOString();
    await handleTechnicianOrderUpdate(orderKey, {
      status: "Подтвержден мастером",
      technicianConfirmedAt: nowIso,
      technicianConfirmedById: currentUser?.id || null,
      technicianConfirmedByName: currentUser?.name || "",
      returnedToOfficeAt: null,
      returnedToOfficeById: null,
      returnedToOfficeByName: "",
      returnToOfficeComment: "",
      officeAttentionRequired: false,
    }, {
      historyEntry: makeHistoryEntry(currentUser?.name || "Мастер", "Подтверждено мастером", `${currentUser?.name || "Мастер"} подтвердил, что увидел заявку`),
    });
  }, [currentUser?.id, currentUser?.name, handleTechnicianOrderUpdate, orders]);

  const handleTechnicianReturnToOffice = useCallback(async (orderKey, reason) => {
    const order = orders[orderKey];
    const trimmedReason = String(reason || "").trim();
    if (!order || !trimmedReason) return;
    const patch = buildReturnToOfficeOrderPatch({ order, reason: trimmedReason, currentUser });
    await handleTechnicianOrderUpdate(orderKey, patch, {
      historyEntry: makeHistoryEntry(currentUser?.name || "Мастер", "Возврат в офис", `Причина возврата: ${trimmedReason}`),
    });
  }, [currentUser, handleTechnicianOrderUpdate, orders]);

  const deleteCity = useCallback(async (cityName, mode = "with_employees") => {
    const remaining = Object.keys(cities).filter(c => c !== cityName);
    if (remaining.length === 0) return false;
    const cityTechnicianIds = employees.filter((m) => m.type === "technician" && m.city === cityName).map((m) => m.id);
    if (mode === "city_only" && cityTechnicianIds.length) {
      setRemoteError("Нельзя удалить город отдельно, пока в нём есть мастера. Выбери удаление города вместе с мастерами.");
      return false;
    }
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await deleteCityRemote({ name: cityName, mode, currentUserRole: currentUser?.role, session: authSession });
      } catch (error) {
        setRemoteError(error.message);
        return false;
      }
    }
    setCities(p => { const n = {...p}; delete n[cityName]; return n; });
    if (mode === "with_employees") {
      setEmployees(p => p.filter(m => m.type !== "technician" || m.city !== cityName));
    }
    setOrders(p => {
      const n = {};
      Object.entries(p).forEach(([k,v]) => {
        const removeOrder = mode === "with_employees"
          ? k.startsWith(cityName + "|")
          : v.city === cityName;
        if (!removeOrder) n[k] = v;
      });
      return n;
    });
    setDayOffs((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        const remove = mode === "with_employees"
          ? key.startsWith(`off|${cityName}|`)
          : false;
        if (!remove) next[key] = value;
      });
      return next;
    });
    setBusySlots((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        const remove = mode === "with_employees"
          ? key.startsWith(`busy|${cityName}|`)
          : false;
        if (!remove) next[key] = value;
      });
      return next;
    });
    setOrderHistory((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        const remove = mode === "with_employees"
          ? key.startsWith(`${cityName}|`)
          : false;
        if (!remove) next[key] = value;
      });
      return next;
    });
    if (activeCity === cityName) setActiveCity(remaining[0]);
    return true;
  }, [activeCity, authSession, cities, currentUser?.role, employees]);

  const handlePermissionsSave = useCallback(async (canViewCards) => {
    if (!permissionsEmployee) return;
    setPermissionsSaving(true);
    setRemoteError("");
    try {
      if (isSupabaseConfigured() && authSession?.access_token) {
        await updateEmployeePermissions({
          employeeId: permissionsEmployee.id,
          canViewTechnicianCards: canViewCards,
          currentUserRole: currentUser?.role,
          session: authSession,
        });
      }
      setEmployees((prev) => prev.map((employee) => employee.id === permissionsEmployee.id ? { ...employee, canViewTechnicianCards: canViewCards } : employee));
      if (currentUser?.id === permissionsEmployee.id) {
        setCurrentUser((prev) => prev ? { ...prev, canViewTechnicianCards: canViewCards } : prev);
      }
      setPermissionsEmployee(null);
    } catch (error) {
      setRemoteError(error.message);
    } finally {
      setPermissionsSaving(false);
    }
  }, [authSession, currentUser, permissionsEmployee]);

  const handleEmployeeCardSave = useCallback(async (employeeForm) => {
    setEmployeeSavePending(true);
    setRemoteError("");
    try {
      if (isSupabaseConfigured() && authSession?.access_token) {
        const savedEmployee = await upsertEmployee({
          employee: employeeForm,
          currentUserRole: currentUser?.role,
          session: authSession,
        });
        setEmployees((prev) => prev.map((employee) => employee.id === employeeForm.id ? { ...employee, ...employeeForm } : employee));
        if (currentUser?.id && employeeForm.id === currentUser.id) {
          setCurrentUser((prev) => prev ? { ...prev, name: employeeForm.name, city: employeeForm.city || prev.city } : prev);
        }
        await refreshFromSource(authSession, { preserveUiState: true });
        const savedId = savedEmployee?.id || employeeForm.id;
        setEmployees((prev) => prev.map((employee) => (
          employee.id === savedId || (employee.name === employeeForm.name && employee.type === employeeForm.type && employee.city === employeeForm.city)
            ? { ...employee, workSchedule: normalizeWorkSchedule(employeeForm.workSchedule), workScheduleEffectiveFrom: employeeForm.workScheduleEffectiveFrom || employee.workScheduleEffectiveFrom || dstr(new Date()), residenceAddress: employeeForm.residenceAddress, residenceLat: employeeForm.residenceLat, residenceLng: employeeForm.residenceLng, serviceScopes: employeeForm.serviceScopes || employee.serviceScopes }
            : employee
        )));
      } else if (employeeForm.id) {
        setEmployees((prev) => prev.map((employee) => employee.id === employeeForm.id ? { ...employee, ...employeeForm } : employee));
      } else {
        setEmployees((prev) => [...prev, employeeForm]);
      }
      setEmployeeCard(null);
      setShowAddEmployee(false);
      setEmployeeCardReturnToList(false);
    } catch (error) {
      setRemoteError(error.message);
    } finally {
      setEmployeeSavePending(false);
    }
  }, [authSession, currentUser?.role, refreshFromSource]);

  const handleDeleteEmployee = useCallback(async (employee) => {
    if (!employee) return;
    if (isSupabaseConfigured() && authSession?.access_token && employee.id) {
      try {
        await deleteEmployee({ employeeId: employee.id, currentUserRole: currentUser?.role, session: authSession });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    setEmployees((prev) => prev.filter((item) => empKey(item) !== empKey(employee)));
  }, [authSession, currentUser?.role, refreshFromSource]);

  const handleServiceEditorSave = useCallback(async (draft) => {
    setServiceSaving(true);
    setRemoteError("");
    const optimisticId = draft.id || `local-service-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticNode = { ...draft, id: optimisticId };
    const previousServices = services;
    setServices((prev) => {
      const exists = prev.some((node) => node.id === optimisticId);
      return exists
        ? prev.map((node) => node.id === optimisticId ? optimisticNode : node)
        : [...prev, optimisticNode];
    });
    try {
      if (isSupabaseConfigured() && authSession?.access_token) {
        const saved = await upsertServiceNode({
          node: draft,
          currentUserRole: currentUser?.role,
          session: authSession,
        });
        if (saved?.id) {
          setServices((prev) => {
            const nextNode = {
              id: saved.id,
              parentId: saved.parent_id || draft.parentId || null,
              type: saved.node_type || draft.type,
              name: saved.name,
              price: saved.price === null || saved.price === undefined ? "" : String(saved.price),
              finalPrice: saved.final_price === null || saved.final_price === undefined ? "" : String(saved.final_price),
              sortOrder: saved.sort_order || 0,
            };
            const withoutOld = prev.filter((node) => node.id !== optimisticId);
            const exists = withoutOld.some((node) => node.id === saved.id);
            return exists
              ? withoutOld.map((node) => node.id === saved.id ? nextNode : node)
              : [...withoutOld, nextNode];
          });
        }
        await refreshFromSource(authSession, { preserveUiState: true });
      }
      setRemoteError("");
      setServiceEditor(null);
    } catch (error) {
      setServices(previousServices);
      setRemoteError(error.message);
    } finally {
      setServiceSaving(false);
    }
  }, [authSession, currentUser?.role, refreshFromSource, services]);

  const handleDeleteServiceNode = useCallback(async (node) => {
    if (!node) return;
    const idsToDelete = new Set();
    const collect = (id) => {
      idsToDelete.add(id);
      services.filter((item) => item.parentId === id).forEach((child) => collect(child.id));
    };
    collect(node.id);
    const previousServices = services;
    setServices((prev) => prev.filter((item) => !idsToDelete.has(item.id)));
    setRemoteError("");
    try {
      if (isSupabaseConfigured() && authSession?.access_token && !String(node.id).startsWith("local-service-")) {
        await deleteServiceNode({
          nodeId: node.id,
          currentUserRole: currentUser?.role,
          session: authSession,
        });
        await refreshFromSource(authSession, { preserveUiState: true });
      }
      setRemoteError("");
    } catch (error) {
      setServices(previousServices);
      setRemoteError(error.message);
    }
  }, [authSession, currentUser?.role, refreshFromSource, services]);

  const handleCreateSource = useCallback(async (name) => {
    if (!name.trim()) return;
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await createSource({ name: name.trim(), currentUserRole: currentUser?.role, session: authSession });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    setSources((prev) => prev.includes(name.trim()) ? prev : [...prev, name.trim()].sort((a, b) => a.localeCompare(b, "ru")));
  }, [authSession, currentUser?.role, refreshFromSource]);

  const handleUpdateSource = useCallback(async (previousName, nextName) => {
    if (!previousName || !nextName.trim()) return;
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await updateSource({ previousName, nextName: nextName.trim(), currentUserRole: currentUser?.role, session: authSession });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    setSources((prev) => prev.map((source) => source === previousName ? nextName.trim() : source).sort((a, b) => a.localeCompare(b, "ru")));
  }, [authSession, currentUser?.role, refreshFromSource]);

  const handleDeleteSource = useCallback(async (name) => {
    if (!name) return;
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await deleteSource({ name, currentUserRole: currentUser?.role, session: authSession });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    setSources((prev) => prev.filter((source) => source !== name));
  }, [authSession, currentUser?.role, refreshFromSource]);

  const handleCreateStatus = useCallback(async (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await createStatus({
          name: trimmed,
          shortLabel: makeStatusShortLabel(trimmed),
          tone: STATUS_TONE_KEYS[statuses.length % STATUS_TONE_KEYS.length] || "teal",
          sortOrder: statuses.length,
          currentUserRole: currentUser?.role,
          session: authSession,
        });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    if (statuses.some((status) => status.name === trimmed)) return;
    setStatuses((prev) => [...prev, {
      name: trimmed,
      shortLabel: makeStatusShortLabel(trimmed),
      tone: STATUS_TONE_KEYS[prev.length % STATUS_TONE_KEYS.length] || "teal",
      sortOrder: prev.length,
    }]);
  }, [authSession, currentUser?.role, refreshFromSource, statuses]);

  const handleDeleteStatus = useCallback(async (name) => {
    if (!name) return;
    if (orders && Object.values(orders).some((order) => order.status === name)) {
      setRemoteError("Этот статус уже используется в заказах. Сначала переведи такие заявки в другой статус.");
      return;
    }
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await deleteStatus({ name, currentUserRole: currentUser?.role, session: authSession });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    setStatuses((prev) => prev.filter((status) => status.name !== name));
  }, [authSession, currentUser?.role, orders, refreshFromSource]);

  const handleSaveContact = useCallback(async (contactForm) => {
    setRemoteError("");
    const payload = {
      ...contactForm,
      phone: normalizePhoneDigits(contactForm.phone),
      callbackDate: contactForm.status === "Перезвонить" ? contactForm.callbackDate : "",
      reason: contactForm.reason || "",
      createdAt: contactForm.createdAt || new Date().toISOString(),
      createdByName: contactForm.createdByName || currentUser?.name || "",
      assignedToId: contactForm.assignedToId || currentUser?.id || null,
      assignedToName: employees.find((employee) => employee.id === (contactForm.assignedToId || currentUser?.id))?.name || contactForm.assignedToName || currentUser?.name || "",
      updatedAt: new Date().toISOString(),
    };
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await upsertContact({
          contact: payload,
          cities,
          currentUser,
          contactStatuses,
          contactReasons,
          session: authSession,
        });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
        throw error;
      }
      return;
    }
    setContacts((prev) => {
      if (payload.id) {
        return prev.map((contact) => contact.id === payload.id ? { ...contact, ...payload } : contact);
      }
      return [{ ...payload, id: `local-contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }, ...prev];
    });
  }, [authSession, cities, contactReasons, contactStatuses, currentUser, employees, refreshFromSource]);

  async function markContactBooked(contactForm, convertedOrderId = null) {
    if (!contactForm) return;
    const nextContact = {
      ...contactForm,
      status: "Записан",
      reason: "",
      callbackDate: "",
      convertedOrderId: convertedOrderId || contactForm.convertedOrderId || null,
    };
    try {
      await handleSaveContact(nextContact);
    } catch {
      return;
    }
  }

  const handleCreateContactStatus = useCallback(async (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await createContactStatus({
          name: trimmed,
          tone: ["blue","yellow","orange","red","green"][contactStatuses.length % 5] || "blue",
          sortOrder: contactStatuses.length,
          currentUserRole: currentUser?.role,
          session: authSession,
        });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    setContactStatuses((prev) => prev.some((status) => status.name === trimmed) ? prev : [...prev, { name: trimmed, tone: "blue", sortOrder: prev.length, systemKey: null, isDefault: false }]);
  }, [authSession, contactStatuses.length, currentUser?.role, refreshFromSource]);

  const handleDeleteContactStatus = useCallback(async (name) => {
    if (!name) return;
    if (contacts.some((contact) => contact.status === name)) {
      setRemoteError("Этот статус контакта уже используется. Сначала переведи контакты в другой статус.");
      return;
    }
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token) {
      try {
        await deleteContactStatus({ name, currentUserRole: currentUser?.role, session: authSession });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    setContactStatuses((prev) => prev.filter((status) => status.name !== name));
    setContactReasons((prev) => prev.filter((reason) => reason.statusName !== name));
  }, [authSession, contacts, currentUser?.role, refreshFromSource]);

  const handleCreateContactReason = useCallback(async ({ name, statusName }) => {
    const trimmed = String(name || "").trim();
    if (!trimmed || !statusName) return;
    setRemoteError("");
    const statusItem = contactStatuses.find((status) => status.name === statusName);
    if (isSupabaseConfigured() && authSession?.access_token && statusItem?.id) {
      try {
        const nextSort = contactReasons.filter((reason) => reason.statusName === statusName).length;
        await createContactReason({
          name: trimmed,
          contactStatusId: statusItem.id,
          sortOrder: nextSort,
          currentUserRole: currentUser?.role,
          session: authSession,
        });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    setContactReasons((prev) => prev.some((reason) => reason.name === trimmed && reason.statusName === statusName) ? prev : [...prev, { id: `local-reason-${Date.now()}`, name: trimmed, statusName, sortOrder: prev.filter((reason) => reason.statusName === statusName).length }]);
  }, [authSession, contactReasons, contactStatuses, currentUser?.role, refreshFromSource]);

  const handleDeleteContactReason = useCallback(async (reason) => {
    if (!reason) return;
    if (contacts.some((contact) => contact.reason === reason.name && contact.status === reason.statusName)) {
      setRemoteError("Эта причина уже используется в контактах. Сначала убери её из карточек.");
      return;
    }
    setRemoteError("");
    if (isSupabaseConfigured() && authSession?.access_token && reason.id && !String(reason.id).startsWith("local-")) {
      try {
        await deleteContactReason({ reasonId: reason.id, currentUserRole: currentUser?.role, session: authSession });
        await refreshFromSource(authSession, { preserveUiState: true });
      } catch (error) {
        setRemoteError(error.message);
      }
      return;
    }
    setContactReasons((prev) => prev.filter((item) => item.id !== reason.id));
  }, [authSession, contacts, currentUser?.role, refreshFromSource]);

  const handleAccessSave = useCallback(async ({ email, password }) => {
    if (!accessEmployee) return;
    setAccessSaving(true);
    setRemoteError("");
    try {
      if (isSupabaseConfigured() && authSession?.access_token) {
        const created = await provisionEmployeeAccess({
          employeeId: accessEmployee.id,
          email,
          password,
          currentUserRole: currentUser?.role,
          session: authSession,
        });
        if (created?.authUserId) {
          setEmployees((prev) => prev.map((employee) => employee.id === accessEmployee.id ? { ...employee, authUserId: created.authUserId, authEmail: created.email || email } : employee));
          if (employeeCard?.id === accessEmployee.id) {
            setEmployeeCard((prev) => prev ? { ...prev, authUserId: created.authUserId, authEmail: created.email || email } : prev);
          }
        }
      }
      setAccessEmployee(null);
    } catch (error) {
      setRemoteError(error.message);
    } finally {
      setAccessSaving(false);
    }
  }, [accessEmployee, authSession, currentUser?.role, employeeCard]);

  const handleAccessEditSave = useCallback(async ({ email, password }) => {
    if (!editAccessEmployee) return;
    setEditAccessSaving(true);
    setRemoteError("");
    try {
      if (isSupabaseConfigured() && authSession?.access_token) {
        const updated = await updateEmployeeAccess({
          employeeId: editAccessEmployee.id,
          email: email.trim() || undefined,
          password: password.trim() || undefined,
          currentUserRole: currentUser?.role,
          session: authSession,
        });
        if (updated?.email) {
          setEmployees((prev) => prev.map((employee) => employee.id === editAccessEmployee.id ? { ...employee, authEmail: updated.email } : employee));
          if (employeeCard?.id === editAccessEmployee.id) {
            setEmployeeCard((prev) => prev ? { ...prev, authEmail: updated.email } : prev);
          }
        }
      }
      setEditAccessEmployee(null);
    } catch (error) {
      setRemoteError(error.message);
    } finally {
      setEditAccessSaving(false);
    }
  }, [authSession, currentUser?.role, editAccessEmployee]);

  useEffect(() => {
    let cancelled = false;
    if (isSupabaseConfigured() && !authSession?.access_token) {
      setIsHydrated(true);
      return () => { cancelled = true; };
    }
    loadCrmState(defaultSnapshot, authSession)
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        setCities(snapshot.cities);
        setEmployees(snapshot.employees);
        setOrders(snapshot.orders);
        setOrderHistory(snapshot.orderHistory);
        setDayOffs(snapshot.dayOffs);
        setBusySlots(snapshot.busySlots || {});
        setSlotLocks(pruneExpiredSlotLocks(snapshot.slotLocks || {}));
        setDeletedOrders(snapshot.deletedOrders || {});
        setActiveCity(snapshot.activeCity);
        setMonth(snapshot.month);
        setYear(snapshot.year ?? 2026);
        setShowSummary(snapshot.showSummary);
        setShowServiceCatalog(Boolean(snapshot.showServiceCatalog));
        setShowDataView(Boolean(snapshot.showDataView));
        setShowContactsView(Boolean(snapshot.showContactsView));
        setShowOrdersExplorerView(Boolean(snapshot.showOrdersExplorerView));
        setVisibleStatusNames(Array.isArray(snapshot.visibleStatusNames) && snapshot.visibleStatusNames.length ? snapshot.visibleStatusNames : (snapshot.statuses || INIT_STATUSES).map((status)=>status.name));
        setSources(snapshot.sources);
        setServices(snapshot.services || INIT_SERVICES);
        setStatuses(snapshot.statuses || INIT_STATUSES);
        setContacts(snapshot.contacts || INIT_CONTACTS);
        setContactStatuses(snapshot.contactStatuses || INIT_CONTACT_STATUSES);
        setContactReasons(snapshot.contactReasons || INIT_CONTACT_REASONS);
        setCurrentUser(snapshot.currentUser);
        setIsHydrated(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("CRM bootstrap failed:", error);
        setRemoteError(error.message || "Ошибка загрузки CRM");
        setIsHydrated(true);
      });
    return () => { cancelled = true; };
  }, [authSession, defaultSnapshot]);

  useEffect(() => {
    if (!isHydrated) return;
    saveCrmState({
      cities,
      employees,
      orders,
      orderHistory,
      dayOffs,
      busySlots,
      slotLocks: pruneExpiredSlotLocks(slotLocks),
      activeCity,
      month,
      year,
      showSummary,
      showServiceCatalog,
      showDataView,
      showContactsView,
      showOrdersExplorerView,
      visibleStatusNames,
      sources,
      services,
      statuses,
      contacts,
      contactStatuses,
      contactReasons,
      deletedOrders,
      currentUser,
    }, authSession);
  }, [activeCity, authSession, busySlots, cities, contactReasons, contactStatuses, contacts, currentUser, dayOffs, deletedOrders, employees, isHydrated, month, year, orderHistory, orders, showContactsView, showDataView, showOrdersExplorerView, showServiceCatalog, showSummary, slotLocks, sources, services, statuses, visibleStatusNames]);

  const handleLogin = useCallback(async ({ email, password }) => {
    setAuthPending(true);
    setAuthError("");
    try {
      const session = await signInWithPassword({ email, password });
      setAuthSession(session);
      storeSession(session);
      setIsHydrated(false);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthPending(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (isSupabaseConfigured() && authSession?.access_token) {
      await releaseCurrentUserSlotLocksRemote({ currentUser, session: authSession });
    }
    releaseAllMyLocalSlotLocks();
    heldDraftLockRef.current = null;
    setDraftSlotSelection(null);
    await signOut();
    setAuthSession(null);
    setCurrentUser(null);
    setIsHydrated(true);
  }, [authSession, currentUser, releaseAllMyLocalSlotLocks]);

  const openOrdersView = useCallback(() => {
    setShowSummary(false);
    setShowServiceCatalog(false);
    setShowDataView(false);
    setShowContactsView(false);
    setShowOrdersExplorerView(false);
    setShowEmployeeList(false);
    setShowAdminMenu(false);
  }, []);

  const openEmployeesView = useCallback(() => {
    setShowSummary(false);
    setShowServiceCatalog(false);
    setShowDataView(false);
    setShowContactsView(false);
    setShowOrdersExplorerView(false);
    setShowEmployeeList(true);
    setShowAdminMenu(false);
  }, []);

  const openSummaryView = useCallback(() => {
    setShowSummary(true);
    setShowServiceCatalog(false);
    setShowDataView(false);
    setShowContactsView(false);
    setShowOrdersExplorerView(false);
    setShowEmployeeList(false);
    setShowAdminMenu(false);
  }, []);

  const openServiceCatalogView = useCallback(() => {
    setRemoteError("");
    setShowServiceCatalog(true);
    setShowSummary(false);
    setShowDataView(false);
    setShowContactsView(false);
    setShowOrdersExplorerView(false);
    setShowEmployeeList(false);
    setShowAdminMenu(false);
  }, []);

  const openDataView = useCallback(() => {
    setRemoteError("");
    setShowDataView(true);
    setShowServiceCatalog(false);
    setShowSummary(false);
    setShowContactsView(false);
    setShowOrdersExplorerView(false);
    setShowEmployeeList(false);
    setShowAdminMenu(false);
  }, []);

  const openContactsView = useCallback(() => {
    setRemoteError("");
    setShowContactsView(true);
    setShowDataView(false);
    setShowServiceCatalog(false);
    setShowSummary(false);
    setShowOrdersExplorerView(false);
    setShowEmployeeList(false);
    setShowAdminMenu(false);
  }, []);

  const openOrdersExplorerView = useCallback(() => {
    setRemoteError("");
    setShowOrdersExplorerView(true);
    setShowContactsView(false);
    setShowDataView(false);
    setShowServiceCatalog(false);
    setShowSummary(false);
    setShowEmployeeList(false);
    setShowAdminMenu(false);
  }, []);

  const showInactiveAdminItem = useCallback((label) => {
    setRemoteError(`${label} пока неактивна`);
    setShowAdminMenu(false);
  }, []);

  const handleCreateOrderFromContact = useCallback((contact) => {
    if (!contact) return;
    setContactToOrderDraft(contact);
    setShowNew(true);
    // Keep showContactsView=true so ContactsView stays mounted underneath,
    // preserving its selectedId, draft, and filter state for when user returns.
  }, []);

  const handleDeleteContact = useCallback(async (contact) => {
    if (!contact?.id) return false;
    try {
      if (isSupabaseConfigured() && authSession?.access_token) {
        await deleteContact({ contactId: contact.id, session: authSession });
      }
      setContacts((prev) => (prev || []).filter((item) => item.id !== contact.id));
      setRemoteError("");
      return true;
    } catch (error) {
      setRemoteError(error.message || "Не удалось удалить контакт");
      return false;
    }
  }, [authSession]);

  const handleOpenOrderFromList = useCallback((orderKey, orderData) => {
    if (!orderKey || !orderData) return;
    const [city = "", master = "", dateStr = "", timeIdx = "0"] = orderKey.split("|");
    setPopup({
      key: orderKey,
      data: orderData,
      fixedSlot: {
        city,
        master,
        dateStr,
        timeIdx: parseInt(timeIdx, 10),
        durationSlots: getOrderDurationSlots(orderData),
      },
    });
  }, []);
  const confirmPastOrderDraft = useCallback(() => {
    if (!pastOrderDraft) return;
    setPopup(pastOrderDraft);
    setPastOrderDraft(null);
  }, [pastOrderDraft]);

  useEffect(() => {
    const cityNames = Object.keys(visibleCities);
    if (!cityNames.length) return;
    if (!visibleCities[activeCity]) {
      setActiveCity(cityNames[0]);
    }
  }, [activeCity, visibleCities]);

  useEffect(() => {
    if (!canSeeSummary(currentUser) && showSummary) {
      setShowSummary(false);
    }
  }, [currentUser, showSummary]);

  useEffect(() => {
    if (currentUser?.role !== "admin" && showServiceCatalog) {
      setShowServiceCatalog(false);
    }
  }, [currentUser, showServiceCatalog]);

  useEffect(() => {
    if (currentUser?.role !== "admin" && showDataView) {
      setShowDataView(false);
    }
  }, [currentUser, showDataView]);

  useEffect(() => {
    if (!(currentUser?.role === "admin" || currentUser?.role === "call_center") && showContactsView) {
      setShowContactsView(false);
    }
  }, [currentUser, showContactsView]);

  useEffect(() => {
    if (!(currentUser?.role === "admin" || currentUser?.role === "call_center") && showOrdersExplorerView) {
      setShowOrdersExplorerView(false);
    }
  }, [currentUser, showOrdersExplorerView]);

  useEffect(() => {
    if (showEmployeeList || showDataView || showSummary || showServiceCatalog || showContactsView || showOrdersExplorerView) return;
    if (!scheduleScrollRef.current || !todayRowRef.current) return;
    const frameId = window.requestAnimationFrame(() => {
      if (!scheduleScrollRef.current || !todayRowRef.current) return;
      const container = scheduleScrollRef.current;
      const row = todayRowRef.current;
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const relativeTop = rowRect.top - containerRect.top + container.scrollTop;
      const nextTop = Math.max(0, relativeTop - (container.clientHeight / 2) + (rowRect.height / 2));
      container.scrollTop = nextTop;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeCity, cityMasters.length, month, showContactsView, showDataView, showEmployeeList, showOrdersExplorerView, showServiceCatalog, showSummary]);

  useEffect(() => {
    if (currentUser?.role !== "admin" && showAdminMenu) {
      setShowAdminMenu(false);
    }
  }, [currentUser, showAdminMenu]);

  useEffect(() => {
    if (!authSession?.access_token || !currentUser?.id) return;
    let timerId = null;
    let cancelled = false;
    const beat = async () => {
      try {
        const touched = await touchPresence({ session: authSession });
        if (cancelled || !touched) return;
        setEmployees((prev) => prev.map((employee) => employee.id === currentUser.id ? { ...employee, lastSeen: touched } : employee));
        setCurrentUser((prev) => prev ? { ...prev, lastSeen: touched } : prev);
      } catch (error) {
        console.error("Presence heartbeat failed:", error);
      }
    };
    beat();
    timerId = window.setInterval(beat, 60000);
    return () => {
      cancelled = true;
      if (timerId) window.clearInterval(timerId);
    };
  }, [authSession, currentUser?.id]);

  useEffect(() => {
    if (!authSession?.access_token) return;
    let timerId = null;
    let cancelled = false;
    const refreshPresence = async () => {
      try {
        const rows = await loadEmployeePresence({ session: authSession });
        if (cancelled || !rows?.length) return;
        const presenceMap = rows.reduce((acc, row) => {
          acc[row.id] = {
            authUserId: row.auth_user_id || null,
            authEmail: row.auth_email || "",
            lastSeen: row.last_seen || null,
          };
          return acc;
        }, {});
        setEmployees((prev) => prev.map((employee) => (
          presenceMap[employee.id] ? { ...employee, ...presenceMap[employee.id] } : employee
        )));
        if (currentUser?.id && presenceMap[currentUser.id]) {
          setCurrentUser((prev) => prev ? { ...prev, lastSeen: presenceMap[currentUser.id].lastSeen } : prev);
        }
      } catch (error) {
        console.error("Presence refresh failed:", error);
      }
    };
    refreshPresence();
    timerId = window.setInterval(refreshPresence, 60000);
    return () => {
      cancelled = true;
      if (timerId) window.clearInterval(timerId);
    };
  }, [authSession, currentUser?.id]);

  const syncSliceRef = useRef({});
  useEffect(() => {
    if (!authSession?.access_token || !isHydrated) return;
    let cancelled = false;
    let timerId = null;
    const applyIfChanged = (key, next, setter) => {
      let serialized;
      try { serialized = JSON.stringify(next); } catch { serialized = null; }
      if (serialized != null && syncSliceRef.current[key] === serialized) return;
      syncSliceRef.current[key] = serialized;
      setter(next);
    };
    const syncState = async () => {
      if (
        popup ||
        showNew ||
        showAddEmployee ||
        showAddCity ||
        accessEmployee ||
        editAccessEmployee ||
        permissionsEmployee ||
        serviceEditor
      ) {
        return;
      }
      try {
        const snapshot = await loadCrmState(defaultSnapshot, authSession);
        if (cancelled || !snapshot) return;
        applyIfChanged("cities", snapshot.cities, setCities);
        applyIfChanged("employees", snapshot.employees, setEmployees);
        applyIfChanged("orders", snapshot.orders, setOrders);
        applyIfChanged("orderHistory", snapshot.orderHistory, setOrderHistory);
        applyIfChanged("dayOffs", snapshot.dayOffs, setDayOffs);
        applyIfChanged("busySlots", snapshot.busySlots || {}, setBusySlots);
        applyIfChanged("slotLocks", pruneExpiredSlotLocks(snapshot.slotLocks || {}), setSlotLocks);
        applyIfChanged("sources", snapshot.sources, setSources);
        applyIfChanged("services", snapshot.services || INIT_SERVICES, setServices);
        applyIfChanged("statuses", snapshot.statuses || INIT_STATUSES, setStatuses);
        setCurrentUser((prev) => {
          if (!prev) return snapshot.currentUser;
          if (!snapshot.currentUser) return prev;
          const merged = { ...prev, ...snapshot.currentUser };
          try {
            if (JSON.stringify(merged) === JSON.stringify(prev)) return prev;
          } catch {}
          return merged;
        });
      } catch (error) {
        if (!cancelled) console.error("Background CRM sync failed:", error);
      }
    };

    syncState();
    timerId = window.setInterval(syncState, 8000);
    const onFocus = () => { syncState(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncState();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timerId) window.clearInterval(timerId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    accessEmployee,
    authSession,
    defaultSnapshot,
    editAccessEmployee,
    isHydrated,
    permissionsEmployee,
    popup,
    serviceEditor,
    showAddCity,
    showAddEmployee,
    showNew,
  ]);

  if (isSupabaseConfigured() && !authSession?.access_token) {
    return <LoginGate onLogin={handleLogin} pending={authPending} error={authError} />;
  }

  if (!isHydrated) {
    return (
      <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#0a0a1a",minHeight:"100vh",color:"#e6f1ff",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{padding:"18px 22px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#64ffda",fontWeight:700}}>Загружаю CRM...</div>
          {remoteError && <div style={{maxWidth:460,padding:"10px 12px",borderRadius:10,background:"rgba(255,82,82,0.12)",border:"1px solid rgba(255,82,82,0.2)",color:"#ff8a80",fontSize:11,textAlign:"center"}}>{remoteError}</div>}
        </div>
      </div>
    );
  }

  if (currentUser?.role === "technician") {
    const technician = employees.find((employee) => employee.id === currentUser.id) || INIT_EMPLOYEES.find((employee) => employee.name === currentUser.name && employee.type === "technician");
    if (technician) {
      return (
        <TechnicianDashboard
          technician={technician}
          orders={orders}
          dayOffs={dayOffs}
          busySlots={busySlots}
          services={services}
          statuses={statuses}
          onToggleBusySlot={toggleBusy}
          onStatusChange={(orderKey, status) => handleTechnicianOrderUpdate(orderKey, { status })}
          onAcknowledgeOrder={handleTechnicianAcknowledge}
          onReturnToOffice={handleTechnicianReturnToOffice}
          onCompleteOrder={(orderKey, payload) => handleTechnicianOrderUpdate(orderKey, { status: "Выполнен", workDone: payload.workDone, finalPrice: payload.finalPrice, comment: payload.comment, serviceItems: payload.serviceItems })}
          onLogout={handleLogout}
        />
      );
    }
  }

  const cloudLabel = remoteError ? "Ошибка связи" : (isSupabaseConfigured() && authSession?.access_token ? "Подключено" : "Локально");
  const cloudColor = remoteError ? "#ff8a80" : "#f4f7ff";
  const cloudBorder = remoteError ? "1px solid rgba(255,82,82,0.34)" : PANEL_BR;
  const cloudBg = remoteError ? "rgba(255,82,82,0.12)" : "rgba(255,255,255,0.045)";
  const isAdminOrCallCenter = currentUser?.role === "admin" || currentUser?.role === "call_center";
  const isAnySubViewOpen = showEmployeeList || showOrdersExplorerView || showContactsView || showDataView || showServiceCatalog || showSummary;
  const showMobileDashboard = isMobile && isAdminOrCallCenter && !isAnySubViewOpen;

  if (showMobileDashboard) {
    return (
      <>
        <MobileDashboard
          cities={cities}
          visibleCities={visibleCities}
          activeCity={activeCity}
          setActiveCity={setActiveCity}
          orders={orders}
          employees={employees}
          statuses={statuses}
          services={services}
          sources={sources}
          currentUser={currentUser}
          todayStatusCards={todayStatusCards}
          visibleStatusNames={visibleStatusNames}
          setVisibleStatusNames={setVisibleStatusNames}
          onOpenOrder={handleOpenOrderFromList}
          onOpenNew={() => setShowNew(true)}
          onOpenServiceCatalog={openServiceCatalogView}
          onOpenOrdersExplorer={openOrdersExplorerView}
          onOpenEmployees={openEmployeesView}
          onOpenContacts={openContactsView}
          onOpenSummary={openSummaryView}
          onOpenData={openDataView}
          onLogout={handleLogout}
          cloudLabel={cloudLabel}
          cloudColor={cloudColor}
          cloudBg={cloudBg}
          cloudBorder={cloudBorder}
          remoteError={remoteError}
        />
        {popup&&<OrderForm key={`popup-${popup.key}-${popup.data?._id || "new"}`} data={popup.data} isNew={!popup.data} fixedSlot={popup.fixedSlot} onSave={handleSave} onClose={closeOrderDraftAndReleaseLocks} onDelete={handleDelete} sources={sources} onAddSource={s=>setSources(p=>[...p,s])} cities={cities} employees={employees} orders={orders} dayOffs={dayOffs} busySlots={busySlots} slotLocks={activeSlotLocks} historyEntries={orderHistory[popup.key] || []} currentUser={currentUser} readOnly={!canEditOrders(currentUser)} allowDelete={canDeleteOrders(currentUser)} orderNumber={popup.data?.orderNumber} services={services} statuses={statuses} onDraftSlotChange={setDraftSlotSelection} />}
        {pastOrderDraft && <PastDateOrderConfirmPopup today={today} targetDate={pastOrderDraft.fixedSlot?.dateStr || ""} onConfirm={confirmPastOrderDraft} onClose={()=>setPastOrderDraft(null)} />}
        {showNew&&<OrderForm key="show-new-order" initialData={contactToOrderDraft ? { phone: contactToOrderDraft.phone, name: contactToOrderDraft.name || "", city: contactToOrderDraft.city, source: "Контакты" } : null} isNew fixedSlot={null} onSave={handleSave} onClose={closeOrderDraftAndReleaseLocks} onDelete={null} sources={sources} onAddSource={s=>setSources(p=>[...p,s])} cities={cities} employees={employees} orders={orders} dayOffs={dayOffs} busySlots={busySlots} slotLocks={activeSlotLocks} historyEntries={[]} currentUser={currentUser} readOnly={!canEditOrders(currentUser)} allowDelete={false} services={services} statuses={statuses} onDraftSlotChange={setDraftSlotSelection} />}
      </>
    );
  }

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:`radial-gradient(circle at top left, #1a264a 0%, ${APP_BG} 26%, #0c0f20 100%)`,minHeight:"100vh",color:"#e6f1ff"}}>
      <style>{`@keyframes popIn{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}@keyframes modalIn{from{opacity:0;transform:translate(-50%,-50%) scale(0.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes mapGlow{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.25);opacity:0.6}}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:3px}.cs{transition:all 0.12s;cursor:pointer}.cs:hover{transform:translateY(-1px);box-shadow:0 10px 28px rgba(84,227,220,0.09)!important}.tb{transition:all 0.15s;cursor:pointer;border:none;font-family:inherit}.tb:hover{transform:translateY(-1px)}.panel{background:linear-gradient(180deg, ${PANEL_BG_ALT}, ${PANEL_BG});border:${PANEL_BR};box-shadow:${GLOW}}.pill{background:rgba(255,255,255,0.045);border:${PANEL_BR};box-shadow:inset 0 1px 0 rgba(255,255,255,0.04)}.emptyCell{background:rgba(12,15,33,0.78)!important;border:1px dashed rgba(111,123,166,0.18)!important}.sticky-head{position:-webkit-sticky;position:sticky;top:0}.sticky-col{position:-webkit-sticky;position:sticky}.sticky-divider{border-right:1px solid rgba(255,255,255,0.05)}input.no-autofill-icon::-webkit-contacts-auto-fill-button,input.no-autofill-icon::-webkit-credentials-auto-fill-button{visibility:hidden;display:none!important;pointer-events:none;position:absolute;right:0}`}</style>

      {isMobile && isAnySubViewOpen && (
        <div style={{position:"sticky",top:0,zIndex:60,padding:"10px 14px",background:"linear-gradient(135deg,#0f2142,#1a1a2e,#14386a)",borderBottom:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={openOrdersView} style={{width:42,height:42,borderRadius:12,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",color:"#dbe4ff",fontSize:18,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,color:"#8ea2cf",lineHeight:1}}>Назад к дашборду</div>
            <div style={{fontSize:15,fontWeight:800,color:"#56efe5",lineHeight:1.2,marginTop:2}}>{showEmployeeList?"👷 Сотрудники":showOrdersExplorerView?"📦 Заказы":showContactsView?"☎ Контакты":showDataView?"🛠 Данные":showServiceCatalog?"🗂 Услуги":showSummary?"📊 Сводка":""}</div>
          </div>
        </div>
      )}
      <div style={{display:isMobile?"none":"block",background:"linear-gradient(135deg,#0f2142,#1a1a2e,#14386a)",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{padding:"18px 24px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:30,lineHeight:1,color:"#56efe5"}}>❄</div>
            <h1 style={{margin:0,fontSize:18,fontWeight:800,letterSpacing:0.6,color:"#56efe5"}}>CRM SPLIT SERVICE</h1>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            {currentUser&&<div className="pill" style={{height:38,display:"inline-flex",alignItems:"center",padding:"0 12px",borderRadius:12,fontSize:12,fontWeight:600,color:"#9fb1d1"}}>{currentUser.name}{currentUser.role==="admin"?" 🧑‍💼":""}</div>}
            <div style={{height:38,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"0 8px",borderRadius:12,fontSize:11,fontWeight:600,color:cloudColor,textAlign:"center",whiteSpace:"nowrap",background:cloudBg,border:cloudBorder,boxShadow:"inset 0 1px 0 rgba(255,255,255,0.04)"}}>☁ {cloudLabel}</div>
            <MonthYearPicker
              month={month}
              year={year}
              onChange={({ month: nextMonth, year: nextYear }) => {
                setMonth(nextMonth);
                setYear(nextYear);
              }}
            />
            {canEditOrders(currentUser) && <button onClick={()=>setShowNew(true)} className="tb" style={{height:44,padding:"0 18px",borderRadius:12,fontSize:13,fontWeight:800,background:"linear-gradient(135deg,#65ffdd,#18c5be)",color:"#0a0a23"}}>➕ Новый заказ</button>}
            {isSupabaseConfigured() && authSession?.access_token && currentUser?.role === "admin" && (
              <div style={{position:"relative"}}>
                <button
                  onClick={()=>setShowAdminMenu(prev=>!prev)}
                  className="tb"
                  style={{height:44,width:48,borderRadius:12,fontSize:18,fontWeight:800,background:"rgba(255,255,255,0.045)",color:"#dbe4ff",border:"1px solid rgba(255,255,255,0.10)",display:"inline-flex",alignItems:"center",justifyContent:"center"}}
                  title="Меню администратора"
                >
                  ☰
                </button>
                {showAdminMenu && (
                  <div style={{position:"absolute",right:0,top:52,width:250,borderRadius:16,overflow:"hidden",background:"linear-gradient(180deg,#1d2140,#15182e)",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 24px 60px rgba(0,0,0,0.42)",zIndex:1200}}>
                    {[
                      { label: "Справочник услуг", action: openServiceCatalogView },
                      { label: "Заказы", action: openOrdersView },
                      { label: "Сотрудники", action: openEmployeesView },
                      { label: "Контакты", action: openContactsView },
                      { label: "Сводка", action: openSummaryView },
                      { label: "Данные", action: openDataView },
                      { label: "Выход", action: handleLogout, danger: true },
                    ].map((item, index) => (
                      <button
                        key={item.label}
                        onClick={item.action}
                        className="tb"
                        style={{
                          width:"100%",
                          textAlign:"left",
                          padding:"13px 16px",
                          background:"transparent",
                          color:item.danger ? "#ff9ea1" : item.inactive ? "#7384ad" : "#dbe4ff",
                          border:"none",
                          borderTop:index ? "1px solid rgba(255,255,255,0.06)" : "none",
                          fontSize:13,
                          fontWeight:item.danger ? 800 : 700,
                          fontFamily:"inherit",
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isSupabaseConfigured() && authSession?.access_token && currentUser?.role !== "admin" && <button onClick={handleLogout} className="tb" style={{height:44,padding:"0 14px",borderRadius:12,fontSize:13,fontWeight:800,background:"rgba(255,82,82,0.16)",color:"#ff9ea1",border:"1px solid rgba(255,82,82,0.45)"}}>↪ Выход</button>}
          </div>
        </div>
        <div style={{padding:"0 24px 10px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",paddingTop:12}}>
          {Object.entries(visibleCities).map(([c,conf])=>{
            const isA=c===activeCity;const cnt=Object.keys(orders).filter(k=>k.startsWith(c+"|")).length;
            return (<div key={c} style={{display:"inline-flex",alignItems:"center"}}>
              <button className="tb" onClick={()=>{setActiveCity(c);setShowSummary(false);}} style={{padding:"8px 16px",borderRadius:"11px",fontSize:11,fontWeight:isA?800:500,background:isA?"rgba(80,220,255,0.23)":"rgba(255,255,255,0.04)",color:isA?"#d8f7ff":"#91a2c8",border:isA?"1px solid rgba(120,230,255,0.45)":"1px solid rgba(255,255,255,0.08)",boxShadow:isA?"0 0 18px rgba(80,220,255,0.25)":"none"}}>
                {c}{cnt>0&&<span style={{background:"rgba(255,255,255,0.14)",borderRadius:8,padding:"1px 6px",marginLeft:6,fontSize:9}}>{cnt}</span>}
              </button>
            </div>);
          })}
        </div></div>
        {remoteError && <div style={{margin:"0 0 14px",padding:"10px 12px",borderRadius:10,background:"rgba(255,82,82,0.12)",border:"1px solid rgba(255,82,82,0.2)",color:"#ff8a80",fontSize:11}}>{remoteError}</div>}
        <div style={{padding:"10px 24px 12px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:20,flex:"1 1 960px",minWidth:0}}>
              <div style={{flex:1,minWidth:0,overflowX:"auto",paddingBottom:2}}>
                <div style={{display:"inline-flex",alignItems:"stretch",borderRadius:10,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)",background:"rgba(8,12,40,0.35)",height:42,whiteSpace:"nowrap"}}>
                {todayStatusCards.map((item,index)=><div key={item.name} style={{padding:"6px 10px",borderLeft:index?"1px solid rgba(255,255,255,0.08)":"none",width:118,display:"flex",flexDirection:"column",justifyContent:"center",boxSizing:"border-box"}}><div style={{fontSize:9,color:"#7f92ba",letterSpacing:0.6,lineHeight:1.05,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{statusCounterLabel(item.name)}</div><div style={{fontSize:18,fontWeight:900,color:item.meta.left,lineHeight:1.02,marginTop:1}}>{item.count}</div></div>)}
                </div>
              </div>
              {(currentUser?.role === "admin" || currentUser?.role === "call_center") && (
                <div style={{position:"relative",flexShrink:0}}>
                  <button className="tb panel" onClick={()=>setShowStatusCounterConfig(prev=>!prev)} title="Настроить статусы" style={{height:42,width:42,borderRadius:12,fontSize:12,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center",background:showStatusCounterConfig?"rgba(80,220,255,0.2)":"rgba(255,255,255,0.04)",color:showStatusCounterConfig?"#d8f7ff":"#97a8cd",border:showStatusCounterConfig?"1px solid rgba(120,230,255,0.45)":"1px solid rgba(255,255,255,0.08)"}}>
                    <StatusEditIcon color={showStatusCounterConfig ? "#d8f7ff" : "#97a8cd"} />
                  </button>
                  {showStatusCounterConfig && (
                    <div style={{position:"absolute",right:0,top:48,width:260,padding:12,borderRadius:14,background:"linear-gradient(180deg,#1d2140,#15182e)",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 24px 60px rgba(0,0,0,0.42)",zIndex:1200,display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{fontSize:11,fontWeight:800,color:"#dff7ff"}}>Статусы в верхней строке</div>
                      <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:280,overflowY:"auto"}}>
                        {(statuses || []).map((statusItem) => {
                          const checked = visibleStatusNames.includes(statusItem.name);
                          return (
                            <label key={statusItem.name} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer"}}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setVisibleStatusNames((prev) => checked ? prev.filter((name) => name !== statusItem.name) : [...prev, statusItem.name])}
                                style={{accentColor:"#65ffdd"}}
                              />
                              <span style={{fontSize:11,color:"#dbe4ff",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{statusItem.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,flex:"0 1 auto",flexWrap:"nowrap",overflowX:"auto"}}>
              {(currentUser?.role === "admin" || currentUser?.role === "call_center") && (
                <button className="tb panel" onClick={openOrdersExplorerView} title="Фильтры заказов" style={{height:42,width:42,borderRadius:12,fontSize:12,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center",background:showOrdersExplorerView?"rgba(80,220,255,0.2)":"rgba(255,255,255,0.04)",color:showOrdersExplorerView?"#d8f7ff":"#97a8cd",border:showOrdersExplorerView?"1px solid rgba(120,230,255,0.45)":"1px solid rgba(255,255,255,0.08)"}}>
                  <OrderFilterIcon color={showOrdersExplorerView ? "#d8f7ff" : "#97a8cd"} />
                </button>
              )}
              {!canManageEmployees(currentUser) && canViewTechnicianCards(currentUser) && (
                <button className="tb panel" onClick={showEmployeeList ? openOrdersView : openEmployeesView} style={{height:42,padding:"0 16px",borderRadius:12,fontSize:12,fontWeight:700,display:"inline-flex",alignItems:"center",background:showEmployeeList?"rgba(80,220,255,0.2)":"rgba(255,255,255,0.04)",color:showEmployeeList?"#d8f7ff":"#97a8cd",border:showEmployeeList?"1px solid rgba(120,230,255,0.45)":"1px solid rgba(255,255,255,0.08)",flexShrink:0}}>
                  {showEmployeeList ? "📦 Заказы" : "👷 Сотрудники"}
                </button>
              )}
              {currentUser?.role === "call_center" && (
                <button className="tb panel" onClick={openContactsView} style={{height:42,padding:"0 16px",borderRadius:12,fontSize:12,fontWeight:700,display:"inline-flex",alignItems:"center",background:showContactsView?"rgba(80,220,255,0.2)":"rgba(255,255,255,0.04)",color:showContactsView?"#d8f7ff":"#97a8cd",border:showContactsView?"1px solid rgba(120,230,255,0.45)":"1px solid rgba(255,255,255,0.08)",flexShrink:0}}>
                  ☎ Контакты
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={isMobile && isAnySubViewOpen ? {height:"calc(100vh - 74px)",overflowY:"auto",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain"} : undefined}>
      {showEmployeeList ? <EmployeesPage employees={employees} groupedEmployees={groupedEmployees} visibleCities={visibleCities} currentUser={currentUser} onOpenEmployee={openEmployeeCard} onAddEmployee={()=>{openEmployeeCard({ type:"", city:"", color:MCOLORS[0] }, { fromList: true });setShowAddEmployee(true);}} onProvisionAccess={setAccessEmployee} onEditAccess={setEditAccessEmployee} onOpenPermissions={setPermissionsEmployee} onDeleteEmployee={setDeleteEmployeeDraft} onClose={openOrdersView} /> :
      showOrdersExplorerView ? <OrdersExplorerView orders={orders} deletedOrders={deletedOrders} cities={cities} employees={employees} currentUser={currentUser} services={services} statuses={statuses} sources={sources} onOpenOrder={handleOpenOrderFromList} onOpenNew={()=>setShowNew(true)} onClose={openOrdersView} /> :
      showContactsView ? <ContactsView cities={cities} employees={employees} currentUser={currentUser} contacts={contacts} contactStatuses={contactStatuses} contactReasons={contactReasons} onSaveContact={handleSaveContact} onDeleteContact={handleDeleteContact} onCreateOrderFromContact={handleCreateOrderFromContact} onClose={openOrdersView} /> :
      showDataView ? <DataAdminView cities={cities} sources={sources} statuses={statuses} contactStatuses={contactStatuses} contactReasons={contactReasons} currentUser={currentUser} onAddCity={async (n,c,coords)=>{
        if (isSupabaseConfigured() && authSession?.access_token) {
          try {
            await createCity({ name: n, color: c, lat: coords?.lat ?? 55, lng: coords?.lng ?? 37, currentUserRole: currentUser?.role, session: authSession });
            await refreshFromSource(authSession, { preserveUiState: true });
          } catch (error) {
            setRemoteError(error.message);
          }
          return;
        }
        setCities((prev)=>({...prev,[n]:{color:c,lat:coords?.lat ?? 55,lng:coords?.lng ?? 37}}));
      }} onDeleteCity={(cityName)=>setCityDeleteDraft({ cityName, step: 1, mode: "city_only" })} onAddSource={handleCreateSource} onUpdateSource={handleUpdateSource} onDeleteSource={handleDeleteSource} onAddStatus={handleCreateStatus} onDeleteStatus={handleDeleteStatus} onAddContactStatus={handleCreateContactStatus} onDeleteContactStatus={handleDeleteContactStatus} onAddContactReason={handleCreateContactReason} onDeleteContactReason={handleDeleteContactReason} onClose={openOrdersView} /> :
      showServiceCatalog ? <ServiceCatalogView services={services} currentUser={currentUser} onAddRoot={()=>setServiceEditor({ type:"direction", parentId:null, sortOrder:services.filter((node)=>!node.parentId).length })} onAddChild={(parentNode)=>setServiceEditor({ type: parentNode.type === "direction" ? "subcategory" : "service", parentId: parentNode.id, sortOrder: services.filter((node)=>node.parentId === parentNode.id).length })} onEdit={(node)=>setServiceEditor(node)} onDelete={handleDeleteServiceNode} onClose={openOrdersView} /> :
      showSummary?<SummaryView orders={orders} activeCity={activeCity} statuses={statuses} onOrderClick={(key)=>{const p=key.split("|");setPopup({key,data:orders[key],fixedSlot:{city:p[0],master:p[1],dateStr:p[2],timeIdx:parseInt(p[3]),durationSlots:getOrderDurationSlots(orders[key])}});}} onClose={openOrdersView} />
      :(<div ref={scheduleScrollRef} style={{overflow:"auto",padding:"0 0 16px",maxHeight:"calc(100vh - 250px)"}}>
        <table style={{borderCollapse:"separate",borderSpacing:0,width:"100%",minWidth:1170,tableLayout:"fixed"}}>
          <thead><tr>
            <th className="sticky-head sticky-col" style={{left:0,zIndex:70,background:"#12122a",padding:"7px 8px",fontSize:9,color:"#5a6a8a",fontWeight:600,letterSpacing:1,textAlign:"left",borderBottom:"1px solid rgba(255,255,255,0.06)",minWidth:72,width:72}}>ДАТА</th>
            <th className="sticky-head sticky-col sticky-divider" style={{left:72,zIndex:71,background:"#12122a",padding:"7px 8px",fontSize:9,color:"#5a6a8a",fontWeight:600,letterSpacing:1,textAlign:"left",borderBottom:"1px solid rgba(255,255,255,0.06)",minWidth:112,width:112}}>МАСТЕР</th>
            {TIMES.map(t=><th className="sticky-head" key={t} style={{zIndex:40,background:"#12122a",padding:"7px 8px",fontSize:11,color:"#64ffda",fontWeight:700,textAlign:"center",borderBottom:"1px solid rgba(255,255,255,0.06)",minWidth:102,width:102,fontFamily:"monospace"}}>{t}</th>)}
          </tr></thead>
          <tbody>{dates.map((date,di)=>{
            const d=dstr(date);const isWe=date.getDay()===0||date.getDay()===6;const isT=d===today;
            return cityMasters.map((master,mi)=>{
              const isF=mi===0;const isL=mi===cityMasters.length-1;const off=dayOffs[dok(activeCity,master.name,d)];
              const scheduleActive = isScheduleActiveFromDate(master, d);
              const workSchedule = normalizeWorkSchedule(master.workSchedule);
              const workingDaySlots = workSchedule[String(date.getDay())] || [];
              const rowLayout = buildOrderLayoutMap(orders, activeCity, master.name, d);
              return (<tr key={`${di}-${mi}`} style={{background:isT?"rgba(100,255,218,0.03)":isWe?"rgba(255,255,255,0.015)":"transparent"}}>
                {isF&&<td ref={isT ? todayRowRef : null} className="sticky-col" rowSpan={cityMasters.length} style={{left:0,zIndex:30,background:isT?"#1a2a3a":isWe?"#151528":"#0e0e20",padding:"0 7px",borderBottom:"1px solid rgba(255,255,255,0.08)",verticalAlign:"middle",textAlign:"center",minWidth:72,width:72}}>
                  <div style={{minHeight:Math.max(62, cityMasters.length * 53),display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",gap:2}}>
                    <div style={{fontSize:20,fontWeight:900,lineHeight:1,color:isT?"#64ffda":isWe?"#ff9800":"#fff"}}>{date.getDate()}</div>
                    <div style={{fontSize:13,fontWeight:700,lineHeight:1,color:isWe?"#ff9800":"#6e81aa"}}>{fd(date).split(" ")[1]}</div>
                  </div>
                </td>}
                <td className="sticky-col sticky-divider" style={{left:72,zIndex:31,background:isT?"#1a2a3a":"#0e0e20",padding:"4px 6px",borderBottom:isL?"1px solid rgba(255,255,255,0.08)":"1px solid rgba(255,255,255,0.03)",minWidth:112,width:112}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{width:18,height:18,borderRadius:9,background:master.color,display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#0c1329",fontSize:10,fontWeight:800,boxShadow:`0 0 0 1px ${master.color}55`,flexShrink:0}}>{master.name.slice(0,1)}</span>
                    <button type="button" onClick={()=>{ if (canViewTechnicianCards(currentUser)) openEmployeeCard(master, { fromList: false }); }} title={master.name} style={{fontSize:11.5,fontWeight:700,color:off?"#7a8399":"#d5e2ff",textDecoration:off?"line-through":"none",whiteSpace:"nowrap",background:"transparent",border:"none",padding:0,cursor:canViewTechnicianCards(currentUser)?"pointer":"default",fontFamily:"inherit",textAlign:"left",lineHeight:1.1,flex:"1 1 auto",minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{formatScheduleEmployeeName(master.name)}</button>
                    {canEditOrders(currentUser) && <button onClick={()=>toggleOff(activeCity,master.name,d)} style={{marginLeft:"auto",minWidth:22,width:22,height:22,borderRadius:11,border:off?"1px solid rgba(255,214,102,0.55)":"1px solid rgba(255,255,255,0.12)",fontSize:11,cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:off?"rgba(255,193,7,0.16)":"rgba(255,255,255,0.06)",color:off?"#ffd166":"#8b94ad",padding:0,transition:"all .15s ease"}}>{off?"🌙":"☾"}</button>}
                  </div>
                </td>
                {(() => {
                  if (off) {
                    return TIMES.map((_, ti) => (
                      <td key={ti} style={{padding:2,borderBottom:isL?"1px solid rgba(255,255,255,0.08)":"1px solid rgba(255,255,255,0.03)"}}>
                        <div style={{height:48,borderRadius:6,background:"repeating-linear-gradient(45deg,rgba(255,255,255,0.02),rgba(255,255,255,0.02) 4px,rgba(255,255,255,0.04) 4px,rgba(255,255,255,0.04) 8px)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:8,color:"#555"}}>вых</span></div>
                      </td>
                    ));
                  }
                  const cells = [];
                  for (let ti = 0; ti < TIMES.length; ti += 1) {
                    const key = ck(activeCity, master.name, d, ti);
                    const layout = rowLayout[ti];
                    if (layout?.type === "covered") continue;
                    const order = layout?.type === "start" ? layout.order : null;
                    const span = order ? Math.max(1, getOrderDurationSlots(order)) : 1;
                    const busy = busySlots[bok(activeCity,master.name,d,ti)];
                    const lock = activeSlotLocks[lok(activeCity, master.name, d, ti)] || null;
                    const ownLock = lock && lock.employeeId === currentLockOwnerId;
	                    const notWorking = scheduleActive && !Boolean(workingDaySlots[ti] ?? true);
	                    const orderScheduleConflict = Boolean(order && notWorking);
                    const openCell = () => {
                      if (notWorking && !order) return;
                      if (!order && !canEditOrders(currentUser)) return;
                      if (busy && !order) return;
                      if (lock && !ownLock && !order) {
                        setRemoteError(`${lock.employeeName || "Другой сотрудник"} уже оформляет этот слот`);
                        return;
                      }
                      if (currentUser?.role === "technician" && !order) return;
                      const p=key.split("|");
                      const nextPopup = {key,data:order||null,fixedSlot:{city:p[0],master:p[1],dateStr:p[2],timeIdx:parseInt(p[3]),durationSlots:order ? getOrderDurationSlots(order) : NEW_ORDER_DURATION_SLOTS}};
                      if (!order && p[2] && p[2] < today) {
                        setPastOrderDraft(nextPopup);
                        return;
                      }
                      setPopup(nextPopup);
                    };
                    cells.push(
                      <td key={ti} colSpan={span} style={{padding:2,borderBottom:isL?"1px solid rgba(255,255,255,0.08)":"1px solid rgba(255,255,255,0.03)"}}>
	                        <div className={`cs ${order ? "" : "emptyCell"}`} onClick={openCell} style={{height:48,borderRadius:6,padding:order?4:0,background:order?(orderScheduleConflict?"linear-gradient(180deg, rgba(122,126,146,0.38), rgba(73,78,99,0.42))":statusMeta(order.status, statusMap).cardBg):notWorking?"repeating-linear-gradient(135deg,rgba(255,255,255,0.02),rgba(255,255,255,0.02) 6px,rgba(255,255,255,0.05) 6px,rgba(255,255,255,0.05) 12px)":"rgba(255,255,255,0.02)",border:order?(orderScheduleConflict?"1px solid rgba(208,214,234,0.32)":`1px solid ${statusMeta(order.status, statusMap).cardBorder}`):notWorking?"1px solid rgba(255,255,255,0.08)":busy?"2px dashed rgba(255,193,7,0.92)":"1px dashed rgba(255,255,255,0.06)",boxShadow:busy?"inset 0 0 0 1px rgba(255,193,7,0.16)":orderScheduleConflict?"inset 0 0 0 1px rgba(255,255,255,0.06)":"none",display:"flex",alignItems:order?"flex-start":"center",justifyContent:order?"flex-start":"center",cursor:(!order && (notWorking || !canEditOrders(currentUser) || busy || (lock && !ownLock)))?"default":"pointer",overflow:"hidden",position:"relative"}}>
	                          {order?<><CellPreview statusMap={statusMap} scheduleConflict={orderScheduleConflict} data={{...maskTechnicianOrder(order, currentUser), displayPrice: order.status === "Выполнен" ? (order.finalPrice || order.price) : order.price}} />{orderScheduleConflict && <div style={{position:"absolute",inset:0,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:"118%",height:1,background:"rgba(240,244,255,0.7)",transform:"rotate(-10deg)",boxShadow:"0 0 0 1px rgba(255,255,255,0.08)"}} /></div>}</>:notWorking?<div style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%",color:"#6c748f",fontSize:10,fontWeight:700}}>не раб</div>:lock && !ownLock ?<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,color:"#ff5d6c",width:"100%",padding:"4px 3px",lineHeight:1.1}}>
                            <span style={{width:8,height:8,borderRadius:999,background:"#ff4d5f",boxShadow:"0 0 0 2px rgba(255,77,95,0.18)"}} />
                            <span style={{fontSize:8.2,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{lock.employeeName || "Сотрудник"}</span>
                            <span style={{fontSize:8.2,fontWeight:800,color:"#ff6b78"}}>оформляется</span>
                          </div>:busy?<span style={{fontSize:14,color:"#ffd166",fontWeight:800,letterSpacing:0.2}}>занят</span>:<span style={{fontSize:14,opacity:0.1}}>+</span>}
                        </div>
                      </td>,
                    );
                  }
                  return cells;
                })()}
              </tr>);
            });
          })}</tbody>
        </table>
      </div>)}

      </div>
      {popup&&<OrderForm key={`popup-${popup.key}-${popup.data?._id || "new"}`} data={popup.data} isNew={!popup.data} fixedSlot={popup.fixedSlot} onSave={handleSave} onClose={closeOrderDraftAndReleaseLocks} onDelete={handleDelete} sources={sources} onAddSource={s=>setSources(p=>[...p,s])} cities={cities} employees={employees} orders={orders} dayOffs={dayOffs} busySlots={busySlots} slotLocks={activeSlotLocks} historyEntries={orderHistory[popup.key] || []} currentUser={currentUser} readOnly={!canEditOrders(currentUser)} allowDelete={canDeleteOrders(currentUser)} orderNumber={popup.data?.orderNumber} services={services} statuses={statuses} onDraftSlotChange={setDraftSlotSelection} />}
      {pastOrderDraft && <PastDateOrderConfirmPopup today={today} targetDate={pastOrderDraft.fixedSlot?.dateStr || ""} onConfirm={confirmPastOrderDraft} onClose={()=>setPastOrderDraft(null)} />}
      {showNew&&<OrderForm key="show-new-order" initialData={contactToOrderDraft ? { phone: contactToOrderDraft.phone, name: contactToOrderDraft.name || "", city: contactToOrderDraft.city, source: "Контакты" } : null} isNew fixedSlot={null} onSave={handleSave} onClose={closeOrderDraftAndReleaseLocks} onDelete={null} sources={sources} onAddSource={s=>setSources(p=>[...p,s])} cities={cities} employees={employees} orders={orders} dayOffs={dayOffs} busySlots={busySlots} slotLocks={activeSlotLocks} historyEntries={[]} currentUser={currentUser} readOnly={!canEditOrders(currentUser)} allowDelete={false} services={services} statuses={statuses} onDraftSlotChange={setDraftSlotSelection} />}
      {showAddCity&&<AddCityPopup onAdd={async (n,c)=>{
        if (isSupabaseConfigured() && authSession?.access_token) {
          try {
            await createCity({ name: n, color: c, currentUserRole: currentUser?.role, session: authSession });
            await refreshFromSource(authSession);
            setActiveCity(n);
          } catch (error) {
            setRemoteError(error.message);
          }
          return;
        }
        setCities(p=>({...p,[n]:{color:c,lat:55,lng:37}}));setActiveCity(n);
      }} onClose={()=>setShowAddCity(false)} />}
      {showAdminMenu && <div onClick={()=>setShowAdminMenu(false)} style={{position:"fixed",inset:0,zIndex:1100}} />}
      {cityDeleteDraft && <CityDeletePopup draft={cityDeleteDraft} employees={employees} onChooseMode={(mode)=>setCityDeleteDraft((prev)=>prev ? { ...prev, mode, step: 2 } : prev)} onConfirm={async ()=>{ const removed = await deleteCity(cityDeleteDraft.cityName, cityDeleteDraft.mode); if (removed) setCityDeleteDraft(null); }} onClose={()=>setCityDeleteDraft(null)} />}
      {deleteEmployeeDraft && <ConfirmDialog title={`Удалить сотрудника ${deleteEmployeeDraft.name}?`} onConfirm={async ()=>{ const employee = deleteEmployeeDraft; setDeleteEmployeeDraft(null); await handleDeleteEmployee(employee); }} onCancel={()=>setDeleteEmployeeDraft(null)} />}
      {employeeCard&&<EmployeeEditorPopup employee={employeeCard} currentUser={currentUser} cities={visibleCities} services={services} onSave={handleEmployeeCardSave} onClose={closeEmployeeCard} onProvisionAccess={()=>setAccessEmployee(employeeCard)} onEditAccess={()=>setEditAccessEmployee(employeeCard)} onOpenPermissions={()=>setPermissionsEmployee(employeeCard)} saving={employeeSavePending} dimmed={Boolean(permissionsEmployee || accessEmployee || editAccessEmployee)} />}
      {permissionsEmployee&&<EmployeePermissionsPopup employee={permissionsEmployee} saving={permissionsSaving} onSave={handlePermissionsSave} onClose={()=>setPermissionsEmployee(null)} />}
      {accessEmployee&&<EmployeeAccessPopup employee={accessEmployee} saving={accessSaving} error={remoteError} onSave={handleAccessSave} onClose={()=>setAccessEmployee(null)} />}
      {editAccessEmployee&&<EmployeeAccessEditPopup employee={editAccessEmployee} saving={editAccessSaving} error={remoteError} onSave={handleAccessEditSave} onClose={()=>setEditAccessEmployee(null)} />}
      {serviceEditor&&<ServiceEditorPopup draft={serviceEditor} parentNode={services.find((node)=>node.id===serviceEditor.parentId) || null} saving={serviceSaving} onSave={handleServiceEditorSave} onClose={()=>setServiceEditor(null)} />}
    </div>
  );
}
