import {
  getSupabaseModeLabel,
  invokeFunction,
  isSupabaseConfigured,
  restDelete,
  restInsert,
  restPatch,
  restRpc,
  restSelect,
  restUpsert,
} from "../lib/supabase.js";

const ck = (c,m,d,t) => `${c}|${m}|${d}|${t}`;
const dok = (c,m,d) => `off|${c}|${m}|${d}`;
const bok = (c,m,d,t) => `busy|${c}|${m}|${d}|${t}`;
const lok = (c,m,d,t) => `lock|${c}|${m}|${d}|${t}`;
const DEFAULT_ORDER_DURATION_SLOTS = 2;
const SLOT_LOCK_TTL_MS = 5 * 60 * 1000;
const WORKDAY_SLOT_COUNT = 13;
const DEFAULT_STATUSES = [
  { name: "Новый", shortLabel: "НОВЫЙ", tone: "amber", sortOrder: 0 },
  { name: "Прозвонен", shortLabel: "ПРОЗВ.", tone: "sky", sortOrder: 1 },
  { name: "Подтверждён", shortLabel: "ПОДТВ.", tone: "green", sortOrder: 2 },
  { name: "Подтвержден мастером", shortLabel: "МАСТЕР", tone: "green", sortOrder: 3 },
  { name: "В пути", shortLabel: "В ПУТИ", tone: "blue", sortOrder: 4 },
  { name: "На объекте", shortLabel: "ОБЪЕКТ", tone: "violet", sortOrder: 5 },
  { name: "Выполнен", shortLabel: "ВЫПОЛН.", tone: "pink", sortOrder: 6 },
  { name: "Отменён", shortLabel: "ОТМЕН.", tone: "red", sortOrder: 7 },
  { name: "Перенесён", shortLabel: "ПЕРЕН.", tone: "yellow", sortOrder: 8 },
  { name: "Возврат в офис", shortLabel: "ВОЗВР.", tone: "red", sortOrder: 9 },
];
const DEFAULT_CONTACT_STATUSES = [
  { name: "Новый", tone: "blue", sortOrder: 0, systemKey: "new", isDefault: true },
  { name: "Перезвонить", tone: "yellow", sortOrder: 1, systemKey: "callback", isDefault: false },
  { name: "Недозвонился", tone: "orange", sortOrder: 2, systemKey: "missed", isDefault: false },
  { name: "Неактуально", tone: "red", sortOrder: 3, systemKey: "inactive", isDefault: false },
  { name: "Записан", tone: "green", sortOrder: 4, systemKey: "booked", isDefault: false },
];
const DEFAULT_CONTACT_REASONS = [
  { name: "Занят", statusName: "Перезвонить", sortOrder: 0 },
  { name: "Просил позже", statusName: "Перезвонить", sortOrder: 1 },
  { name: "Неудобно говорить", statusName: "Перезвонить", sortOrder: 2 },
  { name: "Нужно посоветоваться", statusName: "Перезвонить", sortOrder: 3 },
  { name: "Не взял трубку", statusName: "Недозвонился", sortOrder: 0 },
  { name: "Сбросил", statusName: "Недозвонился", sortOrder: 1 },
  { name: "Вне зоны", statusName: "Недозвонился", sortOrder: 2 },
  { name: "Неверный номер", statusName: "Недозвонился", sortOrder: 3 },
  { name: "Уже обслужили", statusName: "Неактуально", sortOrder: 0 },
  { name: "Неинтересно", statusName: "Неактуально", sortOrder: 1 },
  { name: "Ошибочный контакт", statusName: "Неактуально", sortOrder: 2 },
  { name: "Переехал", statusName: "Неактуально", sortOrder: 3 },
  { name: "Нет кондиционера", statusName: "Неактуально", sortOrder: 4 },
];
const getDurationSlots = (order) => Math.max(1, Number(order?.durationSlots ?? order?.duration_slots ?? DEFAULT_ORDER_DURATION_SLOTS));
const formatShortDate = (dateStr = "") => {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(dateStr || "—");
  return `${match[3]}.${match[2]}`;
};
const slotLabel = (slotIdx) => `${String(8 + Number(slotIdx || 0)).padStart(2, "0")}:00`;
const formatSelectedRange = (startIdx, durationSlots) => `${slotLabel(startIdx)}-${slotLabel(Number(startIdx) + Number(durationSlots || 1))}`;
const formatDurationLabel = (durationSlots) => {
  const value = Math.max(1, Number(durationSlots || 1));
  return `${value} ${value === 1 ? "час" : (value >= 2 && value <= 4 ? "часа" : "часов")}`;
};
const formatHistoryValue = (field, value, related = {}) => {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "dateStr") return formatShortDate(value);
  if (field === "timeIdx") return formatSelectedRange(Number(value), related.durationSlots);
  if (field === "durationSlots") return formatDurationLabel(value);
  if (field === "callbackDate") return formatShortDate(value);
  return String(value);
};
const stripReturnCommentTag = (comment = "") => String(comment || "")
  .replace(/\n{0,2}Возврат в офис(?: \([^)]+\))?:[\s\S]*$/u, "")
  .trim();
const mergeReturnComment = ({ baseComment = "", returnComment = "", technicianName = "" }) => {
  const base = stripReturnCommentTag(baseComment);
  const reason = String(returnComment || "").trim();
  if (!reason) return base;
  const authorSuffix = technicianName ? ` (${technicianName})` : "";
  return [base, `Возврат в офис${authorSuffix}: ${reason}`].filter(Boolean).join("\n\n");
};
const buildTransferHistoryDetails = (before = {}, after = {}) => (
  `Перенос с: ${before.master || "—"} ${formatShortDate(before.dateStr)} (${formatSelectedRange(before.timeIdx, before.durationSlots)})`
  + ` на ${after.master || "—"} ${formatShortDate(after.dateStr)} (${formatSelectedRange(after.timeIdx, after.durationSlots)})`
);
const rangesOverlap = (startA, durationA, startB, durationB) => startA < (startB + durationB) && startB < (startA + durationA);

const STORAGE_KEY = "crm-v2-snapshot";
const STORAGE_VERSION = 1;

const readLocalSnapshot = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeLocalSnapshot = (snapshot) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
};

const mergeSnapshot = (defaults, stored) => {
  if (!stored || stored.version !== STORAGE_VERSION) return defaults;
  const defaultStatuses = defaults.statuses || DEFAULT_STATUSES;
  const storedStatuses = Array.isArray(stored.state?.statuses) ? stored.state.statuses : [];
  const mergedStatuses = storedStatuses.length
    ? [...storedStatuses, ...defaultStatuses.filter((status) => !storedStatuses.some((item) => item.name === status.name))]
    : defaultStatuses;
  const visibleStatusNames = Array.isArray(stored.state?.visibleStatusNames) && stored.state.visibleStatusNames.length
    ? [...stored.state.visibleStatusNames, ...mergedStatuses.map((status) => status.name).filter((name) => !stored.state.visibleStatusNames.includes(name))]
    : mergedStatuses.map((status) => status.name);
  return {
    ...defaults,
    ...stored.state,
    cities: stored.state?.cities || defaults.cities,
    employees: stored.state?.employees || defaults.employees,
    orders: stored.state?.orders || defaults.orders,
    orderHistory: stored.state?.orderHistory || defaults.orderHistory,
    dayOffs: stored.state?.dayOffs || defaults.dayOffs,
    busySlots: stored.state?.busySlots || defaults.busySlots,
    slotLocks: pruneExpiredSlotLocksMap(stored.state?.slotLocks || defaults.slotLocks || {}),
    sources: stored.state?.sources || defaults.sources,
    services: stored.state?.services || defaults.services,
    visibleStatusNames,
    statuses: mergedStatuses,
    contacts: stored.state?.contacts || defaults.contacts,
    contactStatuses: stored.state?.contactStatuses || defaults.contactStatuses,
    contactReasons: stored.state?.contactReasons || defaults.contactReasons,
    deletedOrders: stored.state?.deletedOrders || defaults.deletedOrders || {},
  };
};

const normalizeCities = (rows) => rows.reduce((acc, row) => {
  acc[row.name] = { id: row.id, color: row.color, lat: row.lat, lng: row.lng };
  return acc;
}, {});

const createDefaultWorkSchedule = () => Object.fromEntries(
  Array.from({ length: 7 }, (_, dayIdx) => [String(dayIdx), Array(WORKDAY_SLOT_COUNT).fill(true)]),
);

const normalizeWorkSchedule = (schedule) => {
  const base = createDefaultWorkSchedule();
  if (!schedule || typeof schedule !== "object") return base;
  return Object.fromEntries(
    Array.from({ length: 7 }, (_, dayIdx) => {
      const raw = schedule[dayIdx] ?? schedule[String(dayIdx)];
      if (!Array.isArray(raw)) return [String(dayIdx), base[String(dayIdx)].slice()];
      return [String(dayIdx), base[String(dayIdx)].map((value, slotIdx) => raw[slotIdx] !== false)];
    }),
  );
};

