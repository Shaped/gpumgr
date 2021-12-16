/* 
	gpumgr v0.0.8-alpha
	logger.js - gpumgr log handler - based off freeform logger
	(C) 2022 Shaped Technologies (forbiddenera/Jai B.)

	gpumgr is a Linux-based GPU manager with console and web-based interfaces
*/

global.LOG_LEVEL_FATAL 			= 1;
global.LOG_LEVEL_ALWAYS 		= 2;
global.LOG_LEVEL_PRODUCTION 	= 4;
global.LOG_LEVEL_MESSAGE 		= 8;
global.LOG_LEVEL_VERBOSE 		= 16;
global.LOG_LEVEL_DEVELOPMENT 	= 32;
global.LOG_LEVEL_DEBUG 			= 64;

class logger {
	#parent;
	#hrStart;
	#currentLogLevel;
	#defaultLogLevel;

	constructor(_parent) {
		this.#parent = _parent;
		this.#hrStart = process.hrtime.bigint();
		this.logStore = [];
		this.stdout = true;
		
		this.#currentLogLevel = 4; // current log level is the level we check against to decide whether to show the message
		this.#defaultLogLevel = 2; // default log level is the level we push to log at when a level isn't passed to log/push
	}

	setCurrentLogLevel(level) { this.#currentLogLevel = level; }
	setDefaultLogLevel(level) { this.#defaultLogLevel = level; }

	get count() {
		return this.logs.length;
	}

	push() {
		this.log(arguments);
	}

	divertToFile() {
		this.stdout = !this.stdout;
	}

	writeToFile(message) {
		fs.appendFileSync(this.#parent.logFile, message + '\n');
	}

	log() {
        let messageLogLevel = this.#defaultLogLevel;
        let message=``;

		const timestamp = new Date().toISOString();

		const hrDiff = process.hrtime.bigint(this.#hrStart);

		let num = Number(hrDiff - this.#hrStart);
		let seconds = num / 1000000000;

		const profileTime = `${seconds.toFixed(4)}s`;

		if (Number.isInteger(arguments[0])) {
			messageLogLevel = arguments[0];
			var i=1;
		} else {
			var i=0;
		}

        for (;i<arguments.length;i++)
        	if (messageLogLevel <= this.#currentLogLevel) {
        		message+=arguments[i];
        	}

        const globalKeys = Object.keys(global);
        let messageLogLevelName="UNKNOWN";

        for (let key of globalKeys) {
        	if (key.substr(0,10) == "LOG_LEVEL_") {
        		if (global[key] == messageLogLevel) {
        			messageLogLevelName = key.substr(10,key.length);
        		}

        	}
        }

        if (message != ``) {
			const msg = `[${process.pid}: ${timestamp} |${messageLogLevelName}| ${profileTime}] ${message}`;

			if (this.stdout)
				console.log(msg);
			else
				this.writeToFile(msg);
		}
	}
};

//export { logger };
module.exports = (p) => {return new logger(p);}