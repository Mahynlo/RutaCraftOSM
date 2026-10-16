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

    // Si el usuario mueve el mapa durante el recorrido, deja de seguir al vehículo
    map.on('dragstart', () => {
        if (!simulacion.activa) return;
        simulacion.seguir = false;
        const check = document.getElementById('sim-follow');
        if (check) check.checked = false;
    });

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
    detenerSimulacion();

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
        const iconClass = iconoAccion(inst.accion);

        const card = document.createElement('div');
        card.className = 'instruction-item';
        card.dataset.index = i;
        card.title = 'Llevar el recorrido a este paso';
        card.addEventListener('click', () => irAInstruccion(i));
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
    detenerSimulacion();

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

// ============================================================
// Simulación del recorrido: un vehículo avanza por la ruta y
// muestra la próxima maniobra como un navegador GPS.
// ============================================================

const VELOCIDAD_BASE_MS = 40 / 3.6;   // 40 km/h, multiplicada por el factor elegido
const DISTANCIA_INMINENTE_M = 40;     // a partir de aquí el aviso se resalta

const simulacion = {
    activa: false,        // hay un recorrido preparado (aunque esté en pausa)
    corriendo: false,
    factor: 30,
    seguir: true,
    ruta: [],
    acumulada: [],        // distancia acumulada hasta cada vértice de la ruta
    total: 0,
    inicios: [],          // distancia donde empieza cada instrucción
    instrucciones: [],
    recorrido: 0,         // metros avanzados
    segmento: 0,
    instActual: -1,
    ultimoFrame: null,
    marcador: null,
    trazo: null,
    raf: null,
};

function distanciaM(a, b) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function rumbo(a, b) {
    const dx = (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180);
    const dy = b[0] - a[0];
    return Math.atan2(dx, dy) * 180 / Math.PI;
}

function formatoDistancia(m) {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    if (m >= 100) return `${Math.round(m / 10) * 10} m`;
    return `${Math.max(0, Math.round(m))} m`;
}

function iconoAccion(accion) {
    if (accion.includes('vuelta en U')) return 'fa-arrow-rotate-left';
    if (accion.includes('derecha')) return 'fa-arrow-right';
    if (accion.includes('izquierda')) return 'fa-arrow-left';
    return 'fa-arrow-up';
}

function nombreCalle(calle) {
    return calle === 'desconocida' ? 'calle sin nombre' : calle;
}

// Prepara la ruta de la variante visible: distancias acumuladas e inicio de cada instrucción
function prepararSimulacion() {
    const v = varianteActiva();
    simulacion.ruta = v.ruta;
    simulacion.instrucciones = v.instrucciones;

    simulacion.acumulada = [0];
    for (let i = 1; i < v.ruta.length; i++) {
        simulacion.acumulada.push(simulacion.acumulada[i - 1] + distanciaM(v.ruta[i - 1], v.ruta[i]));
    }
    simulacion.total = simulacion.acumulada[simulacion.acumulada.length - 1] || 0;

    // Las instrucciones son tramos consecutivos de la ruta: su inicio es la suma de las anteriores.
    // Se escala a la longitud real de la polilínea para absorber el redondeo de cada distancia_m.
    const sumaInst = v.instrucciones.reduce((s, i) => s + i.distancia_m, 0) || 1;
    const escala = simulacion.total / sumaInst;
    let acumulado = 0;
    simulacion.inicios = v.instrucciones.map(i => {
        const inicio = acumulado;
        acumulado += i.distancia_m * escala;
        return inicio;
    });

    simulacion.recorrido = 0;
    simulacion.segmento = 0;
    simulacion.instActual = -1;

    if (!simulacion.trazo) {
        simulacion.trazo = L.polyline([], { color: '#0f172a', weight: 6, opacity: 0.55, lineJoin: 'round' });
    }
    simulacion.trazo.setLatLngs([]).addTo(map);

    if (!simulacion.marcador) {
        simulacion.marcador = L.marker(v.ruta[0], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: '<div class="vehicle-icon"><i class="fa-solid fa-location-arrow"></i></div>',
                iconSize: [34, 34],
                iconAnchor: [17, 17]
            }),
            zIndexOffset: 1000,
            interactive: false
        });
    }
    simulacion.marcador.setLatLng(v.ruta[0]).addTo(map);

    simulacion.activa = true;
    document.getElementById('nav-banner').hidden = false;
    document.getElementById('sim-reset').disabled = false;
}

