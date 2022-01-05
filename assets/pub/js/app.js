/* (C) 2022 Shaped Technologies | GPL v3 */

class gpumgrUI {
	constructor() {
		this.data = JSON.parse(_data);

		this.events=[];

		this.wsHandler = new webSocketHandler(this);


		//*::TODO:: should probably stuff this in a config file or something, well, we do eventually need a card database;
		//*::TODO:: and an online card database but, do we self-host, github host? on that topic, updates? and ask permission to call out!
		//*::TODO:: and db stuff; static json? something else? db for settings? or config file? both? db for webapp settings config for gfx?
		this.productTypeImages = [
			{	type: 'GeForce', vendor: 'nvidia', image: 'nvidia-geforce-sq.png' },
			{	type: 'GTX', vendor: 'nvidia', image: 'nvidia-geforce-gtx-sq.png' },
			{	type: 'Max-Q', vendor: 'nvidia', image: 'nvidia-geforce-maxq-sq.png' },
			{	type: 'RTX', vendor: 'nvidia', image: 'nvidia-geforce-gtx-sq.png' },
			{	type: 'Titan', vendor: 'nvidia', image: 'nvidia-geforce-titan-sq.png' },
			{	type: 'Titan RTX', vendor: 'nvidia', image: 'nvidia-geforce-titan-rtx-sq.png' },
			{	type: 'Quadro', vendor: 'nvidia', image: 'nvidia-geforce-quadro-sq.png' },
			{	type: 'Quadro RTX', vendor: 'nvidia', image: 'nvidia-geforce-quadro-rtx-sq.png' },
			{	type: 'Radeon', vendor: 'amd', image: 'amd-radeon-logo-sq.png' },
			{	type: 'FirePro', vendor: 'amd', image: 'amd-firepro-logo-sq.png' },
			{	type: 'Vega', vendor: 'amd', image: 'amd-vega-logo-sq.png' },
			{	type: 'Iris', vendor: 'intel', image: 'intel-iris-xelogo-sq.png' },
			{	type: 'Arc', vendor: 'intel', image: 'intel-arc-logo-sq.png' }
		];		
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
		let ReactMainComponent = ReactDOM.render(
			React.createElement(MainComponent), 
			document.getElementById('mainContentArea')
		);

		ReactMainComponent.addChild({
			componentName: 'CardWrapper'
		});

		ReactMainComponent.state.children[0].ref.current.addChild({
			componentName: 'Card'
		})

	    menu_dashboard.addEventListener('click', (ev)=>{
	    }); 
	}
}

let gpumgr = new gpumgrUI();

window.addEventListener(`load`, (ev) => { 
    Array.from(document.querySelectorAll("*")).forEach((el,i)=>{ if (el.id) { window[el.id] = el; } });

	gpumgr.initialize();
});