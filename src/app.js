#!/usr/bin/node
/* 
	gpumgr v0.01a
	(C) 2022 Shaped Technologies

	gpumgr is based on amdpwrman which was originally only for amdgpus
	this version will be for all types, but will start with amdgpus to
	begin with
*/

"use strict";


const util = require('util');
const child = require('child_process');

const exec = util.promisify(require('child_process').exec);

//const xmlconvert = require('xml-js');
const xmlParser = require('xml2json');

global.fsp = require('fs').promises;
global.fs = require('fs');

const websocketHandler = require("./websocketHandler.js");

const $me = `gpumgr`;
const $version = `0.02a`;
const $copyright = `(C) 2022 Jai B. (Shaped Technologies)`;
const $license = `GPLv3 License`;

class gpuManager {
	constructor() {
		this.GPUs = [];
		this.logFile = 'gpumgr.log';
		global.logger = require("./logger.js")(this);

		process.on('SIGINT', this.handleSignal.bind(this));
		process.on('SIGTERM', this.handleSignal.bind(this));
		process.on('SIGUSR2', this.handleSignal.bind(this));
	}

	async initialize() {
		this.handleArgumentsEarly();
		this.handleArguments();
	}

	handleArgumentsEarly() {
		switch (process.argv[2]) {
			case 'start':
			case 'stop':
			case '__child':
				logger.divertToFile();
			  break;
			default:
		};
	}

	async handleArguments() {
		if (process.argv[2] != 'start') {
			logger.log(`gpumgr ${$version} starting..`)
		}

		if (process.argv[2] != 'help'
		&& process.argv[2] != '-h'
		&& process.argv[2] != '--help') {
			await this.enumerateGPUs();
		} 

		switch (process.argv[2]) {
			case '-h':
			case '--help':
			case 'help':
			case 'usage':
			case 'wtf':
				this.showUsage()
			  break;
			case 'show':
				this.handleShowStatus();
			  break;
			case 'start':
				this.startDaemon();
				logger.divertToFile();
				await logger.log(`gpumgr ${$version} daemon started`)
				process.exit();
			  break;
			case '__child':
				process.on('beforeExit', this.beforeChildExit.bind(this));
				process.on('exit', this.handleChildExit.bind(this));
				await this.enumerateGPUs();
			  break;
			default:
				console.log(`Command line argument not understood: '${process.argv[2]}'`);
				this.showUsage()
		}
	}

	// no async code here! not even with await!
	beforeChildExit(code) {
		logger.log(`gpumgr daemon shutting down..`);
	}

	handleChildExit(code) {
		logger.log(`gpumgr daemon exiting.`);
		process.exit();
	}

	showUsage() {
		const usageTemplate = 
//////////////////////////////////////////////////////////////////////////
`
${$me} ${$version}	${$copyright}		${$license}

${$me} shows statistics and manipulates power limit settings for GPUs on Linux
through various interfaces provided by manufacturer's drivers, for example,
using the sysfs interface to interact with the amdgpu driver.

The original script (amdpwrman) was designed to be simple, easy to use and have
no dependencies, however, BASH scripting is kind of a pain so I decided to
rewrite this as a NodeJS app with an included (optional to use) web interface.

There will be an easy to use binary distribution of this, or you can just clone
the repo and run or build the script yourself.

Most commands will execute the command and exit. For example, using
'./gpumgr fan 50% 0' to set fan speed to 50% for GPU 0, gpumgr will simply set
it once and exit.

If you want fan speed monitoring or curve control or to use the web interface,
you must start the daemon. Once the daemon is running, you can manage settings
for your GPUs at http://127.0.0.1:1969 - or on whatever port you specified.

Usage:

  ${$me} [command] <gpu> <options>

  If <gpu> is omitted from any command, GPU0 is assumed.

  <gpu> can be a comma separated list of GPU numbers.
  <gpu> can be set to 'all' to affect ALL GPUs
  <gpu> can be set to 'amd' to affect all AMD GPUs
  <gpu> can be set to 'nvidia' to affect all Nvidia GPUs
  <gpu> can be set to 'intel' to affect all Intel GPUs

  Commands with no options or only GPU specified:

  ${$me} help | --help | -h 		Display this help message.
  ${$me} list <gpu>			List available GPUs and their GPU#
  ${$me} show <gpu> 			Show detailed statistics for <gpu>
  ${$me} status <gpu> 			Same as above
  ${$me} power <percent> <gpu>		Set <gpu>'s power target to <percent>
  ${$me} power reset <gpu>		Reset default power limit for <gpu>
  ${$me} recover <gpu>			Attempt driver recovery mechanism for <gpu>
  ${$me} fan enable <gpu>		Enable manual fan control for <gpu>
  ${$me} fan disable <gpu>		Disable manual fan control for <gpu>
  ${$me} fan [percent] <gpu>		Set <gpu>'s fan speed to <percent>
  ${$me} start <options>		Starts the gpumgr background service
  ${$me} stop 				Stops the gpumgr background service

Options for Commands with Options:

  ${$me} start 				Starts the gpumgr background service

  Options for 'start':
    --port <number>			Set which ipv4 port to listen on (eg. 1969)
    --host <ip>				Set which ipv4 host to listen on (eg. 0.0.0.0
					or 127.0.0.1)

Examples:

  ${$me} show nvidia 			Show status of all Nvidia GPUs
  ${$me} list intel 			List all Intel GPU#s
  ${$me} fan enable 0 			Enable manual fan control for GPU0
  ${$me} fan disable all 		Enable auto fan control for all GPUs
  ${$me} fan 100% 0 			Set GPU0 fan speed to 100%
  ${$me} start --port 4200		Start the background service on port 4200
`;
//////////////////////////////////////////////////////////////////////////

		console.log(usageTemplate);
	}

