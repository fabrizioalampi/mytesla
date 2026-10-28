# Crediti di In viaggio

Tutto quello che l'app usa è in questa cartella: durante l'uso non si collega a
nessun servizio esterno.

## Mappa dell'Italia

- **Fonte:** Natural Earth, *Admin 0 Countries* in scala 1:50m, versione 5.1.2
  (file `ne_50m_admin_0_countries.geojson` del repository
  [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector)).
- **Licenza:** pubblico dominio. Dal `LICENSE.md` del repository: "Everything here is
  public domain. [...] You may use the maps in any manner, including modifying the
  content and design". Vedi [naturalearthdata.com/about/terms-of-use](https://www.naturalearthdata.com/about/terms-of-use/).
- **Modifiche:** estratto il solo poligono dell'Italia (isole comprese), tenuto il bordo
  esterno (senza i buchi di San Marino e Città del Vaticano) e arrotondate le
  coordinate a 0,001 gradi. File: `italia.js`, scaricato il 28 ottobre 2026.

Made with Natural Earth.

## Elenco delle città

`citta.js`: capoluoghi di provincia con coordinate approssimate a due decimali,
compilate per questa app (fatti geografici, nessuna banca dati copiata).

## Carattere

- **Nunito**, di The Nunito Project Authors ([googlefonts/nunito](https://github.com/googlefonts/nunito)).
- **Licenza:** SIL Open Font License 1.1, testo completo in `font/OFL.txt`.
- **File:** `font/nunito-latin.woff2`, sottoinsieme latino distribuito da Google Fonts,
  copiato qui per funzionare senza connessione.

## Suoni

Tutti i suoni sono generati nel browser da `suoni.js` con le Web Audio API
(oscillatori, rumore e filtri): non ci sono registrazioni né campioni. Le brevi
melodie (fanfara, "ta-dan", "siamo arrivati", "evviva", arpa) sono scritte per
questa app. Nessun suono viene da film, programmi TV, videogiochi o canzoni.

La frase "Siamo arrivati!" usa la sintesi vocale del browser solo se ha una voce
italiana; altrimenti suona soltanto la melodia.

## Codice QR

- **qrcode-generator** 2.0.4 di Kazuhiko Arase ([kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)).
- **Licenza:** MIT, testo completo in `qrcode-LICENSE.txt`. File: `qrcode.js` (dist del pacchetto npm, non modificato).
- "QR Code" è un marchio registrato di DENSO WAVE INCORPORATED.

## Icone e disegni

Icone del bingo, del memory, dei suoni, degli stati d'animo e dei riquadri: disegnate
in SVG per questa app.

## Domande del quiz

`quiz-domande.js`: 315 domande scritte apposta per questa app, controllate una per una.