const isScheduleActiveFromDate = (employee, dateStr) => {
  const effectiveFrom = String(employee?.workScheduleEffectiveFrom || "").trim();
  if (!dateStr || !effectiveFrom) return true;
  return dateStr >= effectiveFrom;
};

const mergeEmployeeSchedules = (employees = [], storedEmployees = []) => {
  const scheduleMap = new Map(
    (storedEmployees || []).map((employee) => [
      employee.id || `${employee.type || ""}|${employee.city || ""}|${employee.name || ""}`,
      {
        workSchedule: employee.workSchedule,
        workScheduleEffectiveFrom: employee.workScheduleEffectiveFrom || "",
      },
    ]),
  );
  return employees.map((employee) => ({
    ...employee,
    workSchedule: normalizeWorkSchedule((scheduleMap.get(employee.id || `${employee.type || ""}|${employee.city || ""}|${employee.name || ""}`) || {}).workSchedule || employee.workSchedule),
    workScheduleEffectiveFrom: (scheduleMap.get(employee.id || `${employee.type || ""}|${employee.city || ""}|${employee.name || ""}`) || {}).workScheduleEffectiveFrom || employee.workScheduleEffectiveFrom || "",
  }));
};

const normalizeEmployees = (rows, privateMap, scopesMap = {}) => rows.map((row) => ({
  id: row.id,
  authUserId: row.auth_user_id || null,
  authEmail: row.auth_email || "",
  name: row.name,
  type: row.employee_type,
  city: row.city?.name || "",
  color: row.color,
  phone: row.phone || "",
  passport: privateMap[row.id]?.passport || "",
  residenceAddress: privateMap[row.id]?.residenceAddress || "",
  residenceLat: privateMap[row.id]?.residenceLat || null,
  residenceLng: privateMap[row.id]?.residenceLng || null,
  canViewTechnicianCards: Boolean(row.can_view_technician_cards),
  lastSeen: row.last_seen || null,
  serviceScopes: scopesMap[row.id] || [],
  skillSubcategoryIds: (scopesMap[row.id] || []).map((scope) => scope.subcategoryId),
  workSchedule: createDefaultWorkSchedule(),
  workScheduleEffectiveFrom: "",
}));

const normalizeOrders = (rows, options = {}) => rows.reduce((acc, row) => {
  const legacyHourly = Boolean(options.legacyHourly);
  const orderItemsMap = options.orderItemsMap || {};
  const timeSlot = legacyHourly ? Number(row.time_slot) * 2 : Number(row.time_slot);
  const key = ck(row.city?.name, row.technician?.name, row.order_date, timeSlot);
  acc[key] = {
    _id: row.id,
    orderNumber: row.order_number ?? null,
    _cityId: row.city_id,
    _masterId: row.technician_id,
    _sourceId: row.source_id,
    _directionId: row.direction_id || null,
    _subcategoryId: row.subcategory_id || null,
    _createdAt: row.created_at || null,
    createdByName: row.creator?.name || "",
    city: row.city?.name || "",
    master: row.technician?.name || "",
    dateStr: row.order_date,
    timeIdx: timeSlot,
    durationSlots: legacyHourly ? DEFAULT_ORDER_DURATION_SLOTS : getDurationSlots(row),
    price: row.price || "",
    finalPrice: row.final_price || "",
    district: row.district || "",
    name: row.client_name || "",
    phone: row.client_phone || "",
    address: row.address || "",
    lat: row.lat,
    lng: row.lng,
    comment: row.comment || "",
    callbackDate: row.callback_date || "",
    status: row.status || "Новый",
    technicianConfirmedAt: row.technician_confirmed_at || null,
    technicianConfirmedById: row.technician_confirmed_by || null,
    technicianConfirmedByName: row.technician_ack?.name || "",
    returnedToOfficeAt: row.returned_to_office_at || null,
    returnedToOfficeById: row.returned_to_office_by || null,
    returnedToOfficeByName: row.return_author?.name || "",
    returnToOfficeComment: row.return_to_office_comment || "",
    officeAttentionRequired: Boolean(row.office_attention_required),
    source: row.source?.name || "",
    workOrder: row.work_order || "",
    workDone: row.work_done || "",
    serviceDirectionId: row.direction_id || null,
    serviceDirectionName: row.direction?.name || "",
    serviceSubcategoryId: row.subcategory_id || null,
    serviceSubcategoryName: row.subcategory?.name || "",
    serviceItems: orderItemsMap[row.id] || [],
  };
  return acc;
}, {});

const normalizeEmployeeScopes = (rows) => (rows || []).reduce((acc, row) => {
  if (!row.employee_id) return acc;
  if (!acc[row.employee_id]) acc[row.employee_id] = [];
  acc[row.employee_id].push({
    directionId: row.direction_id,
    directionName: row.direction?.name || "",
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory?.name || "",
  });
  return acc;
}, {});

const normalizeOrderItems = (rows) => (rows || []).reduce((acc, row) => {
  if (!row.order_id) return acc;
  if (!acc[row.order_id]) acc[row.order_id] = [];
  acc[row.order_id].push({
    id: row.id,
    serviceId: row.service_id,
    name: row.service?.name || "",
    quantity: Number(row.quantity || 1),
    unitPrice: row.unit_price === null || row.unit_price === undefined ? "" : String(row.unit_price),
    totalPrice: Number(row.quantity || 1) * Number(row.unit_price || 0),
  });
  return acc;
}, {});

const normalizeDayOffs = (rows) => rows.reduce((acc, row) => {
  const cityName = row.technician?.city?.name || "";
  const masterName = row.technician?.name || "";
  if (cityName && masterName) acc[dok(cityName, masterName, row.off_date)] = true;
  return acc;
}, {});

const normalizeBusySlots = (rows, options = {}) => rows.reduce((acc, row) => {
  const legacyHourly = Boolean(options.legacyHourly);
  const cityName = row.technician?.city?.name || "";
  const masterName = row.technician?.name || "";
  const timeSlot = legacyHourly ? Number(row.time_slot) * 2 : Number(row.time_slot);
  if (cityName && masterName) acc[bok(cityName, masterName, row.busy_date, timeSlot)] = true;
  return acc;
}, {});

const pruneExpiredSlotLocksMap = (slotLocks = {}, now = Date.now()) => Object.entries(slotLocks || {}).reduce((acc, [key, value]) => {
  const expiresAt = value?.expiresAt ? new Date(value.expiresAt).getTime() : 0;
  if (!expiresAt || expiresAt <= now) return acc;
  acc[key] = value;
  return acc;
}, {});

const normalizeSlotLocks = (rows = []) => rows.reduce((acc, row) => {
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!expiresAt || expiresAt <= Date.now()) return acc;
  const cityName = row.technician?.city?.name || "";
  const masterName = row.technician?.name || "";
  const timeSlot = Number(row.time_slot);
  if (!cityName || !masterName || Number.isNaN(timeSlot)) return acc;
  acc[lok(cityName, masterName, row.order_date, timeSlot)] = {
    id: row.id,
    employeeId: row.employee_id || null,
    employeeName: row.employee_name || row.employee?.name || "Сотрудник",
    expiresAt: row.expires_at,
  };
  return acc;
}, {});

const normalizeHistory = (rows, orders) => rows.reduce((acc, row) => {
  const orderEntry = Object.entries(orders).find(([, value]) => value._id === row.order_id);
  if (!orderEntry) return acc;
  const [key] = orderEntry;
  let details = row.meta?.details || row.action;
  if (row.field_name) {
    const activeOrder = orderEntry[1] || {};
    const durationForNewValue = row.field_name === "Время"
      ? getDurationSlots({ durationSlots: activeOrder.durationSlots })
      : undefined;
    const durationForOldValue = row.field_name === "Время"
      ? getDurationSlots({
        durationSlots: row.meta?.old_duration_slots
          ?? row.meta?.duration_slots
          ?? activeOrder.durationSlots,
      })
      : undefined;
    const fieldMap = {
      Статус: "status",
      Мастер: "master",
      Дата: "dateStr",
      Время: "timeIdx",
      Длительность: "durationSlots",
      "Дата перезвона": "callbackDate",
      Стоимость: "price",
      "Окончательная стоимость": "finalPrice",
      Адрес: "address",
      Комментарий: "comment",
      "Заказ работ": "workOrder",
    };
    const fieldKey = fieldMap[row.field_name] || row.field_name;
    details = `${row.field_name}: ${formatHistoryValue(fieldKey, row.old_value, { durationSlots: durationForOldValue })} → ${formatHistoryValue(fieldKey, row.new_value, { durationSlots: durationForNewValue })}`;
  }
  if (!acc[key]) acc[key] = [];
  acc[key].push({
    id: row.id,
    actor: row.actor?.name || "Система",
    action: row.action,
    details,
    at: row.created_at,
  });
  return acc;
}, {});

