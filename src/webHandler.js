/* 
	gpumgr v0.0.9-development
	webHandler.js - gpumgr web handler - based off freeform
	(C) 2022 Shaped Technologies (forbiddenera/Jai B.)

	gpumgr is a Linux-based GPU manager with console and web-based interfaces
*/
"use strict";

class webHandler {
	constructor({
		_parent = null,
		host = '127.0.0.1',
		port = 1969,
		threads = -1
	}={}) {
		this.parent = _parent;
		this.host = host;
		this.port = port;

		this.workersAlive = 0;
		this.controller = new AbortController();

		this.threads = (threads == -1) 
						? ($cores < 4)
						 ? ($cores==1)
						  ? 2:$cores
						: 2 : threads;
	}
	
	startListening() {
		return new Promise(async(resolve,reject) => {
			if (cluster.isMaster) {
				this.parent.shm = new mmap.Create('/tmp/gpumgr.shm');

				for (var i=0;i<this.threads;i++) { 
					var worker = cluster.fork();

					worker.on('listening',this.workerListening.bind(this, worker, resolve));
					worker.on('disconnect',this.workerDisconnect.bind(this, worker, reject));
					worker.on('error',this.workerError.bind(this, worker, reject));
					worker.on('exit', this.workerExit.bind(this, worker, reject));

					worker.on('message', this.handleWorkerMessage.bind(this, worker));
				}

				// resolve();
			} else {
				this.parent.shm = new mmap.Open('/tmp/gpumgr.shm');
				const http = require('http');
				const express = require('express');
				const ws = require('ws');
				const wsHandler = require('./webSocketHandler.js');
		
				this.server = http.createServer();

				logger.log(LOG_LEVEL_DEBUG, `about to start listening ${this.host}:${this.port}`);
				
				cluster.worker.on('message', this.handleMasterMessage.bind(this));
				process.on('message', this.handleProcessMessage.bind(this));

				var app = new express();

				this.wsHandler = new wsHandler();

				this.wsServer = new ws.Server({
					server: this.server
				});
				
				this.wsServer.on('connection', this.wsHandler.handleConnection.bind(this.wsHandler));
				
				app.use(this.requestLogger.bind(this));

				app.use(express.static('../assets/pub/www'));

				app.use('/js/*', this.handleJSRequest.bind(this));
				app.use('/css/*', this.handleCSSRequest.bind(this));
				app.use('/img', express.static('../assets/pub/img'));

				app.use(this.handleRequest.bind(this));
				app.use('/', this.route_index.bind(this)); //*::TODO:: seems to route pages it shouldnt to /

				this.server.on('request',app);

				this.server.listen({
					host: this.host,
					port: this.port,
					signal: this.controller.signal
				}, () => {
					logger.log(LOG_LEVEL_VERBOSE, `http/ws started listening on ${this.host} @ ${this.port}`)
					resolve();
				})
			}
		})
	}

	compileSCSS(cssfile) {
		const sass = require('sass');

		let scssfile = cssfile.replace('.css','.scss');
		logger.log(LOG_LEVEL_DEVELOPMENT, `SCSS Cache Miss | Compiling styles/scss/${scssfile} > cache/css/${cssfile}`);

		let rendered = sass.renderSync({ file: `../assets/styles/scss/${scssfile}` }).css;

		let path = cssfile.split('/');
		let reconstructedPath = '';

		for (let i=0;i<path.length-1;i++) {
			if (i!=path.length-1) {
				reconstructedPath += path[i]+"/";
				try {
					fs.statSync(`../assets/cache/css/${reconstructedPath}`);
				} catch(e) {
					if (e.code == "ENOENT") {
						logger.log(`Path ${reconstructedPath} not found in cache/css/ - creating!`);
						fs.mkdirSync(`../assets/cache/css/${reconstructedPath}`);
					} else {
						logger.log(`Unexpected Error for ${reconstructedPath}: ${util.inspect(e)}`);
						throw new Error(e);
					}
				}
			} else {
				reconstructedPath += path[i];
			}
		}

		fs.writeFileSync(`../assets/cache/css/${cssfile}`, rendered, 'utf8');
		return rendered;
	}

