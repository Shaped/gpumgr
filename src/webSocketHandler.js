/* 
	gpumgr v0.0.9-development
	webSocketHandler.js - gpumgr websocket handler - based off freeform
	(C) 2022 Shaped Technologies (forbiddenera/Jai B.)

	gpumgr is a Linux-based GPU manager with console and web-based interfaces
*/

class webSocketHandler {
	constructor(_parent) { this.parent = _parent; }

	handleConnection(ws) {
		logger.log(`ws handleConnection: ${util.inspect(ws)}`);

		ws.on('message', this.handleMessage.bind(this, ws));
		ws.on('close', this.handleClose.bind(this, ws));
	}

	handleMessage(message, ws) {
		try {
			let parsed = JSON.parse(message);
		} catch (e) {
			logger.log(e);
			this.handleInvalidRequest(ws, `Invalid WebSocket Request`);
		}

		switch (parsed.cmd) {
			case 'subscribe':
				this.handleSubscription(parsed.channel, ws);
			  break;
			case 'unsubscribe':
				this.handleUnsubscription(parsed.channel, ws);
			  break;
			default:
				this.handleInvalidRequest(ws, `Invalid WebSocket Request`, parsed.cmd);
		}
	}

	handleSubscription(channel, ws) {
		switch (channel) {
			case 'data':
				//*::TODO::the master thread should do all data updates, fanc control, etc
				//*::TODO::then push those updates out to the worker threads! on which,
				//*::TODO::we can eventpush to the client..
				//*::TODO::do we need a timer here at all or just attach another evl?
			  break;
			default:
				this.handleInvalidRequest(ws, `Invalid Subscription Channel`, channel);
		}
	}

	handleUnsubscription(data, ws) {
		switch (channel) {
			case 'data':
			  break;
			default:
				this.handleInvalidRequest(ws, `Invalid Subscription Channel`, channel);
		}
	}

	handleClose(ws) {
		logger.log(`ws close: ${ws}`);
	}

	handleInvalidRequest(ws, ...args) {
		ws.send(JSON.stringify({
			`🤦‍♂️`:[...args]
		}));

		logger.log(...args);
	}
};

//export { webSocketHandler };
module.exports = webSocketHandler;