const applyOrderHistoryMetadata = (orders, rows = []) => {
  const next = Object.fromEntries(Object.entries(orders || {}).map(([key, value]) => [key, { ...value }]));
  const keyById = new Map(Object.entries(next).map(([key, value]) => [value?._id, key]).filter(([id]) => Boolean(id)));
  [...(rows || [])]
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
    .forEach((row) => {
      const key = keyById.get(row.order_id);
      if (!key || !row.field_name) return;
      if (row.field_name === "Дата перезвона") {
        next[key].callbackDate = row.new_value || "";
      }
    });
  return next;
};

const normalizeServices = (rows) => (rows || []).map((row) => ({
  id: row.id,
  parentId: row.parent_id || null,
  type: row.node_type,
  name: row.name,
  price: row.price === null || row.price === undefined ? "" : String(row.price),
  sortOrder: row.sort_order || 0,
})).sort((a, b) => {
  if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
  return a.name.localeCompare(b.name, "ru");
});

const normalizeStatuses = (rows) => {
  if (!rows?.length) return DEFAULT_STATUSES;
  const mapped = rows.map((row, index) => ({
    id: row.id || null,
    name: row.name,
    shortLabel: row.short_label || row.shortLabel || row.name,
    tone: row.tone_key || row.tone || "sky",
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? index),
  }));
  DEFAULT_STATUSES.forEach((defaultStatus) => {
    if (!mapped.some((item) => item.name === defaultStatus.name)) {
      mapped.push(defaultStatus);
    }
  });
  return mapped.sort((a, b) => {
    if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
    return a.name.localeCompare(b.name, "ru");
  });
};

const normalizeContactStatuses = (rows) => {
  if (!rows?.length) return DEFAULT_CONTACT_STATUSES;
  return rows.map((row, index) => ({
    id: row.id || null,
    name: row.name,
    tone: row.tone_key || row.tone || "blue",
    sortOrder: Number(row.sort_order ?? index),
    systemKey: row.system_key || null,
    isDefault: Boolean(row.is_default),
  })).sort((a, b) => {
    if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
    return a.name.localeCompare(b.name, "ru");
  });
};

const normalizeContactReasons = (rows) => {
  if (!rows?.length) return DEFAULT_CONTACT_REASONS;
  return rows.map((row, index) => ({
    id: row.id || null,
    name: row.name,
    statusId: row.contact_status_id || row.status_id || null,
    statusName: row.status?.name || row.status_name || "",
    sortOrder: Number(row.sort_order ?? index),
  })).sort((a, b) => {
    if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
    return a.name.localeCompare(b.name, "ru");
  });
};

const normalizeContacts = (rows) => (rows || []).map((row) => ({
  id: row.id,
  name: row.name || "",
  phone: row.phone || "",
  cityId: row.city_id || null,
  city: row.city?.name || "",
  statusId: row.contact_status_id || null,
  status: row.status?.name || row.status_name || "",
  reasonId: row.contact_reason_id || null,
  reason: row.reason?.name || row.reason_name || "",
  comment: row.comment || "",
  callbackDate: row.callback_date || "",
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  createdById: row.created_by || null,
  createdByName: row.creator?.name || "",
  lastEditorId: row.last_edited_by || null,
  lastEditorName: row.editor?.name || "",
  assignedToId: row.assigned_employee_id || null,
  assignedToName: row.assigned?.name || row.creator?.name || "",
  lastCallAt: row.last_call_at || null,
  convertedOrderId: row.converted_order_id || null,
})).sort((a, b) => {
  const aTime = a.callbackDate || a.createdAt || "";
  const bTime = b.callbackDate || b.createdAt || "";
  return String(bTime).localeCompare(String(aTime));
});

export const createCrmSnapshot = (state) => ({
  version: STORAGE_VERSION,
  provider: getSupabaseModeLabel(),
  savedAt: new Date().toISOString(),
  state,
});

