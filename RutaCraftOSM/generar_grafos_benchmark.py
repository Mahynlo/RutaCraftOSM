"""
Descarga el grafo vial de la ciudad de Hermosillo para medir el rendimiento del motor C++
en una ciudad con muchas calles (el grafo de producción solo cubre Mazatán - Villa Pesqueira).

    uv run python generar_grafos_benchmark.py

Genera en grafos/benchmark/ (ignorado por git):
  - grafo_hermosillo.bin           formato actual (cada arista también en sentido contrario)
  - grafo_hermosillo_dirigido.bin  respeta las calles de un solo sentido
"""
import os
import sys
import time
import osmnx as ox

from preparar_grafo import exportar_grafo_binario

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SALIDA_DIR = os.path.join("grafos", "benchmark")

# Zona urbana de Hermosillo (el municipio completo llega hasta Bahía de Kino)
HERMOSILLO_BBOX = (-111.10, 28.97, -110.86, 29.21)  # (oeste, sur, este, norte)


def main():
    ox.settings.requests_timeout = 600
    t0 = time.perf_counter()
    G = ox.graph_from_bbox(HERMOSILLO_BBOX, network_type="drive", simplify=False)
    print(f"✅ Hermosillo: {len(G.nodes)} nodos, {len(G.edges)} aristas "
          f"(descarga {time.perf_counter() - t0:.0f} s)")

    unico = sum(1 for _, _, d in G.edges(data=True) if d.get("oneway") is True)
    print(f"🚦 Aristas de un solo sentido: {unico} de {len(G.edges)} ({100 * unico / len(G.edges):.1f}%)")

    os.makedirs(SALIDA_DIR, exist_ok=True)
    for sufijo, respetar in (("", False), ("_dirigido", True)):
        salida = os.path.join(SALIDA_DIR, f"grafo_hermosillo{sufijo}.bin")
        exportar_grafo_binario(G, salida, respetar_sentido=respetar)
        print(f"📦 {salida}: {os.path.getsize(salida) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
