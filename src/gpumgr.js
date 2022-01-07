#!/usr/bin/node
/* 
	gpumgr v0.0.9-development
	gpumgr.js - gpumgr main class & entry point
	(C) 2022 Shaped Technologies (forbiddenera/Jai B.)

	gpumgr is a Linux-based GPU manager with console and web-based interfaces
*/
"use strict";

global.fs = require('fs');
global.fsp = require('fs').promises;
global.cluster = require('cluster');
global.util = require('util');
global.xmlParser = require('xml2json');

global.mmap = require('mmap-object'); //*::TODO:: wtf 1359 packages ?@!$ // tho seems to work, doesn't seem to even make much fatter mem wise ? i mean its supposed to save mem anyway 
										//*::TODO:: decide whether to use this or simply ipc/mp; have to use ipc/mp anyway so..but
										//*::TODO:: this would use less memory maybe "technically".. benchmark says about <=>
										// also there's mmap-io, seems smaller but not as high level
const path = require('path');
const os = require('os');
const pidusage = require('pidusage');
const performance = require('perf_hooks').performance;
const execPromise = util.promisify(require('child_process').exec);
const exec = require('child_process').exec;

global.$cores = os.cpus().length;
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

		this.workerSubscriptions = [];

		this.GPUs = [];
		this.stats = [];

		this.fd7=null;

		process.on('SIGINT', this.handleSignal.bind(this));
		process.on('SIGTERM', this.handleSignal.bind(this));
		process.on('SIGUSR1', this.handleSignal.bind(this));
		process.on('SIGUSR2', this.handleSignal.bind(this));
		process.on('uncaughtException', this.uncaughtExceptionHandler.bind(this));
		process.on('unhandledRejection', this.unhandledRejectionHandler.bind(this));
	}

	async initialize() {
		global.logger = require("./logger.js")(this);

		/*::DEVELOPMENT::*/this.developmentMode = true;

		if (this?.developmentMode) logger.setCurrentLogLevel(64);

		this.handleArgumentsEarly();
		this.handleArguments();
	}

	handleArgumentsEarly() {
		switch (process.argv[2]) {
			case 'start'	: logger.divertToFile(); break;
			case '__child'	: logger.divertToFile(); this.childProcess = process; break;
		}
	}

	async handleArguments() {
		process.argv[2] = process.argv[2] ?? 'usage';

		(process.argv[2] == '__child')
		? (cluster.isMaster)
			? logger.log(LOG_LEVEL_ALWAYS, `${$me} ${$version} service starting..`)
			: logger.log(LOG_LEVEL_DEBUG, `${$me} ${$version} worker #${cluster.worker.id} starting..`):null;

		switch (process.argv[2]) {
			case 'show' 	:
			case 'fan' 		:
			case 'power' 	:
			case 'list' 	: await this.enumerateGPUs(); }

		switch (process.argv[2]) {
			case 'show' 	:
			case 'fan'		:
			case 'power'	:
			case 'list'		:
			case '?'		:
			case '-g'		:
			case '-h'		:
			case '-?'		:
			case 'help'		:
			case '--help'	:
			case 'usage'	:
			case '--usage'	:
			case 'wtf'		:
			case '-wtf'		:
			case '--wtf'	: this.detectLoadANSI();
			}

		switch (process.argv[2]) {
			case '?'		:
			case '-g'		:
			case '-h'		:
			case '-?'		:
			case 'help'		:
			case '--help'	:
			case 'usage'	:
			case '--usage'	:
			case '-wtf'		:
			case '--wtf'	:
			case 'wtf'		: this.showUsage(); 	break;
			case 'fan'		: this.handleFans(); 		break;
			case 'power'	: this.handlePower(); 			break;
			case 'show'		: this.handleShowStatus(); 			break;
			case 'list'		: this.handleListGPUs(); 				break;
			case 'start'	: await this.forkOff(); process.exit();		break;
			case 'force'	:
				switch (process.argv[3]) {
					case 'nvidia-headless':
					case 'nv-headless':
						try {
							await this.enumerateGPUs();

							if (typeof process.argv[4] !== 'undefined'
							&& !Number.isInteger(parseInt(process.argv[4]))) {
								logger.log(`Invalid parameter: ${process.argv[4]}`);
								process.exit(1);
							}

							let gpu = (Number.isInteger(parseInt(process.argv[4]))) ? parseInt(process.argv[4]) : 0;

							if (this.GPUs[gpu].vendorName != 'nvidia') {
								(Number.isInteger(parseInt(process.argv[4])))
									? logger.log(`Error: GPU${gpu} is '${this.GPUs[gpu].vendorName}' not 'nvidia'`):null;

								logger.log(`Searching for first NVIDIA GPU...`);
								gpu = -1;

								for (let cgpu of this.GPUs) {
									if (cgpu.vendorName == 'nvidia') {
										gpu = cgpu.gpu;
										logger.log(`First 'nvidia' GPU found at GPU${gpu}!`);
										break;
									}
								}							
							}

							if (gpu == -1) {
								logger.log(`No NVIDIA GPUs found! Aborting!!`);
								process.exit(1);
							}

							logger.log(`Attempting to use 'nvidia-xconfig' create headless /etc/X11/xorg.conf using GPU${gpu}`);

							let [pciBusId, deviceIdFunction] = this.GPUs[gpu].pcidevice.split(`:`);
							let [deviceId, deviceFunction] = deviceIdFunction.split(`.`);

							let busid = `PCI:${parseInt(pciBusId)}:${parseInt(deviceId)}:${deviceFunction}`;

							let result = await execPromise(`nvidia-xconfig -a --cool-bits=28 --allow-empty-initial-configuration --busid=${busid}`);

							logger.log(`Success creating xorg.conf!`);
							/*::TODO:: if we want to start an x session too?
								should we also setup auto login? do we need login even ? if not setup we should meniton required
							export DISPLAY=:0
							startx -- $DISPLAY &
							sleep 5*/
							logger.log(LOG_LEVEL_DEVELOPMENT, `${result.stdout}`);
						} catch (e) {
							logger.log(`Failed creating xorg.conf!`);							
							logger.log(`${e.stderr.trim()}`);
							process.exit(1);
						}
					  break;
					case 'nvidia-coolbits':
					case 'nv-coolbits':
						if (typeof process.argv[4] !== 'undefined'
						&& !Number.isInteger(parseInt(process.argv[4]))) {
							logger.log(`Invalid parameter: ${process.argv[4]}`);
							process.exit(1);
						}

						let coolbits = (Number.isInteger(parseInt(process.argv[4]))) ? parseInt(process.argv[4]) : 28;

						logger.log(`Attempting to set coolbits to ${coolbits}..`);

						try {
							let result = await execPromise(`nvidia-xconfig --cool-bits=${coolbits}`);
							logger.log(`Success setting coolbits tp ${coolbits}.`);
							logger.log(LOG_LEVEL_DEVELOPMENT, `${result.stdout}`);
						} catch (e) {
							logger.log(`Failed setting coolbits!`);
							logger.log(`${e.stderr.trim()}`);
							process.exit(1);
						}
					  break;
					case 'restart':
						try {//*::TODO:: Figure out a way to save options (host/port/threads) on a force restart? or at very least (or both) allow to set options on force restart.
							//*::TODO:: almost done, took all fucking night. stupid undocumented shit.
							let pid = await this.getChildPID();
							logger.log(`${$me} attempting to query child [${pid}]`);

							try {
								await this.queryOOB(pid);
							} catch (e) {
								logger.log(`${$me} pingback failed, process will be killed. start it again manually. [${pid}]`);
								await this.killPID(pid);
								logger.log(`${$me} sent signal to stop daemon [${pid}]`);
								process.exit();
							}

							logger.log(`${$me} attempting to stop daemon [${pid}]`);
							await this.killPID(pid);
							logger.log(`${$me} attempting to start new daemon...`);
							await this.forkOff(true);
							logger.log(`${$me} ${$version} daemon has been force re-started [${this.childProcess.pid}]`);
						} catch (e) {
							logger.log(`${$me} unable to find daemon`);
						}
						
						process.exit();
					  break;
					case 'stop':
						try {
							let pid = await this.getChildPID();
							logger.log(`${$me} attempting to kill daemon [${pid}]`);
							process.kill(pid, "SIGTERM");
							logger.log(`${$me} sent signal to stop daemon [${pid}]`);
							process.exit();
						} catch (e) {
							logger.log(`${$me} unable to find daemon`);
						}
						
						process.exit();
					  break;
				}
			  break;
			case 'restart':
				try {
					let pid = await this.getChildPID();
					logger.log(`${$me} attempting to restart daemon [${pid}]`);
					await process.kill(pid, "SIGUSR2");
					logger.log(`${$me} sent signal to restart daemon [${pid}]`);
				} catch (e) {
					logger.log(`${$me} unable to find daemon`);
				}
			  break;
			case 'stop':
				try {
					let pid = await this.getChildPID();
					logger.log(`${$me} attempting to stop daemon [${pid}]`);
					process.kill(pid, "SIGINT");
					logger.log(`${$me} sent signal to stop daemon [${pid}]`);
					process.exit();
				} catch (e) {
					logger.log(`${$me} unable to find daemon`);
				}
			  break;
			case '__child':
				process.on('beforeExit', this.nothingLeftToDo.bind(this));
				process.on('exit', this.handleChildExit.bind(this));
				this.startDaemon();				
			  break;
			default:
				this.detectLoadANSI();
				console.log(`Command line argument not understood: '${process.argv[2]}'`);
				this.showUsage();
		}
	}

	detectLoadANSI() {
		global.ansi = require('./ansi.js')();
		(typeof process.stdout.getColorDepth === 'function')
		? (process.stdout.getColorDepth() == 1
			|| process.argv[process.argv.length-1] == '-g'
			|| process.argv[process.argv.length-1] == '--no-colors')
				? ansi.disableColor():null
		: ansi.disableColor();
	}

	async handleGPUArgument(arg, cb) {
		let regexp = /,/g;
		switch (arg) {
			case 'all': case 'nvidia': case 'amd': case 'intel':
				for (let cgpu of this.GPUs)
					(arg == 'all')
					? await cb(cgpu.gpu)
					: (cgpu.vendorName == arg)
						? await cb(cgpu.gpu)
						: null;
			  break;
			default:
				let gpus = [];
				if (typeof arg !== 'undefined') {
					let matches = arg.split(regexp);

					(matches[0]=='' && matches[1]=='')
					? ( logger.log(`Invalid value '${arg}' specified in GPU list.`), process.exit(1) ):null;

					if (matches.length > 1) {
						let i=0;
						for (let match of matches) { i++;
							if (!Number.isInteger(parseInt(match))) {
								switch (match) {
									case 'nvidia': case 'amd': case 'intel':
										for (let cgpu of this.GPUs)
											if (cgpu.vendorName == match) 
												gpus.push(cgpu.gpu);
									  break;
									default:
										(match == '' || !Number.isInteger(parseInt(match)))
										? ( logger.log(`Invalid value '${match}' specified in GPU list at position ${i}.`), 
											gpus.push(-1)
										):gpus.push(match);
								}
							} else {
								gpus.push(match);
							}
						}
					} else {
						if (!Number.isInteger(parseInt(arg))) {
							logger.log(`Invalid value '${arg}' specified in GPU list.`);
							process.exit(1);
						} else {
							gpus.push(arg);
						}
					}
				} else {
					gpus.push(0);
				}

				if (gpus.length > 1) {
					let uGPUs = [...new Set(gpus)];
					for (let gpu of uGPUs) (gpu != -1)
						? (typeof this.GPUs[gpu] === 'undefined')
							? logger.log(`GPU${gpu} not found!`)
							: await cb(gpu) : null;
				} else {
					let gpu = gpus[0];
					(typeof this.GPUs[gpu] === 'undefined')
					?	(typeof this.GPUs[0] === 'undefined')
						?( logger.log(`GPU${arg} not found - no GPU0 to fallback to.`), process.exit(1) )
						:( logger.log(`GPU${arg} not found - defaulting to GPU0.`), gpu = 0 )
					:null;
					await cb(gpu);
				}
		}
	}	

	async getChildPID() { return (fs.readFileSync(`/tmp/gpumgr.pid`, `utf8`)); }

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
				const net = require('net');			
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
						case '-port':
							(cluster.isMaster)?logger.log(`Warning: -port should be --port; proceeding anyway.`):null;
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
						case '-host':
							(cluster.isMaster)?logger.log(`Warning: -host should be --host; proceeding anyway.`):null;
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
						case '-threads':
							(cluster.isMaster)?logger.log(`Warning: -threads should be --threads; proceeding anyway.`):null;
						case '--threads':
							if (args[i+1].substr(0,1) != '-'
								&& Number.isInteger(parseInt(args[i+1]))
								&& parseInt(args[i+1]) >= 1 
								&& parseInt(args[i+1]) <= ($cores*4)
								&& parseInt(args[i+1]) <= 16) {
								let threads = args.splice(i+1,1)[0];
								this.serviceThreads = threads;
							} else if (args[i+1] == '-1') {
								this.serviceThreads = -1;
							} else {
								logger.log(`Invalid argument for --threads, '${args[i+1]}', threads must be a number between 2 and ${Math.max($cores*4, 16)} (# of logical CPU cores × 4 (${$cores*4}) or 16, whichever is less)`);
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
			await this.webHandler.startListening();

			if (cluster.isMaster) {
				logger.log(`${$me} ${$version} service started.`);				
				// cluster master work can be performed here. threads should enum as needed but perhaps we can mespas gpu control here.
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

				let interval=5*1000;
				fs.writeFileSync(8, `😎:${this.serviceHost}:${this.servicePort}:${this.serviceThreads}`);
				
				Object.keys(cluster.workers).forEach((id) => {
					cluster.workers[id].on('message', this.handleWorkerMessage.bind(this));
				});

				//this.shm = new mmap.Create('/tmp/gpumgr.shm');

				this.daemonIntervalFunction = async()=>{
					await this.enumerateGPUs();
					await this.getSystemInfo();

					let stats = {process:this.stats.process,
								system:this.stats.system};

					this.shm['data'] = JSON.stringify(stats);

					Object.keys(this.workerSubscriptions).forEach((worker) => {
						this.updateWorker(worker);
					});

					// logger.log(`${util.inspect(this.stats.process)}`);
					// logger.log(`${util.inspect(this.stats.process.totalMemory)}`);

					setTimeout(this.daemonIntervalFunction,interval);					
				};

				setTimeout(this.daemonIntervalFunction,interval);
			}
		} catch(e) {
			logger.log(`Unable to listen: ${e}`)
		}
	}

	async stopDaemon() {
		this.webHandler.stopListening();
		
		clearInterval(this.daemonInterval);

		logger.log(`${$me} ${$version} daemon shutting down.`);
	}

	updateWorker(worker) {
		cluster.workers[worker].send({
			cmd: 'updateData',
			data: {
				GPUs: this.GPUs,
				stats: this.stats
			}
		});		
	}

	async handleWorkerMessage(msg) {
		switch (msg.cmd) {
			case 'getStats':
				await this.enumerateGPUs();
				await this.getSystemInfo();
				this.updateWorker(msg.worker);
			  break;
			case 'subscribe':
				logger.log(`gpumgr.js worker subbing ${cluster.workers[msg.worker].process.pid}: ${msg.cmd}`);
				this.workerSubscriptions.push(msg.worker);
			  break;
			case 'unsubscribe':
				logger.log(`gpumgr.js worker unsubbing ${cluster.workers[msg.worker].process.pid}: ${msg.cmd}`);
				delete this.workerSubscriptions[msg.worker];
			  break;
		}
	}

	getSystemInfo() {
		return new Promise(async(resolve,reject) => {
			try {
				let pids=[];

				Object.keys(cluster.workers).forEach((id) => {
					pids.push(cluster.workers[id].process.pid);
				});

				pids.push(process.pid);

				let stats = await this.getPIDUsage(pids);

				let totalCPU=0;
				let totalMemory=0;

				Object.keys(stats).forEach((id) => {
					totalCPU+=stats[id].cpu;
					totalMemory+=stats[id].memory;
				});

				totalCPU=parseFloat(totalCPU.toFixed(2));

				let masterEVL = parseFloat((performance.eventLoopUtilization().utilization * 100).toFixed(2));

				this.stats.process = { totalCPU, totalMemory, masterEVL, stats };
				this.stats.system = {
					cpus: os.cpus(),
					arch: os.arch(),
					freemem: os.freemem(),
					totalmem: os.totalmem(),
					hostname: os.hostname(),
					load: os.loadavg(),
					release: os.release(),
					version: os.version(),
					network: os.networkInterfaces()
				}

				resolve();
			} catch (e) {
				reject(e);
			}
		});
	}

	async enumerateGPUs() {
		this.GPUs=[];
		logger.log(LOG_LEVEL_DEVELOPMENT, `Enumerating GPUs..`);
		let entries = fs.readdirSync(`/sys/class/drm`);

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

			let nvgpu = -1;
			let nvx = -1;

			switch(vendorid) {
				case `1002`: 
					hwmon = await this.getHWMon(gpu);
					vendorName = 'amd';
					productName = this.getAMDProductName(deviceid);
				  break;
				case `10DE`:
					vendorName = 'nvidia';
					nv = await this.getNVSMIQuery(fullpcidevice);
					productName = nv.nvidia_smi_log.gpu.product_name;
					//[nvgpu, nvx] = await this.getNVGPUNumAndXDisplay(nv);
					//let prix = await this.getPrimaryActiveXDisplay();
					//if (nvx != prix) logger.log(`The detected primary X display DISPLAY:${prix} does not seem to be attached to GPU${gpu} - ${nv.nvidia_smi_log.gpu.uuid} - this could result in issues trying to interact with NVIDIA GPUs.`);
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
			(nvgpu != -1)		? GPU.nvgpu = nvgpu:null;
			(nvx != -1)			? GPU.nvx   = nvx  :null;
			
			this.GPUs.push(GPU);
		};
	}

	getPIDUsage(pids) {
		return new Promise((resolve,reject) => {
			pidusage(pids, function(err,stats) {
				if (err) reject(err);
				resolve(stats);
			});
		});
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
		global.child = require('child_process');

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

				logger.log(`${$me} ${$version} daemon started [${this.childProcess.pid}]`);
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
				this.handleGPUArgument(gpu, async (cgpu) => { await this.setGPUFanMode(cgpu, 'manual'); });
			  break;
			case 'auto':
			case 'automatic':
			case 'disable':
				this.handleGPUArgument(gpu, async (cgpu) => { await this.setGPUFanMode(cgpu, 'automatic'); });
			  break;
			case 'curve':
				/*::TODO::*/
				logger.log(`fan curve mode not yet impemented`);
			  break;
			default:
				let speed = process.argv[3];
				if (speed.substr(-1,1)=="%") speed=speed.substr(0,speed.length-1);
				this.handleGPUArgument(gpu, async (cgpu) => { await this.setGPUFanSpeed(cgpu, speed); });
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
			this.handleGPUArgument(gpu, this.resetGPUPower.bind(this));
		} else {
			if (!Number.isInteger(parseInt(power))) {
				logger.log(`Invalid power value: ${power}`);
				process.exit(1);
			} else {
				power=parseInt(power);
			}

			await this.handleGPUArgument(gpu, async(cgpu) => {
				this.setGPUPower(cgpu, power);
			});
		}
	}

	async handleListGPUs() { await this.handleGPUArgument(process.argv[3], this.listGPU.bind(this)); }
	async handleShowStatus() { await this.handleGPUArgument(process.argv[3], this.showStatus.bind(this)); }

	getAMDProductName(deviceId) {
		let amdgpu_ids = require('./amdgpu_ids.js')();

		//*::TODO:: also match revision? update ids from local driver or online?
		return amdgpu_ids.ids[deviceId].productName.replace(`AMD `, ``);
	}

	//*::TODO:: find a better way of correlating nv/x? if needed even?
	//*::TODO:: must testing dual gpu with dual nv, and dual vendor with x working on all cases
	//*::TODO:: also just write the nv shim
	async getActiveXDisplays() {
		let result = await execPromise('for x in /tmp/.X11-unix/X*; do echo "${x#X}" | sed s/\\\\/tmp\\\\/.X11-unix\\\\/X//g; done');
		
		return result.stdout.split(`\n`).filter((i)=>(i!=''));
	}

	async getPrimaryActiveXDisplay() {
		let display = -1;

		if (typeof process.env.DISPLAY !== 'undefined') {
			return process.env.DISPLAY.replace(`:`,``);
		} else {
			let displays = await this.getActiveXDisplays();

			if (displays.length > 1) {
				//*::TODO:: should allow override of display environ? should also push through if already set?
				logger.log(`Found multiple X displays. This is not yet handled correctly! TODO..`).
				process.exit(1);
			} else 
				if (displays[0] != '') display = displays[0];
		}

		return display;
	}

	async getNVGPUNumAndXDisplay(nv) {

		try {
			let display = await this.getPrimaryActiveXDisplay();

			if (display == -1) {
				logger.log(`Unable to find X display; this is required for changing NVIDIA settings.`).
				process.exit(1);			
			}
			let result = await execPromise(`nvidia-settings -q [${nv.nvidia_smi_log.gpu.uuid}]/GpuUUID | grep Attribute`);
			let [_1,_2,_3,_4,_5] = result.stdout.split(`:`);
			let [xDisplay, $1] = _2.split(`[`);
			let [gpuNum, $2] = _3.split(`]`);

			return [gpuNum, xDisplay];
		} catch (e) {
			logger.log(e);
			process.exit(1);
		}
	}

	async getNVSMIQuery(fullpcidevice) {
		let nvidiaQuery = await execPromise(`nvidia-smi -x -q --id=${fullpcidevice}`);
		return JSON.parse(xmlParser.toJson(nvidiaQuery.stdout));
	}

	async updateNV(gpu) {
		let fullpcidevice = this.GPUs[gpu].fullpcidevice;
		let nvidiaQuery = await execPromise(`nvidia-smi -x -q --id=${fullpcidevice}`);		
		this.GPUs[gpu].nv = JSON.parse(xmlParser.toJson(nvidiaQuery.stdout));
	}

	async getHWMon(gpu) { return (fs.readdirSync(`/sys/class/drm/card${gpu}/device/hwmon`))[0]; }

	async getIRQNumber(gpu) { return (fs.readFileSync(`/sys/class/drm/card${gpu}/device/irq`, `utf8`)).trim(); }
	async getFullPCIDevice(gpu) { return (fs.readlinkSync(`/sys/class/drm/card${gpu}/device`)).toUpperCase() ; }
	async getPCIVendorID(gpu) { return (fs.readFileSync(`/sys/class/drm/card${gpu}/device/vendor`, `utf8`)).trim().substr(2,4).toUpperCase(); }
	async getPCIDeviceID(gpu) { return (fs.readFileSync(`/sys/class/drm/card${gpu}/device/device`, `utf8`)).trim().substr(2,4).toUpperCase(); }
	async getPCISubVendorID(gpu) { return (fs.readFileSync(`/sys/class/drm/card${gpu}/device/subsystem_vendor`, `utf8`)).trim().substr(2,4).toUpperCase(); }
	async getPCISubDeviceID(gpu) { return (fs.readFileSync(`/sys/class/drm/card${gpu}/device/subsystem_device`, `utf8`)).trim().substr(2,4).toUpperCase(); }
	async getPCILinkSpeed(gpu) { return (fs.readFileSync(`/sys/class/drm/card${gpu}/device/current_link_speed`, `utf8`)).trim(); }
	async getPCILinkWidth(gpu) { return (fs.readFileSync(`/sys/class/drm/card${gpu}/device/current_link_width`, `utf8`)).trim(); }
	async getPCIMaxLinkSpeed(gpu) { return (fs.readFileSync(`/sys/class/drm/card${gpu}/device/max_link_speed`, `utf8`)).trim(); }
	async getPCIMaxLinkWidth(gpu) { return (fs.readFileSync(`/sys/class/drm/card${gpu}/device/max_link_width`, `utf8`)).trim(); }

	async getGPUBusy(gpu) {
		let gpu_busy = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				gpu_busy = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/gpu_busy_percent`, `utf8`)).trim();
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
				mem_busy = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/mem_busy_percent`, `utf8`)).trim();
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
				mem_used = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/mem_info_vram_used`, `utf8`)).trim();
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
				mem_total = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/mem_info_vram_total`, `utf8`)).trim();
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
				temperature = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/temp1_input`, `utf8`)).trim();
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
				let clocks = fs.readFileSync(`/sys/class/drm/card${gpu}/device/pp_dpm_sclk`, 'utf8');
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
				let clocks = fs.readFileSync(`/sys/class/drm/card${gpu}/device/pp_dpm_mclk`, 'utf8');
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
				let clocks = fs.readFileSync(`/sys/class/drm/card${gpu}/device/pp_dpm_sclk`, 'utf8');
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
				let clocks = fs.readFileSync(`/sys/class/drm/card${gpu}/device/pp_dpm_mclk`, 'utf8');
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
				mhz = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/freq1_input`, `utf8`)).trim();
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
				mhz = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/freq2_input`, `utf8`)).trim();
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
				watts = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap`, `utf8`)).trim();
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
				watts = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap_min`, `utf8`)).trim();
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
				watts = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap_max`, `utf8`)).trim();
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
				usage = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_average`, `utf8`)).trim();
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
				vdd = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/in0_input`, `utf8`)).trim();
			  break;
		}
		return vdd;
	}

	async getDriverVersion(gpu) {
		let ver = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				ver = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/driver/module/version`, `utf8`)).trim();
				// this is returning a not 'well-known' version number, ie: 5.2.0.19.50
				// the 'well-known' version is 19.50; I'm not sure how this will react on
				// other drivers or if we should do it like this or just leave the full 
				// version but I'd rather display the 'well-known' version that people
				// will understand and know and correlate to the actual driver they 
				// installed.
				//
				// also, this file doesn't seem to exist with the 'linux amdgpu' driver, only the real amd driver..

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
				ver = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/vbios_version`, `utf8`)).trim();
			  break;
			case 'nvidia':
				ver = this.GPUs[gpu].nv.nvidia_smi_log.gpu.vbios_version;
			  break;
		}
		return ver;
	}	

	async getGPUStatus(gpu) {
		try {
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

			try {
				this.GPUs[gpu].driver_version = await this.getDriverVersion(gpu);
			} catch (e) {

				switch (this.GPUs[gpu].vendorName) {
					case 'amd':
						logger.log(`Unable to query GPU driver version; you may be using a non-vendor driver. Some information and controls will not be available.`);
						this.showGPUDriversMessage();
						this.GPUs[gpu].driver_version="unknown";
					 break; // apparently the more recent 'default' amdgpu kernel module can now do fans, temps, etc. also module is called the same as the official now that is confusing; default doesn't have a version though hence ...
					case 'nvidia': // for nvidia, if we have noveau or nothing, we're kinda hooped for anything as there's no sysfs interface. //*::TODO:: find out what noveau can tell us? and if it has any controls? doubtful but...
					case 'intel': //*::TODO:: intel release gpus one day?
					default:
						this.showGPUDriversMessage();
					  process.exit(1);
				}
			}

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
			}
		} catch (e) {
			logger.log(`Error probing information for GPU${gpu}`);
			logger.log(e);
			this.showGPUDriversMessage();
			process.exit(1);
		}
	}

	async getFanSpeedPWM(gpu) {
		let pwm = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				pwm = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1`, `utf8`)).trim();
			  break;
		}
		return pwm;
	}

	async getFanSpeedPct(gpu) {
		let pct = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				pct = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1`, `utf8`)).trim();
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
				rpm = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/fan1_input`, `utf8`)).trim();
				rpm = rpm.toLocaleString();
			  break;
		}
		return rpm;
	}

	async getFanSpeedMinRPM(gpu) {
		let rpm = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				rpm = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/fan1_min`, `utf8`)).trim();
				rpm = rpm.toLocaleString();
			  break;
		}
		return rpm;
	}

	async getFanSpeedMaxRPM(gpu) {
		let rpm = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				rpm = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/fan1_max`, `utf8`)).trim();
				rpm = rpm.toLocaleString();
			  break;
		}
		return rpm;
	}

	async getFanSpeedTarget(gpu) {
		let rpm = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				rpm = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/fan1_target`, `utf8`)).trim();
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

	async getFanMode(gpu) {
		let mode = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				mode = (fs.readFileSync(`/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1_enable`, `utf8`)).trim();
				switch(mode) {
					case '1':
						mode = "manual";
					  break;
					case '2':
						mode = "automatic";
					  break;
				}
			  break;
			case 'nvidia':
				try {
					let result = await execPromise(`nvidia-settings -q [${this.GPUs[gpu].nv.nvidia_smi_log.gpu.uuid}]/GPUFanControlState | grep Attribute`);
					let [_,__,___,mode] = result.stdout.trim().replace(`.`,``).split(`:`);

					switch(mode.trim()) {
						case '0':
							mode = "automatic";
						  break;				
						case '1':
							mode = "manual";
						  break;
					}
				} catch (e) {
					console.log('caught wtf')
					logger.log(e)
				}
			  break;

		}
		return mode;
	}

	async sudo(cmd) {
		let x = `sudo ${process.argv[0]} ${process.argv[1]} ${cmd}`;
		logger.log(LOG_LEVEL_DEVELOPMENT, `Need su access - calling [${x}]`);
		exec(x).stdout.pipe(process.stdout);
	}

	//*::TODO:: should we check if the fan is already set to the mode we're requesting? or should we just set it anyway if asked, even it it's likely a noop?
	async setGPUFanMode(gpu, mode = "automatic") {
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				let file = `/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1_enable`;

				if (process.getuid() != 0) {
					await this.sudo(`fan ${( (mode == "automatic") ? 'disable' : 'enable') } ${gpu}`);
				} else {
					switch(mode) {
						case 'manual':
							try {
								fsp.writeFile(file, `1`);
							} catch (e) {
								logger.log(`[${this.GPUs[gpu].vendorName}] Error setting fan mode for GPU${gpu}: ${e}`)
								switch (e.code) {
									case "EACCES":
										logger.log(`--> Access was denied! root is required for most changing settings`);
									  break;
									case "ENOENT":
										logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
									  break;
									default:
										logger.log(`--> Some other error occured trying to write to [${file}]`);
								}
							}
						  break;
						case 'automatic':
						default:
							try {
								fsp.writeFile(file, `2`);
							} catch (e) {
								logger.log(`[${this.GPUs[gpu].vendorName}] Error setting fan mode for GPU${gpu}: ${e}`)
								switch (e.code) {
									case "EACCES":
										logger.log(`--> Access was denied! root is required for most changing settings`);
									  break;
									case "ENOENT":
										logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
									  break;
									default:
										logger.log(`--> Some other error occured trying to write to [${file}]`);
								}
							}
					}

					logger.log(`[${this.GPUs[gpu].vendorName}] Fan mode for GPU${gpu} changed to: ${mode}`);
				}
			  break;
			case 'nvidia':
				let setMode = 0;
				if (mode == "manual") setMode = 1;

				try {
					await execPromise(`nvidia-settings -a [${this.GPUs[gpu].nv.nvidia_smi_log.gpu.uuid}]/GPUFanControlState=${setMode}`);

					logger.log(`[${this.GPUs[gpu].vendorName}] Fan mode for GPU${gpu} changed to: ${mode}`);
				} catch (e) {
					let lines = e.message.replace(/\n.*\n.*\n.*\n$/, '').trim().split(`\n`);
					for (let line of lines) {
						logger.log(line);
						if (line == `Unable to init server: Could not connect: Connection refused`) {
							logger.log(`This usually happens if the DISPLAY environment variable is not set correctly or if your user doesn't have correct authorization (don't run as root for NVIDIA!)`);
							logger.log(`Please make sure the DISPLAY variable is set to the X11 display attached to GPU${gpu} and make sure you are running ${$me} as the same user as the display!`);
						}
					}
				}
			  break;
			case 'intel':
				logger.log(`[${this.GPUs[gpu].vendorName}] Intel fan control not yet implemented, unable to set GPU${gpu} to ${mode}`);
			  break;
		}
	}

	async setGPUFanSpeed(gpu, speed = 100) {
		switch (this.GPUs[gpu].vendorName) {
			case 'amd': {
				let mode = await this.getFanMode(gpu);
				if (mode == 'automatic') await this.setGPUFanMode(gpu, 'manual');

				if (process.getuid() != 0) {
					await this.sudo(`fan ${speed} ${gpu}`);
				} else {
					let file = `/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/pwm1`;
					let pwm = parseInt((speed / 100) * 255);

					try {
						logger.log(`[amd] Setting fan speed for GPU${gpu} ${speed}% (${pwm}/255)`);
						await fsp.writeFile(file, pwm.toString());
					} catch (e) {
						logger.log(`[amd] Error setting fan speed for GPU${gpu} ${speed}% (${pwm}/255): ${e}`)
						switch (e.code) {
							case "EACCES":
								logger.log(`--> Access was denied! root is required for most changing settings`);
							  break;
							case "ENOENT":
								logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
							  break;
							default:
								logger.log(`--> Some other error occured trying to write to [${file}]`);
						}
					}
					logger.log(`[amd] Fan speed set for GPU${gpu} ${speed}% (${pwm}/255)`);
				}
			  break;
			}
			case 'nvidia': {
				let mode = await this.getFanMode(gpu);
				if (mode == 'automatic') await this.setGPUFanMode(gpu, 'manual');

				try {
					await execPromise(`nvidia-settings -a [${this.GPUs[gpu].nv.nvidia_smi_log.gpu.uuid}.fan]/GPUTargetFanSpeed=${speed}`);

					logger.log(`[${this.GPUs[gpu].vendorName}] Fan speed for GPU${gpu} changed to: ${speed}%`);
				} catch (e) {
					let lines = e.message.replace(/\n.*\n.*\n.*\n$/, '').trim().split(`\n`);
					for (let line of lines) {
						logger.log(line);
						if (line == `Unable to init server: Could not connect: Connection refused`) {
							logger.log(`This usually happens if the DISPLAY environment variable is not set correctly or if your user doesn't have correct authorization (don't run as root for NVIDIA!)`);
							logger.log(`Please make sure the DISPLAY variable is set to the X11 display attached to GPU${gpu} and make sure you are running ${$me} as the same user as the display!`);
						}
					}
				}				
			  break;
			 }
			case 'intel':
				logger.log(`[intel] Intel fan control not yet implemented, unable to set GPU${gpu} to ${speed}%`);
			  break;
		}
	}

	async resetGPUPower(gpu) {
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				let file = `/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap`;
				try {
					logger.log(`[amd] Resetting power limit for GPU${gpu} to default`);
					fsp.writeFile(file, `0`);
				} catch (e) {
					logger.log(`[amd] Error setting power limit of ${power} watts for GPU${gpu}: ${e}`)
					switch (e.code) {
						case "EACCES":
							logger.log(`--> Access was denied! root is required for most changing settings`);
						  break;
						case "ENOENT":
							logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
						  break;
						default:
							logger.log(`--> Some other error occured trying to write to [${file}]`);
					}
				}
				var power = await this.getPowerLimitWatts(gpu);
				logger.log(`[amd] Power limit set to default (${power} watts) for GPU${gpu}`);
			  break;
			case 'nvidia':
				let fullpcidevice = this.GPUs[gpu].fullpcidevice;
				var power = this.GPUs[gpu].nv.nvidia_smi_log.gpu.power_readings.default_power_limit;
				power = power.substr(0,power.length-2);

				if (this.GPUs[gpu].nv.nvidia_smi_log.gpu.persistence_mode != "Enabled") {
					logger.log(`[nvidia] persistence_mode will be enabled for setting power on NVIDIA GPUs`);
					await execPromise(`nvidia-smi -pm 1 --id=${fullpcidevice}`);
					await this.updateNV(gpu);
				}

				await execPromise(`nvidia-smi -pl ${power} --id=${fullpcidevice}`);			
				logger.log(`[nvidia] Power limit set to default (${power} watts) for GPU${gpu}`);
				await this.updateNV(gpu);

				if (this.GPUs[gpu].nv.nvidia_smi_log.gpu.persistence_mode == "Enabled") {
					logger.log(`[nvidia] persistence_mode will be disabled after setting default power on NVIDIA GPUs`);
					await execPromise(`nvidia-smi -pm 0 --id=${fullpcidevice}`);
				}

			  break;
			case 'intel':
				logger.log(`[intel] Intel power control not yet implemented, unable to reset GPU${gpu} power limit`);
			  break;
		}		
	}

	async setGPUPower(gpu, power) {
		let max = await this.getPowerLimitMaxWatts(gpu);
		let min = await this.getPowerLimitMinWatts(gpu);

		if (
			(this.GPUs[gpu].vendorName == "amd"
		|| this.GPUs[gpu].vendorName == "nvidia")
		&& process.getuid() != 0) {
			//*::DEVELOPMENT::*::TODO:: - root not required for nvidia-settings and is probably not wanted!
			//*::DEVELOPMENT::*::TODO:: - nvidia-settings requires the user from which X is run's permissions..?
			//*::DEVELOPMENT::*::TODO:: - however! it is required to use nvidia-smi to set values! confusing eh?
			//*::DEVELOPMENT::*::TODO:: - it is required for amd sysfs, but, libdrm for amdgpu might be better
			//*::DEVELOPMENT::*::TODO:: - for cmd line stuff, I suppose we could drop to sudo only w/needed
			//*::DEVELOPMENT::*::TODO:: - but what about when on gui> ?? prefer to not run as root ..
			logger.log(`root is currently required to set power values for AMD or NVIDIA GPUs`);
			process.exit(1);
		}
		
		if (power > max || power < min) {
			logger.log(`Power limit ${power} is out of possible ranges for GPU${gpu}: ${min}-${max}`);
			process.exit(1);
		}

		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				if (power == 0) { power = 1; }
				let file = `/sys/class/drm/card${gpu}/device/hwmon/${this.GPUs[gpu].hwmon}/power1_cap`;
				try {
					logger.log(`[amd] Setting power limit for GPU${gpu} to ${power} watts`);
					await fsp.writeFile(file, (power * 1000 * 1000).toString());
				} catch (e) {
					logger.log(`[amd] Error setting power limit of ${power} watts for GPU${gpu}: ${e}`)
					switch (e.code) {
						case "EACCES":
							logger.log(`--> Access was denied! root is required for most changing settings`);
						  break;
						case "ENOENT":
							logger.log(`--> For some reason the sysfs item doesn't exist! [${file}]`);
						  break;
						default:
							logger.log(`--> Some other error occured trying to write to [${file}]`);
					}
				}
				logger.log(`[amd] Power limit set to ${power} watts for GPU${gpu}`);
			  break;
			case 'nvidia':
				let fullpcidevice = this.GPUs[gpu].fullpcidevice;
				if (this.GPUs[gpu].nv.nvidia_smi_log.gpu.persistence_mode != "Enabled") {
					logger.log(`[nvidia] persistence_mode will be enabled for setting power on NVIDIA GPUs`);
					await execPromise(`nvidia-smi -pm 1 --id=${fullpcidevice}`);
				}
				await execPromise(`nvidia-smi -pl ${power} --id=${fullpcidevice}`);			
				logger.log(`[nvidia] Power limit set to ${power} watts for GPU${gpu}`);
			  break;
			case 'intel':
				logger.log(`[intel] Intel power control not yet implemented, unable to set GPU${gpu} to ${power} watts`);
			  break;
		}
	}

	showGPUDriversMessage() {
		logger.log(`Please ensure your GPU drivers are correctly installed.`);
		logger.log(`For this program to work properly, we need the vendor-specific drivers.`);
		logger.log(`This means the drivers that Linux comes (ie. 'amdgpu', 'radeon' or 'noveau' packages included with many Linux distributions) with will not be appropriate - instead use the vendor packages (ie. 'amdgpu' or amdgpu-pro' from AMD, 'nvidia-drm' from NVIDIA) available from their websites.`);
		logger.log(`Note: NVIDIA devices will require an instance of X11 running to control most card values. ${$me} can attempt to generate a working xorg.conf, see usage.`);
	}

	showUsage() {
		const lightPipe = `${ansi.Bright}|${ansi.Reset}`;
		const usageTemplate = 
///////////////////////////////////////////////////////////////////////////////
// Usage CLI Template                                                        //
///////////////////////////////////////////////////////////////////////////////
`${ansi.Bright+ansi.FgBrGreen}${$me} v${$version}     ${$copyright}       ${$license}${ansi.Reset}

${ansi.BBW+$me+ansi.Reset} shows statistics and manipulates power limit settings for GPUs on
Linux through various interfaces provided by manufacturer's drivers, for
example, using the sysfs interface to interact with the amdgpu driver.

If you want ${ansi.BBW}fan speed monitoring${ansi.Reset} or ${ansi.BBW}curve control${ansi.Reset} or ${ansi.BBW}to use the web interface${ansi.Reset},
you must ${ansi.Bright+ansi.FgBrCyan}start${ansi.Reset} the daemon. Once the daemon is running, you can manage settings
for your GPUs at ${ansi.FgBrCyan}http://${this.serviceHost}:${this.servicePort}${ansi.Reset} - or on the host/port you specified.

${ansi.BBW}Usage:${ansi.Reset}

  ${ansi.BBW}${$me} [command] ${ansi.FgBrBlue}<gpu>${ansi.Reset} ${ansi.Bright+ansi.FgBrYellow}<options>${ansi.Reset}

  If ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset} is omitted from any command, ${ansi.BBW}GPU0${ansi.Reset} is assumed.
  `//${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset} can be a comma separated list of GPU numbers. //*::TODO:: uhh don't think I ever did this..fix
  +`
  ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset} can be set to ${ansi.BBW}'all'${ansi.Reset} to affect ${ansi.BBW}ALL GPUs
  ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset} can be set to ${ansi.TeamRed}'amd'${ansi.Reset} to affect all ${ansi.TeamRed}AMD GPUs
  ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset} can be set to ${ansi.TeamGreen}'nvidia'${ansi.Reset} to affect all ${ansi.TeamGreen}Nvidia GPUs
  ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset} can be set to ${ansi.TeamBlue}'intel'${ansi.Reset} to affect all ${ansi.TeamBlue}Intel GPUs

  ${ansi.BBW}Commands with no options or only GPU specified:${ansi.Reset}

    help ${lightPipe} --help ${lightPipe} -h       Display this help message
    list ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset}               List available GPUs and their GPU#
    show ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset}               Show detailed statistics for ${ansi.FgBrBlue}<gpu>${ansi.Reset}
    status ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset}             Same as above
    power ${ansi.Bright+ansi.FgBrYellow}[percent] ${ansi.FgBrBlue}<gpu>${ansi.Reset}   ${ansi.BBW}*${ansi.Reset}Set ${ansi.FgBrBlue}<gpu>${ansi.Reset}'s power target to <percent>
    power reset ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset}       ${ansi.BBW}*${ansi.Reset}Reset default power limit for ${ansi.FgBrBlue}<gpu>${ansi.Reset}`
    +//recover ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset}           ${ansi.BBW}*${ansi.Reset}Try driver recovery mechanism for ${ansi.FgBrBlue}<gpu>${ansi.Reset}
    //*::TODO:: bleh didn't do that either
    `
    fan enable ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset}        ${ansi.BBW}*${ansi.Reset}Enable manual fan control for ${ansi.FgBrBlue}<gpu>${ansi.Reset}
    fan disable ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset}       ${ansi.BBW}*${ansi.Reset}Disable manual fan control for ${ansi.FgBrBlue}<gpu>${ansi.Reset}
    fan ${ansi.Bright+ansi.FgBrYellow}[percent] ${ansi.FgBrBlue}<gpu>${ansi.Reset}     ${ansi.BBW}*${ansi.Reset}Set ${ansi.FgBrBlue}<gpu>${ansi.Reset}'s fan speed to <percent>
    ${ansi.Bright+ansi.FgBrCyan}start ${ansi.FgBrYellow}<options>${ansi.Reset}          Starts the ${$me} service
    restart                  Soft Restarts the ${$me} service
    stop                     Stops the ${$me} service
    force restart            Forcibly Restarts the ${$me} service
    force stop               Forcibly Kills the ${$me} service
    force nv-headless ${ansi.Bright+ansi.FgBrBlue}<gpu>${ansi.Reset} ${ansi.BBW}*${ansi.Reset}Tries to create a valid xorg.conf
                             to run headless/minimal as X11 is
                             required to change NVIDIA settings,
                             automatically enables coolbits
    force nv-coolbits ${ansi.Bright+ansi.FgBrGreen}<cb>${ansi.Reset}  ${ansi.BBW}*${ansi.Reset}Tries to enable coolbits in xorg.conf
                             ${ansi.Bright+ansi.FgBrGreen}<cb>${ansi.Reset} is the coolbits value, defaults
                             to 28.
 
  (commands with a ${ansi.BBW}*${ansi.Reset} currently require ${ansi.FgBrWhite + ansi.Bright + ansi.Underscore}root${ansi.Reset} for ${ansi.TeamRed + ansi.Underscore}AMD${ansi.Reset} GPUs, [use ${ansi.Bright+ansi.FgBrYellow}sudo${ansi.Reset}],
  however, ${ansi.TeamGreen}NVIDIA${ansi.Reset} GPUs require ${$me} to be run as the same user as
  the X11 instance the GPU is running on, which is usually just your
  normal user account - this means ${ansi.BBW + ansi.Underscore}root${ansi.Reset}/${ansi.FgBrYellow}sudo${ansi.Reset} will ${ansi.FgBrWhite + ansi.Underscore}not${ansi.Reset} work for ${ansi.TeamGreen}NVIDIA${ansi.Reset}!)

  ${ansi.BBW}Options for Commands with Options:${ansi.Reset}
  
    ${ansi.FgBrYellow}[any]${ansi.Reset}                    ${ansi.BBW}Options for any command${ansi.Reset}
    
      -g ${lightPipe} --no-colors       Disable ANSI Color formatting (colors 
                             are automatically disabled if terminal
                             is detected to not support color)

    ${ansi.Bright+ansi.FgBrCyan}start${ansi.Reset}                    ${ansi.BBW}Starts the ${$me} background service${ansi.Reset}

      --port ${ansi.FgBrYellow}<number>${ansi.Reset}        Set which IPv4 port to listen on for
                             HTTP requests (eg. 1969, default is ${this.servicePort})

      --wsport ${ansi.FgBrYellow}<number>${ansi.Reset}      Set which IPv4 port to listen on for
                             WebSocket requests (eg. 1970, default is
                             HTTP request port + 2, so the port would
                             default to ${this.servicePort+2} if --port is not set)

      --host ${ansi.FgBrYellow}<ip>${ansi.Reset}            Set which IPv4 host to listen on.
                             (eg. 0.0.0.0 or 127.0.0.1, default is
                             ${this.serviceHost})

      --threads ${ansi.FgBrYellow}<#>${ansi.Reset}          Number of worker processes for web service
                             (defaults to number of cores, up to 4, minimum
                             is 2 threads, maximum is cores×4 [eg. ${$cores}×4=${$cores*4}
                             for your system] or the hardcoded max of 16)
${ansi.BBW}Examples:${ansi.Reset}

  ${$me} show nvidia          Show status of all Nvidia GPUs
  ${$me} list Intel           List all Intel GPU#s
  ${$me} start --port 4200    Starts the daemon & webapp on port 4200
  ${$me} fan enable 0         Enable manual fan control for GPU0
  ${$me} fan disable all      Enable auto fan control for all GPUs
  ${$me} fan 100% 0           Set GPU0 fan speed to 100%
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
${ansi.FgCyan}GPU${gpu}:${ansi.FgBrBlue} Device ID: ${teamColor}0x${this.GPUs[gpu].deviceid} / ${this.GPUs[gpu].productName}
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