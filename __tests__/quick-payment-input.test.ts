import { describe, it, expect } from 'vitest';
import {
  parseQuickPaymentInput,
  mintPlaceholderEmail,
  MAX_QUICK_PAYMENT_AMOUNT,
  MAX_QUICK_PAYMENT_NAME_LENGTH,
  MAX_QUICK_PAYMENT_DESCRIPTION_LENGTH,
  QUICK_PAYMENT_CURRENCIES,
} from '@/lib/finance/quick-payment';

const parse = (body: Record<string, unknown>, currency = 'AED') =>
  parseQuickPaymentInput(body, currency);

const ok = (body: Record<string, unknown>, currency = 'AED') => {
  const r = parse(body, currency);
  if (!r.ok) throw new Error(`expected ok, got invalid field: ${r.field}`);
  return r.value;
};

describe('parseQuickPaymentInput — amount', () => {
  it('accepts a plain number and a numeric string', () => {
    expect(ok({ name: 'A', amount: 700 }).amount).toBe(700);
    expect(ok({ name: 'A', amount: '700.50' }).amount).toBe(700.5);
  });

  it('rounds to 2dp', () => {
    expect(ok({ name: 'A', amount: 700.005 }).amount).toBe(700.01);
  });

  /**
   * `Number(null)`, `Number('')`, `Number([])` and `Number(false)` are all 0,
   * so a bare `> 0` check would let a structurally wrong body through only
   * because the coercion happened to produce a falsy number.
   */
  it.each([null, undefined, '', [], {}, false, true, NaN])(
    'rejects the non-numeric body value %p',
    (amount) => {
      expect(parse({ name: 'A', amount })).toMatchObject({ ok: false, field: 'amount' });
    },
  );

  it('rejects zero and negatives', () => {
    expect(parse({ name: 'A', amount: 0 })).toMatchObject({ ok: false, field: 'amount' });
    expect(parse({ name: 'A', amount: -1 })).toMatchObject({ ok: false, field: 'amount' });
  });

  it('rejects a fat-fingered amount above the ceiling', () => {
    expect(parse({ name: 'A', amount: MAX_QUICK_PAYMENT_AMOUNT + 1 }))
      .toMatchObject({ ok: false, field: 'amount' });
    expect(ok({ name: 'A', amount: MAX_QUICK_PAYMENT_AMOUNT }).amount)
      .toBe(MAX_QUICK_PAYMENT_AMOUNT);
  });

  it('rejects Infinity', () => {
    expect(parse({ name: 'A', amount: Infinity })).toMatchObject({ ok: false, field: 'amount' });
  });
});

describe('parseQuickPaymentInput — name', () => {
  it('trims', () => {
    expect(ok({ name: '  Ahmed  ', amount: 1 }).name).toBe('Ahmed');
  });

  it('rejects blank and whitespace-only', () => {
    expect(parse({ name: '', amount: 1 })).toMatchObject({ ok: false, field: 'name' });
    expect(parse({ name: '   ', amount: 1 })).toMatchObject({ ok: false, field: 'name' });
    expect(parse({ amount: 1 })).toMatchObject({ ok: false, field: 'name' });
  });

  it('rejects an over-long name', () => {
    const long = 'x'.repeat(MAX_QUICK_PAYMENT_NAME_LENGTH + 1);
    expect(parse({ name: long, amount: 1 })).toMatchObject({ ok: false, field: 'name' });
  });

  it('accepts Arabic', () => {
    expect(ok({ name: 'أحمد محمد', amount: 1 }).name).toBe('أحمد محمد');
  });
});

describe('parseQuickPaymentInput — currency', () => {
  it('falls back to the configured default when absent or blank', () => {
    expect(ok({ name: 'A', amount: 1 }, 'AED').currency).toBe('AED');
    expect(ok({ name: 'A', amount: 1, currency: '  ' }, 'USD').currency).toBe('USD');
  });

  it('upper-cases what it is given', () => {
    expect(ok({ name: 'A', amount: 1, currency: 'usd' }).currency).toBe('USD');
  });

  /**
   * Every accepted currency must have exactly two decimal places, because the
   * route converts to minor units with `* 100`. JPY (zero decimals) would be
   * charged 100x and KWD (three) a tenth.
   */
  it.each(['JPY', 'KWD', 'BHD', 'OMR', 'XYZ', 'A'])('rejects %s', (currency) => {
    expect(parse({ name: 'A', amount: 1, currency }))
      .toMatchObject({ ok: false, field: 'currency' });
  });

  it('rejects an unsupported default just as firmly as an unsupported override', () => {
    // A misconfigured `default_currency` setting must not sneak past the guard
    // simply because nobody typed it into the form.
    expect(parse({ name: 'A', amount: 1 }, 'JPY'))
      .toMatchObject({ ok: false, field: 'currency' });
  });

  it('accepts every currency on the allowlist', () => {
    for (const c of QUICK_PAYMENT_CURRENCIES) {
      expect(ok({ name: 'A', amount: 1, currency: c }).currency).toBe(c);
    }
  });
});

describe('parseQuickPaymentInput — optional fields', () => {
  it('lower-cases and trims an email', () => {
    expect(ok({ name: 'A', amount: 1, email: '  Foo@Bar.COM ' }).email).toBe('foo@bar.com');
  });

  it('treats a blank email as absent rather than invalid', () => {
    expect(ok({ name: 'A', amount: 1, email: '   ' }).email).toBeNull();
  });

  it.each(['notanemail', 'a@b', 'a b@c.com', '@b.com', 'a@.com '])(
    'rejects the malformed email %p',
    (email) => {
      expect(parse({ name: 'A', amount: 1, email }))
        .toMatchObject({ ok: false, field: 'email' });
    },
  );

  it('nulls a blank description and phone', () => {
    const v = ok({ name: 'A', amount: 1, description: '  ', phone: '' });
    expect(v.description).toBeNull();
    expect(v.phone).toBeNull();
  });

  it('rejects an over-long description', () => {
    const long = 'x'.repeat(MAX_QUICK_PAYMENT_DESCRIPTION_LENGTH + 1);
    expect(parse({ name: 'A', amount: 1, description: long }))
      .toMatchObject({ ok: false, field: 'description' });
  });
});

describe('mintPlaceholderEmail', () => {
  /**
   * The whole reason this is random rather than name-derived: the existing
   * `{slug}@placeholder.invalid` convention collides on the second walk-in of
   * the same name, and pyra_clients.email is UNIQUE — the collision would 23505
   * a payment link for no reason the operator could understand.
   */
  it('is unique across many mints', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => mintPlaceholderEmail()));
    expect(seen.size).toBe(2000);
  });

  it('uses the RFC 2606 reserved .invalid TLD so it can never resolve', () => {
    expect(mintPlaceholderEmail().endsWith('@placeholder.invalid')).toBe(true);
  });

  it('emits only characters that survive being retyped or normalised', () => {
    for (let i = 0; i < 200; i++) {
      expect(mintPlaceholderEmail()).toMatch(/^qp-[0-9a-z]{12}@placeholder\.invalid$/);
    }
  });
});
