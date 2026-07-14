import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import Pipeline from "../src/Pipeline.js";
import PipelineError from "../src/errors/PipelineError.js";
import Request from "../src/Request.js";

// ---- Helpers ----

function makeFakeIncomingMessage({ method = "GET", url = "/", headers = {}, socket = {} } = {}) {
    const stream = new Readable({ read() {} });
    stream.method = method;
    stream.url = url;
    stream.headers = headers;
    stream.socket = socket;
    return stream;
}

function makeFakeBodyParserManager(returnValue = {}) {
    return {
        parse: async () => returnValue
    };
}

function makeRequest(overrides = {}) {
    return new Request(
        makeFakeIncomingMessage(overrides),
        makeFakeBodyParserManager()
    );
}

// ---- Tests ----

describe("Pipeline - send()", () => {

    test("should accept a valid Request instance", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();

        assert.doesNotThrow(() => pipeline.send(request));
    });

    test("should return the pipeline instance for chaining", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();

        const result = pipeline.send(request);
        assert.strictEqual(result, pipeline);
    });

    test("should throw PipelineError for null", () => {
        const pipeline = new Pipeline();

        assert.throws(() => pipeline.send(null), PipelineError);
    });

    test("should throw PipelineError for a plain object", () => {
        const pipeline = new Pipeline();

        assert.throws(() => pipeline.send({}), PipelineError);
    });

});

describe("Pipeline - through()", () => {

    test("should accept a valid middleware array", () => {
        const pipeline = new Pipeline();

        assert.doesNotThrow(() => pipeline.through([() => {}, () => {}]));
    });

    test("should return the pipeline instance for chaining", () => {
        const pipeline = new Pipeline();

        const result = pipeline.through([]);
        assert.strictEqual(result, pipeline);
    });

    test("should throw PipelineError for null", () => {
        const pipeline = new Pipeline();

        assert.throws(() => pipeline.through(null), PipelineError);
    });

    test("should throw PipelineError for a plain object", () => {
        const pipeline = new Pipeline();

        assert.throws(() => pipeline.through({}), PipelineError);
    });

    test("should throw PipelineError if any element is not a function", () => {
        const pipeline = new Pipeline();

        assert.throws(() => pipeline.through([() => {}, {}, () => {}]), PipelineError);
    });

});

describe("Pipeline - then()", () => {

    test("should throw PipelineError for null destination", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();

        pipeline.send(request).through([]);

        assert.throws(() => pipeline.then(null), PipelineError);
    });

    test("should execute the destination and return its result", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();

        const result = pipeline
            .send(request)
            .through([])
            .then((req) => "destination-result");

        assert.equal(result, "destination-result");
    });

});

describe("Pipeline - execution", () => {

    test("empty middleware array should call destination directly", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();
        let called = false;

        pipeline
            .send(request)
            .through([])
            .then((req) => { called = true; });

        assert.equal(called, true);
    });

    test("middleware execution order should be preserved", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();
        const order = [];

        const m1 = (req, next) => { order.push(1); return next(); };
        const m2 = (req, next) => { order.push(2); return next(); };
        const m3 = (req, next) => { order.push(3); return next(); };

        pipeline
            .send(request)
            .through([m1, m2, m3])
            .then((req) => { order.push("destination"); });

        assert.deepEqual(order, [1, 2, 3, "destination"]);
    });

    test("same Request instance should be passed to every middleware and destination", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();
        const instances = [];

        const m1 = (req, next) => { instances.push(req); return next(); };
        const m2 = (req, next) => { instances.push(req); return next(); };

        pipeline
            .send(request)
            .through([m1, m2])
            .then((req) => { instances.push(req); });

        assert.equal(instances.length, 3);
        assert.strictEqual(instances[0], request);
        assert.strictEqual(instances[1], request);
        assert.strictEqual(instances[2], request);
    });

    test("middleware should be able to run code before and after next()", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();
        const log = [];

        const middleware = (req, next) => {
            log.push("before");
            const response = next();
            log.push("after");
            return response;
        };

        pipeline
            .send(request)
            .through([middleware])
            .then((req) => { log.push("destination"); return "result"; });

        assert.deepEqual(log, ["before", "destination", "after"]);
    });

    test("return value should propagate from destination through middleware to caller", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();

        const m1 = (req, next) => {
            const response = next();
            return response;
        };

        const m2 = (req, next) => {
            const response = next();
            return response;
        };

        const result = pipeline
            .send(request)
            .through([m1, m2])
            .then((req) => "final-response");

        assert.equal(result, "final-response");
    });

});

describe("Pipeline - error propagation", () => {

    test("exceptions in middleware should bubble up (Pipeline does not catch)", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();

        const explodingMiddleware = (req, next) => {
            throw new Error("middleware exploded");
        };

        assert.throws(
            () => {
                pipeline
                    .send(request)
                    .through([explodingMiddleware])
                    .then((req) => "should-not-reach");
            },
            { message: "middleware exploded" }
        );
    });

    test("exceptions in destination should bubble up through middleware", () => {
        const pipeline = new Pipeline();
        const request = makeRequest();

        const passThroughMiddleware = (req, next) => {
            return next();
        };

        assert.throws(
            () => {
                pipeline
                    .send(request)
                    .through([passThroughMiddleware])
                    .then((req) => { throw new Error("destination exploded"); });
            },
            { message: "destination exploded" }
        );
    });

});

describe("Pipeline - fluent API", () => {

    test("full fluent chain should work end-to-end", () => {
        const request = makeRequest();
        const log = [];

        const auth = (req, next) => { log.push("auth"); return next(); };
        const logger = (req, next) => { log.push("logger"); return next(); };

        const result = new Pipeline()
            .send(request)
            .through([auth, logger])
            .then((req) => {
                log.push("handler");
                return "response";
            });

        assert.deepEqual(log, ["auth", "logger", "handler"]);
        assert.equal(result, "response");
    });

});
