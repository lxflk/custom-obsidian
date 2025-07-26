# Appointments
```dataviewjs
// Map von Wochentags-Buchstaben zu Zahlen (Montag = 1, Sonntag = 7)
const dayLetterToNumber = {
    'M': 1, // Montag
    'T': 2, // Dienstag
    'W': 3, // Mittwoch
    'R': 4, // Donnerstag
    'F': 5, // Freitag
    'S': 6, // Samstag
    'U': 7  // Sonntag
};

// Heutiges Datum und Wochentagsnummer ermitteln
const now = dv.date("now"); // Aktuelle Uhrzeit und Datum
const today = dv.date("today"); // Nur das heutige Datum
const todayWeekdayNumber = today.weekday; // Montag = 1

// Sammle alle relevanten Seiten
const pages = dv.pages('"Organisation/Calender/University" or "Organisation/Calender/Appointments"');

let events = [];

// Iteriere über alle Seiten
for (let page of pages) {
    let showEvent = false;

    // Prüfe auf einmalige Events mit 'date'
    if (page.date && dv.date(page.date).toISODate() === today.toISODate()) {
        showEvent = true;
    }

    // Prüfe auf wiederkehrende Events
    else if (page.type === 'recurring' && page.startRecur) {
        const startRecurDate = dv.date(page.startRecur);

        if (startRecurDate <= today && page.daysOfWeek) {
            let daysOfWeek = page.daysOfWeek;

            // Wenn 'daysOfWeek' kein Array ist, konvertiere es
            if (!Array.isArray(daysOfWeek)) {
                if (typeof daysOfWeek === 'string') {
                    // Entferne Leerzeichen und teile bei Komma
                    daysOfWeek = daysOfWeek.replace(/\s/g, '').split(',');
                } else {
                    // Überspringe, wenn das Format nicht erkannt wird
                    continue;
                }
            }

            // Konvertiere die Buchstaben zu Zahlen
            const eventDays = daysOfWeek.map(day => dayLetterToNumber[day]);

            // Prüfe, ob der heutige Wochentag im Event enthalten ist
            if (eventDays.includes(todayWeekdayNumber)) {
                showEvent = true;
            }
        }
    }

    if (showEvent) {
        const startDateTime = page.startTime ? dv.date(`${today.toISODate()}T${page.startTime}`) : null;
        const endDateTime = page.endTime ? dv.date(`${today.toISODate()}T${page.endTime}`) : null;

        events.push({
            Startzeit: page.startTime || "",
            Endzeit: page.endTime || "",
            Termin: page.title || page.file.link,
            StartDateTime: startDateTime,
            EndDateTime: endDateTime
        });
    }
}

// Sortiere die Events nach Startzeit
events = events.filter(event => event.Startzeit).sort((a, b) => a.Startzeit.localeCompare(b.Startzeit));

// Hilfsfunktion zur Bestimmung der Hintergrundfarbe
function getEventColor(start, end) {
    if (!start) return "white"; // Standardfarbe

    // Aktuell laufendes Event
    if (start <= now && end && end >= now) {
        return "#32CD32"; // Grün
    }

    // Bereits vergangenes Event
    if (start < now) {
        return "#d3d3d3"; // Grau
    }

    // Kommende Events: Farbverlauf von rot nach gelb
    const hoursToEvent = (start - now) / (1000 * 60 * 60); // Unterschied in Stunden
    const intensity = Math.max(0, Math.min(1, hoursToEvent / 12)); // Normalisiere auf [0, 1] (12 Stunden als Referenz)
    const red = 255;
    const green = Math.round(255 * intensity);
    const blue = 0; // Kein Blau
    return `rgb(${red},${green},${blue})`; // Farbwert von rot (nahe) bis gelb (fern)
}

// Ausgabe der Events in einer farblich abgestuften Tabelle
if (events.length > 0) {
    dv.table(
        ["Startzeit", "Endzeit", "Termin"],
        events.map(event => [
            `<span style="background-color: ${getEventColor(event.StartDateTime, event.EndDateTime)}; color: black; padding: 4px; display: inline-block; width: 100%; text-align: center; border-radius: 5px;">${event.Startzeit}</span>`,
            `<span style="background-color: ${getEventColor(event.StartDateTime, event.EndDateTime)}; color: black; padding: 4px; display: inline-block; width: 100%; text-align: center; border-radius: 5px;">${event.Endzeit}</span>`,
            `<span style="background-color: ${getEventColor(event.StartDateTime, event.EndDateTime)}; color: black; padding: 4px; display: inline-block; width: 100%; text-align: center; border-radius: 5px;">${event.Termin}</span>`
        ])
    );
} else {
    dv.paragraph("Keine Events für heute.");
}

```
# ToDo Today
```dataviewjs
// Maximale Arbeitsbelastung festlegen
const maxWorkload = 10;

// Aufgaben aus dem "Organisation"-Ordner abrufen
const allTasks = dv.pages()
    .filter(p => p.file.name.startsWith("ToDo"))
    .file
    .tasks
    .filter(t => t["🎯"]) // Nur Aufgaben mit einem '🎯'-Feld
    .sort(t => Number(t["🎯"])); // Nach Priorität sortieren

let selectedTasks = [];
let completedTasks = [];
let totalWorkload = 0;
let totalWorkloadIncomplete = 0;
let totalWorkloadCompleted = 0;

// Alle Aufgaben mit Priorität 1 hinzufügen
const prio1Tasks = allTasks.filter(t => Number(t["🎯"]) === 1);

for (let task of prio1Tasks) {
    let workload = Number(task["🏋🏼‍♂️"]) || 0;
    totalWorkload += workload;

    if (task.completed) {
        completedTasks.push(task);
        totalWorkloadCompleted += workload;
    } else {
        selectedTasks.push(task);
        totalWorkloadIncomplete += workload;
    }
}

// Wenn die Gesamtarbeitsbelastung geringer als das Maximum ist, Aufgaben mit höheren Prioritäten hinzufügen
let currentPrio = 2;

while (totalWorkload < maxWorkload) {
    const prioTasks = allTasks.filter(t => Number(t["🎯"]) === currentPrio);

    for (let task of prioTasks) {
        // Verhindern, dass doppelte Aufgaben hinzugefügt werden
        if (selectedTasks.some(t => t.text === task.text) || completedTasks.some(t => t.text === task.text)) continue;

        let workload = Number(task["🏋🏼‍♂️"]) || 0;
        totalWorkload += workload;

        if (task.completed) {
            completedTasks.push(task);
            totalWorkloadCompleted += workload;
        } else {
            selectedTasks.push(task);
            totalWorkloadIncomplete += workload;

            if (totalWorkload >= maxWorkload) break;
        }
    }

    currentPrio++;
    // Optional: Anhalten, wenn keine höheren Prioritäten existieren
    if (currentPrio > 10) break; // Angenommen, die höchste Priorität ist 10
}

// Gesamtanzahl und Arbeitsbelastung für nicht abgeschlossene Aufgaben anzeigen
dv.paragraph(`**Open Tasks:** ${selectedTasks.length}, **Workload:** ${totalWorkloadIncomplete}`);

// Liste der nicht abgeschlossenen Aufgaben ohne Gruppierungsüberschriften anzeigen
dv.taskList(selectedTasks, false);

// Visuelle Trennung
dv.paragraph('---');

// Gesamtanzahl und Arbeitsbelastung für abgeschlossene Aufgaben anzeigen
dv.paragraph(`**Finished Tasks:** ${completedTasks.length}, **Workload:** ${totalWorkloadCompleted}`);

// Liste der abgeschlossenen Aufgaben ohne Gruppierungsüberschriften anzeigen
dv.taskList(completedTasks, false);

```

