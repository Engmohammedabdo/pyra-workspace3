'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Download,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  File,
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Shield,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────
interface ShareInfo {
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  shared_by: string;
  created_at: string;
  expires_at: string | null;
  downloads_remaining: number | null;
  requiresPassword?: boolean;
}

type PageState =
  | { status: 'loading' }
  | { status: 'password_required'; info: ShareInfo }
  | { status: 'ready'; info: ShareInfo }
  | { status: 'downloading' }
  | { status: 'downloaded'; info: ShareInfo }
  | { status: 'error'; message: string; code?: number };

// ── Helpers ──────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(mime: string | null) {
  if (!mime) return <File className="h-12 w-12" />;
  if (mime.startsWith('image/')) return <Image className="h-12 w-12" />;
  if (mime.startsWith('video/')) return <Film className="h-12 w-12" />;
  if (mime.startsWith('audio/')) return <Music className="h-12 w-12" />;
  if (mime.includes('pdf') || mime.includes('document') || mime.includes('text'))
    return <FileText className="h-12 w-12" />;
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('7z'))
    return <Archive className="h-12 w-12" />;
  return <File className="h-12 w-12" />;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : '';
}

function relativeTime(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const isFuture = diff > 0;

  if (absDiff < 60_000) return 'الآن';
  if (absDiff < 3_600_000) {
    const m = Math.floor(absDiff / 60_000);
    return isFuture ? `بعد ${m} دقيقة` : `منذ ${m} دقيقة`;
  }
  if (absDiff < 86_400_000) {
    const h = Math.floor(absDiff / 3_600_000);
    return isFuture ? `بعد ${h} ساعة` : `منذ ${h} ساعة`;
  }
  const d = Math.floor(absDiff / 86_400_000);
  return isFuture ? `بعد ${d} يوم` : `منذ ${d} يوم`;
}

