import http from "node:http";
import HttpServerError from "./errors/HttpServerError.js";

const MIN_PORT = 0;
const MAX_PORT = 65535;

export default class HttpServer {
    #server;
    #listening;

    constructor(kernel) {
        this.validateKernel(kernel);

        this.kernel = kernel;
        this.#listening = false;

       this.#server = http.createServer(async (req, res) => {
    try {
        await this.kernel.handle(req, res);
    } catch (error) {
        this.handleUncaughtError(error, res);
    }
});
    }

    // ---- Public API ----

    listen(port, hostOrCallback, maybeCallback) {
        this.assertNotListening();
        this.validatePort(port);

        let host;
        let callback;

        if (typeof hostOrCallback === "function") {
            callback = hostOrCallback;
        } else if (hostOrCallback !== undefined) {
            host = hostOrCallback;
            callback = maybeCallback;
        }

        this.validateHost(host);
        this.validateCallback(callback);

        const onListening = () => {
            this.#listening = true;
            if (callback) callback();
        };

        if (host !== undefined) {
            this.#server.listen(port, host, onListening);
        } else {
            this.#server.listen(port, onListening);
        }

        return this;
    }

    close(callback) {
        this.assertListening();
        this.validateCallback(callback);

        this.#server.close(() => {
            this.#listening = false;
            if (callback) callback();
        });

        return this;
    }

    // Returns AddressInfo | string | null (Node-compatible)
    address() {
        return this.#server.address();
    }

    get listening() {
        return this.#listening;
    }

    // ---- Internal guards ----

    assertNotListening() {
        if (this.#listening) {
            throw new HttpServerError("Server is already listening.");
        }
    }

    assertListening() {
        if (!this.#listening) {
            throw new HttpServerError("Cannot close a server that is not listening.");
        }
    }

    // ---- Validation ----

    validateKernel(kernel) {
        if (!kernel || typeof kernel.handle !== "function") {
            throw new HttpServerError("HttpServer requires a kernel with a handle(req, res) method.");
        }
    }

    validatePort(port) {
        if (typeof port !== "number" || !Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
            throw new HttpServerError(`Invalid port "${port}". Must be an integer between ${MIN_PORT} and ${MAX_PORT}.`);
        }
    }

    validateHost(host) {
        if (host !== undefined && typeof host !== "string") {
            throw new HttpServerError("Host must be a string.");
        }
    }

    validateCallback(callback) {
        if (callback !== undefined && typeof callback !== "function") {
            throw new HttpServerError("Callback must be a function.");
        }
    }

    // naya internal helper method

handleUncaughtError(error, res) {
    if (res.headersSent) {
        return; // response already sent, can't do anything more
    }

    const isNotFound = error.name === "RouteNotFoundError";
    
    const statusCode = isNotFound ? 404 : 500;
    const message = isNotFound ? `Not Found ${error.message}` : "Internal Server Error";

    res.statusCode = statusCode;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(message);
}
}