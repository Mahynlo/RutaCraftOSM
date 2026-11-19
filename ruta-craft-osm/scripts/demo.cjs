const fs = require("fs");
const path = require("path");
const { calcularRuta } = require("../dist/index.js");

async function test() {
  console.log("🚀 Iniciando test de calcularRuta...");
  console.time("⏱ Tiempo de ejecución de calcularRuta");

  try {
    const resultado = await calcularRuta({
      puntos: [
        [29.065639, -110.056448],
        [29.062039, -110.059091],
        [29.061682, -110.059015],
        [29.061276, -110.058870],
        [29.060744, -110.058027],
        [29.060509, -110.057231],
        [29.060145, -110.055659],
        [29.060063, -110.055008],
        [29.059944, -110.054195],
        [29.059486, -110.053973],
        [29.118091, -109.970340],
        [29.116921, -109.970124],
        [29.116096, -109.969460],
        [29.116296, -109.967458],
        [29.118919, -109.967351],
        [29.119370, -109.966383],
        [29.118387, -109.965645],
        [29.117673, -109.965502],
        [29.117723, -109.964234],
        [29.117661, -109.963281],
        [29.118036, -109.963116],
        [29.118406, -109.963166],
        [29.118781, -109.963116]
      ],
      // grafo: "grafo_mazatan_villapesqueira.pkl",
      // saveCache: false,
      cachePath: "./cache_resultado.json",
    });

    if (!resultado || !resultado.resultado || !resultado.resultado.ruta || resultado.resultado.ruta.length === 0) {
      //console.error("❌ Resultado completo:", resultado);
      throw new Error("Resultado inválido: la ruta está vacía");
    }


    console.log("✅ Resultado recibido:");
    console.log(JSON.stringify(resultado.resultado, null, 2));

    // Guardar cache en JSON
    if (resultado.cache) {
      const cacheFilePath = path.join(__dirname, "cache_resultado.json");
      fs.writeFileSync(cacheFilePath, JSON.stringify(resultado.cache, null, 2), "utf-8");
      console.log(`💾 Cache guardado en: ${cacheFilePath}`);
    } else {
      console.log("⚠️ No se recibió cache para guardar.");
    }


  } catch (e) {
    console.error("❌ Error:", e.message || e);
  } finally {
    console.timeEnd("⏱ Tiempo de ejecución de calcularRuta");
  }
}

test();









