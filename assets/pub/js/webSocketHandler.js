class webSocketHandler {
	constructor(_parent) {
		this.parent = _parent;

		let serviceHost = (_serviceHost == '0.0.0.0')
			? window.location.hostname : _serviceHost;

		let servicePort = (_servicePort == '0')
			? window.location.port : _servicePort;		

		this.ws = new WebSocket(`ws://${serviceHost}:${servicePort}/`);

		this.ws.addEventListener('open', this.onOpen.bind(this));
		this.ws.addEventListener('close', this.onClose.bind(this));
		this.ws.addEventListener('message', this.onMessage.bind(this));
	}

	onOpen(ws) {
		console.log('ws opened');
		this.handleSubscription('data');
	}

	onClose(ws) {
		console.log('ws closed');
	}

	onMessage(msg) {
		console.log(`ws message: ${msg}`);
	}

	sendMessage(message) {
		this.ws.send(JSON.stringify(message));
	}

	handleSubscription(channel) {
		this.sendMessage({
			cmd : 'subscribe',
			data : channel
		});
	}

	handleUnsubscription(channel) {
		this.sendMessage({
			cmd : 'unsubscribe',
			data : channel
		});
	}
}