	handleCSSRequest(req, res, next) {
		try {
			logger.log(LOG_LEVEL_DEVELOPMENT, `CSS Request received for ${req.params[0]}`);

			let scssfile = req.params[0].replace('.css','.scss');
			let result = null;

			try {
				result = fs.readFileSync(`../assets/pub/css/${req.params[0]}`);
			} catch (e) {
				logger.log(LOG_LEVEL_DEVELOPMENT, `CSS not found in static | Searching Cache for ${req.params[0]}`);

				// static css file doesn't exist, we need to look to scss cache or render
				if (e.code != "ENOENT") throw new Error(`Unknown Error trying to read pub/css/${req.params[0]}: ${e}`);
			}

			if (result == null) {
				try {
					var cache_stat = fs.statSync(`../assets/cache/css/${req.params[0]}`);
					logger.log(LOG_LEVEL_DEVELOPMENT, `CSS Cache Hit for ${req.params[0]}`);
				} catch (e) {
					try {
						if (result == null && e.code == "ENOENT") {// css cached file doesn't exist, we need to render
							result = this.compileSCSS(req.params[0]);
						} else if (result == null) throw new Error(`Unknown Error trying to read cache/css/${req.params[0]}: ${e}`);
					} catch (e) {
						logger.log(LOG_LEVEL_PRODUCTION, `Unable to compile ${scssfile}`);
						logger.log(LOG_LEVEL_DEBUG, util.inspect(e));
					}
				}

				try {
					var scss_stat = fs.statSync(`../assets/styles/scss/${scssfile}`);
				} catch (e) {
					if (e.code == "ENOENT") { // scss file doesn't exist?? we can try and push cached css if it exists, 
						if (typeof cache_stat !== 'undefined') {
							logger.log(LOG_LEVEL_PRODUCTION, `Warning: SCSS (styles/scss/${scssfile}) doesn't exist! Trying to fall back on cache (cache/css/${req.params[0]})`);
							result = fs.readFileSync(`../assets/cache/css/${req.params[0]}`);
						} else throw new Error(`404 - ${req.params[0]}`);
					} else throw new Error(`Unknown Error trying to read styles/scss/${req.params[0]}: ${e}`);
				}
	
				if (result == null && scss_stat.mtimeMs > cache_stat.mtimeMs) result = this.compileSCSS(req.params[0]);
				else result = fs.readFileSync(`../assets/cache/css/${req.params[0]}`);
			}

			res.type(`text/css`);
			res.send( result );
		} catch (e) {
			logger.log(LOG_LEVEL_PRODUCTION, e);
			logger.log(LOG_LEVEL_DEBUG, util.inspect(e));
			res.type('text/html').status(404).send('404 Error');
		}
	}

