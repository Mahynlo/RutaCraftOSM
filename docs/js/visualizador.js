/**
 * RutaCraftOSM - Visualizador de Rutas del Benchmark (Leaflet Logic)
 *
 * Muestra las rutas que calculó el motor C++ en cada escenario del benchmark
 * (datos en js/rutas_benchmark.js, generado por RutaCraftOSM_c/bench/correr_benchmark.py)
 * y compara la ruta ignorando los sentidos de las calles contra la que los respeta.
 */

let map = null;
let polylineLayer = null;
let polylineLayerCompare = null;
let markersGroup = null;
let currentMode = 'cpp';   // 'cpp' = ignora sentidos, 'py' = respeta sentidos, 'compare' = ambas
let showStops = true;
let escenario = null;

const ESCENARIOS = (typeof RUTAS_BENCHMARK !== 'undefined') ? RUTAS_BENCHMARK.escenarios : [];

function formatoMs(ms) {
    if (ms === null || ms === undefined) return '–';
    return ms < 10 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(1)} ms`;
}

function setText(id, texto) {
    const el = document.getElementById(id);
    if (el) el.innerText = texto;
}

// Inicializar Mapa con OpenStreetMap Estándar
function initMap() {
    map = L.map('map', {
        center: [29.088, -110.015],
        zoom: 13,
        zoomControl: false
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // Mosaico Oficial Nítido de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    markersGroup = L.layerGroup().addTo(map);

    if (ESCENARIOS.length === 0) {
        setText('bench-meta', 'No hay rutas: ejecuta RutaCraftOSM_c/bench/correr_benchmark.py para generarlas.');
        return;
    }

    setText('bench-meta', `Medido el ${RUTAS_BENCHMARK.fecha} · ${RUTAS_BENCHMARK.cpu}`);
    renderSelector();

    // Permite enlazar un escenario y modo: visualizacion_ruta.html?escenario=hermosillo-2&modo=compare
    const params = new URLSearchParams(window.location.search);
    if (['cpp', 'py', 'compare'].includes(params.get('modo'))) currentMode = params.get('modo');
    const pedido = params.get('escenario');
    selectEscenario(ESCENARIOS.some(e => e.id === pedido) ? pedido : ESCENARIOS[0].id);
}

// Selector de escenarios agrupado por zona
function renderSelector() {
    const select = document.getElementById('escenario-select');
    if (!select) return;
    select.innerHTML = '';

    const zonas = [...new Set(ESCENARIOS.map(e => e.zona))];
    zonas.forEach(zona => {
        const grupo = document.createElement('optgroup');
        grupo.label = zona;
        ESCENARIOS.filter(e => e.zona === zona).forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.nombre;
            grupo.appendChild(opt);
        });
        select.appendChild(grupo);
    });
}

function selectEscenario(id) {
    escenario = ESCENARIOS.find(e => e.id === id);
    if (!escenario) return;

    const select = document.getElementById('escenario-select');
    if (select) select.value = id;

    const url = new URL(window.location.href);
    url.searchParams.set('escenario', id);
    window.history.replaceState(null, '', url);

    // Los escenarios sin grafo dirigido solo tienen la variante que ignora sentidos
    const tieneDirigido = Boolean(escenario.variantes.dirigido);
    ['btn-py', 'btn-compare'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = !tieneDirigido;
            btn.title = tieneDirigido ? '' : 'Este escenario no tiene grafo que respete los sentidos';
        }
    });
    if (!tieneDirigido) currentMode = 'cpp';

    renderMarkers();
    renderComparacion();
    setMode(currentMode, true);
}

// Variante que se muestra en métricas e instrucciones según el modo
function varianteActiva() {
    if (currentMode === 'py' && escenario.variantes.dirigido) return escenario.variantes.dirigido;
    return escenario.variantes.normal;
}

// Renderizar Marcadores de Paradas
function renderMarkers() {
    if (!markersGroup) return;
    markersGroup.clearLayers();
    if (!showStops || !escenario) return;

    const puntos = escenario.puntos;
    puntos.forEach((pt, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === puntos.length - 1;

        let markerColor = "#2563eb";
        let label = (idx + 1).toString();

        if (isFirst) {
            markerColor = "#10b981";
            label = "A";
        } else if (isLast) {
            markerColor = "#ef4444";
            label = "B";
        }

        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="stop-marker-icon" style="background:${markerColor};">${label}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const marker = L.marker(pt, { icon: customIcon }).addTo(markersGroup);
        marker.bindPopup(`
            <div style="font-size:0.85rem; font-weight:600; padding:4px;">
                <span style="color:${markerColor};">●</span> Parada ${idx + 1} ${isFirst ? '(Origen)' : isLast ? '(Destino)' : ''}
                <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">
                    ${pt[0].toFixed(6)}, ${pt[1].toFixed(6)}
                </div>
            </div>
        `);
    });
}

// Renderizar Lista de Instrucciones
function renderInstructions() {
    const listEl = document.getElementById('instructions-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const instrucciones = varianteActiva().instrucciones;
    const fragmento = document.createDocumentFragment();
    instrucciones.forEach((inst, i) => {
        let iconClass = "fa-arrow-up";
        if (inst.accion.includes("derecha")) iconClass = "fa-arrow-right";
        if (inst.accion.includes("izquierda")) iconClass = "fa-arrow-left";

        const card = document.createElement('div');
        card.className = 'instruction-item';
        card.innerHTML = `
            <div class="inst-icon"><i class="fa-solid ${iconClass}"></i></div>
            <div class="inst-details">
                <div class="inst-action">${i + 1}. ${inst.accion}</div>
                <div class="inst-street"></div>
                <div class="inst-dist"><i class="fa-solid fa-arrows-left-right"></i> ${inst.distancia_m} metros</div>
            </div>
        `;
        card.querySelector('.inst-street').textContent =
            inst.calle === 'desconocida' ? 'Calle / Vía de conexión' : inst.calle;
        fragmento.appendChild(card);
    });
    listEl.appendChild(fragmento);

    const countEl = document.getElementById('inst-count');
    if (countEl) {
        countEl.innerText = `${instrucciones.length} pasos`;
        countEl.style.color = (currentMode === 'py') ? 'var(--python)' : 'var(--cpp)';
    }
}

// Barras de distancia de cada variante y diferencia entre ellas
function renderComparacion() {
    const normal = escenario.variantes.normal;
    const dirigido = escenario.variantes.dirigido;
    const maximo = Math.max(normal.distancia_km, dirigido ? dirigido.distancia_km : 0) || 1;

    document.getElementById('bar-normal').style.width = `${100 * normal.distancia_km / maximo}%`;
    setText('bar-normal-val', `${normal.distancia_km} km`);

    const filaDirigido = document.getElementById('bar-row-dirigido');
    if (dirigido) {
        filaDirigido.style.display = 'flex';
        document.getElementById('bar-dirigido').style.width = `${100 * dirigido.distancia_km / maximo}%`;
        setText('bar-dirigido-val', `${dirigido.distancia_km} km`);
        const dif = 100 * (dirigido.distancia_km - normal.distancia_km) / normal.distancia_km;
        setText('diff-text', `Respetando sentidos: ${dif >= 0 ? '+' : ''}${dif.toFixed(1)}% de distancia`);
    } else {
        filaDirigido.style.display = 'none';
        setText('diff-text', 'Grafo de producción (ignora sentidos)');
    }
}

function renderMetricas() {
    const v = varianteActiva();
    const normal = escenario.variantes.normal;
    const dirigido = escenario.variantes.dirigido;
    const valTime = document.getElementById('val-time');

    if (currentMode === 'compare' && dirigido) {
        setText('val-time', `${formatoMs(normal.motor_persistente_ms)} / ${formatoMs(dirigido.motor_persistente_ms)}`);
        setText('val-time-sub', 'Motor persistente (ignora / respeta)');
        setText('val-dist', `${normal.distancia_km} / ${dirigido.distancia_km} km`);
        setText('val-points', `${normal.ruta.length} / ${dirigido.ruta.length}`);
        if (valTime) valTime.style.color = 'var(--purple)';
    } else {
        setText('val-time', formatoMs(v.motor_persistente_ms));
        setText('val-time-sub', `Motor persistente · calcularRuta(): ${formatoMs(v.calcular_ruta_ms)}`);
        setText('val-dist', `${v.distancia_km} km`);
        setText('val-points', `${v.ruta.length} pts`);
        if (valTime) valTime.style.color = (currentMode === 'py') ? 'var(--python)' : 'var(--cpp)';
    }

    setText('val-dist-sub', currentMode === 'py' ? 'Respetando sentidos' :
        currentMode === 'compare' ? 'Ignora / respeta sentidos' : 'Ignorando sentidos');
    setText('val-points-sub', currentMode === 'compare' ? 'Ignora / respeta' : 'Nodos del grafo');
    setText('val-stops', `${escenario.puntos.length} paradas`);
}

// Renderizar Trazado según Modo Seleccionado
function updateMapDisplay(ajustarVista) {
    if (!map || !escenario) return;
    if (polylineLayer) map.removeLayer(polylineLayer);
    if (polylineLayerCompare) map.removeLayer(polylineLayerCompare);
    polylineLayer = null;
    polylineLayerCompare = null;

    const legendPyItem = document.getElementById('legend-py-item');
    const normal = escenario.variantes.normal;
    const dirigido = escenario.variantes.dirigido;

    if (currentMode === 'py' && dirigido) {
        if (legendPyItem) legendPyItem.style.display = 'flex';
        polylineLayer = L.polyline(dirigido.ruta, {
            color: '#f59e0b',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round'
        }).addTo(map);
    } else if (currentMode === 'compare' && dirigido) {
        if (legendPyItem) legendPyItem.style.display = 'flex';

        polylineLayerCompare = L.polyline(dirigido.ruta, {
            color: '#f59e0b',
            weight: 7,
            opacity: 0.8,
            lineJoin: 'round'
        }).addTo(map);

        polylineLayer = L.polyline(normal.ruta, {
            color: '#06b6d4',
            weight: 3,
            opacity: 1.0,
            dashArray: '6, 6',
            lineJoin: 'round'
        }).addTo(map);
    } else {
        if (legendPyItem) legendPyItem.style.display = 'none';
        polylineLayer = L.polyline(normal.ruta, {
            color: '#06b6d4',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round'
        }).addTo(map);
    }

    if (ajustarVista && polylineLayer) {
        map.fitBounds(polylineLayer.getBounds(), { padding: [40, 40] });
    }
}

// Cambiar Modo
function setMode(mode, ajustarVista = false) {
    if (!escenario) return;
    if (mode !== 'cpp' && !escenario.variantes.dirigido) mode = 'cpp';
    currentMode = mode;

    const btnCpp = document.getElementById('btn-cpp');
    const btnPy = document.getElementById('btn-py');
    const btnCompare = document.getElementById('btn-compare');

    if (btnCpp) btnCpp.className = `tab-btn ${mode === 'cpp' ? 'active-cpp' : ''}`;
    if (btnPy) btnPy.className = `tab-btn ${mode === 'py' ? 'active-py' : ''}`;
    if (btnCompare) btnCompare.className = `tab-btn ${mode === 'compare' ? 'active-compare' : ''}`;

    const url = new URL(window.location.href);
    url.searchParams.set('modo', mode);
    window.history.replaceState(null, '', url);

    renderMetricas();
    renderInstructions();
    updateMapDisplay(ajustarVista);
}

function toggleStops() {
    showStops = !showStops;
    renderMarkers();
}

function centerRoute() {
    if (map && polylineLayer) {
        map.fitBounds(polylineLayer.getBounds(), { padding: [50, 50] });
    }
}

// Alternar vista móvil (Mapa vs Panel)
function switchMobileView(view) {
    const sidebar = document.getElementById('sidebar');
    const btnMap = document.getElementById('btn-view-map');
    const btnPanel = document.getElementById('btn-view-panel');

    if (view === 'panel') {
        if (sidebar) sidebar.classList.add('mobile-active');
        if (btnPanel) btnPanel.classList.add('active');
        if (btnMap) btnMap.classList.remove('active');
    } else {
        if (sidebar) sidebar.classList.remove('mobile-active');
        if (btnMap) btnMap.classList.add('active');
        if (btnPanel) btnPanel.classList.remove('active');
        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 200);
    }
}

// Arrancar al cargar el DOM
document.addEventListener('DOMContentLoaded', initMap);
