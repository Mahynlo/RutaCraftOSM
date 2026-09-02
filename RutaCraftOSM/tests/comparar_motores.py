import subprocess
import json
import time
import os
import sys

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

TEST_DIR = os.path.dirname(os.path.abspath(__file__))
PY_DIR = os.path.dirname(TEST_DIR)
ROOT_DIR = os.path.dirname(PY_DIR)

PYTHON_CLI = os.path.join(PY_DIR, "cli.py")
PYTHON_GRAFO = os.path.join(PY_DIR, "grafos", "grafo_mazatan_villapesqueira.pkl")

CPP_CLI = os.path.join(ROOT_DIR, "RutaCraftOSM_c", "bin", "cli.exe")
CPP_GRAFO = os.path.join(PY_DIR, "grafos", "grafo_mazatan_villapesqueira.bin")

PUNTOS_JSON = os.path.join(PY_DIR, "geodatos", "tests_data_generador.json")

def ejecutar(cmd):
    t0 = time.perf_counter()
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    t1 = time.perf_counter()
    if res.returncode != 0:
        print("ERROR en:", cmd)
        print("STDERR:", res.stderr)
        return None, (t1 - t0) * 1000
    
    # Extraer JSON
    out = res.stdout
    idx_start = out.find("{")
    idx_end = out.rfind("}") + 1
    data = json.loads(out[idx_start:idx_end])
    if "resultado" in data:
        data = data["resultado"]
    return data, (t1 - t0) * 1000

def main():
    print("=" * 60)
    print("🔬 COMPARACIÓN DIRECTA: MOTOR PYTHON vs MOTOR C++")
    print("=" * 60)

    cmd_py = ["python", PYTHON_CLI, "--grafo", PYTHON_GRAFO, "--puntos", PUNTOS_JSON, "--stdout", "--no-save-cache"]
    cmd_cpp = [CPP_CLI, "--grafo", CPP_GRAFO, "--puntos", PUNTOS_JSON, "--stdout", "--no-save-cache"]

    res_py, time_py = ejecutar(cmd_py)
    res_cpp, time_cpp = ejecutar(cmd_cpp)

    if not res_py or not res_cpp:
        print("❌ Error al ejecutar una de las dos versiones.")
        sys.exit(1)

    print(f"\n⏱️ TIEMPOS DE EJECUCIÓN (23 puntos GPS en todo el municipio):")
    print(f"  • Python:  {time_py:.2f} ms")
    print(f"  • C++:     {time_cpp:.2f} ms  ({time_py / time_cpp:.1f}x más rápido)")

    print(f"\n📏 DISTANCIA TOTAL CALCULADA:")
    print(f"  • Python:  {res_py['distancia_total_m']:.1f} m  ({res_py['distancia_total_km']} km)")
    print(f"  • C++:     {res_cpp['distancia_total_m']:.1f} m  ({res_cpp['distancia_total_km']} km)")

    print(f"\n📍 PUNTOS EN LA POLILÍNEA DE LA RUTA:")
    print(f"  • Python:  {len(res_py['ruta'])} coordenadas generadas")
    print(f"  • C++:     {len(res_cpp['ruta'])} coordenadas generadas")

    print(f"\n🧭 INSTRUCCIONES DE NAVEGACIÓN:")
    print(f"  • Python:  {len(res_py['instrucciones'])} pasos")
    print(f"  • C++:     {len(res_cpp['instrucciones'])} pasos")

    print(f"\n🔍 COMPARACIÓN DE LAS PRIMERAS 3 INSTRUCCIONES:")
    print("  --- PYTHON ---")
    for inst in res_py['instrucciones'][:3]:
        print(f"    - {inst['accion']} ({inst['distancia_m']} m)")
    print("  --- C++ ---")
    for inst in res_cpp['instrucciones'][:3]:
        print(f"    - {inst['accion']} ({inst['distancia_m']} m)")

    # Validar que las distancias coincidan con un margen de error < 1%
    dif_distancia = abs(res_py['distancia_total_m'] - res_cpp['distancia_total_m'])
    porcentaje_dif = (dif_distancia / res_py['distancia_total_m']) * 100

    print("\n" + "=" * 60)
    print(f"Diferencia en distancia: {dif_distancia:.2f} metros ({porcentaje_dif:.3f}%)")
    if porcentaje_dif < 0.1:
        print("✅ VERIFICACIÓN EXITOSA: Ambos motores producen resultados equivalentes.")
    else:
        print("⚠️ Advertencia: Hay diferencias notables.")
    print("=" * 60)

if __name__ == "__main__":
    main()
