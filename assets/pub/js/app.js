/* (C) 2022 Shaped Technologies | GPL v3 */

class gpumgrUI {
	constructor() {
		this.data = JSON.parse(_data);

		this.wsHandler = new webSocketHandler(this);
	}

	initialize() {
		let GPUTable = new GPUTableFactory(this);

		ReactDOM.render(GPUTable.componentFactory(), document.getElementById('card-GPUTable'));
	}
}

let gpumgr = new gpumgrUI();

window.addEventListener(`load`, (ev) => { gpumgr.initialize(); });