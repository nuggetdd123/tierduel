// ============================================================
// SETTINGS.JS - APPEARANCE THEME PRESETS (localStorage-backed)
// Click a preset swatch to apply + save it instantly. No manual
// color pickers, no live-drag preview — one click, done.
// ============================================================
const STORAGE_KEY = 'tierduel_settings';

const DEFAULT_THEME_ID = 'emerald';

// Each preset sets the same CSS variables the original color pickers
// used to set. Some also enable a two-tone gradient background using
// the existing --obsidian / --obsidian-2 variables.
const PRESETS = [
    {
        id: 'emerald', name: '🟢 Emerald', primary: '#5fae4a', primaryDark: '#386b30', primaryBright: '#7fca69',
        accent: '#e3b23c', accentDark: '#9c7326', background: '#121319', background2: '#191b22', gradient: false
    },
    {
        id: 'redstone', name: '🔴 Redstone', primary: '#d1483d', primaryDark: '#832a22', primaryBright: '#e8695d',
        accent: '#e3b23c', accentDark: '#9c7326', background: '#160f0f', background2: '#231414', gradient: false
    },
    {
        id: 'diamond', name: '💎 Diamond', primary: '#55c3d6', primaryDark: '#2d7c8c', primaryBright: '#7fd8e6',
        accent: '#e3b23c', accentDark: '#9c7326', background: '#0e1620', background2: '#152230', gradient: false
    },
    {
        id: 'nether', name: '🌋 Nether', primary: '#e3b23c', primaryDark: '#9c7326', primaryBright: '#f0c45a',
        accent: '#d1483d', accentDark: '#832a22', background: '#1a0f0a', background2: '#2b1810', gradient: true
    },
    {
        id: 'end', name: '🟣 End Void', primary: '#a06fd6', primaryDark: '#5e3c8c', primaryBright: '#c19ae8',
        accent: '#e3b23c', accentDark: '#9c7326', background: '#120c1a', background2: '#1e1430', gradient: true
    },
    {
        id: 'frost', name: '❄️ Frost', primary: '#8fd6ff', primaryDark: '#4a8cb0', primaryBright: '#c0ecff',
        accent: '#cfd8e8', accentDark: '#7c8ba0', background: '#0e161f', background2: '#182838', gradient: true
    },
    {
        id: 'swamp', name: '🟩 Swamp', primary: '#6b8f3e', primaryDark: '#3f5726', primaryBright: '#8bb35c',
        accent: '#9c7326', accentDark: '#5f461a', background: '#10140d', background2: '#1a2114', gradient: false
    },
    {
        id: 'bloodmoon', name: '🌑 Bloodmoon', primary: '#832a22', primaryDark: '#4d1712', primaryBright: '#c14335',
        accent: '#d1483d', accentDark: '#832a22', background: '#0f0808', background2: '#1f0f0d', gradient: true
    },
    {
        id: 'gold', name: '🟡 Gold Rush', primary: '#e3b23c', primaryDark: '#9c7326', primaryBright: '#f0c45a',
        accent: '#5fae4a', accentDark: '#386b30', background: '#161207', background2: '#251d0c', gradient: false
    },
    {
        id: 'obsidian', name: '⬛ Monochrome', primary: '#9aa0b0', primaryDark: '#5c6170', primaryBright: '#c3c8d4',
        accent: '#d7d2c2', accentDark: '#838ba0', background: '#0c0d10', background2: '#1a1c22', gradient: true
    }
];

function getPreset(id) {
    return PRESETS.find(p => p.id === id) || PRESETS.find(p => p.id === DEFAULT_THEME_ID);
}

export function loadSettings() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return { themeId: stored.themeId || DEFAULT_THEME_ID };
    } catch {
        return { themeId: DEFAULT_THEME_ID };
    }
}

export function applySettings(settings = loadSettings()) {
    const preset = getPreset(settings.themeId);
    const root = document.documentElement.style;

    root.setProperty('--grass', preset.primary);
    root.setProperty('--grass-dark', preset.primaryDark);
    root.setProperty('--grass-bright', preset.primaryBright);
    root.setProperty('--gold', preset.accent);
    root.setProperty('--gold-dark', preset.accentDark);
    root.setProperty('--obsidian', preset.background);
    root.setProperty('--obsidian-2', preset.background2);

    document.body.classList.toggle('gradient-bg', Boolean(preset.gradient));
}

function renderPresetGrid(container, activeId) {
    if (!container) return;
    container.innerHTML = PRESETS.map(preset => `
        <button type="button" class="theme-preset-swatch ${preset.id === activeId ? 'is-active' : ''}" data-theme-id="${preset.id}"
            style="--swatch-primary:${preset.primary};--swatch-accent:${preset.accent};--swatch-bg:${preset.background};--swatch-bg2:${preset.background2};">
            <span class="theme-preset-dots">
                <span class="theme-preset-dot" style="background:${preset.background};"></span>
                <span class="theme-preset-dot" style="background:${preset.primary};"></span>
                <span class="theme-preset-dot" style="background:${preset.accent};"></span>
            </span>
            <span class="theme-preset-name">${preset.name}</span>
        </button>
    `).join('');
}

export function initSettings() {
    const grid = document.getElementById('themePresetGrid');
    const resetBtn = document.getElementById('resetSettingsBtn');
    const status = document.getElementById('settingsStatus');

    const settings = loadSettings();
    renderPresetGrid(grid, settings.themeId);

    if (grid) {
        grid.onclick = (e) => {
            const button = e.target.closest('.theme-preset-swatch');
            if (!button) return;
            const themeId = button.dataset.themeId;

            // One click = apply AND save immediately. No dragging/live-preview step.
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ themeId }));
            applySettings({ themeId });
            renderPresetGrid(grid, themeId);
            if (status) status.innerHTML = `<div class="success">✅ ${getPreset(themeId).name} theme applied!</div>`;
        };
    }

    if (resetBtn) {
        resetBtn.onclick = () => {
            localStorage.removeItem(STORAGE_KEY);
            applySettings({ themeId: DEFAULT_THEME_ID });
            renderPresetGrid(grid, DEFAULT_THEME_ID);
            if (status) status.innerHTML = '<div class="success">↺ Reset to default theme.</div>';
        };
    }
}