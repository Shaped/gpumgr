#!/usr/bin/node
/* 
	gpumgr v0.0.9-development
	gpumgr.js - gpumgr main class & entry point
	(C) 2022 Shaped Technologies (forbiddenera/Jai B.)

	gpumgr is a Linux-based GPU manager with console and web-based interfaces
*/

"use strict";

global.fsp = require('fs').promises;
global.fs = require('fs');

global.cluster = require('cluster');

global.util = require('util');
global.child = require('child_process');
global.path = require('path');
global.cores = require('os').cpus().length;
global.net = require('net');

global.exec = util.promisify(require('child_process').exec);

global.xmlParser = require('xml2json');

global.asleep = (ms) => new Promise((res)=>setTimeout(res,ms));

global.$me = path.basename(process.argv[1]);

global.$version = `0.0.9-development`;
global.$copyright = `(C) Shaped Technologies`;
global.$license = `GPLv3 License`;

class gpuManager {
	constructor() {
		this.logFile = `${$me}.log`;

		this.serviceHost = `127.0.0.1`;
		this.servicePort = 4242;
		this.serviceThreads = -1;

		this.fd7=null;

		global.ansi = require('./ansi.js')(this);
		global.logger = require("./logger.js")(this);

		/*::DEVELOPMENT::*/this.developmentMode = true;

		if (this?.developmentMode) logger.setCurrentLogLevel(64);

		process.on('SIGINT', this.handleSignal.bind(this));
		process.on('SIGTERM', this.handleSignal.bind(this));
		process.on('SIGUSR1', this.handleSignal.bind(this));
		process.on('SIGUSR2', this.handleSignal.bind(this));
		process.on('uncaughtException', this.uncaughtExceptionHandler.bind(this));
		process.on('unhandledRejection', this.unhandledRejectionHandler.bind(this));
	}

	async initialize() {
		this.GPUs = [];

		this.handleArgumentsEarly();
		this.handleArguments();
	}

	handleArgumentsEarly() {
		switch (process.argv[2]) {
			case 'start':
				logger.divertToFile();
			  break;
		}

		switch (process.argv[2]) {
			case '__child':
				logger.divertToFile();
				this.childProcess = process;
		}
	}

	async handleArguments() {
		process.argv[2] = process.argv[2] ?? 'help';

		(process.argv[2] == '__child')
		? (cluster.isMaster)
			? logger.log(LOG_LEVEL_ALWAYS, `${$me} ${$version} service starting..`)
			: logger.log(LOG_LEVEL_DEBUG, `${$me} ${$version} worker #${cluster.worker.id} starting..`):null;

		(process.stdout.getColorDepth() == 1
			|| process.argv[process.argv.length-1] == '-g'
			|| process.argv[process.argv.length-1] == '--no-colors')
				? ansi.disableColor():null;

		switch (process.argv[2]) {
			case 'show':
			case 'fan':
			case 'power':
			case 'list': await this.enumerateGPUs();
		}

		switch (process.argv[2]) {
			case '?'      :
			case '-h'     :
			case '-?'     :
			case 'help'   :
			case '--help' :
			case 'usage'  :
			case '--usage':
			case 'wtf'    : this.showUsage(); break;
			case 'fan'    : this.handleFans(); break;
			case 'power'  : this.handlePower(); break;
			case 'show'   : this.handleShowStatus(); break;
			case 'list'   : this.handleListGPUs(); break;
			case 'start'  :
				await this.forkOff();
				process.exit();
			  break;
			case 'force':
				switch (process.argv[3]) {
					case 'restart':
						try {//*::TODO:: Figure out a way to save options (host/port/threads) on a force restart? or at very least (or both) allow to set options on force restart.
							//*::TODO:: almost done, took all fucking night. stupid undocumented shit.
							let pid = await this.getChildPID();
							await logger.log(`${$me} attempting to query child [${pid}]`);

							try {
								await this.queryOOB(pid);
							} catch (e) {
								await logger.log(`${$me} pingback failed, process will be killed. start it again manually. [${pid}]`);
								await this.killPID(pid);
								await logger.log(`${$me} sent signal to stop daemon [${pid}]`);
								process.exit();
							}

							await logger.log(`${$me} attempting to stop daemon [${pid}]`);
							await this.killPID(pid);
							await logger.log(`${$me} attempting to start new daemon...`);
							await this.forkOff(true);
							await logger.log(`${$me} ${$version} daemon has been force re-started [${this.childProcess.pid}]`);
						} catch (e) {
							await logger.log(`${$me} unable to find daemon`);
						}
						
						process.exit();
					  break;
					case 'stop':
						try {
							let pid = await this.getChildPID();
							await logger.log(`${$me} attempting to kill daemon [${pid}]`);
							process.kill(pid, "SIGTERM");
							await logger.log(`${$me} sent signal to stop daemon [${pid}]`);
							process.exit();
						} catch (e) {
							await logger.log(`${$me} unable to find daemon`);
						}
						
						process.exit();
					  break;
				}
			  break;
			case 'restart':
				try {
					let pid = await this.getChildPID();
					await logger.log(`${$me} attempting to restart daemon [${pid}]`);
					await process.kill(pid, "SIGUSR2");
					await logger.log(`${$me} sent signal to restart daemon [${pid}]`);
				} catch (e) {
					await logger.log(`${$me} unable to find daemon`);
				}
			  break;
			case 'stop':
				try {
					let pid = await this.getChildPID();
					await logger.log(`${$me} attempting to stop daemon [${pid}]`);
					process.kill(pid, "SIGINT");
					await logger.log(`${$me} sent signal to stop daemon [${pid}]`);
					process.exit();
				} catch (e) {
					await logger.log(`${$me} unable to find daemon`);
				}
			  break;
			case '__child':
				process.on('beforeExit', this.nothingLeftToDo.bind(this));
				process.on('exit', this.handleChildExit.bind(this));
				this.startDaemon();				
			  break;
			default:
				console.log(`Command line argument not understood: '${process.argv[2]}'`);
				this.showUsage();
		}
	}

	async getChildPID() { return (await fsp.readFile(`/tmp/gpumgr.pid`, `utf8`)); }

	killPID(pid, signal = 'SIGINT', timeout = 5) {
		return new Promise((resolve, reject) => {
			let count = 0;

			try {
				process.kill(pid, 0);
				var intv = setInterval(()=> {
					count++;
					try {
						(process.kill(pid, 0) == true)
						? (signal == "SIGINT" && count > (timeout/2))
							? process.kill(pid, 'SIGTERM')
							: process.kill(pid, signal)
						:null;
					} catch (e) {
						clearInterval(intv);
						resolve();
					}

					logger.log(`Waiting .. ${count} [${pid}]`);
					(count > timeout) ? reject(new Error(`timed out killing ${pid}`)):null;
				},1000);
			} catch (e) {
				clearInterval(intv);
				resolve();
			}

		});
	}

	uncaughtExceptionHandler(err, origin) {
		logger.log(`Unhandled Exception: ${err}`);
		logger.log(`Exception Origin: ${util.inspect(origin)}`);
	
		logger.log(`Exiting!`);

		process.exit(1);
	}

	unhandledRejectionHandler(err, origin) {
		logger.log(`Unhandled Rejection: ${err}`);
		logger.log(`Rejection Origin: ${util.inspect(origin)}`);
	
		logger.log(`Exiting!`);

		process.exit(1);
	}

