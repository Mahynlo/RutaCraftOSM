/**
 * RutaCraftOSM - Landing Page Logic
 */

// ------------------------------------------------------------------
// Navbar: menú móvil, menú de documentación y sombra al desplazarse
// ------------------------------------------------------------------
const nav = document.getElementById('nav-links');
const navToggle = document.getElementById('nav-toggle');
const docsMenu = document.getElementById('nav-docs');
const docsBtn = docsMenu ? docsMenu.querySelector('.nav-dropdown-btn') : null;

function setNavOpen(open) {
    if (!nav || !navToggle) return;
    nav.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    navToggle.innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
    if (!open) setDocsOpen(false);
}

function setDocsOpen(open) {
    if (!docsMenu || !docsBtn) return;
    docsMenu.classList.toggle('abierto', open);
    docsBtn.setAttribute('aria-expanded', String(open));
}

navToggle?.addEventListener('click', () => setNavOpen(!nav.classList.contains('open')));
docsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setDocsOpen(!docsMenu.classList.contains('abierto'));
});

// En escritorio el menú de documentación también se abre al pasar el mouse
const conMouse = window.matchMedia('(hover: hover) and (min-width: 861px)');
let cerrarDocs = null;
docsMenu?.addEventListener('mouseenter', () => { if (conMouse.matches) { clearTimeout(cerrarDocs); setDocsOpen(true); } });
docsMenu?.addEventListener('mouseleave', () => { if (conMouse.matches) cerrarDocs = setTimeout(() => setDocsOpen(false), 150); });

// Cerrar al hacer clic fuera, al elegir un enlace o con Escape
document.addEventListener('click', (e) => {
    if (docsMenu && !docsMenu.contains(e.target)) setDocsOpen(false);
    if (nav && nav.classList.contains('open') && !e.target.closest('#navbar')) setNavOpen(false);
});
nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setNavOpen(false)));
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (docsMenu?.classList.contains('abierto')) { setDocsOpen(false); docsBtn.focus(); }
    else if (nav?.classList.contains('open')) { setNavOpen(false); navToggle.focus(); }
});
window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) setNavOpen(false); });

// Sombra en la barra cuando la página no está arriba
const navbar = document.getElementById('navbar');
const marcarScroll = () => navbar?.classList.toggle('con-sombra', window.scrollY > 4);
window.addEventListener('scroll', marcarScroll, { passive: true });
marcarScroll();

// Cambiar pestaña de código
function switchCodeTab(tabId) {
    document.querySelectorAll('.code-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        }
    });

    document.querySelectorAll('.code-panel').forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `panel-${tabId}`) {
            panel.classList.add('active');
        }
    });
}

// Copiar código de la pestaña activa al portapapeles
async function copyActiveCode() {
    const activePanel = document.querySelector('.code-panel.active');
    const copyBtn = document.getElementById('btn-copy-code');
    if (!activePanel || !copyBtn) return;

    // Obtener texto plano del bloque
    const textToCopy = activePanel.innerText;

    try {
        await navigator.clipboard.writeText(textToCopy);
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
        copyBtn.classList.add('copied');

        setTimeout(() => {
            copyBtn.innerHTML = originalHtml;
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.warn('Error al copiar:', err);
    }
}
