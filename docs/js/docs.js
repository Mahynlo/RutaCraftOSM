/**
 * RutaCraftOSM - Lector de Documentación Markdown
 */

const CHAPTERS = [
    { file: '1_ARQUITECTURA_Y_MIGRACION.md', title: '1. Arquitectura y Migración' },
    { file: '2_IMPLEMENTACION_PYTHON_UV.md', title: '2. Pipeline Python (uv)' },
    { file: '3_MOTOR_CPP_RUTACRAFT.md', title: '3. Motor Nativo C++20' },
    { file: '4_INTEGRACION_TYPESCRIPT_ELECTRON.md', title: '4. NPM y Electron' },
    { file: 'README.md', title: 'Índice General (README)' }
];

// Control de Drawer Móvil
function toggleSidebar(forceState) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar || !overlay) return;
    
    const isOpen = forceState !== undefined ? forceState : !sidebar.classList.contains('open');

    if (isOpen) {
        sidebar.classList.add('open');
        overlay.style.display = 'block';
    } else {
        sidebar.classList.remove('open');
        overlay.style.display = 'none';
    }
}

// Configurar Mermaid (diseño de alta legibilidad y contraste consistente)
mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
        darkMode: true,
        background: '#0f172a',
        primaryColor: '#3b82f6',
        primaryTextColor: '#f8fafc',
        lineColor: '#06b6d4',
        secondaryColor: '#f59e0b',
        tertiaryColor: '#1e293b'
    }
});

// Configurar Marked con resaltado
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (__) {}
        }
        return hljs.highlightAuto(code).value;
    },
    gfm: true,
    breaks: false
});

// Transformar alertas GitHub (> [!NOTE], etc.)
function transformGitHubAlerts(html) {
    const alertTypes = {
        'NOTE': { class: 'callout-note', icon: 'fa-circle-info', title: 'Nota' },
        'TIP': { class: 'callout-tip', icon: 'fa-lightbulb', title: 'Consejo' },
        'IMPORTANT': { class: 'callout-important', icon: 'fa-triangle-exclamation', title: 'Importante' },
        'WARNING': { class: 'callout-warning', icon: 'fa-circle-exclamation', title: 'Advertencia' },
        'CAUTION': { class: 'callout-warning', icon: 'fa-hand', title: 'Precaución' }
    };

    return html.replace(/<blockquote>\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi, function(match, type, content) {
        const conf = alertTypes[type.toUpperCase()] || alertTypes.NOTE;
        return `
            <div class="callout ${conf.class}">
                <div class="callout-title"><i class="fa-solid ${conf.icon}"></i> ${conf.title}</div>
                <div>${content}</div>
            </div>
        `;
    });
}

// Obtener nombre del archivo desde URL
function getTargetDoc() {
    const params = new URLSearchParams(window.location.search);
    const doc = params.get('doc');
    if (doc) return doc;
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    return '1_ARQUITECTURA_Y_MIGRACION.md';
}