	async handleSignal(signal) {
		switch (signal) {
			case 'SIGINT':
				logger.log("Caught SIGINT - cleaning up and exiting..");
				if (this.fd7 != null) logger.log(util.inspect(this.fd7))
				await this.stopDaemon();
				process.exit();
			  break;
			case 'SIGTERM':
				logger.log("Caught SIGTERM - cleaning up and exiting..");
				await this.stopDaemon();
				process.exit();
			  break;
			case 'SIGUSR1':
				logger.log("Caught SIGUSR1 - opening oobipc..");
				let pipe = new net.Socket({fd:7});
				pipe.on('data',this.handleOOB.bind(this));
			  break;
			case 'SIGUSR2':
				logger.log("Caught SIGUSR2 - soft-restarting..");
				if (this.fd7 != null) logger.log(util.inspect(this.fd7))
				await this.stopDaemon();
				logger.log("Stopped..");
				await this.startDaemon(true);
				logger.log("Done soft-restarting..");
			  break;
		}
	}

	async startDaemon(restart = false) {
		const webHandlerClass = require('./webHandler.js');

		switch(process.argv[3]) {
			case 'restart':
			  break;
			case 'force':
			case 'start':
				let [_1,_2,_3,_4,...args] = process.argv;
				for (let i=0;i<args.length;i++) {
					switch (args[i]) {
						case '--port':
							if (args[i+1].substr(0,1) != '-'
								&& Number.isInteger(parseInt(args[i+1]))
								&& parseInt(args[i+1]) >= 1001
								&& parseInt(args[i+1]) <= 65534) {
								let port = args.splice(i+1,1)[0];
								this.servicePort = port;
							} else {
								logger.log(`Invalid argument for --port, '${args[i+1]}', port must be a number between 1001 and 65534`);
								process.exit(1);								
							}
						  break;
						case '--host':
							if (args[i+1].substr(0,1) != '-') {
								let host = args.splice(i+1,1)[0];
								this.serviceHost = host;
							} else {
								logger.log(`Invalid argument for --host, '${args[i+1]}', host must be a valid IP assigned to a local interface. `,
									`It's recommended to use the default of 127.0.0.1 unless you need to access from a remote PC. `,
									`0.0.0.0 will listen on all local IPv4 address on all local interfaces, :: will listen on all `,
									`local IPv4 and IPv6 interfaces.`);
								process.exit(1);								
							}
						  break;
						case '--threads':
							if (args[i+1].substr(0,1) != '-'
								&& Number.isInteger(parseInt(args[i+1]))
								&& parseInt(args[i+1]) >= 2
								&& parseInt(args[i+1]) <= (cores*2) ) {
								let threads = args.splice(i+1,1)[0];
								this.serviceThreads = threads;
							} else if (args[i+1] == '-1') {
								this.serviceThreads = -1;
							} else {
								logger.log(`Invalid argument for --threads, '${args[i+1]}', threads must be a number between 2 and ${cores*2} (# of logical CPU cores * 2)`);
								process.exit(1);								
							}						
						  break;
						default:
					}
				}
			  break;
			default:
				logger.log(`Invalid argument ${process.argv[3]}`);
				process.exit(1);
		}

		let options = {//*::TODO::take cmd line port and host and threads and stuff it here 
			_parent:this,
			host: this.serviceHost,
			port: this.servicePort
		};

		if (this.serviceThreads != -1) options.threads = this.serviceThreads;

		this.webHandler = new webHandlerClass(options);

		try {
			process.argv = process.argv.filter((el)=>{if (el != '7>&1') return el})
			//*::TODO::Should we perhaps look for GPUs here and not start listening if we don't find any?
			//*::TODO::I mean, if we don't find any, drivers are bad or there isn't any, user should
			//*::TODO::have to reboot or reinstall drivers before it would work anyway..? Then we
			//*::TODO::don't have to template for no/zero GPUs..?
			this.webHandler.startListening();

			if (cluster.isMaster) { // cluster master work can be performed here. threads should enum as needed but perhaps we can mespas gpu control here.
				//this.fd7 = fs.createReadStream(null, {fd:5}).on('data',this.handleOOB.bind(this));
				// so if I listen on the oob, I clear the buffer so I can't preload it with values
				// and if it's not preloaded and i stall, force restart won't get a pingback and kill
				// but if i preload it, then force restart will get it's pingback immediately as it's already
				// there but then I can't do oobipc for anything else on this channel...
				// work around, initially preload the values, don't listen
				// if we get sigusr1, we will listen and load the values.
				// that way, they should be there already. if not, wtf, we can try and ask
				// if we're dead, then we're dead and we die, if not we can reply and get restarted
				//console.log(util.inspect(this.fd7));
				fs.writeFileSync(8, `😎:${this.serviceHost}:${this.servicePort}:${this.serviceThreads}`);				
			/*	this.daemonInterval = setInterval(async()=>{
					await logger.log(`Daemon Child Reporting`);
					this.enumerateGPUs();
				},5000);*/
			}
		} catch(e) {
			logger.log(`Unable to listen: ${e}`)
		}
	}

	async stopDaemon() {
		this.webHandler.stopListening();
		
		clearInterval(this.daemonInterval);

		await logger.log(`${$me} ${$version} daemon shutting down.`);
	}

	queryOOB(pid) {
		return new Promise((resolve,reject) => {
			logger.log(`${$me} [${process.pid}] creating readstream for /proc/${pid}/fd/7`)
			let oob = fs.createReadStream(`/proc/${pid}/fd/7`);
			let resolved = false;

			oob.on('data', (chunk) => {
				logger.log(`${$me} received pingback from client ${pid} on oobipc`);
				let [_,host,port,threads] = chunk.toString().split(':');
				this.serviceHost = host;
				this.servicePort = port;
				this.serviceThreads = threads;
				resolved = true;
				resolve();
			});

			setTimeout(()=>{
				if (resolved == false) {
					logger.log(`${$me} didn't find a queued oobipc, will try to signal for one`);
					process.kill(pid, 'SIGUSR1');
					setTimeout(()=>{
						fs.writeFileSync(`/proc/${pid}/fd/8`, `👌`);
					},500);
				}
			},1000);

			setTimeout(()=> reject(`Pingback Timeout!`) ,5000);
		});
	}

	handleOOB(chunk) {
		if (chunk.toString().substr(0,1) == "👌") {
			logger.log(`${process.pid}: OOBIPC query received! Sending pingback.`);
			
			setTimeout(()=>fs.writeFileSync(8, `😎:${this.serviceHost}:${this.servicePort}:${this.serviceThreads}`),50);

			logger.log(`${process.pid}: Sent pingback!`);
		}
	}

	async forkOff(forceRestart = false) {
		try {
			fs.statSync(`/tmp/gpumgr.pid`)
			logger.divertToFile();
			logger.log(`PID file exists; daemon is likely already running.`)
		} catch (e) {
			let [_,__,...args] = process.argv;
			(typeof this.childProcess === 'undefined')
			?	((!forceRestart)
				? this.childProcess = child.fork(__filename, ['__child', ...args, '7>&1'], { detached:true })
				: this.childProcess = child.fork(__filename, ['__child', ...args, '--host', this.serviceHost, '--port', this.servicePort, '--threads', this.serviceThreads, '7>&1'], { detached:true }),
				fs.writeFileSync(`/tmp/gpumgr.pid`, `${this.childProcess.pid}`)) : null;

				await logger.log(`${$me} ${$version} daemon started [${this.childProcess.pid}]`);
		}
	}

	// no async code here! not even with await, it will loop-back!
	nothingLeftToDo(code) { logger.log(`${$me} daemon shutting down..`); }

	handleChildExit(code) {
		try {
			fs.unlinkSync(`/tmp/gpumgr.pid`);
		} catch(e){}

		if (!cluster?.worker)
			logger.log(`${$me} daemon exiting.`);

		process.exit();
	}

