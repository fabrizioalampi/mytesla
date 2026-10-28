# Light Show Studio

Editor nel browser per creare light show personalizzati per auto Tesla.
Online su **https://mytesla.fabrizioalampi.it**.

Carichi un brano, scegli quali luci e chiusure animare e il generatore costruisce
la coreografia sui beat. Poi la ritocchi sulla timeline, controlli i limiti di
Tesla nella scheda **Verifica** e scarichi uno ZIP con la cartella `LightShow`
pronta per la chiavetta USB.

Tutto gira nel browser: niente account, niente server, la musica non lascia il
tuo computer.

## Cosa fa

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

## Sulla chiavetta

1. Formatta la chiavetta in exFAT o FAT32.
2. Estrai lo ZIP nella radice: deve esserci `LightShow/` con `.fseq` e `.wav`
   dallo stesso nome.
3. Sull'auto: Toybox, Light Show, Programma show.

## Struttura

```
public/
  index.html     pagina dell'app
  app.css        stili
  core.js        mappa dei canali, rendering dei frame, lettura/scrittura .fseq,
                 simulazione del veicolo, analisi dei beat, coreografia automatica
  app.js         interfaccia: timeline, anteprima, pannelli, export
  jszip.min.js   JSZip 3.10.1 (MIT o GPLv3), per creare lo ZIP
  _headers       header di sicurezza (CSP) per Cloudflare
wrangler.jsonc   Worker Cloudflare con soli file statici sul dominio mytesla.fabrizioalampi.it
```

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
