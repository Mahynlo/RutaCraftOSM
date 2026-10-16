import unittest
import subprocess
import json
import math
import shutil
import os
import sys
import tempfile

TEST_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(TEST_DIR, "..", ".."))
PY_DIR = os.path.join(ROOT_DIR, "RutaCraftOSM")

SCRIPT_PATH = os.path.join(ROOT_DIR, "RutaCraftOSM_c", "bin", "cli.exe" if os.name == "nt" else "cli")
GRAFO_PATH = os.path.join(PY_DIR, "grafos", "grafo_mazatan_villapesqueira.bin")
PUNTOS_MUNICIPIO = os.path.join(PY_DIR, "geodatos", "tests_data_generador.json")
TEST_PUNTOS = [[29.065639, -110.056448], [29.062039, -110.059091]]
TRES_PUNTOS = [[29.065639, -110.056448], [29.062039, -110.059091], [29.059486, -110.053973]]
JSON_STRING = json.dumps(TEST_PUNTOS)


def haversine(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def largo_polilinea(ruta):
    return sum(haversine(ruta[i], ruta[i + 1]) for i in range(len(ruta) - 1))


class TestCppCLI(unittest.TestCase):

    def setUp(self):
        # Cada prueba corre en un directorio temporal para detectar archivos escritos en el cwd
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def ejecutar_cli(self, args, entrada=None):
        return subprocess.run(
            [SCRIPT_PATH] + args,
            input=entrada,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            cwd=self.tmp.name
        )

    def extraer_json(self, salida):
        json_inicio = salida.find("{")
        self.assertNotEqual(json_inicio, -1, "No se encontró JSON en la salida")
        json_data = json.loads(salida[json_inicio:])
        if isinstance(json_data, dict) and "resultado" in json_data:
            return json_data["resultado"]
        return json_data

    def calcular(self, puntos):
        result = self.ejecutar_cli(["--grafo", GRAFO_PATH, "--puntos", json.dumps(puntos), "--sin-cache"])
        self.assertEqual(result.returncode, 0, f"Error: {result.stderr}")
        return self.extraer_json(result.stdout)

    def test_array_argument(self):
        result = self.ejecutar_cli([
            "--grafo", GRAFO_PATH,
            "--array", "29.065639", "-110.056448", "29.059486", "-110.053973",
            "--stdout", "--sin-cache"
        ])
        self.assertEqual(result.returncode, 0, f"Error: {result.stderr}")
        data = self.extraer_json(result.stdout)
        self.assertIn("distancia_total_m", data)
        self.assertGreater(data["distancia_total_m"], 0)
        self.assertGreater(len(data["instrucciones"]), 0)

    def test_puntos_string(self):
        result = self.ejecutar_cli([
            "--grafo", GRAFO_PATH,
            "--puntos", JSON_STRING,
            "--stdout", "--sin-cache"
        ])
        self.assertEqual(result.returncode, 0)
        data = self.extraer_json(result.stdout)
        self.assertIn("ruta", data)
        self.assertGreater(len(data["ruta"]), 1)

    def test_salida_archivo(self):
        salida_path = os.path.join(self.tmp.name, "test_salida_cpp.json")
        result = self.ejecutar_cli([
            "--grafo", GRAFO_PATH,
            "--puntos", JSON_STRING,
            "--salida", salida_path,
            "--sin-cache"
        ])
        self.assertEqual(result.returncode, 0)
        self.assertTrue(os.path.exists(salida_path))
        with open(salida_path, "r", encoding="utf-8") as f:
            d = json.load(f)
        self.assertIn("distancia_total_km", d)

    def test_distancia_igual_a_polilinea(self):
        # La distancia reportada debe incluir todos los tramos, también el primero
        for puntos in (TEST_PUNTOS, TRES_PUNTOS):
            data = self.calcular(puntos)
            self.assertAlmostEqual(data["distancia_total_m"], largo_polilinea(data["ruta"]), delta=0.2)

    def test_instrucciones_cubren_la_ruta(self):
        data = self.calcular(TRES_PUNTOS)
        suma = sum(i["distancia_m"] for i in data["instrucciones"])
        # Cada instrucción se redondea a 0.1 m, así que se tolera el error acumulado
        self.assertAlmostEqual(suma, data["distancia_total_m"], delta=0.05 * len(data["instrucciones"]) + 0.1)
        self.assertEqual(data["instrucciones"][0]["desde"], data["ruta"][0])
        self.assertEqual(data["instrucciones"][-1]["hacia"], data["ruta"][-1])

    def test_mismo_punto(self):
        data = self.calcular([TEST_PUNTOS[0], TEST_PUNTOS[0]])
        self.assertEqual(data["distancia_total_m"], 0)
        self.assertEqual(data["instrucciones"], [])

    def test_sin_cache_no_escribe_archivos(self):
        self.calcular(TRES_PUNTOS)
        self.assertEqual(os.listdir(self.tmp.name), [])

    def test_cache_se_guarda_y_reutiliza(self):
        cache_path = os.path.join(self.tmp.name, "cache.json")
        args = ["--grafo", GRAFO_PATH, "--puntos", json.dumps(TRES_PUNTOS), "--cache", cache_path]
        primera = self.ejecutar_cli(args)
        self.assertEqual(primera.returncode, 0, primera.stderr)
        with open(cache_path, encoding="utf-8") as f:
            self.assertEqual(len(json.load(f)), 2)  # Un segmento por par de puntos consecutivos
        segunda = self.ejecutar_cli(args)
        self.assertEqual(self.extraer_json(primera.stdout), self.extraer_json(segunda.stdout))

    def test_errores_de_entrada(self):
        casos = [
            ([], "debes proporcionar los puntos gps"),
            (["--array", "29.06", "-110.05", "29.05"], "cantidad impar de coordenadas"),
            (["--puntos", "[[29.06, -110.05], [MALFORMADO]]"], "error al interpretar puntos"),
        ]
        for args, mensaje in casos:
            result = self.ejecutar_cli(["--grafo", GRAFO_PATH, "--sin-cache"] + args)
            self.assertEqual(result.returncode, 2, args)  # Entrada inválida
            self.assertIn(mensaje, result.stderr.lower())

    def test_grafo_inexistente(self):
        result = self.ejecutar_cli(["--grafo", "no_existe.bin", "--puntos", JSON_STRING, "--sin-cache"])
        self.assertEqual(result.returncode, 3)  # Grafo inválido
        self.assertIn("no existe", result.stderr.lower())


class TestCppServidor(unittest.TestCase):

    def servir(self, lineas, args=()):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [SCRIPT_PATH, "--serve", "--grafo", GRAFO_PATH, *args],
                input="\n".join(lineas) + "\n",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                cwd=tmp
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            return [json.loads(l) for l in result.stdout.splitlines() if l.strip()], tmp

    def test_respuestas_por_id_y_errores_aislados(self):
        respuestas, _ = self.servir([
            json.dumps({"id": 1, "puntos": TRES_PUNTOS}),
            "esto no es json",
            json.dumps({"id": 2, "puntos": []}),
            "",
            json.dumps({"id": "abc", "puntos": TEST_PUNTOS}),
        ], ["--sin-cache"])
        self.assertEqual([r["id"] for r in respuestas], [1, None, 2, "abc"])
        self.assertEqual([r["ok"] for r in respuestas], [True, False, False, True])
        self.assertIn("vacia", respuestas[2]["error"].lower())

    def test_mismo_resultado_que_modo_clasico(self):
        clasico = subprocess.run(
            [SCRIPT_PATH, "--grafo", GRAFO_PATH, "--puntos", json.dumps(TRES_PUNTOS), "--sin-cache"],
            stdout=subprocess.PIPE, text=True, encoding="utf-8"
        )
        respuestas, _ = self.servir([json.dumps({"id": 1, "puntos": TRES_PUNTOS})], ["--sin-cache"])
        self.assertEqual(respuestas[0]["resultado"], json.loads(clasico.stdout))

    def test_guarda_cache_al_cerrar(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_path = os.path.join(tmp, "cache.json")
            self.servir([json.dumps({"id": 1, "puntos": TRES_PUNTOS})], ["--cache", cache_path])
            with open(cache_path, encoding="utf-8") as f:
                self.assertEqual(len(json.load(f)), 2)


class TestRobustez(unittest.TestCase):
    """Casos que fallaban en instalaciones reales: rutas con acentos, caché obsoleto y muchos puntos."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def correr(self, exe, args, entrada=None, cwd=None):
        return subprocess.run([exe] + args, input=entrada, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, encoding="utf-8", cwd=cwd or self.tmp.name)

    def test_instalacion_en_carpeta_de_usuario_con_acentos(self):
        # Como queda la app instalada por electron-builder para un usuario "José Muñoz"
        bin_dir = os.path.join(self.tmp.name, "José Muñoz", "AppData", "Programs", "aguavp", "bin")
        os.makedirs(os.path.join(bin_dir, "grafos"))
        exe = os.path.join(bin_dir, os.path.basename(SCRIPT_PATH))
        shutil.copy(SCRIPT_PATH, exe)
        shutil.copy(GRAFO_PATH, os.path.join(bin_dir, "grafos", "grafo_mazatan_villapesqueira.bin"))

        result = self.correr(exe, ["--sin-cache", "--puntos", JSON_STRING])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertGreater(json.loads(result.stdout)["distancia_total_m"], 0)

    def test_grafo_cache_y_salida_en_rutas_con_acentos(self):
        carpeta = os.path.join(self.tmp.name, "Año señal ñandú")
        os.makedirs(carpeta)
        grafo = os.path.join(carpeta, "grafo_peñasco.bin")
        shutil.copy(GRAFO_PATH, grafo)
        cache = os.path.join(carpeta, "caché.json")
        salida = os.path.join(carpeta, "ruta_señal.json")

        result = self.correr(SCRIPT_PATH, ["--grafo", grafo, "--cache", cache, "--salida", salida,
                                           "--puntos", json.dumps(TRES_PUNTOS)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(os.path.exists(cache))
        with open(salida, encoding="utf-8") as f:
            self.assertGreater(json.load(f)["distancia_total_m"], 0)

    def test_cache_obsoleto_se_recalcula(self):
        cache = os.path.join(self.tmp.name, "cache.json")
        args = ["--grafo", GRAFO_PATH, "--cache", cache, "--puntos", JSON_STRING]
        normal = json.loads(self.correr(SCRIPT_PATH, args).stdout)

        # Simula un caché de un grafo anterior: el tramo pasa por un nodo que ya no existe
        with open(cache, encoding="utf-8") as f:
            datos = json.load(f)
        clave = next(iter(datos))
        datos[clave] = [datos[clave][0], "999999999999", datos[clave][-1]]
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(datos, f)

        result = self.correr(SCRIPT_PATH, args)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["ruta"], normal["ruta"])
        with open(cache, encoding="utf-8") as f:
            self.assertNotIn("999999999999", json.load(f)[clave])  # El caché quedó corregido

    def test_cache_con_nodos_no_conectados_se_recalcula(self):
        cache = os.path.join(self.tmp.name, "cache.json")
        args = ["--grafo", GRAFO_PATH, "--cache", cache, "--puntos", JSON_STRING]
        normal = json.loads(self.correr(SCRIPT_PATH, args).stdout)

        with open(cache, encoding="utf-8") as f:
            datos = json.load(f)
        clave = next(iter(datos))
        datos[clave] = [datos[clave][0], datos[clave][-1]]  # Nodos que existen pero no son vecinos
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(datos, f)

        result = self.correr(SCRIPT_PATH, args)
        self.assertEqual(json.loads(result.stdout)["ruta"], normal["ruta"])

    def test_muchos_puntos_por_stdin(self):
        # Con --array, 1,500 puntos superan el límite de ~32 KB de la línea de comandos de Windows
        puntos = [[29.06 + (i % 40) * 0.0003, -110.06 + (i // 40) * 0.0003] for i in range(2000)]
        result = self.correr(SCRIPT_PATH, ["--grafo", GRAFO_PATH, "--sin-cache", "--puntos", "-"],
                             entrada=json.dumps(puntos))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(json.loads(result.stdout)["puntos_gps"]), 2000)

    def test_puntos_por_stdin_invalidos(self):
        result = self.correr(SCRIPT_PATH, ["--grafo", GRAFO_PATH, "--sin-cache", "--puntos", "-"],
                             entrada="esto no es json")
        self.assertEqual(result.returncode, 2)
        self.assertIn("error al interpretar puntos", result.stderr.lower())


sys.path.insert(0, PY_DIR)
import formato_rco  # noqa: E402  (lector/escritor de los formatos RCO1 y RCO2)


def leer_grafo_bin(ruta):
    """Devuelve (coordenadas, lista de adyacencia [(destino, peso)])."""
    g = formato_rco.leer(ruta)
    return g.coords, [[(v, w) for v, w, _ in aristas] for aristas in g.adyacencia]


class TestFormatosGrafo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def calcular(self, grafo, puntos=TRES_PUNTOS):
        return subprocess.run([SCRIPT_PATH, "--grafo", grafo, "--sin-cache", "--puntos", json.dumps(puntos)],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")

    def test_grafo_de_produccion_es_rco2(self):
        self.assertEqual(formato_rco.leer(GRAFO_PATH).formato, "RCO2")

    def test_rco1_da_la_misma_ruta_que_rco2(self):
        # Compatibilidad: un grafo RCO1 (con aristas duplicadas, como lo exportaba la versión anterior)
        g = formato_rco.leer(GRAFO_PATH)
        g.adyacencia = [aristas + aristas for aristas in g.adyacencia]
        rco1 = os.path.join(self.tmp.name, "grafo_rco1.bin")
        formato_rco.escribir_rco1(rco1, g)

        with open(PUNTOS_MUNICIPIO, encoding="utf-8") as f:
            puntos = json.load(f)
        a, b = self.calcular(GRAFO_PATH, puntos), self.calcular(rco1, puntos)
        self.assertEqual(b.returncode, 0, b.stderr)
        self.assertEqual(json.loads(a.stdout), json.loads(b.stdout))

    def test_archivos_truncados_o_corruptos_se_rechazan(self):
        with open(GRAFO_PATH, "rb") as f:
            datos = f.read()
        g = formato_rco.leer(GRAFO_PATH)
        rco1 = os.path.join(self.tmp.name, "rco1.bin")
        formato_rco.escribir_rco1(rco1, g)
        with open(rco1, "rb") as f:
            datos_rco1 = f.read()

        corrupto = bytearray(datos)
        n = len(g.osm_ids)
        inicio_destinos = 32 + n * 8 + n * 16 + (n + 1) * 4
        corrupto[inicio_destinos:inicio_destinos + 4] = (n + 5).to_bytes(4, "little")  # destino fuera de rango

        casos = {
            "rco2_truncado.bin": datos[:len(datos) // 2],
            "rco2_basura_al_final.bin": datos + b"xx",
            "rco2_destino_invalido.bin": bytes(corrupto),
            "rco1_truncado.bin": datos_rco1[:len(datos_rco1) - 10],
            "vacio.bin": b"",
        }
        for nombre, contenido in casos.items():
            ruta = os.path.join(self.tmp.name, nombre)
            with open(ruta, "wb") as f:
                f.write(contenido)
            r = self.calcular(ruta)
            self.assertEqual(r.returncode, 3, nombre)  # Grafo inválido
            self.assertIn("formato no valido", r.stderr, nombre)


def servir_muchas(puntos_por_peticion):
    lineas = "\n".join(json.dumps({"id": i, "puntos": p}) for i, p in enumerate(puntos_por_peticion))
    r = subprocess.run([SCRIPT_PATH, "--serve", "--sin-cache", "--grafo", GRAFO_PATH], input=lineas + "\n",
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
    return {x["id"]: x for x in map(json.loads, r.stdout.splitlines())}


class TestAlgoritmo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.coords, cls.adj = leer_grafo_bin(GRAFO_PATH)

    def test_kdtree_devuelve_el_nodo_mas_cercano_exacto(self):
        import random
        rnd = random.Random(3)
        lats = [c[0] for c in self.coords]
        lons = [c[1] for c in self.coords]
        puntos = [[rnd.uniform(min(lats), max(lats)), rnd.uniform(min(lons), max(lons))] for _ in range(150)]
        respuestas = servir_muchas([[p, p] for p in puntos])
        for i, p in enumerate(puntos):
            esperado = min(haversine(p, c) for c in self.coords)
            ajustado = respuestas[i]["resultado"]["ruta"][0]
            self.assertAlmostEqual(haversine(p, ajustado), esperado, delta=0.01, msg=f"punto {p}")

    def test_astar_da_la_distancia_optima(self):
        import heapq
        import random

        def dijkstra(s, t):
            dist = {s: 0.0}
            cola = [(0.0, s)]
            while cola:
                d, u = heapq.heappop(cola)
                if u == t:
                    return d
                if d > dist.get(u, math.inf):
                    continue
                for v, w in self.adj[u]:
                    if d + w < dist.get(v, math.inf):
                        dist[v] = d + w
                        heapq.heappush(cola, (d + w, v))
            return None

        rnd = random.Random(11)
        pares = [(rnd.randrange(len(self.coords)), rnd.randrange(len(self.coords))) for _ in range(40)]
        respuestas = servir_muchas([[list(self.coords[s]), list(self.coords[t])] for s, t in pares])
        for i, (s, t) in enumerate(pares):
            optima = dijkstra(s, t)
            if optima is None or not respuestas[i]["ok"]:
                continue
            motor = largo_polilinea(respuestas[i]["resultado"]["ruta"])
            # Tolerancia: OSMnx mide las aristas con radio 6,371,009 m y haversine usa 6,371,000 m
            self.assertLessEqual(motor, optima * (1 + 1e-5) + 0.5, msg=f"par {s} -> {t}")

    def test_instrucciones_sin_redundancias(self):
        import random
        rnd = random.Random(5)
        rutas = [[list(self.coords[rnd.randrange(len(self.coords))]) for _ in range(8)] for _ in range(15)]
        with open(PUNTOS_MUNICIPIO, encoding="utf-8") as f:
            rutas.append(json.load(f))
        permitidas = {"Sigue recto", "Da vuelta en U"} | {
            f"Gira {modo}a la {lado}" for modo in ("", "ligeramente ", "bruscamente ") for lado in ("derecha", "izquierda")}

        for r in servir_muchas(rutas).values():
            if not r["ok"]:
                continue
            ins = r["resultado"]["instrucciones"]
            for i in ins:
                self.assertIn(i["accion"], permitidas)
            if len(ins) > 1:
                self.assertTrue(all(i["distancia_m"] >= 15 for i in ins), "tramo corto sin absorber")
            for a, b in zip(ins, ins[1:]):
                # Dos instrucciones seguidas en la misma calle solo si hay una vuelta en U o un giro cerrado
                if a["calle"] == b["calle"] and a["calle"] != "desconocida":
                    self.assertIn(b["accion"], {"Da vuelta en U", "Gira bruscamente a la derecha",
                                                "Gira bruscamente a la izquierda"})
            self.assertAlmostEqual(sum(i["distancia_m"] for i in ins), r["resultado"]["distancia_total_m"],
                                   delta=0.05 * len(ins) + 0.1)


class TestErrores(unittest.TestCase):
    """Códigos de salida por tipo de error y campo "codigo" en el modo servidor."""

    def correr(self, args, entrada=None):
        return subprocess.run([SCRIPT_PATH] + args, input=entrada, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, encoding="utf-8")

    def test_codigos_de_salida(self):
        casos = [
            (["--opcion-que-no-existe"], 2),
            (["--grafo"], 2),
            (["--array", "29.06", "abc"], 2),
            (["--optimizar", "--regresar", "--fijar-final", "--puntos", JSON_STRING], 2),
            (["--grafo", "no_existe.bin", "--puntos", JSON_STRING], 3),
        ]
        for args, codigo in casos:
            r = self.correr(["--sin-cache"] + args)
            self.assertEqual(r.returncode, codigo, f"{args}: {r.stderr}")
            self.assertTrue(r.stderr.startswith("Error: "), r.stderr)

    def test_codigos_en_modo_servidor(self):
        lineas = [
            "no es json",
            json.dumps({"id": 1, "puntos": []}),
            json.dumps({"id": 2, "puntos": TEST_PUNTOS, "regresar": True, "fijar_final": True}),
            json.dumps({"id": 3, "puntos": TEST_PUNTOS}),
        ]
        r = self.correr(["--serve", "--sin-cache", "--grafo", GRAFO_PATH], "\n".join(lineas) + "\n")
        respuestas = [json.loads(l) for l in r.stdout.splitlines()]
        self.assertEqual([x.get("codigo") for x in respuestas], ["ENTRADA_INVALIDA"] * 3 + [None])
        self.assertTrue(respuestas[3]["ok"])

    def test_sin_ruta_tiene_su_propio_codigo(self):
        # Grafo con dos componentes desconectadas: no hay camino entre ellas
        g = formato_rco.Grafo(osm_ids=[1, 2, 3, 4],
                              coords=[(29.0, -110.0), (29.0, -110.001), (29.1, -110.0), (29.1, -110.001)],
                              adyacencia=[[(1, 97.0, "A")], [(0, 97.0, "A")], [(3, 97.0, "B")], [(2, 97.0, "B")]])
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "islas.bin")
            formato_rco.escribir_rco2(ruta, g)
            r = self.correr(["--grafo", ruta, "--sin-cache", "--puntos", "[[29.0, -110.0], [29.1, -110.0]]"])
            self.assertEqual(r.returncode, 4, r.stderr)
            self.assertIn("No se encontro ruta", r.stderr)


class TestOptimizacion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.coords, _ = leer_grafo_bin(GRAFO_PATH)

    def puntos_al_azar(self, n, semilla):
        import random
        rnd = random.Random(semilla)
        # Paradas dentro de Mazatán (la zona con más calles del grafo)
        cercanos = [c for c in self.coords if abs(c[0] - 29.0) < 0.01 and abs(c[1] + 110.14) < 0.01]
        return [list(rnd.choice(cercanos)) for _ in range(n)]

    def peticiones(self, peticiones):
        return servir_muchas_con_opciones(peticiones)

    def test_orden_valido_y_nunca_peor(self):
        for semilla, n in [(1, 6), (2, 12), (3, 25)]:
            puntos = self.puntos_al_azar(n, semilla)
            r = self.peticiones([{"puntos": puntos}, {"puntos": puntos, "optimizar": True}])
            original, optimizada = r[0]["resultado"], r[1]["resultado"]
            orden = optimizada["orden"]
            self.assertEqual(orden[0], 0)                       # Empieza en la primera parada
            self.assertEqual(sorted(orden), list(range(n)))    # Visita todas exactamente una vez
            self.assertEqual(optimizada["puntos_gps"], [puntos[i] for i in orden])
            self.assertLessEqual(optimizada["distancia_total_m"], original["distancia_total_m"] + 1.0)
            self.assertEqual(optimizada["optimizacion"]["metodo"], "exacto" if n - 1 <= 8 else "heuristico")

    def test_no_empeora_una_ruta_ya_ordenada(self):
        # La ruta municipal de prueba ya viene en un buen orden: la heurística no debe alargarla
        with open(PUNTOS_MUNICIPIO, encoding="utf-8") as f:
            puntos = json.load(f)
        for opciones in ({}, {"regresar": True}, {"fijar_final": True}):
            r = self.peticiones([{"puntos": puntos, "optimizar": True, **opciones}])[0]["resultado"]["optimizacion"]
            self.assertLessEqual(r["distancia_optimizada_m"], r["distancia_original_m"], opciones)

    def test_exacto_coincide_con_fuerza_bruta(self):
        import itertools
        puntos = self.puntos_al_azar(6, 9)
        permutaciones = [[0] + list(p) for p in itertools.permutations(range(1, 6))]
        peticiones = [{"puntos": [puntos[i] for i in orden]} for orden in permutaciones]
        peticiones.append({"puntos": puntos, "optimizar": True})
        r = self.peticiones(peticiones)
        mejor = min(x["resultado"]["distancia_total_m"] for x in r[:-1])
        self.assertAlmostEqual(r[-1]["resultado"]["distancia_total_m"], mejor, delta=1.0)

    def test_regresar_y_fijar_final(self):
        puntos = self.puntos_al_azar(10, 4)
        r = self.peticiones([
            {"puntos": puntos, "optimizar": True, "regresar": True},
            {"puntos": puntos, "optimizar": True, "fijar_final": True},
            {"puntos": puntos, "regresar": True},
        ])
        regresar, fijar, solo_regresar = (x["resultado"] for x in r)
        self.assertEqual(regresar["orden"][0], 0)
        self.assertEqual(regresar["orden"][-1], 0)
        self.assertEqual(len(regresar["orden"]), 11)
        self.assertEqual(fijar["orden"][0], 0)
        self.assertEqual(fijar["orden"][-1], 9)
        self.assertEqual(solo_regresar["orden"], list(range(10)) + [0])  # Sin optimizar: mismo orden y vuelta
        self.assertNotIn("optimizacion", solo_regresar)

    def test_heuristico_mejora_mucho_un_orden_al_azar(self):
        puntos = self.puntos_al_azar(40, 5)
        r = self.peticiones([{"puntos": puntos, "optimizar": True}])[0]["resultado"]["optimizacion"]
        self.assertLess(r["distancia_optimizada_m"], 0.6 * r["distancia_original_m"])


def servir_muchas_con_opciones(peticiones):
    lineas = "\n".join(json.dumps({"id": i, **p}) for i, p in enumerate(peticiones))
    r = subprocess.run([SCRIPT_PATH, "--serve", "--sin-cache", "--grafo", GRAFO_PATH], input=lineas + "\n",
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
    respuestas = sorted(map(json.loads, r.stdout.splitlines()), key=lambda x: x["id"])
    for x in respuestas:
        assert x["ok"], x
    return respuestas


class TestRendimiento(unittest.TestCase):
    """Detecta regresiones graves (p. ej. un A* que se vuelva lineal). Los márgenes son ~50-100 veces
    los tiempos medidos, porque los equipos de CI son lentos y variables."""

    def test_carga_y_rutas_en_modo_servidor(self):
        import time
        with open(PUNTOS_MUNICIPIO, encoding="utf-8") as f:
            puntos = json.load(f)
        lineas = "\n".join(json.dumps({"id": i, "puntos": puntos}) for i in range(50)) + "\n"
        inicio = time.perf_counter()
        r = subprocess.run([SCRIPT_PATH, "--serve", "--sin-cache", "--grafo", GRAFO_PATH], input=lineas,
                           stdout=subprocess.PIPE, text=True, encoding="utf-8")
        total = time.perf_counter() - inicio
        self.assertEqual(len(r.stdout.splitlines()), 50)
        # Hoy: ~40 ms (arranque + carga + 50 rutas de 23 paradas)
        self.assertLess(total, 4.0, f"50 rutas tardaron {total:.2f} s")


class TestParidadPython(unittest.TestCase):
    """El motor C++ debe producir la misma ruta y distancia que el motor de referencia en Python."""

    def test_ruta_municipio_completo(self):
        sys.path.insert(0, PY_DIR)
        try:
            import core
        finally:
            sys.path.remove(PY_DIR)

        with open(PUNTOS_MUNICIPIO, encoding="utf-8") as f:
            puntos = json.load(f)

        adj_list, coords = core.cargar_lista_adyacencia("grafo_mazatan_villapesqueira.pkl")
        ruta_nodos, _ = core.construir_ruta_con_lista(adj_list, coords, puntos, cache={})
        _, distancia_py = core.calcular_instrucciones(coords, ruta_nodos)
        ruta_py = [list(coords[n]) for n in ruta_nodos]

        result = subprocess.run(
            [SCRIPT_PATH, "--grafo", GRAFO_PATH, "--puntos", PUNTOS_MUNICIPIO, "--sin-cache"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)

        self.assertEqual(len(data["ruta"]), len(ruta_py))
        for a, b in zip(data["ruta"], ruta_py):
            self.assertAlmostEqual(a[0], b[0], places=6)
            self.assertAlmostEqual(a[1], b[1], places=6)
        self.assertAlmostEqual(data["distancia_total_m"], distancia_py, delta=0.2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
