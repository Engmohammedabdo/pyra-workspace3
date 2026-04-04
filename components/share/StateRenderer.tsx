'use client';

import { Loader2, AlertCircle, Lock, EyeOff, User, Clock, Download, CheckCircle2 } from 'lucide-react';
import { formatBytes, getFileIcon, getFileExtension, relativeTime } from './utils';

interface StateRendererProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared page state machine
  state: any;
  password: string;
  setPassword: (v: string) => void;
  passwordError: string;
  setPasswordError: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  handlePasswordSubmit: () => void;
  verifying: boolean;
  handleDownload: () => void;
}

export const StateRenderer = ({ state, password, setPassword, passwordError, setPasswordError, showPassword, setShowPassword, handlePasswordSubmit, verifying, handleDownload }: StateRendererProps) => {
  if (state.status === 'loading') return <div className="flex flex-col items-center justify-center py-16 px-6"><Loader2 className="h-10 w-10 animate-spin text-portal mb-4" /><p className="text-muted-foreground">جاري التحقق...</p></div>;
  if (state.status === 'error') return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mb-4"><AlertCircle className="h-8 w-8 text-red-500" /></div>
      <h2 className="text-lg font-semibold mb-2">{state.code === 410 ? 'رابط منتهي' : 'رابط غير صالح'}</h2>
      <p className="text-sm text-muted-foreground">{state.message}</p>
    </div>
  );
  if (state.status === 'password_required') return (
    <div className="py-10 px-6">
      <div className="flex flex-col items-center mb-6">
        <div className="h-16 w-16 rounded-full bg-portal/10 flex items-center justify-center mb-3"><Lock className="h-8 w-8 text-portal" /></div>
        <h2 className="text-lg font-semibold">ملف محمي بكلمة مرور</h2>
      </div>
      <div className="space-y-3">
        <div className="relative">
          <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }} className="w-full h-11 px-4 pe-10 rounded-xl border bg-neutral-50 text-sm focus:ring-2 focus:ring-portal" placeholder="كلمة المرور" />
          <button onClick={() => setShowPassword(!showPassword)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"><EyeOff className="h-4 w-4" /></button>
        </div>
        {passwordError && <p className="text-sm text-red-500 text-center">{passwordError}</p>}
        <button onClick={handlePasswordSubmit} disabled={!password.trim() || verifying} className="w-full h-11 rounded-xl bg-portal text-white font-medium text-sm transition-colors">{verifying ? 'جاري التحقق...' : 'فتح الملف'}</button>
      </div>
    </div>
  );
  if (state.status === 'ready' || state.status === 'downloaded') return (
    <>
      <div className="flex flex-col items-center pt-8 pb-4 px-6">
        <div className="h-20 w-20 rounded-2xl bg-portal/5 flex items-center justify-center text-portal mb-3 relative">
          {getFileIcon(state.info.mime_type)}
          {getFileExtension(state.info.file_name) && <span className="absolute -bottom-1 -left-1 bg-portal text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{getFileExtension(state.info.file_name)}</span>}
        </div>
        <h2 className="text-base font-semibold text-center break-all">{state.info.file_name}</h2>
        <span className="text-sm text-muted-foreground mt-1">{formatBytes(state.info.file_size)}</span>
      </div>
      <div className="px-6 pb-4 space-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2"><User className="h-4 w-4" /><span>بواسطة <strong>{state.info.shared_by}</strong></span></div>
        {state.info.expires_at && <div className="flex items-center gap-2"><Clock className="h-4 w-4" /><span>{new Date(state.info.expires_at) > new Date() ? `ينتهي ${relativeTime(state.info.expires_at)}` : 'منتهي'}</span></div>}
      </div>
      <div className="border-t mx-6" />
      <div className="p-6">
        {state.status === 'downloaded' ? (
          <div className="space-y-3"><div className="flex items-center justify-center gap-2 text-green-600"><CheckCircle2 className="h-5 w-5" /><span className="text-sm">تم التحميل</span></div><button onClick={handleDownload} className="w-full h-11 rounded-xl bg-neutral-100">تحميل مرة أخرى</button></div>
        ) : (
          <button onClick={handleDownload} className="w-full h-12 rounded-xl bg-portal text-white font-medium flex items-center justify-center gap-2"><Download className="h-5 w-5" /> تحميل الملف</button>
        )}
      </div>
    </>
  );
  return <div className="flex flex-col items-center justify-center py-16 px-6"><Loader2 className="h-10 w-10 animate-spin text-portal mb-4" /><p className="text-muted-foreground">جاري التحميل...</p></div>;
};
