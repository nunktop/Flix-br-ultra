/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Play, SkipForward, History, ChevronRight, ChevronLeft, Film, Tv, TrendingUp, Star, Server, Sparkles, AlertCircle, RefreshCcw, Bell, Maximize, Minimize, LogOut, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { AuthForm } from './components/AuthForm';

const TMDB_API_KEY = "3b215855a4f169f976bbf143c4558d17";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMG_BASE_URL = "https://image.tmdb.org/t/p/w500";

const fetchWithCache = async (url: string, cacheTime = 3600000) => {
  const cached = localStorage.getItem(url);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < cacheTime) {
        return data;
      }
    } catch (e) {
      // Ignore parse error
    }
  }
  const response = await fetch(url);
  const data = await response.json();
  localStorage.setItem(url, JSON.stringify({ data, timestamp: Date.now() }));
  return data;
};

interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string;
  media_type?: 'movie' | 'tv';
  genre_ids?: number[];
  vote_average?: number;
  original_language?: string;
}

interface Genre {
  id: number;
  name: string;
}

interface PlayerState {
  id: number | null;
  tipo: 'movie' | 'tv' | null;
  season: number;
  ep: number;
  title?: string;
  poster_path?: string;
}

interface CategorySection {
  title: string;
  items: MediaItem[];
  genreId?: number;
  specialCategory?: 'anime' | 'animation';
  mediaType?: 'movie' | 'tv' | 'all';
}

interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  isVip: boolean;
  vipDays: number;
  createdAt: string;
  lastLogin?: string;
}

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [vipDaysToAdd, setVipDaysToAdd] = useState(30);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [newUserIsVip, setNewUserIsVip] = useState(false);
  const [newUserVipDays, setNewUserVipDays] = useState(30);
  const [resettingPasswordFor, setResettingPasswordFor] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [isGenreMenuOpen, setIsGenreMenuOpen] = useState(false);

  const [sections, setSections] = useState<CategorySection[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [atual, setAtual] = useState<PlayerState>({ id: null, tipo: null, season: 1, ep: 1 });
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [mediaType, setMediaType] = useState<'all' | 'movie' | 'tv'>('all');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [seasonsList, setSeasonsList] = useState<any[]>([]);
  const [episodesList, setEpisodesList] = useState<any[]>([]);
  const [isFetchingEpisodes, setIsFetchingEpisodes] = useState(false);
  const [maxEpisodes, setMaxEpisodes] = useState<number>(999);
  const [serverIndex, setServerIndex] = useState<number>(0);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState<string | null>(null);
  const [iaError, setIaError] = useState<string | null>(null);
  const [isAutoPilotActive, setIsAutoPilotActive] = useState(false);
  const [magicSearchQuery, setMagicSearchQuery] = useState("");
  const [isMagicSearching, setIsMagicSearching] = useState(false);
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);
  const [specialCategory, setSpecialCategory] = useState<'anime' | 'animation' | null>(null);
  const [continueWatching, setContinueWatching] = useState<(MediaItem & PlayerState)[]>([]);
  const [showContinue, setShowContinue] = useState(false);
  const [isFullMenuOpen, setIsFullMenuOpen] = useState(false);
  const [isSeasonMenuOpen, setIsSeasonMenuOpen] = useState(false);
  const [isEpisodeMenuOpen, setIsEpisodeMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isTvMode, setIsTvMode] = useState(localStorage.getItem("tvMode") === "true");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showVipModal, setShowVipModal] = useState(false);
  const [focusedMedia, setFocusedMedia] = useState<MediaItem | null>(null);

  const checkVipAccess = () => {
    if (user?.isAdmin) return true;
    if (user?.isVip) {
      if (!user.vipUntil) return true;
      if (new Date(user.vipUntil) > new Date()) return true;
    }
    return false;
  };

  const fechar = useCallback(() => {
    setIsPlayerOpen(false);
  }, []);

  const getAuthHeaders = async () => {
    let { data: { session }, error } = await supabase.auth.getSession();
    
    // If there's an error getting session or no session, try forcing a fresh one or login
    if (error || !session) {
      const { data: refreshedSession } = await supabase.auth.refreshSession();
      session = refreshedSession.session;
    }
    
    // If it's still invalid, it will send undefined, backend will return 401.
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token}`
    };
  };

  const fetchAdminUsers = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/users", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Failed to fetch");
      setAdminUsers(data);
    } catch (err: any) {
      console.error("Erro ao buscar usuários:", err);
      if (err.message?.includes("Sessão inválida")) {
        alert(err.message + " (Por favor, saia do sistema e faça login novamente)");
      } else {
        alert("Erro ao buscar usuários: " + err.message);
      }
    }
  };

  const updateVip = async (userId: string, vipUntilDate: string | null, isVip?: boolean) => {
    try {
      const headers = await getAuthHeaders();
      
      const res = await fetch("/api/admin/users/vip", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId, isVip: isVip !== false, vipUntil: vipUntilDate })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || "Failed to update VIP");
      fetchAdminUsers();
      alert("Status VIP atualizado!");
    } catch (err: any) {
      console.error("Erro ao atualizar VIP", err);
      alert("Erro ao atualizar VIP: " + err.message);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/users/${userId}`, { 
        method: "DELETE",
        headers
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || "Failed to delete user");
      fetchAdminUsers();
      alert("Usuário excluído com sucesso.");
    } catch (err: any) {
      console.error("Erro ao excluir usuário", err);
      alert("Erro ao excluir usuário: " + err.message);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!newPasswordValue.trim()) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId, newPassword: newPasswordValue })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || "Failed to reset password");
      setResettingPasswordFor(null);
      setNewPasswordValue("");
      fetchAdminUsers();
      alert("Senha redefinida com sucesso.");
    } catch (err: any) {
      console.error("Erro ao resetar senha", err);
      alert("Erro ao resetar senha: " + err.message);
    }
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const headers = await getAuthHeaders();
      
      let vipUntil = null;
      if (newUserIsVip) {
        const date = new Date();
        date.setDate(date.getDate() + newUserVipDays);
        vipUntil = date.toISOString();
      }

      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: newUserUsername,
          password: newUserPassword,
          isAdmin: newUserIsAdmin,
          isVip: newUserIsVip,
          vipUntil
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || "Failed to create user");
      
      fetchAdminUsers();
      setShowNewUserForm(false);
      setNewUserUsername("");
      setNewUserPassword("");
      setNewUserIsAdmin(false);
      setNewUserIsVip(false);
      setNewUserVipDays(30);
      alert("Usuário criado com sucesso!");
    } catch (err: any) {
      console.error("Erro ao criar usuário:", err);
      if (err.message.includes("Sessão inválida")) {
        alert("Sua sessão de administrador expirou. Por favor, saia do sistema e faça login novamente.");
      } else {
        alert("Erro ao criar usuário: " + err.message);
      }
    }
  };

  useEffect(() => {
    const fetchProfileAndSetUser = async (authUser: any) => {
      if (!authUser) {
        setUser(null);
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
      setUser({
        ...authUser,
        isAdmin: profile?.is_admin || false,
        isVip: profile?.is_vip || false,
        vipUntil: profile?.vip_until,
        username: profile?.username || authUser.email,
      });
    };

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchProfileAndSetUser(session?.user ?? null);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchProfileAndSetUser(session?.user ?? null);
    });

    // Verify database connection to the profiles table
    const verifyDbConnection = async () => {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) {
        console.error("Erro ao conectar com as tabelas do Supabase:", error.message);
      } else {
        console.log("✅ Conexão com o Supabase e tabelas verificada com sucesso!");
      }
    };
    verifyDbConnection();

    return () => subscription.unsubscribe();
  }, []);

  const toggleTvMode = () => {
    const newVal = !isTvMode;
    setIsTvMode(newVal);
    localStorage.setItem("tvMode", newVal.toString());
  };

  const playerContainerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const servers = [
    { name: 'Principal', base: 'https://myembed.biz' },
    { name: 'Reserva 1', base: 'https://embed.warezcdn.net' },
    { name: 'Reserva 2', base: 'https://superflixapi.top' },
    { name: 'Reserva 3', base: 'https://vidsrc.me/embed' },
    { name: 'Reserva 4', base: 'https://vidsrc.to/embed' },
    { name: 'Reserva 5', base: 'https://vidsrc.xyz/embed' },
    { name: 'Reserva 6', base: 'https://embed.su/embed' }
  ];

  const genreScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("continueWatchingList");
    if (saved) {
      try {
        setContinueWatching(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao carregar histórico:", e);
      }
    }
  }, []);

  const updateContinueWatching = (item: MediaItem, state: PlayerState) => {
    setContinueWatching(prev => {
      const filtered = prev.filter(i => i.id !== item.id);
      const newList = [{ ...item, ...state }, ...filtered].slice(0, 20);
      localStorage.setItem("continueWatchingList", JSON.stringify(newList));
      localStorage.setItem("continuar", JSON.stringify(state));
      return newList;
    });
  };

  const clearHistory = () => {
    setContinueWatching([]);
    localStorage.removeItem("continuar");
    localStorage.removeItem("continueWatchingList");
    setShowClearConfirm(false);
  };

  const fetchGenres = useCallback(async () => {
    try {
      const [movieData, tvData] = await Promise.all([
        fetchWithCache(`${TMDB_BASE_URL}/genre/movie/list?api_key=${TMDB_API_KEY}&language=pt-BR`),
        fetchWithCache(`${TMDB_BASE_URL}/genre/tv/list?api_key=${TMDB_API_KEY}&language=pt-BR`)
      ]);
      
      const allGenres = [...movieData.genres];
      const problematicGenres = [10763, 10764, 10766, 10767]; // News, Reality, Soap, Talk
      
      tvData.genres.forEach((g: Genre) => {
        if (!allGenres.find(ag => ag.id === g.id) && !problematicGenres.includes(g.id)) {
          allGenres.push(g);
        }
      });
      setGenres(allGenres.filter(g => !problematicGenres.includes(g.id)));
      return allGenres;
    } catch (error) {
      console.error("Erro ao carregar gêneros:", error);
      return [];
    }
  }, []);

  const loadHomeSections = useCallback(async (allGenres: Genre[], background = false) => {
    if (!background) setLoading(true);
    try {
      // Fetch Trending
      const trendingData = await fetchWithCache(`${TMDB_BASE_URL}/trending/all/week?api_key=${TMDB_API_KEY}&language=pt-BR`);
      
      if (trendingData.results && trendingData.results.length > 0) {
        setFocusedMedia(prev => prev ? prev : trendingData.results[0]);
      }

      // Fetch Now Playing Movies (Novidades)
      const nowPlayingData = await fetchWithCache(`${TMDB_BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}&language=pt-BR&region=BR`);

      // Fetch On The Air TV Shows (Novas Séries)
      const onAirData = await fetchWithCache(`${TMDB_BASE_URL}/tv/on_the_air?api_key=${TMDB_API_KEY}&language=pt-BR`);

      const homeSections: CategorySection[] = [
        { title: "Bombando na Semana", items: trendingData.results || [], mediaType: 'all' },
        { title: "Novidades no Cinema", items: nowPlayingData.results || [], mediaType: 'movie' },
        { title: "Séries Completa", items: onAirData.results || [], mediaType: 'tv' }
      ];

      // Fetch Kids (TV)
      const kidsRequest = fetchWithCache(`${TMDB_BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&with_genres=10762&language=pt-BR&sort_by=popularity.desc`)
        .then(data => ({ title: "Kids & Família", items: data.results || [], genreId: 10762, mediaType: 'tv' as const }));

      // Fetch a few popular genres
      const popularGenreIds = [28, 35, 27, 10749, 878, 53, 12, 14, 18, 9648, 10751, 36, 10752]; // Action, Comedy, Horror, Romance, Sci-Fi, Thriller, Adventure, Fantasy, Drama, Mystery, Family, History, War
      const genreRequests = popularGenreIds.map(id => {
        const genreName = allGenres.find(g => g.id === id)?.name || "Categoria";
        return fetchWithCache(`${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${id}&language=pt-BR&sort_by=popularity.desc`)
          .then(data => ({ title: genreName, items: data.results || [], genreId: id, mediaType: 'movie' as const }));
      });

      // Fetch Animes (Animation + Japanese)
      const animeRequest = fetchWithCache(`${TMDB_BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&with_genres=16&with_original_language=ja&language=pt-BR&sort_by=popularity.desc`)
        .then(data => ({ title: "Animes", items: data.results || [], specialCategory: 'anime' as const, mediaType: 'tv' as const }));

      // Fetch Animations (Movies)
      const animationRequest = fetchWithCache(`${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=16&language=pt-BR&sort_by=popularity.desc`)
        .then(data => ({ title: "Desenhos & Animações", items: data.results || [], specialCategory: 'animation' as const, mediaType: 'movie' as const }));

      const genreSections = await Promise.all([...genreRequests, kidsRequest, animeRequest, animationRequest]);
      const newSections = [...homeSections, ...genreSections];
      setSections(newSections);
      localStorage.setItem("cachedHomeSections", JSON.stringify(newSections));
      localStorage.setItem("lastCatalogUpdate", new Date().toISOString());
    } catch (error) {
      console.error("Erro ao carregar seções:", error);
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    // Clear all TMDB cache from localStorage to ensure fresh data
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(TMDB_BASE_URL)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    const allGenres = await fetchGenres();
    await loadHomeSections(allGenres);
  }, [fetchGenres, loadHomeSections]);

  const fetchByGenreOrType = useCallback(async () => {
    setLoading(true);
    try {
      let url = "";
      if (specialCategory === 'anime') {
        url = `${TMDB_BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&with_genres=16&with_original_language=ja&language=pt-BR&sort_by=popularity.desc`;
      } else if (specialCategory === 'animation') {
        url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=16&language=pt-BR&sort_by=popularity.desc`;
      } else if (selectedGenre) {
        // Some genres are TV-only in TMDB
        const tvOnlyGenres = [10759, 10762, 10765, 10768]; // Action & Adventure, Kids, Sci-Fi & Fantasy, War & Politics
        const isTvOnly = tvOnlyGenres.includes(selectedGenre);
        
        const type = mediaType === 'all' ? (isTvOnly ? 'tv' : 'movie') : mediaType;
        url = `${TMDB_BASE_URL}/discover/${type}?api_key=${TMDB_API_KEY}&with_genres=${selectedGenre}&language=pt-BR&sort_by=popularity.desc`;
      } else if (mediaType !== 'all') {
        url = `${TMDB_BASE_URL}/trending/${mediaType}/week?api_key=${TMDB_API_KEY}&language=pt-BR`;
      }

      if (url) {
        const res = await fetch(url);
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error("Erro ao filtrar:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedGenre, mediaType, specialCategory]);

  const buscar = useCallback(async (q: string) => {
    if (!q) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchWithCache(`${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=pt-BR`);
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Erro na busca:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const cachedSections = localStorage.getItem("cachedHomeSections");
    if (cachedSections) {
      try {
        setSections(JSON.parse(cachedSections));
        setLoading(false);
      } catch (e) {
        // ignore
      }
    }

    fetchGenres().then(allGenres => {
      const lastUpdate = localStorage.getItem("lastCatalogUpdate");
      const sixHours = 6 * 60 * 60 * 1000;
      
      if (!lastUpdate || (new Date().getTime() - new Date(lastUpdate).getTime() > sixHours)) {
        loadHomeSections(allGenres, !!cachedSections);
      } else if (!cachedSections) {
        loadHomeSections(allGenres, false);
      }
    });
    const saved = localStorage.getItem("continuar");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.id) setAtual(parsed);
      } catch (e) {
        console.error("Erro ao carregar histórico:", e);
      }
    }
  }, []);

  // Spatial Navigation for TV Mode
  useEffect(() => {
    if (!isTvMode) return;

    const handleSpatialNav = (e: KeyboardEvent) => {
      // Ignore if inside iframe
      if (document.activeElement?.tagName === 'IFRAME') return;

      let key = e.key;
      // Polyfill for older Smart TVs (Tizen, WebOS)
      if (key === 'Up' || e.keyCode === 38) key = 'ArrowUp';
      if (key === 'Down' || e.keyCode === 40) key = 'ArrowDown';
      if (key === 'Left' || e.keyCode === 37) key = 'ArrowLeft';
      if (key === 'Right' || e.keyCode === 39) key = 'ArrowRight';
      if (e.keyCode === 13) key = 'Enter';

      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;

      const activeElement = document.activeElement as HTMLElement;
      if (!activeElement || activeElement === document.body) {
        const firstFocusable = document.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement;
        if (firstFocusable) firstFocusable.focus();
        return;
      }

      if (activeElement.tagName === 'INPUT' && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        return;
      }

      e.preventDefault();

      const focusableElements = Array.from(document.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.opacity !== '0' && style.display !== 'none';
        }) as HTMLElement[];

      const currentRect = activeElement.getBoundingClientRect();
      let bestMatch: HTMLElement | null = null;
      let minDistance = Infinity;

      focusableElements.forEach(el => {
        if (el === activeElement) return;
        const rect = el.getBoundingClientRect();

        let isDirectionMatch = false;
        let distance = Infinity;

        const currentCenterX = currentRect.left + currentRect.width / 2;
        const currentCenterY = currentRect.top + currentRect.height / 2;
        const elCenterX = rect.left + rect.width / 2;
        const elCenterY = rect.top + rect.height / 2;

        const dx = elCenterX - currentCenterX;
        const dy = elCenterY - currentCenterY;

        // Calculate overlap to prioritize straight lines (grid items)
        const overlapY = Math.max(0, Math.min(currentRect.bottom, rect.bottom) - Math.max(currentRect.top, rect.top));
        const overlapX = Math.max(0, Math.min(currentRect.right, rect.right) - Math.max(currentRect.left, rect.left));

        if (key === 'ArrowRight' && dx > 0) {
          isDirectionMatch = true;
          distance = dx + (overlapY > 0 ? 0 : Math.abs(dy) * 10);
        } else if (key === 'ArrowLeft' && dx < 0) {
          isDirectionMatch = true;
          distance = Math.abs(dx) + (overlapY > 0 ? 0 : Math.abs(dy) * 10);
        } else if (key === 'ArrowDown' && dy > 0) {
          isDirectionMatch = true;
          distance = dy + (overlapX > 0 ? 0 : Math.abs(dx) * 10);
        } else if (key === 'ArrowUp' && dy < 0) {
          isDirectionMatch = true;
          distance = Math.abs(dy) + (overlapX > 0 ? 0 : Math.abs(dx) * 10);
        }

        if (isDirectionMatch && distance < minDistance) {
          minDistance = distance;
          bestMatch = el;
        }
      });

      if (bestMatch) {
        (bestMatch as HTMLElement).focus();
        
        // Let natural CSS scroll snapping or the onFocusCapture handle horizontal scrolling in rows.
        // For vertical, we can scroll the whole page to keep the selected row centered.
        if (key === 'ArrowDown' || key === 'ArrowUp') {
           (bestMatch as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      }
    };

    window.addEventListener('keydown', handleSpatialNav);
    return () => window.removeEventListener('keydown', handleSpatialNav);
  }, [isTvMode]);

  useEffect(() => {
    // Smart TV Back Button Handler
    const handleKeyDown = (e: KeyboardEvent) => {
      // 461 = LG WebOS Return, 10009 = Tizen Return
      const isBackKey = e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 461 || e.keyCode === 10009;
      
      if (isBackKey) {
        // Only target inputs inside modals IF they have focus (search bar has ignore built-in but still)
        const isInput = document.activeElement?.tagName === 'INPUT';
        if (isInput && (e.key === 'Backspace' || e.keyCode === 8)) return; 

        if (isSeasonMenuOpen || isEpisodeMenuOpen) {
          setIsSeasonMenuOpen(false);
          setIsEpisodeMenuOpen(false);
        } else if (isPlayerOpen) {
          fechar();
        } else if (isFullMenuOpen) {
          setIsFullMenuOpen(false);
        } else if (searchQuery || selectedGenre || specialCategory || showContinue) {
          setSearchQuery("");
          setSelectedGenre(null);
          setSpecialCategory(null);
          setShowContinue(false);
          setMediaType('all');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [fetchGenres, loadHomeSections, isPlayerOpen, isFullMenuOpen, searchQuery, selectedGenre, specialCategory, showContinue, fechar, isSeasonMenuOpen, isEpisodeMenuOpen]);

  // Debounce search
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery) buscar(searchQuery);
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery, buscar]);

  // Re-fetch when filters change
  useEffect(() => {
    if (!searchQuery && (selectedGenre || mediaType !== 'all' || specialCategory)) {
      fetchByGenreOrType();
    } else if (!searchQuery && !selectedGenre && mediaType === 'all' && !specialCategory) {
      setSearchResults([]);
    }
  }, [selectedGenre, mediaType, searchQuery, specialCategory, fetchByGenreOrType]);

  useEffect(() => {
    if (atual.id && atual.tipo === 'tv') {
      setIsFetchingEpisodes(true);
      fetchWithCache(`${TMDB_BASE_URL}/tv/${atual.id}/season/${atual.season}?api_key=${TMDB_API_KEY}&language=pt-BR`)
        .then(data => {
          if (data.episodes) {
            setEpisodesList(data.episodes);
            setMaxEpisodes(data.episodes.length);
          }
        })
        .catch(() => {
          setEpisodesList([]);
          setMaxEpisodes(999);
        })
        .finally(() => setIsFetchingEpisodes(false));
    }
  }, [atual.id, atual.tipo, atual.season]);

  const fetchSeasons = async (id: number) => {
    try {
      const data = await fetchWithCache(`${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&language=pt-BR`);
      if (data.seasons) {
        // Filter out season 0 (specials) if desired, or keep it. Usually specials are season 0.
        setSeasonsList(data.seasons.filter((s: any) => s.season_number > 0));
      }
    } catch (error) {
      console.error("Erro ao buscar temporadas:", error);
    }
  };

  const assistir = (item: MediaItem) => {
    if (!checkVipAccess()) {
      setShowVipModal(true);
      return;
    }

    const tipo = item.media_type || (item.title ? "movie" : "tv");
    
    // Check if it's already in continue watching to resume from where it was
    const savedItem = continueWatching.find(i => i.id === item.id);
    
    const newState: PlayerState = { 
      id: item.id, 
      tipo: tipo as 'movie' | 'tv', 
      season: savedItem?.season || 1, 
      ep: savedItem?.ep || 1,
      title: item.title || item.name,
      poster_path: item.poster_path
    };

    if (tipo === 'tv') {
      fetchSeasons(item.id);
    }

    setAtual(newState);
    setIsPlayerOpen(true);
    updateContinueWatching(item, newState);
  };

  // Hardware Back Button (TV/Mobile) Support
  useEffect(() => {
    if (isPlayerOpen) {
      // Auto-focus player on TV
      if (isTvMode) {
        const timer = setTimeout(() => {
          const iframe = document.querySelector('iframe[title="Video Player"]') as HTMLIFrameElement;
          if (iframe) iframe.focus();
        }, 800);
        
        // Return a cleanup to avoid duplicate focus if user escapes early
        // We also need to keep the pushState logic intact, but not run it every time `atual` changes
        return () => clearTimeout(timer);
      }
    }
  }, [isPlayerOpen, isTvMode, atual]); // Auto-focus whenever the current playing item changes

  useEffect(() => {
    if (isPlayerOpen) {
      // Add a history entry when player opens
      window.history.pushState({ playerOpen: true }, '');
      
      const handlePopState = (e: PopStateEvent) => {
        if (isPlayerOpen) {
          e.preventDefault();
          fechar();
        }
      };
      
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isPlayerOpen, fechar]);

  const proximoEp = useCallback(() => {
    if (atual.tipo !== "tv") return;
    
    let newState: PlayerState;
    
    if (atual.ep < maxEpisodes) {
      newState = { ...atual, ep: atual.ep + 1 };
    } else {
      // Check if there is a next season
      const currentSeasonIdx = seasonsList.findIndex(s => s.season_number === atual.season);
      if (currentSeasonIdx !== -1 && currentSeasonIdx < seasonsList.length - 1) {
        const nextSeason = seasonsList[currentSeasonIdx + 1].season_number;
        newState = { ...atual, season: nextSeason, ep: 1 };
      } else {
        return; // End of series
      }
    }
    
    setAtual(newState);
    const item = continueWatching.find(i => i.id === atual.id);
    if (item) updateContinueWatching(item, newState);
  }, [atual, maxEpisodes, seasonsList, continueWatching]);

  const anteriorEp = useCallback(() => {
    if (atual.tipo !== "tv") return;
    
    let newState: PlayerState;
    
    if (atual.ep > 1) {
      newState = { ...atual, ep: atual.ep - 1 };
    } else {
      // Check if there is a previous season
      const currentSeasonIdx = seasonsList.findIndex(s => s.season_number === atual.season);
      if (currentSeasonIdx !== -1 && currentSeasonIdx > 0) {
        const prevSeason = seasonsList[currentSeasonIdx - 1].season_number;
        // We don't know the max episodes of the previous season easily without fetching, 
        // but we can just go to the first episode of the previous season or try to fetch it.
        // For simplicity, let's just go to the first episode of the previous season.
        newState = { ...atual, season: prevSeason, ep: 1 };
      } else {
        return; // Start of series
      }
    }
    
    setAtual(newState);
    const item = continueWatching.find(i => i.id === atual.id);
    if (item) updateContinueWatching(item, newState);
  }, [atual, seasonsList, continueWatching]);

  const trocarServidor = useCallback(() => {
    setIsSearchingServer(true);
    setCustomServerUrl(null);
    setIaError(null);
    setServerIndex((prev) => (prev + 1) % servers.length);
    setTimeout(() => setIsSearchingServer(false), 1500);
  }, [servers.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape and Backspace are handled by the Smart TV Back Button Handler
      
      // We only want to handle keyboard shortcuts for active inputs if we aren't typing
      const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      
      if (isPlayerOpen && !isTyping) {
        if (e.key === 'n' || e.key === 'N') proximoEp();
        if (e.key === 'p' || e.key === 'P') anteriorEp();
        if (e.key === 's' || e.key === 'S') trocarServidor();
      } else if (!isPlayerOpen) {
        if (e.key === '/' && !isMagicSearching) {
          e.preventDefault();
          document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayerOpen, proximoEp, anteriorEp, trocarServidor, isMagicSearching]);

  const renderPlayerUrl = () => {
    if (!atual.id) return "";
    if (customServerUrl) return customServerUrl;

    const server = servers[serverIndex];
    
    if (server.base.includes('vidsrc.me') || server.base.includes('vidsrc.to') || server.base.includes('vidsrc.xyz')) {
      return atual.tipo === "tv"
        ? `${server.base}/tv?tmdb=${atual.id}&season=${atual.season}&episode=${atual.ep}`
        : `${server.base}/movie?tmdb=${atual.id}`;
    }

    if (server.base.includes('embed.su')) {
      return atual.tipo === "tv"
        ? `${server.base}/tv/${atual.id}/${atual.season}/${atual.ep}`
        : `${server.base}/movie/${atual.id}`;
    }

    return atual.tipo === "tv"
      ? `${server.base}/serie/${atual.id}/${atual.season}/${atual.ep}`
      : `${server.base}/filme/${atual.id}`;
  };

  const buscarLinkIA = async () => {
    setIsSearchingServer(true);
    setIaError(null);
    try {
      const response = await fetch('/api/ai/find-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: atual.title,
          tipo: atual.tipo,
          season: atual.season,
          ep: atual.ep,
          id: atual.id
        })
      });

      if (!response.ok) throw new Error('Erro na busca IA');
      const result = await response.json();
      const text = result.url;

      if (text && text.startsWith('http')) {
        setCustomServerUrl(text);
      } else {
        setIaError("Não foi possível encontrar um link alternativo seguro via IA.");
        // Fallback to next server
        setServerIndex((prev) => (prev + 1) % servers.length);
      }
    } catch (error) {
      console.error("Erro na busca IA:", error);
      setIaError("Erro ao conectar com a IA de busca.");
      setServerIndex((prev) => (prev + 1) % servers.length);
    } finally {
      setTimeout(() => setIsSearchingServer(false), 1000);
    }
  };

  const autoPilotInterval = useRef<any>(null);

  const toggleAutoPilot = () => {
    if (isAutoPilotActive) {
      if (autoPilotInterval.current) clearInterval(autoPilotInterval.current);
      setIsAutoPilotActive(false);
    } else {
      setIsAutoPilotActive(true);
      autoPilotInterval.current = setInterval(() => {
        setServerIndex((prev) => {
          if (prev === servers.length - 1) {
            if (autoPilotInterval.current) clearInterval(autoPilotInterval.current);
            setIsAutoPilotActive(false);
            buscarLinkIA(); // Try AI as last resort
            return prev;
          }
          return prev + 1;
        });
      }, 8000);
    }
  };

  const handleMagicSearch = async () => {
    if (!magicSearchQuery.trim()) return;
    setIsMagicSearching(true);
    setLoading(true);
    try {
      const context = atual?.title ? `\nContexto: O usuário está assistindo ou assistiu recentemente a "${atual.title}". Se a busca pedir recomendações ou algo parecido, sugira algo fortemente relacionado a este título.` : '';
      
      const response = await fetch('/api/ai/magic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magicSearchQuery, context })
      });

      if (!response.ok) throw new Error('Erro na busca IA');
      const result = await response.json();

      if (result.id) {
        if (!checkVipAccess()) {
          setShowVipModal(true);
          return;
        }
        if (result.isUrl) {
          setAtual({ id: result.id, tipo: result.type, season: 1, ep: 1, title: result.title });
          setCustomServerUrl(result.id);
          setIsPlayerOpen(true);
        } else {
          // It's a TMDB ID
          const data = await fetchWithCache(`${TMDB_BASE_URL}/${result.type}/${result.id}?api_key=${TMDB_API_KEY}&language=pt-BR`);
          assistir(data);
        }
      }
    } catch (error) {
      console.error("Erro na busca mágica:", error);
    } finally {
      setIsMagicSearching(false);
      setLoading(false);
      setMagicSearchQuery("");
    }
  };

  const scrollGenres = (direction: 'left' | 'right') => {
    if (genreScrollRef.current) {
      const { scrollLeft, clientWidth } = genreScrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      genreScrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  const MediaCard = React.memo(({ item, onClick, onFocus }: { item: MediaItem, onClick: (item: MediaItem) => void, onFocus?: (item: MediaItem) => void }) => (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -10, scale: 1.05 }}
      whileFocus={{ y: -10, scale: 1.05 }}
      className="relative aspect-[2/3] group cursor-pointer flex-shrink-0 w-full h-full rounded-2xl overflow-hidden outline-none focus:ring-4 focus:ring-red-600 focus:ring-offset-4 focus:ring-offset-black focus:z-50 transition-all"
      onClick={() => onClick(item)}
      onFocus={() => {
        if (onFocus) onFocus(item);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick(item);
        }
      }}
      tabIndex={0}
      aria-label={`Assistir ${item.title || item.name}`}
    >
      <img
        src={item.poster_path ? `${IMG_BASE_URL}${item.poster_path}` : 'https://via.placeholder.com/500x750?text=Sem+Poster'}
        alt={item.title || item.name}
        className="w-full h-full object-cover rounded-2xl shadow-2xl transition-all duration-500 group-hover:shadow-red-600/40 group-focus:shadow-red-600/40"
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/500x750?text=Imagem+Indisponível';
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-all duration-300 flex flex-col items-center justify-end p-4 text-center rounded-2xl">
        <div className="w-10 h-10 md:w-16 md:h-16 rounded-full bg-red-600 flex items-center justify-center mb-4 transform translate-y-4 group-hover:translate-y-0 group-focus:translate-y-0 transition-transform duration-300 shadow-[0_0_30px_rgba(220,38,38,0.5)]">
          <Play className="w-5 h-5 md:w-8 md:h-8 fill-current text-white" />
        </div>
        <p className="text-xs md:text-base font-black line-clamp-2 mb-1 text-white drop-shadow-lg">{item.title || item.name}</p>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[8px] md:text-[10px] font-black bg-red-600 px-2 py-0.5 rounded uppercase tracking-widest shadow-lg">
            {item.genre_ids?.includes(16) && item.original_language === 'ja' ? 'Anime' :
             item.genre_ids?.includes(16) ? 'Desenho' :
             item.media_type === 'tv' || (!item.title && item.name) ? 'Série' : 'Filme'}
          </span>
          {item.vote_average && (
            <span className="flex items-center gap-1 text-[8px] md:text-[10px] font-bold text-yellow-400 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
              <Star className="w-2.5 h-2.5 fill-current" />
              {item.vote_average.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  ));

  const ScrollableRow = ({ 
    title, 
    items, 
    onMediaClick, 
    icon: Icon, 
    genreId, 
    specialCategory: specCat,
    mediaType: mType
  }: { 
    title: string, 
    items: MediaItem[], 
    onMediaClick: (item: MediaItem) => void, 
    icon: any, 
    genreId?: number,
    specialCategory?: 'anime' | 'animation',
    mediaType?: 'movie' | 'tv' | 'all'
  }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showArrows, setShowArrows] = useState(false);

    const manualScroll = (direction: 'left' | 'right') => {
      if (scrollRef.current) {
        const { scrollLeft, clientWidth } = scrollRef.current;
        const scrollTo = direction === 'left' ? scrollLeft - clientWidth * 0.8 : scrollLeft + clientWidth * 0.8;
        scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
      }
    };

    return (
      <section 
        className="px-4 md:px-8 lg:px-12 relative group/row"
        onMouseEnter={() => setShowArrows(true)}
        onMouseLeave={() => setShowArrows(false)}
      >
        <button 
          onClick={() => {
            if (genreId) {
              setSelectedGenre(genreId);
              setMediaType(mType || 'movie');
              setSpecialCategory(null);
            } else if (specCat) {
              setSpecialCategory(specCat);
              setSelectedGenre(null);
            } else {
              setMediaType(mType || 'all');
              setSelectedGenre(null);
              setSpecialCategory(null);
            }
            setSearchQuery("");
            setShowContinue(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="text-lg md:text-2xl font-black tracking-tight mb-6 flex items-center gap-3 hover:text-red-600 transition-colors group/title focus:outline-none focus:text-red-600"
        >
          <Icon className="w-5 h-5 md:w-6 md:h-6 text-red-600 group-hover/title:scale-110 transition-transform" />
          {title}
          <ChevronRight className="w-4 h-4 md:w-5 md:h-5 opacity-0 group-hover/title:opacity-100 group-hover/title:translate-x-2 transition-all" />
        </button>
        
        <div className="relative">
          <AnimatePresence>
            {showArrows && !isTvMode && (
              <>
                <button 
                  onClick={(e) => { e.stopPropagation(); manualScroll('left'); }}
                  className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-black/80 hover:bg-red-600 p-4 rounded-full backdrop-blur-md border border-white/10 transition-all -translate-x-1/2 opacity-0 group-hover/row:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); manualScroll('right'); }}
                  className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-black/80 hover:bg-red-600 p-4 rounded-full backdrop-blur-md border border-white/10 transition-all translate-x-1/2 opacity-0 group-hover/row:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </AnimatePresence>

          <div 
            ref={scrollRef}
            className="flex gap-4 md:gap-8 overflow-x-auto no-scrollbar pb-8 -mx-4 px-4 md:mx-0 md:px-0 scroll-smooth"
            onFocusCapture={(e) => {
              // Ensure the focused element scrolls into view smoothly within the container
              if (scrollRef.current && e.target instanceof HTMLElement) {
                const container = scrollRef.current;
                const element = e.target;
                const containerRect = container.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();
                
                if (elementRect.left < containerRect.left || elementRect.right > containerRect.right) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
              }
            }}
          >
            {items.map(item => (
              <div key={item.id} className="shrink-0 w-28 sm:w-32 md:w-40 lg:w-48">
                <MediaCard item={item} onClick={onMediaClick} onFocus={setFocusedMedia} />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };

  const renderPlayerControls = (isMobile: boolean) => (
    <div className={`flex ${isMobile ? 'flex-col gap-3 w-full' : 'items-center gap-2 md:gap-3'}`}>
      {atual.tipo === 'tv' && isMobile && (
        <div className="flex items-center justify-between gap-2 w-full">
          <button 
            onClick={anteriorEp}
            disabled={atual.ep <= 1 && seasonsList.findIndex(s => s.season_number === atual.season) === 0}
            className={`bg-white/10 hover:bg-white/20 focus:bg-white/30 p-3 rounded-xl transition-all border border-white/10 active:scale-95 shadow-xl ${(atual.ep <= 1 && seasonsList.findIndex(s => s.season_number === atual.season) === 0) ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Episódio Anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 flex items-center justify-center gap-2">
            <div className="relative">
              <button 
                onClick={() => { setIsSeasonMenuOpen(!isSeasonMenuOpen); setIsEpisodeMenuOpen(false); }}
                className="bg-white/10 hover:bg-white/20 focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white backdrop-blur-md px-4 py-3 rounded-xl transition-all flex items-center gap-2 text-xs font-bold border border-white/10 active:scale-95 shadow-xl"
              >
                T{atual.season}
                <ChevronRight className={`w-4 h-4 transition-transform ${isSeasonMenuOpen ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              <AnimatePresence>
                {isSeasonMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: isMobile ? -10 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: isMobile ? -10 : 10 }}
                    className={`absolute ${isMobile ? 'bottom-full mb-2 right-0 left-auto' : 'top-full right-0 mt-2'} w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-[100] max-h-60 overflow-y-auto no-scrollbar`}
                    onFocusCapture={(e) => {
                      if (e.target instanceof HTMLElement) {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }
                    }}
                  >
                    {seasonsList.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          const newState = { ...atual, season: s.season_number, ep: 1 };
                          setAtual(newState);
                          const item = continueWatching.find(i => i.id === atual.id);
                          if (item) updateContinueWatching(item, newState);
                          setIsSeasonMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${atual.season === s.season_number ? 'text-red-500 bg-red-500/5' : 'text-white/60'}`}
                      >
                        Temporada {s.season_number}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <button 
                onClick={() => { setIsEpisodeMenuOpen(!isEpisodeMenuOpen); setIsSeasonMenuOpen(false); }}
                className="bg-white/10 hover:bg-white/20 focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white backdrop-blur-md px-4 py-3 rounded-xl transition-all flex items-center gap-2 text-xs font-bold border border-white/10 active:scale-95 shadow-xl"
              >
                EP {atual.ep}
                <ChevronRight className={`w-4 h-4 transition-transform ${isEpisodeMenuOpen ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              <AnimatePresence>
                {isEpisodeMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: isMobile ? -10 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: isMobile ? -10 : 10 }}
                    className={`absolute ${isMobile ? 'bottom-full mb-2 right-0 left-auto' : 'top-full right-0 mt-2'} w-72 md:w-80 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-[100] max-h-80 overflow-y-auto no-scrollbar`}
                    onFocusCapture={(e) => {
                      if (e.target instanceof HTMLElement) {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }
                    }}
                  >
                    {isFetchingEpisodes ? (
                      <div className="p-4 text-center text-[10px] font-black uppercase tracking-widest text-white/20 animate-pulse">Carregando...</div>
                    ) : episodesList.map(e => (
                      <button
                        key={e.id}
                        onClick={() => {
                          const newState = { ...atual, ep: e.episode_number };
                          setAtual(newState);
                          const item = continueWatching.find(i => i.id === atual.id);
                          if (item) updateContinueWatching(item, newState);
                          setIsEpisodeMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-3 text-xs font-bold hover:bg-white/5 focus:bg-white/10 focus:outline-none transition-colors border-b border-white/5 last:border-0 flex items-center gap-3 ${atual.ep === e.episode_number ? 'text-red-500 bg-red-500/5' : 'text-white/60'}`}
                      >
                        <div className="relative w-24 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                          <img 
                            src={e.still_path ? `${IMG_BASE_URL}${e.still_path}` : (atual.poster_path ? `${IMG_BASE_URL}${atual.poster_path}` : 'https://via.placeholder.com/300x170?text=Sem+Imagem')}
                            alt={e.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="truncate font-black uppercase tracking-wider text-xs">EP {e.episode_number}</span>
                          <span className="truncate text-white/40 text-[10px]">{e.name}</span>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <button 
            onClick={proximoEp}
            disabled={atual.ep >= maxEpisodes && seasonsList.findIndex(s => s.season_number === atual.season) === seasonsList.length - 1}
            className={`bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl transition-all border border-red-500/20 active:scale-95 shadow-xl ${(atual.ep >= maxEpisodes && seasonsList.findIndex(s => s.season_number === atual.season) === seasonsList.length - 1) ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Próximo Episódio"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className={`flex items-center ${isMobile ? 'gap-2 overflow-x-auto no-scrollbar pb-1 w-full' : 'gap-2 md:gap-3'}`}>
        {atual.tipo === 'tv' && !isMobile && (
          <button 
            onClick={proximoEp}
            disabled={atual.ep >= maxEpisodes && seasonsList.findIndex(s => s.season_number === atual.season) === seasonsList.length - 1}
            className="bg-green-600 hover:bg-green-700 focus:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 text-white backdrop-blur-md px-4 py-2.5 rounded-xl transition-all border border-white/10 active:scale-95 shadow-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 whitespace-nowrap flex-shrink-0"
            title="Próximo Episódio"
          >
            <SkipForward className="w-4 h-4" />
            <span>Próximo</span>
          </button>
        )}

        <button 
          onClick={() => setShowTroubleshooter(true)}
          className="bg-white/5 hover:bg-white/10 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 text-white/40 backdrop-blur-md p-2.5 md:p-2.5 rounded-xl transition-all border border-white/10 active:scale-95 shadow-xl flex-shrink-0"
          title="Ajuda / Problemas com o vídeo"
        >
          <AlertCircle className="w-5 h-5 md:w-4 md:h-4" />
        </button>

        <button 
          onClick={toggleAutoPilot}
          className={`${isAutoPilotActive ? 'bg-green-600/40 text-green-400 border-green-500/40' : 'bg-white/5 text-white/40 border-white/10'} backdrop-blur-md px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border active:scale-95 shadow-xl focus:outline-none focus:ring-2 focus:ring-white whitespace-nowrap flex-shrink-0`}
          title="Modo Auto-Piloto (Troca Automática)"
        >
          <TrendingUp className={`w-4 h-4 md:w-4 md:h-4 ${isAutoPilotActive ? 'animate-bounce' : ''}`} />
          <span>{isAutoPilotActive ? 'Auto-Piloto ON' : 'Auto-Piloto'}</span>
        </button>

        <button 
          onClick={buscarLinkIA}
          disabled={isSearchingServer}
          className="bg-purple-600/20 hover:bg-purple-600/40 focus:bg-purple-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500 text-purple-400 backdrop-blur-md px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border border-purple-500/20 active:scale-95 shadow-xl whitespace-nowrap flex-shrink-0"
          title="Reparo Inteligente via IA"
        >
          <Sparkles className={`w-4 h-4 md:w-4 md:h-4 ${isSearchingServer ? 'animate-pulse' : ''}`} />
          <span>Reparo IA</span>
        </button>

        <button 
          onClick={trocarServidor}
          disabled={isSearchingServer}
          className={`bg-red-600/20 hover:bg-red-600/40 focus:bg-red-600/50 focus:outline-none focus:ring-2 focus:ring-red-500 text-red-500 backdrop-blur-md px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border border-red-500/20 active:scale-95 shadow-xl whitespace-nowrap flex-shrink-0 ${isSearchingServer ? 'animate-pulse' : ''}`}
          title="Trocar Servidor (Modo Autônomo)"
        >
          <Server className={`w-4 h-4 md:w-4 md:h-4 ${isSearchingServer ? 'animate-spin' : ''}`} />
          <span>
            {isSearchingServer ? 'Buscando...' : `Servidor: ${servers[serverIndex].name}`}
          </span>
        </button>

        <button 
          onClick={() => {
            setIsPlayerOpen(false);
            setMagicSearchQuery(`Recomende algo parecido com ${atual.title}`);
            setTimeout(() => {
              const searchInput = document.querySelector('input[placeholder*="Peça para a IA"]') as HTMLInputElement;
              if (searchInput) {
                searchInput.focus();
              }
            }, 100);
          }}
          className="bg-blue-600/20 hover:bg-blue-600/40 focus:bg-blue-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-blue-400 backdrop-blur-md px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border border-blue-500/20 active:scale-95 shadow-xl whitespace-nowrap flex-shrink-0"
          title="Sugestões Inteligentes baseadas no que você está assistindo"
        >
          <Sparkles className="w-4 h-4 md:w-4 md:h-4" />
          <span>Sugestões IA</span>
        </button>

        <button 
          onClick={toggleFullscreen}
          className="bg-white/10 hover:bg-white/20 focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white backdrop-blur-md px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border border-white/10 active:scale-95 shadow-xl whitespace-nowrap flex-shrink-0"
          title="Tela Cheia"
        >
          <Maximize className="w-4 h-4 md:w-4 md:h-4" />
          <span className="hidden md:inline">Tela Cheia</span>
        </button>

        {atual.tipo === 'tv' && !isMobile && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <div className="relative">
              <button 
                onClick={() => { setIsSeasonMenuOpen(!isSeasonMenuOpen); setIsEpisodeMenuOpen(false); }}
                className="bg-white/10 hover:bg-white/20 focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white backdrop-blur-md px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold border border-white/10 active:scale-95 shadow-xl"
              >
                T{atual.season}
                <ChevronRight className={`w-3 h-3 transition-transform ${isSeasonMenuOpen ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              <AnimatePresence>
                {isSeasonMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-[100] max-h-60 overflow-y-auto no-scrollbar"
                    onFocusCapture={(e) => {
                      if (e.target instanceof HTMLElement) {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }
                    }}
                  >
                    {seasonsList.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          const newState = { ...atual, season: s.season_number, ep: 1 };
                          setAtual(newState);
                          const item = continueWatching.find(i => i.id === atual.id);
                          if (item) updateContinueWatching(item, newState);
                          setIsSeasonMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-[10px] font-bold hover:bg-white/5 focus:bg-white/10 focus:outline-none transition-colors border-b border-white/5 last:border-0 ${atual.season === s.season_number ? 'text-red-500 bg-red-500/5' : 'text-white/60'}`}
                      >
                        Temporada {s.season_number}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <button 
                onClick={() => { setIsEpisodeMenuOpen(!isEpisodeMenuOpen); setIsSeasonMenuOpen(false); }}
                className="bg-white/10 hover:bg-white/20 focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white backdrop-blur-md px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold border border-white/10 active:scale-95 shadow-xl"
              >
                EP {atual.ep}
                <ChevronRight className={`w-3 h-3 transition-transform ${isEpisodeMenuOpen ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              <AnimatePresence>
                {isEpisodeMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 w-72 md:w-80 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-[100] max-h-80 overflow-y-auto no-scrollbar"
                    onFocusCapture={(e) => {
                      if (e.target instanceof HTMLElement) {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }
                    }}
                  >
                    {isFetchingEpisodes ? (
                      <div className="p-4 text-center text-[10px] font-black uppercase tracking-widest text-white/20 animate-pulse">Carregando...</div>
                    ) : episodesList.map(e => (
                      <button
                        key={e.id}
                        onClick={() => {
                          const newState = { ...atual, ep: e.episode_number };
                          setAtual(newState);
                          const item = continueWatching.find(i => i.id === atual.id);
                          if (item) updateContinueWatching(item, newState);
                          setIsEpisodeMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-3 text-xs font-bold hover:bg-white/5 focus:bg-white/10 focus:outline-none transition-colors border-b border-white/5 last:border-0 flex items-center gap-3 ${atual.ep === e.episode_number ? 'text-red-500 bg-red-500/5' : 'text-white/60'}`}
                      >
                        <div className="relative w-24 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                          <img 
                            src={e.still_path ? `${IMG_BASE_URL}${e.still_path}` : (atual.poster_path ? `${IMG_BASE_URL}${atual.poster_path}` : 'https://via.placeholder.com/300x170?text=Sem+Imagem')}
                            alt={e.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="truncate font-black uppercase tracking-wider text-xs">EP {e.episode_number}</span>
                          <span className="truncate text-white/40 text-[10px]">{e.name}</span>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 ml-1">
              <button 
                onClick={anteriorEp}
                disabled={atual.ep <= 1 && seasonsList.findIndex(s => s.season_number === atual.season) === 0}
                className={`bg-white/10 hover:bg-white/20 focus:bg-white/30 p-2.5 rounded-xl transition-all border border-white/10 active:scale-95 shadow-xl ${(atual.ep <= 1 && seasonsList.findIndex(s => s.season_number === atual.season) === 0) ? 'opacity-30 cursor-not-allowed' : ''}`}
                title="Episódio Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );



  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (!user) {
    return <AuthForm onSuccess={() => {}} />;
  }

  return (
    <div className={`min-h-screen bg-[#0b0b0b] text-white font-sans selection:bg-red-600 ${isTvMode ? 'tv-mode' : ''}`}>
      {/* Full Menu Overlay */}
      <AnimatePresence>
        {isFullMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col p-8 md:p-16"
            onAnimationComplete={() => {
              if (isTvMode) {
                document.getElementById('close-full-menu')?.focus();
              }
            }}
          >
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-2">
                <span className="text-4xl font-black tracking-tighter text-red-600 italic">Flix BR</span>
                <span className="bg-red-600 text-xs font-bold px-2 py-1 rounded uppercase tracking-widest">Ultra+</span>
              </div>
              <button 
                id="close-full-menu"
                onClick={() => setIsFullMenuOpen(false)}
                className="p-4 bg-white/5 hover:bg-red-600 rounded-full transition-all focus:outline-none focus:ring-4 focus:ring-red-600"
              >
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 overflow-y-auto no-scrollbar">
              <div className="space-y-6">
                <h3 className="text-red-600 font-black uppercase tracking-[0.3em] text-sm">Navegação</h3>
                <div className="flex flex-col gap-4">
                  {[
                    { label: 'Início', action: () => { setMediaType('all'); setSelectedGenre(null); setSearchQuery(""); setSpecialCategory(null); setShowContinue(false); } },
                    { label: 'Filmes', action: () => { setMediaType('movie'); setSelectedGenre(null); setSearchQuery(""); setSpecialCategory(null); setShowContinue(false); } },
                    { label: 'Séries', action: () => { setMediaType('tv'); setSelectedGenre(null); setSearchQuery(""); setSpecialCategory(null); setShowContinue(false); } },
                    { label: 'Animes', action: () => { setSpecialCategory('anime'); setSelectedGenre(null); setSearchQuery(""); setMediaType('all'); setShowContinue(false); } },
                    { label: 'Desenhos', action: () => { setSpecialCategory('animation'); setSelectedGenre(null); setSearchQuery(""); setMediaType('all'); setShowContinue(false); } },
                    { label: 'Continuar Assistindo', action: () => { setShowContinue(true); setMediaType('all'); setSelectedGenre(null); setSearchQuery(""); setSpecialCategory(null); } },
                    { label: 'Pesquisar', action: () => { document.querySelector('input')?.focus(); } },
                    { label: 'Sair da Conta', action: () => { handleLogout(); setIsFullMenuOpen(false); } }
                  ].map((item, i) => (
                    <button
                      key={i}
                      onClick={() => { item.action(); setIsFullMenuOpen(false); }}
                      className="text-3xl md:text-5xl font-black text-white/40 hover:text-white focus:text-white focus:outline-none focus:ring-2 focus:ring-red-600 rounded-lg px-4 py-2 -ml-4 transition-all text-left group flex items-center gap-4"
                    >
                      <span className="w-0 group-hover:w-8 group-focus:w-8 h-1 bg-red-600 transition-all" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-red-600 font-black uppercase tracking-[0.3em] text-sm">Gêneros Populares</h3>
                <div className="grid grid-cols-2 gap-4">
                  {genres.slice(0, 12).map((genre) => (
                    <button
                      key={genre.id}
                      onClick={() => { setSelectedGenre(genre.id); setSearchQuery(""); setIsFullMenuOpen(false); }}
                      className="text-lg font-bold text-white/40 hover:text-white focus:text-white focus:outline-none focus:ring-2 focus:ring-red-600 rounded-md px-2 py-1 -ml-2 transition-all text-left"
                    >
                      {genre.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-red-600 font-black uppercase tracking-[0.3em] text-sm">Configurações</h3>
                <div className="flex flex-col gap-4">
                  <button 
                    onClick={() => setShowClearConfirm(true)}
                    className="flex items-center gap-3 text-white/40 hover:text-red-500 transition-colors text-left font-bold focus:outline-none focus:text-red-500 focus:ring-2 focus:ring-red-500 rounded-md p-2 -ml-2"
                  >
                    <X className="w-5 h-5" />
                    Limpar Histórico
                  </button>
                  <button 
                    onClick={() => { refreshCatalog(); setIsFullMenuOpen(false); }}
                    className="flex items-center gap-3 text-white/40 hover:text-green-500 transition-colors text-left font-bold focus:outline-none focus:text-green-500 focus:ring-2 focus:ring-green-500 rounded-md p-2 -ml-2"
                  >
                    <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar Catálogo
                  </button>

                  <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                    <p className="text-xs text-white/40 leading-relaxed">
                      O <b>FLIX BR Ultra+</b> utiliza inteligência artificial para otimizar sua conexão e encontrar os melhores servidores automaticamente.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-white/5 px-4 md:px-8 py-4 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6 w-full lg:w-auto justify-between lg:justify-start">
          <button 
            className="flex items-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600 rounded-lg p-1 transition-all active:scale-95 hover:bg-white/5" 
            onClick={() => setIsFullMenuOpen(true)}
            title="Menu Completo"
          >
            <span className="text-2xl font-black tracking-tighter text-red-600 italic">Flix BR</span>
            <span className="bg-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest">Ultra+</span>
          </button>

          <div className="flex items-center gap-4">
            {user?.isAdmin && (
              <button 
                onClick={() => { setIsAdminPanelOpen(true); fetchAdminUsers(); }}
                className="text-xs font-bold text-red-500 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-red-600 rounded-md px-2 py-1 flex items-center gap-1"
              >
                <Star className="w-3 h-3" />
                Painel VIP
              </button>
            )}
            
            <button 
              onClick={toggleTvMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-red-600 border ${isTvMode ? 'bg-red-600/20 text-red-500 border-red-500/30' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white'}`}
              title="Alternar Modo TV"
            >
              <Tv className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Modo TV</span>
              <div className={`w-6 h-3 rounded-full transition-all relative ml-1 ${isTvMode ? 'bg-red-600' : 'bg-white/20'}`}>
                <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${isTvMode ? 'left-3.5' : 'left-0.5'}`} />
              </div>
            </button>

            <button 
              onClick={handleLogout}
              className="text-xs font-bold text-white/60 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/20 rounded-md px-2 py-1 flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" />
              <span className="hidden md:inline">Sair</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto overflow-x-auto no-scrollbar pb-2 lg:pb-0">
          <nav className={`flex items-center gap-4 md:gap-6 text-sm font-bold text-white/60 uppercase tracking-wider shrink-0 ${isTvMode ? 'text-lg gap-10 lg:gap-14' : ''}`}>
            <button 
              onClick={() => { setMediaType('all'); setSelectedGenre(null); setSearchQuery(""); setSpecialCategory(null); setShowContinue(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`hover:text-white transition-all focus:outline-none focus:text-white focus:ring-2 focus:ring-red-600 rounded-md px-2 py-1 relative ${mediaType === 'all' && !selectedGenre && !searchQuery && !specialCategory && !showContinue ? 'text-white scale-110' : ''}`}
            >
              Início
              {mediaType === 'all' && !selectedGenre && !searchQuery && !specialCategory && !showContinue && (
                <motion.div layoutId="activeTabDesktop" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
              )}
            </button>
            <button 
              onClick={() => { setMediaType('movie'); setSelectedGenre(null); setSearchQuery(""); setSpecialCategory(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`hover:text-white transition-all focus:outline-none focus:text-white focus:ring-2 focus:ring-red-600 rounded-md px-2 py-1 relative ${mediaType === 'movie' && !specialCategory ? 'text-white scale-110' : ''}`}
            >
              Filmes
              {mediaType === 'movie' && !specialCategory && (
                <motion.div layoutId="activeTabDesktop" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
              )}
            </button>
            <button 
              onClick={() => { setMediaType('tv'); setSelectedGenre(null); setSearchQuery(""); setSpecialCategory(null); setShowContinue(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`hover:text-white transition-all focus:outline-none focus:text-white focus:ring-2 focus:ring-red-600 rounded-md px-2 py-1 relative ${mediaType === 'tv' && !specialCategory && !showContinue ? 'text-white scale-110' : ''}`}
            >
              Séries
              {mediaType === 'tv' && !specialCategory && !showContinue && (
                <motion.div layoutId="activeTabDesktop" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
              )}
            </button>
            <button 
              onClick={() => { setSpecialCategory('anime'); setSelectedGenre(null); setSearchQuery(""); setMediaType('all'); setShowContinue(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`hover:text-white transition-all focus:outline-none focus:text-white focus:ring-2 focus:ring-red-600 rounded-md px-2 py-1 relative ${specialCategory === 'anime' && !showContinue ? 'text-white scale-110' : ''}`}
            >
              Animes
              {specialCategory === 'anime' && !showContinue && (
                <motion.div layoutId="activeTabDesktop" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
              )}
            </button>
            <button 
              onClick={() => { setSpecialCategory('animation'); setSelectedGenre(null); setSearchQuery(""); setMediaType('all'); setShowContinue(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`hover:text-white transition-all focus:outline-none focus:text-white focus:ring-2 focus:ring-red-600 rounded-md px-2 py-1 relative ${specialCategory === 'animation' && !showContinue ? 'text-white scale-110' : ''}`}
            >
              Desenhos
              {specialCategory === 'animation' && !showContinue && (
                <motion.div layoutId="activeTabDesktop" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
              )}
            </button>

            <div className="relative">
              <button 
                onClick={() => setIsGenreMenuOpen(!isGenreMenuOpen)}
                className={`hover:text-white transition-all focus:outline-none focus:text-white focus:ring-2 focus:ring-red-600 rounded-md px-2 py-1 relative flex items-center gap-1 ${selectedGenre ? 'text-white' : ''}`}
              >
                Gêneros
                <ChevronRight className={`w-4 h-4 transition-transform ${isGenreMenuOpen ? 'rotate-90' : ''}`} />
              </button>
              <AnimatePresence>
                {isGenreMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full left-0 mt-2 w-64 bg-black/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl p-4 grid grid-cols-2 gap-2 z-50"
                  >
                    {genres.map(genre => (
                      <button
                        key={genre.id}
                        onClick={() => { setSelectedGenre(genre.id); setIsGenreMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`text-[10px] font-bold uppercase tracking-widest p-2 rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-white transition-all text-left ${selectedGenre === genre.id ? 'bg-red-600 text-white' : 'text-white/40'}`}
                      >
                        {genre.name}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button 
              onClick={() => { setShowContinue(true); setMediaType('all'); setSelectedGenre(null); setSearchQuery(""); setSpecialCategory(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`hover:text-white transition-all focus:outline-none focus:text-white focus:ring-2 focus:ring-red-600 rounded-md px-2 py-1 relative ${showContinue ? 'text-white scale-110' : ''} flex items-center gap-2`}
            >
              <History className="w-4 h-4" />
              Continuar
              {showContinue && (
                <motion.div layoutId="activeTabDesktop" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
              )}
            </button>

          </nav>

          {atual.id && !isPlayerOpen && (
            <button 
              onClick={() => {
                if (!checkVipAccess()) {
                  setShowVipModal(true);
                  return;
                }
                setIsPlayerOpen(true);
              }}
              className="flex items-center gap-2 text-[10px] md:text-xs font-bold uppercase tracking-wider text-red-500 hover:text-red-400 transition-colors bg-red-500/10 px-3 py-1.5 rounded-full border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <History className="w-3 h-3 md:w-4 h-4" />
              Retomar: {atual.title?.slice(0, 15)}...
            </button>
          )}
        </div>

        <div className="relative w-full max-w-2xl group flex flex-col gap-3">
          <div className="relative flex items-center">
            <Search className="absolute left-4 w-5 h-5 text-white/40 group-focus-within:text-red-500 transition-colors" />
            <input
              type="text"
              placeholder="O que você quer assistir hoje? (Pesquisa normal ou peça para a IA)"
              className="w-full bg-white/10 border border-white/20 rounded-full py-4 pl-12 pr-36 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/20 focus:bg-white/15 transition-all placeholder:text-white/40 text-sm md:text-base shadow-inner"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setMagicSearchQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  // If they press Enter, we could trigger magic search or just let normal search happen
                  // Normal search happens automatically via debounce, so Enter could trigger Magic Search
                  handleMagicSearch();
                }
              }}
            />
            <button 
              onClick={handleMagicSearch}
              disabled={isMagicSearching || !searchQuery.trim()}
              className="absolute right-2 bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-500 hover:to-red-500 text-white px-4 py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white"
            >
              <Sparkles className={`w-4 h-4 ${isMagicSearching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isMagicSearching ? 'Buscando...' : 'Busca Mágica'}</span>
              <span className="sm:hidden">{isMagicSearching ? '...' : 'IA'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* TV Hero Banner */}
      {isTvMode && focusedMedia && (
        <motion.div 
          key={focusedMedia.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative w-full h-[50vh] md:h-[65vh] flex-shrink-0 -mt-24 mb-12 hidden md:block" // Hidden on mobile, but TVs are usually md or larger
        >
          <div className="absolute inset-0 overflow-hidden">
            <img 
              src={focusedMedia.backdrop_path ? `https://image.tmdb.org/t/p/original${focusedMedia.backdrop_path}` : focusedMedia.poster_path ? `${IMG_BASE_URL}${focusedMedia.poster_path}` : 'https://via.placeholder.com/1920x1080?text=Flix+BR'} 
              className="w-full h-full object-cover opacity-60 scale-105"
              alt="Backdrop"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b0b] via-[#0b0b0b]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b0b]/80 via-transparent to-transparent" />
          </div>
          <div className="absolute bottom-12 left-0 p-8 md:p-16 max-w-3xl z-10">
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-black tracking-tighter mb-4 text-white drop-shadow-2xl"
            >
              {focusedMedia.title || focusedMedia.name}
            </motion.h1>
            
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-4 mb-6"
            >
              <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded uppercase tracking-widest shadow-lg">
                {focusedMedia.media_type === 'tv' || (!focusedMedia.title && focusedMedia.name) ? 'Série' : 'Filme'}
              </span>
              {focusedMedia.vote_average && (
                <span className="flex items-center gap-1 text-sm font-bold text-yellow-400 bg-black/40 px-3 py-1 rounded backdrop-blur-sm border border-yellow-400/20">
                  <Star className="w-4 h-4 fill-current" />
                  {focusedMedia.vote_average.toFixed(1)}
                </span>
              )}
            </motion.div>

            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-white/80 text-lg md:text-xl line-clamp-3 mb-8 drop-shadow-md font-medium leading-relaxed"
            >
              {focusedMedia.overview || "Nenhuma sinopse disponível para este título."}
            </motion.p>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex items-center gap-4 text-sm font-bold text-white/50 bg-black/40 w-fit px-4 py-2 rounded-xl backdrop-blur-md border border-white/5"
            >
              <Info className="w-5 h-5 text-white/80" />
              <p>Pressione <span className="text-white bg-white/20 px-2 py-0.5 rounded mx-1">OK</span> no controle para assistir</p>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Genre Bar */}
      <div className={`relative bg-black/40 border-b border-white/5 px-4 md:px-8 py-4 flex items-center group md:hidden ${isTvMode ? 'py-6' : ''}`}>
        <button onClick={() => scrollGenres('left')} className="absolute left-2 z-10 p-2 bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-600 hidden md:block">
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        <div 
          ref={genreScrollRef}
          className="flex items-center gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth px-6"
          onFocusCapture={(e) => {
            if (genreScrollRef.current && e.target instanceof HTMLElement) {
              const container = genreScrollRef.current;
              const element = e.target;
              const containerRect = container.getBoundingClientRect();
              const elementRect = element.getBoundingClientRect();
              
              if (elementRect.left < containerRect.left || elementRect.right > containerRect.right) {
                element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }
            }
          }}
        >
          <button
            onClick={() => { setSelectedGenre(null); setSearchQuery(""); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className={`whitespace-nowrap px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all snap-start border focus:outline-none focus:ring-2 focus:ring-red-600 ${!selectedGenre ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20 scale-105' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'} ${isTvMode ? 'text-xs px-8 py-4' : ''}`}
          >
            Tudo
          </button>
          {genres.map(genre => (
            <button
              key={genre.id}
              onClick={() => { setSelectedGenre(genre.id); setSearchQuery(""); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`whitespace-nowrap px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all snap-start border focus:outline-none focus:ring-2 focus:ring-red-600 ${selectedGenre === genre.id ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20 scale-105' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'} ${isTvMode ? 'text-xs px-8 py-4' : ''}`}
            >
              {genre.name}
            </button>
          ))}
        </div>

        <button onClick={() => scrollGenres('right')} className="absolute right-2 z-10 p-2 bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-600 hidden md:block">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content */}
      <main className="py-8">
        {loading ? (
          <div className="px-4 md:px-8 lg:px-12 space-y-12">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-4">
                <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
                <div className="flex gap-6 overflow-hidden">
                  {[...Array(6)].map((_, j) => (
                    <div key={j} className="aspect-[2/3] w-48 bg-white/5 rounded-2xl animate-pulse flex-shrink-0" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : showContinue ? (
          <div className="px-4 md:px-8 lg:px-12">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-3">
                <History className="w-6 h-6 text-red-600" />
                Continuar Assistindo
              </h2>
              {continueWatching.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-red-500 transition-colors flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/5"
                >
                  <X className="w-3 h-3" />
                  Limpar Tudo
                </button>
              )}
            </div>
            
            {continueWatching.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4 md:gap-6">
                {continueWatching.map(item => (
                  <div key={item.id} className="relative group">
                    <MediaCard item={item} onClick={assistir} onFocus={setFocusedMedia} />
                    {item.tipo === 'tv' && (
                      <div className="absolute top-2 right-2 z-10 bg-red-600 text-[9px] font-black px-2 py-1 rounded shadow-xl pointer-events-none">
                        T{item.season} E{item.ep}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                  <History className="w-10 h-10 text-white/20" />
                </div>
                <h3 className="text-xl font-black mb-2">Nada por aqui ainda</h3>
                <p className="text-white/40 max-w-xs text-sm">Comece a assistir algo e ele aparecerá aqui automaticamente para você continuar depois.</p>
                <button 
                  onClick={() => setShowContinue(false)}
                  className="mt-8 bg-red-600 hover:bg-red-700 focus:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-500 text-white px-8 py-3 rounded-2xl font-black text-sm transition-all active:scale-95"
                >
                  Explorar Catálogo
                </button>
              </div>
            )}
          </div>
        ) : searchQuery || selectedGenre || mediaType !== 'all' || specialCategory ? (
          <div className="px-4 md:px-8 lg:px-12">
            <h2 className="text-xl md:text-2xl font-black tracking-tight mb-8 flex items-center gap-3">
              {searchQuery ? `Resultados para "${searchQuery}"` : 
               specialCategory === 'anime' ? 'Animes' :
               specialCategory === 'animation' ? 'Desenhos & Animações' :
               selectedGenre ? genres.find(g => g.id === selectedGenre)?.name : 
               mediaType === 'movie' ? 'Filmes' : 'Séries'}
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4 md:gap-6">
              {searchResults.map(item => <React.Fragment key={item.id}><MediaCard item={item} onClick={assistir} onFocus={setFocusedMedia} /></React.Fragment>)}
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {sections.map((section, idx) => (
              <React.Fragment key={`${section.title}-${idx}`}>
                <ScrollableRow 
                  title={section.title}
                  items={section.items}
                  onMediaClick={assistir}
                  icon={section.title === "Bombando na Semana" ? TrendingUp : Film}
                  genreId={section.genreId}
                  specialCategory={section.specialCategory}
                  mediaType={section.mediaType}
                />
              </React.Fragment>
            ))}
          </div>
        )}
      </main>

      {/* Confirmation Modals */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-600/20 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black mb-2 uppercase tracking-tight">Limpar Histórico?</h2>
              <p className="text-white/40 text-sm mb-8 leading-relaxed">
                Isso removerá todos os itens da sua lista "Continuar Assistindo". Esta ação não pode ser desfeita.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="p-4 bg-white/5 hover:bg-white/10 focus:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/50 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={clearHistory}
                  className="p-4 bg-red-600 hover:bg-red-700 focus:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-500 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl shadow-red-600/20"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* VIP Block Modal */}
        {showVipModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#141414] border border-red-600/30 p-8 rounded-2xl max-w-md w-full text-center shadow-[0_0_50px_rgba(220,38,38,0.15)]"
            >
              <Star className="w-16 h-16 text-red-600 mx-auto mb-6 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
              <h2 className="text-2xl font-black mb-4 text-white uppercase tracking-tight">Acesso VIP Necessário</h2>
              <p className="text-white/60 mb-8">
                Para assistir a este conteúdo, você precisa ser um usuário VIP. Entre em contato com o administrador para liberar seu acesso.
              </p>
              <button 
                onClick={() => setShowVipModal(false)}
                className="w-full py-4 rounded font-black bg-red-600 hover:bg-red-700 transition-colors uppercase tracking-widest text-sm"
              >
                Entendi
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-8 right-8 z-40 bg-red-600 text-white p-4 rounded-2xl shadow-2xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-600/50 transition-all active:scale-95"
          >
            <ChevronRight className="w-6 h-6 -rotate-90" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Player Overlay */}
      <AnimatePresence>
        {isPlayerOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
            onAnimationComplete={() => {
              if (isTvMode) {
                document.getElementById('player-iframe-focus')?.focus();
              }
            }}
          >
            {/* Player Header */}
            <div className="absolute top-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent z-[60] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                <button 
                  id="close-player-btn"
                  onClick={fechar}
                  className="group flex items-center gap-2 bg-white/10 hover:bg-red-600 focus:bg-red-600 focus:outline-none focus:ring-4 focus:ring-red-600/50 backdrop-blur-md px-4 py-2.5 rounded-xl transition-all border border-white/10 active:scale-95 shadow-2xl"
                >
                  <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-sm font-black uppercase tracking-widest">Voltar</span>
                </button>
                
                <div className="flex flex-col md:border-l md:border-white/20 md:pl-4 text-right md:text-left">
                  <span className="text-[10px] font-black text-red-600 uppercase tracking-[0.3em] mb-0.5">Assistindo</span>
                  <h3 className="text-xs md:text-sm font-black tracking-tight truncate max-w-[150px] md:max-w-md">
                    {atual.title} {atual.tipo === 'tv' && `• T${atual.season} E${atual.ep}`}
                  </h3>
                </div>
              </div>

              <div className="hidden md:block">
                {renderPlayerControls(false)}
              </div>
            </div>

            {/* Troubleshooter Modal */}
            <AnimatePresence>
              {showTroubleshooter && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
                >
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-lg w-full shadow-2xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-purple-600 to-red-600" />
                    
                    <button 
                      onClick={() => setShowTroubleshooter(false)}
                      className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white rounded-md p-1"
                    >
                      <X className="w-6 h-6" />
                    </button>

                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-red-600/20 rounded-2xl flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black tracking-tight">Problemas com o vídeo?</h2>
                        <p className="text-white/40 text-sm">"This media is unavailable at the moment"</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <h3 className="font-bold text-red-500 mb-2 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          Solução 1: Modo Auto-Piloto
                        </h3>
                        <p className="text-sm text-white/60 leading-relaxed">
                          Ative o <b>Auto-Piloto</b> no topo do player. O sistema irá testar automaticamente todos os 7 servidores até encontrar um que funcione para você.
                        </p>
                      </div>

                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <h3 className="font-bold text-purple-500 mb-2 flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Solução 2: Reparo IA
                        </h3>
                        <p className="text-sm text-white/60 leading-relaxed">
                          Se os servidores fixos falharem, clique em <b>Reparo IA</b>. Nossa inteligência artificial buscará na internet um link alternativo e seguro para carregar no app.
                        </p>
                      </div>

                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <h3 className="font-bold text-blue-500 mb-2 flex items-center gap-2">
                          <Server className="w-4 h-4" />
                          Solução 3: Troca Manual
                        </h3>
                        <p className="text-sm text-white/60 leading-relaxed">
                          Clique no botão <b>Servidor</b> para alternar manualmente entre as 7 opções disponíveis. Cada servidor tem fontes diferentes.
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => {
                        setShowTroubleshooter(false);
                        toggleAutoPilot();
                      }}
                      className="w-full mt-8 bg-red-600 hover:bg-red-700 focus:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-500 text-white font-black py-4 rounded-2xl transition-all active:scale-95 shadow-xl flex items-center justify-center gap-3"
                    >
                      <TrendingUp className="w-5 h-5" />
                      ATIVAR AUTO-PILOTO AGORA
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Video Container */}
            <div ref={playerContainerRef} className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
              {(isSearchingServer || isAutoPilotActive) && (
                <div className="absolute inset-0 z-[70] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                  <motion.div 
                    animate={{ 
                      rotate: 360,
                      scale: [1, 1.2, 1],
                      borderColor: isAutoPilotActive ? ["#16a34a", "#22c55e", "#16a34a"] : ["#dc2626", "#9333ea", "#dc2626"]
                    }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className={`w-16 h-16 border-4 ${isAutoPilotActive ? 'border-green-600' : 'border-red-600'} border-t-transparent rounded-full shadow-[0_0_40px_rgba(34,197,94,0.2)]`}
                  />
                  <div className="text-center space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm font-black uppercase tracking-[0.3em] text-white animate-pulse">
                        {isAutoPilotActive ? `Testando Servidor ${serverIndex + 1}...` : (customServerUrl ? 'Link Encontrado!' : 'IA Buscando Melhor Rota...')}
                      </p>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        {isAutoPilotActive ? 'Otimizando conexão automaticamente' : 'Analisando servidores globais em tempo real'}
                      </p>
                    </div>
                    
                    <button 
                      onClick={fechar}
                      className="mx-auto flex items-center gap-2 bg-white/10 hover:bg-red-600 focus:bg-red-600 focus:outline-none focus:ring-4 focus:ring-red-600/50 backdrop-blur-md px-6 py-2 rounded-xl transition-all border border-white/10 active:scale-95 text-[10px] font-black uppercase tracking-widest"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Cancelar / Voltar
                    </button>
                  </div>
                </div>
              )}

              {iaError && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[80] bg-red-600/90 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-2xl animate-bounce">
                  <AlertCircle className="w-3 h-3" />
                  {iaError}
                </div>
              )}
              
              {/* Sandbox added to block popups and improve flow */}
              <iframe
                id="player-iframe-focus"
                src={renderPlayerUrl()}
                className="w-full h-full border-none focus:ring-4 focus:ring-red-600 focus:outline-none"
                allowFullScreen
                title="Video Player"
                sandbox="allow-forms allow-scripts allow-same-origin allow-presentation"
                tabIndex={0}
              />
              
              {/* Overlay removed to allow full touch access to player controls on mobile */}
            </div>

            {/* Mobile Bottom Controls */}
            <div className="md:hidden bg-zinc-950 p-3 border-t border-white/10 flex flex-col gap-3 z-[60] shrink-0">
               {renderPlayerControls(true)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="p-12 text-center border-t border-white/5">
        <div className="flex items-center justify-center gap-2 mb-4 opacity-30">
          <span className="text-xl font-black tracking-tighter italic text-red-600">Flix BR</span>
          <span className="bg-white text-black text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-widest">Ultra+</span>
        </div>
        <p className="opacity-20 text-[9px] uppercase tracking-[0.4em]">
          Desenvolvido com tecnologia de ponta para a melhor experiência • Otimizado para TV, Mobile e PC
        </p>
      </footer>

      {/* Profile Modal removed */}

      {/* Auth Modal removed */}

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {isAdminPanelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#141414] w-full max-w-4xl p-4 md:p-8 rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <Star className="w-6 h-6 text-red-600" />
                  <h2 className="text-2xl font-black italic text-red-600 uppercase tracking-tighter">Painel VIP</h2>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <input 
                      type="text" 
                      placeholder="Buscar por email..." 
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase();
                        if (!val) {
                          fetchAdminUsers();
                        } else {
                          setAdminUsers(prev => prev.filter(u => u.username?.toLowerCase().includes(val)));
                        }
                      }}
                      className="bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-red-600 text-white w-48"
                    />
                  </div>
                  <button 
                    onClick={fetchAdminUsers}
                    className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-black px-4 py-2 rounded uppercase transition-all flex items-center gap-2"
                  >
                    Atualizar
                  </button>
                  <button 
                    onClick={() => setShowNewUserForm(!showNewUserForm)}
                    className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-black px-4 py-2 rounded uppercase transition-all flex items-center gap-2"
                  >
                    {showNewUserForm ? 'Cancelar' : 'Novo Usuário'}
                  </button>
                  <button onClick={() => setIsAdminPanelOpen(false)} className="p-2 hover:bg-white/5 rounded-full focus:outline-none focus:ring-2 focus:ring-white">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {showNewUserForm && (
                <motion.form 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  onSubmit={handleAdminCreateUser}
                  className="mb-8 p-6 bg-white/5 rounded-xl border border-white/10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Usuário</label>
                    <input 
                      type="text" 
                      required 
                      value={newUserUsername} 
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm focus:border-red-600 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Senha</label>
                    <input 
                      type="password" 
                      required 
                      value={newUserPassword} 
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm focus:border-red-600 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Dias VIP</label>
                    <input 
                      type="number" 
                      value={newUserVipDays} 
                      onChange={(e) => setNewUserVipDays(parseInt(e.target.value))}
                      className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm focus:border-red-600 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-6 py-4">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={newUserIsVip} 
                        onChange={(e) => setNewUserIsVip(e.target.checked)}
                        className="w-4 h-4 accent-red-600"
                      />
                      <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-white transition-colors">Ativar VIP</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={newUserIsAdmin} 
                        onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                        className="w-4 h-4 accent-red-600"
                      />
                      <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-white transition-colors">Administrador</span>
                    </label>
                  </div>
                  <div className="md:col-span-2 lg:col-span-1 flex items-end">
                    <button 
                      type="submit"
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest py-2 rounded transition-all"
                    >
                      Criar Usuário
                    </button>
                  </div>
                </motion.form>
              )}

              <div className="flex-1 overflow-y-auto overflow-x-auto no-scrollbar">
                <table className="w-full text-left min-w-[700px]">
                  <thead>
                    <tr className="border-b border-white/5 text-white/40 text-[10px] uppercase tracking-widest">
                      <th className="pb-4 font-black">Usuário</th>
                      <th className="pb-4 font-black">Status</th>
                      <th className="pb-4 font-black">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {adminUsers.map((u: any) => {
                      const isVipActive = u.is_vip && (!u.vip_until || new Date(u.vip_until) > new Date());
                      const isExpired = u.is_vip && u.vip_until && new Date(u.vip_until) <= new Date();
                      
                      return (
                      <tr key={u.id} className="group">
                        <td className="py-4">
                          <div className="font-bold text-sm">{u.username}</div>
                          <div className="text-[10px] text-white/20">{u.id}</div>
                        </td>
                        <td className="py-4">
                          {u.is_admin ? (
                            <span className="bg-red-600/20 text-red-500 text-[10px] font-black px-2 py-1 rounded uppercase">Admin</span>
                          ) : isVipActive ? (
                            <div className="flex flex-col gap-1 items-start">
                              <span className="bg-green-600/20 text-green-500 text-[10px] font-black px-2 py-1 rounded uppercase">VIP Ativo</span>
                              {u.vip_until && <span className="text-[9px] text-white/40">Expira: {new Date(u.vip_until).toLocaleDateString('pt-BR')}</span>}
                            </div>
                          ) : isExpired ? (
                            <div className="flex flex-col gap-1 items-start">
                              <span className="bg-yellow-600/20 text-yellow-500 text-[10px] font-black px-2 py-1 rounded uppercase">VIP Expirado</span>
                              <span className="text-[9px] text-white/40">Expirou: {new Date(u.vip_until).toLocaleDateString('pt-BR')}</span>
                            </div>
                          ) : (
                            <span className="bg-white/5 text-white/40 text-[10px] font-black px-2 py-1 rounded uppercase">Bloqueado / Grátis</span>
                          )}
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            {!u.is_admin && (
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-1">
                                  <span className="text-[8px] text-white/40 uppercase tracking-widest">Nova Validade</span>
                                  <input 
                                    type="date" 
                                    defaultValue={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-red-600 text-white/70"
                                    id={`date-${u.id}`}
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    const dateVal = (document.getElementById(`date-${u.id}`) as HTMLInputElement).value;
                                    if (!dateVal) return;
                                    const selectedDate = new Date(`${dateVal}T23:59:59`); // End of the selected day
                                    updateVip(u.id, selectedDate.toISOString(), true);
                                  }}
                                  className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-black px-3 py-2 rounded uppercase transition-all mt-3"
                                >
                                  Renovar VIP
                                </button>
                                <button
                                  onClick={() => updateVip(u.id, null, false)}
                                  className="bg-white/5 hover:bg-white/10 text-white/60 text-[10px] font-black px-3 py-2 rounded uppercase transition-all mt-3"
                                >
                                  Remover VIP
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => deleteUser(u.id)}
                              className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-black px-3 py-2 rounded uppercase transition-all flex items-center gap-2 mt-3"
                              title="Excluir Usuário"
                            >
                              <X className="w-4 h-4" />
                              Excluir Conta
                            </button>
                            {resettingPasswordFor === u.id ? (
                              <div className="flex items-center gap-2 mt-3">
                                <input
                                  type="password"
                                  placeholder="Nova senha"
                                  value={newPasswordValue}
                                  onChange={(e) => setNewPasswordValue(e.target.value)}
                                  className="bg-black/50 border border-white/10 rounded px-2 py-1 text-xs focus:border-blue-500 outline-none w-24"
                                />
                                <button
                                  onClick={() => handleResetPassword(u.id)}
                                  className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-black px-2 py-1 rounded uppercase transition-all"
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={() => {
                                    setResettingPasswordFor(null);
                                    setNewPasswordValue("");
                                  }}
                                  className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-black px-2 py-1 rounded uppercase transition-all"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setResettingPasswordFor(u.id)}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black px-3 py-2 rounded uppercase transition-all mt-3"
                              >
                                Resetar Senha
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
