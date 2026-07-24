import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import HttpKernel from "../src/HttpKernel.js";
import HttpKernelError from "../src/errors/HttpKernelError.js";
import RouteNotFoundError from "../src/errors/RouteNotFoundError.js";
import Request from "../src/Request.js";
import Response from "../src/Response.js";
import MiddlewareRegistry from "../src/middleware/MiddlewareRegistry.js";
import MiddlewareResolver from "../src/middleware/MiddlewareResolver.js";

// ---- Helpers ----

function makeFakeIncomingMessage({ method = "GET", url = "/", headers = {}, socket = {} } = {}) {
    const stream = new Readable({ read() {} });
    stream.method = method;
    stream.url = url;
    stream.headers = headers;
    stream.socket = socket;
    return stream;
}

function makeFakeServerResponse() {
    const calls = {
        headers: {},
        body: null,
        ended: false
    };

    const raw = {
        headersSent: false,
        statusCode: 200,
        setHeader(name, value) {
            calls.headers[name.toLowerCase()] = value;
        },
        getHeader(name) {
            return calls.headers[name.toLowerCase()];
        },
        removeHeader(name) {
            delete calls.headers[name.toLowerCase()];
        },
        end(body) {
            calls.ended = true;
            calls.body = body ?? null;
            raw.headersSent = true;
        }
    };

    return { raw, calls };
}

function makeFakeBodyParserManager(returnValue = {}) {
    return {
        parse: async () => returnValue
    };
}

/**
 * Creates a fake Router object compatible with the real Router contract:
 * router.match(request) either returns a Route-like object with .handler,
 * or throws RouteNotFoundError; it also sets "params" onto request.attributes.
 */
function makeFakeRouter() {
    const routes = [];
    const metadata = new Map();

    return {
        addRoute(method, path, ...args) {
            const middleware = args.length > 1 ? (Array.isArray(args[0]) ? args[0] : [args[0]]) : [];
            const handler = args[args.length - 1];

            const paramNames = [];
            const regexBody = path.split("/").filter(Boolean).map((seg) => {
                const m = seg.match(/^\{([a-zA-Z_]\w*)\}$/);
                if (m) {
                    paramNames.push(m[1]);
                    return "([^/]+)";
                }
                return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            }).join("/");
            const regex = new RegExp(`^/${regexBody}$`);

            routes.push({ method: method.toUpperCase(), regex, paramNames, handler, path });

            const key = `${method.toUpperCase()}:${path}`;
            if (!metadata.has(key)) {
                metadata.set(key, { middleware: [] });
            }
            metadata.get(key).middleware.push(...middleware);
        },

        getMetadata(method, path) {
            const key = `${method.toUpperCase()}:${path}`;
            return metadata.get(key) ?? { middleware: [] };
        },

        match(request) {
            const method = request.method;
            const path = request.path;

            for (const r of routes) {
                if (r.method !== method.toUpperCase()) continue;
                const result = r.regex.exec(path);
                if (result) {
                    const params = {};
                    r.paramNames.forEach((name, i) => {
                        params[name] = result[i + 1];
                    });

                    request.attributes.set("params", params);
                    return { handler: r.handler, method: r.method, path: r.path };
                }
            }

            throw new RouteNotFoundError(method, path);
        }
    };
}

/**
 * Creates a MiddlewareResolver, optionally pre-populated with a MiddlewareRegistry.
 * Pass { global: [...], route: [[method, path, fn], ...] } to seed it.
 */
function makeMiddlewareResolver(routerOrOptions, optionsArg) {
    let router;
    let options;

    if (routerOrOptions && typeof routerOrOptions.getMetadata === "function") {
        router = routerOrOptions;
        options = optionsArg ?? {};
    } else {
        options = routerOrOptions ?? {};
        router = options.router ?? makeFakeRouter();
    }

    const registry = new MiddlewareRegistry();
    (options.global ?? []).forEach((fn) => registry.global(fn));
    (options.route ?? []).forEach(([method, path, fn]) => {
        router.addRoute(method, path, fn, () => {});
    });
    return new MiddlewareResolver(router, registry);
}

function makeKernel({ router, bodyParserManager, middlewareResolver, exceptionHandler } = {}) {
    const r = router ?? makeFakeRouter();
    const resolver = middlewareResolver ?? makeMiddlewareResolver(r);
    return new HttpKernel(
        r,
        bodyParserManager ?? makeFakeBodyParserManager(),
        resolver,
        exceptionHandler
    );
}

// ---- Constructor validation ----

