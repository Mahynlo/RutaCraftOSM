/**
 * RutaCraftOSM - Lector de Documentación Markdown
 */

const CHAPTERS = [
    { file: '1_ARQUITECTURA_Y_MIGRACION.md', title: '1. Arquitectura y Migración' },
    { file: '2_IMPLEMENTACION_PYTHON_UV.md', title: '2. Pipeline Python (uv)' },
    { file: '3_MOTOR_CPP_RUTACRAFT.md', title: '3. Motor Nativo C++20' },
    { file: '4_INTEGRACION_TYPESCRIPT_ELECTRON.md', title: '4. NPM y Electron' },
    { file: '5_RENDIMIENTO.md', title: '5. Rendimiento del Motor' },
    { file: 'README.md', title: 'Índice General (README)' }
];

// Nombres que se muestran en la cabecera de los bloques de código
const LANG_LABELS = {
    js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
    cpp: 'C++', 'c++': 'C++', py: 'Python', python: 'Python', json: 'JSON', yaml: 'YAML', yml: 'YAML',
    bash: 'Bash', sh: 'Bash', shell: 'Shell', powershell: 'PowerShell', ps1: 'PowerShell',
    cmake: 'CMake', text: 'Texto', txt: 'Texto', html: 'HTML', css: 'CSS'
};

// Control de Drawer Móvil
function toggleSidebar(forceState) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar || !overlay) return;

    const isOpen = forceState !== undefined ? forceState : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', isOpen);
    overlay.style.display = isOpen ? 'block' : 'none';
}

// ------------------------------------------------------------------
// Mermaid: colores tomados de las variables CSS del tema activo
// ------------------------------------------------------------------
function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function configureMermaid() {
    const node = cssVar('--diagram-node');
    const nodeBorder = cssVar('--diagram-node-border');
    const text = cssVar('--diagram-text');
    const line = cssVar('--diagram-line');
    const bg = cssVar('--diagram-bg');
    const note = cssVar('--diagram-note');
    const noteBorder = cssVar('--diagram-note-border');

    mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'strict',
        fontFamily: 'Inter, -apple-system, Segoe UI, sans-serif',
        flowchart: { curve: 'basis', padding: 14, nodeSpacing: 40, rankSpacing: 50, htmlLabels: true, useMaxWidth: false },
        sequence: { width: 130, actorMargin: 40, boxMargin: 8, messageMargin: 36, mirrorActors: false, useMaxWidth: false },
        themeVariables: {
            fontSize: '14px',
            background: bg,
            mainBkg: node,
            primaryColor: node,
            primaryBorderColor: nodeBorder,
            primaryTextColor: text,
            nodeBorder: nodeBorder,
            textColor: text,
            titleColor: text,
            lineColor: line,
            secondaryColor: node,
            tertiaryColor: bg,
            clusterBkg: cssVar('--diagram-cluster'),
            clusterBorder: cssVar('--diagram-cluster-border'),
            edgeLabelBackground: bg,
            actorBkg: node,
            actorBorder: nodeBorder,
            actorTextColor: text,
            actorLineColor: line,
            signalColor: text,
            signalTextColor: text,
            labelBoxBkgColor: node,
            labelBoxBorderColor: nodeBorder,
            labelTextColor: text,
            loopTextColor: text,
            noteBkgColor: note,
            noteBorderColor: noteBorder,
            noteTextColor: text,
            activationBkgColor: node,
            activationBorderColor: nodeBorder,
            sequenceNumberColor: bg
        }
    });
}

// Mermaid guarda estado global al dibujar: dos dibujos simultáneos (carga del documento y cambio
// de tema) mezclan los diagramas. Por eso se dibujan en cola, uno a la vez.
let diagramQueue = Promise.resolve();
let diagramCounter = 0;

function renderDiagrams(root) {
    diagramQueue = diagramQueue.then(() => renderDiagramsNow(root)).catch(err => console.warn(err));
    return diagramQueue;
}

async function renderDiagramsNow(root) {
    const nodes = [...root.querySelectorAll('.diagram .mermaid')];
    if (!nodes.length || !window.mermaid) return;

    // Mermaid mide el texto al dibujar: sin la fuente final cargada, las etiquetas quedan cortadas
    if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (_) {}
    }

    configureMermaid();
    for (const el of nodes) {
        try {
            const { svg } = await mermaid.render(`diagrama-${++diagramCounter}`, el.dataset.source);
            el.innerHTML = svg;
            el.setAttribute('data-processed', 'true');
        } catch (mErr) {
            console.warn('Mermaid render error:', mErr);
            el.textContent = el.dataset.source;
            el.setAttribute('data-processed', 'error');
        }
    }
}

// ------------------------------------------------------------------
// Transformaciones del HTML generado
// ------------------------------------------------------------------

