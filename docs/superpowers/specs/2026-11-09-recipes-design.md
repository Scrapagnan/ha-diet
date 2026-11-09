# Ricette — Design

Data: 2026-11-09 · Estende: `docs/superpowers/specs/2026-11-09-ha-shared-diet-design.md` (integrazione `shared_diet`, branch `feat/shared-diet`, versione attuale 0.1.6).

## Intento

Le diete del nutrizionista contengono "ricette": un alimento composto da più alimenti semplici. Esempio dalla dieta: titolo dell'alimento (es. "Pancake"), una nota con come preparare il piatto, poi "Questo alimento è composto da:" e l'elenco degli ingredienti, ognuno con nome e grammatura.
La stessa ricetta ricorre in più giorni e per più persone: va scritta una volta sola e richiamata. Le grammature degli ingredienti possono cambiare da persona a persona (anche un solo ingrediente), ma per la stessa persona sono sempre le stesse in tutti i giorni.
Nella lista della spesa vanno elencati gli ingredienti ("foglie"), non la ricetta.

## Obiettivi

- Ricettario condiviso da tutta la famiglia, modificabile da qualsiasi utente HA (come le diete).
- Ricetta = nome, nota di preparazione, elenco ingredienti (alimento semplice + grammatura di default + unità).
- Una ricetta si usa nei pasti come un alimento: in una riga, o come alternativa OPPURE.
- Grammature per persona: impostate dalla dieta della persona, quando la ricetta è in un suo pasto; valgono per tutti i pasti di quella persona. Senza personalizzazione vale la grammatura di default della ricetta.
- Vista Oggi, sensori, promemoria: nome ricetta + ingredienti con le grammature della persona.
- Spesa: solo ingredienti con le grammature della persona, sommati agli altri alimenti uguali (stessa normalizzazione nome/unità attuale).

## Non-obiettivi

- Ricette dentro ricette (gli ingredienti sono sempre alimenti semplici).
- Grammature diverse per la stessa persona in giorni diversi.
- Quantità/porzioni della ricetta nel pasto (la riga-ricetta non ha quantità né unità proprie).
- Scalare proporzionalmente tutte le grammature.
- Import automatico delle ricette dal PDF.

## Anti-obiettivi

- Cambiare una grammatura in un pasto non deve sorprendere: il pannello deve dire chiaramente che vale per tutti i pasti di quella persona.
- Modifiche al ricettario non devono rompere diete esistenti né la spesa (rinomina, ingredienti aggiunti/rimossi).
- Due persone che modificano insieme ricettario e diete non devono perdere dati in silenzio (stesso standard delle diete: conflitto rilevato, merge o messaggio chiaro).

## Decisioni prese con l'utente

- Ricettario unico condiviso; ricetta scritta una volta e richiamata per nome.
- Grammature per persona, uguali in tutti i giorni; possono differire anche per un solo ingrediente.
- Grammature di default scritte nella scheda "Ricette"; quelle della persona si inseriscono dalla sua dieta, quando la ricetta è nel pasto.
- Ingredienti sempre semplici.
- Oggi/sensori/promemoria mostrano nome + ingredienti con grammature.

## Scelte del builder (approvate dall'utente nel riepilogo)

- Nuova scheda del pannello **"Ricette"**: elenco, crea, modifica (nome, nota, ingredienti con alimento/quantità/unità), elimina.
- Nei campi "Alimento" della dieta i suggerimenti includono le ricette, marcate come ricetta; sceglierne una trasforma quell'alimento in un riferimento alla ricetta. Deve essere possibile tornare ad alimento semplice (es. rimuovendo/cambiando).
- Riga-ricetta nell'editor della dieta: niente quantità/unità propria; sotto, gli ingredienti con le grammature di quella persona, modificabili, con l'avviso "vale per tutti i pasti di <persona>"; possibilità di tornare al default.
- Rinomina ricetta → nome aggiornato ovunque (riferimento per id).
- Ingrediente aggiunto alla ricetta → per chi non l'ha personalizzato vale il default. Ingrediente rimosso → la personalizzazione relativa si ignora/pulisce.
- Una ricetta usata in qualche dieta (settimana o eccezioni, di qualsiasi profilo) non si può eliminare: errore che dice in quali profili è usata.
- Nota di preparazione: visibile nella vista Oggi (richiudibile); non nei sensori/promemoria.
- Formato testo ricetta per sensori/promemoria: `"Pancake: Farina 60 g, Uova 1 pz"` (ingredienti con lo stesso formato degli alimenti, separati da ", "). Nell'attributo `items` del sensore una ricetta è una sola voce con questo testo.

