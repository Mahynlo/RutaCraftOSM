import unittest
import subprocess
import json
import os

SCRIPT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "bin", "cli.exe"))
GRAFO_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "RutaCraftOSM", "grafos", "grafo_mazatan_villapesqueira.bin"))
TEST_PUNTOS = [[29.065639, -110.056448], [29.062039, -110.059091]]
JSON_STRING = json.dumps(TEST_PUNTOS)

class TestCppCLI(unittest.TestCase):

    def ejecutar_cli(self, args):
        result = subprocess.run(
            [SCRIPT_PATH] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return result

    def extraer_json(self, salida):
        json_inicio = salida.find("{")
        self.assertNotEqual(json_inicio, -1, "No se encontró JSON en la salida")
        json_data = json.loads(salida[json_inicio:])
        if isinstance(json_data, dict) and "resultado" in json_data:
            return json_data["resultado"]
        return json_data

    def test_array_argument(self):
        result = self.ejecutar_cli([
            "--grafo", GRAFO_PATH,
            "--array", "29.065639", "-110.056448", "29.059486", "-110.053973",
            "--stdout"
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
            "--stdout"
        ])
        self.assertEqual(result.returncode, 0)
        data = self.extraer_json(result.stdout)
        self.assertIn("ruta", data)
        self.assertGreater(len(data["ruta"]), 1)

    def test_salida_archivo(self):
        salida_path = "test_salida_cpp.json"
        try:
            result = self.ejecutar_cli([
                "--grafo", GRAFO_PATH,
                "--puntos", JSON_STRING,
                "--salida", salida_path
            ])
            self.assertEqual(result.returncode, 0)
            self.assertTrue(os.path.exists(salida_path))
            with open(salida_path, "r", encoding="utf-8") as f:
                d = json.load(f)
            self.assertIn("distancia_total_km", d)
        finally:
            if os.path.exists(salida_path):
                os.remove(salida_path)

if __name__ == "__main__":
    unittest.main(verbosity=2)
