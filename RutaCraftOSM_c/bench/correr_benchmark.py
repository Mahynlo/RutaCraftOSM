"""
Corre el benchmark del motor sobre los grafos disponibles (zona Mazatán y ciudad de Hermosillo)
y guarda los resultados en docs/benchmark.json, docs/5_RENDIMIENTO.md y docs/js/rutas_benchmark.js
(las rutas completas, para verlas en docs/visualizacion_ruta.html).

    cmake --build build --target cli benchmark
    python bench/correr_benchmark.py

El grafo de Hermosillo se genera con RutaCraftOSM/generar_grafos_benchmark.py; si no existe se omite.
"""
import json
import os
import platform
import random
import statistics
import subprocess
import sys
import tempfile
import time
from datetime import date

if sys.stdout:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BENCH_DIR = os.path.dirname(os.path.abspath(__file__))
CPP_DIR = os.path.dirname(BENCH_DIR)
ROOT_DIR = os.path.dirname(CPP_DIR)
GRAFOS_DIR = os.path.join(ROOT_DIR, "RutaCraftOSM", "grafos")
EXE = ".exe" if os.name == "nt" else ""
BENCHMARK = os.path.join(CPP_DIR, "bin", "benchmark" + EXE)
CLI = os.path.join(CPP_DIR, "bin", "cli" + EXE)
SALIDA = os.path.join(ROOT_DIR, "docs", "benchmark.json")
SALIDA_MD = os.path.join(ROOT_DIR, "docs", "5_RENDIMIENTO.md")
SALIDA_RUTAS = os.path.join(ROOT_DIR, "docs", "js", "rutas_benchmark.js")


def puntos_aleatorios(n, lat_min, lat_max, lon_min, lon_max, semilla):
    rnd = random.Random(semilla)
    return [[round(rnd.uniform(lat_min, lat_max), 6), round(rnd.uniform(lon_min, lon_max), 6)] for _ in range(n)]


with open(os.path.join(ROOT_DIR, "RutaCraftOSM", "geodatos", "tests_data_generador.json"), encoding="utf-8") as f:
    RUTA_MAZATAN = json.load(f)

HMO_CENTRO = [29.072700, -110.955900]
HMO_LECTURA = puntos_aleatorios(25, 29.081, 29.097, -110.978, -110.962, semilla=1)   # ~1.7 km², una colonia
HMO_CIUDAD = puntos_aleatorios(50, 29.000, 29.150, -111.040, -110.910, semilla=2)    # toda la mancha urbana

ESCENARIOS = {
    "mazatan": [
        {"nombre": "Ruta corta (3 paradas)", "puntos": RUTA_MAZATAN[:3]},
        {"nombre": "Ruta municipal (23 paradas)", "puntos": RUTA_MAZATAN},
    ],
    "hermosillo": [
        {"nombre": "Cruce norte-sur (2 puntos)", "puntos": [[29.1350, -110.9900], [29.0200, -110.9500]]},
        {"nombre": "Centro al aeropuerto (2 puntos)", "puntos": [HMO_CENTRO, [29.0960, -111.0480]]},
        {"nombre": "Ruta de lectura en una colonia (25 paradas)", "puntos": HMO_LECTURA},
        {"nombre": "Recorrido por toda la ciudad (50 paradas)", "puntos": HMO_CIUDAD},
    ],
}

# (zona, etiqueta, variante, grafo): la variante "dirigido" respeta las calles de un solo sentido
GRAFOS = [
    ("mazatan", "Mazatán - Villa Pesqueira", "normal",
     os.path.join(GRAFOS_DIR, "grafo_mazatan_villapesqueira.bin")),
    ("hermosillo", "Ciudad de Hermosillo", "normal",
     os.path.join(GRAFOS_DIR, "benchmark", "grafo_hermosillo.bin")),
    ("hermosillo", "Ciudad de Hermosillo (respetando sentidos)", "dirigido",
     os.path.join(GRAFOS_DIR, "benchmark", "grafo_hermosillo_dirigido.bin")),
]
ZONAS = {"mazatan": "Mazatán - Villa Pesqueira", "hermosillo": "Ciudad de Hermosillo"}


def ejecutar_cli(grafo, puntos, repeticiones=5):
    """Mide una llamada de calcularRuta() (arrancar cli.exe, cargar el grafo y calcular) y devuelve
    (mediana en ms, resultado de la ruta)."""
    tiempos = []
    resultado = None
    for _ in range(repeticiones):
        t0 = time.perf_counter()
        r = subprocess.run([CLI, "--grafo", grafo, "--puntos", json.dumps(puntos), "--sin-cache"],
                           capture_output=True, text=True, encoding="utf-8")
        tiempos.append((time.perf_counter() - t0) * 1000)
        if r.returncode != 0:
            return None, None
        resultado = json.loads(r.stdout)
    return round(statistics.median(tiempos), 1), resultado


