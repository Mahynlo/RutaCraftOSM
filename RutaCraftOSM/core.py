import math
import sys
import os
import networkx as nx
import osmnx as ox
from geopy.distance import geodesic


# =========================
# |      FUNCIONES        |
# =========================

def heuristica_geodesica(u, v, G):
    """Calcula la distancia geodésica entre dos nodos del grafo G.

    Args:
        u (_type_): Esta es la instancia del nodo de origen en el grafo G.
        v (_type_): Esta es la instancia del nodo de destino en el grafo G.
        G (_type_): Esta es la instancia del grafo de OSMnx que contiene los nodos y sus coordenadas.

    Returns:
        _type_:   Devuelve la distancia geodésica entre los nodos u y v en metros.
    """
    lat1, lon1 = G.nodes[u]['y'], G.nodes[u]['x']
    lat2, lon2 = G.nodes[v]['y'], G.nodes[v]['x']
    
    return geodesic((lat1, lon1), (lat2, lon2)).meters

def cargar_grafo_desde_archivo(path=None): #si  no se especifica, usa el grafo por defecto 
    print(f">>> Cargando grafo desde: {path}")
    """Carga el grafo desde un archivo GraphML y lo convierte a no dirigido.

    Args:
        path (str, optional):  Ruta al archivo GraphML. Defaults to "grafo_villa_pesqueira.graphml".

    Returns:
        _type_:  Grafo de OSMnx cargado y convertido a no dirigido.
    """
    if path:
        final_path = path
    else:
        grafo_por_defecto = "grafo_villa_pesqueira.graphml"
        # Detectar si está ejecutándose desde PyInstaller
        if getattr(sys, 'frozen', False):
            base_path = sys._MEIPASS
        else:
            base_path = os.path.abspath(".")

        final_path = os.path.join(base_path, grafo_por_defecto)

    print(f">>> Cargando grafo desde: {final_path}")
    G = ox.load_graphml(final_path)
    G = G.to_undirected()
    return G


def construir_ruta_con_aproximacion(G, puntos_gps, max_dist_fuera_calle=10):
    print(f">>> Construyendo ruta aproximada entre {len(puntos_gps)} puntos GPS")
    """Calcula una ruta aproximada entre puntos GPS dados, utilizando el grafo de OSMnx.

    Args:
        G (_type_):  Grafo de OSMnx que representa la red vial.
        puntos_gps (_type_):  Lista de tuplas con coordenadas GPS (latitud, longitud).
        max_dist_fuera_calle (int, optional):   Distancia máxima permitida fuera de la calle para considerar un punto GPS. Defaults to 10.

    Returns:
        _type_:   Una tupla con dos elementos:
            - Una lista de nodos que componen la ruta aproximada.
            - Una lista de conexiones verdes (puntos GPS que están fuera de la calle).
    """
    nodos = []
    conexiones_verdes = []
    ruta_nodos = []

    for i, punto in enumerate(puntos_gps):
        nodo_cercano = ox.distance.nearest_nodes(G, punto[1], punto[0])
        nodo_coord = (G.nodes[nodo_cercano]['y'], G.nodes[nodo_cercano]['x'])
        distancia = geodesic(punto, nodo_coord).meters
        nodos.append(nodo_cercano)

        if i > 0:
            try:
                segmento = nx.astar_path(
                    G,
                    nodos[i - 1],
                    nodos[i],
                    heuristic=lambda u, v: heuristica_geodesica(u, v, G),
                    weight="length"
                )
                if i == 1:
                    ruta_nodos.extend(segmento)
                else:
                    ruta_nodos.extend(segmento[1:])
            except nx.NetworkXNoPath:
                print(f"No hay ruta entre {nodos[i-1]} y {nodos[i]}")

        if distancia > max_dist_fuera_calle:
            conexiones_verdes.append((nodo_coord, punto))

    return ruta_nodos, conexiones_verdes



def calcular_instrucciones_con_calles(G, ruta_nodos):
    print(f">>> Calculando instrucciones para la ruta de {len(ruta_nodos)} nodos")
    """Calcula las instrucciones de la ruta dada una lista de nodos.

    Args:
        G (_type_): Grafo de OSMnx en formato no dirigido
        ruta_nodos (_type_):  Lista de nodos que componen la ruta

    Returns:
        _type_: Instrucciones de la ruta y distancia total
    """
    instrucciones = []
    distancia_total = 0

    def angulo(a, b):
        return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))

    anterior = None
    for i in range(1, len(ruta_nodos) - 1):
        u, v, w = ruta_nodos[i - 1], ruta_nodos[i], ruta_nodos[i + 1]
        coord_u = (G.nodes[u]['y'], G.nodes[u]['x'])
        coord_v = (G.nodes[v]['y'], G.nodes[v]['x'])
        coord_w = (G.nodes[w]['y'], G.nodes[w]['x'])

        dist = geodesic(coord_v, coord_w).meters
        distancia_total += dist

        ang1 = angulo(coord_u, coord_v)
        ang2 = angulo(coord_v, coord_w)
        giro = (ang2 - ang1 + 360) % 360

        if giro < 30 or giro > 330:
            accion = "Sigue recto"
        elif giro < 180:
            accion = "Gira a la derecha"
        else:
            accion = "Gira a la izquierda"

        nombre_calle = "calle sin nombre"
        edge_data = G.get_edge_data(v, w) or G.get_edge_data(w, v)
        if edge_data:
            for key in edge_data:
                nombre_calle = edge_data[key].get("name", "calle sin nombre")
                if nombre_calle != "calle sin nombre":
                    break

        actual = {
            "accion": accion,
            "calle": nombre_calle,
            "desde": coord_v,
            "hacia": coord_w,
            "distancia_m": round(dist, 1)
        }

        if anterior and anterior["accion"] == actual["accion"] and anterior["calle"] == actual["calle"]:
            anterior["distancia_m"] += actual["distancia_m"]
            anterior["hacia"] = actual["hacia"]
        else:
            if anterior:
                instrucciones.append(anterior)
            anterior = actual

    if anterior:
        instrucciones.append(anterior)

    return instrucciones, round(distancia_total, 1)