## Modello dati (vincolante, per coerenza con il codice esistente)

Storage `shared_diet.data` (versione 1, migrazione al caricamento):
```jsonc
{
  "profiles": { "<id>": { ...profilo esistente..., "recipe_qty": { "<recipe_id>": { "<ingredient_id>": 60.0 } } } },
  "recipes": {
    "<recipe_id>": {
      "id": "<uuid hex>", "name": "Pancake", "note": "Mescolare…",
      "ingredients": [ { "id": "<uuid hex>", "food": "Farina", "qty": 60.0 | null, "unit": "g" } ],
      "rev": 1
    }
  }
}
```
- Item nei pasti: oggi `{food, qty, unit, note}`; diventa **oppure** `{recipe: "<recipe_id>"}` (nessun altro campo). Riferimento per id.
- `recipe_qty`: per profilo, per ricetta, per ingrediente: solo le grammature personalizzate (assente = default). Fa parte del profilo e viaggia con il suo `rev` e con il merge a tre vie del pannello (chiave di merge: `recipe_qty[recipe_id]`).
- Profili salvati prima di questa funzione non hanno `recipe_qty` e lo storage non ha `recipes`: al caricamento valgono `{}`.
- Ricette con `rev` proprio (concorrenza ottimistica come i profili).
- Riferimento a ricetta inesistente (es. dati corrotti): non deve rompere sensori/spesa; mostrato come "Ricetta mancante" e ignorato nella spesa.

## Comportamenti di calcolo

- `resolve_meal` / sensori / promemoria: un item-ricetta si espande in nome + ingredienti con grammature effettive della persona (personalizzata se presente, altrimenti default).
- `shopping_items`: un item-ricetta contribuisce i suoi ingredienti (grammatura effettiva della persona), normalizzati e sommati come gli alimenti; ingredienti senza quantità seguono la regola attuale degli alimenti senza quantità.
- Il mirror JS della logica (`resolveMeal`, ecc.) deve restare allineato a `model.py`.

## Vincoli

- Stesse regole del progetto: HACS, nessuna dipendenza nuova, pannello JS vanilla in un unico file, UI italiana, utenti non admin, validazione stretta al confine websocket, test in Docker (`shared-diet-test`), sottoscrizione in tempo reale estesa alle ricette.
- Bump della versione (const `VERSION` + manifest) alla consegna.
- Modelli subagent: implementazione modello economico, review dei task modello normale, review finale modello migliore.

## Decisioni dopo la revisione

- **Unità per persona (utente):** la persona può cambiare solo il numero; l'unità è sempre quella della ricetta. La personalizzazione è un numero ≥ 0; "torna al default" = rimuovere la personalizzazione. Un ingrediente con default senza quantità (`qty: null`, es. q.b.) può ricevere un numero per una persona; senza personalizzazione resta senza quantità.
- **[scelta del builder] Riferimenti validi al salvataggio:** `save_profile` rifiuta (errore `invalid_format`) item `{recipe: id}` con id non presente nel ricettario, e scarta dal `recipe_qty` salvato le voci di ricette o ingredienti inesistenti. L'eliminazione di una ricetta in uso è rifiutata (`in_use`, con i nomi dei profili). La gestione "Ricetta mancante" resta come difesa per dati incoerenti (es. corsa tra eliminazione e salvataggio), non come caso normale.
- **[scelta del builder] Dove si espande la ricetta:** `model.py` riceve il ricettario come argomento (`resolve_meal`, `current_and_next`, `shopping_items` e simili) e un item-ricetta risolto è una struttura con nome, ingredienti effettivi e nota; sensori/promemoria lo formattano come testo unico. La sottoscrizione `shared_diet/subscribe` invia anche `recipes` (stesso stream, stesso evento), e il pannello risolve in JS con la stessa logica.
- **[scelta del builder] Ingredienti senza nota:** per spesa e formattazione la nota di un ingrediente vale `""`.
- **[scelta del builder] Nomi delle ricette:** unici nel ricettario, confronto senza maiuscole/accenti/spazi doppi (`save_recipe` rifiuta duplicati). Possono coincidere con nomi di alimenti semplici. Il collegamento a una ricetta avviene solo scegliendola dai suggerimenti (mai per nome digitato). La riga-ricetta mostra il nome non modificabile e un tasto per tornare ad alimento semplice.
- **[scelta del builder] Aggiornamenti:** una modifica al ricettario aggiorna subito sensori e pannelli aperti (stesso listener dello store). Nell'editor della dieta gli ingredienti mostrati si ricalcolano sempre dal ricettario corrente; le personalizzazioni di ingredienti non più esistenti vengono ignorate.

