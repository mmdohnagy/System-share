import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Search, Check, X, Clock, User, AlertCircle, ChevronDown, Filter, Trash2, Package, MapPin, Shield, Send, Sparkles, Globe, RefreshCw, Download, MessageCircle } from 'lucide-react';
import { API_URL, formatDate, safeJson } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface HiddenItem {
  id: number;
  brand_id: number;
  branch_id: number | null;
  product_id: number;
  brand_name: string;
  branch_name: string;
  product_name: string;
  agent_name: string;
  reason: string;
  requested_at: string;
  responsible_party: string;
  created_at: string;
  username: string;
  updated_at?: string;
  updated_by_username?: string;
  action_to_unhide?: string;
  comment?: string;
}

import { useFetch } from '../../hooks/useFetch';

export default function UnhideItemView() {
  const { user, lang } = useAuth();
  const { fetchWithAuth } = useFetch();
  const [records, setRecords] = useState<HiddenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [editingItem, setEditingItem] = useState<HiddenItem | null>(null);
  const [allBrands, setAllBrands] = useState<{ id: number; name: string }[]>([]);
  const [allBranches, setAllBranches] = useState<{ id: number; brand_id: number; name: string }[]>([]);
  const [allProducts, setAllProducts] = useState<{ id: number; brand_id: number; product_name: string }[]>([]);
  const [responsibleParties, setResponsibleParties] = useState<{ id: number; name: string }[]>([]);
  const [editForm, setEditForm] = useState({
    brand_id: 0,
    branch_id: null as number | null,
    product_id: 0,
    agent_name: '',
    reason: '',
    responsible_party: '',
    comment: '',
    action_to_unhide: '',
    requested_at: ''
  });

  useEffect(() => {
    fetchData();
    fetchInitialData();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'HIDDEN_ITEMS_UPDATED') {
        fetchData();
      }
    };
    return () => ws.close();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/hidden-items`);
      if (!res.ok) {
        const errorData = await safeJson(res);
        throw new Error(`Failed to fetch hidden items: ${res.status} ${errorData?.error || ''}`);
      }
      const data = await safeJson(res);
      setRecords(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (err.isAuthError) return;
      console.error("Failed to fetch hidden items", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInitialData = async () => {
    try {
      const [brandsRes, respRes, branchesRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/brands`),
        fetchWithAuth(`${API_URL}/busy-responsible`),
        fetchWithAuth(`${API_URL}/branches`)
      ]);
      if (brandsRes.ok) setAllBrands(await safeJson(brandsRes) || []);
      if (respRes.ok) setResponsibleParties(await safeJson(respRes) || []);
      if (branchesRes.ok) setAllBranches(await safeJson(branchesRes) || []);
    } catch (err) {
      console.error("Failed to fetch initial data", err);
    }
  };

  const fetchProductsForBrand = async (brandId: number) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/products?brand_id=${brandId}`);
      if (res.ok) {
        const data = await safeJson(res);
        if (data && Array.isArray(data.products)) {
          // Map product names from fieldValues if needed
          const productNameFieldId = 3; // Default from server.ts
          const mappedProducts = data.products.map((p: any) => {
            const nameValue = data.fieldValues?.find((fv: any) => fv.product_id === p.id && fv.field_id === productNameFieldId);
            return { 
              ...p, 
              product_name: nameValue ? nameValue.value : p.product_name || 'Unnamed Product'
            };
          });
          setAllProducts(mappedProducts);
        } else {
          setAllProducts([]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch products", err);
    }
  };

  useEffect(() => {
    if (editForm.brand_id) {
      fetchProductsForBrand(editForm.brand_id);
    }
  }, [editForm.brand_id]);

  const handleUnhide = async (ids: number[]) => {
    if (ids.length === 0) return;
    
    setProcessing(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/hidden-items/bulk-unhide`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      });
      
      if (res.ok) {
        setSelectedIds([]);
        await fetchData();
        alert("Items unhidden successfully!");
      } else {
        const errorData = await safeJson(res);
        alert(`Error: ${errorData?.error || 'Failed to unhide items'}`);
      }
    } catch (err: any) {
      if (err.isAuthError) return;
      console.error("Failed to unhide items", err);
      alert("A network error occurred while trying to unhide items.");
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setProcessing(true);
    try {
      const payload = {
        ...editForm,
        requested_at: editForm.requested_at ? new Date(editForm.requested_at).toISOString() : null
      };

      const res = await fetchWithAuth(`${API_URL}/hidden-items/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setEditingItem(null);
        await fetchData();
        alert("Item updated successfully!");
      } else {
        const errorData = await safeJson(res);
        alert(`Error: ${errorData?.error || 'Failed to update item'}`);
      }
    } catch (err: any) {
      if (err.isAuthError) return;
      console.error("Failed to update item", err);
      alert("A network error occurred while trying to update the item.");
    } finally {
      setProcessing(false);
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/hidden-items/export`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
        a.download = `hidden_items_${dateStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("Failed to export data", err);
    }
  };

  const filteredRecords = records.filter(r => {
    const matchesSearch = r.product_name.toLowerCase().includes(search.toLowerCase()) || 
                         r.agent_name.toLowerCase().includes(search.toLowerCase()) ||
                         r.reason.toLowerCase().includes(search.toLowerCase());
    const matchesBrand = brandFilter === '' || r.brand_name === brandFilter;
    const matchesBranch = branchFilter === '' || r.branch_name === branchFilter;
    return matchesSearch && matchesBrand && matchesBranch;
  });

  const brands = Array.isArray(records) ? Array.from(new Set(records.map(r => r.brand_name))) : [];
  const branches = Array.isArray(records) ? Array.from(new Set(records.filter(r => brandFilter === '' || r.brand_name === brandFilter).map(r => r.branch_name || 'All Branches'))) : [];

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredRecords.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map(r => r.id));
    }
  };

  const handleWhatsApp = (item: HiddenItem) => {
    const text = `Dear Team,\n\n` +
      `Please be informed that the below item has been hidden as per the following details:\n\n` +
      `Product Name: ${item.product_name}\n` +
      `Action Taken: Hidden\n` +
      `Branch: ${item.branch_name || 'All Branches'}\n` +
      `Date & Time: ${formatDate(item.created_at)}\n` +
      `Performed By: ${item.agent_name}\n\n` +
      `You will be notified once the product is activated again.\n\n` +
      `Best regards,\n` +
      `${item.agent_name}`;
    
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-10 pb-20">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-zinc-900 dark:bg-white rounded-2xl text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10">
              <RefreshCw size={28} strokeWidth={2.5} />
            </div>
            <h2 className="text-5xl font-black text-zinc-900 dark:text-white tracking-tight">Unhide Items</h2>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 font-semibold text-lg ml-1">Restore product availability across branches.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="px-6 py-3 bg-zinc-900 dark:bg-white rounded-2xl text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/20 dark:shadow-white/5 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm font-black tracking-tight">{records.length} ITEMS CURRENTLY HIDDEN</span>
          </div>
          <button 
            onClick={handleExport}
            className="p-4 bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm group"
            title="Export Database"
          >
            <Download size={20} className="group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </motion.div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 p-10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.05)] space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3 space-y-2">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Brand Filter</label>
            <div className="relative group">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" size={18} />
              <select
                value={brandFilter}
                onChange={(e) => { setBrandFilter(e.target.value); setBranchFilter(''); }}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">Any Brand</option>
                {Array.isArray(brands) && brands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
            </div>
          </div>

          <div className="lg:col-span-3 space-y-2">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Branch Filter</label>
            <div className="relative group">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" size={18} />
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">Any Branch</option>
                {branches.map(b => (
                  <option key={b} value={b === 'All Branches' ? '' : b}>{b}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
            </div>
          </div>

          <div className="lg:col-span-6 space-y-2">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Search Database</label>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" size={18} />
              <input 
                type="text"
                placeholder="Search by item name, agent, or reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none shadow-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
            <button 
              onClick={fetchData}
              className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
              title="Refresh Data"
            >
              <RefreshCw size={20} className={cn(loading && "animate-spin")} />
            </button>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-zinc-400">
              <Sparkles size={16} className="text-amber-400" />
              <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
                {selectedIds.length} items selected for restoration<br/>
                Showing {filteredRecords.length} of {records.length} records
              </p>
            </div>
            {user?.role_name !== 'Call Center' && (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleUnhide(selectedIds)}
                  disabled={selectedIds.length === 0 || processing}
                  className={cn(
                    "px-8 py-4 rounded-2xl font-black text-sm tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3 shadow-2xl disabled:opacity-40 disabled:grayscale",
                    "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20"
                  )}
                >
                  {processing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      PROCESSING...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      {lang === 'en' ? 'UNHIDE SELECTED' : 'إلغاء إخفاء المحدد'}
                    </>
                  )}
                </button>

                <button 
                  onClick={() => {
                    const confirmMsg = lang === 'en' 
                      ? `Are you sure you want to unhide ALL ${filteredRecords.length} items?` 
                      : `هل أنت متأكد من إلغاء إخفاء جميع العناصر (${filteredRecords.length})؟`;
                    if (window.confirm(confirmMsg)) {
                      handleUnhide(filteredRecords.map(r => r.id));
                    }
                  }}
                  disabled={filteredRecords.length === 0 || processing}
                  className={cn(
                    "px-8 py-4 rounded-2xl font-black text-sm tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3 shadow-2xl disabled:opacity-40 disabled:grayscale",
                    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20"
                  )}
                >
                  {processing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      PROCESSING...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={18} />
                      {lang === 'en' ? 'UNHIDE ALL' : 'إلغاء إخفاء الكل'}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-2 border-zinc-100 dark:border-zinc-800 rounded-[2rem] overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/30">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white dark:bg-zinc-900">
                  <th className="px-8 py-6">
                    <button 
                      onClick={handleSelectAll}
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                        selectedIds.length > 0 && selectedIds.length === filteredRecords.length
                          ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white"
                          : "border-zinc-200 dark:border-zinc-800"
                      )}
                    >
                      {selectedIds.length > 0 && <Check size={12} className="text-white dark:text-zinc-900" strokeWidth={4} />}
                    </button>
                  </th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Brand</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Branch</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Item</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Reason</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Hidden At</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Created By</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                <AnimatePresence mode="popLayout">
                  {filteredRecords.length === 0 ? (
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <td colSpan={8} className="px-8 py-32 text-center">
                        <div className="flex flex-col items-center gap-6 text-zinc-300 dark:text-zinc-700">
                          <div className="p-8 bg-white dark:bg-zinc-900 rounded-full shadow-sm">
                            <AlertCircle size={64} strokeWidth={1} />
                          </div>
                          <p className="text-xl font-black uppercase tracking-widest opacity-40">No hidden items found</p>
                        </div>
                      </td>
                    </motion.tr>
                  ) : (
                    filteredRecords.map((item, idx) => (
                      <motion.tr 
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.01 }}
                        className={cn(
                          "group transition-all cursor-pointer",
                          selectedIds.includes(item.id) 
                            ? "bg-blue-50/50 dark:bg-blue-900/10" 
                            : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        )}
                        onClick={() => toggleSelect(item.id)}
                      >
                        <td className="px-8 py-5">
                          <div
                            className={cn(
                              "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                              selectedIds.includes(item.id)
                                ? "bg-blue-600 border-blue-600"
                                : "border-zinc-200 dark:border-zinc-800 group-hover:border-zinc-300 dark:group-hover:border-zinc-700"
                            )}
                          >
                            {selectedIds.includes(item.id) && <Check size={12} className="text-white" strokeWidth={4} />}
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-tight">{item.brand_name}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                            <MapPin size={12} className="text-zinc-400" />
                            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{item.branch_name || 'All Branches'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-xs font-black text-zinc-900 dark:text-white">{item.product_name}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg inline-block">
                            <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-tighter">{item.reason}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                              <Clock size={12} />
                              <span className="text-[10px] font-bold uppercase tracking-tighter">
                                {formatDate(item.created_at)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-500">
                                {item.username?.[0]?.toUpperCase()}
                              </div>
                              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tighter">{item.username}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleWhatsApp(item);
                              }}
                              className="p-2.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                              title="Share via WhatsApp"
                            >
                              <MessageCircle size={18} />
                            </button>
                            {user?.role_name !== 'Call Center' && (
                              <>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingItem(item);
                                    setEditForm({
                                      brand_id: item.brand_id,
                                      branch_id: item.branch_id,
                                      product_id: item.product_id,
                                      agent_name: item.agent_name,
                                      reason: item.reason,
                                      responsible_party: item.responsible_party,
                                      comment: item.comment || '',
                                      action_to_unhide: item.action_to_unhide || '',
                                      requested_at: item.requested_at ? new Date(item.requested_at).toISOString().slice(0, 16) : ''
                                    });
                                  }}
                                  className="p-2.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                  title="Edit Item"
                                >
                                  <RefreshCw size={18} />
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnhide([item.id]);
                                  }}
                                  className="p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                  title="Unhide Now"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingItem(null)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl text-blue-600">
                    <RefreshCw size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Edit Hidden Item</h3>
                    <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{editingItem.product_name}</p>
                  </div>
                </div>
                <button onClick={() => setEditingItem(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                  <X size={20} className="text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleUpdate} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Brand</label>
                    <select
                      value={editForm.brand_id}
                      onChange={(e) => setEditForm(prev => ({ ...prev, brand_id: Number(e.target.value), branch_id: null, product_id: 0 }))}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none"
                    >
                      <option value={0}>Select Brand</option>
                      {allBrands.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Branch</label>
                    <select
                      value={editForm.branch_id || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, branch_id: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none"
                    >
                      <option value="">All Branches</option>
                      {allBranches.filter(b => b.brand_id === editForm.brand_id).map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Product</label>
                  <select
                    value={editForm.product_id}
                    onChange={(e) => setEditForm(prev => ({ ...prev, product_id: Number(e.target.value) }))}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none"
                  >
                    <option value={0}>Select Product</option>
                    {allProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.product_name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Agent Name</label>
                    <input
                      type="text"
                      required
                      value={editForm.agent_name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, agent_name: e.target.value }))}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Responsible Party</label>
                    <select
                      value={editForm.responsible_party}
                      onChange={(e) => setEditForm(prev => ({ ...prev, responsible_party: e.target.value }))}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none"
                    >
                      <option value="">Select Responsible</option>
                      {responsibleParties.map(r => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Requested At</label>
                  <input
                    type="datetime-local"
                    value={editForm.requested_at}
                    onChange={(e) => setEditForm(prev => ({ ...prev, requested_at: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Reason</label>
                  <textarea
                    required
                    rows={3}
                    value={editForm.reason}
                    onChange={(e) => setEditForm(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Action to Unhide</label>
                  <textarea
                    rows={2}
                    value={editForm.action_to_unhide}
                    onChange={(e) => setEditForm(prev => ({ ...prev, action_to_unhide: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 ml-1">Modification Comment (Internal)</label>
                  <textarea
                    rows={2}
                    placeholder="Why are you editing this record?"
                    value={editForm.comment}
                    onChange={(e) => setEditForm(prev => ({ ...prev, comment: e.target.value }))}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-sm font-bold text-zinc-900 dark:text-white focus:border-zinc-900 dark:focus:border-white transition-all outline-none resize-none"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="flex-1 px-8 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-black text-sm tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={processing}
                    className="flex-1 px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-sm tracking-widest hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white dark:border-zinc-900/30 dark:border-t-zinc-900 rounded-full animate-spin" />
                    ) : (
                      <Check size={18} />
                    )}
                    SAVE CHANGES
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