// Transformar alertas GitHub (> [!NOTE], etc.)
function transformGitHubAlerts(html) {
    const alertTypes = {
        'NOTE': { class: 'callout-note', icon: 'fa-circle-info', title: 'Nota' },
        'TIP': { class: 'callout-tip', icon: 'fa-lightbulb', title: 'Consejo' },
        'IMPORTANT': { class: 'callout-important', icon: 'fa-triangle-exclamation', title: 'Importante' },
        'WARNING': { class: 'callout-warning', icon: 'fa-circle-exclamation', title: 'Advertencia' },
        'CAUTION': { class: 'callout-warning', icon: 'fa-hand', title: 'Precaución' }
    };

    return html.replace(/<blockquote>\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)<\/blockquote>/gi, function(match, type, content) {
        const conf = alertTypes[type.toUpperCase()] || alertTypes.NOTE;
        return `
            <div class="callout ${conf.class}">
                <div class="callout-title"><i class="fa-solid ${conf.icon}"></i> ${conf.title}</div>
                <div><p>${content}</div>
            </div>
        `;
    });
}

// Resaltar y envolver cada bloque de código con su cabecera (lenguaje + copiar)
function enhanceCodeBlocks(root) {
    root.querySelectorAll('pre > code').forEach(code => {
        const pre = code.parentElement;
        const langClass = [...code.classList].find(c => c.startsWith('language-'));
        const lang = langClass ? langClass.slice('language-'.length).toLowerCase() : '';

        if (window.hljs && lang && lang !== 'text' && lang !== 'txt' && hljs.getLanguage(lang)) {
            hljs.highlightElement(code);
        }

        const block = document.createElement('div');
        block.className = 'code-block';
        block.innerHTML = `
            <div class="code-block-header">
                <span class="code-lang">${LANG_LABELS[lang] || lang || 'Texto'}</span>
                <button type="button" class="btn-copy" aria-label="Copiar código">
                    <i class="fa-regular fa-copy"></i> Copiar
                </button>
            </div>`;
        pre.replaceWith(block);
        block.appendChild(pre);

        const btn = block.querySelector('.btn-copy');
        btn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(code.textContent);
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar';
                    btn.classList.remove('copied');
                }, 1800);
            } catch (err) {
                console.warn('Error al copiar:', err);
            }
        });
    });
}

