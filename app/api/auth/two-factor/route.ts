import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin, generateSecret } from 'otplib';
import QRCode from 'qrcode';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Pyra Workspace';

// Create a configured TOTP instance (otplib v13 API)
const cryptoPlugin = new NobleCryptoPlugin();
const base32Plugin = new ScureBase32Plugin();
const totp = new TOTP({ crypto: cryptoPlugin, base32: base32Plugin });

// =============================================================
// POST /api/auth/two-factor — Setup 2FA (generate secret + QR)
// =============================================================
export async function POST() {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    // Generate secret
    const secret = generateSecret();

    // Build otpauth URI manually (otplib v13 generateURI has different signature)
    const issuer = encodeURIComponent(APP_NAME);
    const account = encodeURIComponent(auth.pyraUser.username);
    const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Store temporary secret (not enabled yet until verified)
    const supabase = await createServerSupabaseClient();
    await supabase
      .from('pyra_users')
      .update({ two_factor_secret: secret })
      .eq('username', auth.pyraUser.username);

    return apiSuccess({
      secret,
      qrCode: qrCodeDataUrl,
      otpauthUrl,
    });
  } catch (err) {
    console.error('2FA setup error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/auth/two-factor — Verify and enable 2FA
// Body: { token: "123456" }
// =============================================================
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return apiValidationError('رمز التحقق مطلوب');
    }

    const supabase = await createServerSupabaseClient();

    // Get the stored secret
    const { data: user } = await supabase
      .from('pyra_users')
      .select('two_factor_secret')
      .eq('username', auth.pyraUser.username)
      .single();

    if (!user?.two_factor_secret) {
      return apiValidationError('لم يتم إعداد المصادقة الثنائية بعد');
    }

    // Verify token (otplib v13: verify(token, { secret }) → { valid, delta, ... })
    const result = await totp.verify(token.trim(), { secret: user.two_factor_secret });

    if (!result.valid) {
      return apiValidationError('رمز التحقق غير صحيح');
    }

    // Enable 2FA
    await supabase
      .from('pyra_users')
      .update({ two_factor_enabled: true })
      .eq('username', auth.pyraUser.username);

    return apiSuccess({ message: 'تم تفعيل المصادقة الثنائية بنجاح' });
  } catch (err) {
    console.error('2FA verify error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/auth/two-factor — Disable 2FA
// Body: { token: "123456" }
// =============================================================
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return apiValidationError('رمز التحقق مطلوب للتعطيل');
    }

    const supabase = await createServerSupabaseClient();

    // Get the stored secret
    const { data: user } = await supabase
      .from('pyra_users')
      .select('two_factor_secret')
      .eq('username', auth.pyraUser.username)
      .single();

    if (!user?.two_factor_secret) {
      return apiValidationError('المصادقة الثنائية غير مفعلة');
    }

    // Verify token before disabling
    const result = await totp.verify(token.trim(), { secret: user.two_factor_secret });

    if (!result.valid) {
      return apiValidationError('رمز التحقق غير صحيح');
    }

    // Disable 2FA
    await supabase
      .from('pyra_users')
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
      })
      .eq('username', auth.pyraUser.username);

    return apiSuccess({ message: 'تم تعطيل المصادقة الثنائية' });
  } catch (err) {
    console.error('2FA disable error:', err);
    return apiServerError();
  }
}
