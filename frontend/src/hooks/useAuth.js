import { useState } from 'react';
import axios from 'axios';

export const useAuth = (API_BASE) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('petty_cash_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = async (employee_id, password) => {
    try {
      const res = await axios.post(`${API_BASE}/login`, { employee_id, password });
      if (res.data.success) {
        setUser(res.data.user);
        localStorage.setItem('petty_cash_user', JSON.stringify(res.data.user));
        return { success: true, user: res.data.user };
      }
    } catch (err) {
      console.error('Login Failed:', err.response?.data || err.message);
      localStorage.removeItem('petty_cash_user'); // 確保失敗時清除
      return { success: false, error: err.response?.data?.error || '登入失敗' };
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('petty_cash_user');
  };

  const getPermissions = (roleId, allConfigs) => {
    const key = `perms_${roleId}`;
    try {
      if (allConfigs[key]) {
        const parsed = typeof allConfigs[key] === 'string' ? JSON.parse(allConfigs[key]) : allConfigs[key];
        if (parsed && parsed.modules) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse permissions');
    }
    
    // Default Fallbacks
    const r = (roleId || '').toLowerCase();
    if (r === 'admin') return { modules: { dashboard: true, ledger: true, suppliers: true, settings: true, permissions: true }, actions: { add: true, edit: true, delete: true, payment: true, archive: true } };
    if (r === 'manager') return { modules: { dashboard: true, ledger: true, suppliers: true }, actions: { add: true, edit: true } };
    if (r === 'finance') return { modules: { dashboard: true, ledger: true }, actions: { add: true, edit: true, payment: true } };
    return { modules: { ledger: true, dashboard: true }, actions: { add: true } };
  };

  return {
    user,
    handleLogin,
    handleLogout,
    getPermissions
  };
};
