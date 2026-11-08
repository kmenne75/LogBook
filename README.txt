WORKOUT LOG — PWA v1.1
======================

FUNZIONI
- Configurazione esercizi associabili a uno o più Work Day (WD1-WD12).
- Ordine distinto per ciascun Work Day, modificabile con numero, pulsanti o trascinamento.
- Maniglia di trascinamento con 6 punti disposti in due colonne da 3, compatibile con touch e mouse.
- Misura attrezzo, recupero, serie predefinite, target ripetizioni e note.
- Esercizi archiviabili senza perdita dello storico; archivio nascosto fino alla pressione del pulsante.
- Una sola sessione al giorno.
- Preselezione del WD numericamente successivo all’ultimo eseguito, con rotazione sui WD disponibili.
- Precompilazione di peso e ripetizioni: massimo peso storico e massimo numero di ripetizioni ottenuto con quel peso.
- Timer di recupero per esercizio.
- Analisi di massimi, ripetizioni, volume, 1RM stimato, variazione dell’ultima sessione e grafici storici.
- Backup e restore JSON e CSV.
- Promemoria settimanale; destinazione semiautomatica sui browser che supportano File System Access.
- Funzionamento offline tramite service worker e dati locali IndexedDB.

PUBBLICAZIONE SU GITHUB PAGES
1. Estrarre tutti i file mantenendo la struttura.
2. Caricare il contenuto nella radice di un repository GitHub.
3. In Settings > Pages scegliere il branch e la cartella radice.
4. Aprire l’indirizzo HTTPS assegnato da GitHub Pages.
5. Dopo il primo caricamento online, l’app può funzionare offline.

INSTALLAZIONE ANDROID
- Aprire l’indirizzo HTTPS in Chrome.
- Usare il pulsante “Installa” dell’app oppure “Aggiungi a schermata Home” dal menu del browser.

INSTALLAZIONE IOS / IPADOS
- Aprire l’indirizzo HTTPS in Safari.
- Toccare Condividi e scegliere “Aggiungi alla schermata Home”.
- Il backup verso una destinazione persistente dipende dalle funzioni offerte dal browser; Condividi JSON resta disponibile.

DATI E BACKUP
I dati sono salvati esclusivamente nel browser del dispositivo. La cancellazione dei dati del sito o del browser può eliminarli. Eseguire regolarmente un backup JSON.

NOTA SUL WORK DAY
La sessione salva il WD eseguito, ma lo storico dell’esercizio non dipende dal WD. Spostare un esercizio da un WD a un altro non modifica né frammenta le prestazioni precedenti.


NOVITÀ VERSIONE 1.1
- Riordino diretto degli esercizi dentro ogni Work Day tramite trascinamento.
- Maniglia dedicata a sei punti per evitare spostamenti accidentali.
- Salvataggio automatico dell’ordine al rilascio.
- Pulsanti su/giù come alternativa accessibile al drag-and-drop.
- Compatibilità completa con database e backup della versione 1.0.
