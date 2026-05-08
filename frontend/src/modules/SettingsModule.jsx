import React, { useState } from 'react';
import axios from 'axios';
import { Settings, PlusCircle, X, FileText, CheckCircle, Database, Edit3, Trash2, TrendingUp } from 'lucide-react';
import { useExpenseContext } from '../context/ExpenseContext';
import { motion, AnimatePresence } from 'framer-motion';

const FormGroup = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
    {children}
  </div>
);

export function SettingsModule() {
  const { categories = [], API_BASE, fetchData } = useExpenseContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name_zh: '', name_en: '', account_code: '', type: 'EXPENSE' });

  const handleOpenModal = (cat = null) => {
    if (cat) {
      setEditingCategory(cat);
      setFormData({ ...cat });
    } else {
      setEditingCategory(null);
      setFormData({ name_zh: '', name_en: '', account_code: '', type: 'EXPENSE' });
    }
    setIsModalOpen(true);
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await axios.put(`${API_BASE}/categories/${editingCategory.id}`, formData);
      } else {
        await axios.post(`${API_BASE}/categories`, formData);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err) { alert('操作失敗: ' + err.message); }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('確定要刪除此類別嗎？')) return;
    try {
      await axios.delete(`${API_BASE}/categories/${id}`);
      fetchData();
    } catch (err) { alert('刪除失敗'); }
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center">
         <div>
            <h3 className="text-3xl font-black tracking-tighter uppercase mb-1">系統設定 Settings</h3>
            <p className="text-slate-400 text-sm font-medium">會計科目與系統參數配置</p>
         </div>
         <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-[24px] font-bold shadow-xl hover:bg-slate-800 transition-all active:scale-95">
            <PlusCircle className="w-5 h-5" /> 新增科目
         </button>
      </div>

      <div className="bg-white rounded-[48px] border border-slate-100 shadow-xl overflow-hidden">
         <div className="p-10 border-b border-slate-50 flex items-center gap-4">
            <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center"><Database className="w-5 h-5" /></div>
            <h4 className="text-xl font-black text-slate-900 italic tracking-tighter">會計科目清單 CATEGORIES LIST</h4>
         </div>
         
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                     <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">中文名稱 ZH Name</th>
                     <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">英文名稱 EN Name</th>
                     <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">會計編號 CODE</th>
                     <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">類型 TYPE</th>
                     <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">編輯/刪除 ACTIONS</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {categories.map(c => (
                     <tr key={c.id} className="hover:bg-slate-50 transition-all group">
                        <td className="px-10 py-5 font-bold text-slate-800">{c.name_zh}</td>
                        <td className="px-10 py-5 font-black text-[10px] text-slate-400 uppercase tracking-wider">{c.name_en || '---'}</td>
                        <td className="px-10 py-5 text-center"><span className="bg-slate-100 px-4 py-1.5 rounded-xl font-mono text-xs font-black text-slate-600">{c.account_code || 'N/A'}</span></td>
                        <td className="px-10 py-5 text-center">
                           <div className="flex justify-center">
                              {c.type === 'EXPENSE' ? (
                                <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[10px] font-black bg-rose-600 text-white shadow-lg shadow-rose-600/20">
                                   <TrendingUp className="w-3 h-3 rotate-180" /> 支出 EXPENSE
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[10px] font-black bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                                   <TrendingUp className="w-3 h-3" /> 收入 INCOME
                                </span>
                              )}
                           </div>
                        </td>
                        <td className="px-10 py-5 text-right">
                           <div className="flex items-center justify-end gap-3">
                              <button onClick={() => handleOpenModal(c)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-md active:scale-95">
                                 <Edit3 className="w-4 h-4" />
                                 <span className="text-[10px] font-black uppercase tracking-widest">編輯 EDIT</span>
                              </button>
                              <button onClick={() => handleDeleteCategory(c.id)} className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-all shadow-md active:scale-95">
                                 <Trash2 className="w-4 h-4" />
                                 <span className="text-[10px] font-black uppercase tracking-widest">刪除 DEL</span>
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-[60px] p-12 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-3xl font-black tracking-tighter uppercase italic">{editingCategory ? '編輯會計科目 Info' : '新增會計科目 New'}</h3>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-100 hover:bg-rose-500 hover:text-white rounded-full transition-all"><X className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSaveCategory} className="space-y-6">
                  <FormGroup label="中文名稱 ZH Name"><input required className="w-full p-5 bg-slate-50 rounded-[22px] outline-none font-bold focus:ring-4 focus:ring-indigo-500/10 border-2 border-transparent focus:border-indigo-500" value={formData.name_zh} onChange={e => setFormData({...formData, name_zh: e.target.value})} /></FormGroup>
                  <FormGroup label="英文名稱 EN Name"><input required className="w-full p-5 bg-slate-50 rounded-[22px] outline-none font-bold focus:ring-4 focus:ring-indigo-500/10 border-2 border-transparent focus:border-indigo-500" value={formData.name_en} onChange={e => setFormData({...formData, name_en: e.target.value})} /></FormGroup>
                  <FormGroup label="會計編號 Account Code"><input placeholder="e.g. 5101-01" className="w-full p-5 bg-slate-100 rounded-[22px] outline-none font-mono font-black text-brand-600 border-2 border-brand-200 focus:border-brand-600" value={formData.account_code || ''} onChange={e => setFormData({...formData, account_code: e.target.value})} /></FormGroup>
                  <FormGroup label="類型 Type">
                      <select className="w-full p-5 bg-slate-50 rounded-[22px] outline-none font-bold cursor-pointer" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                        <option value="EXPENSE">EXPENSE (支出)</option>
                        <option value="INCOME">INCOME (收入)</option>
                      </select>
                  </FormGroup>
                  <button type="submit" className="w-full py-6 bg-indigo-600 text-white rounded-[32px] font-black text-xl shadow-2xl shadow-indigo-600/30 active:scale-95 transition-all mt-4">儲存變更 SAVE</button>
                </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
