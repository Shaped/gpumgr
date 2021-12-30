/* 
	gpumgr v0.0.9-development
	webSocketHandler.js - gpumgr websocket handler - based off freeform
	(C) 2022 Shaped Technologies (forbiddenera/Jai B.)

	gpumgr is a Linux-based GPU manager with console and web-based interfaces
*/
"use strict";

class webSocketHandler {
	constructor() {
		this.lastSocket=null;

		this.subscriptions = [];
	}

	handleConnection(ws) {
		this.lastSocket=ws;

		//logger.log(`ws handleConnection: ${util.inspect(ws)}`);
	//	ws.on('message', this.handleMessage.bind(this, ws));
		ws.on('close', this.handleClose.bind(this, ws));

		//worker.on('message', this.handleWorkerMessage.bind(this, ws));
	}

	handleWorkerMessage(message, ws) {
		logger.log(`ws worker received message: ${message}`);
	}

	handleMessage(message, ws) {
		this.lastSocket=ws;
		var parsed=null;

		try {
			parsed = JSON.parse(message);
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

	sendMessage(message, ws = null) {
		message = JSON.stringify(message);

		if (ws==null)
			if (this.lastSocket == null) 
				throw new Error("No socket to send message to!");
			else
				this.lastSocket.send(message);
		else
		//	ws.send(message);
			logger.log(message);
	}

	handleSubscription(channel, ws) {
		switch (channel) {
			case 'data':
				this.subscriptions[channel].push(ws);
				//*::TODO::the master thread should do all data updates, fanc control, etc
				//*::TODO::then push those updates out to the worker threads! on which,
				//*::TODO::we can eventpush to the client..
				//*::TODO::do we need a timer here at all or just attach another evl?

				/* 
					So, should the worker thread subscribe to the master thread when a client subscribes for updates?
					Or, should the worker threads always receive updates?

					If the worker thread subscribes, then we're not pushing data from the cluster master to all threads
					needlessly. We can also only do cluster master updates if someone is subscribed, saving GPU polling.

					If they always receive updates then page loads wouldn't *need* to call their own updates (although
					their data could only be a few seconds old if it didn't) but then we're pushing around objects in
					memory needlessly, basically shoving GPU data objects across to X threads regardless of whether a
					client is subscribed.

					If worker threads subscribe to the master triggering it to update based on web client subscriptions 
					then we need to arbitrate so that two clients on one thread doesn't result in two subscriptions pushing
					to the same worker thread, so we need to FILO the subscription?
				*/
			  break;
			default:
				this.handleInvalidRequest(ws, `Invalid Subscription Channel`, channel);
		}
	}

	handleUnsubscription(channel, ws) {
		switch (channel) {
			case 'data':
				delete this.subscriptions[channel];
			  break;
			default:
				this.handleInvalidRequest(ws, `Invalid Subscription Channel`, channel);
		}
	}

	handleClose(ws) {
		logger.log(`ws close: ${ws}`);
	}

	handleInvalidRequest(ws, ...args) {
		/*ws.send(JSON.stringify({
			"🤦‍♂️":[...args]
		}));*/

		logger.log(...args);
	}
};

//export { webSocketHandler };
module.exports = webSocketHandler;