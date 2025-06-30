import osmnx as ox
import geopandas as gpd
import json
from shapely.geometry import shape
from shapely.ops import unary_union
import networkx as nx
import pickle
import os

def obtener_poligonos_y_guardar_geojson(lugares, salida_geojson):
    """
    Obtiene los polígonos de las regiones listadas y guarda un archivo GeoJSON combinado.
    """
    print("🔍 Obteniendo polígonos de lugares...")
    gdf = ox.geocode_to_gdf(lugares)
    
    #se crea una carpeta geodatos/ si no existe
    os.makedirs("geodatos/", exist_ok=True)
    salida_geojson_carp = os.path.join("geodatos", salida_geojson) # ruta completa del archivo GeoJSON
    
    gdf.to_file(salida_geojson_carp, driver="GeoJSON")
    print(f"✅ Archivo GeoJSON combinado guardado como geodatos/'{salida_geojson_carp}'")

def crear_grafo_desde_geojson(salida_geojson, salida_graphml):
    """
    Carga un GeoJSON con varias regiones, une sus polígonos y crea un grafo de calles.
    """
    print("🔄 Cargando GeoJSON y uniendo polígonos...")
    # se busca en la carpeta geodatos/ el archivo GeoJSON si existe ese archivo con ese nombre
    salida_geojson = os.path.join("geodatos", salida_geojson) # ruta completa del archivo GeoJSON
    if not os.path.exists(salida_geojson):
        print(f"❌ Error: El archivo '{salida_geojson}' no existe. Asegúrate de haberlo generado previamente.")
        return
    with open(salida_geojson, "r", encoding="utf-8") as f:
        data = json.load(f)

    polygons = [shape(feature["geometry"]) for feature in data["features"]]
    union_polygon = unary_union(polygons)

    print("🛣️ Creando grafo de calles del área combinada...")
    G = ox.graph_from_polygon(union_polygon, network_type="drive", simplify=False)

    print(f"✅ Grafo creado con {len(G.nodes)} nodos y {len(G.edges)} aristas")
    
    # se crea una carpeta grafos/ si no existe 
    os.makedirs("grafos/", exist_ok=True)
    salida_graphml_carp = os.path.join("grafos", salida_graphml) # ruta completa del archivo GraphML

    ox.save_graphml(G, salida_graphml_carp)
    print(f"✅ Grafo guardado como '{salida_graphml_carp}'")

def convertir_a_lista_adyacencia(path_graphml, salida_pkl):
    """
    Convierte un grafo GraphML a una lista de adyacencia con pesos y guarda un archivo pickle.
    """
    print("🔄 Leyendo grafo y convirtiendo a lista de adyacencia...")
    #se busca en la carpeta grafos/ el archivo GraphML si existe ese archivo con ese nombre
    path_graphml = os.path.join("grafos", path_graphml) # ruta completa
    if not os.path.exists(path_graphml):
        print(f"❌ Error: El archivo '{path_graphml}' no existe. Asegúrate de haberlo generado previamente.")
        return
    G = nx.read_graphml(path_graphml)
    G = G.to_undirected()
    adj_list = {}
    coords = {}

    for node in G.nodes:
        coords[node] = (float(G.nodes[node]['y']), float(G.nodes[node]['x']))
        adj_list[node] = []

    for u, v, data in G.edges(data=True):
        peso = float(data.get("length", 1))
        adj_list[u].append((v, peso))
        adj_list[v].append((u, peso))  # grafo no dirigido
        
        
    # se crea una carpeta grafos/ si no existe
    os.makedirs("grafos/", exist_ok=True)
    salida_pkl_carp = os.path.join("grafos", salida_pkl) # ruta completa del archivo pickle

    with open(salida_pkl_carp, "wb") as f:
        pickle.dump((adj_list, coords), f)

    print(f"✅ Guardado como '{salida_pkl_carp}' con {len(adj_list)} nodos y {sum(len(v) for v in adj_list.values()) // 2} aristas (sin duplicados)")

if __name__ == "__main__":
    lugares = ["Mazatán, Sonora, México", "Villa Pesqueira, Sonora, México"] # lista de lugares a combinar y extraer polígonos de limites geográficos
    archivo_geojson = "mazatan_villapesqueira.geojson" # archivo GeoJSON de salida y donde se guardarán los polígonos combinados de su area politica 
    archivo_graphml = "grafo_mazatan_villapesqueira.graphml"
    archivo_pkl = "grafo_mazatan_villapesqueira.pkl"

    obtener_poligonos_y_guardar_geojson(lugares, archivo_geojson) #se obtiene los polígonos de los lugares y se guarda en un archivo GeoJSON
    crear_grafo_desde_geojson(archivo_geojson, archivo_graphml)
    convertir_a_lista_adyacencia(archivo_graphml, archivo_pkl)


