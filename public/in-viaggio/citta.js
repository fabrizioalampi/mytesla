/* Capoluoghi di provincia italiani (più i capoluoghi delle nuove province sarde).
   Coordinate del centro città arrotondate a due decimali (circa 1 km): bastano per
   i chilometri in linea d'aria e per la mappa del diario. Nessun servizio esterno. */
'use strict';
const CITTA = [
  // Piemonte
  ['Torino', 45.07, 7.69], ['Alessandria', 44.91, 8.61], ['Asti', 44.90, 8.21], ['Biella', 45.57, 8.05], ['Cuneo', 44.39, 7.55],
  ['Novara', 45.45, 8.62], ['Verbania', 45.92, 8.55], ['Vercelli', 45.32, 8.42],
  // Valle d'Aosta
  ['Aosta', 45.74, 7.32],
  // Lombardia
  ['Milano', 45.46, 9.19], ['Bergamo', 45.70, 9.67], ['Brescia', 45.54, 10.21], ['Como', 45.81, 9.09], ['Cremona', 45.13, 10.03],
  ['Lecco', 45.86, 9.40], ['Lodi', 45.31, 9.50], ['Mantova', 45.16, 10.79], ['Monza', 45.58, 9.27], ['Pavia', 45.19, 9.16],
  ['Sondrio', 46.17, 9.87], ['Varese', 45.82, 8.83],
  // Trentino-Alto Adige
  ['Trento', 46.07, 11.12], ['Bolzano', 46.50, 11.35],
  // Veneto
  ['Venezia', 45.44, 12.33], ['Belluno', 46.14, 12.22], ['Padova', 45.41, 11.88], ['Rovigo', 45.07, 11.79], ['Treviso', 45.67, 12.24],
  ['Verona', 45.44, 10.99], ['Vicenza', 45.55, 11.55],
  // Friuli-Venezia Giulia
  ['Trieste', 45.65, 13.78], ['Gorizia', 45.94, 13.62], ['Pordenone', 45.96, 12.66], ['Udine', 46.06, 13.24],
  // Liguria
  ['Genova', 44.41, 8.93], ['Imperia', 43.89, 8.03], ['La Spezia', 44.10, 9.82], ['Savona', 44.31, 8.48],
  // Emilia-Romagna
  ['Bologna', 44.49, 11.34], ['Ferrara', 44.84, 11.62], ['Forlì', 44.22, 12.04], ['Cesena', 44.14, 12.24], ['Modena', 44.65, 10.93],
  ['Parma', 44.80, 10.33], ['Piacenza', 45.05, 9.69], ['Ravenna', 44.42, 12.20], ['Reggio Emilia', 44.70, 10.63], ['Rimini', 44.06, 12.57],
  // Toscana
  ['Firenze', 43.77, 11.26], ['Arezzo', 43.46, 11.88], ['Grosseto', 42.76, 11.11], ['Livorno', 43.55, 10.31], ['Lucca', 43.84, 10.50],
  ['Massa', 44.04, 10.14], ['Carrara', 44.08, 10.10], ['Pisa', 43.72, 10.40], ['Pistoia', 43.93, 10.91], ['Prato', 43.88, 11.10],
  ['Siena', 43.32, 11.33],
  // Umbria
  ['Perugia', 43.11, 12.39], ['Terni', 42.56, 12.65],
  // Marche
  ['Ancona', 43.62, 13.52], ['Ascoli Piceno', 42.85, 13.58], ['Fermo', 43.16, 13.72], ['Macerata', 43.30, 13.45], ['Pesaro', 43.91, 12.91],
  ['Urbino', 43.73, 12.64],
  // Lazio
  ['Roma', 41.90, 12.50], ['Frosinone', 41.64, 13.35], ['Latina', 41.47, 12.90], ['Rieti', 42.40, 12.86], ['Viterbo', 42.42, 12.11],
  // Abruzzo
  ["L'Aquila", 42.35, 13.40], ['Chieti', 42.35, 14.17], ['Pescara', 42.46, 14.21], ['Teramo', 42.66, 13.70],
  // Molise
  ['Campobasso', 41.56, 14.66], ['Isernia', 41.59, 14.23],
  // Campania
  ['Napoli', 40.85, 14.27], ['Avellino', 40.91, 14.79], ['Benevento', 41.13, 14.78], ['Caserta', 41.07, 14.33], ['Salerno', 40.68, 14.77],
  // Puglia
  ['Bari', 41.12, 16.87], ['Barletta', 41.32, 16.28], ['Andria', 41.23, 16.29], ['Trani', 41.27, 16.42], ['Brindisi', 40.63, 17.94],
  ['Foggia', 41.46, 15.55], ['Lecce', 40.35, 18.17], ['Taranto', 40.47, 17.24],
  // Basilicata
  ['Potenza', 40.64, 15.80], ['Matera', 40.67, 16.60],
  // Calabria
  ['Catanzaro', 38.91, 16.59], ['Cosenza', 39.30, 16.25], ['Crotone', 39.08, 17.13], ['Reggio Calabria', 38.11, 15.65], ['Vibo Valentia', 38.68, 16.10],
  // Sicilia
  ['Palermo', 38.12, 13.36], ['Agrigento', 37.31, 13.58], ['Caltanissetta', 37.49, 14.06], ['Catania', 37.50, 15.09], ['Enna', 37.57, 14.28],
  ['Messina', 38.19, 15.55], ['Ragusa', 36.93, 14.73], ['Siracusa', 37.08, 15.29], ['Trapani', 38.02, 12.51],
  // Sardegna
  ['Cagliari', 39.22, 9.12], ['Sassari', 40.73, 8.56], ['Nuoro', 40.32, 9.33], ['Oristano', 39.90, 8.59], ['Carbonia', 39.17, 8.52],
  ['Iglesias', 39.31, 8.54], ['Olbia', 40.92, 9.50], ['Tempio Pausania', 40.90, 9.10], ['Tortolì', 39.93, 9.66], ['Lanusei', 39.88, 9.54],
  ['Sanluri', 39.56, 8.90], ['Villacidro', 39.46, 8.74]
].map(([nome, lat, lon]) => ({nome, lat, lon})).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
