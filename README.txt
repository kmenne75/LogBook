WORKOUT LOG — PWA v2.0
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


NOVITÀ VERSIONE 1.2
- Volume totale del Work Day aggiornato in tempo reale e mostrato al salvataggio.
- Richiesta di mantenimento dello schermo acceso durante l’uso, sui browser compatibili.
- Timer con segnale acustico, vibrazione e indicazione visiva alla scadenza.
- Condivisione JSON più robusta su smartphone, con messaggio e download automatico di riserva.
- Compatibilità completa con database e backup delle versioni 1.0 e 1.1.

NOTA DISPLAY E AUDIO
Il mantenimento dello schermo acceso dipende dal supporto e dalle autorizzazioni del browser. Il suono del timer viene inizializzato dopo un’interazione dell’utente, come richiesto dai browser mobili.


NOVITÀ v1.3
- Interfaccia mobile più compatta per tracciatura e configurazione.
- Campi affiancati e schede esercizio a minore occupazione verticale.
- Barra azioni persistente con Elimina, Salva e Timer.
- Il Timer usa sempre i secondi di recupero configurati per l’esercizio attivo.
- L’esercizio attivo cambia toccando o compilando la relativa scheda.
- Eliminazione allenamento protetta dalla digitazione obbligatoria di CANCELLA.
- Database invariato e compatibile con i dati delle versioni precedenti.

CORREZIONE v1.3.1
- Condividi JSON prova sia application/json sia text/plain mantenendo l'estensione .json.
- Il payload di condivisione contiene solo il file, per maggiore compatibilità mobile.
- Il pulsante Condividi JSON non avvia più automaticamente il download.
- Se la condivisione nativa non è supportata, viene indicato di usare Esporta JSON.

AGGIORNAMENTO v1.4
- Aggiornamento offline rafforzato con download forzato dei file applicativi.
- Il nuovo service worker si attiva subito e prende il controllo delle finestre aperte.
- Le vecchie cache vengono eliminate durante l'attivazione.
- La pagina principale usa la rete come priorità e la cache solo quando offline.
- CSS e JavaScript hanno identificativi di versione per evitare copie precedenti.
- La registrazione del service worker ignora la cache HTTP e controlla subito gli aggiornamenti.
- Database locale invariato e compatibile con tutte le versioni precedenti.

NOVITÀ v1.5
- La barra orizzontale delle schede è stata sostituita da un menu hamburger in alto a destra.
- Le sezioni sono mostrate in un elenco verticale con evidenza della sezione attiva.
- Il menu si chiude dopo la selezione, toccando lo sfondo oppure premendo Esc.
- Il comando Installa app è integrato nel menu quando disponibile.
- Su smartphone il badge di connessione è nascosto per lasciare spazio al menu.
- Funzioni, database, condivisione JSON e aggiornamento offline restano invariati.

NOVITÀ v1.6
- Analisi: eliminata la metrica Max reps dalla tabella e dal dettaglio.
- Max kg mostra la data più recente in cui è stato raggiunto il record.
- Max volume singola serie è calcolato serie per serie come peso × ripetizioni e mostra la data del record.
- Il grafico del peso massimo non sovrappone più le ripetizioni.
- Aggiunto il grafico del massimo volume ottenuto in una singola serie per sessione.
- Mantenuto separatamente il grafico del volume totale della sessione.
- Storico esercizio ampliato con max volume serie e volume sessione.
- Database locale invariato e compatibile con le versioni precedenti.


NOVITÀ v2.0
- Barra Cancella, Salva e Timer spostata nella parte alta della schermata di tracciamento.
- Barra sticky sempre visibile durante lo scorrimento, senza interferire con la tastiera virtuale.
- Rimossa la barra fissa in basso e il relativo spazio riservato su smartphone.
- Data, Work Day, riepilogo, schede esercizio, serie e note resi più compatti.
- Più serie ed esercizi visibili nello stesso viewport, mantenendo i controlli touch.
- Database locale invariato e compatibile con tutte le versioni precedenti.
- Cache offline e asset aggiornati alla versione 2.0.0.
