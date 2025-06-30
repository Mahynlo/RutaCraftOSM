import unittest
import subprocess
import json
import os

SCRIPT_PATH = "cli.py"
GRAFO_PATH = "grafo_villa_pesqueira.graphml"
TEST_PUNTOS = [[29.065639, -110.056448], [29.062039, -110.059091]]
JSON_STRING = json.dumps(TEST_PUNTOS)


class TestCLI(unittest.TestCase):

    def ejecutar_cli(self, args):
        """Ejecuta el script CLI y retorna el resultado completo"""
        result = subprocess.run(
            ["python", SCRIPT_PATH] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        if result.returncode != 0:
            print("\n❌ Error de ejecución CLI:")
            print("Args:", args)
            print("STDERR:", result.stderr)
        return result

    def extraer_json(self, salida):
        """Extrae JSON limpio desde stdout (ignorando warnings u otros textos previos)"""
        json_inicio = salida.find("{")
        self.assertNotEqual(json_inicio, -1, "No se encontró JSON en la salida")

        try:
            json_data = salida[json_inicio:]
            return json.loads(json_data)
        except json.JSONDecodeError:
            print("\n❌ Error al parsear JSON:")
            print(salida)
            raise

    def test_array_argument(self):
        """✅ CLI con --array debe devolver ruta válida"""
        result = self.ejecutar_cli([
            "--grafo", GRAFO_PATH,
            "--array", "29.065639", "-110.056448", "29.059486", "-110.053973",
            "--stdout"
        ])
        self.assertEqual(result.returncode, 0, "La ejecución falló")
        data = self.extraer_json(result.stdout)
        self.assertIn("distancia_total_m", data)
        self.assertGreater(data["distancia_total_m"], 0)
        self.assertGreater(len(data["instrucciones"]), 0)

    def test_json_string_argument(self):
        """✅ CLI con --puntos como string JSON debe funcionar"""
        result = self.ejecutar_cli([
            "--grafo", GRAFO_PATH,
            "--puntos", JSON_STRING,
            "--stdout"
        ])
        self.assertEqual(result.returncode, 0)
        data = self.extraer_json(result.stdout)
        self.assertIn("ruta", data)
        self.assertIsInstance(data["ruta"], list)
        self.assertGreater(len(data["ruta"]), 1)

    def test_file_argument(self):
        """✅ CLI con archivo JSON debe devolver instrucciones"""
        puntos_file = "puntos_test.json"
        try:
            with open(puntos_file, "w") as f:
                json.dump(TEST_PUNTOS, f)

            result = self.ejecutar_cli([
                "--grafo", GRAFO_PATH,
                "--puntos", puntos_file,
                "--stdout"
            ])
            self.assertEqual(result.returncode, 0)
            data = self.extraer_json(result.stdout)
            self.assertIn("instrucciones", data)
            self.assertGreater(len(data["instrucciones"]), 0)
        finally:
            if os.path.exists(puntos_file):
                os.remove(puntos_file)

    def test_output_file_generation(self):
        """✅ CLI debe generar archivo JSON con --salida"""
        output_path = "salida_test.json"
        try:
            result = self.ejecutar_cli([
                "--grafo", GRAFO_PATH,
                "--puntos", JSON_STRING,
                "--salida", output_path
            ])
            self.assertEqual(result.returncode, 0)
            self.assertTrue(os.path.exists(output_path), "No se creó el archivo de salida")

            with open(output_path) as f:
                contenido = json.load(f)
            self.assertIn("distancia_total_km", contenido)
            self.assertGreater(contenido["distancia_total_km"], 0)
        finally:
            if os.path.exists(output_path):
                os.remove(output_path)


if __name__ == '__main__':
    unittest.main(verbosity=2)


