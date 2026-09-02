/**
 * RutaCraftOSM - Visualizador y Comparador de Rutas (Leaflet Logic)
 */

let map = null;
let polylineLayer = null;
let polylineLayerCompare = null;
let markersGroup = null;
let currentMode = 'cpp';
let showStops = true;

// Inicializar Mapa
function initMap() {
    map = L.map('map', {
        center: [29.088, -110.015],
        zoom: 13,
        zoomControl: false
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    markersGroup = L.layerGroup().addTo(map);

    renderMarkers();
    renderInstructions();
    updateMapDisplay();
}

// Renderizar Marcadores de Paradas
function renderMarkers() {
    if (!markersGroup) return;
    markersGroup.clearLayers();
    if (!showStops) return;

    PUNTOS_GPS_ORIGINALES.forEach((pt, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === PUNTOS_GPS_ORIGINALES.length - 1;

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

    INSTRUCCIONES.forEach((inst, i) => {
        let iconClass = "fa-arrow-up";
        if (inst.accion.includes("derecha")) iconClass = "fa-arrow-right";
        if (inst.accion.includes("izquierda")) iconClass = "fa-arrow-left";

        const card = document.createElement('div');
        card.className = 'instruction-item';
        card.innerHTML = `
            <div class="inst-icon"><i class="fa-solid ${iconClass}"></i></div>
            <div class="inst-details">
                <div class="inst-action">${i + 1}. ${inst.accion}</div>
                <div class="inst-street">${inst.calle === 'desconocida' ? 'Calle / Vía de conexión' : inst.calle}</div>
                <div class="inst-dist"><i class="fa-solid fa-arrows-left-right"></i> ${inst.distancia_m} metros</div>
            </div>
        `;
        listEl.appendChild(card);
    });

    const countEl = document.getElementById('inst-count');
    if (countEl) countEl.innerText = `${INSTRUCCIONES.length} pasos`;
}

// Renderizar Trazado según Modo Seleccionado
function updateMapDisplay() {
    if (!map) return;
    if (polylineLayer) map.removeLayer(polylineLayer);
    if (polylineLayerCompare) map.removeLayer(polylineLayerCompare);

    const legendPyItem = document.getElementById('legend-py-item');
    const valTime = document.getElementById('val-time');
    const valTimeSub = document.getElementById('val-time-sub');

    if (currentMode === 'cpp') {
        if (legendPyItem) legendPyItem.style.display = 'none';
        polylineLayer = L.polyline(RUTA_COORDS, {
            color: '#06b6d4',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round'
        }).addTo(map);

        if (valTime) {
            valTime.innerText = "56.7 ms";
            valTime.style.color = "var(--cpp)";
        }
        if (valTimeSub) valTimeSub.innerText = "⚡ 16.0x más veloz";
    } else if (currentMode === 'py') {
        if (legendPyItem) legendPyItem.style.display = 'none';
        polylineLayer = L.polyline(RUTA_COORDS, {
            color: '#f59e0b',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round'
        }).addTo(map);

        if (valTime) {
            valTime.innerText = "910.1 ms";
            valTime.style.color = "var(--python)";
        }
        if (valTimeSub) valTimeSub.innerText = "Tiempo original Python";
    } else if (currentMode === 'compare') {
        if (legendPyItem) legendPyItem.style.display = 'flex';

        polylineLayerCompare = L.polyline(RUTA_COORDS, {
            color: '#f59e0b',
            weight: 7,
            opacity: 0.8,
            lineJoin: 'round'
        }).addTo(map);

        polylineLayer = L.polyline(RUTA_COORDS, {
            color: '#06b6d4',
            weight: 3,
            opacity: 1.0,
            dashArray: '6, 6',
            lineJoin: 'round'
        }).addTo(map);

        if (valTime) {
            valTime.innerText = "56ms vs 910ms";
            valTime.style.color = "#c084fc";
        }
        if (valTimeSub) valTimeSub.innerText = "Comparación superpuesta";
    }

    if (polylineLayer) {
        map.fitBounds(polylineLayer.getBounds(), { padding: [40, 40] });
    }
}

// Cambiar Modo
function setMode(mode) {
    currentMode = mode;
    const btnCpp = document.getElementById('btn-cpp');
    const btnPy = document.getElementById('btn-py');
    const btnCompare = document.getElementById('btn-compare');

    if (btnCpp) btnCpp.className = `tab-btn ${mode === 'cpp' ? 'active-cpp' : ''}`;
    if (btnPy) btnPy.className = `tab-btn ${mode === 'py' ? 'active-py' : ''}`;
    if (btnCompare) btnCompare.className = `tab-btn ${mode === 'compare' ? 'active-compare' : ''}`;
    
    updateMapDisplay();
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
