const { Plugin, Notice } = require('obsidian');

module.exports = class UpdatePrioPlugin extends Plugin {
    async onload() {
        console.log("UpdatePrioPlugin loaded");
        this.registerEvent(
            this.app.workspace.on('layout-ready', async () => {
                try {
                    // First update streaks (handles stale ticks), then priorities
                    await this.updateStreaks();
                    await this.updatePrio();
                } catch (err) {
                    console.error("Error in UpdatePrioPlugin:", err);
                    new Notice("Fehler beim Tages-Update – siehe Konsole.");
                }
            })
        );
    }

    /* Helper: is `date` a scheduled occurrence? */
    isScheduledDay(daysOfWeek, startDate, endDate, date, moment) {
        const isoLetterMap = { 1: 'M', 2: 'T', 3: 'W', 4: 'R', 5: 'F', 6: 'S', 7: 'U' };
        const letter = isoLetterMap[date.isoWeekday()];
        if (!daysOfWeek.split(',').includes(letter)) return false;
        if (startDate && date.isBefore(moment(startDate, 'YYYY-MM-DD'), 'day')) return false;
        if (endDate && !date.isBefore(moment(endDate, 'YYYY-MM-DD'), 'day')) return false;
        return true;
    }

    /* Helper: count scheduled days from `start` (inclusive) up to `end` (exclusive) */
    countExpectedDays(daysOfWeek, start, end, moment) {
        let count = 0;
        const current = moment(start, 'YYYY-MM-DD').startOf('day');
        const last = moment(end, 'YYYY-MM-DD').startOf('day');
        while (current.isBefore(last)) {
            const letter = { 1: 'M', 2: 'T', 3: 'W', 4: 'R', 5: 'F', 6: 'S', 7: 'U' }[current.isoWeekday()];
            if (daysOfWeek.split(',').includes(letter)) count++;
            current.add(1, 'day');
        }
        return count;
    }

    /* ---------- 1. PRIORITY UPDATE ------------------------- */
    async updatePrio() {
        console.log("Starting updatePrio");
        const moment = window.moment;
        const today = moment().startOf('day');
        const isoLetter = { 1: 'M', 2: 'T', 3: 'W', 4: 'R', 5: 'F', 6: 'S', 7: 'U' }[today.isoWeekday()];

        const todoFiles = this.app.vault
            .getMarkdownFiles()
            .filter(f => f.basename.startsWith("ToDo"));

        for (let file of todoFiles) {
            let changed = false;
            let lines = (await this.app.vault.read(file)).split('\n');

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];

                /* ---------- 1A. weekly recurring tasks --------------- */
                if (line.includes('🔁')) {
                    if (!line.match(/\[🎯:: \S+?\]/)) continue;

                    let daysField = null;
                    let startDateStr = null;
                    let endDateStr = null;

                    let j = i + 1;
                    while (j < lines.length && /^[ \t]+- /.test(lines[j])) {
                        const sub = lines[j].trim();
                        const df = sub.match(/^-+\s*daysOfWeek::\s*([MTRFSWU,]+)/i);
                        if (df) daysField = df[1].replace(/\s+/g, '');
                        const ss = sub.match(/^-+\s*startStop::\s*\[\:\:(\d{4}-\d{2}-\d{2})\]\s*(?:\:\s*\[\:\:(\d{4}-\d{2}-\d{2})\])?/i);
                        if (ss) { startDateStr = ss[1]; endDateStr = ss[2] || null; }
                        j++;
                    }

                    if (daysField) {
                        // parse done date if any, to know if ticked
                        const doneMatch = line.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
                        const hadTickDate = !!doneMatch;

                        // reload priority
                        const prioMatch2 = line.match(/\[🎯:: (\S+?)\]/);
                        if (!prioMatch2) continue;
                        let prioStr2 = prioMatch2[1];

                        const weekdayOK = daysField.split(',').includes(isoLetter);
                        let rangeOK = true;
                        if (startDateStr) {
                            const startDate = moment(startDateStr, 'YYYY-MM-DD');
                            if (today.isBefore(startDate, 'day')) rangeOK = false;
                        }
                        if (endDateStr) {
                            const endDate = moment(endDateStr, 'YYYY-MM-DD');
                            if (!today.isBefore(endDate, 'day')) rangeOK = false;
                        }

                        if (weekdayOK && rangeOK) {
                            if (prioStr2 !== '1') {
                                lines[i] = lines[i].replace(/\[🎯:: (\S+?)\]/, `[🎯:: 1]`);
                                changed = true;
                            }
                        } else {
                            // only lower priority on off-days if it was ticked
                            if (hadTickDate && prioStr2 !== '/') {
                                lines[i] = lines[i].replace(/\[🎯:: (\S+?)\]/, `[🎯:: /]`);
                                changed = true;
                            }
                        }

                        continue;
                    }
                }

                /* ---------- 1B. original “deadline” logic ---------- */
                const taskMatch = line.match(/- \[ \] .*?\[🎯:: (\/|\d+)\].*?\[⏳:: (\d{4}-\d{2}-\d{2})\]/);
                if (!taskMatch) continue;

                const prioStr = taskMatch[1];
                const deadlineRaw = taskMatch[2];

                if (prioStr === "/") {
                    const deadline = moment(deadlineRaw, 'YYYY-MM-DD');
                    if (deadline.isValid() && !today.isBefore(deadline)) {
                        lines[i] = line.replace(/\[🎯:: (\/|\d+)\]/, `[🎯:: 1]`);
                        changed = true;
                    }
                    continue;
                }

                let prio = parseInt(prioStr, 10);
                let startPrio = null;
                let createdDate = null;
                let j = i + 1;

                while (j < lines.length && /^[ \t]+- /.test(lines[j])) {
                    const sub = lines[j].trim();
                    const sp = sub.match(/^-+\s*start_prio:: (\d+)/i);
                    /* ---- updated regex for [::date] ------- */
                    const cd = sub.match(/^-+\s*created::\s*(?:\[\:\:)?(\d{4}-\d{2}-\d{2})(?:\])?/i);
                    if (sp) startPrio = parseInt(sp[1], 10);
                    if (cd) createdDate = cd[1];
                    j++;
                }
                if (startPrio === null || createdDate === null) continue;

                const creationMoment = moment(createdDate, 'YYYY-MM-DD');
                const daysSinceCreate = today.diff(creationMoment, 'days');
                let newPrio = Math.max(startPrio - daysSinceCreate, 1);

                const deadlineMoment = moment(deadlineRaw, 'YYYY-MM-DD');
                if (deadlineMoment.isValid() &&
                    deadlineMoment.diff(today, 'days') <= 2) newPrio = 1;

                if (newPrio !== prio) {
                    lines[i] = line.replace(/\[🎯:: (\d+)\]/, `[🎯:: ${newPrio}]`);
                    changed = true;
                }
            }

            if (changed) {
                await this.app.vault.modify(file, lines.join('\n'));
                console.log(`Updated priorities in ${file.path}`);
            }
        }

        new Notice("Prioritäten wurden aktualisiert.");
    }

    /* ---------- 2. STREAK MAINTENANCE --------------------------------- */
    async updateStreaks() {
        console.log("Starting updateStreaks");
        const moment = window.moment;
        const today = moment().startOf('day');
        const yesterday = moment(today).subtract(1, 'day');

        const todoFiles = this.app.vault
            .getMarkdownFiles()
            .filter(f => f.basename.startsWith("ToDo"));

        for (let file of todoFiles) {
            let changed = false;
            const text = await this.app.vault.read(file);
            let lines = text.split('\n');

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (!line.includes('🔁')) continue;

                const cb = line.match(/^(- \[( |x)\])/);
                if (!cb) continue;
                const wasChecked = cb[2] === 'x';

                const doneMatch = line.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
                const doneDate = doneMatch ? moment(doneMatch[1], 'YYYY-MM-DD') : null;

                let daysOfWeek, startStopStart, startStopEnd, streak, streakIdx, streakStart, streakStartIdx;
                let j = i + 1;
                while (j < lines.length && /^[ \t]+- /.test(lines[j])) {
                    const sub = lines[j].trim();
                    let m;
                    if ((m = sub.match(/^-+\s*daysOfWeek::\s*([MTRFSWU,]+)/i))) daysOfWeek = m[1];
                    if ((m = sub.match(/^-+\s*startStop::\s*\[\:\:(\d{4}-\d{2}-\d{2})\](?:\s*:\s*\[\:\:(\d{4}-\d{2}-\d{2})\])?/i))) {
                        startStopStart = m[1];
                        startStopEnd = m[2] || null;
                    }
                    if ((m = sub.match(/^-+\s*streak::\s*(\d+)/i))) {
                        streak = parseInt(m[1], 10);
                        streakIdx = j;
                    }
                    /* ---- updated regex for [::date] ------- */
                    if ((m = sub.match(/^-+\s*streak_start::\s*(?:\[\:\:)?(\d{4}-\d{2}-\d{2})(?:\])?/i))) {
                        streakStart = m[1];
                        streakStartIdx = j;
                    }
                    j++;
                }
                if (!daysOfWeek || !startStopStart || streak == null || !streakStart) continue;

                if (wasChecked && doneDate) {
                    if (doneDate.isSame(today, 'day')) continue;
                    streak += 1;
                    lines[streakIdx] = lines[streakIdx].replace(/streak:: \d+/, `streak:: ${streak}`);
                    line = lines[i]
                        .replace('- [x]', '- [ ]')
                        .replace(/✅\s*\d{4}-\d{2}-\d{2}/, '')
                        .replace(/\[🎯:: \S+?\]/, `[🎯:: /]`)
                        .trimEnd();
                    lines[i] = line;
                    changed = true;
                }

                const expected = this.countExpectedDays(daysOfWeek, streakStart, today.format('YYYY-MM-DD'), moment);
                const streakMatches = (expected === streak);

                if (!streakMatches) {
                    streak = 0;
                    streakStart = today.format('YYYY-MM-DD');
                    lines[streakIdx] = lines[streakIdx].replace(/streak:: \d+/, `streak:: 0`);
                    lines[streakStartIdx] = lines[streakStartIdx]
                        .replace(/streak_start::\s*(?:\[\:\:)?\d{4}-\d{2}-\d{2}(?:\])?/, `streak_start:: [::${streakStart}]`);
                    changed = true;
                }
            }

            if (changed) {
                await this.app.vault.modify(file, lines.join('\n'));
                console.log(`Updated streaks in ${file.path}`);
            }
        }

        new Notice("Streaks wurden aktualisiert.");
    }
};
