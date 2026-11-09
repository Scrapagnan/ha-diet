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
- **Scelte**: per un intervallo di date, scegli l'opzione e l'alternativa di ogni pasto. Il predefinito vale per tutte le date; "Ritocca per questa data" cambia solo quel giorno.
- **Spesa**: sceglie intervallo di date e profili, poi aggiunge gli alimenti alla lista To-do selezionata (quantità sommate per alimento e unità).
- **Profili**: crea, rinomina ed elimina profili; collega una persona; configura il promemoria (minuti prima del pasto e servizio di notifica).

Ogni salvataggio invia l'intero profilo. Se un altro utente ha salvato nel frattempo, il pannello mostra "Modificato da un altro utente, dati ricaricati" e ricarica i dati aggiornati.

## Sensori

Per ogni profilo vengono creati due sensori, dove `<nome>` è il nome del profilo in minuscolo (es. `luca`):

- `sensor.<nome>_pasto_attuale`: nome del pasto in corso (vuoto se non c'è un pasto attuale). Attributi: `time`, `items`, `option`, `profile_id`, `person`.
- `sensor.<nome>_prossimo_pasto`: nome del prossimo pasto con orario. Stesso schema di attributi.

I pasti senza orario non compaiono mai come attuali o prossimi e non generano promemoria.

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