	async enumerateGPUs() {
		logger.log(`Enumerating GPUs..`);
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
					//let result = xmlconvert.xml2json(nvidiaQuery.stdout);
					nv = JSON.parse(xmlParser.toJson(nvidiaQuery.stdout));
				  break;
				case `8086`: vendorName = 'intel'; break;
			}

			logger.log(`Found GPU${gpu} from ${vendorName} (${vendorid}:${deviceid})`);

			let GPU = {
				gpu: gpu,
				card: card,
				fullpcidevice: fullpcidevice,
				almostfullpcidevice: almostfullpcidevice,
				pcidevice: pcidevice,
				vendorid: vendorid,
				vendorName: vendorName,
				subvendorid: subvendorid,
				subdeviceid: subdeviceid,
				deviceid: deviceid
			};

			if (hwmon != 'unknown') GPU.hwmon = hwmon;
			if (nv != 'unknown') GPU.nv = nv;
			
			this.GPUs.push(GPU);
		};
	}

	handleShowStatus() {
		let gpu = process.argv[3];

		switch (gpu) {
			case 'all':
				for (gpu of this.GPUs) this.showStatus(gpu.gpu);
			  break;
			case 'nvidia':
				for (gpu of this.GPUs)
					if (gpu.vendorName == 'nvidia')
						this.showStatus(gpu.gpu);
			  break;
			case 'amd':
				for (gpu of this.GPUs)
					if (gpu.vendorName == 'amd')
						this.showStatus(gpu.gpu);
			  break;
			case 'intel':
				for (gpu of this.GPUs)
					if (gpu.vendorName == 'intel')
						this.showStatus(gpu.gpu);
			  break;
			default:
				gpu = (Number.isInteger(parseInt(gpu))) ? process.argv[3] : 0;
				this.showStatus(gpu);
		}
	}

	async getHWMon(gpu) { 
		let ret = await fsp.readdir(`/sys/class/drm/card${gpu}/device/hwmon`);
		
		return ret[0];
	}

	async getFullPCIDevice(gpu) { return (await fsp.readlink(`/sys/class/drm/card${gpu}/device`)); }
	
	async getIRQNumber(gpu) { return (await fsp.readFile(`/sys/class/drm/card${gpu}/device/irq`, `utf8`)).trim(); }

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
		}
		return gpu_busy;
	}

	async getMemBusy(gpu) {
		let mem_busy = "unknown";
		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				mem_busy = (await fsp.readFile(`/sys/class/drm/card${gpu}/device/mem_busy_percent`, `utf8`)).trim();
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
			  break;		}
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
					mhz = (mhz.substr(-1,1) == `*`)?
					mhz.substring(0,mhz.length-2):
					mhz.substring(0,mhz.length-1);
					clocksArray.push({
						id:id,
						mhz:mhz,
						active:active
					});
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
					mhz = (mhz.substr(-1,1) == `*`)?
					mhz.substring(0,mhz.length-2):
					mhz.substring(0,mhz.length-1);
					clocksArray.push({
						id:id,
						mhz:mhz,
						active:active
					});
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
					if (mhz.substr(-1,1) == `*`) {
						current_mhz = mhz.substring(0,mhz.length-2);
					}
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
		};
		return fanInfo;
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
		this.GPUs[gpu].gpu_temperatureF = ((9/5) * this.GPUs[gpu].gpu_temperatureC) + 32;

		this.GPUs[gpu].gpuClocks = await this.getGPUClocks(gpu);
		this.GPUs[gpu].memoryClocks = await this.getMemoryClocks(gpu);

		this.GPUs[gpu].gpu_mhz = await this.getCurrentGPUClockProfile(gpu);
		this.GPUs[gpu].mem_mhz = await this.getCurrentMemoryClockProfile(gpu);

		this.GPUs[gpu].gpuProfileMhz = await this.getCurrentGPUClock(gpu);
		this.GPUs[gpu].memoryProfileMhz = await this.getCurrentMemoryClock(gpu);

		this.GPUs[gpu].powerLimitWatts = await this.getPowerLimitWatts(gpu);
		this.GPUs[gpu].powerLimitMinWatts = await this.getPowerLimitMinWatts(gpu);
		this.GPUs[gpu].powerLimitMaxWatts = await this.getPowerLimitMaxWatts(gpu);

		this.GPUs[gpu].powerUsage = await this.getPowerUsage(gpu);
		this.GPUs[gpu].powerUsageWatts = this.GPUs[gpu].powerUsage / 1000;

		this.GPUs[gpu].vddgfx = await this.getVddGfx(gpu);

		this.GPUs[gpu].fan = await this.getFanInfo(gpu);

		switch (this.GPUs[gpu].vendorName) {
			case 'amd':
				this.GPUs[gpu].gpuClocksPrintable = '';
				for (let [id,clk] of this.GPUs[gpu].gpuClocks.entries()) {
					let mhz = clk.mhz;
					if (clk.active) this.GPUs[gpu].gpuClocksPrintable +='[';
					this.GPUs[gpu].gpuClocksPrintable += mhz;
					if (clk.active) {
						this.GPUs[gpu].gpuClocksPrintable +=']';
						this.GPUs[gpu].gpuClockProfile = clk.id;
					}
					if (id < this.GPUs[gpu].gpuClocks.length-1) this.GPUs[gpu].gpuClocksPrintable += ", ";
				}

				this.GPUs[gpu].memoryClocksPrintable = '';
				for (let [id,clk] of this.GPUs[gpu].memoryClocks.entries()) {
					let mhz = clk.mhz;
					if (clk.active) this.GPUs[gpu].memoryClocksPrintable +='[';
					this.GPUs[gpu].memoryClocksPrintable += mhz;
					if (clk.active) {
						this.GPUs[gpu].memoryClocksPrintable +=']';
						this.GPUs[gpu].memoryClockProfile = clk.id;
					}
					if (id < this.GPUs[gpu].memoryClocks.length-1) this.GPUs[gpu].memoryClocksPrintable += ", ";
				}


			  break;
		}
	}

	async showStatus(gpu) {
		logger.log(`Showing status for GPU${gpu}`)

		await this.getGPUStatus(gpu);

		const statusTemplate =
`
GPU${gpu}: PCIe Device Bus Address: ${this.GPUs[gpu].pcidevice} on IRQ ${this.GPUs[gpu].IRQ}
GPU${gpu}: Link Speed is ${this.GPUs[gpu].pcilinkwidth}x [${this.GPUs[gpu].pcilinkspeed}] (Maximum is ${this.GPUs[gpu].maxpcilinkwidth}x [${this.GPUs[gpu].maxpcilinkspeed}])
GPU${gpu}: Vendor ID: 0x${this.GPUs[gpu].vendorid} / ${this.GPUs[gpu].vendorName} 
GPU${gpu}: Device ID: 0x${this.GPUs[gpu].deviceid} / ${this.GPUs[gpu].deviceName}
GPU${gpu}: Sub-Vendor ID: 0x${this.GPUs[gpu].subvendorid} / ${this.GPUs[gpu].subvendorname}
GPU${gpu}: Sub-Device ID: 0x${this.GPUs[gpu].subdeviceid} / ${this.GPUs[gpu].subdevicename}
GPU${gpu}: Current GPU Usage is ${this.GPUs[gpu].gpu_busy}%
GPU${gpu}: Current VRAM Activity is ${this.GPUs[gpu].mem_busy}%
GPU${gpu}: VRAM Total: ${this.GPUs[gpu].memTotalMB} MiB (${this.GPUs[gpu].memTotal} bytes)
GPU${gpu}: VRAM Used: ${this.GPUs[gpu].memUsedPercent}% used ${this.GPUs[gpu].memUsedMB} MiB (${this.GPUs[gpu].memUsed} bytes)
GPU${gpu}: VRAM Free: ${this.GPUs[gpu].memFreePercent}% free ${this.GPUs[gpu].memFreeMB} MiB (${this.GPUs[gpu].memFree} bytes)
GPU${gpu}: Temperature is ${this.GPUs[gpu].gpu_temperatureC} deg. C (${this.GPUs[gpu].gpu_temperatureF} deg. F)
GPU${gpu}: Current GPU core speed is ${this.GPUs[gpu].gpu_mhz} mHz
GPU${gpu}: Current memory speed is ${this.GPUs[gpu].mem_mhz} mHz
GPU${gpu}: Available GPU clocks ${this.GPUs[gpu].gpuClocksPrintable}
GPU${gpu}: Available Memory clocks ${this.GPUs[gpu].memoryClocksPrintable}
GPU${gpu}: Current GPU Profile: ${this.GPUs[gpu].gpuClockProfile} @ ${this.GPUs[gpu].gpuProfileMhz} mHz (${this.GPUs[gpu].gpu_mhz} mHz actual)
GPU${gpu}: Current Memory Profile: ${this.GPUs[gpu].memoryClockProfile} @ ${this.GPUs[gpu].memoryProfileMhz} mHz (${this.GPUs[gpu].mem_mhz} mHz actual)
GPU${gpu}: Power limit is ${this.GPUs[gpu].powerLimitWatts} watts (Min: ${this.GPUs[gpu].powerLimitMinWatts} watts - Max: ${this.GPUs[gpu].powerLimitMaxWatts} watts)
GPU${gpu}: Power usage is ${this.GPUs[gpu].powerUsageWatts} watts (${this.GPUs[gpu].powerUsage} mW)
GPU${gpu}: Voltage is currently ${this.GPUs[gpu].vddgfx} mV (${this.GPUs[gpu].vddgfx/1000} V)
GPU${gpu}: Fan speed for is ${this.GPUs[gpu].fan.percent}% (${this.GPUs[gpu].fan.rpm} RPM, Min: ${this.GPUs[gpu].fan.rpm_min} RPM - Max: ${this.GPUs[gpu].fan.rpm_max} RPM)
GPU${gpu}: Fan control is set to ${this.GPUs[gpu].fan.mode} ${(this.GPUs[gpu].fan.mode == 'automatic')?"(target: "+this.GPUs[gpu].fan.target+" RPM)":''}`;

		console.log(statusTemplate);
	}

	async handleSignal(signal) {
		switch (signal) {
			case 'SIGINT':
				logger.log("Caught SIGINT - cleaning up and exiting..");
				await this.stopDaemon();
				process.exit();
			  break;
			case 'SIGTERM':
				logger.log("Caught SIGTERM - cleaning up and exiting..");
				await this.stopDaemon();
				process.exit();
			case 'SIGUSR2':
				logger.log("Caught SIGUSR2 - soft-restarting..");
				await this.stopDaemon();
				logger.log("Stopped..");
				await asleep(2500);
				await this.startDaemon();
				logger.log("Done soft-restarting..");
			  break;
		}
	}

	async startDaemon() {
		this.childProcess = child.fork(__filename, ['__child'], {detached:true});
	}

	async stopDaemon() {
	}	
}

let gpumgr = new gpuManager();

gpumgr.initialize();