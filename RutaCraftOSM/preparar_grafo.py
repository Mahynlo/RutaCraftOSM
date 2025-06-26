# preparar_grafo.py
import json
import osmnx as ox
from shapely.geometry import shape

# Asegúrate de que el archivo JSON tenga el formato y ruta correctos
with open("VillaPesqueira.json", "r", encoding="utf-8") as f:
    data = json.load(f)

polygon = shape(data["features"][0]["geometry"]) # Extrae el polígono del archivo JSON

# Cambiar simplify a False para conservar más nodos o True para simplificar el grafo
G = ox.graph_from_polygon(polygon, network_type="drive", simplify=False)

print(f"✅ Grafo creado con {len(G.nodes)} nodos y {len(G.edges)} aristas")

ox.save_graphml(G, "grafo_villa_pesqueira.graphml")
print("✅ Grafo guardado como 'grafo_villa_pesqueira.graphml'")