	compileJSX(jsxfile) {
		const babel = require('@babel/core');
		const t = require('@babel/types');

		let jsfile = jsxfile.replace('.jsx','.js');
		logger.log(LOG_LEVEL_DEVELOPMENT,`JSX Cache Miss | Compiling scripts/jsx/${jsxfile} > cache/js/${jsfile}`);

		let rendered = null;

		//*::TODO::more babbling about babel babble: source maps wouldmight be nice.
		//*::TODO::would caching asts be useful at all? methinks only with multifilecomplie
		//*::TODO::should add an optional way of shoving regular jsx through babel w/some options or something?
		let parserOpts = {
			//errorRecovery: true, 	// don't throw immediately on errors, try to continue
			attachComment: ((this.parent.developmentMode)?false:true), 	// remove comments before ast
			strictMode: true 			// always use strict mode
		};

		let generatorOpts = {
			compact : (!this.parent.developmentMode), // whether to remove newlines/whitespace, 'auto' compacts if code.len>500k
			minified: (!this.parent.developmentMode), // whether to minify the output
			comment : (this.parent.developmentMode), // default for below
			//shouldPrintComment: (comment)=>{}, // function for deciding whether to print comment..?
		};

		try {
			let jsxFile = fs.readFileSync(`../assets/scripts/jsx/${jsxfile}`);
			let jsx = babel.template(jsxFile);
			let ast = jsx({
				include: t.stringLiteral("test")
			})
			//let parsed = babel.transformFileSync(`../assets/scripts/jsx/${jsxfile}`, {
			let parsed = babel.transformSync(ast, {
				targets: `defaults`,
				sourceType: `unambiguous`,
				sourceMaps: true,
				sourceFileName: jsxfile,
				sourceRoot: `/js/maps/`,
				highlightCode: true,
				presets: [
					[`@babel/preset-react`, {
							throwIfNamespace: true 
						}
					]
				],
				plugins: [
					[`@babel/template`], {
						include: 'test'
					}
				],
				parserOpts,
				generatorOpts
			});

			let path = jsfile.split('/');
			let reconstructedPath = '';

			for (let i=0;i<path.length-1;i++) {
				if (i!=path.length-1) {
					reconstructedPath += path[i]+"/";
					try {
						fs.statSync(`../assets/cache/js/${reconstructedPath}`);
					} catch(e) {
						if (e.code == "ENOENT") {
							logger.log(`Path ${reconstructedPath} not found in cache/js/ - creating!`);
							fs.mkdirSync(`../assets/cache/js/${reconstructedPath}`);
						} else {
							logger.log(`Unexpected Error for ${reconstructedPath}: ${util.inspect(e)}`);
							throw new Error(e);
						}
					}
				} else {
					reconstructedPath += path[i];
				}
			}

			rendered = parsed.code;

			fs.writeFileSync(`../assets/cache/js/${jsfile}`, rendered, 'utf8');
		} catch (e) {
			logger.log(util.inspect(e)); // log then
			throw new Error(e);
		}

		return rendered;
	}

	handleJSRequest(req, res, next) {
		try {
			logger.log(LOG_LEVEL_DEVELOPMENT, `JS Request received for ${req.params[0]}`);

			let jsfile = req.params[0].replace('.jsx','.js');
			let result = null;

			if (req.params[0].substr(-4,4) == ".jsx") {
				try {
					var cache_stat = fs.statSync(`../assets/cache/js/${jsfile}`);
				} catch (e) {
					if (result == null && e.code == "ENOENT") {// js cached file doesn't exist, we need to render
						result = this.compileJSX(req.params[0]);
					} else if (result == null) throw new Error(`Unknown Error trying to read cache/js/${jsfile}: ${e}`);					
				}

				if (result == null) {
					try {
						var jsx_stat = fs.statSync(`../assets/scripts/jsx/${req.params[0]}`);
					} catch (e) {
						if (e.code == "ENOENT") { // JSX file doesn't exist?? we can try and push cached js if it exists, 
							if (typeof cache_stat !== 'undefined') {
								logger.log(LOG_LEVEL_PRODUCTION, `Warning: SCSS (scripts/jsx/${req.params[0]}) doesn't exist! Trying to fall back on cache (cache/js/${req.params[0]})`);
								result = fs.readFileSync(`../assets/cache/js/${jsfile}`);
							} else throw new Error(`404 - ${req.params[0]}`);
						} else throw new Error(`Unknown Error trying to read styles/jsx/${req.params[0]}: ${e}`);
					}
		
					if (jsx_stat.mtimeMs > cache_stat.mtimeMs) {
						result = this.compileJSX(req.params[0]);
					} else {
						logger.log(LOG_LEVEL_DEVELOPMENT, `JSX Cache Hit for ${req.params[0]}`);
						result = fs.readFileSync(`../assets/cache/js/${jsfile}`);
					}
				}
			} else {
				try {
					result = fs.readFileSync(`../assets/pub/js/${req.params[0]}`);
					logger.log(LOG_LEVEL_DEVELOPMENT, `Static JS file served for ${req.params[0]}`);
				} catch (e) {
					throw new Error(`404 - pub/js/${req.params[0]}: ${e}`);
				}				
			}

			res.type(`text/javascript`);
			res.send(`${result}`);
		} catch (e) { //*::TODO::* catch say 500 if actually a 500...
			logger.log(util.inspect(e));
			res.type('text/html').status(404).send('404 Error');
		}
	}

