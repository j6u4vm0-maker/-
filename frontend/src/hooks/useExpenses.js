import { useState, useMemo, useCallback, useEffect } from 'react';
import axios from 'axios';

export const useExpenses = (API_BASE) => {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [allConfigs, setAllConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [openingBalance, setOpeningBalance] = useState(208067);
  const [balanceThreshold, setBalanceThreshold] = useState(15000);
  const [isAdding, setIsAdding] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const updateConfig = async (key, value) => {
    try {
      await axios.post(`${API_BASE}/config`, { key, value });
      setAllConfigs(prev => ({ ...prev, [key]: value }));
    } catch (err) {
      console.error('Config update failed:', err);
    }
  };
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });
  const [showArchived, setShowArchived] = useState(false);
  const [filters, setFilters] = useState({
    category: 'all',
    personnel: 'all',
    status: 'all',
    startDate: '',
    endDate: ''
  });
  const [selectedIds, setSelectedIds] = useState([]);

  const initialFormData = {
    invoice_date: new Date().toISOString().split('T')[0],
    reimbursement_date: new Date().toISOString().split('T')[0],
    settlement_date: '',
    supplier_name: '',
    category_id: '',
    detail_en: '',
    detail_zh: '',
    personnel_id: '',
    incoming: '',
    outgoing: '',
    has_bill: true,
    pay_status: 'PAID',
    no_bill_reason_zh: '',
    no_bill_reason_en: '',
  };


  const [formData, setFormData] = useState(initialFormData);
  const [editingId, setEditingId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        axios.get(`${API_BASE}/expenses`, { params: { is_archived: showArchived ? 'true' : 'false' } }),
        axios.get(`${API_BASE}/categories`),
        axios.get(`${API_BASE}/suppliers`),
        axios.get(`${API_BASE}/personnel`),
        axios.get(`${API_BASE}/config`),
        axios.get(`${API_BASE}/permissions`)
      ]);

      const [expRes, catRes, supRes, perRes, configRes, permRes] = results;
      
      if (expRes.status === 'fulfilled') setExpenses(expRes.value.data);
      if (catRes.status === 'fulfilled') setCategories(catRes.value.data);
      if (supRes.status === 'fulfilled') setSuppliers(supRes.value.data);
      if (perRes.status === 'fulfilled') setPersonnel(perRes.value.data);
      
      const combinedConfigs = { 
        ...(configRes.status === 'fulfilled' ? configRes.value.data : {}), 
        ...(permRes.status === 'fulfilled' ? permRes.value.data : {}) 
      };
      setAllConfigs(combinedConfigs);
      if (combinedConfigs.balance_threshold) setBalanceThreshold(Number(combinedConfigs.balance_threshold));
      if (combinedConfigs.opening_balance) setOpeningBalance(Number(combinedConfigs.opening_balance));
    } catch (err) {
      console.error('Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  }, [API_BASE, showArchived]);

  const resetForm = () => {
    setFormData(initialFormData);
    setEditingId(null);
    setSearchTerm('');
    setFilters({ category: 'all', personnel: 'all', status: 'all', startDate: '', endDate: '' });
  };

  const handleEditRecord = (exp) => {
    setFormData({
      ...initialFormData,
      ...exp,
      invoice_date: exp.invoice_date || '',
      reimbursement_date: exp.reimbursement_date || '',
    });
    if (exp.image_path) {
      setPreviewUrl(`${API_BASE.replace('/api', '')}${exp.image_path}`);
    } else {
      setPreviewUrl(null);
    }
    setEditingId(exp.id);
    setIsAdding(true);
  };

  const filteredExpenses = useMemo(() => {
    if (!Array.isArray(expenses)) return [];
    return expenses.filter(exp => {
      if (!exp) return false;
      const matchesSearch = (exp.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (exp.detail_zh || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filters.category === 'all' || exp.category_id == filters.category;
      const matchesPersonnel = filters.personnel === 'all' || exp.personnel_id == filters.personnel;
      const matchesStatus = filters.status === 'all' || 
                            (filters.status === 'PAID' ? exp.pay_status === 'PAID' : exp.pay_status !== 'PAID');
      const expDate = exp.invoice_date || '';
      const matchesStartDate = !filters.startDate || expDate >= filters.startDate;
      const matchesEndDate = !filters.endDate || expDate <= filters.endDate;

      return matchesSearch && matchesCategory && matchesPersonnel && matchesStatus && matchesStartDate && matchesEndDate;
    });
    // Removed sorting here to keep chronological balance logic simpler, or sort by date/id first
  }, [expenses, searchTerm, filters]);

  const ledgerData = useMemo(() => {
    if (!Array.isArray(filteredExpenses)) return [];
    let balance = Number(openingBalance) || 0;
    const sorted = [...filteredExpenses].sort((a, b) => {
      const dateA = new Date(a.invoice_date || 0);
      const dateB = new Date(b.invoice_date || 0);
      const diff = (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
      return diff !== 0 ? diff : (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    return sorted.map(exp => {
      balance = balance + (Number(exp.incoming) || 0) - (Number(exp.outgoing) || 0);
      return { ...exp, runningBalance: balance };
    });
  }, [filteredExpenses, openingBalance]);

  const stats = useMemo(() => {
    if (!Array.isArray(expenses)) return { totalBalance: 0, pendingBalance: 0, actualCash: 0 };
    return expenses.reduce((acc, e) => {
      if (!e) return acc;
      const inc = Number(e.incoming) || 0;
      const out = Number(e.outgoing) || 0;
      const isPaid = e.pay_status === 'PAID';
      acc.totalBalance += (inc - out);
      if (!isPaid) acc.pendingBalance += (out + inc);
      if (isPaid || inc > 0) acc.actualCash += (inc - (isPaid ? out : 0));
      return acc;
    }, { totalBalance: 0, pendingBalance: 0, actualCash: 0 });
  }, [expenses]);

  const togglePayment = async (id, status) => {
    try {
      // Find current status from local state if not passed
      let currentStatus = status;
      if (!currentStatus) {
        const exp = expenses.find(e => String(e.id) === String(id));
        currentStatus = exp?.pay_status;
      }
      const newStatus = currentStatus === 'PAID' ? 'TO_PAY' : 'PAID';
      // Use PUT which is supported by backend AND allowed by CORS
      await axios.put(`${API_BASE}/expenses/${id}`, { pay_status: newStatus });
      await fetchData();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };


  const deleteExpense = async (id, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('確定要刪除此紀錄嗎？')) return;
    try {
      await axios.delete(`${API_BASE}/expenses/${id}`);
      await fetchData();
    } catch (err) {
      alert('刪除失敗');
    }
  };

  const archiveExpenses = async (ids) => {
    if (!ids || ids.length === 0) return;
    if (!window.confirm(`確定要將選中的 ${ids.length} 筆紀錄存檔嗎？`)) return;
    try {
      await axios.post(`${API_BASE}/expenses/archive`, { ids });
      await fetchData();
      return true;
    } catch (err) {
      alert('存檔失敗');
      return false;
    }
  };

  const restoreExpenses = async (ids) => {
    if (!ids || ids.length === 0) return;
    if (!window.confirm(`確定要將選中的 ${ids.length} 筆紀錄退回至收支帳嗎？`)) return;
    try {
      // We can use the same batch logic but on the backend we might need a separate endpoint or just a loop
      // For now, let's assume we use a loop or a new endpoint. 
      // Let's create a new endpoint /api/expenses/restore on backend or use PUT
      await axios.post(`${API_BASE}/expenses/restore`, { ids });
      await fetchData();
      return true;
    } catch (err) {
      alert('退回失敗');
      return false;
    }
  };

  const handleBlurTranslate = async (sourceField, targetField) => {
    const text = formData[sourceField];
    if (!text || text.trim().length < 2) return;
    
    // Forced update: Always sync translation even if target has content
    // but skip if the content is exactly the same to save API calls
    if (formData[targetField] === text) return;

    try {
      const res = await axios.post(`${API_BASE}/translate`, { text });
      if (res.data.text) {
        setFormData(prev => ({ ...prev, [targetField]: res.data.text }));
      }
    } catch (err) {
      console.error('Translation failed:', err);
    }
  };

  return {
    expenses, categories, suppliers, personnel, allConfigs, loading,
    formData, setFormData, editingId, setEditingId,
    searchTerm, setSearchTerm, sortConfig, setSortConfig, filters, setFilters,
    showArchived, setShowArchived,
    fetchData, resetForm, handleEditRecord, togglePayment, deleteExpense, archiveExpenses, restoreExpenses, handleBlurTranslate,
    filteredExpenses, ledgerData, stats, initialFormData, selectedIds, setSelectedIds,
    isAdding, setIsAdding, previewUrl, setPreviewUrl, openingBalance, setOpeningBalance,
    balanceThreshold, setBalanceThreshold, updateConfig
  };
};
