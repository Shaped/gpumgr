/* 
	gpumgr v0.0.8-alpha
	webSocketHandler.js - gpumgr websocket handler - based off freeform
	(C) 2022 Shaped Technologies (forbiddenera/Jai B.)

	gpumgr is a Linux-based GPU manager with console and web-based interfaces
*/


class webSocketHandler {
    constructor(_parent) {
    	this.parent = _parent;
    }
    
    initialize() {}

    handleConnection(ws) {
    	logger.log(`ws handleConnection: ${util.inspect(ws)}`);

    	ws.on('message', this.handleMessage.bind(this, ws));
    	ws.on('close', this.handleClose.bind(this, ws));
    }

    handleMessage(message, ws) {
    	ws.send(JSON.stringify({answer:42}));
    	logger.log(`ws message: ${message}`);
    	logger.log(`ws message: ${ws}`);
    }

    handleClose(ws) {
    	logger.log(`ws close: ${ws}`);
    }
};

//export { webSocketHandler };
module.exports = webSocketHandler;