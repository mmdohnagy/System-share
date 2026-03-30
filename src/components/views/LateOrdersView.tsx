import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_URL, cn, formatDate, safeJson } from '../../lib/utils';
import { Clock, Send, CheckCircle2, XCircle, AlertCircle, Search, Filter, MessageSquare, RefreshCw, Eye, Download } from 'lucide-react';
import { Brand, Branch, LateOrderRequest, CallCenterFormField, CallCenterFieldOption } from '../../types';
import * as XLSX from 'xlsx';

import { useFetch } from '../../hooks/useFetch';

export default function LateOrdersView() {
  const { lang, user } = useAuth();
  const { fetchWithAuth } = useFetch();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [lateOrders, setLateOrders] = useState<LateOrderRequest[]>([]);
  const [dynamicFields, setDynamicFields] = useState<CallCenterFormField[]>([]);
  const [fieldOptions, setFieldOptions] = useState<CallCenterFieldOption[]>([]);
  const [technicalTypes, setTechnicalTypes] = useState<{id: number, name_en: string, name_ar: string}[]>([]);
  const [platforms, setPlatforms] = useState<{id: number, name_en: string, name_ar: string}[]>([]);
  const [caseTypes, setCaseTypes] = useState<{id: number, name_en: string, name_ar: string}[]>([]);
  const [dynamicValues, setDynamicValues] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Search and Filter State
  const [searchPhone, setSearchPhone] = useState('');
  const [searchOrderId, setSearchOrderId] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<'standard' | 'restaurant'>('standard');

  // Form State
  const [form, setForm] = useState({
    brand_id: '',
    branch_id: '',
    customer_name: '',
    customer_phone: '',
    order_id: '',
    platform: '',
    call_center_message: '',
    case_type: '',
    technical_type: '',
    dedication_time: '',
  });

  // Response State
  const [responseForm, setResponseForm] = useState<{ id: number | null, status: 'Approved' | 'Rejected' | '', message: string }>({
    id: null,
    status: '',
    message: ''
  });

  const fetchData = async () => {
    try {
      const [bRes, loRes, configRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/brands`),
        fetchWithAuth(`${API_URL}/late-orders`),
        fetchWithAuth(`${API_URL}/call-center/config`)
      ]);
      
      if (bRes.ok) {
        const data = await safeJson(bRes);
        setBrands(Array.isArray(data) ? data : []);
      }
      if (loRes.ok) {
        const data = await safeJson(loRes);
        setLateOrders(Array.isArray(data) ? data : []);
      }
      if (configRes.ok) {
        const data = await safeJson(configRes);
        if (data && Array.isArray(data.fields)) {
          setDynamicFields(data.fields.filter((f: any) => f.is_active));
        } else {
          setDynamicFields([]);
        }
        if (data && Array.isArray(data.options)) {
          setFieldOptions(data.options);
        } else {
          setFieldOptions([]);
        }
        if (data && Array.isArray(data.technicalTypes)) {
          setTechnicalTypes(data.technicalTypes);
        } else {
          setTechnicalTypes([]);
        }
        if (data && Array.isArray(data.platforms)) {
          setPlatforms(data.platforms);
        } else {
          setPlatforms([]);
        }
        if (data && Array.isArray(data.caseTypes)) {
          setCaseTypes(data.caseTypes);
        } else {
          setCaseTypes([]);
        }
      }
    } catch (err: any) {
      if (err.isAuthError) return;
      console.error("Failed to fetch data", err);
    }
  };

  const fetchBranches = async (brandId: string) => {
    if (!brandId) {
      setBranches([]);
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_URL}/branches?brand_id=${brandId}`);
      if (res.ok) {
        const data = await safeJson(res);
        setBranches(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      if (err.isAuthError) return;
      console.error("Failed to fetch branches", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (brands.length === 1 && !form.brand_id) {
      setForm(prev => ({ ...prev, brand_id: brands[0].id.toString() }));
    }
  }, [brands]);

  useEffect(() => {
    if (branches.length === 1 && !form.branch_id) {
      setForm(prev => ({ ...prev, branch_id: branches[0].id.toString() }));
    }
  }, [branches]);

  useEffect(() => {
    if (form.brand_id) {
      fetchBranches(form.brand_id);
    }
  }, [form.brand_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        dynamic_values: dynamicValues,
        dedication_time: form.dedication_time ? new Date(form.dedication_time).toISOString() : null
      };
      const res = await fetchWithAuth(`${API_URL}/late-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

          if (res.ok) {
        setForm({
          brand_id: '',
          branch_id: '',
          customer_name: '',
          customer_phone: '',
          order_id: '',
          platform: '',
          call_center_message: '',
          case_type: '',
          technical_type: '',
          dedication_time: '',
        });
        setDynamicValues({});
        setShowForm(false);
        fetchData();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Error submitting case');
      }
    } catch (error: any) {
      if (error.isAuthError) return;
      console.error('Error submitting case:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!responseForm.id || !responseForm.status) return;

    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/late-orders/${responseForm.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: responseForm.status,
          restaurant_message: responseForm.message
        })
      });

      if (res.ok) {
        setResponseForm({ id: null, status: '', message: '' });
        fetchData();
      }
    } catch (error: any) {
      if (error.isAuthError) return;
      console.error('Error updating case:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCallCenter = user?.role_name === 'Call Center';
  const isRestaurant = user?.role_name === 'Restaurants';
  const isTechnicalBackOffice = user?.role_name === 'Technical Back Office';
  const isManager = user?.role_name === 'Manager' || user?.role_name === 'Super Visor';

  useEffect(() => {
    if (isTechnicalBackOffice && !form.case_type) {
      setForm(prev => ({ ...prev, case_type: 'Technical' }));
    }
  }, [isTechnicalBackOffice, form.case_type]);

  const t = {
    en: {
      title: "Call Center Cases",
      newRequest: "New Case",
      customerName: "Customer Name",
      customerPhone: "Customer Phone",
      orderId: "Order ID",
      platform: "Platform",
      brand: "Brand",
      branch: "Branch",
      callCenterMessage: "Call Center Message",
      caseType: "Case",
      technicalType: "Type Case",
      dedicationTime: "Dedication Time",
      submit: "Send Case",
      status: "Status",
      message: "Restaurant Message",
      history: "Case History",
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
      respond: "Respond to Case",
      writeMessage: "Write a message to the call center...",
      approve: "Approve",
      reject: "Reject",
      cancel: "Cancel",
      viewedAt: "Restaurant Viewed At",
      respondedAt: "Responded At",
      restaurantResponse: "Restaurant Response Time",
      managerResponse: "Manager Response Time",
      downloadExcel: "Download Excel",
      restaurantRequests: isRestaurant ? "Requests" : "Restaurant Requests",
      standardCases: isRestaurant ? "Standard" : "Standard Cases"
    },
    ar: {
      title: "حالات مركز الاتصال",
      newRequest: "حالة جديدة",
      customerName: "اسم العميل",
      customerPhone: "رقم العميل",
      orderId: "رقم الطلب",
      platform: "المنصة",
      brand: "العلامة التجارية",
      branch: "الفرع",
      callCenterMessage: "رسالة مركز الاتصال",
      caseType: "الحالة",
      technicalType: "نوع الحالة التقنية",
      dedicationTime: "وقت الإهداء",
      submit: "إرسال الحالة",
      status: "الحالة",
      message: "رسالة المطعم",
      history: "سجل الحالات",
      pending: "قيد الانتظار",
      approved: "تم القبول",
      rejected: "تم الرفض",
      respond: "الرد على الحالة",
      writeMessage: "اكتب رسالة للكول سنتر...",
      approve: "قبول",
      reject: "رفض",
      cancel: "إلغاء",
      viewedAt: "وقت مشاهدة المطعم",
      respondedAt: "وقت الرد",
      restaurantResponse: "وقت رد المطعم",
      managerResponse: "وقت رد المدير",
      downloadExcel: "تحميل إكسيل",
      restaurantRequests: isRestaurant ? "المستلمة" : "ريكوستات المطعم",
      standardCases: isRestaurant ? "المرسلة" : "الحالات العادية"
    }
  }[lang];

  const handleView = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/late-orders/${id}/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  };

  const toggleExpand = (id: number, request: LateOrderRequest) => {
    const isExpanded = expandedOrders.includes(id);
    if (!isExpanded) {
      setExpandedOrders([...expandedOrders, id]);
      if (isRestaurant && !request.restaurant_viewed_at) {
        handleView(id);
      } else if (isManager && !request.manager_viewed_at) {
        handleView(id);
      }
    } else {
      setExpandedOrders(expandedOrders.filter(oid => oid !== id));
    }
  };

  const exportToExcel = () => {
    const data = lateOrders.map(order => ({
      'Order ID': order.order_id,
      'Status': order.status,
      'Case Type': order.case_type,
      'Technical Type': order.technical_type || '',
      'Brand': order.brand_name,
      'Branch': order.branch_name,
      'Platform': order.platform,
      'Customer Name': order.customer_name,
      'Customer Phone': order.customer_phone,
      'Call Center Message': order.call_center_message || '',
      'Restaurant Message': order.restaurant_message || '',
      'Requested At (Call Center)': formatDate(order.created_at),
      'Restaurant Viewed At': order.restaurant_viewed_at ? formatDate(order.restaurant_viewed_at) : 'Not Viewed',
      'Restaurant Responded At': order.restaurant_response_at ? formatDate(order.restaurant_response_at) : 'No Response',
      'Manager Viewed At': order.manager_viewed_at ? formatDate(order.manager_viewed_at) : 'Not Viewed',
      'Manager Responded At': order.manager_responded_at ? formatDate(order.manager_responded_at) : 'No Response',
      'Dedication Time': order.dedication_time ? formatDate(order.dedication_time) : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Late Orders");
    
    // Use Kuwait date for filename
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
    XLSX.writeFile(workbook, `Late_Orders_${dateStr}.xlsx`);
  };

  const filteredOrders = lateOrders.filter(order => {
    const matchesPhone = order.customer_phone.toLowerCase().includes(searchPhone.toLowerCase());
    const matchesOrderId = order.order_id.toLowerCase().includes(searchOrderId.toLowerCase());
    const matchesBrand = filterBrand === '' || order.brand_id.toString() === filterBrand;
    
    if (isCallCenter || isTechnicalBackOffice) {
      const isRestaurantRequest = order.creator_role === 'Restaurants';
      if (activeTab === 'restaurant') return matchesPhone && matchesOrderId && matchesBrand && isRestaurantRequest;
      return matchesPhone && matchesOrderId && matchesBrand && !isRestaurantRequest;
    }

    if (isRestaurant) {
      const isRestaurantRequest = order.creator_role === 'Restaurants';
      // Standard: Sent by restaurant
      if (activeTab === 'standard') return matchesPhone && matchesOrderId && matchesBrand && isRestaurantRequest;
      // Requests: Received by restaurant (from call center)
      if (activeTab === 'restaurant') return matchesPhone && matchesOrderId && matchesBrand && !isRestaurantRequest;
    }
    
    return matchesPhone && matchesOrderId && matchesBrand;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-black text-zinc-900 dark:text-white tracking-tight">
            {lang === 'en' ? 'Call Center' : 'حالات مركز'} <span className="text-brand">{lang === 'en' ? 'Cases' : 'الاتصال'}</span>
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm mt-0.5">{lang === 'en' ? 'Track and manage delayed orders' : 'تتبع وإدارة الطلبات المتأخرة'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.play();
                alert(lang === 'en' ? "Sound test triggered!" : "تم تشغيل اختبار الصوت!");
              } catch (e) {
                alert("Error playing sound: " + e);
              }
            }}
            className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
          >
            <Clock size={18} />
            {lang === 'en' ? 'Test Sound' : 'اختبار الصوت'}
          </button>
          {isManager && (
            <button
              onClick={exportToExcel}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
            >
              <Download size={18} />
              {t.downloadExcel}
            </button>
          )}
          {(isCallCenter || isRestaurant || isTechnicalBackOffice) && (
            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('standard')}
                className={cn(
                  "px-4 py-1.5 rounded-lg font-bold text-xs transition-all",
                  activeTab === 'standard' 
                    ? "bg-white dark:bg-zinc-700 text-brand shadow-sm" 
                    : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                {t.standardCases}
              </button>
              <button
                onClick={() => setActiveTab('restaurant')}
                className={cn(
                  "px-4 py-1.5 rounded-lg font-bold text-xs transition-all",
                  activeTab === 'restaurant' 
                    ? "bg-white dark:bg-zinc-700 text-brand shadow-sm" 
                    : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                {t.restaurantRequests}
              </button>
            </div>
          )}
          {(isCallCenter || isRestaurant || isTechnicalBackOffice) && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-6 py-2.5 bg-brand text-white rounded-xl font-bold flex items-center gap-2 hover:bg-brand/90 transition-all shadow-lg shadow-brand/20"
            >
              {showForm ? t.cancel : t.newRequest}
            </button>
          )}
        </div>
      </div>

      {showForm && (isCallCenter || isRestaurant || isTechnicalBackOffice) && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm animate-in fade-in slide-in-from-top-4">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.brand}</label>
              <select
                required
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                value={form.brand_id}
                onChange={(e) => setForm({ ...form, brand_id: e.target.value, branch_id: '' })}
              >
                <option value="">Select Brand</option>
                {Array.isArray(brands) && brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.branch}</label>
              <select
                required
                disabled={!form.brand_id}
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white disabled:opacity-50"
                value={form.branch_id}
                onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
              >
                <option value="">Select Branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.platform}</label>
              <select
                required
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              >
                <option value="">Select Platform</option>
                {platforms.map(p => (
                  <option key={p.id} value={lang === 'en' ? p.name_en : p.name_ar}>
                    {lang === 'en' ? p.name_en : p.name_ar}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.caseType}</label>
              <select
                required
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                value={form.case_type}
                onChange={(e) => setForm({ ...form, case_type: e.target.value, dedication_time: '', technical_type: '' })}
              >
                <option value="">Select Case</option>
                {caseTypes.map(c => (
                  <option key={c.id} value={lang === 'en' ? c.name_en : c.name_ar}>
                    {lang === 'en' ? c.name_en : c.name_ar}
                  </option>
                ))}
              </select>
            </div>
            {form.case_type === 'Technical' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.technicalType}</label>
                <select
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                  value={form.technical_type}
                  onChange={(e) => setForm({ ...form, technical_type: e.target.value })}
                >
                  <option value="">Select Type</option>
                  {technicalTypes.map(type => (
                    <option key={type.id} value={lang === 'en' ? type.name_en : type.name_ar}>
                      {lang === 'en' ? type.name_en : type.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {form.case_type === 'Dedication' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.dedicationTime}</label>
                <input
                  required
                  type="datetime-local"
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                  value={form.dedication_time}
                  onChange={(e) => {
                    const selected = new Date(e.target.value);
                    const now = new Date();
                    const diff = selected.getTime() - now.getTime();
                    const twentyFourHours = 24 * 60 * 60 * 1000;
                    
                    if (diff > twentyFourHours) {
                      alert(lang === 'en' ? "Dedication time must be within 24 hours" : "يجب أن يكون وقت الإهداء خلال 24 ساعة");
                      return;
                    }
                    setForm({ ...form, dedication_time: e.target.value });
                  }}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.customerName}</label>
              <input
                required
                type="text"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.customerPhone}</label>
              <input
                required
                type="tel"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.orderId}</label>
              <input
                required
                type="text"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                value={form.order_id}
                onChange={(e) => setForm({ ...form, order_id: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">
                {isRestaurant ? (lang === 'en' ? 'Restaurant Message' : 'رسالة المطعم') : t.callCenterMessage}
              </label>
              <textarea
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white min-h-[80px]"
                value={form.call_center_message}
                onChange={(e) => setForm({ ...form, call_center_message: e.target.value })}
                placeholder={isRestaurant 
                  ? (lang === 'en' ? "Add any additional details for the call center..." : "أضف أي تفاصيل إضافية لمركز الاتصال...")
                  : "Add any additional details for the restaurant..."}
              />
            </div>

            {dynamicFields.map(field => (
              <div key={field.id} className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">
                  {lang === 'en' ? field.name_en : field.name_ar}
                  {field.is_required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {field.type === 'selection' ? (
                  <select
                    required={field.is_required}
                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                    value={dynamicValues[field.id] || ''}
                    onChange={(e) => setDynamicValues({ ...dynamicValues, [field.id]: e.target.value })}
                  >
                    <option value="">Select Option</option>
                    {fieldOptions.filter(o => o.field_id === field.id).map(opt => (
                      <option key={opt.id} value={lang === 'en' ? opt.value_en : opt.value_ar}>
                        {lang === 'en' ? opt.value_en : opt.value_ar}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    required={field.is_required}
                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white min-h-[80px]"
                    value={dynamicValues[field.id] || ''}
                    onChange={(e) => setDynamicValues({ ...dynamicValues, [field.id]: e.target.value })}
                  />
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    required={field.is_required}
                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white"
                    value={dynamicValues[field.id] || ''}
                    onChange={(e) => setDynamicValues({ ...dynamicValues, [field.id]: e.target.value })}
                  />
                )}
              </div>
            ))}

            <div className="lg:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-8 py-3 bg-brand text-white rounded-xl font-bold flex items-center gap-2 hover:bg-brand/90 transition-all disabled:opacity-50 shadow-lg shadow-brand/20"
              >
                <Send size={18} />
                {t.submit}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px] space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">{lang === 'en' ? 'Search Phone' : 'بحث برقم الهاتف'}</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              placeholder={lang === 'en' ? "Customer Phone..." : "رقم الهاتف..."}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-brand outline-none text-sm text-zinc-900 dark:text-white"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 min-w-[200px] space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">{lang === 'en' ? 'Search Order ID' : 'بحث برقم الطلب'}</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              placeholder={lang === 'en' ? "Order ID..." : "رقم الطلب..."}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-brand outline-none text-sm text-zinc-900 dark:text-white"
              value={searchOrderId}
              onChange={(e) => setSearchOrderId(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 min-w-[200px] space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">{lang === 'en' ? 'Filter Brand' : 'تصفية بالبراند'}</label>
          <select
            className="w-full px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-brand outline-none text-sm text-zinc-900 dark:text-white"
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
          >
            <option value="">{lang === 'en' ? 'All Brands' : 'كل البراندات'}</option>
            {Array.isArray(brands) && brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <button
          onClick={() => {
            setSearchPhone('');
            setSearchOrderId('');
            setFilterBrand('');
          }}
          className="p-2 text-zinc-400 hover:text-brand transition-colors"
          title={lang === 'en' ? "Clear Filters" : "مسح التصفية"}
        >
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredOrders.map((request) => {
          const isExpanded = expandedOrders.includes(request.id);
          return (
            <div 
              key={request.id} 
              className={cn(
                "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all overflow-hidden",
                isExpanded ? "p-6" : "p-4"
              )}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "rounded-xl flex items-center justify-center shrink-0 transition-all",
                    isExpanded ? "w-14 h-14" : "w-10 h-10",
                    request.status === 'Pending' ? "bg-amber-100 text-amber-600 dark:bg-amber-900/20" :
                    request.status === 'Approved' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20" :
                    "bg-red-100 text-red-600 dark:bg-red-900/20"
                  )}>
                    {request.status === 'Pending' ? <Clock size={isExpanded ? 28 : 20} /> :
                     request.status === 'Approved' ? <CheckCircle2 size={isExpanded ? 28 : 20} /> :
                     <XCircle size={isExpanded ? 28 : 20} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-0.5">
                      <h4 className={cn("font-bold text-zinc-900 dark:text-white", isExpanded ? "text-lg" : "text-sm")}>
                        Order #{request.order_id}
                      </h4>
                      <span className="px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[9px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                        {request.case_type} {request.technical_type ? `(${request.technical_type})` : ''}
                      </span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider",
                        request.status === 'Pending' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                        request.status === 'Approved' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                        "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      )}>
                        {request.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                      <span>{request.brand_name}</span>
                      <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                      <span>{request.branch_name}</span>
                      {!isExpanded && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                          <span>{request.customer_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {!isExpanded && (
                    <div className="text-right hidden sm:block">
                      <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Requested At</p>
                      <p className="text-[11px] font-bold text-zinc-900 dark:text-white">{formatDate(request.created_at)}</p>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExpand(request.id, request)}
                      className={cn(
                        "p-2 rounded-xl transition-all flex items-center gap-2",
                        isExpanded 
                          ? "bg-brand text-white shadow-lg shadow-brand/20" 
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      )}
                      title={isExpanded ? "Close Details" : "View Details"}
                    >
                      <Eye size={18} />
                      {!isExpanded && <span className="text-xs font-bold px-1">View</span>}
                    </button>

                    {(isRestaurant || (isCallCenter && request.creator_role === 'Restaurants') || user?.role_name === 'Technical Back Office') && request.status === 'Pending' && isExpanded && (
                      <button
                        onClick={() => setResponseForm({ id: request.id, status: '', message: '' })}
                        className="px-5 py-2.5 bg-zinc-900 dark:bg-white dark:text-zinc-900 text-white rounded-xl font-bold text-sm hover:scale-105 transition-all"
                      >
                        {t.respond}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{t.customerName}</p>
                        <p className="text-base font-bold text-zinc-700 dark:text-zinc-300">{request.customer_name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{t.customerPhone}</p>
                        <p className="text-base font-bold text-zinc-700 dark:text-zinc-300">{request.customer_phone}</p>
                      </div>
                      {request.dedication_time && (
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{t.dedicationTime}</p>
                          <p className="text-sm font-bold text-brand">{new Date(request.dedication_time).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2 space-y-4">
                      {request.call_center_message && (
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                            {request.creator_role === 'Restaurants' 
                              ? (lang === 'en' ? 'Restaurant Message' : 'رسالة المطعم')
                              : t.callCenterMessage}
                          </p>
                          <div className="bg-brand/5 dark:bg-brand/10 p-3 rounded-xl border border-brand/10">
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{request.call_center_message}</p>
                          </div>
                        </div>
                      )}
                      {request.dynamic_values && request.dynamic_values.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {request.dynamic_values.map(val => (
                            <div key={val.field_id}>
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                                {lang === 'en' ? val.name_en : val.name_ar}
                              </p>
                              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{val.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                          {request.creator_role === 'Restaurants'
                            ? (lang === 'en' ? 'Call Center Response' : 'رد مركز الاتصال')
                            : t.message}
                        </p>
                        {request.restaurant_message ? (
                          <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 italic">"{request.restaurant_message}"</p>
                            <div className="mt-2 flex flex-wrap gap-4">
                              {request.restaurant_response_at && (
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                                  <Clock size={12} />
                                  <span>{t.restaurantResponse}: {formatDate(request.restaurant_response_at)}</span>
                                </div>
                              )}
                              {request.manager_responded_at && (
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                                  <Clock size={12} />
                                  <span>{t.managerResponse}: {formatDate(request.manager_responded_at)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-zinc-400 italic text-sm">
                              <AlertCircle size={16} />
                              <span>Waiting for restaurant response...</span>
                            </div>
                          </div>
                        )}
                        {isManager && request.restaurant_viewed_at && (
                          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase">
                            <Eye size={12} />
                            <span>{t.viewedAt}: {formatDate(request.restaurant_viewed_at)}</span>
                          </div>
                        )}
                        {isManager && request.manager_viewed_at && (
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-zinc-300 dark:text-zinc-600 uppercase">
                            <Eye size={12} />
                            <span>Manager Viewed At: {formatDate(request.manager_viewed_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Response Modal/Form */}
                  {responseForm.id === request.id && (
                    <div className="mt-6 p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border-2 border-brand/20 animate-in zoom-in-95">
                      <form onSubmit={handleResponse} className="space-y-4">
                        <div className="flex items-center gap-4 mb-4">
                          <button
                            type="button"
                            onClick={() => setResponseForm({ ...responseForm, status: 'Approved' })}
                            className={cn(
                              "flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border-2",
                              responseForm.status === 'Approved' 
                                ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500"
                            )}
                          >
                            <CheckCircle2 size={18} />
                            {t.approve}
                          </button>
                          <button
                            type="button"
                            onClick={() => setResponseForm({ ...responseForm, status: 'Rejected' })}
                            className={cn(
                              "flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border-2",
                              responseForm.status === 'Rejected' 
                                ? "bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20" 
                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500"
                            )}
                          >
                            <XCircle size={18} />
                            {t.reject}
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase ml-1">{t.message}</label>
                          <textarea
                            required
                            placeholder={t.writeMessage}
                            className="w-full px-4 py-3 rounded-xl bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white min-h-[100px]"
                            value={responseForm.message}
                            onChange={(e) => setResponseForm({ ...responseForm, message: e.target.value })}
                          />
                        </div>
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setResponseForm({ id: null, status: '', message: '' })}
                            className="px-6 py-2.5 text-zinc-500 font-bold hover:text-zinc-700 transition-colors"
                          >
                            {t.cancel}
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmitting || !responseForm.status}
                            className="px-8 py-2.5 bg-brand text-white rounded-xl font-bold hover:bg-brand/90 transition-all disabled:opacity-50"
                          >
                            {t.submit}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredOrders.length === 0 && (
          <div className="text-center py-24 bg-white dark:bg-zinc-900 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
            <Clock size={64} className="mx-auto text-zinc-200 dark:text-zinc-800 mb-4" />
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">No Requests Found</h3>
            <p className="text-zinc-500 dark:text-zinc-400">There are no late order requests to display at the moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