	async handleFans() {
		let gpu = process.argv[4];
		switch (process.argv[3]) {
			case 'manual':
			case 'enable':
				switch (gpu) {
					case 'all': case 'nvidia': case 'amd': case 'intel':
						for (let cgpu of this.GPUs)
							(gpu == 'all')
							? await this.setGPUFanMode(cgpu.gpu, 'manual')
							: (cgpu.vendorName == gpu)
								? await this.setGPUFanMode(cgpu.gpu, 'manual')
								: null;
					  break;
					default:
						gpu = (Number.isInteger(parseInt(gpu))) ? gpu : 0;
						await this.setGPUFanMode(gpu, 'manual');
				}
			  break;
			case 'auto':
			case 'automatic':
			case 'disable':
				switch (gpu) {
					case 'all': case 'nvidia': case 'amd': case 'intel':
							for (let cgpu of this.GPUs)
								(gpu == 'all')
								? await this.setGPUFanMode(cgpu.gpu, 'automatic')
								: (cgpu.vendorName == gpu)
									? await this.setGPUFanMode(cgpu.gpu, 'automatic')
									: null;
						  break;					
					default:
						gpu = (Number.isInteger(parseInt(gpu))) ? gpu : 0;
						await this.setGPUFanMode(gpu, 'automatic');
				}
			  break;
			case 'curve':
				/*::TODO::*/
				await logger.log(`fan curve mode not yet impemented`);
			  break;			
			default:
				let speed = process.argv[3];
				if (speed.substr(-1,1)=="%") speed=speed.substr(0,speed.length-1);
				switch (gpu) {
					case 'all': case 'nvidia': case 'amd': case 'intel':
						for (let cgpu of this.GPUs)
							(gpu == 'all')
							? await this.setGPUFanSpeed(cgpu.gpu)
							: (cgpu.vendorName == gpu)
								? await this.setGPUFanSpeed(cgpu.gpu)
								: null;
					  break;					
					default:
						gpu = (Number.isInteger(parseInt(gpu))) ? gpu : 0;

					  	await this.setGPUFanSpeed(gpu, speed);
				}			
		}
	}

	async handlePower() {
		let gpu = process.argv[4];
		let power = process.argv[3];

		//we could potentially allow percentages if we calculate stuff
		//ie 100% is max_power, 0% is min_power? but is 100% 'defaut' power or 'max'?
		//something like afterburner shows 100% as default and max as like 115% or whatever, prob best
		//if (power.substr(-1,1)=="%") power=power.substr(0,power.length-1);
		
		if (power == "reset") {
			switch (gpu) {
				case 'all': case 'nvidia': case 'amd': case 'intel':
					for (let cgpu of this.GPUs)
						(gpu == 'all')
						? await this.resetGPUPower(cgpu.gpu)
						: (cgpu.vendorName == gpu)
							? await this.resetGPUPower(cgpu.gpu)
							: null;
				  break;
				default:
					gpu = (Number.isInteger(parseInt(gpu))) ? gpu : 0;
					await this.resetGPUPower(gpu);
			}
		} else {
			if (!Number.isInteger(parseInt(power))) {
				logger.log(`Invalid power value: ${power}`);
				process.exit(1);
			} else {
				power=parseInt(power);
			}

			switch (gpu) {
				case 'all': case 'nvidia': case 'amd': case 'intel':
					for (let cgpu of this.GPUs)
						(gpu == 'all')
						? await this.setGPUPower(cgpu.gpu, power)
						: (cgpu.vendorName == gpu)
							? await this.setGPUPower(cgpu.gpu, power)
							: null;
				  break;
				default:
					gpu = (Number.isInteger(parseInt(gpu))) ? gpu : 0;
					await this.setGPUPower(gpu, power);
			}
		}
	}

	async handleListGPUs() {
		let gpu = process.argv[3];
		switch (gpu) {
			case 'all': case 'nvidia': case 'amd': case 'intel':
				for (let cgpu of this.GPUs)
					(gpu == 'all')
					? await this.listGPU(cgpu.gpu)
					: (cgpu.vendorName == gpu)
						? await this.listGPU(cgpu.gpu)
						: null;
			  break;
			default:
				if (Number.isInteger(parseInt(process.argv[3]))) {
					gpu = process.argv[3];
					await this.listGPU(gpu);
				} else {
					for (gpu of this.GPUs) await this.listGPU(gpu.gpu);
				}
		}		
	}

	async handleShowStatus() {
		let gpu = process.argv[3];
		switch (gpu) {
			case 'all': case 'nvidia': case 'amd': case 'intel':
				for (let cgpu of this.GPUs)
					(gpu == 'all')
					? await this.showStatus(cgpu.gpu)
					: (cgpu.vendorName == gpu)
						? await this.showStatus(cgpu.gpu)
						: null;
			  break;
			default:
				gpu = (Number.isInteger(parseInt(gpu))) ? process.argv[3] : 0;
				if (typeof this.GPUs[gpu] === 'undefined')
					if (typeof this.GPUs[0] === 'undefined') {
						logger.log(`GPU${gpu} not found - no GPU0 to fallback to.`);
						process.exit(1);
					} else {
						logger.log(`GPU${gpu} not found - defaulting to GPU0.`);
						gpu = 0;
					}
				await this.showStatus(gpu);
		}
	}

	async enumerateGPUs() {
		this.GPUs=[];
		logger.log(LOG_LEVEL_VERBOSE, `Enumerating GPUs..`);
		let entries = await fsp.readdir(`/sys/class/drm`);

		entries = entries.filter((entry) => (entry.substr(0,4) == 'card' && entry.length == 5) ? true : false);

		for (let card of entries) {
			let gpu = card.substr(4,1);

			let fullpcidevice = await this.getFullPCIDevice(gpu);
			let almostfullpcidevice = fullpcidevice.substr(9,fullpcidevice.length-11);
			fullpcidevice = fullpcidevice.substr(9,fullpcidevice.length-9);
			let pcidevice = fullpcidevice.substr(-7,7);

			let vendorid = await this.getPCIVendorID(gpu);
			let deviceid = await this.getPCIDeviceID(gpu);

			let subvendorid = await this.getPCISubVendorID(gpu);
			let subdeviceid = await this.getPCISubDeviceID(gpu);

			let vendorName = 'unknown';
			let productName = 'unknown';

			let hwmon = 'unknown';
			let nv = 'unknown';

			switch(vendorid) {
				case `1002`: 
					hwmon = await this.getHWMon(gpu);
					vendorName = 'amd';
				  break;
				case `10de`:
					vendorName = 'nvidia';
					let nvidiaQuery = await exec(`nvidia-smi -x -q --id=${fullpcidevice}`);
					nv = JSON.parse(xmlParser.toJson(nvidiaQuery.stdout));
					productName = nv.nvidia_smi_log.gpu.product_name;
				  break;
				case `8086`:
					vendorName = 'intel';
				  break;
			}

			logger.log(LOG_LEVEL_VERBOSE, `Found GPU${gpu} from ${vendorName} (${vendorid}:${deviceid})`);

			let GPU = {
				gpu: gpu,
				card: card,
				fullpcidevice: fullpcidevice,
				almostfullpcidevice: almostfullpcidevice,
				pcidevice: pcidevice,
				vendorid: vendorid,
				vendorName: vendorName,
				productName: productName,
				subvendorid: subvendorid,
				subdeviceid: subdeviceid,
				deviceid: deviceid
			};

			(hwmon != 'unknown')? GPU.hwmon = hwmon:null;
			(nv    != 'unknown')? GPU.nv    = nv   :null;
			
			this.GPUs.push(GPU);
		};
	}

