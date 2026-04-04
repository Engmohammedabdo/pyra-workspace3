'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Shield } from 'lucide-react';
import { StateRenderer } from '@/components/share/StateRenderer';

export default function ShareDownloadPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<any>({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [verifiedPassword, setVerifiedPassword] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/shares/verify/${token}`).then(res => res.json()).then(json => {
      if (!json.success) setState({ status: 'error', message: json.error, code: 404 });
      else setState(json.data.requiresPassword ? { status: 'password_required', info: json.data } : { status: 'ready', info: json.data });
    });
  }, [token]);

  const handlePasswordSubmit = async () => {
    setVerifying(true);
    const res = await fetch(`/api/shares/verify/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const json = await res.json();
    if (!json.success) setPasswordError(json.error);
    else { setVerifiedPassword(password); setState({ status: 'ready', info: state.info }); }
    setVerifying(false);
  };

  const handleDownload = async () => {
    setState({ status: 'downloading' });
    let url = `/api/shares/download/${token}`;
    if (verifiedPassword) url += `?password=${encodeURIComponent(verifiedPassword)}`;
    const res = await fetch(url);
    if (!res.ok) { setState({ status: 'error', message: 'فشل التحميل' }); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.info.file_name;
    a.click();
    setState({ status: 'downloaded', info: state.info });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-portal/5 to-white flex items-center justify-center p-4 font-sans" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-6"><div className="inline-flex items-center gap-2 text-portal font-bold text-xl"><Shield className="h-6 w-6" /><span>Pyra Workspace</span></div><p className="text-sm text-muted-foreground mt-1">مشاركة ملف آمنة</p></div>
        <div className="rounded-2xl border bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
          <StateRenderer {...{ state, password, setPassword, passwordError, setPasswordError, showPassword, setShowPassword, handlePasswordSubmit, verifying, handleDownload }} />
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">&copy; {new Date().getFullYear()} PYRAMEDIA X</p>
      </div>
    </div>
  );
}
