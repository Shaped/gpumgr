/* (C) 2022 Shaped Technologies | GPL v3 */

class gpumgrUI {
	constructor() {
		this.data = JSON.parse(_data);

		this.events=[];

		this.wsHandler = new webSocketHandler(this);
	}

	async initialize() {
		this.loadReactComponents();
		
		this.sortable = new Sortable();

		window.addEventListener('sortableComponentMounted', (ev)=> {
			this.sortable.initialize();
		}, { once: true });

		Array.from(document.querySelectorAll(`.menu_toggle`)).forEach((el,i) => {
			el.addEventListener('click', (ev) => document.body.classList.toggle('menuHidden'));
		});

	    csstheme_selector.addEventListener('change', this.handle_themeSelect.bind(this));
	}

	handle_themeSelect(ev) {
		csstheme.href = `/css/${ev.target.value ?? 'default'}.css`;
	}

	loadReactComponents() {
		let GPUTable = new GPUTableFactory(this);

		ReactDOM.render(GPUTable.componentFactory(), document.getElementById('card-GPUTable'));
	}
}

let gpumgr = new gpumgrUI();

window.addEventListener(`load`, (ev) => { 
    Array.from(document.querySelectorAll("*")).forEach((el,i)=>{ if (el.id) { window[el.id] = el; } });

	gpumgr.initialize();
});