function toggleSimulacion() {
    if (!escenario) return;
    if (!simulacion.activa || simulacion.recorrido >= simulacion.total) {
        prepararSimulacion();
        if (simulacion.seguir) map.setView(simulacion.ruta[0], Math.max(map.getZoom(), 16));
        actualizarSimulacion();
    }
    simulacion.corriendo ? pausarSimulacion() : reanudarSimulacion();
}

function reanudarSimulacion() {
    simulacion.corriendo = true;
    simulacion.ultimoFrame = null;
    simulacion.raf = requestAnimationFrame(pasoSimulacion);
    actualizarBotonPlay();
}

function pausarSimulacion() {
    simulacion.corriendo = false;
    if (simulacion.raf) cancelAnimationFrame(simulacion.raf);
    simulacion.raf = null;
    actualizarBotonPlay();
}

function reiniciarSimulacion() {
    if (!simulacion.activa) return;
    const estabaCorriendo = simulacion.corriendo;
    pausarSimulacion();
    prepararSimulacion();
    if (simulacion.seguir) map.setView(simulacion.ruta[0], Math.max(map.getZoom(), 16));
    actualizarSimulacion();
    if (estabaCorriendo) reanudarSimulacion();
}

// Quita el vehículo y el aviso (al cambiar de escenario o de modo)
function detenerSimulacion() {
    pausarSimulacion();
    simulacion.activa = false;
    if (simulacion.marcador && map) map.removeLayer(simulacion.marcador);
    if (simulacion.trazo && map) map.removeLayer(simulacion.trazo);
    const banner = document.getElementById('nav-banner');
    if (banner) banner.hidden = true;
    const reset = document.getElementById('sim-reset');
    if (reset) reset.disabled = true;
    setText('sim-progress-text', '');
    const fill = document.getElementById('sim-progress-fill');
    if (fill) fill.style.width = '0';
    document.querySelectorAll('.instruction-item.active, .instruction-item.done')
        .forEach(el => el.classList.remove('active', 'done'));
    actualizarBotonPlay();
}

function cambiarVelocidad(valor) {
    simulacion.factor = Number(valor) || 30;
}

// Clic en una instrucción: lleva el vehículo al inicio de ese paso
function irAInstruccion(i) {
    if (!escenario) return;
    if (!simulacion.activa) prepararSimulacion();
    simulacion.recorrido = simulacion.inicios[i] + 0.01;
    simulacion.segmento = 0;
    actualizarSimulacion();
    actualizarBotonPlay();
    map.setView(simulacion.marcador.getLatLng(), Math.max(map.getZoom(), 17));
}

function pasoSimulacion(ahora) {
    if (!simulacion.corriendo) return;
    // Limitar el salto si la pestaña estuvo en segundo plano
    const dt = simulacion.ultimoFrame === null ? 0 : Math.min((ahora - simulacion.ultimoFrame) / 1000, 0.25);
    simulacion.ultimoFrame = ahora;
    simulacion.recorrido = Math.min(simulacion.total, simulacion.recorrido + VELOCIDAD_BASE_MS * simulacion.factor * dt);

    actualizarSimulacion();

    if (simulacion.recorrido >= simulacion.total) {
        pausarSimulacion();
        return;
    }
    simulacion.raf = requestAnimationFrame(pasoSimulacion);
}