// ── Page Component ───────────────────────────────────────────
export default function ShareDownloadPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  // Store verified password for download
  const [verifiedPassword, setVerifiedPassword] = useState('');

  // Verify token on mount
  useEffect(() => {
    if (!token) return;

    fetch(`/api/shares/verify/${token}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          setState({
            status: 'error',
            message: json.error || 'رابط المشاركة غير صالح',
            code: res.status,
          });
          return;
        }
        if (json.data.requiresPassword) {
          setState({ status: 'password_required', info: json.data });
        } else {
          setState({ status: 'ready', info: json.data });
        }
      })
      .catch(() => {
        setState({ status: 'error', message: 'حدث خطأ في الاتصال بالخادم' });
      });
  }, [token]);

  // Password verification handler
  const handlePasswordSubmit = async () => {
    if (!password.trim()) return;
    setVerifying(true);
    setPasswordError('');

    try {
      const res = await fetch(`/api/shares/verify/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setPasswordError(json.error || 'كلمة المرور غير صحيحة');
        return;
      }

      setVerifiedPassword(password);
      if (state.status === 'password_required') {
        setState({ status: 'ready', info: state.info });
      }
    } catch {
      setPasswordError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setVerifying(false);
    }
  };

  // Download handler
  const handleDownload = async () => {
    if (state.status !== 'ready' && state.status !== 'downloaded') return;
    const info = state.info;

    setState({ status: 'downloading' });

    try {
      // Include password in download URL if it was verified
      let downloadUrl = `/api/shares/download/${token}`;
      if (verifiedPassword) {
        downloadUrl += `?password=${encodeURIComponent(verifiedPassword)}`;
      }

      const res = await fetch(downloadUrl);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setState({
          status: 'error',
          message: json?.error || 'فشل تحميل الملف',
          code: res.status,
        });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = info.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setState({ status: 'downloaded', info });
    } catch {
      setState({ status: 'error', message: 'حدث خطأ أثناء التحميل' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-portal/5 to-white dark:from-neutral-950 dark:to-neutral-900 flex items-center justify-center p-4 font-sans" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-portal dark:text-portal font-bold text-xl">
            <Shield className="h-6 w-6" />
            <span>Pyra Workspace</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">مشاركة ملف آمنة</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
          {/* ── Loading ── */}
          {state.status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="h-10 w-10 animate-spin text-portal mb-4" />
              <p className="text-muted-foreground">جاري التحقق من الرابط...</p>
            </div>
          )}

          {/* ── Error ── */}
          {state.status === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center mb-4">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold mb-2">
                {state.code === 410 ? 'رابط منتهي الصلاحية' : 'رابط غير صالح'}
              </h2>
              <p className="text-sm text-muted-foreground">{state.message}</p>
            </div>
          )}

          {/* ── Password Required ── */}
          {state.status === 'password_required' && (
            <div className="py-10 px-6">
              <div className="flex flex-col items-center mb-6">
                <div className="h-16 w-16 rounded-full bg-portal/10 dark:bg-portal/20 flex items-center justify-center mb-3">
                  <Lock className="h-8 w-8 text-portal" />
                </div>
                <h2 className="text-lg font-semibold">ملف محمي بكلمة مرور</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  أدخل كلمة المرور للوصول إلى الملف
                </p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
                    placeholder="كلمة المرور"
                    className="w-full h-11 px-4 pe-10 rounded-xl border bg-neutral-50 dark:bg-neutral-800 text-sm focus:outline-none focus:ring-2 focus:ring-portal"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {passwordError && (
                  <p className="text-sm text-red-500 text-center">{passwordError}</p>
                )}

                <button
                  onClick={handlePasswordSubmit}
                  disabled={!password.trim() || verifying}
                  className="w-full h-11 rounded-xl bg-portal hover:bg-portal-secondary disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {verifying ? 'جاري التحقق...' : 'فتح الملف'}
                </button>
              </div>

              {/* Shared by info */}
              <div className="mt-6 pt-4 border-t text-center">
                <p className="text-xs text-muted-foreground">
                  تمت المشاركة بواسطة <strong>{state.info.shared_by}</strong>
                </p>
              </div>
            </div>
          )}

          {/* ── Ready / Downloaded ── */}
          {(state.status === 'ready' || state.status === 'downloaded') && (
            <>
              {/* File icon + ext badge */}
              <div className="flex flex-col items-center pt-8 pb-4 px-6">
                <div className="h-20 w-20 rounded-2xl bg-portal/5 dark:bg-portal/20 flex items-center justify-center text-portal mb-3 relative">
                  {getFileIcon(state.info.mime_type)}
                  {getFileExtension(state.info.file_name) && (
                    <span className="absolute -bottom-1 -left-1 bg-portal text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      {getFileExtension(state.info.file_name)}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-semibold text-center break-all leading-snug">
                  {state.info.file_name}
                </h2>
                {state.info.file_size != null && (
                  <span className="text-sm text-muted-foreground mt-1">
                    {formatBytes(state.info.file_size)}
                  </span>
                )}
              </div>

              {/* Metadata */}
              <div className="px-6 pb-4 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 shrink-0" />
                  <span>تمت المشاركة بواسطة <strong className="text-foreground">{state.info.shared_by}</strong></span>
                </div>

                {state.info.expires_at && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>
                      {new Date(state.info.expires_at) > new Date()
                        ? `ينتهي ${relativeTime(state.info.expires_at)}`
                        : 'منتهي الصلاحية'}
                    </span>
                  </div>
                )}

                {state.info.downloads_remaining != null && (
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4 shrink-0" />
                    <span>{state.info.downloads_remaining} تحميلات متبقية</span>
                  </div>
                )}
              </div>

              {/* Separator */}
              <div className="border-t mx-6" />

              {/* Download button */}
              <div className="p-6">
                {state.status === 'downloaded' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-sm font-medium">تم التحميل بنجاح</span>
                    </div>
                    <button
                      onClick={handleDownload}
                      className="w-full h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                      تحميل مرة أخرى
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleDownload}
                    className="w-full h-12 rounded-xl bg-portal hover:bg-portal-secondary text-white font-medium text-base transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="h-5 w-5" />
                    تحميل الملف
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Downloading ── */}
          {state.status === 'downloading' && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="h-10 w-10 animate-spin text-portal mb-4" />
              <p className="text-muted-foreground">جاري تحميل الملف...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          &copy; {new Date().getFullYear()} PYRAMEDIA X &middot; جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