describe("HttpKernel - constructor", () => {

    test("should accept valid router, bodyParserManager, and middlewareResolver", () => {
        assert.doesNotThrow(() => makeKernel());
    });

    test("should throw HttpKernelError if router is null", () => {
        assert.throws(
            () => new HttpKernel(null, makeFakeBodyParserManager(), makeMiddlewareResolver()),
            HttpKernelError
        );
    });

    test("should throw HttpKernelError if router lacks match()", () => {
        assert.throws(
            () => new HttpKernel({}, makeFakeBodyParserManager(), makeMiddlewareResolver()),
            HttpKernelError
        );
    });

    test("should throw HttpKernelError if bodyParserManager is null", () => {
        assert.throws(
            () => new HttpKernel(makeFakeRouter(), null, makeMiddlewareResolver()),
            HttpKernelError
        );
    });

    test("should throw HttpKernelError if bodyParserManager lacks parse()", () => {
        assert.throws(
            () => new HttpKernel(makeFakeRouter(), {}, makeMiddlewareResolver()),
            HttpKernelError
        );
    });

    test("should throw HttpKernelError if middlewareResolver is null", () => {
        assert.throws(
            () => new HttpKernel(makeFakeRouter(), makeFakeBodyParserManager(), null),
            HttpKernelError
        );
    });

    test("should throw HttpKernelError if middlewareResolver lacks resolve()", () => {
        assert.throws(
            () => new HttpKernel(makeFakeRouter(), makeFakeBodyParserManager(), {}),
            HttpKernelError
        );
    });

});

// ---- handle() - Route resolution ----

