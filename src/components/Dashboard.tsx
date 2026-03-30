import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../lib/utils';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Settings, 
  LogOut, 
  Globe, 
  Plus, 
  Filter,
  Search,
  ChevronRight,
  Code,
  Eye,
  EyeOff,
  FileText,
  History,
  Download,
  Menu as MenuIcon,
  X,
  AlertCircle,
  Clock,
  Sun,
  Moon,
  RefreshCw,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/utils';
import { Brand, Product, DynamicField, FieldOption, User, AuditLog } from '../types';
import MarketingView from './views/MarketingView';
import CodingView from './views/CodingView';
import TechnicalView from './views/TechnicalView';
import TechnicalBackOfficeView from './views/TechnicalBackOfficeView';
import CallCenterView from './views/CallCenterView';
import ManagerView from './views/ManagerView';
import HideUnhideContainer from './views/HideUnhideContainer';
import HideItemConfigView from './views/HideItemConfigView';
import AnalyticsView from './views/AnalyticsView';
import UserKPIView from './views/UserKPIView';
import LateOrdersView from './views/LateOrdersView';
import { BarChart3, Activity, Inbox, Bell, Volume2 } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

export default function Dashboard() {
  const { user, logout, lang, setLang } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const lastMessage = useWebSocket();

  useEffect(() => {
    if (lastMessage?.type === 'DEDICATION_ALERT') {
      const alertData = lastMessage.data;
      const isRelevant = 
        (user?.role_name === 'Call Center' && user.id === alertData.call_center_user_id) ||
        (user?.role_name === 'Restaurants' && 
          (user.brand_id === alertData.brand_id || user.brand_ids?.includes(alertData.brand_id)) &&
          (!user.branch_id || user.branch_id === alertData.branch_id));

      if (isRelevant) {
        setActiveAlert(alertData);
        // Play sound if possible
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play();
        } catch (e) {}
      }
    }
  }, [lastMessage, user]);

  const t = {
    en: {
      dashboard: "Dashboard",
      products: "Add Products",
      users: "User Management",
      fields: "Form Products",
      logs: "Audit Logs",
      logout: "Logout",
      welcome: "Welcome back,",
      technical: "All Products",
      busyPeriods: "Busy Branch",
      busyConfig: "Busy Branch Form",
      hideUnhide: "Hide / Unhide",
      hideItemConfig: "Form Hide Item",
      analytics: "Reports / Analytics",
      brands: "Brands",
      coding: "Product Coding",
      myKpi: "My KPI",
      lateOrders: "Call Center Cases",
      callCenterConfig: "Call Center Config",
    },
    ar: {
      dashboard: "لوحة التحكم",
      products: "إضافة منتجات",
      users: "إدارة المستخدمين",
      fields: "نموذج المنتجات",
      logs: "سجلات المراجعة",
      logout: "تسجيل الخروج",
      welcome: "مرحباً بك،",
      technical: "كل المنتجات",
      busyPeriods: "فروع مزدحمة",
      busyConfig: "نموذج الفروع المزدحمة",
      hideUnhide: "إخفاء / إظهار",
      hideItemConfig: "نموذج إخفاء المنتجات",
      analytics: "التقارير / التحليلات",
      brands: "العلامات التجارية",
      coding: "تكويد المنتجات",
      myKpi: "مؤشرات الأداء الخاصة بي",
      lateOrders: "حالات مركز الاتصال",
      callCenterConfig: "إعدادات مركز الاتصال",
    }
  }[lang];

  const menuItems = [
    { id: 'products', label: t.products, icon: Package, roles: ["Marketing Team", "Technical Team", "Technical Back Office", "Call Center", "Manager", "Super Visor"] },
    { id: 'coding', label: t.coding, icon: Tag, roles: ["Coding Team", "Technical Team", "Manager", "Super Visor"] },
    { id: 'technical', label: t.technical, icon: Code, roles: ["Technical Team", "Manager", "Marketing Team", "Restaurants", "Super Visor"] },
    { id: 'fields', label: t.fields, icon: Settings, roles: ["Manager"] },
    { id: 'hide_unhide', label: t.hideUnhide, icon: EyeOff, roles: ["Technical Back Office", "Manager", "Call Center", "Restaurants", "Super Visor"] },
    { id: 'hide_item_config', label: t.hideItemConfig, icon: Settings, roles: ["Manager"] },
    { id: 'late_orders', label: t.lateOrders, icon: Clock, roles: ["Call Center", "Restaurants", "Manager", "Technical Back Office", "Super Visor"] },
    { id: 'busy_periods', label: t.busyPeriods, icon: AlertCircle, roles: ["Technical Back Office", "Manager", "Restaurants", "Super Visor"] },
    { id: 'busy_config', label: t.busyConfig, icon: Settings, roles: ["Manager"] },
    { id: 'call_center_config', label: t.callCenterConfig, icon: Settings, roles: ["Manager", "Super Visor"] },
    { id: 'logs', label: t.logs, icon: History, roles: ["Manager", "Super Visor"] },
    { id: 'analytics', label: t.analytics, icon: BarChart3, roles: ["Manager", "Super Visor"] },
    { id: 'user_kpi', label: t.myKpi, icon: Activity, roles: ["Marketing Team", "Technical Team", "Technical Back Office", "Call Center", "Coding Team", "Super Visor"] },
    { id: 'users', label: t.users, icon: Users, roles: ["Manager", "Super Visor"] },
  ].filter(item => item.roles.includes(user?.role_name || ''));

  const [activeTab, setActiveTab] = useState<string>(menuItems[0]?.id || 'products');

  const renderView = () => {
    if (activeTab === 'products') {
      const role = user?.role_name || '';
      if (role.startsWith('Marketing') || role === 'Technical Team' || role === 'Technical Back Office') {
        return <MarketingView />;
      }
      switch (role) {
        case 'Call Center': return <CallCenterView />;
        case 'Manager':
        case 'Super Visor': return <MarketingView isManager />;
        default: return null;
      }
    }
    if (activeTab === 'coding') {
      return <CodingView />;
    }
    if (activeTab === 'technical') {
      return <TechnicalView />;
    }
    if (activeTab === 'busy_periods') {
      return <TechnicalBackOfficeView />;
    }
    if (activeTab === 'hide_unhide') {
      return <HideUnhideContainer />;
    }
    if (activeTab === 'hide_item_config') {
      return <HideItemConfigView />;
    }
    if (activeTab === 'late_orders') {
      return <LateOrdersView />;
    }
    if (activeTab === 'analytics') {
      return <AnalyticsView />;
    }
    if (activeTab === 'user_kpi') {
      return <UserKPIView />;
    }
    if (user?.role_name === 'Manager' || user?.role_name === 'Super Visor') {
      return <ManagerView activeTab={activeTab} />;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex transition-colors duration-500">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 transition-all duration-500 flex flex-col z-[70] fixed inset-y-0 left-0 lg:relative",
        isSidebarOpen ? "w-72" : "w-24",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-8 flex items-center justify-between">
          <AnimatePresence mode="wait">
            {(isSidebarOpen || isMobileMenuOpen) ? (
              <motion.div
                key="logo-full"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/20">
                  <span className="text-white font-black text-xl tracking-tighter">S</span>
                </div>
                <h1 className="text-xl font-display font-black text-zinc-900 dark:text-white tracking-tight">Swish Menu</h1>
              </motion.div>
            ) : (
              <motion.div
                key="logo-small"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/20 mx-auto"
              >
                <span className="text-white font-black text-xl tracking-tighter">S</span>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Close button for mobile */}
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 text-zinc-400 hover:text-brand"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto py-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all duration-300 relative group",
                activeTab === item.id 
                  ? "text-brand" 
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              {activeTab === item.id && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute inset-0 bg-brand/5 dark:bg-brand/10 border border-brand/20 rounded-2xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <item.icon size={22} className={cn(
                "shrink-0 transition-transform duration-300 group-hover:scale-110 relative z-10",
                activeTab === item.id ? "text-brand" : "text-zinc-400 dark:text-zinc-500"
              )} />
              {(isSidebarOpen || isMobileMenuOpen) && (
                <span className="font-bold text-sm tracking-tight relative z-10 whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-4 p-3 rounded-2xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </div>
            {(isSidebarOpen || isMobileMenuOpen) && <span className="font-bold text-sm">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>}
          </button>
          
          <button
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="w-full flex items-center gap-4 p-3 rounded-2xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Globe size={18} />
            </div>
            {(isSidebarOpen || isMobileMenuOpen) && <span className="font-bold text-sm">{lang === 'en' ? 'العربية' : 'English'}</span>}
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center gap-4 p-3 rounded-2xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <LogOut size={18} />
            </div>
            {(isSidebarOpen || isMobileMenuOpen) && <span className="font-bold text-sm">{t.logout}</span>}
          </button>
        </div>

        {/* Toggle Button (Desktop only) */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
          className="hidden lg:flex absolute -right-4 top-10 w-8 h-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full items-center justify-center text-zinc-400 hover:text-brand shadow-lg transition-all z-50"
        >
          {isSidebarOpen ? <X size={14} /> : <MenuIcon size={14} />}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 px-6 lg:px-10 py-5 flex items-center justify-between z-40">
          <div className="flex items-center gap-4 lg:gap-6">
            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-zinc-500 hover:text-brand bg-zinc-100 dark:bg-zinc-800 rounded-xl"
            >
              <MenuIcon size={20} />
            </button>
            
            <div>
              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-1">{t.welcome}</p>
              <h2 className="text-lg lg:text-xl font-display font-black text-zinc-900 dark:text-white tracking-tight truncate max-w-[150px] md:max-w-none">
                {user?.username} <span className="text-brand font-light ml-2 text-xs lg:text-sm opacity-70">/ {user?.role_name}</span>
              </h2>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-8 h-8 lg:w-10 lg:h-10 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                  <img src={`https://picsum.photos/seed/user${i}/100/100`} alt="User" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-12 scroll-smooth">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ 
                type: "spring",
                stiffness: 260,
                damping: 20
              }}
              className="max-w-7xl mx-auto w-full"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Strong Alert Modal */}
        <AnimatePresence>
          {activeAlert && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
                onClick={() => setActiveAlert(null)}
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-brand"
              >
                <div className="bg-brand p-8 text-white text-center relative">
                  <div className="absolute top-4 right-4">
                    <button 
                      onClick={() => setActiveAlert(null)}
                      className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>
                  <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-bounce">
                    <Bell size={40} className="text-white" />
                  </div>
                  <h3 className="text-3xl font-display font-black tracking-tight mb-2">
                    {lang === 'en' ? 'DEDICATION ALERT!' : 'تنبيه إهداء!'}
                  </h3>
                  <p className="text-white/80 font-medium">
                    {lang === 'en' ? 'Time to process the dedication request' : 'حان وقت معالجة طلب الإهداء'}
                  </p>
                </div>
                
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Order ID</p>
                      <p className="text-lg font-black text-zinc-900 dark:text-white">#{activeAlert.order_id}</p>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Customer</p>
                      <p className="text-lg font-black text-zinc-900 dark:text-white truncate">{activeAlert.customer_name}</p>
                    </div>
                  </div>

                  <div className="bg-brand/5 dark:bg-brand/10 p-6 rounded-3xl border-2 border-brand/10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-brand rounded-2xl flex items-center justify-center shrink-0">
                        <Volume2 className="text-white" size={24} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{activeAlert.brand_name}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{activeAlert.branch_name}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveAlert(null)}
                    className="w-full py-4 bg-brand text-white rounded-2xl font-black text-lg shadow-lg shadow-brand/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    {lang === 'en' ? 'ACKNOWLEDGE' : 'تم الاستلام'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
