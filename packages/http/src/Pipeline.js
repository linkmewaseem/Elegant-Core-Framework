import PipelineError from "./errors/PipelineError.js";
import Request from "./Request.js";

export default class Pipeline {
    constructor() {
        this.request = null;
        this.middlewares = [];
    }

    // ---- Public API ----

    send(request) {
        this.validateRequest(request);

        this.request = request;
        return this;
    }

    through(middlewares) {
        this.validateMiddlewares(middlewares);

        this.middlewares = [...middlewares];
        return this;
    }

    then(destination) {
        this.validateDestination(destination);

        return this.execute(destination);
    }

    // ---- Execution engine ----

    execute(destination) {
        const chain = this.buildChain(destination);
        return chain();
    }

    buildChain(destination) {
        // Reduce right: wrap each middleware around the next one,
        // starting from the destination as the innermost function.
        return this.middlewares.reduceRight((next, middleware) => {
            return () => middleware(this.request, next);
        }, () => destination(this.request));
    }

    // ---- Validation ----

    validateRequest(request) {
        if (!request || !(request instanceof Request)) {
            throw new PipelineError("Pipeline requires a valid Request instance.");
        }
    }

    validateMiddlewares(middlewares) {
        if (!Array.isArray(middlewares)) {
            throw new PipelineError("Pipeline requires an array of middleware functions.");
        }

        for (let i = 0; i < middlewares.length; i++) {
            if (typeof middlewares[i] !== "function") {
                throw new PipelineError(`Middleware at index ${i} must be a function.`);
            }
        }
    }

    validateDestination(destination) {
        if (typeof destination !== "function") {
            throw new PipelineError("Pipeline requires a valid destination function.");
        }
    }
}
