import unittest
import subprocess
import os

SCRIPT_PATH = "cli.py"

class TestCLIErrores(unittest.TestCase):

    def ejecutar(self, args):
        return subprocess.run(
            ["python", SCRIPT_PATH] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

    def test_sin_argumentos(self):
        result = self.ejecutar([])
        self.assertEqual(result.returncode, 1)
        self.assertIn("debes proporcionar los puntos gps", result.stdout.lower())

    def test_json_mal_formado(self):
        result = self.ejecutar([
            "--puntos", "[[29.065639, -110.056448], [MALFORMADO]]",
            "--stdout"
        ])
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(
            "error al interpretar puntos" in result.stdout.lower() or
            "error al interpretar puntos" in result.stderr.lower()
        )

    def test_array_impar(self):
        result = self.ejecutar([
            "--array", "29.065639", "-110.056448", "29.059486",
            "--stdout"
        ])
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(
            "cantidad impar de coordenadas" in result.stdout.lower() or
            "cantidad impar de coordenadas" in result.stderr.lower()
        )

    def test_sin_argumentos(self):
        result = self.ejecutar([
            "--grafo", "grafo_villa_pesqueira.graphml"
        ])
        self.assertEqual(result.returncode, 1)
        output = result.stdout.lower() + result.stderr.lower()
        self.assertIn("debes proporcionar los puntos gps", output)


if __name__ == "__main__":
    unittest.main(verbosity=2)


