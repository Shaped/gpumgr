/* (C) 2022 Shaped Technologies | GPL v3 */

class gpumgrUI {
	constructor() {
		this.data = JSON.parse(_data);

		let serviceHost = (_serviceHost == '0.0.0.0')
			? window.location.hostname : _serviceHost;
			
		let servicePort = (_servicePort == '0')
			? window.location.port : _servicePort;

		this.ws = new WebSocket(`ws://${serviceHost}:${servicePort}/`)
	}

	initialize() {
		let GPUTable = new GPUTableFactory(this);

		ReactDOM.render(GPUTable.componentFactory(), document.getElementById('card-GPUTable'));
	}
}

let gpumgr = new gpumgrUI();

window.addEventListener(`load`, (ev) => { gpumgr.initialize(); });