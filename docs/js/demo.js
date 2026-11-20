// Demo de RutaCraftOSM en el navegador: motor WebAssembly en un Web Worker y generador de grafos.
// La biblioteca (docs/demo/lib) es una copia de ruta-craft-osm/dist/esm (npm run demo:web).
import { crearMotorWeb, descargarGrafo, generarGrafo } from "../demo/lib/web/index.js";

const GRAFO_URL = "demo/grafo_mazatan_villapesqueira.bin";
const RUTA_EJEMPLO = [
    [29.065639, -110.056448], [29.059486, -110.053973], [29.062039, -110.059091], [29.060509, -110.057231],
    [29.061682, -110.059015], [29.060063, -110.055008], [29.061276, -110.05887], [29.060744, -110.058027],
];
// Para no saturar Overpass ni el navegador: zonas de hasta ~0.25° x 0.25° (~25 km de lado)
const LADO_MAXIMO_GRADOS = 0.25;

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 0) => x.toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
const esMovil = () => window.matchMedia("(max-width: 760px)").matches;

// Icono de Font Awesome para cada acción que genera el motor (instrucciones.hpp)
function iconoGiro(accion) {
    if (accion.startsWith("Da vuelta en U")) return "fa-rotate-left";
    if (accion.startsWith("Sigue recto")) return "fa-arrow-up";
    const izquierda = accion.endsWith("izquierda");
    if (accion.startsWith("Gira ligeramente")) return izquierda ? "fa-arrow-up rot-izq" : "fa-arrow-up rot-der";
    if (accion.startsWith("Gira bruscamente")) return izquierda ? "fa-arrow-left rot-izq" : "fa-arrow-right rot-der";
    return izquierda ? "fa-arrow-left" : "fa-arrow-right";
}