export const loadCrmState = async (defaults, session) => {
  const stored = readLocalSnapshot();
  const storedState = stored?.state || {};
  if (isSupabaseConfigured() && session?.access_token) {
    const token = session.access_token;
    const cities = await restSelect("cities", { token, select: "id,name,color,lat,lng", filters: { order: "created_at.asc" } });
    const employeesRaw = await restSelect("employees", { token, select: "id,auth_user_id,auth_email,name,employee_type,color,phone,can_view_technician_cards,last_seen,city:city_id(name)", filters: { order: "created_at.asc" } });
    const currentUserRow = employeesRaw.find((row) => row.auth_user_id === session.user?.id) || null;
    let privateRows = [];
    if (currentUserRow?.employee_type === "admin") {
      try {
        privateRows = await restSelect("employee_private", { token, select: "employee_id,passport,residence_address,residence_lat,residence_lng" });
      } catch (error) {
        const message = `${error?.message || ""}`;
        if (message.includes("residence_address") || message.includes("residence_lat") || message.includes("residence_lng")) {
          privateRows = await restSelect("employee_private", { token, select: "employee_id,passport" });
        } else {
          throw error;
        }
      }
    }
    const privateMap = (privateRows || []).reduce((acc, row) => ({
      ...acc,
      [row.employee_id]: {
        passport: row.passport || "",
        residenceAddress: row.residence_address || "",
        residenceLat: row.residence_lat ?? null,
        residenceLng: row.residence_lng ?? null,
      },
    }), {});
    let employeeScopesMap = {};
    try {
      const employeeScopesRaw = await restSelect("employee_service_scopes", {
        token,
        select: "employee_id,direction_id,subcategory_id,direction:direction_id(name),subcategory:subcategory_id(name)",
      });
      employeeScopesMap = normalizeEmployeeScopes(employeeScopesRaw || []);
    } catch (error) {
      console.warn("Employee scopes load fallback:", error);
    }
    const sources = await restSelect("sources", { token, select: "id,name", filters: { order: "name.asc" } });
    let legacyHourly = false;
    let ordersRaw;
    try {
      ordersRaw = await restSelect("orders", {
        token,
        select: "id,order_number,city_id,technician_id,created_by,source_id,direction_id,subcategory_id,order_date,time_slot,duration_slots,price,final_price,district,client_name,client_phone,address,lat,lng,comment,status,technician_confirmed_at,technician_confirmed_by,returned_to_office_at,returned_to_office_by,return_to_office_comment,office_attention_required,work_order,work_done,created_at,city:city_id(name),technician:technician_id(name),source:source_id(name),direction:direction_id(name),subcategory:subcategory_id(name),creator:created_by(name),technician_ack:technician_confirmed_by(name),return_author:returned_to_office_by(name)",
        filters: { order: "order_date.asc,time_slot.asc" },
      });
    } catch (error) {
      const message = `${error?.message || ""}`;
      if (message.includes("technician_confirmed_at") || message.includes("returned_to_office_at") || message.includes("office_attention_required") || message.includes("return_to_office_comment")) {
        try {
          ordersRaw = await restSelect("orders", {
            token,
            select: "id,order_number,city_id,technician_id,created_by,source_id,direction_id,subcategory_id,order_date,time_slot,duration_slots,price,final_price,district,client_name,client_phone,address,lat,lng,comment,status,work_order,work_done,created_at,city:city_id(name),technician:technician_id(name),source:source_id(name),direction:direction_id(name),subcategory:subcategory_id(name),creator:created_by(name)",
            filters: { order: "order_date.asc,time_slot.asc" },
          });
        } catch (fallbackError) {
          const fallbackMessage = `${fallbackError?.message || ""}`;
          if (fallbackMessage.includes("duration_slots")) {
            legacyHourly = true;
            try {
              ordersRaw = await restSelect("orders", {
                token,
                select: "id,order_number,city_id,technician_id,created_by,source_id,direction_id,subcategory_id,order_date,time_slot,price,final_price,district,client_name,client_phone,address,lat,lng,comment,status,work_order,work_done,created_at,city:city_id(name),technician:technician_id(name),source:source_id(name),direction:direction_id(name),subcategory:subcategory_id(name),creator:created_by(name)",
                filters: { order: "order_date.asc,time_slot.asc" },
              });
            } catch (legacyError) {
              const legacyMessage = `${legacyError?.message || ""}`;
              if (legacyMessage.includes("final_price") || legacyMessage.includes("order_number")) {
                ordersRaw = await restSelect("orders", {
                  token,
                  select: "id,city_id,technician_id,created_by,source_id,order_date,time_slot,price,district,client_name,client_phone,address,lat,lng,comment,status,work_order,work_done,created_at,city:city_id(name),technician:technician_id(name),source:source_id(name),creator:created_by(name)",
                  filters: { order: "order_date.asc,time_slot.asc" },
                });
              } else {
                throw legacyError;
              }
            }
          } else if (fallbackMessage.includes("final_price") || fallbackMessage.includes("order_number")) {
            ordersRaw = await restSelect("orders", {
              token,
              select: "id,city_id,technician_id,created_by,source_id,order_date,time_slot,duration_slots,price,district,client_name,client_phone,address,lat,lng,comment,status,work_order,work_done,created_at,city:city_id(name),technician:technician_id(name),source:source_id(name),creator:created_by(name)",
              filters: { order: "order_date.asc,time_slot.asc" },
            });
          } else {
            throw fallbackError;
          }
        }
      } else if (message.includes("duration_slots")) {
        legacyHourly = true;
        try {
          ordersRaw = await restSelect("orders", {
            token,
            select: "id,order_number,city_id,technician_id,created_by,source_id,direction_id,subcategory_id,order_date,time_slot,price,final_price,district,client_name,client_phone,address,lat,lng,comment,status,work_order,work_done,created_at,city:city_id(name),technician:technician_id(name),source:source_id(name),direction:direction_id(name),subcategory:subcategory_id(name),creator:created_by(name)",
            filters: { order: "order_date.asc,time_slot.asc" },
          });
        } catch (legacyError) {
          const legacyMessage = `${legacyError?.message || ""}`;
          if (legacyMessage.includes("final_price") || legacyMessage.includes("order_number")) {
            ordersRaw = await restSelect("orders", {
              token,
              select: "id,city_id,technician_id,created_by,source_id,order_date,time_slot,price,district,client_name,client_phone,address,lat,lng,comment,status,work_order,work_done,created_at,city:city_id(name),technician:technician_id(name),source:source_id(name),creator:created_by(name)",
              filters: { order: "order_date.asc,time_slot.asc" },
            });
          } else {
            throw legacyError;
          }
        }
      } else if (message.includes("final_price") || message.includes("order_number")) {
        ordersRaw = await restSelect("orders", {
          token,
          select: "id,city_id,technician_id,created_by,source_id,order_date,time_slot,duration_slots,price,district,client_name,client_phone,address,lat,lng,comment,status,work_order,work_done,created_at,city:city_id(name),technician:technician_id(name),source:source_id(name),creator:created_by(name)",
          filters: { order: "order_date.asc,time_slot.asc" },
        });
      } else {
        throw error;
      }
    }
    const dayOffsRaw = await restSelect("day_offs", {
      token,
      select: "technician_id,off_date,technician:technician_id(name,city:city_id(name))",
    });
    let orderItemsMap = {};
    try {
      const orderItemsRaw = await restSelect("order_service_items", {
        token,
        select: "id,order_id,service_id,quantity,unit_price,service:service_id(name)",
      });
      orderItemsMap = normalizeOrderItems(orderItemsRaw || []);
    } catch (error) {
      console.warn("Order items load fallback:", error);
    }
    const orders = normalizeOrders(ordersRaw || [], { legacyHourly, orderItemsMap });
    const historyRaw = await restSelect("order_history", {
      token,
      select: "id,order_id,action,field_name,old_value,new_value,meta,created_at,actor:actor_employee_id(name)",
      filters: { order: "created_at.desc" },
    });
    const ordersWithHistoryMeta = applyOrderHistoryMetadata(orders, historyRaw || []);
    let services = stored?.state?.services || defaults.services;
    let statuses = stored?.state?.statuses || defaults.statuses || DEFAULT_STATUSES;
    let contactStatuses = stored?.state?.contactStatuses || defaults.contactStatuses || DEFAULT_CONTACT_STATUSES;
    let contactReasons = stored?.state?.contactReasons || defaults.contactReasons || DEFAULT_CONTACT_REASONS;
    let contacts = stored?.state?.contacts || defaults.contacts || [];
    try {
      const servicesRaw = await restSelect("service_catalog", {
        token,
        select: "id,parent_id,node_type,name,price,sort_order",
        filters: { order: "sort_order.asc,created_at.asc" },
      });
      services = normalizeServices(servicesRaw || []);
    } catch (error) {
      console.warn("Service catalog load fallback:", error);
    }
    try {
      const statusesRaw = await restSelect("status_catalog", {
        token,
        select: "id,name,short_label,tone_key,sort_order",
        filters: { order: "sort_order.asc,created_at.asc" },
      });
      statuses = normalizeStatuses(statusesRaw || []);
    } catch (error) {
      console.warn("Status catalog load fallback:", error);
    }
    try {
      const contactStatusesRaw = await restSelect("contact_statuses", {
        token,
        select: "id,name,tone_key,sort_order,system_key,is_default",
        filters: { order: "sort_order.asc,created_at.asc" },
      });
      contactStatuses = normalizeContactStatuses(contactStatusesRaw || []);
    } catch (error) {
      console.warn("Contact statuses load fallback:", error);
    }
    try {
      const contactReasonsRaw = await restSelect("contact_reasons", {
        token,
        select: "id,name,contact_status_id,sort_order,status:contact_status_id(name)",
        filters: { order: "sort_order.asc,created_at.asc" },
      });
      contactReasons = normalizeContactReasons(contactReasonsRaw || []);
    } catch (error) {
      console.warn("Contact reasons load fallback:", error);
    }
    try {
      let contactsRaw;
      try {
        contactsRaw = await restSelect("contacts", {
          token,
          select: "id,name,phone,city_id,contact_status_id,contact_reason_id,comment,callback_date,created_at,updated_at,created_by,last_edited_by,assigned_employee_id,last_call_at,converted_order_id,city:city_id(name),status:contact_status_id(name),reason:contact_reason_id(name),creator:created_by(name),editor:last_edited_by(name),assigned:assigned_employee_id(name)",
          filters: { order: "created_at.desc" },
        });
      } catch (error) {
        const message = `${error?.message || ""}`;
        if (!message.includes("name")) throw error;
        contactsRaw = await restSelect("contacts", {
          token,
          select: "id,phone,city_id,contact_status_id,contact_reason_id,comment,callback_date,created_at,updated_at,created_by,last_edited_by,assigned_employee_id,last_call_at,converted_order_id,city:city_id(name),status:contact_status_id(name),reason:contact_reason_id(name),creator:created_by(name),editor:last_edited_by(name),assigned:assigned_employee_id(name)",
          filters: { order: "created_at.desc" },
        });
      }
      contacts = normalizeContacts(contactsRaw || []);
    } catch (error) {
      console.warn("Contacts load fallback:", error);
    }

    const normalizedCities = normalizeCities(cities || []);
    const preferredActiveCity = storedState.activeCity && normalizedCities[storedState.activeCity]
      ? storedState.activeCity
      : (defaults.activeCity && normalizedCities[defaults.activeCity] ? defaults.activeCity : (Object.keys(normalizedCities)[0] || "Краснодар"));
    const mergedVisibleStatusNames = Array.isArray(storedState.visibleStatusNames) && storedState.visibleStatusNames.length
      ? [...storedState.visibleStatusNames, ...(statuses || DEFAULT_STATUSES).map((status) => status.name).filter((name) => !storedState.visibleStatusNames.includes(name))]
      : (statuses || DEFAULT_STATUSES).map((status) => status.name);
    return {
      ...defaults,
      activeCity: preferredActiveCity,
      month: Number.isInteger(storedState.month) ? storedState.month : defaults.month,
      year: Number.isInteger(storedState.year) ? storedState.year : defaults.year,
      showSummary: Boolean(storedState.showSummary),
      showServiceCatalog: Boolean(storedState.showServiceCatalog),
      showDataView: Boolean(storedState.showDataView),
      showContactsView: Boolean(storedState.showContactsView),
      showOrdersExplorerView: Boolean(storedState.showOrdersExplorerView),
      visibleStatusNames: mergedVisibleStatusNames,
      cities: normalizedCities,
      employees: mergeEmployeeSchedules(normalizeEmployees(employeesRaw || [], privateMap, employeeScopesMap), storedState.employees || []),
      orders: ordersWithHistoryMeta,
      orderHistory: normalizeHistory(historyRaw || [], ordersWithHistoryMeta),
      dayOffs: normalizeDayOffs(dayOffsRaw || []),
      busySlots: normalizeBusySlots(await restSelect("busy_slots", {
        token,
        select: "technician_id,busy_date,time_slot,technician:technician_id(name,city:city_id(name))",
      }) || [], { legacyHourly }),
      slotLocks: normalizeSlotLocks(await restSelect("slot_locks", {
        token,
        select: "id,technician_id,order_date,time_slot,employee_id,employee_name,expires_at,technician:technician_id(name,city:city_id(name))",
      }).catch((error) => {
        console.warn("Slot locks load fallback:", error);
        return [];
      })),
      sources: (sources || []).map((row) => row.name),
      services,
      statuses,
      contacts,
      contactStatuses,
      contactReasons,
      deletedOrders: storedState.deletedOrders || defaults.deletedOrders || {},
      currentUser: currentUserRow ? {
        id: currentUserRow.id,
        name: currentUserRow.name,
        role: currentUserRow.employee_type,
        city: currentUserRow.city?.name || "",
        canViewTechnicianCards: Boolean(currentUserRow.can_view_technician_cards),
        lastSeen: currentUserRow.last_seen || null,
      } : {
        id: null,
        name: session.user?.email || "Пользователь",
        role: "call_center",
        city: "",
        canViewTechnicianCards: false,
        lastSeen: null,
      },
    };
  }
  return mergeSnapshot(defaults, readLocalSnapshot());
};

