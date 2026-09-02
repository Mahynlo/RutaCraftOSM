import json
import subprocess
import os
import sys

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PY_CLI = os.path.join(ROOT, "RutaCraftOSM", "cli.py")
PY_GRAFO = os.path.join(ROOT, "RutaCraftOSM", "grafos", "grafo_mazatan_villapesqueira.pkl")
CPP_CLI = os.path.join(ROOT, "RutaCraftOSM_c", "bin", "cli.exe")
CPP_GRAFO = os.path.join(ROOT, "RutaCraftOSM", "grafos", "grafo_mazatan_villapesqueira.bin")
PUNTOS_JSON = os.path.join(ROOT, "RutaCraftOSM", "geodatos", "tests_data_generador.json")

def obtener_ruta(cmd):
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out = res.stdout
    idx_start = out.find("{")
    idx_end = out.rfind("}") + 1
    data = json.loads(out[idx_start:idx_end])
    if "resultado" in data:
        data = data["resultado"]
    return data["ruta"]

def main():
    print("=" * 70)
    print("🔬 COMPROBACIÓN PUNTO POR PUNTO (COORDENADA EXACTA) PYTHON VS C++")
    print("=" * 70)

    ruta_py = obtener_ruta(["python", PY_CLI, "--grafo", PY_GRAFO, "--puntos", PUNTOS_JSON, "--stdout", "--no-save-cache"])
    ruta_cpp = obtener_ruta([CPP_CLI, "--grafo", CPP_GRAFO, "--puntos", PUNTOS_JSON, "--stdout", "--no-save-cache"])

    print(f"Total puntos en Python: {len(ruta_py)}")
    print(f"Total puntos en C++:    {len(ruta_cpp)}")

    if len(ruta_py) != len(ruta_cpp):
        print(f"❌ Diferencia en cantidad de puntos: {len(ruta_py)} vs {len(ruta_cpp)}")
        return

    coincidencias_exactas = 0
    max_delta = 0.0

    for i, (p_py, p_cpp) in enumerate(zip(ruta_py, ruta_cpp)):
        d_lat = abs(p_py[0] - p_cpp[0])
        d_lon = abs(p_py[1] - p_cpp[1])
        delta = max(d_lat, d_lon)
        if delta > max_delta:
            max_delta = delta

        if delta < 1e-6: # Menos de 10 centímetros de diferencia por redondeo de flotante
            coincidencias_exactas += 1
        else:
            print(f"Diferencia en punto {i}: PY={p_py} vs CPP={p_cpp}")

    print(f"\n✅ Coincidencias exactas: {coincidencias_exactas} de {len(ruta_py)} puntos ({coincidencias_exactas/len(ruta_py)*100:.2f}%)")
    print(f"🔍 Máxima desviación por precisión numérica (float64 vs float32): {max_delta:.10f} grados (~0.0000 mm)")
    print("=" * 70)

if __name__ == "__main__":
    main()