const mapa = L.map("mapa", { zoomControl: true }).setView([29.0615, -110.0567], 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(mapa);

const capaParadas = L.layerGroup().addTo(mapa);
const capaRuta = L.layerGroup().addTo(mapa);
let paradas = [];
let motor = null;
let grafoActual = null;
let ocupado = false;

function estado(texto, tipo = "cargando") {
    const icono = { cargando: "fa-spinner fa-spin", ok: "fa-circle-check", error: "fa-triangle-exclamation" }[tipo];
    $("estado").className = `estado ${tipo === "cargando" ? "" : tipo}`;
    $("estado").innerHTML = `<i class="fa-solid ${icono}"></i><span></span>`;
    $("estado").querySelector("span").textContent = texto;
}

function actualizarBotones() {
    const listo = motor !== null && !ocupado;
    $("calcular").disabled = !listo || paradas.length < 2;
    $("ejemplo").disabled = !listo;
    $("generar").disabled = !listo;
    $("descargar").disabled = !grafoActual || ocupado;
    $("pista").hidden = !motor || paradas.length > 0;
}

function dibujarParadas(orden = null) {
    capaParadas.clearLayers();
    const lista = $("paradas");
    lista.innerHTML = "";
    paradas.forEach(([lat, lon], i) => {
        const visita = orden ? orden.indexOf(i) : i;
        const icono = L.divIcon({
            className: "",
            html: `<div class="numero-parada ${i === 0 ? "inicio" : ""}">${visita + 1}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });
        L.marker([lat, lon], { icon: icono, keyboard: false }).addTo(capaParadas);
        const li = document.createElement("li");
        li.innerHTML = `<span class="chip ${i === 0 ? "inicio" : ""}"></span><span class="coords"></span><span class="nota"></span>`;
        li.children[0].textContent = String(visita + 1);
        li.children[1].textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        li.children[2].textContent = i === 0 ? "inicio" : "";
        const quitar = document.createElement("button");
        quitar.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        quitar.title = "Quitar parada";
        quitar.setAttribute("aria-label", `Quitar la parada ${i + 1}`);
        quitar.onclick = () => { paradas.splice(i, 1); limpiarRuta(); dibujarParadas(); };
        li.appendChild(quitar);
        lista.appendChild(li);
    });
    $("sin-paradas").style.display = paradas.length ? "none" : "";
    actualizarBotones();
}

function limpiarRuta() {
    capaRuta.clearLayers();
    for (const id of ["m-distancia", "m-tiempo", "m-puntos", "m-ahorro"]) $(id).textContent = "–";
    $("instrucciones").innerHTML = "";
    $("sin-instrucciones").style.display = "";
}

async function calcular() {
    if (paradas.length < 2) return;
    ocupado = true;
    actualizarBotones();
    estado("Calculando la ruta…");
    const opciones = { optimizar: $("optimizar").checked, regresarAlInicio: $("regresar").checked };
    try {
        const inicio = performance.now();
        const r = await motor.calcular(paradas, opciones);
        const ms = performance.now() - inicio;

        capaRuta.clearLayers();
        const linea = L.polyline(r.ruta, { color: "#06b6d4", weight: 5, opacity: 0.85 }).addTo(capaRuta);
        mapa.fitBounds(linea.getBounds(), { padding: [40, 40], maxZoom: 17 });
        dibujarParadas(r.orden ? r.orden.slice(0, paradas.length) : null);

        $("m-distancia").textContent = r.distancia_total_km >= 1 ? `${fmt(r.distancia_total_km, 2)} km` : `${fmt(r.distancia_total_m)} m`;
        $("m-tiempo").textContent = `${fmt(ms, ms < 10 ? 1 : 0)} ms`;
        $("m-puntos").textContent = fmt(r.ruta.length);
        const opt = r.optimizacion;
        $("m-ahorro").textContent = opt && opt.distancia_original_m > 0
            ? `${fmt(100 * (1 - opt.distancia_optimizada_m / opt.distancia_original_m))}%` : "–";

        const lista = $("instrucciones");
        lista.innerHTML = "";
        for (const i of r.instrucciones) {
            const li = document.createElement("li");
            const sinNombre = i.calle === "desconocida";
            const enlace = i.accion.startsWith("Sigue recto") ? "por" : "en";
            li.innerHTML = `<span class="giro" aria-hidden="true"><i class="fa-solid"></i></span>` +
                `<div><div class="accion"></div><div class="dist"></div></div>`;
            li.querySelector("i").className = `fa-solid ${iconoGiro(i.accion)}`;
            li.querySelector(".accion").textContent = sinNombre ? i.accion : `${i.accion} ${enlace} ${i.calle}`;
            li.querySelector(".dist").textContent = `${fmt(i.distancia_m)} m${sinNombre ? " · calle sin nombre" : ""}`;
            lista.appendChild(li);
        }
        $("sin-instrucciones").style.display = r.instrucciones.length ? "none" : "";
        estado(`Ruta calculada en el navegador en ${fmt(ms, 1)} ms (incluye el viaje al Worker).`, "ok");
        if (esMovil()) $("tarjeta-resultado").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
        estado(e.codigo === "SIN_RUTA"
            ? "No hay camino entre alguna de las paradas en este grafo (¿están fuera de la zona del grafo?)."
            : e.message.replace(/^❌ /, ""), "error");
    } finally {
        ocupado = false;
        actualizarBotones();
    }
}

function mostrarGrafo(info, origen) {
    $("info-grafo").textContent = `${origen}: ${fmt(info.nodos)} nodos, ${fmt(info.aristas)} aristas` +
        `${info.dirigido ? ", respeta los sentidos" : ""}.`;
}

async function generarDeLaVista() {
    const b = mapa.getBounds();
    const caja = { sur: b.getSouth(), oeste: b.getWest(), norte: b.getNorth(), este: b.getEast() };
    if (caja.norte - caja.sur > LADO_MAXIMO_GRADOS || caja.este - caja.oeste > LADO_MAXIMO_GRADOS) {
        estado("La zona visible es muy grande para la demo: acerca el mapa (máximo ~25 km de lado).", "error");
        return;
    }
    ocupado = true;
    actualizarBotones();
    try {
        const inicio = performance.now();
        const r = await generarGrafo({
            caja,
            respetarSentido: $("sentidos").checked,
            alProgresar: (m) => estado(m),
        });
        estado("Cargando el grafo en el motor…");
        const info = await motor.cambiarGrafo(r.bytes);
        grafoActual = r.bytes;
        mostrarGrafo(info, "Grafo generado de la vista");
        paradas = [];
        limpiarRuta();
        dibujarParadas();
        estado(`Grafo generado en ${fmt((performance.now() - inicio) / 1000, 1)} s con datos de OpenStreetMap. ` +
            "Agrega paradas dentro de la zona.", "ok");
    } catch (e) {
        estado(`No se pudo generar el grafo: ${e.message.replace(/^❌ /, "")}`, "error");
    } finally {
        ocupado = false;
        actualizarBotones();
    }
}

function descargarActual() {
    const url = URL.createObjectURL(new Blob([grafoActual], { type: "application/octet-stream" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "grafo.bin" });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

mapa.on("click", (ev) => {
    if (ocupado) return;
    paradas.push([Number(ev.latlng.lat.toFixed(6)), Number(ev.latlng.lng.toFixed(6))]);
    limpiarRuta();
    dibujarParadas();
});
$("calcular").onclick = calcular;
$("limpiar").onclick = () => { paradas = []; limpiarRuta(); dibujarParadas(); };
$("ejemplo").onclick = () => {
    paradas = RUTA_EJEMPLO.map((p) => [...p]);
    $("optimizar").checked = true;
    dibujarParadas();
    calcular();
};
$("generar").onclick = generarDeLaVista;
$("descargar").onclick = descargarActual;

(async () => {
    dibujarParadas();
    try {
        const inicio = performance.now();
        grafoActual = await descargarGrafo(GRAFO_URL);
        motor = await crearMotorWeb({ grafo: grafoActual });
        mostrarGrafo(motor.info, "Mazatán y Villa Pesqueira, Sonora");
        estado(`Motor listo en ${fmt(performance.now() - inicio)} ms (módulo de 317 KB + grafo de 1.3 MB).`, "ok");
    } catch (e) {
        estado(`No se pudo iniciar el motor: ${e.message.replace(/^❌ /, "")}`, "error");
    }
    actualizarBotones();
})();
