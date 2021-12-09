/*
 * FreeForm Logger
 */ 
"use strict";

class logger {
    constructor() {
    	this.hrStart = process.hrtime();
        this.logStore = [];
    }

    get count() {
        return this.logs.length;
    }

    push(message) {
    	this.log(message);
    }

    log(message) {
        const timestamp = new Date().toISOString();

        const hrDiff = process.hrtime(this.hrStart);;

        const profileTime = `${hrDiff[0] +'.'+ hrDiff[1]} S`;

        console.log(`[${timestamp} | ${profileTime}] ${message}`);

  		//console.log('Execution time (hr): %ds %dms', hrDiff[0], hrDiff[1] / 1000000)

    }
};

module.exports = new logger();