	async updateNV(gpu) {
		let fullpcidevice = this.GPUs[gpu].fullpcidevice;
		let nvidiaQuery = await exec(`nvidia-smi -x -q --id=${fullpcidevice}`);		
		this.GPUs[gpu].nv = JSON.parse(xmlParser.toJson(nvidiaQuery.stdout));
	}

	async getHWMon(gpu) { return (await fsp.readdir(`/sys/class/drm/card${gpu}/device/hwmon`))[0]; }

	async getIRQNumber(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/irq`, `utf8`)).trim(); }
	async getFullPCIDevice(gpu) { return (await fsp.readlink(`/sys/class/drm/card${gpu}/device`)); }
	async getPCIVendorID(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/vendor`, `utf8`)).trim().substr(2,4); }
	async getPCIDeviceID(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/device`, `utf8`)).trim().substr(2,4); }
	async getPCISubVendorID(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/subsystem_vendor`, `utf8`)).trim().substr(2,4); }
	async getPCISubDeviceID(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/subsystem_device`, `utf8`)).trim().substr(2,4); }
	async getPCILinkSpeed(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/current_link_speed`, `utf8`)).trim(); }
	async getPCILinkWidth(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/current_link_width`, `utf8`)).trim(); }
	async getPCIMaxLinkSpeed(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/max_link_speed`, `utf8`)).trim(); }
	async getPCIMaxLinkWidth(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/max_link_width`, `utf8`)).trim(); }

	async getGPUBusy(gpu) {
		let gpu_busy = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				gpu_busy = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/gpu_busy_percent`, `utf8`)).trim();
			  break;
			case 'nvidia':
				gpu_busy = this.GPUs[gpu].nv.nvidia_smi_log.gpu.utilization.gpu_util;
				gpu_busy = gpu_busy.substr(0,gpu_busy.length-2);
			  break;
		}
		return gpu_busy;
	}

	async getMemBusy(gpu) {
		let mem_busy = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				mem_busy = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/mem_busy_percent`, `utf8`)).trim();
			  break;
			case 'nvidia':
				mem_busy = this.GPUs[gpu].nv.nvidia_smi_log.gpu.utilization.memory_util;
				mem_busy = mem_busy.substr(0,mem_busy.length-2);
			  break;
		}
		return mem_busy;
	}

	async getMemUsed(gpu) {
		let mem_used = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				mem_used = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/mem_info_vram_used`, `utf8`)).trim();
			  break;
			case 'nvidia':
				mem_used = this.GPUs[gpu].nv.nvidia_smi_log.gpu.fb_memory_usage.used;
				mem_used = mem_used.substr(0,mem_used.length-4);
				mem_used = mem_used * 1000 * 1000;
			  break;
		}
		return mem_used;
	}

	async getMemTotal(gpu) {
		let mem_total = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				mem_total = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/mem_info_vram_total`, `utf8`)).trim();
			  break;
			case 'nvidia':
				mem_total = this.GPUs[gpu].nv.nvidia_smi_log.gpu.fb_memory_usage.total;
				mem_total = mem_total.substr(0,mem_total.length-4);
				mem_total = mem_total * 1000 * 1000;
			  break;
		}
		return mem_total;
	}

	async getGPUCoreTemperature(gpu) {
		let temperature = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				temperature = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/temp1_input`, `utf8`)).trim();
				temperature = (temperature/1000).toFixed(1);
			  break;
			case 'nvidia':
				temperature = this.GPUs[gpu].nv.nvidia_smi_log.gpu.temperature.gpu_temp;
				temperature = temperature.substr(0,temperature.length-2);
			  break;
		}
		return temperature;
	}

	async getGPUClocks(gpu) {
		let clocksArray = ["unknown"];
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				clocksArray = [];
				let clocks = await fsp.readFile(`/sys/class/drm/card${gpu}/device/pp_dpm_sclk`, 'utf8');
				clocks = clocks.split(`\n`);
				clocks = clocks.filter((entry) => (entry == '') ? false : true);

				for (let clock of clocks) {
					let [id,mhz] = clock.split(`: `);
					let active = (mhz.substr(-1,1) == `*`)?true:false;

					mhz = (mhz.substr(-1,1) == `*`)
						? mhz.substring(0,mhz.length-2)
						: mhz.substring(0,mhz.length-1);

					clocksArray.push({ id:id, mhz:mhz,active:active });
					mhz = mhz.substring(0,mhz.length-2);
				}
			  break;
		}
		return clocksArray;
	}

	async getMemoryClocks(gpu) {
		let clocksArray = ["unknown"];
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				clocksArray = [];
				let clocks = await fsp.readFile(`/sys/class/drm/card${gpu}/device/pp_dpm_mclk`, 'utf8');
				clocks = clocks.split(`\n`);
				clocks = clocks.filter((entry) => (entry == '') ? false : true);

				for (let clock of clocks) {
					let [id,mhz] = clock.split(`: `);
					let active = (mhz.substr(-1,1) == `*`)?true:false;

					mhz = (mhz.substr(-1,1) == `*`)
						? mhz.substring(0,mhz.length-2)
						: mhz.substring(0,mhz.length-1);

					clocksArray.push({ id:id, mhz:mhz, active:active });
					mhz = mhz.substring(0,mhz.length-2);
				}
			  break;
		}
		return clocksArray;
	}

	async getCurrentGPUClockProfile(gpu) {
		let current_mhz = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				let clocks = await fsp.readFile(`/sys/class/drm/card${gpu}/device/pp_dpm_sclk`, 'utf8');
				clocks = clocks.split(`\n`);
				clocks = clocks.filter((entry) => (entry == '') ? false : true);

				for (let clock of clocks) {
					let [id,mhz] = clock.split(`: `);
					if (mhz.substr(-1,1) == `*`) current_mhz = mhz.substring(0,mhz.length-2);
				}
			  break;
		}
		return current_mhz;
	}

	async getCurrentMemoryClockProfile(gpu) {
		let current_mhz = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				let clocks = await fsp.readFile(`/sys/class/drm/card${gpu}/device/pp_dpm_mclk`, 'utf8');
				clocks = clocks.split(`\n`);
				clocks = clocks.filter((entry) => (entry == '') ? false : true);

				for (let clock of clocks) {
					let [id,mhz] = clock.split(`: `);
					if (mhz.substr(-1,1) == `*`) {
						current_mhz = mhz.substring(0,mhz.length-2);
					}
				}
			  break;
		}
		return current_mhz;
	}

	async getCurrentGPUClock(gpu) {
		let mhz = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				mhz = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/freq1_input`, `utf8`)).trim();
				mhz = (mhz/1000/1000).toFixed(2);
			  break;
			case 'nvidia':
				mhz = this.GPUs[gpu].nv.nvidia_smi_log.gpu.clocks.graphics_clock;
				mhz = mhz.substr(0,mhz.length-4);
			  break;
		}
		return mhz;
	}

	async getCurrentMemoryClock(gpu) {
		let mhz = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				mhz = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/freq2_input`, `utf8`)).trim();
				mhz = (mhz/1000/1000).toFixed(2);
			  break;
			case 'nvidia':
				mhz = this.GPUs[gpu].nv.nvidia_smi_log.gpu.clocks.mem_clock;
				mhz = mhz.substr(0,mhz.length-4);
			  break;			  
		}
		return mhz;
	}

	async getPowerLimitWatts(gpu) {
		let watts = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				watts = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap`, `utf8`)).trim();
				watts = (watts/1000/1000).toFixed(2);
			  break;
			case 'nvidia':
				watts = this.GPUs[gpu].nv.nvidia_smi_log.gpu.power_readings.power_limit;
				watts = watts.substr(0,watts.length-2);
			  break;
		}
		return watts;		
	}

	async getPowerLimitMinWatts(gpu) {
		let watts = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				watts = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap_min`, `utf8`)).trim();
				watts = (watts/1000/1000).toFixed(2);
			  break;
			case 'nvidia':
				watts = this.GPUs[gpu].nv.nvidia_smi_log.gpu.power_readings.min_power_limit;
				watts = watts.substr(0,watts.length-2);
			  break;
		}
		return watts;		
	}

	async getPowerLimitMaxWatts(gpu) {
		let watts = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				watts = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap_max`, `utf8`)).trim();
				watts = (watts/1000/1000).toFixed(2);
			  break;
			case 'nvidia':
				watts = this.GPUs[gpu].nv.nvidia_smi_log.gpu.power_readings.max_power_limit;
				watts = watts.substr(0,watts.length-2);
			  break;
		}
		return watts;		
	}

	async getPowerUsage(gpu) {
		let usage = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				usage = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_average`, `utf8`)).trim();
				usage = (usage/1000);
			  break;
			case 'nvidia':
				usage = this.GPUs[gpu].nv.nvidia_smi_log.gpu.power_readings.power_draw;
				usage = usage.substr(0,usage.length-2) * 1000;
			  break;
		}
		return usage;		
	}

	async getVddGfx(gpu) {
		let vdd = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				vdd = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/in0_input`, `utf8`)).trim();
			  break;
		}
		return vdd;
	}

	async getFanMode(gpu) {
		let mode = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				mode = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1_enable`, `utf8`)).trim();
				switch(mode) {
					case '1':
						mode = "manual";
					  break;
					case '2':
						mode = "automatic";
					  break;
				}
			  break;
		}
		return mode;
	}

	async getFanSpeedPWM(gpu) {
		let pwm = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				pwm = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1`, `utf8`)).trim();
			  break;
		}
		return pwm;
	}

	async getFanSpeedPct(gpu) {
		let pct = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				pct = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1`, `utf8`)).trim();
				pct = ((pct / 255) * 100).toFixed(1);
			  break;
			case 'nvidia':
				pct = this.GPUs[gpu].nv.nvidia_smi_log.gpu.fan_speed;
				pct = pct.substr(0,pct.length-2);
			  break;
		}
		return pct;
	}

	async getFanSpeedRPM(gpu) {
		let rpm = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				rpm = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/fan1_input`, `utf8`)).trim();
				rpm = rpm.toLocaleString();
			  break;
		}
		return rpm;
	}

	async getFanSpeedMinRPM(gpu) {
		let rpm = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				rpm = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/fan1_min`, `utf8`)).trim();
				rpm = rpm.toLocaleString();
			  break;
		}
		return rpm;
	}

	async getFanSpeedMaxRPM(gpu) {
		let rpm = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				rpm = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/fan1_max`, `utf8`)).trim();
				rpm = rpm.toLocaleString();
			  break;
		}
		return rpm;
	}

	async getFanSpeedTarget(gpu) {
		let rpm = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				rpm = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/fan1_target`, `utf8`)).trim();
				rpm = rpm.toLocaleString();
			  break;
		}
		return rpm;
	}

	async getFanInfo(gpu) {
		let fanInfo = {
			percent: 'unknown',
			rpm: 'unknown',
			rpm_max: 'unknown',
			rpm_min: 'unknown',
			mode: 'unknown'
		};

		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				fanInfo.mode = await this.getFanMode(gpu);
				fanInfo.percent = await this.getFanSpeedPct(gpu);
				fanInfo.rpm = await this.getFanSpeedRPM(gpu);
				fanInfo.rpm_min = await this.getFanSpeedMinRPM(gpu);
				fanInfo.rpm_max = await this.getFanSpeedMaxRPM(gpu);
				fanInfo.target = await this.getFanSpeedTarget(gpu);
			  break;
			case 'nvidia':
			    fanInfo.percent = await this.getFanSpeedPct(gpu);
			  break;
		};
		return fanInfo;
	}

	async setGPUFanSpeed(gpu, speed = 100) {
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				let mode = await this.getFanMode(gpu);
				if (mode == 'automatic') await this.setGPUFanMode(gpu, 'manual');

				let file = `/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1`;
				let pwm = parseInt((speed / 100) * 255);

				try {
					await logger.log(`[amd] Setting fan speed for GPU${gpu} ${speed}% (${pwm}/255)`);
					await fsp.writeFile(file, pwm);
				} catch (e) {
					await logger.log(`[amd] Error setting fan speed for GPU${gpu} ${speed}% (${pwm}/255): ${e}`)
					switch (e.code) {
						case "EACCES":
							await logger.log(`--> Access was denied! root is required for most changing settings`);
						  break;
						case "ENOENT":
							await logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
						  break;
						default:
							await logger.log(`--> Some other error occured trying to write to [${file}]`);
					}
				}
				await logger.log(`[amd] Fan speed set for GPU${gpu} ${speed}% (${pwm}/255)`);
			  break;
			case 'nvidia':
				await logger.log(`[nvidia] NVIDIA fan control not yet implemented, unable to set GPU${gpu} to ${speed}%`);
			  break;
			case 'intel':
				await logger.log(`[intel] Intel fan control not yet implemented, unable to set GPU${gpu} to ${speed}%`);
			  break;
		}
	}

	async setGPUFanMode(gpu, mode = "automatic") {
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				let file = `/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1_enable`;
				switch(mode) {
					case 'manual':
						try {
							await fsp.writeFile(file, `1`);
						} catch (e) {
							await logger.log(`[amd] Error setting fan mode for GPU${gpu}: ${e}`)
							switch (e.code) {
								case "EACCES":
									await logger.log(`--> Access was denied! root is required for most changing settings`);
								  break;
								case "ENOENT":
									await logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
								  break;
								default:
									await logger.log(`--> Some other error occured trying to write to [${file}]`);
							}
						}
						await logger.log(`[amd] Fan mode for GPU${gpu} changed to: manual`);
					  break;
					case 'automatic':
					default:
						try {
							await fsp.writeFile(file, `2`);
						} catch (e) {
							await logger.log(`[amd] Error setting fan mode for GPU${gpu}: ${e}`)
							switch (e.code) {
								case "EACCES":
									await logger.log(`--> Access was denied! root is required for most changing settings`);
								  break;
								case "ENOENT":
									await logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
								  break;
								default:
									await logger.log(`--> Some other error occured trying to write to [${file}]`);
							}
						}
						await logger.log(`[amd] Fan mode for GPU${gpu} changed to: automatic`);
				}
			  break;
			case 'nvidia':
				await logger.log(`[nvidia] NVIDIA fan control not yet implemented, unable to set GPU${gpu} to ${mode}`);
			  break;
			case 'intel':
				await logger.log(`[intel] Intel fan control not yet implemented, unable to set GPU${gpu} to ${mode}`);
			  break;
		}
	}

	async resetGPUPower(gpu) {
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				let file = `/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap`;
				try {
					await logger.log(`[amd] Resetting power limit for GPU${gpu} to default`);
					await fsp.writeFile(file, 0);
				} catch (e) {
					await logger.log(`[amd] Error setting power limit of ${power} watts for GPU${gpu}: ${e}`)
					switch (e.code) {
						case "EACCES":
							await logger.log(`--> Access was denied! root is required for most changing settings`);
						  break;
						case "ENOENT":
							await logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
						  break;
						default:
							await logger.log(`--> Some other error occured trying to write to [${file}]`);
					}
				}
				var power = await this.getPowerLimitWatts(gpu);
				await logger.log(`[amd] Power limit set to default (${power} watts) for GPU${gpu}`);
			  break;
			case 'nvidia':
				let fullpcidevice = this.GPUs[gpu].fullpcidevice;
				var power = this.GPUs[gpu].nv.nvidia_smi_log.gpu.power_readings.default_power_limit;
				power = power.substr(0,power.length-2);

				if (this.GPUs[gpu].nv.nvidia_smi_log.gpu.persistence_mode != "Enabled") {
					await logger.log(`[nvidia] persistence_mode will be enabled for setting power on NVIDIA GPUs`);
					await exec(`nvidia-smi -pm 1 --id=${fullpcidevice}`);
					await this.updateNV(gpu);
				}

				await exec(`nvidia-smi -pl ${power} --id=${fullpcidevice}`);			
				await logger.log(`[nvidia] Power limit set to default (${power} watts) for GPU${gpu}`);
				await this.updateNV(gpu);

				if (this.GPUs[gpu].nv.nvidia_smi_log.gpu.persistence_mode == "Enabled") {
					await logger.log(`[nvidia] persistence_mode will be disabled after setting default power on NVIDIA GPUs`);
					await exec(`nvidia-smi -pm 0 --id=${fullpcidevice}`);
				}

			  break;
			case 'intel':
				await logger.log(`[intel] Intel power control not yet implemented, unable to reset GPU${gpu} power limit`);
			  break;
		}		
	}

	async setGPUPower(gpu, power) {
		let max = await this.getPowerLimitMaxWatts(gpu);
		let min = await this.getPowerLimitMinWatts(gpu);

		if (process.getuid() != 0) {
			await logger.log(`root is required to set values`);
			process.exit(1);
		}
		
		if (power > max || power < min) {
			await logger.log(`Power limit ${power} is out of possible ranges for GPU${gpu}: ${min}-${max}`);
			process.exit(1);
		}

		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				if (power == 0) { power = 1; }
				let file = `/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap`;
				try {
					await logger.log(`[amd] Setting power limit for GPU${gpu} to ${power} watts`);
					await fsp.writeFile(file, power * 1000 * 1000);
				} catch (e) {
					await logger.log(`[amd] Error setting power limit of ${power} watts for GPU${gpu}: ${e}`)
					switch (e.code) {
						case "EACCES":
							await logger.log(`--> Access was denied! root is required for most changing settings`);
						  break;
						case "ENOENT":
							await logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
						  break;
						default:
							await logger.log(`--> Some other error occured trying to write to [${file}]`);
					}
				}
				await logger.log(`[amd] Power limit set to ${power} watts for GPU${gpu}`);
			  break;
			case 'nvidia':
				let fullpcidevice = this.GPUs[gpu].fullpcidevice;
				if (this.GPUs[gpu].nv.nvidia_smi_log.gpu.persistence_mode != "Enabled") {
					await logger.log(`[nvidia] persistence_mode will be enabled for setting power on NVIDIA GPUs`);
					await exec(`nvidia-smi -pm 1 --id=${fullpcidevice}`);
				}
				await exec(`nvidia-smi -pl ${power} --id=${fullpcidevice}`);			
				await logger.log(`[nvidia] Power limit set to ${power} watts for GPU${gpu}`);
			  break;
			case 'intel':
				await logger.log(`[intel] Intel power control not yet implemented, unable to set GPU${gpu} to ${power} watts`);
			  break;
		}
	}

	async getDriverVersion(gpu) {
		let ver = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				ver = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/driver/module/version`, `utf8`)).trim();
				// this is returning a not 'well-known' version number, ie: 5.2.0.19.50
				// the 'well-known' version is 19.50; I'm not sure how this will react on
				// other drivers or if we should do it like this or just leave the full 
				// version but I'd rather display the 'well-known' version that people
				// will understand and know and correlate to the actual driver they 
				// installed.
				let [a,b,c,d,e] = ver.split('.');
				ver = `${d}.${e}`;
			  break;
			case 'nvidia':
				ver = this.GPUs[gpu].nv.nvidia_smi_log.driver_version;
			  break;
		}
		return ver;
	}

	async getBIOSVersion(gpu) {
		let ver = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				ver = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/vbios_version`, `utf8`)).trim();
			  break;
			case 'nvidia':
				ver = this.GPUs[gpu].nv.nvidia_smi_log.gpu.vbios_version;
			  break;
		}
		return ver;
	}	

	async getGPUStatus(gpu) {
		this.GPUs[gpu].IRQ = await this.getIRQNumber(gpu);
		
		this.GPUs[gpu].pcilinkspeed = await this.getPCILinkSpeed(gpu);
		this.GPUs[gpu].pcilinkwidth = await this.getPCILinkWidth(gpu);
		
		this.GPUs[gpu].maxpcilinkspeed = await this.getPCIMaxLinkSpeed(gpu);
		this.GPUs[gpu].maxpcilinkwidth = await this.getPCIMaxLinkWidth(gpu);
		
		this.GPUs[gpu].gpu_busy = await this.getGPUBusy(gpu);
		this.GPUs[gpu].mem_busy = await this.getMemBusy(gpu);
		
		this.GPUs[gpu].memUsed = await this.getMemUsed(gpu);
		this.GPUs[gpu].memTotal = await this.getMemTotal(gpu);

		this.GPUs[gpu].memFree =
			(this.GPUs[gpu].memUsed != 'unknown' && this.GPUs[gpu].memTotal != 'unknown') ?
				this.GPUs[gpu].memTotal - this.GPUs[gpu].memUsed : 'unknown';

		this.GPUs[gpu].memUsedMB =
			(this.GPUs[gpu].memUsed != 'unknown' && this.GPUs[gpu].memTotal != 'unknown') ?
				(this.GPUs[gpu].memUsed/1000/1000).toFixed(1) : 'unknown';

		this.GPUs[gpu].memFreeMB =
			(this.GPUs[gpu].memUsed != 'unknown' && this.GPUs[gpu].memTotal != 'unknown') ?
				(this.GPUs[gpu].memFree/1000/1000).toFixed(1) : 'unknown';

		this.GPUs[gpu].memTotalMB =
			(this.GPUs[gpu].memTotal != 'unknown') ?
				(this.GPUs[gpu].memTotal/1000/1000).toFixed(1) : 'unknown';
		
		this.GPUs[gpu].memUsedPercent =
			(this.GPUs[gpu].memUsed != 'unknown' && this.GPUs[gpu].memTotal != 'unknown') ?
				((this.GPUs[gpu].memUsed / this.GPUs[gpu].memTotal) * 100).toFixed(2) : 'unknown';

		this.GPUs[gpu].memFreePercent =
			(this.GPUs[gpu].memUsed != 'unknown' && this.GPUs[gpu].memTotal != 'unknown') ?
				(100 - ((this.GPUs[gpu].memUsed / this.GPUs[gpu].memTotal) * 100)).toFixed(2) : 'unknown';

		this.GPUs[gpu].gpu_temperatureC = await this.getGPUCoreTemperature(gpu);
		this.GPUs[gpu].gpu_temperatureF = (((9/5) * this.GPUs[gpu].gpu_temperatureC) + 32).toFixed(2);

		this.GPUs[gpu].gpuClocks = await this.getGPUClocks(gpu);
		this.GPUs[gpu].memoryClocks = await this.getMemoryClocks(gpu);

		this.GPUs[gpu].gpu_mhz = await this.getCurrentGPUClock(gpu);
		this.GPUs[gpu].mem_mhz = await this.getCurrentMemoryClock(gpu);

		this.GPUs[gpu].gpuProfileMhz = await this.getCurrentGPUClockProfile(gpu);
		this.GPUs[gpu].memoryProfileMhz = await this.getCurrentMemoryClockProfile(gpu);

		this.GPUs[gpu].powerLimitWatts = await this.getPowerLimitWatts(gpu);
		this.GPUs[gpu].powerLimitMinWatts = await this.getPowerLimitMinWatts(gpu);
		this.GPUs[gpu].powerLimitMaxWatts = await this.getPowerLimitMaxWatts(gpu);

		this.GPUs[gpu].powerUsage = await this.getPowerUsage(gpu);
		this.GPUs[gpu].powerUsageWatts = this.GPUs[gpu].powerUsage / 1000;

		this.GPUs[gpu].vddgfx = await this.getVddGfx(gpu);

		this.GPUs[gpu].fan = await this.getFanInfo(gpu);

		this.GPUs[gpu].driver_version = await this.getDriverVersion(gpu);
		this.GPUs[gpu].vbios_version = await this.getBIOSVersion(gpu);

		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				this.GPUs[gpu].gpuClocksPrintable = '';
				for (let [id,clk] of this.GPUs[gpu].gpuClocks.entries()) {
					let mhz = clk.mhz;
					if (clk.active) this.GPUs[gpu].gpuClocksPrintable +=`${ansi.FgBrMagenta}[`;
					this.GPUs[gpu].gpuClocksPrintable += mhz;
					if (clk.active) {
						this.GPUs[gpu].gpuClocksPrintable +=`]${ansi.FgBrCyan}`;
						this.GPUs[gpu].gpuClockProfile = clk.id;
					}
					if (id < this.GPUs[gpu].gpuClocks.length-1) this.GPUs[gpu].gpuClocksPrintable += ", ";
				}

				this.GPUs[gpu].memoryClocksPrintable = '';
				for (let [id,clk] of this.GPUs[gpu].memoryClocks.entries()) {
					let mhz = clk.mhz;
					if (clk.active) this.GPUs[gpu].memoryClocksPrintable +=`${ansi.FgBrMagenta}[`;
					this.GPUs[gpu].memoryClocksPrintable += mhz;
					if (clk.active) {
						this.GPUs[gpu].memoryClocksPrintable +=`]${ansi.FgBrCyan}`;
						this.GPUs[gpu].memoryClockProfile = clk.id;
					}
					if (id < this.GPUs[gpu].memoryClocks.length-1) this.GPUs[gpu].memoryClocksPrintable += ", ";
				}
			  break;
			case 'nvidia':
				this.GPUs[gpu].deviceName = this.GPUs[gpu].nv.nvidia_smi_log.gpu.product_name;
			  break;
		}
	}

	showUsage() {
		const usageTemplate = 
///////////////////////////////////////////////////////////////////////////////
// Usage CLI Template                                                        //
///////////////////////////////////////////////////////////////////////////////
`${$me} v${$version}     ${$copyright}       ${$license}

${$me} shows statistics and manipulates power limit settings for GPUs on
Linux through various interfaces provided by manufacturer's drivers, for
example, using the sysfs interface to interact with the amdgpu driver.

Most commands will execute the command and exit. For example, using
'${$me} fan 50% 0' to set fan speed to 50% for GPU 0, gpumgr will simply
set it once and exit.

If you want fan speed monitoring or curve control or to use the web interface,
you must start the daemon. Once the daemon is running, you can manage settings
for your GPUs at http://${this.serviceHost}:${this.servicePort} - or on whatever port you specified.

Usage:

  ${$me} [command] <gpu> <options>

  If <gpu> is omitted from any command, GPU0 is assumed.

  <gpu> can be a comma separated list of GPU numbers.
  <gpu> can be set to 'all' to affect ALL GPUs
  <gpu> can be set to 'amd' to affect all AMD GPUs
  <gpu> can be set to 'nvidia' to affect all Nvidia GPUs
  <gpu> can be set to 'intel' to affect all Intel GPUs

  Commands with no options or only GPU specified:

    help | --help | -h       Display this help message
    list <gpu>               List available GPUs and their GPU#
    show <gpu>               Show detailed statistics for <gpu>
    status <gpu>             Same as above
    power <percent> <gpu>    Set <gpu>'s power target to <percent>
    power reset <gpu>        Reset default power limit for <gpu>
    recover <gpu>            Try driver recovery mechanism for <gpu>
    fan enable <gpu>         Enable manual fan control for <gpu>
    fan disable <gpu>        Disable manual fan control for <gpu>
    fan [percent] <gpu>      Set <gpu>'s fan speed to <percent>
    start <options>          Starts the ${$me} service
    restart                  Soft Restarts the ${$me} service
    stop                     Stops the ${$me} service
    force restart            Forcibly Restarts the ${$me} service
    force stop               Forcibly Kills the ${$me} service

  Options for Commands with Options:
  
    [any]                    Options for any command
    
      -g | --no-colors       Disable ANSI Color formatting (colors 
                             are automatically disabled if terminal
                             is detected to not support color)

    start                    Starts the ${$me} background service

      --port <number>        Set which IPv4 port to listen on for
                             HTTP requests (eg. 1969, default is ${this.servicePort})

      --wsport <number>      Set which IPv4 port to listen on for
                             WebSocket requests (eg. 1970, default is
                             HTTP request port + 2, so the port would
                             default to ${this.servicePort+2} if --port is not set)

      --host <ip>            Set which IPv4 host to listen on.
                             (eg. 0.0.0.0 or 127.0.0.1, default is
                             ${this.serviceHost})

      --threads <#>          Number of worker threads for web service
                             (defaults to number of cores, up to 2)
Examples:

  ${$me} show nvidia             Show status of all Nvidia GPUs
  ${$me} list Intel              List all Intel GPU#s
  sudo ${$me} fan enable 0       Enable manual fan control for GPU0
  sudo ${$me} fan disable all    Enable auto fan control for all GPUs
  sudo ${$me} fan 100% 0         Set GPU0 fan speed to 100%
  sudo ${$me} start --port 4200  Start the background service on port 4200
`;
///////////////////////////////////////////////////////////////////////////////

		console.log(usageTemplate);
	}

	async listGPU(gpu) {
		let productName = 'Unknown', post = `${ansi.Reset}`, vendorColored = '', teamColor = '', teamColorName = '', tempColor = '';
		await this.getGPUStatus(gpu);

		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				vendorColored = `${ansi.FgRed}AMD${ansi.Reset}`;
				teamColor = `${ansi.FgRed}`; teamColorName='Red';
			  break;
			case 'nvidia':
				vendorColored = `${ansi.FgGreen}NVIDIA${ansi.Reset}`;
				teamColor = `${ansi.FgGreen}`; teamColorName='Green';
				productName = `${this.GPUs[gpu].nv.nvidia_smi_log.gpu.product_name}${ansi.Reset}`;
			  break;
			case 'intel':
				vendorColored = `${ansi.FgBrBlue}Intel${ansi.reset}`;
				teamColor = `${ansi.FgBrBlue}`; teamColorName='Blue?';
			  break;
			default:
		}

		const listTemplate =