	requestLogger(req,res,next) {
		logger.log(LOG_LEVEL_MESSAGE, `Worker #${cluster.worker.id} has received a request [${req.url}] from ${req.headers.host}`);
		next();		
	}

	handleRequest(req, res, next) {
		let params = req.url.split('/');

		switch (params[1]) {
			case 'js':
			case 'jsx':
			case 'css':
			case 'img':
				this.doHTTPError(res, 404, "Resource not found");
			  break;
			default:
			  next();
		}
	}

	compileXSLT(template) {
		let sefFile = template.replace(`.xsl`,`.sef.json`)
		const env = this.saxon.getPlatform();
		const doc = env.parseXmlFromString(env.readFile(`../assets/styles/xsl/${template}`));
		doc._saxonBaseUri = "file:///"; // ?from.s.o.? hack: avoid error "Required cardinality of value of parameter $static-base-uri is exactly one; supplied value is empty"

		logger.log(LOG_LEVEL_DEBUG, `load/parse xsl done, about to compile`);
		let sef = this.saxon.compile(doc);
		logger.log(LOG_LEVEL_DEBUG, `compilation complete, saving sefcache`);

		fs.writeFileSync(`../assets/cache/sef/${sefFile}`, JSON.stringify(sef), `utf8`);
	  return sef;
	}					

	requestStatsFromMaster() {
		process.send({
			cmd:'getStats',
			worker: cluster.worker.id
		});
	}

	subscribeStatsFromMaster() {
		process.send({
			cmd:'subscribe',
			worker: cluster.worker.id
		});		
	}

	unsubscribeStatsFromMaster() {
		process.send({
			cmd:'unsubscribe',
			worker: cluster.worker.id
		});		
	}

	async route_index(req,res) {
		this.saxon = require('saxon-js');

		await this.parent.enumerateGPUs();

		this.requestStatsFromMaster();

		let data = {
			GPUs: {},
		};

		for (let gpu of this.parent.GPUs) {
			data.GPUs[`gpu-${gpu.gpu}`] = {
				gpu:gpu
			};
		}

		//data.stats =  // having to parse it is hmmmmmmmmmm

		logger.log(LOG_LEVEL_DEBUG, `About to process XSLT with ${util.inspect(data)}`);

		try {
			let xmlData = xmlParser.toXml(data); // wasn't the whole point of saxon that it was suppose to take json stuffed in?
			
			let template = `default.xsl`;

			var sef=null;

			let sefFile = template.replace(`.xsl`,`.sef.json`)

			try {
				var sefStat = fs.statSync(`../assets/cache/sef/${sefFile}`);
			} catch(e) {
				if (e.code == "ENOENT") { // sef cache doesn't exist
					logger.log(LOG_LEVEL_DEVELOPMENT, `sef cache miss, must compile ${template}`);
					sef = this.compileXSLT(template);
				} else {
					throw new Error(`Unknown Error trying to read ${template}: ${e}`);
				}
			}

			try {
				var xslStat = fs.statSync(`../assets/styles/xsl/${template}`);
			} catch (e) {
				if (e.code == "ENOENT") { // xsl file doesn't exist?? if we have a sef we can stil transform
					if (typeof sefStat !== 'undefined') {
						logger.log(LOG_LEVEL_PRODUCTION, `Warning: Original XSLT doesn't exist!! trying to fall back on to sef ${sefFile}`);
						sef = JSON.parse(fs.readFileSync(`../assets/cache/sef/${sefFile}`, `utf8`));
						logger.log(LOG_LEVEL_DEVELOPMENT, `sef cache hit for ${sefFile}`);
					} else {
						throw new Error(`404 - ${template}`);
					}
				} else {
					throw new Error(`Unknown Error trying to read ${template}: ${e}`);
				}
			}

			if (sef == null && xslStat.mtimeMs > sefStat.mtimeMs) {
				logger.log(LOG_LEVEL_DEVELOPMENT, `sef cache miss, must compile ${template}`);
				sef = this.compileXSLT(template);
			} else {
				logger.log(LOG_LEVEL_DEVELOPMENT, `sef cache hit for ${sefFile}`);
				sef = JSON.parse(fs.readFileSync(`../assets/cache/sef/${sefFile}`, `utf8`));
			}

			const resultStringXML = this.saxon.transform({
						stylesheetInternal: sef,
						sourceText: xmlData,
						//sourceType: 'json', // again: wasn't the whole point of saxon that it was suppose to take json stuffed in?
						destination: "serialized",
						   stylesheetParams: {
						      "pageTitle": [["gpumgr"]],
						      "metaDescription": [["gpumgr is a Linux GPU manager with CLI and web interfaces."]],
						      "revisitAfter": [["3 days"]],
						      "currentYear": [[new Date().getFullYear()]],
						      "version": [[$version]],
						      "serviceHost": [[this.host]],
						      "servicePort": [[this.port]],
						      "data" : [[JSON.stringify(this.parent.GPUs)]],
						      "stats" : [[this.parent.shm['data']]]
						   }
				});

			res.type(`application/xhtml+xml`);
			res.send(resultStringXML.principalResult);
		} catch(e) {
			logger.log(util.inspect(e));
			this.doHTTPError(res, 500, "Error 500 in XSLT Transformation.");
		}
	}

