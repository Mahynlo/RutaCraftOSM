import os
import sys
import json
import formato_rco
import pickle
import networkx as nx
import osmnx as ox
from shapely.geometry import shape
from shapely.ops import unary_union

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def exportar_grafo_binario(G, salida_bin, respetar_sentido=False):
    """
    Exporta un grafo NetworkX al formato binario RCO2 del motor C++ (ver formato_rco.py).

    Con respetar_sentido=False (comportamiento histórico) cada arista se agrega también en
    sentido contrario, por lo que se ignoran las calles de un solo sentido. Con True se
    exportan solo las aristas que trae OSMnx, que ya incluye ambos sentidos en calles de doble sentido.
    """
    nodes = list(G.nodes)
    node_to_idx = {node_id: i for i, node_id in enumerate(nodes)}
    print(f"📦 Exportando {len(nodes)} nodos a binario '{salida_bin}'...")

    adyacencia = [[] for _ in nodes]
    for u, v, data in G.edges(data=True):
        if u not in node_to_idx or v not in node_to_idx:
            continue
        u_idx, v_idx = node_to_idx[u], node_to_idx[v]
        peso = float(data.get("length", 1.0))

        nombre = data.get("name", "")
        if isinstance(nombre, list):
            nombre = nombre[0] if nombre else ""
        if not isinstance(nombre, str):
            nombre = ""

        adyacencia[u_idx].append((v_idx, peso, nombre))
        if not respetar_sentido:
            adyacencia[v_idx].append((u_idx, peso, nombre))

    grafo = formato_rco.Grafo(
        osm_ids=[int(n) for n in nodes],
        coords=[(float(G.nodes[n]['y']), float(G.nodes[n]['x'])) for n in nodes],
        adyacencia=adyacencia,
        dirigido=respetar_sentido,
    )
    formato_rco.escribir_rco2(salida_bin, grafo)
    print(f"✅ Grafo binario RCO2 guardado en '{salida_bin}'")

def exportar_grafo_json(G, salida_json):
    """
    Exporta el grafo a formato JSON para inspección o debugging.
    """
    nodes = list(G.nodes)
    coords = {str(n): [float(G.nodes[n]['y']), float(G.nodes[n]['x'])] for n in nodes}
    adj_list = {str(n): [] for n in nodes}

    for u, v, data in G.edges(data=True):
        peso = float(data.get("length", 1.0))
        nombre = data.get("name", "desconocida")
        if isinstance(nombre, list):
            nombre = nombre[0] if len(nombre) > 0 else "desconocida"
        if not isinstance(nombre, str):
            nombre = "desconocida"

        tipo = data.get("highway", "road")
        if isinstance(tipo, list):
            tipo = tipo[0] if len(tipo) > 0 else "road"
        if not isinstance(tipo, str):
            tipo = "road"

        adj_list[str(u)].append([str(v), peso, nombre, tipo])
        adj_list[str(v)].append([str(u), peso, nombre, tipo])

    with open(salida_json, "w", encoding="utf-8") as f:
        json.dump({"coords": coords, "adj_list": adj_list}, f, indent=2, ensure_ascii=False)

    print(f"✅ Grafo JSON guardado en '{salida_json}'")

def exportar_grafo_pkl(G, salida_pkl):
    nodes = list(G.nodes)
    coords = {str(n): (float(G.nodes[n]['y']), float(G.nodes[n]['x'])) for n in nodes}
    adj_list = {str(n): [] for n in nodes}

    for u, v, data in G.edges(data=True):
        peso = float(data.get("length", 1.0))
        adj_list[str(u)].append((str(v), peso))
        adj_list[str(v)].append((str(u), peso))

    with open(salida_pkl, "wb") as f:
        pickle.dump((adj_list, coords), f)

    print(f"✅ Grafo Pickle guardado en '{salida_pkl}'")

def procesar_grafo_desde_geojson(geojson_path, salida_bin, salida_json=None, salida_pkl=None):
    if not os.path.exists(geojson_path):
        print(f"❌ Error: {geojson_path} no existe.")
        return

    print(f"🔄 Cargando polígonos desde '{geojson_path}'...")
    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    polygons = [shape(feature["geometry"]) for feature in data["features"]]
    union_polygon = unary_union(polygons)

    print("🛣️ Descargando/creando red de calles con OSMnx...")
    G = ox.graph_from_polygon(union_polygon, network_type="drive", simplify=False)
    print(f"✅ Grafo extraído: {len(G.nodes)} nodos, {len(G.edges)} aristas")

    os.makedirs(os.path.dirname(salida_bin) if os.path.dirname(salida_bin) else ".", exist_ok=True)
    exportar_grafo_binario(G, salida_bin)

    if salida_json:
        exportar_grafo_json(G, salida_json)
    if salida_pkl:
        exportar_grafo_pkl(G, salida_pkl)

if __name__ == "__main__":
    geojson = os.path.join("geodatos", "mazatan_villapesqueira.geojson")
    salida_bin = os.path.join("grafos", "grafo_mazatan_villapesqueira.bin")
    salida_json = os.path.join("grafos", "grafo_mazatan_villapesqueira.json")
    salida_pkl = os.path.join("grafos", "grafo_mazatan_villapesqueira.pkl")

    procesar_grafo_desde_geojson(geojson, salida_bin, salida_json, salida_pkl)
