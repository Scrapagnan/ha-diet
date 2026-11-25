# Shared Diet

Integrazione per Home Assistant che gestisce le diete settimanali di tutta la famiglia: ogni profilo ha la sua settimana di pasti, con alternative, eccezioni per date e promemoria. Ogni utente di Home Assistant ha automaticamente il suo profilo (creato all'avvio e quando si aggiunge un utente, eliminato con l'utente). Tutti gli utenti di casa (anche dall'app Companion sul telefono) consultano tutte le diete dal pannello **Dieta**; un utente non amministratore modifica solo il proprio profilo e vede gli altri in sola lettura. Gli amministratori modificano ed eliminano tutti i profili.

I profili creati prima di questa versione vengono collegati all'utente della persona collegata (se quell'utente non ha già un profilo); gli altri restano senza utente, modificabili solo dagli amministratori.

## Installazione con HACS

1. In HACS apri **Integrazioni** → menu (⋮) → **Repository personalizzati**.
2. Incolla l'URL del repository, categoria **Integrazione**, poi **Aggiungi**.
3. Cerca **Shared Diet** e installalo, quindi riavvia Home Assistant.
4. Vai in **Impostazioni → Dispositivi e servizi → Aggiungi integrazione** e scegli **Shared Diet**.

L'integrazione non richiede Supervisor e salva i dati solo in Home Assistant (`.storage`).

## Uso

Dopo l'installazione compare **Dieta** nella barra laterale. Le schede sono:

- **Oggi**: pasti di oggi del profilo selezionato, con le scelte applicate. "Vedi alternative" mostra tutte le opzioni.
- **Settimana**: pasti di ogni giorno della settimana. Aggiungi, rimuovi o riordina i pasti; ogni pasto ha opzioni (A, B, …) fatte di righe, e ogni riga può avere alternative ("OPPURE"). Il campo alimento suggerisce i nomi già usati in tutti i profili. "Condiviso con" indica con chi si mangia quel pasto: "Tutti" (predefinito) oppure i profili spuntati. In **Oggi** i pasti con lo stesso nome finiscono nella stessa scheda, con il Totale, solo se la condivisione è reciproca (A spunta B e B spunta A, anche tramite un terzo); gli altri hanno una scheda propria. Eliminando un profilo, viene tolto da tutte le condivisioni.
- **Date**: crea un'eccezione per una data specifica (copia il giorno della settimana, mantenendo le scelte), modificala o eliminala.
- **Scelte**: per un intervallo di date, scegli l'opzione e l'alternativa di ogni pasto. Il predefinito vale per tutte le date; "Ritocca per questa data" cambia solo quel giorno. Le ricette del percorso scelto mostrano anche le tendine delle loro alternative ingrediente (vedi sotto).
- **Ricette**: il ricettario condiviso, da cui si aggiungono ricette ai pasti (vedi sotto).
- **Spesa**: sceglie intervallo di date e profili, poi «Aggiungi alla lista» mette gli alimenti nella lista della spesa di famiglia e apre il tab Lista (quantità sommate per alimento e unità). L'anteprima è raggruppata per categoria (reparto): ogni alimento riceve una categoria automatica dal nome, modificabile dal menu accanto alla riga (vale per tutti). La quantità di ogni riga si può modificare nel campo accanto prima di aggiungerla (vuoto = quantità calcolata); oltre 1000 g la quantità è scritta in kg (es. 1,05 kg). La lista viene riempita nell'ordine delle categorie dell'utente.
- **Categorie**: si aggiungono, rinominano ed eliminano le categorie della casa («Altro» non si elimina); ciascun utente le ordina col proprio percorso nel supermercato trascinandole dalla maniglia ≡ (mouse o dito; da tastiera frecce su/giù sulla maniglia).
- **Lista**: mostra la lista della spesa di famiglia (entità `todo.lista_della_spesa`, creata dall'integrazione e visibile anche nella pagina To-do di HA, nell'app e agli assistenti vocali) raggruppata per categoria, nell'ordine dell'utente e con uno stacco netto tra un reparto e l'altro (anche gli articoli scritti a mano ricevono una categoria). Vista a checkbox o a card (scelta ricordata per ogni utente); spuntare un articolo lo completa, i completati finiscono in fondo. In cima si aggiungono a mano articoli fuori dieta, con quantità e unità facoltative (Invio o «Aggiungi»).
- **Profili**: rinomina il profilo e configura il promemoria (minuti prima del pasto e servizio di notifica). La persona collegata è automatica: è l'entità `person` dell'utente proprietario del profilo. Solo gli amministratori eliminano profili.
- **Profilo attivo** (solo amministratori): un profilo disabilitato ha settimana e scelte in sola lettura (nome e promemoria restano modificabili), non riceve promemoria, non compare in **Oggi** né tra i profili della lista della spesa.

