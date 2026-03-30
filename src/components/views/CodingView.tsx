import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_URL, cn } from '../../lib/utils';
import { Search, Save, CheckCircle2, ChevronDown, ChevronUp, Layers, Package, ListTree, Tag, RefreshCw, Filter } from 'lucide-react';
import { Product, ModifierGroup, ModifierOption } from '../../types';
import { useWebSocket } from '../../hooks/useWebSocket';
import { motion, AnimatePresence } from 'motion/react';

import { useFetch } from '../../hooks/useFetch';

export default function CodingView() {
  const { lang } = useAuth();
  const { fetchWithAuth } = useFetch();
  const [products, setProducts] = useState<Product[]>([]);
  const [fieldValues, setFieldValues] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [codeSearch, setCodeSearch] = useState('');
  const [daysFilter, setDaysFilter] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);

  const lastMessage = useWebSocket();

  const fieldValueMap = useMemo(() => {
    const map = new Map<string, string>();
    fieldValues.forEach(fv => {
      map.set(`${fv.product_id}-${fv.field_id}`, fv.value);
    });
    return map;
  }, [fieldValues]);

  const fetchData = async () => {
    try {
      const [pRes, bRes, fRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/products`),
        fetchWithAuth(`${API_URL}/brands`),
        fetchWithAuth(`${API_URL}/fields`)
      ]);
      const pData = await pRes.json();
      const bData = await bRes.json();
      const fData = await fRes.json();
      setProducts(pData.products || []);
      setFieldValues(pData.fieldValues || []);
      setBrands(Array.isArray(bData) ? bData : []);
      setFields(fData.fields || []);

      // Set default brand filter to 'Chili' if it exists
      const chiliBrand = Array.isArray(bData) ? bData.find((b: any) => b.name.toLowerCase() === 'chili') : null;
      if (chiliBrand && brandFilter === '') {
        setBrandFilter(chiliBrand.name);
      }
    } catch (err: any) {
      if (err.isAuthError) return;
      console.error("Failed to fetch coding data", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (lastMessage?.type === 'PRODUCT_CREATED' || lastMessage?.type === 'CODE_UPDATED') {
      fetchData();
    }
  }, [lastMessage]);

  const handleUpdateProductCode = (productId: number, code: string) => {
    setProducts(products.map(p => p.id === productId ? { ...p, product_code: code } : p));
  };

  const handleUpdateGroupCode = (productId: number, groupId: number, code: string) => {
    setProducts(products.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        modifierGroups: p.modifierGroups?.map(mg => mg.id === groupId ? { ...mg, code } : mg)
      };
    }));
  };

  const handleUpdateOptionCode = (productId: number, groupId: number, optionId: number, code: string) => {
    setProducts(products.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        modifierGroups: p.modifierGroups?.map(mg => {
          if (mg.id !== groupId) return mg;
          return {
            ...mg,
            options: mg.options.map(opt => opt.id === optionId ? { ...opt, code } : opt)
          };
        })
      };
    }));
  };

  const handleSaveAllCodes = async (product: Product) => {
    // Validation: Check if all codes are filled
    const isProductCodeFilled = !!product.product_code?.trim();
    const areGroupsFilled = product.modifierGroups?.every(mg => !!mg.code?.trim()) ?? true;
    const areOptionsFilled = product.modifierGroups?.every(mg => 
      mg.options.every(opt => !!opt.code?.trim())
    ) ?? true;

    if (!isProductCodeFilled || !areGroupsFilled || !areOptionsFilled) {
      alert(lang === 'ar' ? 'يرجى ملء جميع خانات الأكواد قبل الحفظ' : 'Please fill all code fields before saving');
      return;
    }

    setSaving(product.id);
    
    try {
      const res = await fetchWithAuth(`${API_URL}/products/${product.id}/code`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          productCode: product.product_code,
          modifierGroups: product.modifierGroups
        }),
      });
      if (res.ok) {
        // Success feedback
      }
    } catch (error: any) {
      if (error.isAuthError) return;
      console.error('Error saving codes:', error);
    } finally {
      setSaving(null);
    }
  };

  const t = {
    en: {
      title: "Product Coding",
      search: "Search products or categories...",
      category: "Category",
      product: "Product",
      modifierGroup: "Modifier Group",
      option: "Option",
      save: "Save All Codes",
      saving: "Saving...",
      productCode: "Product Code",
      modifierCode: "Modifier Code",
      optionCode: "Option Code",
      allBrands: "All Brands",
      allTime: "All Time",
      today: "Today",
      last7Days: "Last 7 Days",
      last30Days: "Last 30 Days",
      filterByBrand: "Filter by Brand",
      filterByDays: "Filter by Days",
      searchByCode: "Search by Code...",
    },
    ar: {
      title: "تكويد المنتجات",
      search: "البحث عن المنتجات أو الفئات...",
      category: "الفئة",
      product: "المنتج",
      modifierGroup: "مجموعة المودفاير",
      option: "الخيار",
      save: "حفظ جميع الأكواد",
      saving: "جاري الحفظ...",
      productCode: "كود المنتج",
      modifierCode: "كود المودفاير",
      optionCode: "كود الخيار",
      allBrands: "جميع البراندات",
      allTime: "كل الوقت",
      today: "اليوم",
      last7Days: "آخر 7 أيام",
      last30Days: "آخر 30 يوم",
      filterByBrand: "فلتر بالبراند",
      filterByDays: "فلتر بالأيام",
      searchByCode: "بحث بالكود...",
    }
  }[lang];

  const productNameFieldId = fields.find(f => f.name_en === 'Product Name (EN)')?.id || 3;
  const categoryNameFieldId = fields.find(f => f.name_en === 'Category Name (EN)')?.id || 2;

  const filteredProducts = products.filter(p => {
    const categoryName = fieldValues.find(fv => fv.product_id === p.id && fv.field_id === categoryNameFieldId)?.value || '';
    const productName = fieldValues.find(fv => fv.product_id === p.id && fv.field_id === productNameFieldId)?.value || '';
    const searchLower = search.toLowerCase();
    const codeSearchLower = codeSearch.toLowerCase();
    
    const matchesSearch = categoryName.toLowerCase().includes(searchLower) ||
                         productName.toLowerCase().includes(searchLower) ||
                         p.brand_name.toLowerCase().includes(searchLower);
    
    const matchesCode = codeSearch === '' || 
                       (p.product_code || '').toLowerCase().includes(codeSearchLower);

    const matchesBrand = brandFilter === '' || p.brand_name === brandFilter;

    let matchesDays = true;
    if (daysFilter) {
      // SQLite format is YYYY-MM-DD HH:MM:SS (UTC)
      const dateStr = p.created_at.includes('T') ? p.created_at : p.created_at.replace(' ', 'T') + 'Z';
      const createdDate = new Date(dateStr);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - createdDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (daysFilter === 'today') matchesDays = diffDays <= 1;
      else if (daysFilter === '7') matchesDays = diffDays <= 7;
      else if (daysFilter === '30') matchesDays = diffDays <= 30;
    }

    return matchesSearch && matchesCode && matchesBrand && matchesDays;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-black text-zinc-900 dark:text-white tracking-tight">
              Product <span className="text-brand">Coding</span>
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm mt-0.5">Assign and manage system codes for accurate tracking</p>
          </div>
          <div className="relative w-full max-w-md group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-brand transition-colors" size={18} />
            <input
              type="text"
              placeholder={t.search}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 focus:border-brand outline-none transition-all font-medium text-sm text-zinc-900 dark:text-white shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative group">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-brand transition-colors" size={16} />
            <select
              className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 focus:border-brand outline-none font-bold text-sm text-zinc-900 dark:text-white shadow-sm appearance-none cursor-pointer"
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
            >
              <option value="">{t.allBrands}</option>
              {Array.isArray(brands) && brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
          </div>

          <div className="relative group">
            <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-brand transition-colors" size={16} />
            <input
              type="text"
              placeholder={t.searchByCode}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 focus:border-brand outline-none transition-all font-bold text-sm text-zinc-900 dark:text-white shadow-sm"
              value={codeSearch}
              onChange={(e) => setCodeSearch(e.target.value)}
            />
          </div>

          <div className="relative group">
            <RefreshCw className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-brand transition-colors" size={16} />
            <select
              className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 focus:border-brand outline-none font-bold text-sm text-zinc-900 dark:text-white shadow-sm appearance-none cursor-pointer"
              value={daysFilter}
              onChange={(e) => setDaysFilter(e.target.value)}
            >
              <option value="">{t.allTime}</option>
              <option value="today">{t.today}</option>
              <option value="7">{t.last7Days}</option>
              <option value="30">{t.last30Days}</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filteredProducts.map((product, index) => {
            const categoryName = fieldValueMap.get(`${product.id}-${categoryNameFieldId}`) || 'No Category';
            const productName = fieldValueMap.get(`${product.id}-${productNameFieldId}`) || 'No Name';
            const isExpanded = expandedProduct === product.id;

            return (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                key={product.id} 
                className={cn(
                  "glass-card rounded-[1.5rem] overflow-hidden transition-all duration-500",
                  product.is_offline && !isExpanded && "grayscale-[0.5] opacity-80",
                  isExpanded ? "ring-2 ring-brand/20 border-brand/30" : "hover:border-zinc-300 dark:hover:border-zinc-700"
                )}
              >
                <div 
                  className={cn(
                    "p-6 flex items-center justify-between cursor-pointer transition-colors",
                    isExpanded ? "bg-brand/5 dark:bg-brand/10" : "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50"
                  )}
                  onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500",
                      isExpanded ? "bg-brand text-white shadow-lg shadow-brand/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                    )}>
                      <Package size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-black text-brand uppercase tracking-[0.2em] bg-brand/5 px-2 py-0.5 rounded-lg border border-brand/10">
                          {product.brand_name}
                        </span>
                        {!!product.is_offline && (
                          <span className="text-[9px] font-black text-red-600 uppercase tracking-[0.2em] bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">
                            Offline
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-display font-black text-zinc-900 dark:text-white tracking-tight">{productName}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                      <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-0.5">Category</p>
                      <p className="text-xs font-bold text-zinc-900 dark:text-white">{categoryName}</p>
                    </div>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500",
                      isExpanded ? "bg-brand/10 text-brand rotate-180" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                    )}>
                      <ChevronDown size={16} />
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <div className="p-8 space-y-8">
                        {/* 1. Product Level */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-[10px] font-black">1</div>
                            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em]">Product Configuration</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-zinc-50/50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                            <div className="space-y-0.5">
                              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Product Name</p>
                              <p className="text-lg font-display font-bold text-zinc-900 dark:text-white">{productName}</p>
                            </div>
                            <div className="relative group">
                              <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-300 group-focus-within:text-brand transition-colors" size={16} />
                              <input
                                type="text"
                                placeholder={t.productCode}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-brand outline-none text-lg font-mono font-bold shadow-sm transition-all"
                                value={product.product_code || ''}
                                onChange={(e) => handleUpdateProductCode(product.id, e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* 2. Modifier Groups Level */}
                        {product.modifierGroups && product.modifierGroups.length > 0 && (
                          <div className="space-y-6">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-[10px] font-black">2</div>
                              <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em]">Modifiers & Options</span>
                            </div>
                            
                            <div className="space-y-8 ml-3 border-l-2 border-zinc-100 dark:border-zinc-800 pl-8">
                              {product.modifierGroups.map((group) => (
                                <div key={group.id} className="space-y-4 relative">
                                  <div className="absolute -left-[41px] top-4 w-3 h-3 rounded-full bg-brand border-2 border-white dark:border-zinc-900" />
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                    <div className="font-display font-black text-zinc-900 dark:text-white text-base">
                                      {lang === 'en' ? group.name_en : group.name_ar}
                                    </div>
                                    <div className="relative group">
                                      <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-300 group-focus-within:text-brand transition-colors" size={14} />
                                      <input
                                        type="text"
                                        placeholder={t.modifierCode}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-brand outline-none text-sm font-mono font-bold shadow-sm transition-all"
                                        value={group.code || ''}
                                        onChange={(e) => handleUpdateGroupCode(product.id, group.id, e.target.value)}
                                      />
                                    </div>
                                  </div>

                                  {/* Option Level */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-4">
                                    {group.options.map((option) => (
                                      <div key={option.id} className="flex items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 shadow-sm hover:border-brand/30 transition-all group/opt">
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                            {lang === 'en' ? option.name_en : option.name_ar}
                                          </span>
                                          <span className="text-[9px] text-brand font-black uppercase tracking-widest">+{option.price_adjustment} KD</span>
                                        </div>
                                        <div className="relative w-28">
                                          <input
                                            type="text"
                                            placeholder="Code"
                                            className="w-full px-3 py-1.5 rounded-lg border-2 border-zinc-50 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white focus:border-brand outline-none text-[10px] font-mono font-bold transition-all"
                                            value={option.code || ''}
                                            onChange={(e) => handleUpdateOptionCode(product.id, group.id, option.id, e.target.value)}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-8 flex justify-end border-t border-zinc-100 dark:border-zinc-800">
                          <button
                            onClick={() => handleSaveAllCodes(product)}
                            disabled={saving === product.id}
                            className="btn-primary flex items-center gap-2 px-8 py-3 text-sm"
                          >
                            {saving === product.id ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                {t.saving}
                              </>
                            ) : (
                              <>
                                <Save size={18} />
                                {t.save}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