	doHTTPError(res, code=500, message="Error 500: Internal Server Error") {
			res.type(`application/xhtml+xml`);
			res.status(code).send(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"  lang="en">
   <head>
      <title>${code}</title>
   </head>
   <body>
   <h1>${code}</h1>
   <p>${message}</p>
   </body>
</html>`);

	}

	stopListening() {
		this.controller.abort();
		logger.log(LOG_LEVEL_DEBUG, `stopped listening`);
	}

	workerListening(worker, resolve, ev) {
		this.workersAlive++;

		logger.log(LOG_LEVEL_DEVELOPMENT, `worker ${worker.id} listening ${util.inspect(ev)}`);

		if (this.workersAlive == this.threads) {
			resolve();
		}
	}

	workerDisconnect(worker, reject, ev) {
		this.workersAlive--;

		logger.log(LOG_LEVEL_DEBUG, `worker ${worker.id} disconnect ${util.inspect(worker)}`);
		reject();
	}

	workerError(worker, reject, err) {
		this.workersAlive--;

		logger.log(LOG_LEVEL_PRODUCTION, `worker ${worker.id} error ${util.inspect(err)}`);

		reject();
	}

	workerExit(code, reject, signal)  {
		this.workersAlive--;
		(signal) 
		?logger.log(LOG_LEVEL_PRODUCTION, `worker was killed by signal: ${signal}`)
		:logger.log(LOG_LEVEL_PRODUCTION, `worker exited with error : ${util.inspect(code)}`);

		reject();
	}

	handleWorkerMessage(worker, message) {
		logger.log(`handleWorkerMessage workerId ${worker.id}: ${message}`);
		//logger.log(`webHandler: master received a msg from worker ${worker.id}: ${msg?.message}`)
	}
	
	handleMasterMessage(msg) {
		switch(msg.cmd) {
			case 'updateData':
				logger.log(`worker received a msg from master ${cluster.worker.id}: ${msg.data}`);
			  break;
			default:
				logger.log(`worker received an unknown msg from master ${cluster.worker.id}`);
		}
	}

	handleProcessMessage(msg) {
		logger.log(`processmgsg ${msg}`)
	}
};

module.exports = webHandler;