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

// Cerrar menú al hacer clic en un enlace
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
