/**
 * RutaCraftOSM - Theme Manager (Dark / Light / System)
 */

const THEME_STORAGE_KEY = 'rutacraft_theme';
const THEME_MODES = ['dark', 'light', 'system'];

let currentThemeMode = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
let themeChangeCallbacks = [];

// Obtener tema efectivo del sistema
function getSystemPreference() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// Resolver tema activo ('dark' o 'light')
function getResolvedTheme() {
    if (currentThemeMode === 'system') {
        return getSystemPreference();
    }
    return currentThemeMode;
}

// Aplicar tema al DOM
function applyTheme(mode) {
    if (mode) currentThemeMode = mode;
    localStorage.setItem(THEME_STORAGE_KEY, currentThemeMode);

    const resolved = getResolvedTheme();
    document.documentElement.setAttribute('data-theme', resolved);

    // Actualizar botones de alternancia en la página
    updateThemeButtons();

    // Disparar callbacks registrados
    themeChangeCallbacks.forEach(cb => {
        try { cb(resolved, currentThemeMode); } catch (e) { console.warn(e); }
    });
}

// Alternar cíclicamente: dark -> light -> system -> dark
function cycleTheme() {
    const nextIndex = (THEME_MODES.indexOf(currentThemeMode) + 1) % THEME_MODES.length;
    applyTheme(THEME_MODES[nextIndex]);
}

// Actualizar iconos de botones
function updateThemeButtons() {
    const buttons = document.querySelectorAll('.btn-theme-toggle');
    buttons.forEach(btn => {
        let icon = 'fa-moon';
        let label = 'Oscuro';
        if (currentThemeMode === 'light') {
            icon = 'fa-sun';
            label = 'Claro';
        } else if (currentThemeMode === 'system') {
            icon = 'fa-desktop';
            label = 'Sistema';
        }
        btn.innerHTML = `<i class="fa-solid ${icon}"></i> <span class="theme-label" style="font-size:0.75rem; font-weight:600;">${label}</span>`;
        btn.title = `Tema actual: ${label} (Clic para cambiar)`;
    });
}

// Registrar listener para cuando cambie el tema
function onThemeChange(callback) {
    if (typeof callback === 'function') {
        themeChangeCallbacks.push(callback);
    }
}

// Escuchar cambios de preferencia del sistema operativo en tiempo real
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (currentThemeMode === 'system') {
            applyTheme('system');
        }
    });
}

// Aplicar inmediatamente al cargar el script para evitar parpadeos
applyTheme(currentThemeMode);

// Conectar evento en los botones al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    updateThemeButtons();
    document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
        btn.addEventListener('click', cycleTheme);
    });
});