// Texto visible de un título (sin la copia MathML que KaTeX agrega para lectores de pantalla)
function headingText(h) {
    const clone = h.cloneNode(true);
    clone.querySelectorAll('.katex-mathml').forEach(el => el.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
}

function slugify(text) {
    return text.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim().replace(/\s+/g, '-');
}

// Índice de secciones (h2) en la barra lateral, bajo el capítulo activo
let tocObserver = null;

function buildToc(root, docFile) {
    document.querySelectorAll('.toc').forEach(el => el.remove());
    if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }

    const used = new Set();
    root.querySelectorAll('h1, h2, h3').forEach(h => {
        let id = slugify(headingText(h)) || 'seccion';
        while (used.has(id)) id += '-1';
        used.add(id);
        h.id = id;
    });

    const headings = [...root.querySelectorAll('h2')];
    const activeItem = [...document.querySelectorAll('.nav-item')]
        .find(item => item.getAttribute('href').endsWith(`doc=${docFile}`));
    if (!activeItem || headings.length < 2) return;

    const toc = document.createElement('ul');
    toc.className = 'toc';
    headings.forEach(h => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${h.id}`;
        a.textContent = headingText(h).replace(/^\d+\.\s*/, '');
        a.addEventListener('click', e => {
            e.preventDefault();
            h.scrollIntoView({ behavior: 'smooth', block: 'start' });
            toggleSidebar(false);
        });
        li.appendChild(a);
        toc.appendChild(li);
    });
    activeItem.after(toc);

    const links = [...toc.querySelectorAll('a')];
    tocObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const idx = headings.indexOf(entry.target);
            links.forEach((l, i) => l.classList.toggle('active', i === idx));
        });
    }, { root: document.getElementById('content-wrapper'), rootMargin: '0px 0px -70% 0px' });
    headings.forEach(h => tocObserver.observe(h));
}

// Obtener nombre del archivo desde URL
function getTargetDoc() {
    const params = new URLSearchParams(window.location.search);
    const doc = params.get('doc');
    if (doc) return doc;
    return '1_ARQUITECTURA_Y_MIGRACION.md';
}

// ------------------------------------------------------------------
// Cargar y renderizar Markdown
// ------------------------------------------------------------------
async function loadDocument(docFile) {
    const loader = document.getElementById('loader');
    const contentEl = document.getElementById('doc-content');
    if (!loader || !contentEl) return;

    loader.style.display = 'flex';
    contentEl.style.display = 'none';
    toggleSidebar(false); // Cerrar sidebar en móvil

    // Actualizar menú activo
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('href').endsWith(`doc=${docFile}`));
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
            processedMd = processedMd.replace(`<!--CODE_BLOCK_ESC_${idx}-->`, () => code);
        });

        // Extraer diagramas de Mermaid
        processedMd = processedMd.replace(/```mermaid([\s\S]*?)```/g, (match, code) => {
            const placeholder = `<!--MERMAID_PLACEHOLDER_${mermaidBlocks.length}-->`;
            mermaidBlocks.push(code.trim());
            return placeholder;
        });

        // 2. Parsear Markdown a HTML con marked
        let parsedHtml = marked.parse(processedMd, { gfm: true, breaks: false });

        // 3. Transformar alertas de GitHub
        parsedHtml = transformGitHubAlerts(parsedHtml);

        // 4. Envolver tablas para scroll móvil
        parsedHtml = parsedHtml.replace(/<table>/gi, '<div class="table-container"><table>').replace(/<\/table>/gi, '</table></div>');

        contentEl.innerHTML = parsedHtml;

        // Reemplaza el comentario <!--token--> del DOM por el nodo dado
        const replaceComment = (token, newNode) => {
            const it = document.createNodeIterator(contentEl, NodeFilter.SHOW_COMMENT);
            let node;
            while ((node = it.nextNode())) {
                if (node.nodeValue === token) {
                    node.parentNode.replaceChild(newNode, node);
                    return;
                }
            }
        };

        // 5. Renderizar fórmulas de KaTeX
        if (window.katex) {
            mathBlocks.forEach((item, idx) => {
                const el = document.createElement(item.display ? 'div' : 'span');
                if (item.display) el.style.margin = '16px 0';
                try {
                    el.innerHTML = katex.renderToString(item.math, { displayMode: item.display, throwOnError: false });
                } catch (kErr) {
                    el.textContent = item.math;
                }
                replaceComment(item.display ? `MATH_BLOCK_${idx}` : `MATH_INLINE_${idx}`, el);
            });
        }

        // 6. Contenedores de Mermaid (el código fuente se guarda para redibujar al cambiar el tema)
        mermaidBlocks.forEach((code, idx) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'diagram';
            const target = document.createElement('div');
            target.className = 'mermaid';
            target.dataset.source = code;
            target.textContent = code;
            wrapper.appendChild(target);
            replaceComment(`MERMAID_PLACEHOLDER_${idx}`, wrapper);
        });

        // 7. Bloques de código, índice de secciones
        enhanceCodeBlocks(contentEl);
        buildToc(contentEl, docFile);

        // 8. Paginación Anterior / Siguiente
        const currentIndex = CHAPTERS.findIndex(ch => ch.file === docFile);
        if (currentIndex !== -1) {
            const prev = CHAPTERS[currentIndex - 1];
            const next = CHAPTERS[currentIndex + 1];

            const paginationEl = document.createElement('nav');
            paginationEl.className = 'chapter-pagination';
            paginationEl.innerHTML = `
                ${prev ? `<a href="doc.html?doc=${prev.file}" class="btn-page"><small><i class="fa-solid fa-arrow-left"></i> Anterior</small>${prev.title}</a>` : ''}
                ${next ? `<a href="doc.html?doc=${next.file}" class="btn-page next"><small>Siguiente <i class="fa-solid fa-arrow-right"></i></small>${next.title}</a>` : ''}
            `;
            contentEl.appendChild(paginationEl);
        }

        // 9. Interceptar enlaces internos a .md
        contentEl.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            if (href && (href.endsWith('.md') || href.includes('.md#') || href.includes('doc.html?doc='))) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    let target = href;
                    if (target.includes('doc.html?doc=')) {
                        target = target.split('doc.html?doc=')[1];
                    }
                    const cleanFile = target.replace(/^\.\//, '').split('#')[0];
                    window.history.pushState(null, '', `doc.html?doc=${cleanFile}`);
                    loadDocument(cleanFile);
                });
            }
        });

        loader.style.display = 'none';
        contentEl.style.display = 'block';

        const chapter = CHAPTERS[currentIndex];
        document.title = `${chapter ? chapter.title : docFile} · RutaCraftOSM`;

        // 10. Dibujar diagramas (necesitan estar visibles para medir el texto)
        await renderDiagrams(contentEl);

        const wrapper = document.getElementById('content-wrapper');
        if (wrapper) wrapper.scrollTop = 0;

    } catch (err) {
        loader.style.display = 'none';
        contentEl.style.display = 'block';
        contentEl.innerHTML = `
            <div class="doc-error">
                <h2><i class="fa-solid fa-triangle-exclamation"></i> Error al cargar documento</h2>
                <p></p>
                <a href="index.html" class="btn-action btn-home">Volver al Inicio</a>
            </div>
        `;
        contentEl.querySelector('.doc-error p').textContent = err.message;
    }
}

// Inicializar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    loadDocument(getTargetDoc());
});

window.addEventListener('popstate', () => {
    loadDocument(getTargetDoc());
});

// Redibujar los diagramas con los colores del nuevo tema
if (typeof onThemeChange === 'function') {
    onThemeChange(() => {
        const contentEl = document.getElementById('doc-content');
        if (contentEl) renderDiagrams(contentEl);
    });
}
