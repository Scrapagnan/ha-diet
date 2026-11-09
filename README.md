# Shared Diet

Integrazione per Home Assistant che gestisce le diete settimanali di tutta la famiglia: ogni profilo ha la sua settimana di pasti, con alternative, eccezioni per date e promemoria. Tutti gli utenti di casa (anche non amministratori, dall'app Companion sul telefono) possono consultare e modificare le diete dal pannello **Dieta**.

## Installazione con HACS

1. In HACS apri **Integrazioni** → menu (⋮) → **Repository personalizzati**.
2. Incolla l'URL del repository, categoria **Integrazione**, poi **Aggiungi**.
3. Cerca **Shared Diet** e installalo, quindi riavvia Home Assistant.
4. Vai in **Impostazioni → Dispositivi e servizi → Aggiungi integrazione** e scegli **Shared Diet**.

L'integrazione non richiede Supervisor e salva i dati solo in Home Assistant (`.storage`).

## Uso

Dopo l'installazione compare **Dieta** nella barra laterale. Le schede sono:

- **Oggi**: pasti di oggi del profilo selezionato, con le scelte applicate. "Vedi alternative" mostra tutte le opzioni.
- **Settimana**: pasti di ogni giorno della settimana. Aggiungi, rimuovi o riordina i pasti; ogni pasto ha opzioni (A, B, …) fatte di righe, e ogni riga può avere alternative ("OPPURE"). Il campo alimento suggerisce i nomi già usati in tutti i profili.
- **Date**: crea un'eccezione per una data specifica (copia il giorno della settimana, mantenendo le scelte), modificala o eliminala.
- **Scelte**: per un intervallo di date, scegli l'opzione e l'alternativa di ogni pasto. Il predefinito vale per tutte le date; "Ritocca per questa data" cambia solo quel giorno. Le ricette del percorso scelto mostrano anche le tendine delle loro alternative ingrediente (vedi sotto).
- **Ricette**: il ricettario condiviso, da cui si aggiungono ricette ai pasti (vedi sotto).
- **Spesa**: sceglie intervallo di date e profili, poi aggiunge gli alimenti alla lista To-do selezionata (quantità sommate per alimento e unità).
- **Profili**: crea, rinomina ed elimina profili; collega una persona; configura il promemoria (minuti prima del pasto e servizio di notifica).

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
- `sensor.<nome>_prossimo_pasto`: nome del prossimo pasto con orario. Stesso schema di attributi.

I pasti senza orario non compaiono mai come attuali o prossimi e non generano promemoria.

Se un pasto contiene una ricetta, `items` riporta una voce per ricetta nel formato `Pancake: Farina 60 g, Uova 1 pz` (nome, poi gli ingredienti con le grammature della persona). La nota di preparazione non è negli attributi del sensore: appare in **Oggi**, sotto "Preparazione".

## Esempio di automazione

Quando cambia il prossimo pasto di Luca (cioè dopo ogni pasto), invia sul telefono il pasto successivo con i suoi alimenti:

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