export const saveCrmState = async (state, session) => {
  writeLocalSnapshot(createCrmSnapshot(state));
};

const findCityId = (cities, cityName) => cities[cityName]?.id || null;

const findEmployee = (employees, { name, city, type = "technician" }) => employees.find((employee) => employee.name === name && employee.type === type && (type !== "technician" || employee.city === city));

const findSourceId = async (sources, sourceName, token, existingSourceId = null, existingSourceName = "") => {
  if (!sourceName) return null;
  if (existingSourceId && sourceName === existingSourceName) return existingSourceId;
  const source = sources.find((name) => name === sourceName);
  if (source) {
    const rows = await restSelect("sources", { token, select: "id,name", filters: { name: `eq.${sourceName}` } });
    return rows?.[0]?.id || null;
  }
  const inserted = await restInsert("sources", { name: sourceName }, { token });
  return inserted?.[0]?.id || null;
};

const insertHistoryRows = async (rows, token) => {
  if (!rows.length) return;
  await restInsert("order_history", rows, { token });
};

const ensureHourlyPlacement = ({ formData, existingOrder, snapshot }) => {
  const start = Number(formData.timeIdx);
  const duration = Math.max(1, Number(formData.durationSlots || DEFAULT_ORDER_DURATION_SLOTS));
  if (!Number.isInteger(start) || start < 0) throw new Error("Не выбрано время начала");
  const dayOffKey = dok(formData.city, formData.master, formData.dateStr);
  if (snapshot.dayOffs?.[dayOffKey]) {
    throw new Error("У мастера в этот день выходной.");
  }
  const technician = findEmployee(snapshot.employees || [], { name: formData.master, city: formData.city, type: "technician" });
  const schedule = normalizeWorkSchedule(technician?.workSchedule);
  const dayIdx = formData.dateStr ? new Date(`${formData.dateStr}T00:00:00`).getDay() : null;
  const scheduleActive = isScheduleActiveFromDate(technician, formData.dateStr);
  const existingAppliesToSlot = (idx) => existingOrder
    && existingOrder.city === formData.city
    && existingOrder.master === formData.master
    && existingOrder.dateStr === formData.dateStr
    && rangesOverlap(idx, 1, Number(existingOrder.timeIdx || 0), getDurationSlots(existingOrder));
  for (let idx = start; idx < start + duration; idx += 1) {
    if (scheduleActive && dayIdx != null && schedule[String(dayIdx)]?.[idx] === false && !existingAppliesToSlot(idx)) {
      throw new Error("В выбранном диапазоне у мастера нерабочее время.");
    }
    if (snapshot.busySlots?.[bok(formData.city, formData.master, formData.dateStr, idx)]) {
      throw new Error("В выбранном диапазоне есть занятые часы мастера.");
    }
  }
  Object.values(snapshot.orders || {}).forEach((order) => {
    if (!order || (existingOrder?._id && order._id === existingOrder._id)) return;
    if (order.city !== formData.city || order.master !== formData.master || order.dateStr !== formData.dateStr) return;
    if (rangesOverlap(start, duration, Number(order.timeIdx || 0), getDurationSlots(order))) {
      throw new Error("В выбранном диапазоне уже есть другой заказ.");
    }
  });
};