Ogni salvataggio invia l'intero profilo. Se un altro utente ha salvato nel frattempo, il pannello mostra "Modificato da un altro utente, dati ricaricati" e ricarica i dati aggiornati.

## Ricette

Le ricette sono piatti composti da ingredienti, salvati una volta sola e usabili in tutti i profili.

- **Ricette**: crea, modifica ed elimina le ricette (nome, nota di preparazione, ingredienti con quantità e unità). Una ricetta usata in una dieta non può essere eliminata: il messaggio elenca i profili che la usano.
- **Nei pasti**: nel campo **Alimento** di un pasto compaiono anche le ricette, marcate "Ricetta". Scegliendone una, il pasto mostra la ricetta con i suoi ingredienti.
- **Grammature per persona**: ogni persona può avere grammature diverse dal default della ricetta. La grammatura personalizzata vale per tutti i pasti di quella persona in cui compare la ricetta. Lascia il campo vuoto per usare il default; "Ripristina default" annulla la personalizzazione.
- **Spesa**: la lista della spesa include gli ingredienti delle ricette, con le grammature della persona.
- **Alimento semplice**: "Usa alimento semplice" riporta il pasto a un alimento normale, da compilare a mano.

### Alternative negli ingredienti

- **Scheda Ricette**: ogni ingrediente può avere più alimenti alternativi, separati da "OPPURE". Usa "+ OPPURE" per aggiungerne uno; la prima alternativa è quella predefinita.
- **Scelta in Scelte**: compare una tendina per ogni ingrediente con alternative delle ricette del percorso scelto, con nome "Nome ricetta · Ingrediente N". Il predefinito vale per tutte le date; "Ritocca per questa data" permette di cambiarla solo per un giorno. Se non scegli nulla, si usa la prima alternativa.
- **Grammature per alternativa**: ogni alternativa ha la sua grammatura. Nella tendina e nei pasti compare la grammatura della persona, cioè quella personalizzata se presente, altrimenti il default dell'alternativa.

## Sensori

Per ogni profilo vengono creati due sensori, dove `<nome>` è il nome del profilo in minuscolo (es. `luca`):

- `sensor.<nome>_pasto_attuale`: nome del pasto in corso (vuoto se non c'è un pasto attuale). Attributi: `time`, `items`, `option`, `profile_id`, `person`.
- `sensor.<nome>_prossimo_pasto`: nome del pasto con orario **più vicino all'ora attuale**, prima o dopo. Stesso schema di attributi.

Il prossimo pasto si sceglie tra tutti i pasti con orario di oggi e il primo pasto con orario del primo giorno successivo che ne ha (fino a 7 giorni). Vince quello con la distanza minore dall'ora attuale; a parità vince quello futuro. I pasti di ieri non contano mai: dopo mezzanotte si guarda solo il giorno corrente. Esempio: pranzo 13:00, merenda 16:30; alle 13:20 il prossimo pasto è ancora il pranzo (20 minuti contro 3 ore e 10), dalle 14:45 la merenda.

Per un certo tempo dopo l'orario di un pasto, `pasto_attuale` e `prossimo_pasto` coincidono: è voluto. La scheda **Oggi** evidenzia come "Prossimo" lo stesso pasto e passa a domani solo quando il pasto più vicino è il primo di domani.

I pasti senza orario non compaiono mai come attuali o prossimi e non generano promemoria.

Se un pasto contiene una ricetta, `items` riporta una voce per ricetta nel formato `Pancake: Farina 60 g, Uova 1 pz` (nome, poi gli ingredienti con le grammature della persona). La nota di preparazione non è negli attributi del sensore: appare in **Oggi**, sotto "Preparazione".

## Esempio di automazione

Quando cambia il prossimo pasto di Luca (cioè a metà strada tra un pasto e il successivo, oppure a mezzanotte), invia sul telefono il pasto successivo con i suoi alimenti:

```yaml
automation:
  - alias: "Dieta: prossimo pasto di Luca"
    trigger:
      - trigger: state
        entity_id: sensor.luca_prossimo_pasto
        not_from: [unavailable, unknown]
        not_to: [unavailable, unknown]
    condition:
      - condition: template
        value_template: "{{ trigger.from_state.state != trigger.to_state.state }}"
      - condition: template
        value_template: "{{ trigger.to_state.attributes.time is string }}"
    action:
      - action: notify.mobile_app_telefono_luca
        data:
          title: "Prossimo pasto: {{ trigger.to_state.state }} alle {{ trigger.to_state.attributes.time }}"
          message: "{{ trigger.to_state.attributes.items | join(', ') }}"
```

Per un avviso prima dell'orario, usa il promemoria integrato del profilo (scheda **Profili**).
