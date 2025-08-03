<%*
const { moment } = window;
const today = moment().format("YYYY-MM-DD");

const taskName = await tp.system.prompt("Aufgabenname");

/* 1. Is this a calendar entry? */
const calAns     = await tp.system.prompt("Kalendereintrag? y = ja, Enter = nein", "");
const isCalendar = (calAns || "").toLowerCase() === "y";

/* 2. Common fields */
let workload    = "";
let priority    = "/";
let dateInput   = "";
let startTime   = "";
let endTime     = "";
let repeating   = false;
let daysOfWeek  = "";
let startRecur  = "";
let endRecur    = "";
let countStreak = false;

/* 3. Calendar‐specific prompts & file creation */
if (isCalendar) {
    const repIn = await tp.system.prompt("Wiederkehrend? y/Enter", "");
    repeating  = (repIn || "").toLowerCase() === "y";
    if (repeating) {
		daysOfWeek = await tp.system.prompt("Tage der Woche (M,T,W,R,F,S,U)", "F");
		const dateTemplate = moment().format("YYYY-MM-DD");
		startRecur = await tp.system.prompt("Startdatum der Wiederholung (YYYY-MM-DD), default heute:", dateTemplate);
		dateInput = (startRecur || "").trim() || dateTemplate;
		endRecur    = await tp.system.prompt("Enddatum der Wiederholung (YYYY-MM-DD), leer lassen:", dateTemplate);
		
    } else {
	    dateInput = await tp.system.prompt("Datum (YYYY-MM-DD)", today);
    }

    startTime = await tp.system.prompt("Startzeit (HH:MM)", "09:00");
    endTime   = await tp.system.prompt("Endzeit (HH:MM)",   "10:00");
    /* calculate workload */
    const wl = moment(endTime, "HH:mm").diff(moment(startTime, "HH:mm"), 'minutes')/60;
    workload = (Math.round(wl*100)/100).toString().replace(/\.00$/,"").replace(/\.0$/,"");

    /* create calendar file */
    const CAL_ROOT = "03 Collector/Organisation/Calender";
    let subs = app.vault.getFiles()
        .filter(f => f.path.startsWith(CAL_ROOT + "/"))
        .map(f => f.path.slice(CAL_ROOT.length+1).split("/")[0]);
    subs = [...new Set(subs)];
    const folderChoice = await tp.system.prompt(
        `In welchen Unterordner? (${subs.join(", ")})`,
        subs[0] || "Appointments"
    );
    
    const uid = moment().format("YYYYMMDDHHmmssSSS");
    let yaml = `---\n`;
    yaml   += `title: ${taskName}\nallDay: false\nstartTime: ${startTime}\nendTime: ${endTime}\n`;
    if (repeating) {
        yaml += `type: recurring\ndaysOfWeek: [${daysOfWeek}]\nstartRecur: ${dateInput}\n`;
        if (endRecur.trim()) yaml += `endRecur: ${endRecur}\n`;
    } else {
        yaml += `date: ${dateInput}\n`;
    }
    yaml   += `uid: ${uid}\n---\n`;

    const safeTitle = taskName.replace(/[\\/:*?"<>|]/g, "");
    const fileName  = repeating
        ? `(Every ${daysOfWeek}) ${safeTitle}.md`
        : `${dateInput} ${safeTitle}.md`;
    const filePath  = `${CAL_ROOT}/${folderChoice}/${fileName}`;

    if (!app.vault.getAbstractFileByPath(filePath)) {
        await app.vault.create(filePath, yaml);
    }
}

/* 4. Non‐calendar tasks: priority, repeating first, then deadline or streak */
if (!isCalendar) {
	workload = await tp.system.prompt("Workload in Stunden", "1");
	const repIn = await tp.system.prompt("Wiederkehrend? y/Enter", "");
	repeating  = (repIn || "").toLowerCase() === "y";

	if (repeating) {
		daysOfWeek = await tp.system.prompt("Tage der Woche (M,T,W,R,F,S,U)", "F");
		const dateTemplate = moment().format("YYYY-MM-DD");
		startRecur = await tp.system.prompt("Startdatum der Wiederholung (YYYY-MM-DD), default heute:", dateTemplate);
		startRecur = (startRecur || "").trim() || dateTemplate;
		endRecur    = await tp.system.prompt("Enddatum der Wiederholung (YYYY-MM-DD), leer lassen:", dateTemplate);

		const streakAns = await tp.system.prompt("Streak zählen? y/Enter", "");
		countStreak     = (streakAns || "").toLowerCase() === "y";
	} else {
		// not repeating → ask for priority 
		answer = await tp.system.prompt("Priorität (leer lassen falls tagesgebunden)", "");
		if (answer.trim() === "") {
			// Tagesgebunden → only due date
			dateInput = await tp.system.prompt("Fälligkeitsdatum (YYYY-MM-DD)", today);
		} else {
			// Nicht Tagesgebunden → ask for deadline
			priority = answer
			dateInput = await tp.system.prompt("Deadline (YYYY-MM-DD), leer lassen:", today);
			dateInput = dateInput.trim();
		}
	}
}

/* 5. Build inline fields */
const dateField      = (dateInput && !repeating) ? ` [⏳:: ${dateInput}]` : "";
const repeatingField = repeating ? ` 🔁` : "";

let additionalFields = "";
if (!repeating && dateInput && priority.trim() !== "/") {
    additionalFields += `
\t- created:: [::${today}]
\t- start_prio:: ${priority}`;
}
if (repeating) {
    additionalFields += `
\t- daysOfWeek:: ${daysOfWeek}
\t- startStop:: [::${startRecur.trim()}]${endRecur.trim() ? " : [::" + endRecur + "]" : " : ♾️"}`;
    if (countStreak) {
        additionalFields += `
\t- streak:: 0
\t- streak_start:: [::${today}]`;
    }
}

/* 6. Emit the task line */
tR += `- [ ] ${taskName} [🎯:: ${priority}] [🏋🏼‍♂️:: ${workload}]${dateField}${repeatingField}${additionalFields}
\t- more_information:: `;
%>
