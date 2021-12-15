/* 
	gpumgr v0.0.8-alpha
	webHandler.js - gpumgr web handler - based off freeform
	(C) 2022 Shaped Technologies (forbiddenera/Jai B.)

	gpumgr is a Linux-based GPU manager with console and web-based interfaces
*/

const cores = require('os').cpus().length;
const http = require('http');
const express = require('express');

const sass = require('sass');

//const libxslt = require('libxslt'); // third times a charm? saxon - wants you to do cli shit, i can work around but not stuff params and never got an actual rendered result
									// xslt-processor? quick/easy to get running but again, can't stuff params
									// libxslt?

const saxon = require('saxon-js');
const x2j = require('xml2json');

class webHandler {
	constructor({
		_parent = null,
		host = '0.0.0.0',
		port = 1969,
		threads = -1
	}={}) {
		this.parent = _parent;
		this.server = http.createServer(this.handleRequest.bind(this));
		this.controller = new AbortController();
		this.host = host;
		this.port = port;

		this.threads = (threads == -1)
						? (cores < 4)
							? cores
							: 4
						: threads;

		this.workers = [];
	}
	
	startListening() {
		return new Promise((resolve,reject) => {
			if (cluster.isMaster) {
				for (var i=0;i<this.threads;i++) { 
					var worker = cluster.fork();

					worker.on('listening',this.workerListening.bind(this, worker));
					worker.on('disconnect',this.workerDisconnect.bind(this, worker));
					worker.on('error',this.workerError.bind(this, worker));
					worker.on('exit', this.workerExit.bind(this, worker));
					this.workers.push(worker);
				}
				resolve();
			} else {
				logger.log(`about to start listening ${this.host}:${this.port}`);
				var app = new express();
				
				app.use(express.static('../assets/pub/www'));

				app.use('/css/*', this.handleScssRequest.bind(this));
				app.use('/img', express.static('../assets/pub/img'));
				app.use('/js', express.static('../assets/pub/js'));

				app.use(this.handleRequest.bind(this));
				app.use('/', this.route_index.bind(this));

				app.listen({
					host: this.host,
					port: this.port,
					signal: this.controller.signal
				}, () => {
					cluster.worker.on('message', this.workerMessage.bind(this));
					logger.log(`started listening on ${this.host} @ ${this.port}`)
					resolve();
				})
			}
		})
	}

	compileSCSS(scssfile, cssfile) {
		logger.log(`SCSS Cache Miss | Compiling ${scssfile}`);
		let rendered = sass.renderSync({ file: `../assets/styles/scss/${scssfile}` }).css;
		fs.writeFileSync(`../assets/pub/css/${cssfile}`, rendered);
		return rendered;
	}

	handleScssRequest(req, res, next) {
		logger.log(`SCSS Request received for ${req.params[0]}`);

		let result=null;

		try {
			res.type(`text/css`);
			let scssfile = req.params[0].replace('.css','.scss');

			try {
				var css_stat = fs.statSync(`../assets/pub/css/${req.params[0]}`);
			} catch (e) {
				if (e.code == "ENOENT") { // css file doesn't exist, we need to render
					result = this.compileSCSS(scssfile, req.params[0]);
				} else {
					throw new Error(`Unknown Error trying to read ${req.params[0]}: ${e}`);
				}
			}

			try {
				var scss_stat = fs.statSync(`../assets/styles/scss/${scssfile}`);
			} catch (e) {
				if (e.code == "ENOENT") { // scss file doesn't exist?? we can try and push regualr css if it exists, 
					if (typeof css_stat !== 'undefined') {
						logger.log(`SCSS doesn't exist, trying to fall back on to static ${req.params[0]}`);
						result = fs.readFileSync(`../assets/pub/css/${req.params[0]}`);
					} else {
						throw new Error(`404 - ${req.params[0]}`);
					}
				} else {
					throw new Error(`Unknown Error trying to read ${req.params[0]}: ${e}`);
				}
			}

			if (result == null && scss_stat.mtimeMs > css_stat.mtimeMs) {
				result = this.compileSCSS(scssfile, req.params[0]);
			} else {
				result = fs.readFileSync(`../assets/pub/css/${req.params[0]}`);
			}

			res.send( result );
		} catch (e) {
			logger.log(util.inspect(e));
			res.type('text/html').status(404).send('404 Error');
		}
	}

	handleRequest(req, res, next) {
		logger.log(`Worker #${cluster.worker.id} has received a request from ${req.headers.host}`);
		let params = req.url.split('/');

		switch (params[1]) {
			case 'js':
			case 'css':
			case 'img':
				this.doHTTPError(res, 404, "Resource not found");
			  break;
			default:
			  next();
		}
	}


	async route_index(req,res) {
		await this.parent.enumerateGPUs();

		let data = {
			GPUs: {}
		};

		for (let gpu of this.parent.GPUs) {
			console.log(util.inspect(gpu))
			data.GPUs[`gpu-${gpu.gpu}`] = {
				gpu:gpu
			};
		}

		logger.log(`About to process XSLT with ${util.inspect(data)}`);

		try {
			let xmlData = x2j.toXml(data); // wasn't the whole point of saxon that it was suppose to take json stuffed in?

			const env = saxon.getPlatform();

			const doc = env.parseXmlFromString(env.readFile(`../assets/styles/xsl/default.xsl`));
			logger.log(`load/parse xsl done`);
			doc._saxonBaseUri = "file:///"; // ?from.s.o.? hack: avoid error "Required cardinality of value of parameter $static-base-uri is exactly one; supplied value is empty"

			const sef = saxon.compile(doc); // we need to cache our sefs if using saxon

			const resultStringXML = saxon.transform({
						stylesheetInternal: sef,
						sourceText: xmlData,
						//sourceType: 'json',
						destination: "serialized",
						   stylesheetParams: {
						      "pageTitle": [["gpumgr"]],
						      "metaDescription": [["gpumgr is a Linux GPU manager with CLI and web interfaces."]],
						      "revisitAfter": [["3 days"]],
						      "currentYear": [[new Date().getFullYear()]]
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
		logger.log(`stopped listening`);
	}

	workerListening(worker, ev) {
		logger.log(`worker ${worker.id} listening ${util.inspect(ev)}`)
	}

	workerDisconnect(worker, ev) { logger.log(`worker ${worker.id} disconnect ${util.inspect(worker)}`) }

	workerError(worker, err) { logger.log(`worker ${worker.id} error ${util.inspect(err)}`) }

	workerExit(code, signal)  {
		(signal) 
		?logger.log(`worker was killed by signal: ${signal}`)
		:logger.log(`worker exited with error code: ${code}`);
	}

	workerMessage(msg) {
		logger.log(`received a msg: ${msg}`)
	}
};

module.exports = webHandler;