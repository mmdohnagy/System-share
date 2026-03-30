import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_URL, cn, safeJson } from '../../lib/utils';
import { Search, Filter, Eye, X, Copy, CheckCircle2, Edit2, Trash2, Globe, Calendar, Power, PowerOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Brand, DynamicField, ProductFieldValue } from '../../types';
import { useWebSocket } from '../../hooks/useWebSocket';
import ProductModal from '../ProductModal';

const CHANNELS = [
  'Talabat',
  'Keeta',
  'Jahez',
  'Deliveroo',
  'Call Center',
  'Web Site',
  'Walk In',
  'V-thru'
];

import { useFetch } from '../../hooks/useFetch';

export default function TechnicalView() {
  const { lang, user, logout } = useAuth();
  const { fetchWithAuth } = useFetch();
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [fields, setFields] = useState<DynamicField[]>([]);
  const [fieldValues, setFieldValues] = useState<ProductFieldValue[]>([]);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [daysFilter, setDaysFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const lastMessage = useWebSocket();

  const canCopy = user?.role_name === 'Technical Team' || user?.role_name === 'Manager' || user?.role_name === 'Super Visor' || user?.role_name.startsWith('Marketing');

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(lang === 'en' ? 'Text Copied' : 'تم نسخ النص');
  };

  const handleToggleOffline = async (productId: number) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/products/${productId}/toggle-offline`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await safeJson(res);
        showToast(lang === 'en' ? `Product is now ${data?.is_offline ? 'Offline' : 'Active'}` : `المنتج الآن ${data?.is_offline ? 'غير متصل' : 'نشط'}`);
        fetchData();
      }
    } catch (error) {
      console.error("Error toggling offline status:", error);
    }
  };

  const handleBulkOffline = async (isOffline: boolean) => {
    if (selectedIds.length === 0) return;
    setIsBulkProcessing(true);
    try {
      const results = await Promise.all(selectedIds.map(id => 
        fetchWithAuth(`${API_URL}/products/${id}/toggle-offline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force_status: isOffline })
        })
      ));
      
      const successCount = results.filter(r => r.ok).length;
      showToast(lang === 'en' 
        ? `Updated ${successCount} products to ${isOffline ? 'Offline' : 'Active'}` 
        : `تم تحديث ${successCount} منتج إلى ${isOffline ? 'غير متصل' : 'نشط'}`);
      
      setSelectedIds([]);
      fetchData();
    } catch (error) {
      console.error("Error in bulk update:", error);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
    }
  };

  const fetchData = async () => {
    try {
      const [pRes, bRes, fRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/products`),
        fetchWithAuth(`${API_URL}/brands`),
        fetchWithAuth(`${API_URL}/fields`),
      ]);
      
      if (!pRes.ok) {
        const errorData = await safeJson(pRes);
        throw new Error(`Failed to fetch products: ${pRes.status} ${errorData?.error || ''}`);
      }
      if (!bRes.ok) {
        const errorData = await safeJson(bRes);
        throw new Error(`Failed to fetch brands: ${bRes.status} ${errorData?.error || ''}`);
      }
      if (!fRes.ok) {
        const errorData = await safeJson(fRes);
        throw new Error(`Failed to fetch fields: ${fRes.status} ${errorData?.error || ''}`);
      }

      const pData = await safeJson(pRes);
      const bData = await safeJson(bRes);
      const fData = await safeJson(fRes);

      setProducts(pData?.products || []);
      setFieldValues(pData?.fieldValues || []);
      const brandsList = Array.isArray(bData) ? bData : [];
      setBrands(brandsList);
      setFields(fData?.fields || []);

      // Set default brand filter to 'Chili' if it exists
      const chiliBrand = brandsList.find((b: any) => b.name.toLowerCase() === 'chili');
      if (chiliBrand && brandFilter === '') {
        setBrandFilter(chiliBrand.id.toString());
      }
    } catch (err: any) {
      if (err.isAuthError) return;
      console.error("Failed to fetch technical data", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (lastMessage?.type === 'CODE_UPDATED' || lastMessage?.type === 'PRODUCT_CREATED') {
      fetchData();
    }
  }, [lastMessage]);

  const t = {
    en: {
      title: "Technical Overview",
      search: "Search products or codes...",
      brand: "Brand",
      allBrands: "All Brands",
      code: "Product Code",
      details: "View Details",
      noCode: "No Code Assigned",
    },
    ar: {
      title: "نظرة عامة تقنية",
      search: "البحث عن المنتجات أو الأكواد...",
      brand: "العلامة التجارية",
      allBrands: "جميع العلامات التجارية",
      code: "كود المنتج",
      details: "عرض التفاصيل",
      noCode: "لم يتم تعيين كود",
    }
  }[lang];

  const productNameFieldId = fields.find(f => f.name_en === (lang === 'en' ? 'Product Name (EN)' : 'Product Name (AR)'))?.id || (lang === 'en' ? 3 : 7);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.brand_name.toLowerCase().includes(search.toLowerCase()) || 
                         (p.product_code || '').toLowerCase().includes(search.toLowerCase()) ||
                         fieldValues.some(fv => fv.product_id === p.id && fv.value?.toString().toLowerCase().includes(search.toLowerCase()));
    const matchesBrand = brandFilter === '' || p.brand_id.toString() === brandFilter;
    const matchesChannel = channelFilter === '' || (p.channels || []).includes(channelFilter);
    
    let matchesDays = true;
    if (daysFilter !== 'all') {
      // SQLite format is YYYY-MM-DD HH:MM:SS (UTC)
      const dateStr = p.created_at.includes('T') ? p.created_at : p.created_at.replace(' ', 'T') + 'Z';
      const createdDate = new Date(dateStr);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - createdDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (daysFilter === '7') matchesDays = diffDays <= 7;
      else if (daysFilter === '30') matchesDays = diffDays <= 30;
      else if (daysFilter === '90') matchesDays = diffDays <= 90;
    }

    return matchesSearch && matchesBrand && matchesChannel && matchesDays;
  });

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-black text-zinc-900 dark:text-white tracking-tight">
            Technical <span className="text-brand">Overview</span>
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm mt-0.5">Detailed technical specifications and product mapping</p>
        </div>
          <div className="flex flex-wrap items-center gap-3">
            {filteredProducts.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-black uppercase tracking-widest hover:bg-brand hover:text-white transition-all flex items-center gap-2"
              >
                <div className={cn(
                  "w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                  selectedIds.length > 0 && selectedIds.length === filteredProducts.length
                    ? "bg-white dark:bg-zinc-900 border-white dark:border-zinc-900"
                    : "border-zinc-300 dark:border-zinc-600"
                )}>
                  {selectedIds.length > 0 && <CheckCircle2 size={10} className={cn(selectedIds.length === filteredProducts.length ? "text-brand" : "text-white")} />}
                </div>
                {selectedIds.length === filteredProducts.length ? (lang === 'en' ? 'Deselect All' : 'إلغاء تحديد الكل') : (lang === 'en' ? 'Select All' : 'تحديد الكل')}
              </button>
            )}
            <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-brand transition-colors" size={16} />
            <input
              type="text"
              placeholder={t.search}
              className="w-full md:w-56 pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 focus:border-brand outline-none transition-all font-bold text-sm text-zinc-900 dark:text-white shadow-sm"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
          >
            <option value="">{t.allBrands}</option>
            {Array.isArray(brands) && brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            className="px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 focus:border-brand outline-none transition-all font-bold text-sm text-zinc-900 dark:text-white shadow-sm"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
          >
            <option value="">All Channels</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative group">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-brand transition-colors" size={16} />
            <select
              className="pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 focus:border-brand outline-none transition-all font-bold text-sm text-zinc-900 dark:text-white shadow-sm appearance-none"
              value={daysFilter}
              onChange={(e) => setDaysFilter(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredProducts.map((product, index) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              key={product.id}
              onClick={() => toggleSelect(product.id)}
              className={cn(
                "glass-card p-6 rounded-[2rem] border transition-all group relative overflow-hidden cursor-pointer",
                selectedIds.includes(product.id) ? "ring-2 ring-brand border-brand/50 shadow-lg shadow-brand/10" : "",
                product.is_offline 
                  ? "border-red-200 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10 grayscale-[0.5] opacity-80" 
                  : "border-zinc-100 dark:border-zinc-800 hover:border-brand/30"
              )}
            >
              {/* Selection Checkbox */}
              <div className={cn(
                "absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all z-10",
                selectedIds.includes(product.id) 
                  ? "bg-brand border-brand scale-110" 
                  : "bg-white/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-700 opacity-0 group-hover:opacity-100"
              )}>
                {selectedIds.includes(product.id) && <CheckCircle2 size={14} className="text-white" />}
              </div>

              {!!product.is_offline && (
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
              )}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-brand uppercase tracking-[0.2em] bg-brand/5 px-2 py-0.5 rounded-lg border border-brand/10">
                      {product.brand_name}
                    </span>
                    {!!product.is_offline && (
                      <span className="text-[9px] font-black text-red-600 uppercase tracking-[0.2em] bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">
                        Offline
                      </span>
                    )}
                  </div>
                  <h3 className={cn(
                    "text-xl font-display font-black mt-2 tracking-tight",
                    product.is_offline ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-white"
                  )}>
                    {fieldValues.find(fv => fv.product_id === product.id && fv.field_id === productNameFieldId)?.value || "Product"}
                  </h3>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className={cn(
                    "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                    product.is_offline
                      ? "bg-zinc-100 text-zinc-400 border-zinc-200"
                      : product.product_code 
                        ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                        : "bg-amber-50 text-amber-600 border-amber-100"
                  )}>
                    {product.product_code || t.noCode}
                  </div>
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {(user?.role_name === 'Manager' || user?.role_name === 'Super Visor') && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleOffline(product.id);
                        }} 
                        className={cn(
                          "p-1.5 rounded-lg transition-all active:scale-90",
                          product.is_offline 
                            ? "bg-emerald-500 text-white hover:bg-emerald-600" 
                            : "bg-red-500 text-white hover:bg-red-600"
                        )}
                        title={product.is_offline ? "Set Active" : "Set Offline"}
                      >
                        {product.is_offline ? <Power size={14} /> : <PowerOff size={14} />}
                      </button>
                    )}
                    {(user?.role_name === 'Manager' || user?.role_name === 'Super Visor' || user?.role_name === 'Technical Team' || user?.role_name === 'Technical Back Office' || user?.role_name === 'Restaurants' || (user?.role_name.startsWith('Marketing') && user?.role_name !== 'Restaurants')) && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProduct(product);
                          setIsEditModalOpen(true);
                        }} 
                        className="p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-brand hover:text-white rounded-lg text-zinc-500 transition-all active:scale-90"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    {(user?.role_name === 'Manager' || user?.role_name === 'Super Visor' || user?.role_name === 'Technical Back Office' || (user?.role_name.startsWith('Marketing') && user?.role_name !== 'Restaurants')) && (
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm('Are you sure you want to delete this product?')) return;
                          const token = localStorage.getItem('token');
                          const res = await fetch(`${API_URL}/products/${product.id}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          if (res.ok) fetchData();
                        }} 
                        className="p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-red-500 hover:text-white rounded-lg text-zinc-500 transition-all active:scale-90"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="space-y-3 mb-6">
                {fields.slice(0, 4).map(field => {
                  const val = fieldValues.find(fv => fv.product_id === product.id && fv.field_id === field.id);
                  return (
                    <div key={field.id} className="flex justify-between items-center text-xs border-b border-zinc-50 dark:border-zinc-800/50 pb-1.5">
                      <span className="text-zinc-500 dark:text-zinc-400 font-medium">{lang === 'en' ? field.name_en : field.name_ar}</span>
                      <span className="font-bold text-zinc-900 dark:text-white">{val?.value || "-"}</span>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={() => setSelectedProduct(product)}
                className="w-full py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white text-sm font-black hover:bg-brand hover:text-white transition-all flex items-center justify-center gap-2 group/btn"
              >
                <Eye size={16} className="group-hover/btn:scale-110 transition-transform" />
                {t.details}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-8 border border-white/10 dark:border-zinc-200 backdrop-blur-xl"
          >
            <div className="flex items-center gap-4 border-r border-white/10 dark:border-zinc-200 pr-8">
              <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white font-black">
                {selectedIds.length}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest">{lang === 'en' ? 'Items Selected' : 'منتجات مختارة'}</span>
                <button onClick={() => setSelectedIds([])} className="text-[10px] font-bold text-zinc-400 hover:text-brand transition-colors text-left uppercase tracking-tighter">
                  {lang === 'en' ? 'Clear Selection' : 'إلغاء التحديد'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {(user?.role_name === 'Manager' || user?.role_name === 'Super Visor') && (
                <>
                  <button
                    disabled={isBulkProcessing}
                    onClick={() => handleBulkOffline(true)}
                    className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isBulkProcessing ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <PowerOff size={14} />}
                    {lang === 'en' ? 'Set Offline' : 'إيقاف التشغيل'}
                  </button>
                  <button
                    disabled={isBulkProcessing}
                    onClick={() => handleBulkOffline(false)}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isBulkProcessing ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Power size={14} />}
                    {lang === 'en' ? 'Set Active' : 'تنشيط الكل'}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="absolute inset-0 bg-zinc-900/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-zinc-900 rounded-[3rem] w-full max-w-4xl max-h-[90vh] overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl"
            >
              <div className="p-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
                <div className="flex justify-between items-start mb-12">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-black text-brand uppercase tracking-[0.3em]">{selectedProduct.brand_name}</span>
                      <div className="w-1 h-1 rounded-full bg-zinc-300" />
                      <span className="text-xs font-black text-zinc-400 uppercase tracking-[0.3em]">Technical Specs</span>
                    </div>
                    <h3 className="text-5xl font-display font-black text-zinc-900 dark:text-white tracking-tighter">
                      {fieldValues.find(fv => fv.product_id === selectedProduct.id && fv.field_id === productNameFieldId)?.value || "Product Details"}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setSelectedProduct(null)} 
                    className="w-14 h-14 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-red-500 hover:text-white rounded-2xl transition-all"
                  >
                    <X size={28} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 gap-6">
                      {fields.map(field => {
                        const val = fieldValues.find(fv => fv.product_id === selectedProduct.id && fv.field_id === field.id);
                        return (
                          <div key={field.id} className="group relative bg-zinc-50/50 dark:bg-zinc-800/50 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 transition-all hover:border-brand/20">
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{lang === 'en' ? field.name_en : field.name_ar}</p>
                              {canCopy && val?.value && (
                                <button 
                                  onClick={() => handleCopy(val.value)}
                                  className="p-2 bg-white dark:bg-zinc-900 rounded-xl text-zinc-400 hover:text-brand transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-zinc-100 dark:border-zinc-800"
                                >
                                  <Copy size={14} />
                                </button>
                              )}
                            </div>
                            <p className="text-lg font-bold text-zinc-900 dark:text-white">{val?.value || "-"}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-10">
                    {/* Codes Section */}
                    <div className="bg-zinc-900 text-white p-10 rounded-[2.5rem] shadow-2xl shadow-brand/20 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-brand/20 blur-[100px] -mr-32 -mt-32 group-hover:bg-brand/30 transition-all duration-700" />
                      <div className="relative z-10 space-y-8">
                        <div>
                          <p className="text-[10px] font-black text-brand uppercase tracking-[0.3em] mb-3">System Identifiers</p>
                          <div className="space-y-6">
                            <div className="flex justify-between items-center">
                              <span className="text-zinc-400 font-bold">Product Code</span>
                              <span className="text-2xl font-mono font-black text-brand">{selectedProduct.product_code || "---"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Channels Display */}
                    {selectedProduct.channels && selectedProduct.channels.length > 0 && (
                      <div className="space-y-4">
                        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Available Channels</p>
                        <div className="flex flex-wrap gap-3">
                          {selectedProduct.channels.map(channel => (
                            <span key={channel} className="px-5 py-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-xs font-black rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                              {channel}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Modifier Groups Display */}
                    {(selectedProduct as any).modifierGroups?.length > 0 && (
                      <div className="space-y-6">
                        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Modifier Architecture</p>
                        <div className="space-y-4">
                          {(selectedProduct as any).modifierGroups.map((group: any) => (
                            <div key={group.id} className="bg-zinc-50/50 dark:bg-zinc-800/50 p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 group/mod">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <div className="flex items-center gap-3">
                                    <p className="text-lg font-display font-black text-zinc-900 dark:text-white">{lang === 'en' ? group.name_en : group.name_ar}</p>
                                    {canCopy && (
                                      <button 
                                        onClick={() => handleCopy(lang === 'en' ? group.name_en : group.name_ar)}
                                        className="text-zinc-400 hover:text-brand transition-all opacity-0 group-hover/mod:opacity-100"
                                      >
                                        <Copy size={14} />
                                      </button>
                                    )}
                                  </div>
                                  {group.code && <p className="text-[10px] font-mono font-bold text-brand mt-1">CODE: {group.code}</p>}
                                </div>
                                <span className="text-[10px] bg-white dark:bg-zinc-900 px-3 py-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 font-black uppercase tracking-widest">
                                  {group.selection_type}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {group.options.map((opt: any) => (
                                  <div key={opt.id} className="flex justify-between items-center text-sm group/opt bg-white/50 dark:bg-zinc-900/50 p-3 rounded-xl border border-zinc-100/50 dark:border-zinc-800/50">
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-3">
                                        <span className="text-zinc-600 dark:text-zinc-400 font-bold">{lang === 'en' ? opt.name_en : opt.name_ar}</span>
                                        {canCopy && (
                                          <button 
                                            onClick={() => handleCopy(lang === 'en' ? opt.name_en : opt.name_ar)}
                                            className="text-zinc-400 hover:text-brand transition-all opacity-0 group-hover/opt:opacity-100"
                                          >
                                            <Copy size={12} />
                                          </button>
                                        )}
                                      </div>
                                      {opt.code && <span className="text-[10px] font-mono text-brand/70 font-bold">CODE: {opt.code}</span>}
                                    </div>
                                    <span className="font-black text-emerald-600 dark:text-emerald-400">+{opt.price_adjustment} KD</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ProductModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        editingProduct={editingProduct}
        brands={brands}
        fields={fields}
        onSuccess={fetchData}
      />

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-zinc-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold"
          >
            <CheckCircle2 size={18} className="text-emerald-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
