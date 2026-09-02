/**
 * RutaCraftOSM - Landing Page Logic
 */

function toggleNav() {
    const nav = document.getElementById('nav-links');
    const btn = document.getElementById('nav-toggle');
    if (!nav || !btn) return;
    const isOpen = nav.classList.toggle('open');
    btn.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
}

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

// Cerrar menú al hacer clic en un enlace en móvil
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-link, .btn-cta').forEach(link => {
        link.addEventListener('click', () => {
            const nav = document.getElementById('nav-links');
            const btn = document.getElementById('nav-toggle');
            if (nav && nav.classList.contains('open')) {
                nav.classList.remove('open');
                if (btn) btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
            }
        });
    });
});
