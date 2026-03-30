import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_URL, cn, formatDate, safeJson } from '../../lib/utils';
import { CheckCircle2, XCircle, Clock, User, AlertCircle, Eye, Check, X, Loader2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PendingRequest } from '../../types';
import * as XLSX from 'xlsx';

import { useFetch } from '../../hooks/useFetch';

interface PendingRequestsViewProps {
  filterType?: 'hide_unhide' | 'busy_branch';
}

export default function PendingRequestsView({ filterType }: PendingRequestsViewProps) {
  const { lang, user } = useAuth();
  const { fetchWithAuth } = useFetch();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [viewMode, setViewMode] = useState<'pending' | 'history'>('pending');

  const fetchRequests = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/pending-requests`);
      if (res.ok) {
        const data = await safeJson(res);
        let filteredData = Array.isArray(data) ? data : [];
        if (filterType) {
          filteredData = filteredData.filter(r => r.type === filterType);
        }
        setRequests(filteredData);
      }
    } catch (error: any) {
      if (error.isAuthError) return;
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'PENDING_REQUEST_CREATED' || data.type === 'PENDING_REQUEST_UPDATED') {
        fetchRequests();
      }
    };
    return () => ws.close();
  }, []);

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    setProcessingId(id);
    try {
      const res = await fetchWithAuth(`${API_URL}/pending-requests/${id}/${action}`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchRequests();
        if (selectedRequest?.id === id) setSelectedRequest(null);
      }
    } catch (error: any) {
      if (error.isAuthError) return;
      console.error(`Error ${action}ing request:`, error);
    } finally {
      setProcessingId(null);
    }
  };

  const downloadExcel = () => {
    // Filter for non-pending requests (Approved or Rejected)
    const historyRequests = requests.filter(r => r.status && r.status !== 'Pending');
    
    if (historyRequests.length === 0) {
      alert(lang === 'en' ? 'No history data to download' : 'لا توجد بيانات في السجل للتحميل');
      return;
    }

    const dataToExport = historyRequests.map(req => {
      const data = req.data || {};
      
      // Base information present in all requests
      const common: any = {
        'ID': req.id,
        'Type': req.type === 'hide_unhide' ? 'Hide/Unhide' : 'Busy Branch',
        'Status': req.status,
        'Requester': req.username || 'Unknown',
        'Request Date': formatDate(req.created_at),
        'Branch': data.branch_name || data.branch || 'All Branches',
        'Brand': data.brand_name || data.brand || '',
        'Processor': req.processor_name || 'System',
        'Action Date': formatDate(req.updated_at),
      };

      // Type-specific details
      if (req.type === 'hide_unhide') {
        return {
          ...common,
          'Agent Name': data.agent_name || '',
          'Reason': data.reason || '',
          'Restoration Action': data.action_to_unhide || '',
          'Responsible Party': data.responsible_party || '',
          'Products': data.resolved_products?.map((p: any) => p.name).join(', ') || '',
          'Comment': data.comment || '',
        };
      } else {
        return {
          ...common,
          'Date': data.date || '',
          'Start Time': data.start_time || '',
          'End Time': data.end_time || '',
          'Duration': data.total_duration || '',
          'Reason Category': data.reason_category || '',
          'Responsible Party': data.responsible_party || '',
          'Comment': data.comment || '',
          'Internal Notes': data.internal_notes || '',
        };
      }
    });

    try {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "History");
      
      // Generate the Excel file and trigger download
      XLSX.writeFile(workbook, `Requests_History_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Excel export failed:", error);
      alert(lang === 'en' ? "Failed to generate Excel file" : "فشل في إنشاء ملف الإكسيل");
    }
  };

  const filteredRequests = requests.filter(r => 
    viewMode === 'pending' ? r.status === 'Pending' : r.status !== 'Pending'
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
          {lang === 'en' ? 'Requests Management' : 'إدارة الطلبات'}
        </h2>
        
        <div className="flex items-center gap-3">
          <button
            onClick={downloadExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <Download size={18} />
            {lang === 'en' ? 'Download Excel' : 'تحميل إكسيل'}
          </button>

          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('pending')}
              className={cn(
                "px-6 py-2 rounded-lg text-sm font-black transition-all",
                viewMode === 'pending' 
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              {lang === 'en' ? 'Pending' : 'المعلقة'}
            </button>
            <button
              onClick={() => setViewMode('history')}
              className={cn(
                "px-6 py-2 rounded-lg text-sm font-black transition-all",
                viewMode === 'history' 
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              {lang === 'en' ? 'History' : 'السجل'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredRequests.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-12 text-center border border-zinc-200 dark:border-zinc-800">
            <CheckCircle2 className="w-12 h-12 text-zinc-200 dark:text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 font-bold">
              {viewMode === 'pending' 
                ? (lang === 'en' ? 'No pending requests' : 'لا توجد طلبات معلقة')
                : (lang === 'en' ? 'No history found' : 'لا يوجد سجل')}
            </p>
          </div>
        ) : (
          filteredRequests.map((request) => (
            <motion.div
              layout
              key={request.id}
              className={cn(
                "bg-white dark:bg-zinc-900 rounded-2xl border p-5 transition-all",
                request.status === 'Pending' ? "border-amber-200 dark:border-amber-900/30 bg-amber-50/10" :
                request.status === 'Approved' ? "border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/10" :
                "border-red-200 dark:border-red-900/30 bg-red-50/10"
              )}
            >
              <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    request.status === 'Pending' ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600" :
                    request.status === 'Approved' ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600" :
                    "bg-red-100 dark:bg-red-900/50 text-red-600"
                  )}>
                    {request.type === 'hide_unhide' ? <Eye size={20} /> : <Clock size={20} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black uppercase tracking-widest text-zinc-400">
                        {request.type === 'hide_unhide' ? (lang === 'en' ? 'Hide Request' : 'طلب إخفاء') : (lang === 'en' ? 'Busy Branch Request' : 'طلب فرع مزدحم')}
                      </span>
                      <div className="w-1 h-1 rounded-full bg-zinc-300" />
                      <span className="text-xs font-bold text-zinc-500">{formatDate(request.created_at)}</span>
                    </div>
                    <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                      {lang === 'en' ? 'From' : 'من'}: {request.username} 
                      {request.data.branch_name && <span className="text-zinc-400 font-medium ml-2">({request.data.branch_name})</span>}
                      {request.data.branch && <span className="text-zinc-400 font-medium ml-2">({request.data.branch})</span>}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedRequest(request)}
                    className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                    title="View Details"
                  >
                    <Eye size={18} />
                  </button>
                  {request.status === 'Pending' && user?.role_name !== 'Restaurants' && (
                    <>
                      <button
                        onClick={() => handleAction(request.id, 'approve')}
                        disabled={processingId === request.id}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all disabled:opacity-50"
                      >
                        {processingId === request.id ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                        {lang === 'en' ? 'Approve' : 'موافقة'}
                      </button>
                      <button
                        onClick={() => handleAction(request.id, 'reject')}
                        disabled={processingId === request.id}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all disabled:opacity-50"
                      >
                        {processingId === request.id ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                        {lang === 'en' ? 'Reject' : 'رفض'}
                      </button>
                    </>
                  )}
                  {request.status === 'Pending' && user?.role_name === 'Restaurants' && (
                    <div className="px-4 py-1.5 bg-amber-100 text-amber-700 rounded-xl font-bold text-xs uppercase tracking-widest">
                      {lang === 'en' ? 'Pending Approval' : 'في انتظار الموافقة'}
                    </div>
                  )}
                  {request.status !== 'Pending' && (
                    <div className="flex flex-col items-end">
                      <div className={cn(
                        "px-4 py-1.5 rounded-xl font-bold text-xs uppercase tracking-widest",
                        request.status === 'Approved' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      )}>
                        {request.status}
                      </div>
                      <div className="text-[10px] font-bold text-zinc-400 mt-1">
                        {lang === 'en' ? 'By' : 'بواسطة'}: {request.processor_name} • {formatDate(request.updated_at)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRequest(null)}
              className="absolute inset-0 bg-zinc-900/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-zinc-900 dark:text-white mb-1">
                      {lang === 'en' ? 'Request Details' : 'تفاصيل الطلب'}
                    </h3>
                    <p className="text-zinc-500 font-bold">{selectedRequest.type === 'hide_unhide' ? 'Hide / Unhide' : 'Busy Branch'}</p>
                  </div>
                  <button onClick={() => setSelectedRequest(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(selectedRequest.data).map(([key, value]: [string, any]) => {
                      if (key === 'product_ids' || key === 'resolved_products') return null;
                      return (
                        <div key={key} className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{key.replace(/_/g, ' ')}</p>
                          <p className="font-bold text-zinc-900 dark:text-white">{String(value)}</p>
                        </div>
                      );
                    })}
                  </div>

                  {selectedRequest.type === 'hide_unhide' && selectedRequest.data.resolved_products && (
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Products</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedRequest.data.resolved_products.map((p: any) => (
                          <span key={p.product_id} className="px-3 py-1 bg-white dark:bg-zinc-900 rounded-lg text-xs font-bold border border-zinc-200 dark:border-zinc-800">
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedRequest.status === 'Pending' && user?.role_name !== 'Restaurants' && (
                  <div className="flex gap-3 mt-8">
                    <button
                      onClick={() => handleAction(selectedRequest.id, 'approve')}
                      disabled={processingId === selectedRequest.id}
                      className="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-black hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {processingId === selectedRequest.id ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
                      {lang === 'en' ? 'Approve Request' : 'الموافقة على الطلب'}
                    </button>
                    <button
                      onClick={() => handleAction(selectedRequest.id, 'reject')}
                      disabled={processingId === selectedRequest.id}
                      className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {processingId === selectedRequest.id ? <Loader2 size={20} className="animate-spin" /> : <X size={20} />}
                      {lang === 'en' ? 'Reject Request' : 'رفض الطلب'}
                    </button>
                  </div>
                )}
                
                {selectedRequest.status !== 'Pending' && (
                  <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        selectedRequest.status === 'Approved' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                      )}>
                        {selectedRequest.status === 'Approved' ? <Check size={20} /> : <X size={20} />}
                      </div>
                      <div>
                        <p className="text-sm font-black text-zinc-900 dark:text-white">
                          {selectedRequest.status} {lang === 'en' ? 'by' : 'بواسطة'} {selectedRequest.processor_name}
                        </p>
                        <p className="text-xs font-bold text-zinc-500">
                          {formatDate(selectedRequest.updated_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
