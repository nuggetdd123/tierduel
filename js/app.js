// ============================================================
// SUPABASE CONFIG
// ============================================================
export const supabaseUrl = 'https://kypwlrthmkijbfqzmtlr.supabase.co';
export const supabaseAnonKey = 'sb_publishable_Y4RcI1KBatr-UH_2c8MOBQ_SylPlcFR';

// Create Supabase client
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================
// STATE
// ============================================================
export let currentUser = null;

// ============================================================
// DOM REFS
// ============================================================
const authSection = document.getElementById('authSection');
const gameView = document.getElementById('gameView');
const uploadView = document.getElementById('uploadView');
const duelsView = document.getElementById('duelsView');
const duelPlayView = document.getElementById('duelPlayView');
const moderatorView = document.getElementById('moderatorView');
const authButton = document.getElementById('authButton');
const moderatorNav = document.getElementById('moderatorNav');
const navLinks = document.querySelectorAll('.nav-link');

// ============================================================
// VIEW SWITCHER - WITH LOGIN CHECK!
// ============================================================
export function switchView(view) {
    const user = getCurrentUser();
    
    const protectedViews = ['game', 'upload', 'duels', 'moderator'];
    
    if (protectedViews.includes(view) && !user) {
        alert('⚠️ You must be logged in to access this!');
        view = 'auth';
    }
    
    [authSection, gameView, uploadView, duelsView, duelPlayView, moderatorView].forEach(el => {
        if (el) el.style.display = 'none';
    });
    navLinks.forEach(l => l.classList.remove('active'));
    
    if (view === 'auth') {
        authSection.style.display = 'block';
    } else if (view === 'game') {
        gameView.style.display = 'block';
        document.querySelector('[data-view="game"]')?.classList.add('active');
    } else if (view === 'upload') {
        uploadView.style.display = 'block';
        document.querySelector('[data-view="upload"]')?.classList.add('active');
    } else if (view === 'duels') {
        duelsView.style.display = 'block';
        document.querySelector('[data-view="duels"]')?.classList.add('active');
    } else if (view === 'moderator') {
        moderatorView.style.display = 'block';
        document.querySelector('[data-view="moderator"]')?.classList.add('active');
    }
}

// ============================================================
// GET CURRENT USER (from localStorage)
// ============================================================
export function getCurrentUser() {
    const stored = localStorage.getItem('tierduel_user');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }
    return null;
}

// ============================================================
// IS MODERATOR
// ============================================================
export function isModerator() {
    const user = getCurrentUser();
    return user?.is_moderator || false;
}

// ============================================================
// LOGOUT
// ============================================================
export function logout() {
    localStorage.removeItem('tierduel_user');
    currentUser = null;
    return { success: true };
}

// ============================================================
// AUTH UI UPDATE
// ============================================================
export async function updateAuthUI() {
    const user = getCurrentUser();
    const uploadLink = document.querySelector('[data-view="upload"]');
    const duelsLink = document.querySelector('[data-view="duels"]');
    const gameLink = document.querySelector('[data-view="game"]');
    const modLink = document.querySelector('[data-view="moderator"]');
    
    if (user) {
        currentUser = user;
        authButton.textContent = '🚪 Logout';
        authButton.onclick = (e) => {
            e.preventDefault();
            logout();
            location.reload();
        };
        
        if (uploadLink) uploadLink.style.display = 'block';
        if (duelsLink) duelsLink.style.display = 'block';
        if (gameLink) gameLink.style.display = 'block';
        
        moderatorNav.style.display = user.is_moderator ? 'block' : 'none';
        
        if (authSection.style.display !== 'none') {
            switchView('game');
        }
    } else {
        currentUser = null;
        authButton.textContent = '🔐 Login';
        authButton.onclick = (e) => {
            e.preventDefault();
            switchView('auth');
        };
        
        if (uploadLink) uploadLink.style.display = 'none';
        if (duelsLink) duelsLink.style.display = 'none';
        if (gameLink) gameLink.style.display = 'block';
        if (modLink) modLink.style.display = 'none';
        
        moderatorNav.style.display = 'none';
        switchView('auth');
    }
}

// ============================================================
// NAVIGATION - WITH LOGIN CHECK!
// ============================================================
function initNavigation() {
    document.querySelectorAll('[data-view]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = e.target.dataset.view;
            
            const protectedViews = ['upload', 'duels', 'moderator'];
            const user = getCurrentUser();
            
            if (protectedViews.includes(view) && !user) {
                alert('⚠️ You must be logged in to access this!');
                switchView('auth');
                return;
            }
            
            switchView(view);
        });
    });
}

// ============================================================
// HELPER: Get YouTube Embed URL
// ============================================================
export function getYouTubeEmbedUrl(url) {
    if (!url) return '';
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

// ============================================================
// INIT
// ============================================================
async function initApp() {
    console.log('🚀 TierDuel starting...');
    console.log('📡 Connected to:', supabaseUrl);
    
    initNavigation();
    await updateAuthUI();
    
    const { initAuth } = await import('./auth.js');
    const { initUpload } = await import('./upload.js');
    const { initGame } = await import('./game.js');
    const { initDuels } = await import('./duels.js');
    const { initModerator } = await import('./moderator.js');
    
    initAuth();
    initUpload();
    initGame();
    initDuels();
    initModerator();
    
    if (!currentUser) {
        switchView('auth');
    }
    
    console.log('✅ TierDuel ready!');
}

document.addEventListener('DOMContentLoaded', initApp);