///////////////////////////////////////////////////////////////////////////////
// List GPUs CLI Template                                                    //
///////////////////////////////////////////////////////////////////////////////		 
`${ansi.FgCyan}GPU${gpu}: Vendor: ${vendorColored} ${teamColor}${productName} ${ansi.FgBrMagenta}(${this.GPUs[gpu].vendorid}:${this.GPUs[gpu].deviceid} @ ${this.GPUs[gpu].pcidevice})${ansi.Reset}`;
///////////////////////////////////////////////////////////////////////////////	
		console.log(listTemplate);
	}

	async showStatus(gpu) {
		let pre = '', post = `${ansi.Reset}`, vendorColored = '', teamColor = '', teamColorName = '', tempColor = '';
		logger.log(`Showing status for GPU${gpu}`)

		await this.getGPUStatus(gpu);

		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				vendorColored = `${ansi.FgRed}AMD${ansi.Reset}`;
				teamColor = `${ansi.FgRed}`; teamColorName='Red';
				pre = `${ansi.FgCyan}GPU${gpu}:${ansi.Reset} ${ansi.FgRed}amdgpu-${this.GPUs[gpu].driver_version}${ansi.Reset}`;
			  break;
			case 'nvidia':
				vendorColored = `${ansi.FgGreen}NVIDIA${ansi.Reset}`;
				teamColor = `${ansi.FgGreen}`; teamColorName='Green';
				pre = `${ansi.FgCyan}GPU${gpu}:${ansi.Reset} ${ansi.FgGreen}${this.GPUs[gpu].nv.nvidia_smi_log.gpu.product_name}${ansi.Reset}`;
				post = `${ansi.FgCyan}GPU${gpu}:${ansi.Reset} WARNING: not all values are supported for ${vendorColored} yet!${ansi.Reset}\n`;
			  break;
			case 'intel':
				vendorColored = `${ansi.FgBrBlue}Intel${ansi.reset}`;
				teamColor = `${ansi.FgBrBlue}`; teamColorName='Blue?';
				pre = `${ansi.FgCyan}GPU${gpu}:${ansi.Reset} WARNING: No ${vendorColored} Support Yet!`; post=`${pre}\n`;
			  break;
			default:
				pre = `${ansi.FgCyan}GPU${gpu}:${ansi.Reset} WARNING: Unknown GPU Type!!`; post=`${pre}\n`;
		}		

		if (this.GPUs[gpu].gpu_temperatureC >= 0) tempColor=ansi.FgGreen;
		if (this.GPUs[gpu].gpu_temperatureC >= 40) tempColor=ansi.FgBrGreen;
		if (this.GPUs[gpu].gpu_temperatureC >= 50) tempColor=ansi.FgYellow;
		if (this.GPUs[gpu].gpu_temperatureC >= 60) tempColor=ansi.FgBrYellow;
		if (this.GPUs[gpu].gpu_temperatureC >= 65) tempColor=ansi.FgRed;
		if (this.GPUs[gpu].gpu_temperatureC >= 70) tempColor=ansi.FgBrRed;

		const statusTemplate =
