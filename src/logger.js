/* FreeForm Logger (C) 2022 Jai B */ 
"use strict";

class logger {
    constructor(_parent) {
        this.parent = _parent;
    	this.hrStart = process.hrtime.bigint();
        this.logStore = [];
        this.stdout = true;
    }

    get count() {
        return this.logs.length;
    }

    push(message) {
    	this.log(message);
    }

    divertToFile() {
        this.stdout = !this.stdout;
    }

    writeToFile(message) {
        fs.appendFileSync(this.parent.logFile, message + '\n');
    }

    log(message) {
        const timestamp = new Date().toISOString();

        const hrDiff = process.hrtime.bigint(this.hrStart);

        let num = Number(hrDiff - this.hrStart);
        let seconds = num / 1000000000;

        const profileTime = `${seconds.toFixed(4)}s`;

        const msg = `[${process.pid}: ${timestamp} | ${profileTime}] ${message}`;

        if (this.stdout)
            console.log(msg);
        else
            this.writeToFile(msg);
    }
};

module.exports = (p) => {
    return new logger(p);
}