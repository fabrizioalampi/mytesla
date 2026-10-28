# My Tesla

App per auto Tesla che girano interamente nel browser, online su
**https://mytesla.fabrizioalampi.it**. La pagina iniziale elenca le app; ognuna
vive nella sua cartella ed è indipendente dalle altre.

| App | Indirizzo |
| --- | --- |
| Light Show Studio | https://mytesla.fabrizioalampi.it/light-show/ |
| Wrap Studio | https://mytesla.fabrizioalampi.it/wrap-studio/ |

## Light Show Studio

Carichi un brano, scegli quali luci e chiusure animare e il generatore costruisce
la coreografia sui beat. Poi la ritocchi sulla timeline, controlli i limiti di
Tesla nella scheda **Verifica** e scarichi uno ZIP con la cartella `LightShow`
pronta per la chiavetta USB.

Tutto gira nel browser: niente account, niente server, la musica non lascia il
tuo computer.

### Cosa fa

- Timeline con aggancio ai beat, registrazione live da tastiera, annulla/ripeti,
  copia/incolla e scorciatoie come in xLights.
- Anteprima schematica del veicolo, fronte e retro, con luci e chiusure.
- Analisi del brano (BPM, beat, energia) e coreografia automatica in tre stili.
- 48 canali standard; light bar del Cybertruck e luci interne RGB portano il
  file a 200 canali.
- Controllo dei limiti di comandi per specchietti, finestrini, portellone,
  sportello di ricarica e porte.
- Export `.fseq` versione 2 non compresso più l'audio in WAV 44,1 kHz;
  salvataggio e apertura del progetto in JSON; import di show `.fseq` esistenti.

### Sulla chiavetta

1. Formatta la chiavetta in exFAT o FAT32.
2. Estrai lo ZIP nella radice: deve esserci `LightShow/` con `.fseq` e `.wav`
   dallo stesso nome.
3. Sull'auto: Toybox, Light Show, Programma show.

## Wrap Studio

Crea in un minuto una wrap per il Paint Shop: scegli l'auto, uno stile
(tinta unita, sfumatura, strisce racing, mimetiche, righe, pois, carbonio,
scacchi, maculato, esagoni, pixel art), i colori, e salva il PNG. Testo, logo e
disegno a mano sono nel pannello **Personalizza**. Il PNG è ritagliato sulla
forma dei pannelli, pesa meno di 1 MB (se serve la risoluzione scende da sola,
mai sotto i 512 pixel) e ha un nome valido per Tesla. La raccolta tiene fino a
10 wrap e le scarica in uno ZIP con la cartella `Wraps/`.

I template sono quelli ufficiali di [teslamotors/custom-wraps](https://github.com/teslamotors/custom-wraps).
Il repository non ha una licenza, quindi qui non vengono copiati: li scarica il
browser direttamente da `raw.githubusercontent.com`, da un commit fissato in
`public/wrap-studio/styles.js`, e li tiene in cache in IndexedDB.

## Struttura

```
public/
  index.html, home.css   pagina iniziale con le schede delle app
  favicon.svg, 404.html
  _headers               header di sicurezza: CSP stretta di base, una CSP per app
  light-show/
    index.html           pagina dell'app
    app.css              stili
    core.js              mappa dei canali, rendering dei frame, lettura/scrittura .fseq,
                         simulazione del veicolo, analisi dei beat, coreografia automatica
    app.js               interfaccia: timeline, anteprima, pannelli, export
    jszip.min.js         JSZip 3.10.1 (MIT o GPLv3), per creare lo ZIP
  wrap-studio/
    index.html, app.css  pagina e stili
    styles.js            modelli, tavolozze, stili generati via codice, regole sul nome
    app.js               anteprima, export PNG sotto 1 MB, raccolta e ZIP, testo, logo, pennello
    jszip.min.js         copia di JSZip per lo ZIP della raccolta
wrangler.jsonc           Worker Cloudflare con soli file statici su mytesla.fabrizioalampi.it
```

Per aggiungere un'app: una cartella nuova in `public/`, una scheda in
`public/index.html` e, se servono permessi in più, un blocco nel file `_headers`
con `! Content-Security-Policy` seguito dalla CSP dell'app.

## Sviluppo e pubblicazione

```
npm install
npm run dev      # http://localhost:8787
npm run deploy   # pubblica su Cloudflare
```

Non è un prodotto Tesla e non è affiliato a Tesla, Inc. Usalo da fermo e in un
luogo adatto.

## Licenza

MIT, vedi `LICENSE`. JSZip mantiene la propria licenza.