## Aggiunta (2026-11-09): alternative OPPURE negli ingredienti

Richiesta dell'utente dopo la prova: un ingrediente di ricetta può avere alternative ("Latte 100 ml OPPURE Bevanda di soia 120 ml"). Decisioni dell'utente: la scelta funziona **come le alternative dei pasti** (predefinita + ritocco per data nella scheda Scelte; senza scelta vale la prima). Le altre decisioni qui sotto sono state proposte dal builder e approvate dall'utente.

### Modello dati (sostituisce la forma degli ingredienti sopra)
- Ingrediente: `{id, alts: [{id, food, qty: float|null, unit}, …]}` con almeno 1 alternativa; id alternative unici nella ricetta (anche tra ingredienti diversi).
- `recipe_qty[recipe_id][alt_id]` = grammatura personalizzata di **quell'alternativa** per la persona (solo numero ≥ 0, unità fissa).
- Scelta (Choice) di un pasto: `{option, lines, recipes?}` con `recipes: {recipe_id: {ingredient_id: alt_id}}` (facoltativo, assente = `{}`). La scelta è per ricetta, non per riga: se la stessa ricetta compare due volte nello stesso pasto, vale la stessa scelta. Priorità invariata: ritocco per data > predefinita del pasto > prima alternativa. `alt_id` non più esistente → prima alternativa.
- **Migrazione** al caricamento (storage versione invariata): ogni ingrediente nel vecchio formato `{id, food, qty, unit}` diventa `{id, alts: [{id: <stesso id>, food, qty, unit}]}`, così le personalizzazioni esistenti (`recipe_qty[rid][<vecchio ingredient id>]`) restano valide senza conversione.

### Comportamento
- Espansione (`expand_item` e mirror JS): per ogni ingrediente si usa l'alternativa scelta (dalla Choice del pasto per quella data) con la grammatura effettiva della persona; per "Vedi alternative" il pannello mostra anche le altre.
- Spesa, sensori, promemoria, Oggi: solo l'alternativa scelta.
- Scheda Ricette: "+ OPPURE" e rimozione per alternativa, come nell'editor dei pasti; ultima alternativa rimossa = ingrediente rimosso.
- Riga-ricetta nel pasto: tutte le alternative di ogni ingrediente con il proprio campo grammatura per la persona.
- Scheda Scelte: per i pasti che contengono ricette (come riga o alternativa) con ingredienti a più alternative, una tendina "<Ricetta> · Ingrediente N" con predefinita e ritocco per data, come per le righe.
- Validazione websocket: ingredienti con `alts` non vuoto, id unici; Choice `recipes` con chiavi/valori stringhe non vuote. `save_profile` pota da `recipe_qty` le alternative inesistenti (come oggi per ingredienti).

### Decisioni dopo la revisione [scelte del builder]
- **Choice resta un oggetto unico**, come oggi: per una data con ritocco vale l'intera Choice di quella data (incluso `recipes`), altrimenti l'intera predefinita. Il pannello già crea il ritocco copiando la predefinita ("Ritocca per questa data"), quindi la copia include anche `recipes`. Cambiare un ingrediente in una data senza ritocco crea il ritocco come copia della predefinita e poi lo modifica (stesso flusso di oggi).
- **Scheda Scelte:** le tendine degli ingredienti compaiono solo per le ricette che stanno nel percorso scelto (opzione scelta, alternativa scelta di ogni riga). Cambiando l'alternativa di una riga, la vista si ridisegna e mostra/nasconde le tendine di conseguenza; le scelte di ricette non più nel percorso restano salvate ma non contano.
- **Nessuna pulizia delle Choice alla modifica di una ricetta:** un `alt_id` o un ingrediente non più esistente si risolve alla prima alternativa (fallback pigro). `save_recipe` non tocca i profili.
- **Merge a tre vie:** invariato; `recipes` fa parte della Choice e segue le chiavi esistenti (`choices.defaults[meal_id]`, `choices.dates[date][meal_id]`).

## Lasciato al builder

Struttura dei comandi websocket per le ricette, layout della scheda Ricette e della riga-ricetta (mobile-first, coerente con lo stile attuale), dettagli di migrazione, strategia di merge per le ricette.