export const upsertOrder = async ({ formData, existingOrder, snapshot, session }) => {
  const token = session.access_token;
  const cityId = findCityId(snapshot.cities, formData.city);
  const technician = findEmployee(snapshot.employees, { name: formData.master, city: formData.city, type: "technician" });
  if (!cityId || !technician?.id) throw new Error("Не удалось определить город или мастера");
  if (formData.status === "Перезвонить" && !String(formData.callbackDate || "").trim()) {
    throw new Error("Для статуса «Перезвонить» нужно указать дату перезвона.");
  }
  ensureHourlyPlacement({ formData, existingOrder, snapshot });
  const isTechnicianActor = snapshot.currentUser?.role === "technician";
  const isAdminActor = snapshot.currentUser?.role === "admin";
  const isCallCenterActor = snapshot.currentUser?.role === "call_center";
  const statusChanged = String(existingOrder?.status ?? "") !== String(formData.status ?? "");
  if (isCallCenterActor && (formData.status === "Подтвержден мастером" || formData.status === "Возврат в офис")) {
    throw new Error("Колл-центр не может ставить статусы «Подтвержден мастером» и «Возврат в офис».");
  }
  if (isTechnicianActor && formData.status === "Подтвержден мастером" && existingOrder?.status !== "Подтверждён") {
    throw new Error("Мастер может подтвердить только заявку со статусом «Подтверждён».");
  }
  if (isTechnicianActor && formData.status === "Возврат в офис" && !(existingOrder?.status === "Подтвержден мастером" || existingOrder?.technicianConfirmedAt)) {
    throw new Error("Вернуть заявку в офис можно только после подтверждения мастером.");
  }
  if (!isTechnicianActor && !isAdminActor && formData.status === "Возврат в офис") {
    throw new Error("Статус «Возврат в офис» может ставить только мастер или админ.");
  }
  if (!isTechnicianActor && !isAdminActor && formData.status === "Подтвержден мастером") {
    throw new Error("Статус «Подтвержден мастером» может ставить только мастер или админ.");
  }
  let technicianConfirmedAt = formData.technicianConfirmedAt ?? existingOrder?.technicianConfirmedAt ?? null;
  let technicianConfirmedBy = formData.technicianConfirmedById ?? existingOrder?.technicianConfirmedById ?? null;
  let returnedToOfficeAt = formData.returnedToOfficeAt ?? existingOrder?.returnedToOfficeAt ?? null;
  let returnedToOfficeBy = formData.returnedToOfficeById ?? existingOrder?.returnedToOfficeById ?? null;
  let returnToOfficeComment = formData.returnToOfficeComment ?? existingOrder?.returnToOfficeComment ?? "";
  let officeAttentionRequired = formData.officeAttentionRequired ?? existingOrder?.officeAttentionRequired ?? false;

  if (statusChanged && !isTechnicianActor && formData.status === "Подтверждён") {
    technicianConfirmedAt = null;
    technicianConfirmedBy = null;
    returnedToOfficeAt = null;
    returnedToOfficeBy = null;
    returnToOfficeComment = "";
    officeAttentionRequired = false;
  }
  if (statusChanged && !isTechnicianActor && existingOrder?.status === "Возврат в офис" && formData.status !== "Возврат в офис") {
    returnedToOfficeAt = null;
    returnedToOfficeBy = null;
    returnToOfficeComment = "";
    officeAttentionRequired = false;
    if (["Новый", "Перенесён", "Подтверждён"].includes(formData.status)) {
      formData.comment = stripReturnCommentTag(formData.comment ?? existingOrder?.comment ?? "");
    }
  }
  if (formData.status === "Возврат в офис") {
    officeAttentionRequired = true;
  }
  const sourceId = await findSourceId(snapshot.sources, formData.source, token, existingOrder?._sourceId || null, existingOrder?.source || "");
  const callbackDate = formData.status === "Перезвонить" ? String(formData.callbackDate || "").trim() : "";
  const payload = {
    city_id: cityId,
    technician_id: technician.id,
    created_by: snapshot.currentUser?.id || null,
    direction_id: formData.serviceDirectionId || null,
    subcategory_id: formData.serviceSubcategoryId || null,
    order_date: formData.dateStr,
    time_slot: Number(formData.timeIdx),
    duration_slots: Math.max(1, Number(formData.durationSlots || DEFAULT_ORDER_DURATION_SLOTS)),
    price: formData.price || null,
    final_price: formData.finalPrice || null,
    district: formData.district || null,
    client_name: formData.name || null,
    client_phone: formData.phone || null,
    address: formData.address || null,
    lat: formData.lat || null,
    lng: formData.lng || null,
    comment: formData.comment || null,
    status: formData.status || "Новый",
    technician_confirmed_at: technicianConfirmedAt || null,
    technician_confirmed_by: technicianConfirmedBy || null,
    returned_to_office_at: returnedToOfficeAt || null,
    returned_to_office_by: returnedToOfficeBy || null,
    return_to_office_comment: returnToOfficeComment || null,
    office_attention_required: Boolean(officeAttentionRequired),
    source_id: sourceId,
    work_order: formData.workOrder || null,
    work_done: formData.workDone || null,
  };
  let saved;
  try {
    saved = existingOrder?._id
      ? await restPatch("orders", payload, { token, filters: { id: `eq.${existingOrder._id}` } })
      : await restInsert("orders", payload, { token });
  } catch (error) {
    const rawMessage = `${error?.message || ""}`;
    if (rawMessage.includes("duration_slots")) {
      throw new Error("Для почасовой сетки нужно выполнить SQL-файл supabase_hourly_slots.sql в Supabase SQL Editor.");
    }
    if (rawMessage.includes("technician_confirmed_at") || rawMessage.includes("returned_to_office_at") || rawMessage.includes("office_attention_required") || rawMessage.includes("return_to_office_comment")) {
      throw new Error("Для подтверждения мастером и возврата в офис нужно выполнить SQL-файл supabase_order_office_flow.sql в Supabase SQL Editor.");
    }
    if (rawMessage.includes("direction_id") || rawMessage.includes("subcategory_id")) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.direction_id;
      delete fallbackPayload.subcategory_id;
      saved = existingOrder?._id
        ? await restPatch("orders", fallbackPayload, { token, filters: { id: `eq.${existingOrder._id}` } })
        : await restInsert("orders", fallbackPayload, { token });
    } else
    if (rawMessage.includes("final_price")) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.final_price;
      saved = existingOrder?._id
        ? await restPatch("orders", fallbackPayload, { token, filters: { id: `eq.${existingOrder._id}` } })
        : await restInsert("orders", fallbackPayload, { token });
    } else {
    const message = `${error?.message || ""}`.toLowerCase();
    if (message.includes("orders_status_check") || message.includes("status")) {
      throw new Error("Для новых статусов заказа нужно выполнить SQL-файл supabase_status_catalog.sql в Supabase SQL Editor.");
    }
    if (message.includes("duplicate key") || message.includes("orders_technician_id_order_date_time_slot_key")) {
      throw new Error("Это окно уже занято другим заказом. Выбери свободное время.");
    }
    throw error;
    }
  }
  const savedRow = saved?.[0];
  try {
    await restDelete("order_service_items", { token, filters: { order_id: `eq.${savedRow.id}` } });
    const itemRows = (formData.serviceItems || [])
      .filter((item) => item.serviceId && Number(item.quantity || 0) > 0)
      .map((item) => ({
        order_id: savedRow.id,
        service_id: item.serviceId,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unitPrice || item.price || 0),
      }));
    if (itemRows.length) {
      await restInsert("order_service_items", itemRows, { token });
    }
  } catch (error) {
    if (!`${error?.message || ""}`.includes("order_service_items")) throw error;
  }
  const historyRows = [];
  if (!existingOrder?._id) {
    historyRows.push({
      order_id: savedRow.id,
      actor_employee_id: snapshot.currentUser?.id || null,
      action: "Создан заказ",
      meta: { details: `Клиент: ${formData.name || "—"}, адрес: ${formData.address || "—"}` },
    });
    if (callbackDate) {
      historyRows.push({
        order_id: savedRow.id,
        actor_employee_id: snapshot.currentUser?.id || null,
        action: "Изменение заказа",
        field_name: "Дата перезвона",
        old_value: "",
        new_value: callbackDate,
        meta: {},
      });
    }
  } else {
    const transferFields = new Set(["master", "dateStr", "timeIdx", "durationSlots"]);
    const transferChanged = (
      String(existingOrder.master ?? "") !== String(formData.master ?? "")
      || String(existingOrder.dateStr ?? "") !== String(formData.dateStr ?? "")
      || String(existingOrder.timeIdx ?? "") !== String(formData.timeIdx ?? "")
      || String(getDurationSlots(existingOrder)) !== String(formData.durationSlots ?? "")
    );
    if (transferChanged) {
      historyRows.push({
        order_id: savedRow.id,
        actor_employee_id: snapshot.currentUser?.id || null,
        action: "Перенос заказа",
        meta: {
          details: buildTransferHistoryDetails({
            master: existingOrder.master,
            dateStr: existingOrder.dateStr,
            timeIdx: existingOrder.timeIdx,
            durationSlots: getDurationSlots(existingOrder),
          }, {
            master: formData.master,
            dateStr: formData.dateStr,
            timeIdx: formData.timeIdx,
            durationSlots: formData.durationSlots,
          }),
        },
      });
    }
    if (statusChanged && formData.status === "Подтвержден мастером") {
      historyRows.push({
        order_id: savedRow.id,
        actor_employee_id: snapshot.currentUser?.id || null,
        action: "Подтверждено мастером",
        meta: {
          details: `${snapshot.currentUser?.name || "Мастер"} подтвердил, что увидел заявку`,
        },
      });
    }
    if (statusChanged && formData.status === "Возврат в офис") {
      historyRows.push({
        order_id: savedRow.id,
        actor_employee_id: snapshot.currentUser?.id || null,
        action: "Возврат в офис",
        meta: {
          details: `Причина возврата: ${returnToOfficeComment || "—"}`,
        },
      });
    }
    [
      ["status", "Статус"],
      ["callbackDate", "Дата перезвона"],
      ["master", "Мастер"],
      ["dateStr", "Дата"],
      ["timeIdx", "Время"],
      ["durationSlots", "Длительность"],
      ["price", "Стоимость"],
      ["finalPrice", "Окончательная стоимость"],
      ["address", "Адрес"],
      ["comment", "Комментарий"],
      ["workOrder", "Заказ работ"],
    ].forEach(([field, label]) => {
      if (transferChanged && transferFields.has(field)) return;
      if ((formData.status === "Подтвержден мастером" || formData.status === "Возврат в офис") && field === "status") return;
      if (formData.status === "Возврат в офис" && field === "comment") return;
      if (String(existingOrder[field] ?? "") !== String(formData[field] ?? "")) {
        historyRows.push({
          order_id: savedRow.id,
          actor_employee_id: snapshot.currentUser?.id || null,
          action: "Изменение заказа",
          field_name: label,
          old_value: String(existingOrder[field] ?? ""),
          new_value: String(formData[field] ?? ""),
          meta: field === "timeIdx" ? {
            old_duration_slots: getDurationSlots(existingOrder),
            duration_slots: Math.max(1, Number(formData.durationSlots || DEFAULT_ORDER_DURATION_SLOTS)),
          } : {},
        });
      }
    });
  }
  insertHistoryRows(historyRows, token).catch((error) => {
    console.error("Order history insert failed:", error);
  });
  return {
    savedRow,
    historyRows,
  };
};

export const deleteOrder = async ({ orderId, session }) => {
  await restDelete("orders", { token: session.access_token, filters: { id: `eq.${orderId}` } });
};

export const buildReturnToOfficeOrderPatch = ({ order, reason, currentUser }) => {
  const trimmedReason = String(reason || "").trim();
  return {
    ...order,
    status: "Возврат в офис",
    returnedToOfficeAt: new Date().toISOString(),
    returnedToOfficeById: currentUser?.id || null,
    returnedToOfficeByName: currentUser?.name || "",
    returnToOfficeComment: trimmedReason,
    officeAttentionRequired: true,
    technicianConfirmedAt: null,
    technicianConfirmedById: null,
    technicianConfirmedByName: "",
    comment: mergeReturnComment({
      baseComment: order?.comment || "",
      returnComment: trimmedReason,
      technicianName: currentUser?.name || "",
    }),
  };
};

