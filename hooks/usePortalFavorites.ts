'use client';

import { useState, useEffect, useCallback } from 'react';

export interface PortalFavoriteItem {
  id: string;
  type: 'file' | 'project';
  name: string;
  addedAt: string;
}

const STORAGE_KEY = 'pyra_portal_favorites';

function loadFavorites(): PortalFavoriteItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFavorites(items: PortalFavoriteItem[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function usePortalFavorites() {
  const [favorites, setFavorites] = useState<PortalFavoriteItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setFavorites(loadFavorites());
    setMounted(true);
  }, []);

  const addFavorite = useCallback((item: Omit<PortalFavoriteItem, 'addedAt'>) => {
    setFavorites(prev => {
      if (prev.some(f => f.id === item.id && f.type === item.type)) return prev;
      const updated = [...prev, { ...item, addedAt: new Date().toISOString() }];
      saveFavorites(updated);
      return updated;
    });
  }, []);

  const removeFavorite = useCallback((id: string, type: 'file' | 'project') => {
    setFavorites(prev => {
      const updated = prev.filter(f => !(f.id === id && f.type === type));
      saveFavorites(updated);
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((item: Omit<PortalFavoriteItem, 'addedAt'>) => {
    const exists = favorites.some(f => f.id === item.id && f.type === item.type);
    if (exists) removeFavorite(item.id, item.type);
    else addFavorite(item);
    return !exists; // returns new state: true = now favorited
  }, [favorites, addFavorite, removeFavorite]);

  const isFavorite = useCallback((id: string, type: 'file' | 'project') => {
    return favorites.some(f => f.id === id && f.type === type);
  }, [favorites]);

  return { favorites, addFavorite, removeFavorite, toggleFavorite, isFavorite, mounted };
}
