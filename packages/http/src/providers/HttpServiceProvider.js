import { ServiceProvider } from "@ecf/core";
import Router from "../Router.js";
import HttpKernel from "../HttpKernel.js";
import HttpServer from "../HttpServer.js";
import MiddlewareRegistry from "../middleware/MiddlewareRegistry.js";
import MiddlewareResolver from "../middleware/MiddlewareResolver.js";
import HttpExceptionHandler from "../HttpExceptionHandler.js";
import RouteNotFoundError from "../errors/RouteNotFoundError.js";
import BodyParserManager from "../BodyParserManager.js";
import JsonBodyParser from "../parsers/JsonBodyParser.js";
import FormBodyParser from "../parsers/FormBodyParser.js";
import TextBodyParser from "../parsers/TextBodyParser.js";
import RawBodyParser from "../parsers/RawBodyParser.js";

export default class HttpServiceProvider extends ServiceProvider {
    register(app) {
        app.singleton("middleware.registry", () => {
            return new MiddlewareRegistry();
        });

        app.singleton("router", () => {
            return new Router();
        });

        app.singleton("middleware.resolver", () => {
            const router = app.make("router");
            const registry = app.make("middleware.registry");
            return new MiddlewareResolver(router, registry);
        });

        app.singleton("exception.handler", () => {
            const manager = app.make("exception.manager");
            return new HttpExceptionHandler(manager);
        });

        app.singleton("body.parser", () => {
            const manager = new BodyParserManager({ limit: "1mb" });
            manager.register(new JsonBodyParser());
            manager.register(new FormBodyParser());
            manager.register(new TextBodyParser());
            manager.register(new RawBodyParser());
            return manager;
        });

        app.singleton("http.kernel", () => {
            const router = app.make("router");
            const bodyParserManager = app.make("body.parser");
            const resolver = app.make("middleware.resolver");
            const exceptionHandler = app.make("exception.handler");
            return new HttpKernel(router, bodyParserManager, resolver, exceptionHandler);
        });

        app.singleton("http.server", () => {
            const kernel = app.make("http.kernel");
            return new HttpServer(kernel);
        });
    }

    boot(app) {
        const exceptionManager = app.make("exception.manager");

        exceptionManager.render(RouteNotFoundError, (err, req, res) => {
            return res.status(404).text("Not Found");
        });

        app.registerListenHandler((app, args) => {
            const server = app.make("http.server");
            server.listen(...args);
        });
    }
}