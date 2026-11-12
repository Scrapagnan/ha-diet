# HA Shared Diet - Design

Data: 2026-11-09

## Intento

Gestire in Home Assistant le diete (compilate a mano, tipicamente da un nutrizionista) di N componenti della famiglia. Chiunque in casa deve poter consultare e modificare qualsiasi dieta in ogni momento, principalmente dall'app HA Companion sul telefono. La dieta deve poi alimentare la vita quotidiana: cosa mangio adesso/dopo, promemoria, lista della spesa.

## Obiettivi

- N profili, ognuno con la propria dieta.
- Dieta = schema settimanale (Lun–Dom) che si ripete; ogni giorno ha un numero variabile di pasti.
- Pasti con alimenti strutturati e alternative ("OPPURE").
- Modifica da qualsiasi utente HA, anche non admin.
- Sensori per automazioni + promemoria pre-pasto configurabili.
- Generazione lista spesa su intervallo di date, inviata a una lista To-do di HA.

## Non-obiettivi (per ora)

- Spunta dei pasti effettivamente consumati / diario.
- Calorie, macronutrienti, database alimenti.
- Import da PDF/foto della dieta.
- Storico modifiche / audit (vale l'ultima versione).
- Cicli diversi dalla settimana (es. 14/28 giorni).

## Anti-obiettivi

- Non deve essere scomodo da telefono: modifica di un pasto in pochi tocchi.
- Non deve richiedere YAML o configurazione manuale per l'uso quotidiano.
- Non deve perdere dati se due persone modificano contemporaneamente (vedi Vincoli).

## Forma (decisa dal builder, approvata dall'utente come "decidi tu")

- Integrazione custom (`custom_components/`) distribuita via **HACS** (l'utente usa HACS).
- **Pannello laterale dedicato** (frontend custom registrato dall'integrazione), visibile a tutti gli utenti (non `require_admin`).
- UI in **italiano**.
- Entità/sensori esposte per automazioni.

## Modello concettuale

### Profilo
- Nome libero (obbligatorio).
- Collegamento **opzionale** a un'entità `person.*` di HA (permette profili per chi non ha account, es. bambini).
- Impostazioni promemoria: attivo sì/no, minuti di anticipo, servizio `notify.*` di destinazione.

### Schema settimanale
- 7 giorni (Lun–Dom). Ogni giorno: lista ordinata di pasti, numero variabile (anche 0).

### Pasto
- Nome libero (es. "Colazione", "Spuntino").
- Orario **opzionale**.
- Contenuto in uno di due modi (servono entrambi):
  - **Lista di righe alimento**; ogni riga può avere alternative a livello singolo alimento (es. "80 g pasta integrale OPPURE 80 g riso").
  - **Opzioni di pasto intero** (Opzione A / Opzione B / …), ciascuna con la propria lista di righe alimento (che a loro volta possono avere alternative per alimento).

### Riga alimento
- Nome alimento, quantità **numerica opzionale**, unità (es. g, ml, pz, cucchiaio), **nota opzionale** (es. "q.b.", "a piacere").
- Righe senza quantità numerica vanno in spesa senza totale (una sola riga per alimento).
- L'editor suggerisce nomi alimento già usati (autocompletamento) per mantenerli coerenti - necessario per sommare correttamente nella spesa. **[scelta del builder]**

### Eccezioni per data
- Per una data specifica e un profilo si può sovrascrivere il giorno (aggiungere/togliere/modificare pasti) senza toccare lo schema settimanale.
- Il giorno effettivo di una data = eccezione se esiste, altrimenti giorno dello schema.

### Scelta delle alternative
- Due livelli, entrambi sceglibili: opzione del pasto intero (A/B/…) **e** voce nelle righe alimento con "OPPURE".
- **Default per pasto dello schema**: l'utente sceglie una volta per un pasto dello schema (es. "colazione del lunedì") e vale per tutte le date corrispondenti.
- **Ritocco per data**: su una data precisa si può sovrascrivere la scelta di default.
- Flusso tipico: l'utente seleziona un intervallo di date (da–a), vede i pasti con alternative e conferma/cambia le scelte.
- La scelta **diventa il piano** di quella data: vista "oggi", sensori e notifiche mostrano l'opzione scelta. Le altre opzioni restano consultabili.
- Se nessuna scelta esiste (né default né ritocco): vale la **prima opzione** (in vista, sensori, notifiche e spesa). Nella vista le altre restano consultabili.
- Se lo schema o un'eccezione cambiano e una scelta punta a un'opzione non più esistente, si torna alla prima opzione. **[scelta del builder]**

## Funzioni

### Consultazione
- Vista "oggi / prossimo pasto" per profilo, ottimizzata per telefono.
- Navigazione per giorno/data.

### Modifica
- Modifica schema settimanale, pasti, righe, alternative, eccezioni per data, impostazioni profilo, creazione/eliminazione profili.
- Qualsiasi utente HA.

### Lista spesa
- Input: intervallo di date + profili inclusi (default tutti). **[scelta del builder: selezione profili]**
- Per ogni data usa il giorno effettivo (eccezioni incluse) e le alternative scelte (ritocco per data > default schema > prima opzione).
- Somma gli alimenti con stesso nome (normalizzato: maiuscole/spazi) e stessa unità; unità diverse restano righe separate.
- Output: aggiunta degli elementi a una lista To-do di HA scelta dall'utente (es. `todo.shopping_list`), formato tipo "Pasta integrale - 560 g".

### Sensori
- Per profilo: "pasto attuale" e "prossimo pasto", con attributi contenenti il dettaglio (alimenti, opzione scelta, orario).
- "Pasto attuale" = ultimo pasto con orario già passato oggi, fino all'orario del successivo (dopo l'ultimo pasto resta quello fino a mezzanotte). **[scelta del builder]**
- Pasti senza orario: compaiono nella vista ma non determinano "attuale/prossimo" in base al tempo né generano promemoria. **[scelta del builder]**

### Promemoria
- Per profilo, se attivo: notifica X minuti prima di ogni pasto con orario, sul servizio `notify.*` configurato, con il contenuto del pasto (opzione scelta se presente).

## Vincoli

- Persistenza nello storage di HA (`.storage`), nessun DB esterno.
- Modifiche concorrenti da più dispositivi: ogni modifica deve essere salvata in modo da non sovrascrivere silenziosamente quella di un altro (es. salvataggi granulari per pasto/giorno e aggiornamento in tempo reale delle UI aperte). Strategia lasciata al builder.
- Deve funzionare su HA Core recente installato via HACS (non richiede Supervisor).

## Lasciato al builder

- Stack frontend del pannello, API (websocket), struttura storage.
- Strategia di concorrenza e aggiornamento real-time.
- Unità di misura disponibili e normalizzazione nomi.
- Layout dettagliato delle schermate.
- Test e packaging HACS.