def nombre_cpu():
    if os.name == "nt":
        try:
            out = subprocess.run(["powershell", "-NoProfile", "-Command",
                                  "(Get-CimInstance Win32_Processor).Name"], capture_output=True, text=True)
            return out.stdout.strip() or platform.processor()
        except OSError:
            pass
    return platform.processor() or platform.machine()


def main():
    for exe in (BENCHMARK, CLI):
        if not os.path.exists(exe):
            sys.exit(f"Falta {exe}. Compila con: cmake --build build --target cli benchmark")

    resultados = []
    rutas = {}  # (zona, índice de escenario) -> datos para el visualizador
    for clave, etiqueta, variante, grafo in GRAFOS:
        if not os.path.exists(grafo):
            print(f"⏭️  {etiqueta}: no existe {os.path.relpath(grafo, ROOT_DIR)}, se omite")
            continue

        print(f"⏱️  {etiqueta}...", flush=True)
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp:
            json.dump({"escenarios": ESCENARIOS[clave]}, tmp)
        try:
            r = subprocess.run([BENCHMARK, grafo, tmp.name, "5"], capture_output=True, text=True, encoding="utf-8")
        finally:
            os.remove(tmp.name)
        if r.returncode != 0:
            print(f"❌ {etiqueta}: {r.stderr.strip()}")
            continue

        datos = json.loads(r.stdout)
        datos["etiqueta"] = etiqueta
        for idx, (esc, definicion) in enumerate(zip(datos["escenarios"], ESCENARIOS[clave])):
            if "error" in esc:
                continue
            esc["proceso_cli_ms"], ruta = ejecutar_cli(grafo, definicion["puntos"])
            if not ruta:
                continue
            entrada = rutas.setdefault((clave, idx), {
                "id": f"{clave}-{idx}",
                "zona": ZONAS[clave],
                "nombre": definicion["nombre"],
                "puntos": definicion["puntos"],
                "variantes": {},
            })
            entrada["variantes"][variante] = {
                "distancia_km": ruta["distancia_total_km"],
                "motor_persistente_ms": esc["total_ms"],
                "calcular_ruta_ms": esc["proceso_cli_ms"],
                "ruta": [[round(lat, 6), round(lon, 6)] for lat, lon in ruta["ruta"]],
                "instrucciones": [{"accion": i["accion"], "calle": i["calle"], "distancia_m": i["distancia_m"]}
                                  for i in ruta["instrucciones"]],
            }
        resultados.append(datos)
        imprimir(datos)

    meta = {
        "fecha": date.today().isoformat(),
        "cpu": nombre_cpu(),
        "sistema": f"{platform.system()} {platform.release()}",
    }
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump({**meta, "grafos": resultados}, f, indent=2, ensure_ascii=False)
    with open(SALIDA_MD, "w", encoding="utf-8") as f:
        f.write(generar_markdown(meta, resultados))
    with open(SALIDA_RUTAS, "w", encoding="utf-8") as f:
        f.write("// Generado por RutaCraftOSM_c/bench/correr_benchmark.py; no editar a mano.\n")
        f.write("const RUTAS_BENCHMARK = ")
        json.dump({**meta, "escenarios": list(rutas.values())}, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print()
    for salida in (SALIDA, SALIDA_MD, SALIDA_RUTAS):
        print(f"💾 {os.path.relpath(salida, ROOT_DIR)}")


def imprimir(d):
    print(f"   {d['nodos']:,} nodos · carga {d['carga_ms']} ms · KD-Tree {d['kdtree_ms']} ms · "
          f"memoria {d['memoria_pico_mb']} MB")
    for e in d["escenarios"]:
        if "error" in e:
            print(f"   ❌ {e['nombre']}: {e['error']}")
        else:
            print(f"   • {e['nombre']}: {e['total_ms']} ms (motor persistente) · "
                  f"{e['proceso_cli_ms']} ms (calcularRuta) · {e['instrucciones']['total']} instrucciones")


def generar_markdown(meta, resultados):
    l = [
        "# ⏱️ 5. Rendimiento del Motor C++",
        "",
        "> [!NOTE]",
        "> Página generada automáticamente por `RutaCraftOSM_c/bench/correr_benchmark.py`; no editar a mano.",
        f"> Medido el **{meta['fecha']}** en **{meta['cpu']}** ({meta['sistema']}). "
        "Los tiempos son la mediana de 5 repeticiones.",
        "",
        "Se mide el motor tal como lo usa la aplicación de Electron, en dos grafos:",
        "",
        "* **Mazatán - Villa Pesqueira**: el grafo de producción, zona rural.",
        "* **Ciudad de Hermosillo**: zona urbana con muchas calles, para ver cómo escala el motor "
        "(se genera con `RutaCraftOSM/generar_grafos_benchmark.py`).",
        "",
        "---",
        "",
        "## 1. Arranque del motor",
        "",
        "Lo que se paga cada vez que se inicia `cli.exe`: una vez por llamada con `calcularRuta()`, "
        "o una sola vez con el motor persistente (`crearMotorRutas()`).",
        "",
        "| Grafo | Nodos | Aristas | Archivo | Carga del grafo | KD-Tree | Memoria pico |",
        "| :--- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for d in resultados:
        l.append(f"| {d['etiqueta']} | {d['nodos']:,} | {d['aristas']:,} | {d['tamano_mb']} MB | "
                 f"{d['carga_ms']} ms | {d['kdtree_ms']} ms | {d['memoria_pico_mb']} MB |")

    l += [
        "",
        "---",
        "",
        "## 2. Tiempo por ruta",
        "",
        "* **Motor persistente**: tiempo de `motor.calcular()` con el grafo ya cargado "
        "(snapping + A\\* + instrucciones + JSON), sin caché.",
        "* **calcularRuta()**: tiempo real del proceso completo (arrancar `cli.exe`, cargar el grafo y calcular).",
        "* **A\\***: parte del tiempo que corresponde solo a la búsqueda de caminos.",
        "",
        "Las paradas de los escenarios de 25 y 50 puntos en Hermosillo se generan al azar (semilla fija) y se "
        "visitan en ese orden, sin optimizar; por eso sus distancias son mayores que las de una ruta real.",
        "",
    ]
    for d in resultados:
        l += [
            f"### {d['etiqueta']}",
            "",
            "| Escenario | Paradas | Distancia | Motor persistente | calcularRuta() | A\\* |",
            "| :--- | ---: | ---: | ---: | ---: | ---: |",
        ]
        for e in d["escenarios"]:
            if "error" in e:
                l.append(f"| {e['nombre']} | {e['puntos']} | ❌ {e['error']} | | | |")
                continue
            l.append(f"| {e['nombre']} | {e['puntos']} | {e['distancia_km']} km | **{e['total_ms']} ms** | "
                     f"{e['proceso_cli_ms']} ms | {e['astar_ms']} ms |")
        l.append("")

    l += [
        "---",
        "",
        "## 3. Instrucciones de navegación",
        "",
        "| Grafo | Escenario | Instrucciones | Recto / Der. / Izq. | Metros por instrucción | Distancia sin nombre de calle |",
        "| :--- | :--- | ---: | :---: | ---: | ---: |",
    ]
    for d in resultados:
        for e in d["escenarios"]:
            if "error" in e:
                continue
            i = e["instrucciones"]
            l.append(f"| {d['etiqueta']} | {e['nombre']} | {i['total']} | "
                     f"{i['recto']} / {i['derecha']} / {i['izquierda']} | "
                     f"{i['m_por_instruccion']} m | {i['pct_distancia_calle_desconocida']}% |")

    ejemplo = next((e for d in resultados if d["etiqueta"] == "Ciudad de Hermosillo"
                    for e in d["escenarios"] if "error" not in e), None)
    if ejemplo:
        l += ["", f"Primeras instrucciones de *{ejemplo['nombre']}* (Hermosillo):", "", "```text"]
        l += ejemplo["instrucciones"]["muestra"]
        l.append("```")

    por_etiqueta = {d["etiqueta"]: d for d in resultados}
    base = por_etiqueta.get("Ciudad de Hermosillo")
    dirigido = por_etiqueta.get("Ciudad de Hermosillo (respetando sentidos)")
    if base and dirigido:
        l += [
            "",
            "---",
            "",
            "## 4. Calles de un solo sentido",
            "",
            "El grafo de producción agrega cada arista también en sentido contrario, por lo que el motor puede "
            "trazar rutas en contrasentido. Comparación en Hermosillo con un grafo que respeta los sentidos "
            "(`exportar_grafo_binario(..., respetar_sentido=True)`):",
            "",
            f"* Archivo: {base['tamano_mb']} MB → {dirigido['tamano_mb']} MB; "
            f"carga: {base['carga_ms']} ms → {dirigido['carga_ms']} ms; "
            f"aristas: {base['aristas']:,} → {dirigido['aristas']:,}.",
            "",
            "| Escenario | Ignorando sentidos | Respetando sentidos | Diferencia |",
            "| :--- | ---: | ---: | ---: |",
        ]
        for a, b in zip(base["escenarios"], dirigido["escenarios"]):
            if "error" in a or "error" in b or not a["distancia_km"]:
                continue
            dif = 100 * (b["distancia_km"] - a["distancia_km"]) / a["distancia_km"]
            l.append(f"| {a['nombre']} | {a['distancia_km']} km | {b['distancia_km']} km | {dif:+.1f}% |")

    l.append("")
    return "\n".join(l)


if __name__ == "__main__":
    main()
