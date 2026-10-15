import unittest
import subprocess
import json
import math
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
            self.assertEqual(result.returncode, 1, args)
            self.assertIn(mensaje, result.stderr.lower())

    def test_grafo_inexistente(self):
        result = self.ejecutar_cli(["--grafo", "no_existe.bin", "--puntos", JSON_STRING, "--sin-cache"])
        self.assertEqual(result.returncode, 1)
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