// Cargar y renderizar Markdown
async function loadDocument(docFile) {
    const loader = document.getElementById('loader');
    const contentEl = document.getElementById('doc-content');
    if (!loader || !contentEl) return;

    loader.style.display = 'flex';
    contentEl.style.display = 'none';
    toggleSidebar(false); // Cerrar sidebar en móvil

    // Actualizar menú activo
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('href').includes(docFile)) {
            item.classList.add('active');
        }
    });

    try {
        const response = await fetch(docFile);
        if (!response.ok) {
            throw new Error(`Error ${response.status}: No se pudo cargar el archivo ${docFile}`);
        }
        const markdownText = await response.text();

        // 1. Extraer bloques de mermaid y fórmulas matemáticas
        const mermaidBlocks = [];
        const mathBlocks = [];

        // Extraer bloques de código generales para no alterar fórmulas dentro de código
        const codeBlocks = [];
        let processedMd = markdownText.replace(/(```[\s\S]*?```|`[^`]+?`)/g, (match) => {
            const placeholder = `<!--CODE_BLOCK_ESC_${codeBlocks.length}-->`;
            codeBlocks.push(match);
            return placeholder;
        });

        // Extraer fórmulas matemáticas en bloque $$ ... $$
        processedMd = processedMd.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
            const placeholder = `<!--MATH_BLOCK_${mathBlocks.length}-->`;
            mathBlocks.push({ math: math.trim(), display: true });
            return placeholder;
        });

        // Extraer fórmulas matemáticas inline $ ... $
        processedMd = processedMd.replace(/(^|[^\\])\$([^\$]+?)\$/g, (match, prefix, math) => {
            const placeholder = `<!--MATH_INLINE_${mathBlocks.length}-->`;
            mathBlocks.push({ math: math.trim(), display: false });
            return `${prefix}${placeholder}`;
        });

        // Restaurar bloques de código
        codeBlocks.forEach((code, idx) => {
            processedMd = processedMd.replace(`<!--CODE_BLOCK_ESC_${idx}-->`, code);
        });

        // Extraer diagramas de Mermaid
        processedMd = processedMd.replace(/```mermaid([\s\S]*?)```/g, (match, code) => {
            const placeholder = `<!--MERMAID_PLACEHOLDER_${mermaidBlocks.length}-->`;
            mermaidBlocks.push(code.trim());
            return placeholder;
        });

        // 2. Parsear Markdown a HTML con marked
        let parsedHtml = marked.parse(processedMd);

        // 3. Transformar alertas de GitHub
        parsedHtml = transformGitHubAlerts(parsedHtml);

        // 4. Envolver tablas para scroll móvil
        parsedHtml = parsedHtml.replace(/<table>/gi, '<div class="table-container"><table>').replace(/<\/table>/gi, '</table></div>');

        contentEl.innerHTML = parsedHtml;

        // 5. Renderizar fórmulas de KaTeX
        if (window.katex && mathBlocks.length > 0) {
            mathBlocks.forEach((item, idx) => {
                const isBlock = item.display;
                const token = isBlock ? `MATH_BLOCK_${idx}` : `MATH_INLINE_${idx}`;
                
                let renderedHtml = '';
                try {
                    renderedHtml = katex.renderToString(item.math, {
                        displayMode: item.display,
                        throwOnError: false
                    });
                } catch (kErr) {
                    renderedHtml = `<span style="color:var(--danger);">${item.math}</span>`;
                }

                // Reemplazar nodo de comentario en el DOM
                const commentIterator = document.createNodeIterator(contentEl, NodeFilter.SHOW_COMMENT);
                let node;
                while ((node = commentIterator.nextNode())) {
                    if (node.nodeValue === token) {
                        const span = document.createElement(isBlock ? 'div' : 'span');
                        if (isBlock) span.style.margin = '16px 0';
                        span.innerHTML = renderedHtml;
                        node.parentNode.replaceChild(span, node);
                        break;
                    }
                }
            });
        }

        // 6. Reemplazar placeholders de Mermaid
        mermaidBlocks.forEach((code, idx) => {
            const targetEl = document.createElement('pre');
            targetEl.className = 'mermaid';
            targetEl.textContent = code;

            const commentIterator = document.createNodeIterator(contentEl, NodeFilter.SHOW_COMMENT);
            let node;
            while ((node = commentIterator.nextNode())) {
                if (node.nodeValue === `MERMAID_PLACEHOLDER_${idx}`) {
                    node.parentNode.replaceChild(targetEl, node);
                    break;
                }
            }
        });

        // 6. Generar Paginación Anterior / Siguiente
        const currentIndex = CHAPTERS.findIndex(ch => ch.file === docFile);
        if (currentIndex !== -1) {
            const prevChapter = CHAPTERS[currentIndex - 1];
            const nextChapter = CHAPTERS[currentIndex + 1];

            const paginationEl = document.createElement('div');
            paginationEl.className = 'chapter-pagination';
            paginationEl.innerHTML = `
                ${prevChapter ? `<a href="doc.html?doc=${prevChapter.file}" class="btn-page"><i class="fa-solid fa-arrow-left"></i> ${prevChapter.title}</a>` : '<div></div>'}
                ${nextChapter ? `<a href="doc.html?doc=${nextChapter.file}" class="btn-page">${nextChapter.title} <i class="fa-solid fa-arrow-right"></i></a>` : '<div></div>'}
            `;
            contentEl.appendChild(paginationEl);
        }

        // 7. Interceptar enlaces internos a .md
        contentEl.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            if (href && (href.endsWith('.md') || href.includes('.md#') || href.includes('doc.html?doc='))) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    let target = href;
                    if (target.includes('doc.html?doc=')) {
                        target = target.split('doc.html?doc=')[1];
                    }
                    let cleanFile = target.replace(/^\.\//, '').split('#')[0];
                    window.history.pushState(null, '', `doc.html?doc=${cleanFile}`);
                    loadDocument(cleanFile);
                });
            }
        });

        loader.style.display = 'none';
        contentEl.style.display = 'block';

        // 8. Renderizar diagramas de Mermaid
        try {
            await mermaid.run({
                nodes: contentEl.querySelectorAll('.mermaid')
            });
        } catch (mErr) {
            console.warn("Mermaid render error:", mErr);
        }

        const wrapper = document.getElementById('content-wrapper');
        if (wrapper) wrapper.scrollTop = 0;

    } catch (err) {
        loader.style.display = 'none';
        contentEl.style.display = 'block';
        contentEl.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: var(--danger);">
                <h2><i class="fa-solid fa-triangle-exclamation"></i> Error al cargar documento</h2>
                <p style="color: var(--text-muted); margin-top: 10px;">${err.message}</p>
                <a href="index.html" class="btn-action btn-home" style="display: inline-flex; margin-top: 20px;">
                    Volver al Inicio
                </a>
            </div>
        `;
    }
}

// Inicializar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    loadDocument(getTargetDoc());
});

window.addEventListener('popstate', () => {
    loadDocument(getTargetDoc());
});