///////////////////////////////////////////////////////////////////////////////
// Status CLI Template                                                       //
///////////////////////////////////////////////////////////////////////////////
`
${pre}
${ansi.FgCyan}GPU${gpu}: ${teamColor}(Team ${teamColorName}) ${vendorColored}${teamColor} Driver Version: ${ansi.FgYellow}${this.GPUs[gpu].driver_version}
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrRed} VBIOS Version: ${ansi.FgYellow}${this.GPUs[gpu].vbios_version}
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} PCIe Device Bus Address: ${ansi.FgYellow}${this.GPUs[gpu].pcidevice}${ansi.FgBrBlue} @ ${ansi.FgYellow}IRQ ${this.GPUs[gpu].IRQ}
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Link Speed is ${ansi.FgBrGreen}${this.GPUs[gpu].pcilinkwidth}x [${this.GPUs[gpu].pcilinkspeed}] ${ansi.FgBrBlue}(Maximum is ${ansi.FgBrGreen}${this.GPUs[gpu].maxpcilinkwidth}x [${this.GPUs[gpu].maxpcilinkspeed}]${ansi.FgBrBlue})
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Vendor ID: ${teamColor}0x${this.GPUs[gpu].vendorid} / ${vendorColored} 
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Device ID: ${teamColor}0x${this.GPUs[gpu].deviceid} / ${this.GPUs[gpu].deviceName}
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Sub-Vendor ID: ${teamColor}0x${this.GPUs[gpu].subvendorid} / ${this.GPUs[gpu].subvendorname}
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Sub-Device ID: ${teamColor}0x${this.GPUs[gpu].subdeviceid} / ${this.GPUs[gpu].subdevicename}
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Current ${ansi.FgBrGreen}GPU Usage${ansi.FgBrBlue} is ${ansi.FgBrCyan}${this.GPUs[gpu].gpu_busy}%
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Current ${ansi.FgBrYellow}VRAM Activity${ansi.FgBrBlue} is ${ansi.FgBrCyan}${this.GPUs[gpu].mem_busy}%
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} VRAM Total: ${ansi.FgBrGreen}${this.GPUs[gpu].memTotalMB} MiB ${ansi.FgBrCyan}(${this.GPUs[gpu].memTotal} bytes)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} VRAM Used: ${ansi.FgBrGreen}${this.GPUs[gpu].memUsedPercent}% / ${this.GPUs[gpu].memUsedMB} MiB ${ansi.FgBrCyan}(${this.GPUs[gpu].memUsed} bytes)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} VRAM Free: ${ansi.FgBrGreen}${this.GPUs[gpu].memFreePercent}% / ${this.GPUs[gpu].memFreeMB} MiB ${ansi.FgBrCyan}(${this.GPUs[gpu].memFree} bytes)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Temperature is ${tempColor}${this.GPUs[gpu].gpu_temperatureC}°C (${this.GPUs[gpu].gpu_temperatureF}°F)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Current ${ansi.FgBrGreen}GPU core speed${ansi.FgBrBlue} is ${ansi.FgBrCyan}${this.GPUs[gpu].gpu_mhz} mHz
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Current ${ansi.FgBrYellow}memory speed${ansi.FgBrBlue} is ${ansi.FgBrCyan}${this.GPUs[gpu].mem_mhz} mHz
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Available ${ansi.FgBrGreen}GPU clocks${ansi.FgBrCyan} ${this.GPUs[gpu].gpuClocksPrintable}
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Available ${ansi.FgBrYellow}Memory clocks${ansi.FgBrCyan} ${this.GPUs[gpu].memoryClocksPrintable}
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Current ${ansi.FgBrGreen}GPU Profile:${ansi.FgBrMagenta} ${this.GPUs[gpu].gpuClockProfile} ${ansi.FgBrCyan}@ ${this.GPUs[gpu].gpuProfileMhz} mHz (${this.GPUs[gpu].gpu_mhz} mHz actual)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Current ${ansi.FgBrYellow}Memory Profile:${ansi.FgBrMagenta} ${this.GPUs[gpu].memoryClockProfile} ${ansi.FgBrCyan}@ ${this.GPUs[gpu].memoryProfileMhz} mHz (${this.GPUs[gpu].mem_mhz} mHz actual)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Power limit is ${ansi.FgBrGreen}${this.GPUs[gpu].powerLimitWatts} watts ${ansi.FgBrCyan}(Min: ${this.GPUs[gpu].powerLimitMinWatts} watts - Max: ${this.GPUs[gpu].powerLimitMaxWatts} watts)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Power usage is ${ansi.FgBrGreen}${this.GPUs[gpu].powerUsageWatts} watts ${ansi.FgBrCyan}(${this.GPUs[gpu].powerUsage} mW)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Voltage is currently ${ansi.FgBrGreen}${this.GPUs[gpu].vddgfx} mV ${ansi.FgBrCyan}(${this.GPUs[gpu].vddgfx/1000} V)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Fan speed for is ${ansi.FgBrGreen}${this.GPUs[gpu].fan.percent}% ${ansi.FgBrCyan}(${this.GPUs[gpu].fan.rpm} RPM, Min: ${this.GPUs[gpu].fan.rpm_min} RPM - Max: ${this.GPUs[gpu].fan.rpm_max} RPM)
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Fan control is set to ${ansi.FgBrYellow}${this.GPUs[gpu].fan.mode} ${(this.GPUs[gpu].fan.mode == 'automatic')?"(target: "+this.GPUs[gpu].fan.target+" RPM)":''}
${post}`;
///////////////////////////////////////////////////////////////////////////////

		console.log(statusTemplate);
	}
}

(new gpuManager()).initialize();