export const updateEmployeePermissions = async ({ employeeId, canViewTechnicianCards, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Настройка прав доступна только админу");
  await restPatch("employees", {
    can_view_technician_cards: Boolean(canViewTechnicianCards),
  }, { token: session.access_token, filters: { id: `eq.${employeeId}` } });
};

export const upsertEmployee = async ({ employee, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Редактирование сотрудников доступно только админу");
  const token = session.access_token;
  const cityRows = employee.city ? await restSelect("cities", { token, select: "id,name", filters: { name: `eq.${employee.city}` } }) : [];
  const payload = {
    name: employee.name,
    employee_type: employee.type,
    city_id: cityRows?.[0]?.id || null,
    color: employee.color,
    phone: employee.phone || null,
  };
  const inserted = employee.id
    ? await restPatch("employees", payload, { token, filters: { id: `eq.${employee.id}` } })
    : await restInsert("employees", payload, { token });
  const employeeId = inserted?.[0]?.id || employee.id;
  if (employee.passport) {
    await restUpsert("employee_private", {
      employee_id: employeeId,
      passport: employee.passport,
    }, { token, onConflict: "employee_id" });
  } else if (!employee.residenceAddress && employee.id) {
    await restDelete("employee_private", { token, filters: { employee_id: `eq.${employee.id}` } }).catch(() => {});
  }
  if (employee.passport || employee.residenceAddress) {
    try {
      await restUpsert("employee_private", {
        employee_id: employeeId,
        passport: employee.passport || null,
        residence_address: employee.residenceAddress || null,
        residence_lat: employee.residenceLat ?? null,
        residence_lng: employee.residenceLng ?? null,
      }, { token, onConflict: "employee_id" });
    } catch (error) {
      const message = `${error?.message || ""}`;
      if (message.includes("residence_address") || message.includes("residence_lat") || message.includes("residence_lng")) {
        await restUpsert("employee_private", {
          employee_id: employeeId,
          passport: employee.passport || null,
        }, { token, onConflict: "employee_id" });
      } else {
        throw error;
      }
    }
  } else if (employee.id) {
    await restDelete("employee_private", { token, filters: { employee_id: `eq.${employee.id}` } }).catch(() => {});
  }
  try {
    await restDelete("employee_service_scopes", { token, filters: { employee_id: `eq.${employeeId}` } });
    const scopeRows = (employee.serviceScopes || []).map((scope) => ({
      employee_id: employeeId,
      direction_id: scope.directionId,
      subcategory_id: scope.subcategoryId,
    }));
    if (scopeRows.length) {
      await restInsert("employee_service_scopes", scopeRows, { token });
    }
  } catch (error) {
    if (!`${error?.message || ""}`.includes("employee_service_scopes")) throw error;
  }
  return inserted?.[0] || null;
};

export const deleteEmployee = async ({ employeeId, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Удаление сотрудников доступно только админу");
  await restDelete("employees", { token: session.access_token, filters: { id: `eq.${employeeId}` } });
};

export const createCity = async ({ name, color, lat = 55, lng = 37, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Добавление городов доступно только админу");
  await restInsert("cities", { name, color, lat, lng }, { token: session.access_token });
};

export const createStatus = async ({ name, shortLabel, tone = "sky", sortOrder = 0, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Редактирование статусов доступно только админу");
  try {
    await restInsert("status_catalog", {
      name,
      short_label: shortLabel,
      tone_key: tone,
      sort_order: sortOrder,
    }, { token: session.access_token });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.includes("status_catalog") || message.toLowerCase().includes("orders_status_check")) {
      throw new Error("Для управления статусами нужно выполнить SQL-файл supabase_status_catalog.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const createContactStatus = async ({ name, tone = "blue", sortOrder = 0, systemKey = null, isDefault = false, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Редактирование статусов контактов доступно только админу");
  try {
    await restInsert("contact_statuses", {
      name,
      tone_key: tone,
      sort_order: sortOrder,
      system_key: systemKey,
      is_default: isDefault,
    }, { token: session.access_token });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.includes("contact_statuses")) {
      throw new Error("Для контактов нужно выполнить SQL-файл supabase_contacts.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const deleteContactStatus = async ({ name, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Удаление статусов контактов доступно только админу");
  const token = session?.access_token;
  try {
    const statusRows = await restSelect("contact_statuses", {
      token,
      select: "id,name",
      filters: { name: `eq.${name}` },
    });
    const statusId = statusRows?.[0]?.id;
    const used = statusId
      ? await restSelect("contacts", { token, select: "id", filters: { contact_status_id: `eq.${statusId}`, limit: 1 } })
      : [];
    if (Array.isArray(used) && used.length) {
      throw new Error("Этот статус контакта уже используется. Сначала переведи контакты в другой статус.");
    }
  } catch (error) {
    if (`${error?.message || ""}`.includes("уже используется")) throw error;
  }
  try {
    await restDelete("contact_statuses", { token, filters: { name: `eq.${name}` } });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.includes("contact_statuses")) {
      throw new Error("Для контактов нужно выполнить SQL-файл supabase_contacts.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const createContactReason = async ({ name, contactStatusId, sortOrder = 0, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Редактирование причин контактов доступно только админу");
  try {
    await restInsert("contact_reasons", {
      name,
      contact_status_id: contactStatusId,
      sort_order: sortOrder,
    }, { token: session.access_token });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.includes("contact_reasons")) {
      throw new Error("Для контактов нужно выполнить SQL-файл supabase_contacts.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const deleteContactReason = async ({ reasonId, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Удаление причин контактов доступно только админу");
  try {
    await restDelete("contact_reasons", { token: session.access_token, filters: { id: `eq.${reasonId}` } });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.includes("contact_reasons")) {
      throw new Error("Для контактов нужно выполнить SQL-файл supabase_contacts.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const upsertContact = async ({ contact, cities, currentUser, contactStatuses, contactReasons, session }) => {
  const token = session?.access_token;
  const cityId = contact.city ? (cities[contact.city]?.id || null) : null;
  const statusItem = (contactStatuses || []).find((item) => item.name === contact.status);
  const reasonItem = (contactReasons || []).find((item) => item.name === contact.reason && item.statusName === contact.status);
  const payload = {
    name: contact.name || null,
    phone: contact.phone,
    city_id: cityId,
    contact_status_id: statusItem?.id || null,
    contact_reason_id: reasonItem?.id || null,
    comment: contact.comment || "",
    callback_date: contact.callbackDate || null,
    assigned_employee_id: contact.assignedToId || currentUser?.id || null,
    created_by: contact.id ? undefined : currentUser?.id || null,
    last_edited_by: currentUser?.id || null,
    last_call_at: contact.lastCallAt || null,
    converted_order_id: contact.convertedOrderId || null,
  };
  const sanitized = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  try {
    if (contact.id) {
      const rows = await restPatch("contacts", sanitized, { token, filters: { id: `eq.${contact.id}` } });
      return rows?.[0] || null;
    }
    const rows = await restInsert("contacts", sanitized, { token });
    return rows?.[0] || null;
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.includes("требуется дата перезвона")) {
      throw new Error("Для статуса «Перезвонить» нужно указать дату перезвона.");
    }
    if (message.includes("Причина не принадлежит")) {
      throw new Error("Выбранная причина не подходит для текущего статуса контакта.");
    }
    if (
      message.includes("contacts")
      || message.includes("contact_statuses")
      || message.includes("contact_reasons")
      || message.includes("callback_date")
    ) {
      throw new Error("Для контактов нужно выполнить SQL-файл supabase_contacts.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const deleteContact = async ({ contactId, session }) => {
  if (!contactId) throw new Error("Нет идентификатора контакта");
  const token = session?.access_token;
  if (!token) throw new Error("Нет активной сессии для удаления контакта");
  try {
    await restDelete("contacts", { token, filters: { id: `eq.${contactId}` } });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.includes("contacts")) {
      throw new Error("Для контактов нужно выполнить SQL-файл supabase_contacts.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const deleteStatus = async ({ name, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Удаление статусов доступно только админу");
  const token = session?.access_token;
  try {
    const usedOrders = await restSelect("orders", {
      token,
      select: "id",
      filters: { status: `eq.${name}`, limit: 1 },
    });
    if (Array.isArray(usedOrders) && usedOrders.length) {
      throw new Error("Этот статус уже используется в заказах. Сначала переведи такие заявки в другой статус.");
    }
    await restDelete("status_catalog", { token, filters: { name: `eq.${name}` } });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.includes("status_catalog") || message.toLowerCase().includes("orders_status_check")) {
      throw new Error("Для управления статусами нужно выполнить SQL-файл supabase_status_catalog.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const deleteCity = async ({ name, mode = "with_employees", currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Удаление городов доступно только админу");
  const token = session?.access_token;
  if (!token) throw new Error("Нет активной сессии для удаления города");

  const cityRows = await restSelect("cities", {
    token,
    select: "id,name",
    filters: { name: `eq.${name}` },
  });
  const cityId = cityRows?.[0]?.id;
  if (!cityId) return;

  const cityEmployees = await restSelect("employees", {
    token,
    select: "id,employee_type",
    filters: { city_id: `eq.${cityId}` },
  });
  const technicianIds = (cityEmployees || [])
    .filter((employee) => employee.employee_type === "technician")
    .map((employee) => employee.id);

  if (mode === "city_only" && technicianIds.length) {
    throw new Error("Нельзя удалить город отдельно, пока в нём есть мастера. Выбери удаление города вместе с мастерами.");
  }

  await restDelete("orders", { token, filters: { city_id: `eq.${cityId}` } });

  if (mode === "with_employees" && technicianIds.length) {
    const employeesFilter = `in.(${technicianIds.join(",")})`;
    await restDelete("busy_slots", { token, filters: { technician_id: employeesFilter } }).catch(() => {});
    await restDelete("day_offs", { token, filters: { technician_id: employeesFilter } }).catch(() => {});
    await restDelete("employee_private", { token, filters: { employee_id: employeesFilter } }).catch(() => {});
    await restDelete("employee_service_scopes", { token, filters: { employee_id: employeesFilter } }).catch(() => {});
    await restDelete("employees", { token, filters: { id: employeesFilter } });
  }

  await restDelete("cities", { token, filters: { id: `eq.${cityId}` } });
};

export const createSource = async ({ name, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Редактирование источников доступно только админу");
  try {
    await restInsert("sources", { name }, { token: session.access_token });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.toLowerCase().includes("row-level security")) {
      throw new Error("Для управления источниками нужно выполнить SQL-файл supabase_sources_admin_policy.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const updateSource = async ({ previousName, nextName, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Редактирование источников доступно только админу");
  try {
    await restPatch("sources", { name: nextName }, { token: session.access_token, filters: { name: `eq.${previousName}` } });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.toLowerCase().includes("row-level security")) {
      throw new Error("Для управления источниками нужно выполнить SQL-файл supabase_sources_admin_policy.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const deleteSource = async ({ name, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Удаление источников доступно только админу");
  try {
    await restDelete("sources", { token: session.access_token, filters: { name: `eq.${name}` } });
  } catch (error) {
    const message = `${error?.message || ""}`;
    if (message.toLowerCase().includes("row-level security")) {
      throw new Error("Для управления источниками нужно выполнить SQL-файл supabase_sources_admin_policy.sql в Supabase SQL Editor.");
    }
    throw error;
  }
};

export const touchPresence = async ({ session }) => {
  if (!session?.access_token) return null;
  return restRpc("touch_presence", { token: session.access_token, body: {} });
};

export const loadEmployeePresence = async ({ session }) => {
  if (!session?.access_token) return [];
  return restSelect("employees", {
    token: session.access_token,
    select: "id,auth_user_id,auth_email,last_seen",
    filters: { order: "created_at.asc" },
  });
};

export const provisionEmployeeAccess = async ({ employeeId, email, password, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Выдавать доступ может только админ");
  return invokeFunction("create-employee-access", {
    body: {
      employeeId,
      email,
      password,
      requesterUserId: session?.user?.id || null,
    },
  });
};

export const updateEmployeeAccess = async ({ employeeId, email, password, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Менять доступ может только админ");
  return invokeFunction("update-employee-access", {
    body: {
      employeeId,
      email,
      password,
      requesterUserId: session?.user?.id || null,
    },
  });
};

export const toggleDayOffRemote = async ({ activeCity, masterName, dateStr, employees, session }) => {
  const token = session.access_token;
  const technician = findEmployee(employees, { name: masterName, city: activeCity, type: "technician" });
  if (!technician?.id) throw new Error("Мастер не найден");
  const existing = await restSelect("day_offs", {
    token,
    select: "technician_id,off_date",
    filters: { technician_id: `eq.${technician.id}`, off_date: `eq.${dateStr}` },
  });
  if (existing?.length) {
    await restDelete("day_offs", { token, filters: { technician_id: `eq.${technician.id}`, off_date: `eq.${dateStr}` } });
  } else {
    await restInsert("day_offs", { technician_id: technician.id, off_date: dateStr }, { token });
  }
};

export const toggleBusySlotRemote = async ({ activeCity, masterName, dateStr, timeIdx, employees, session }) => {
  const token = session.access_token;
  const technician = findEmployee(employees, { name: masterName, city: activeCity, type: "technician" });
  if (!technician?.id) throw new Error("Мастер не найден");
  const existing = await restSelect("busy_slots", {
    token,
    select: "technician_id,busy_date,time_slot",
    filters: {
      technician_id: `eq.${technician.id}`,
      busy_date: `eq.${dateStr}`,
      time_slot: `eq.${Number(timeIdx)}`,
    },
  });
  if (existing?.length) {
    await restDelete("busy_slots", {
      token,
      filters: {
        technician_id: `eq.${technician.id}`,
        busy_date: `eq.${dateStr}`,
        time_slot: `eq.${Number(timeIdx)}`,
      },
    });
  } else {
    await restInsert("busy_slots", {
      technician_id: technician.id,
      busy_date: dateStr,
      time_slot: Number(timeIdx),
    }, { token });
  }
};

const buildSlotLockRows = ({ technicianId, dateStr, startTimeIdx, durationSlots, employeeId, employeeName, expiresAt }) => {
  const duration = Math.max(1, Number(durationSlots || 1));
  return Array.from({ length: duration }, (_, idx) => ({
    technician_id: technicianId,
    order_date: dateStr,
    time_slot: Number(startTimeIdx) + idx,
    employee_id: employeeId || null,
    employee_name: employeeName || "Сотрудник",
    expires_at: expiresAt,
  }));
};

export const syncSlotLocksRemote = async ({ activeCity, masterName, dateStr, timeIdx, durationSlots, employees, currentUser, session }) => {
  const token = session?.access_token;
  if (!token) return [];
  const technician = findEmployee(employees, { name: masterName, city: activeCity, type: "technician" });
  if (!technician?.id) throw new Error("Мастер не найден");
  if (!dateStr || timeIdx === "" || timeIdx === null || timeIdx === undefined) throw new Error("Не выбраны дата и время");

  const duration = Math.max(1, Number(durationSlots || 1));
  const start = Number(timeIdx);
  const slotList = Array.from({ length: duration }, (_, idx) => start + idx);
  const slotFilter = `in.(${slotList.join(",")})`;
  const existing = await restSelect("slot_locks", {
    token,
    select: "id,technician_id,order_date,time_slot,employee_id,employee_name,expires_at",
    filters: {
      technician_id: `eq.${technician.id}`,
      order_date: `eq.${dateStr}`,
      time_slot: slotFilter,
    },
  }).catch(() => []);

  const now = Date.now();
  const expiredIds = [];
  for (const row of existing || []) {
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (!expiresAt || expiresAt <= now) expiredIds.push(row.id);
  }
  if (expiredIds.length) {
    await restDelete("slot_locks", { token, filters: { id: `in.(${expiredIds.join(",")})` } }).catch(() => {});
  }

  const activeExisting = (existing || []).filter((row) => {
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    return expiresAt > now;
  });
  const conflict = activeExisting.find((row) => row.employee_id && row.employee_id !== currentUser?.id);
  if (conflict) {
    throw new Error(`${conflict.employee_name || "Другой сотрудник"} уже оформляет этот слот`);
  }

  const expiresAt = new Date(now + SLOT_LOCK_TTL_MS).toISOString();
  const rows = buildSlotLockRows({
    technicianId: technician.id,
    dateStr,
    startTimeIdx: start,
    durationSlots: duration,
    employeeId: currentUser?.id || null,
    employeeName: currentUser?.name || "Сотрудник",
    expiresAt,
  });
  await restUpsert("slot_locks", rows, {
    token,
    onConflict: "technician_id,order_date,time_slot",
  });
  return rows;
};

export const releaseSlotLocksRemote = async ({ activeCity, masterName, dateStr, timeIdx, durationSlots, employees, currentUser, session }) => {
  const token = session?.access_token;
  if (!token || !dateStr || timeIdx === "" || timeIdx === null || timeIdx === undefined) return;
  const technician = findEmployee(employees, { name: masterName, city: activeCity, type: "technician" });
  if (!technician?.id) return;
  const duration = Math.max(1, Number(durationSlots || 1));
  const start = Number(timeIdx);
  const slotList = Array.from({ length: duration }, (_, idx) => start + idx);
  await restDelete("slot_locks", {
    token,
    filters: {
      technician_id: `eq.${technician.id}`,
      order_date: `eq.${dateStr}`,
      time_slot: `in.(${slotList.join(",")})`,
      employee_id: currentUser?.id ? `eq.${currentUser.id}` : undefined,
    },
  }).catch(() => {});
};

export const releaseCurrentUserSlotLocksRemote = async ({ currentUser, session }) => {
  const token = session?.access_token;
  if (!token || !currentUser?.id) return;
  await restDelete("slot_locks", {
    token,
    filters: {
      employee_id: `eq.${currentUser.id}`,
    },
  }).catch(() => {});
};

export const upsertServiceNode = async ({ node, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Справочник услуг редактирует только админ");
  if (!session?.access_token) return null;
  const payload = {
    parent_id: node.parentId || null,
    node_type: node.type,
    name: node.name,
    price: node.type === "service" ? Number(node.price || 0) : null,
    sort_order: Number(node.sortOrder || 0),
  };
  const saved = node.id
    ? await restPatch("service_catalog", payload, { token: session.access_token, filters: { id: `eq.${node.id}` } })
    : await restInsert("service_catalog", payload, { token: session.access_token });
  return saved?.[0] || null;
};

export const deleteServiceNode = async ({ nodeId, currentUserRole, session }) => {
  if (currentUserRole !== "admin") throw new Error("Справочник услуг редактирует только админ");
  if (!session?.access_token) return;
  await restDelete("service_catalog", { token: session.access_token, filters: { id: `eq.${nodeId}` } });
};
