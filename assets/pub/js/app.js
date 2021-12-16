class gpumgrUI {
	constructor() {}
	initialize() {
		console.log("app.js!");
		let test = new testApp();
		console.log(test.initialize());
	}
}

let gpumgr = new gpumgrUI();

window.addEventListener(`load`, (ev) => {
	gpumgr.initialize();
});