describe("HttpKernel - handle() route resolution", () => {

    test("should throw RouteNotFoundError when no route matches", () => {
        const kernel = makeKernel();

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/not-found" });
        const { raw: rawRes } = makeFakeServerResponse();

        assert.throws(
            () => kernel.handle(rawReq, rawRes),
            RouteNotFoundError
        );
    });

    test("should resolve a matching static route and call its handler", () => {
        const router = makeFakeRouter();
        let handlerCalled = false;

        router.addRoute("GET", "/", (req, res) => {
            handlerCalled = true;
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.equal(handlerCalled, true);
    });

    test("should resolve a matching dynamic route and set params on request", () => {
        const router = makeFakeRouter();
        let capturedParams = null;

        router.addRoute("GET", "/users/{id}", (req, res) => {
            capturedParams = req.params;
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/users/42" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.deepEqual(capturedParams, { id: "42" });
    });

    test("should resolve a route with multiple dynamic parameters", () => {
        const router = makeFakeRouter();
        let capturedParams = null;

        router.addRoute("GET", "/users/{userId}/posts/{postId}", (req, res) => {
            capturedParams = req.params;
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/users/3/posts/77" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.deepEqual(capturedParams, { userId: "3", postId: "77" });
    });

});

// ---- handle() - Request & Response creation ----

describe("HttpKernel - handle() object creation", () => {

    test("handler should receive a Request instance as first argument", () => {
        const router = makeFakeRouter();
        let capturedReq = null;

        router.addRoute("GET", "/", (req, res) => {
            capturedReq = req;
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.ok(capturedReq instanceof Request);
    });

    test("handler should receive a Response instance as second argument", () => {
        const router = makeFakeRouter();
        let capturedRes = null;

        router.addRoute("GET", "/", (req, res) => {
            capturedRes = res;
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.ok(capturedRes instanceof Response);
    });

    test("Request should reflect the original raw method and url", () => {
        const router = makeFakeRouter();
        let capturedReq = null;

        router.addRoute("POST", "/submit", (req, res) => {
            capturedReq = req;
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "POST", url: "/submit" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.equal(capturedReq.method, "POST");
        assert.equal(capturedReq.url, "/submit");
    });

});

// ---- handle() - Pipeline behavior (black-box, since Pipeline is now internal) ----

describe("HttpKernel - handle() pipeline behavior", () => {

    test("same Request and Response instance should reach the handler consistently", () => {
        const router = makeFakeRouter();
        let handlerReq = null;
        let handlerRes = null;

        router.addRoute("GET", "/", (req, res) => {
            handlerReq = req;
            handlerRes = res;
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.ok(handlerReq instanceof Request);
        assert.ok(handlerRes instanceof Response);
    });

    test("handler return value should propagate through the kernel", () => {
        const router = makeFakeRouter();

        router.addRoute("GET", "/", (req, res) => {
            return "handler-response";
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        const result = kernel.handle(rawReq, rawRes);

        assert.equal(result, "handler-response");
    });

    test("each handle() call should use an independent pipeline (no cross-request state leakage)", () => {
        const router = makeFakeRouter();
        const capturedReqs = [];

        router.addRoute("GET", "/a", (req) => { capturedReqs.push(req); });
        router.addRoute("GET", "/b", (req) => { capturedReqs.push(req); });

        const kernel = makeKernel({ router });

        const rawReqA = makeFakeIncomingMessage({ method: "GET", url: "/a" });
        const { raw: rawResA } = makeFakeServerResponse();
        kernel.handle(rawReqA, rawResA);

        const rawReqB = makeFakeIncomingMessage({ method: "GET", url: "/b" });
        const { raw: rawResB } = makeFakeServerResponse();
        kernel.handle(rawReqB, rawResB);

        assert.equal(capturedReqs.length, 2);
        assert.notStrictEqual(capturedReqs[0], capturedReqs[1]);
    });

});

// ---- handle() - Middleware interaction ----

describe("HttpKernel - handle() middleware interaction", () => {

    test("global middlewares should execute in order before the handler", () => {
        const router = makeFakeRouter();
        const log = [];

        router.addRoute("GET", "/", (req, res) => {
            log.push("handler");
        });

        const m1 = (req, res, next) => { log.push("m1"); return next(); };
        const m2 = (req, res, next) => { log.push("m2"); return next(); };

        const kernel = makeKernel({
            router,
            middlewareResolver: makeMiddlewareResolver({ global: [m1, m2] })
        });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.deepEqual(log, ["m1", "m2", "handler"]);
    });

    test("route-specific middleware should run after global middleware", () => {
        const router = makeFakeRouter();
        const log = [];

        router.addRoute("GET", "/admin", (req, res) => {
            log.push("handler");
        });

        const logger = (req, res, next) => { log.push("logger"); return next(); };
        const auth = (req, res, next) => { log.push("auth"); return next(); };

        const kernel = makeKernel({
            router,
            middlewareResolver: makeMiddlewareResolver({
                global: [logger],
                route: [["GET", "/admin", auth]]
            })
        });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/admin" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.deepEqual(log, ["logger", "auth", "handler"]);
    });

    test("middleware should be able to short-circuit the pipeline", () => {
        const router = makeFakeRouter();
        let handlerCalled = false;

        router.addRoute("GET", "/", (req, res) => {
            handlerCalled = true;
        });

        const blocker = (req, res, next) => {
            return "blocked";
        };

        const kernel = makeKernel({
            router,
            middlewareResolver: makeMiddlewareResolver({ global: [blocker] })
        });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        const result = kernel.handle(rawReq, rawRes);

        assert.equal(result, "blocked");
        assert.equal(handlerCalled, false);
    });

    test("no registered middleware should pass through directly to handler", () => {
        const router = makeFakeRouter();
        let handlerCalled = false;

        router.addRoute("GET", "/", (req, res) => {
            handlerCalled = true;
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.equal(handlerCalled, true);
    });

});

// ---- handle() - Response interaction ----

describe("HttpKernel - handle() response interaction", () => {

    test("handler should be able to send a text response", () => {
        const router = makeFakeRouter();

        router.addRoute("GET", "/", (req, res) => {
            return res.text("Hello ECF");
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes, calls } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.equal(calls.headers["content-type"], "text/plain; charset=utf-8");
        assert.equal(calls.body, "Hello ECF");
        assert.equal(calls.ended, true);
    });

    test("handler should be able to send a JSON response", () => {
        const router = makeFakeRouter();

        router.addRoute("GET", "/api/status", (req, res) => {
            return res.json({ status: "ok" });
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/api/status" });
        const { raw: rawRes, calls } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.equal(calls.headers["content-type"], "application/json; charset=utf-8");
        assert.equal(calls.body, JSON.stringify({ status: "ok" }));
    });

    test("response headersSent should be true after handler sends response", () => {
        const router = makeFakeRouter();
        let capturedRes = null;

        router.addRoute("GET", "/", (req, res) => {
            capturedRes = res;
            return res.text("Hello");
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.equal(capturedRes.headersSent, true);
    });

    test("handler should be able to set status code before sending", () => {
        const router = makeFakeRouter();

        router.addRoute("POST", "/users", (req, res) => {
            return res.status(201).json({ created: true });
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "POST", url: "/users" });
        const { raw: rawRes, calls } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.equal(rawRes.statusCode, 201);
        assert.equal(calls.body, JSON.stringify({ created: true }));
    });

});

// ---- Error propagation ----

describe("HttpKernel - error propagation", () => {

    test("errors thrown in handler should bubble up", () => {
        const router = makeFakeRouter();

        router.addRoute("GET", "/", (req, res) => {
            throw new Error("handler exploded");
        });

        const kernel = makeKernel({ router });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes } = makeFakeServerResponse();

        assert.throws(
            () => kernel.handle(rawReq, rawRes),
            { message: "handler exploded" }
        );
    });

    test("errors thrown in async handler should reject returned promise and be caught by exceptionHandler", async () => {
        class CustomError extends Error {}
        let handledError = null;

        const exceptionHandler = {
            handle(err) {
                handledError = err;
                return "handled";
            }
        };

        const router = makeFakeRouter();
        router.addRoute("POST", "/user", async () => {
            throw new CustomError("async validation failed");
        });

        const kernel = makeKernel({ router, exceptionHandler });
        const rawReq = makeFakeIncomingMessage({ method: "POST", url: "/user" });
        const { raw: rawRes } = makeFakeServerResponse();

        const result = await kernel.handle(rawReq, rawRes);
        assert.equal(result, "handled");
        assert.ok(handledError instanceof CustomError);
        assert.equal(handledError.message, "async validation failed");
    });

    test("RouteNotFoundError should carry method and path", () => {
        const kernel = makeKernel();

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/missing" });
        const { raw: rawRes } = makeFakeServerResponse();

        try {
            kernel.handle(rawReq, rawRes);
            assert.fail("should have thrown");
        } catch (error) {
            assert.ok(error instanceof RouteNotFoundError);
            assert.equal(error.method, "GET");
            assert.equal(error.path, "/missing");
        }
    });

    test("RouteNotFoundError message should include method and path", () => {
        const kernel = makeKernel();

        const rawReq = makeFakeIncomingMessage({ method: "DELETE", url: "/users/99" });
        const { raw: rawRes } = makeFakeServerResponse();

        assert.throws(
            () => kernel.handle(rawReq, rawRes),
            { message: "No route found for DELETE /users/99" }
        );
    });

});

// ---- Full integration ----

describe("HttpKernel - integration", () => {

    test("full flow: IncomingMessage → Request → Router → Pipeline → Handler → Response", () => {
        const router = makeFakeRouter();
        const log = [];

        router.addRoute("GET", "/", (req, res) => {
            log.push("root-handler");
            return res.text("Hello ECF 🚀");
        });

        router.addRoute("GET", "/users/{id}", (req, res) => {
            log.push(`user-handler:${req.params.id}`);
            return res.json({ id: req.params.id });
        });

        router.addRoute("POST", "/users", (req, res) => {
            log.push("create-user");
            return res.status(201).json({ created: true });
        });

        const kernel = makeKernel({ router });

        const rawReq1 = makeFakeIncomingMessage({ method: "GET", url: "/" });
        const { raw: rawRes1, calls: calls1 } = makeFakeServerResponse();
        kernel.handle(rawReq1, rawRes1);

        assert.equal(calls1.body, "Hello ECF 🚀");
        assert.equal(calls1.headers["content-type"], "text/plain; charset=utf-8");
        assert.deepEqual(log, ["root-handler"]);

        const rawReq2 = makeFakeIncomingMessage({ method: "GET", url: "/users/7" });
        const { raw: rawRes2, calls: calls2 } = makeFakeServerResponse();
        kernel.handle(rawReq2, rawRes2);

        assert.equal(calls2.body, JSON.stringify({ id: "7" }));
        assert.equal(calls2.headers["content-type"], "application/json; charset=utf-8");
        assert.deepEqual(log, ["root-handler", "user-handler:7"]);

        const rawReq3 = makeFakeIncomingMessage({ method: "POST", url: "/users" });
        const { raw: rawRes3, calls: calls3 } = makeFakeServerResponse();
        kernel.handle(rawReq3, rawRes3);

        assert.equal(calls3.body, JSON.stringify({ created: true }));
        assert.equal(rawRes3.statusCode, 201);
        assert.deepEqual(log, ["root-handler", "user-handler:7", "create-user"]);

        const rawReq4 = makeFakeIncomingMessage({ method: "GET", url: "/not-found" });
        const { raw: rawRes4 } = makeFakeServerResponse();

        assert.throws(
            () => kernel.handle(rawReq4, rawRes4),
            RouteNotFoundError
        );
    });

    test("integration with middlewares: global auth + logger + handler", () => {
        const router = makeFakeRouter();
        const log = [];

        const auth = (req, res, next) => { log.push("auth"); return next(); };
        const logger = (req, res, next) => { log.push("logger"); return next(); };

        router.addRoute("GET", "/dashboard", (req, res) => {
            log.push("dashboard-handler");
            return res.json({ page: "dashboard" });
        });

        const kernel = makeKernel({
            router,
            middlewareResolver: makeMiddlewareResolver({ global: [auth, logger] })
        });

        const rawReq = makeFakeIncomingMessage({ method: "GET", url: "/dashboard" });
        const { raw: rawRes, calls } = makeFakeServerResponse();

        kernel.handle(rawReq, rawRes);

        assert.deepEqual(log, ["auth", "logger", "dashboard-handler"]);
        assert.equal(calls.body, JSON.stringify({ page: "dashboard" }));
    });

});