// Coloca el vehículo según los metros recorridos y actualiza aviso, lista y progreso
function actualizarSimulacion() {
    const s = simulacion;
    const { ruta, acumulada } = s;
    if (ruta.length === 0) return;

    // Segmento actual (el recorrido normalmente solo avanza; si retrocede se busca desde el inicio)
    if (acumulada[s.segmento] > s.recorrido) s.segmento = 0;
    while (s.segmento < ruta.length - 2 && acumulada[s.segmento + 1] <= s.recorrido) s.segmento++;

    const a = ruta[s.segmento];
    const b = ruta[Math.min(s.segmento + 1, ruta.length - 1)];
    const largo = (acumulada[s.segmento + 1] ?? acumulada[s.segmento]) - acumulada[s.segmento];
    const t = largo > 0 ? Math.min(1, (s.recorrido - acumulada[s.segmento]) / largo) : 1;
    const pos = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

    s.marcador.setLatLng(pos);
    const flecha = s.marcador.getElement()?.querySelector('.vehicle-icon i');
    if (flecha && (a[0] !== b[0] || a[1] !== b[1])) {
        // fa-location-arrow apunta al noreste (45°)
        flecha.style.transform = `rotate(${rumbo(a, b) - 45}deg)`;
    }
    s.trazo.setLatLngs(ruta.slice(0, s.segmento + 1).concat([pos]));
    if (s.seguir && s.corriendo) map.panTo(pos, { animate: false });

    // Instrucción en curso: la última cuyo inicio ya se pasó
    let k = 0;
    while (k + 1 < s.inicios.length && s.inicios[k + 1] <= s.recorrido) k++;
    if (k !== s.instActual) {
        s.instActual = k;
        marcarInstruccion(k);
    }

    actualizarAviso(k);

    const pct = s.total > 0 ? 100 * s.recorrido / s.total : 0;
    document.getElementById('sim-progress-fill').style.width = `${pct}%`;
    setText('sim-progress-text', `${formatoDistancia(s.recorrido)} de ${formatoDistancia(s.total)}`);
}

function actualizarAviso(k) {
    const s = simulacion;
    const banner = document.getElementById('nav-banner');
    const actual = s.instrucciones[k];
    const siguiente = s.instrucciones[k + 1];
    const icono = document.getElementById('nav-banner-icon');

    banner.classList.remove('inminente', 'llegada');

    if (s.recorrido >= s.total) {
        banner.classList.add('llegada');
        icono.innerHTML = '<i class="fa-solid fa-flag-checkered"></i>';
        setText('nav-banner-dist', 'Has llegado');
        setText('nav-banner-action', 'Destino alcanzado');
        setText('nav-banner-street', `${formatoDistancia(s.total)} recorridos · ${escenario.puntos.length} paradas`);
        setText('nav-banner-now', '');
        return;
    }

    const ahora = actual ? `Ahora: ${actual.accion.toLowerCase()} por ${nombreCalle(actual.calle)}` : '';

    if (!siguiente) {
        icono.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
        setText('nav-banner-dist', formatoDistancia(s.total - s.recorrido));
        setText('nav-banner-action', 'Llegada al destino');
        setText('nav-banner-street', actual ? `por ${nombreCalle(actual.calle)}` : '');
        setText('nav-banner-now', '');
        return;
    }

    const falta = s.inicios[k + 1] - s.recorrido;
    if (falta <= DISTANCIA_INMINENTE_M) banner.classList.add('inminente');
    icono.innerHTML = `<i class="fa-solid ${iconoAccion(siguiente.accion)}"></i>`;
    setText('nav-banner-dist', `En ${formatoDistancia(falta)}`);
    setText('nav-banner-action', siguiente.accion === 'Sigue recto' ? 'Continúa recto' : siguiente.accion);
    setText('nav-banner-street', `en ${nombreCalle(siguiente.calle)}`);
    setText('nav-banner-now', ahora);
}

// Resalta el paso actual en la lista y lo mantiene visible
function marcarInstruccion(k) {
    document.querySelectorAll('#instructions-list .instruction-item').forEach(el => {
        const i = Number(el.dataset.index);
        el.classList.toggle('active', i === k);
        el.classList.toggle('done', i < k);
    });
    const activo = document.querySelector(`#instructions-list .instruction-item[data-index="${k}"]`);
    const sidebar = document.getElementById('sidebar');
    // En móvil el panel está oculto mientras se ve el mapa; no hace falta desplazar
    if (activo && sidebar && sidebar.offsetParent !== null) {
        activo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function actualizarBotonPlay() {
    const btn = document.getElementById('sim-play');
    if (!btn) return;
    let icono = 'fa-play';
    let texto = 'Iniciar recorrido';
    if (simulacion.corriendo) {
        icono = 'fa-pause';
        texto = 'Pausar';
    } else if (simulacion.activa && simulacion.recorrido > 0 && simulacion.recorrido < simulacion.total) {
        texto = 'Continuar';
    } else if (simulacion.activa && simulacion.recorrido >= simulacion.total) {
        icono = 'fa-rotate-right';
        texto = 'Repetir recorrido';
    }
    btn.innerHTML = `<i class="fa-solid ${icono}"></i> <span>${texto}</span>`;
    btn.title = texto;
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
