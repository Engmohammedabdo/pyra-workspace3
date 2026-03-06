'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface BreadcrumbExtra {
  resultCount?: number;
}

interface BreadcrumbContextValue {
  extra: BreadcrumbExtra;
  setExtra: (e: BreadcrumbExtra) => void;
  resetExtra: () => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  extra: {},
  setExtra: () => {},
  resetExtra: () => {},
});

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [extra, setExtraState] = useState<BreadcrumbExtra>({});
  const pathname = usePathname();

  // Reset extra when route changes
  useEffect(() => {
    setExtraState({});
  }, [pathname]);

  const setExtra = useCallback((e: BreadcrumbExtra) => {
    setExtraState(e);
  }, []);

  const resetExtra = useCallback(() => {
    setExtraState({});
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ extra, setExtra, resetExtra }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbExtra() {
  return useContext(BreadcrumbContext);
}
