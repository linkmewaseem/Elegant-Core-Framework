<div align="center">
  <img src="https://github.com/linkmewaseem/ECF/raw/main/banner.png" alt="ECF Banner" width="100%" style="border-radius:12px; margin-bottom:20px;">
</div>

<br>

 # ECF — Elegant Core Framework

ECF is a lightweight, modular Node.js framework built around a powerful dependency injection container and service provider system. It ships two packages today: **`@ecf/core`** for the application foundation and **`@ecf/http`** for HTTP routing, middleware, and request/response handling.

---

## Table of Contents

- [What is Included](#what-is-included)
- [Package Structure](#package-structure)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running Tests](#running-tests)
- [Quick Start — HTTP Server](#quick-start--http-server)
- [Core Concepts](#core-concepts)
  - [Container](#container)
  - [Application](#application)
  - [Service Providers](#service-providers)
  - [Facades](#facades)
  - [Config](#config)
  - [Logger](#logger)
  - [Events](#events)
  - [Environment (.env)](#environment-env)
- [HTTP Layer](#http-layer)
  - [Routing](#routing)
  - [Request](#request)
  - [Response](#response)
  - [Middleware](#middleware)
  - [Pipeline](#pipeline)
- [Exported API](#exported-api)
  - [@ecf/core](#ecfcore)
  - [@ecf/http](#ecfhttp)
- [Roadmap](#roadmap)

---

## What is Included

### `@ecf/core`
- IoC **Container** — bind factories, resolve services, detect circular dependencies
- **Singleton** support with instance caching
- **Application** wrapper with provider-based bootstrapping lifecycle
- **ServiceProvider** base class for organized service registration and boot logic
- **ConfigManager** — dot-notation config access (`app.db.host`)
- **LoggerManager** — pluggable transport-based logger (`info`, `warning`, `error`, `critical`)
- **EventManager** — synchronous event dispatch with error isolation
- **EnvManager** + **DotEnvLoader** — `.env` file loading and environment variable access
- **Facade** system — static proxy shortcuts to container services
- Framework-specific error hierarchy (`ECFError`, `ContainerError`, `ConfigError`, etc.)

### `@ecf/http`
- **Router** — static and dynamic route matching (`/users/{id}`)
- **Request** — parsed URL, query string, headers, cookies, params, body, IP
- **Response** — `text()`, `html()`, `json()`, `redirect()`, status codes, headers
- **Middleware Pipeline** — composable middleware chain per request
- **MiddlewareRegistry** — global and per-route middleware registration
- **HttpKernel** — ties router + middleware + body parser into a single request handler
- **HttpServer** — wraps Node.js `http.createServer` with a clean API
- **HttpServiceProvider** — registers the entire HTTP stack with one line

---

## Package Structure

```
ecf/
├── apps/
│   └── halo/              # Demo application
│       └── app.js
├── packages/
│   ├── core/              # @ecf/core — IoC container, providers, config, logger, events, env
│   │   ├── src/
│   │   └── tests/
│   ├── http/              # @ecf/http — routing, request, response, middleware
│   │   ├── src/
│   │   └── tests/
│   ├── commerce/          # Planned — e-commerce utilities
│   └── view/              # Planned — .ecf template engine
├── docs/
│   └── ecf-framework.md
├── tools/                 # Planned — CLI and scaffolding
└── pnpm-workspace.yaml
```

---

## Requirements

- **Node.js** `>=22`
- **pnpm** `>=11` (workspace management)
- ECMAScript Module format (`"type": "module"`)

---

## Installation

```bash
pnpm install
```

---

## Running Tests

Run all tests across all packages from the repository root:

```bash
pnpm test
```

Run tests for a single package:

```bash
# Core tests
cd packages/core && node --test

# HTTP tests
cd packages/http && node --test
```

---

## Quick Start — HTTP Server

The fastest way to start an ECF HTTP server:

```js
import { Application, Facade, HttpServiceProvider, Route } from "@ecf/http";

// 1. Bootstrap the application
const app = new Application();
app.register(HttpServiceProvider);
app.boot();
Facade.setApplication(app);

// 2. Define routes
Route.get("/", (req, res) => {
    return res.json({ message: "Hello from ECF!" });
});

Route.get("/users/{id}", (req, res) => {
    const { id } = req.params;
    return res.json({ id, name: "John Doe" });
});

Route.post("/users", async (req, res) => {
    const body = await req.body();
    return res.status(201).json({ created: true, data: body });
});

// 3. Start listening
app.listen(3000, () => {
    console.log("ECF running at http://localhost:3000");
});
```

---

## Core Concepts

### Container

The IoC container is the heart of ECF. It manages service bindings, singleton instances, and dependency resolution.

```js
import { Container } from "@ecf/core";

const container = new Container();

// Register a factory (new instance on every make())
container.bind("logger", () => ({
    log: (msg) => console.log(msg)
}));

// Register a singleton (same instance every time)
container.singleton("config", () => ({
    env: "production",
    port: 3000
}));

const logger = container.make("logger");
logger.log("Hello ECF");

const cfg1 = container.make("config");
const cfg2 = container.make("config");
console.log(cfg1 === cfg2); // true — same instance

// Check, forget, flush
container.has("config");   // true
container.forget("config");
container.flush();          // clears everything
```

Circular dependency detection is built in:

```js
container.bind("a", (c) => c.make("b"));
container.bind("b", (c) => c.make("a"));
container.make("a"); // throws ContainerError: Circular dependency detected: a -> b -> a
```

---

### Application

`Application` is a thin wrapper over `Container` that adds the service provider lifecycle.

```js
import { Application, ServiceProvider } from "@ecf/core";

class DatabaseProvider extends ServiceProvider {
    register(app) {
        app.singleton("database", () => ({ connected: true }));
    }

    boot(app) {
        const db = app.make("database");
        console.log("Database ready:", db.connected);
    }
}

const app = new Application();
app.register(DatabaseProvider);
app.boot();

console.log(app.make("database").connected); // true
```

**Application methods:**

| Method | Description |
|---|---|
| `bind(name, factory)` | Register a transient service |
| `singleton(name, factory)` | Register a singleton service |
| `make(name)` | Resolve a service from the container |
| `has(name)` | Check if a binding exists |
| `forget(name)` | Remove a binding |
| `flush()` | Clear all bindings |
| `register(ProviderClass)` | Register a service provider |
| `boot()` | Run all provider `register()` then `boot()` hooks |
| `use(middleware)` | Register a global HTTP middleware |
| `listen(port, [host], [callback])` | Start the HTTP server |

---

### Service Providers

Service providers give structure to service registration. Every provider extends `ServiceProvider` and implements `register()` and/or `boot()`.

```js
import { ServiceProvider } from "@ecf/core";

class CacheProvider extends ServiceProvider {
    register(app) {
        // register services here — other providers may not be ready yet
        app.singleton("cache", () => new Map());
    }

    boot(app) {
        // all providers are registered by this point
        // safe to resolve other services here
        const config = app.make("config");
        console.log("Cache booted with config:", config.get("cache.driver"));
    }
}
```

**Built-in providers (`@ecf/core`):**

| Provider | Binding key | Description |
|---|---|---|
| `ConfigServiceProvider` | `"config"` | Registers `ConfigManager` |
| `LoggerServiceProvider` | `"logger"` | Registers `LoggerManager` with `ConsoleTransport` |
| `EventServiceProvider` | `"event"` | Registers `EventManager` |
| `EnvironmentServiceProvider` | `"env"` | Loads `.env` file and registers `EnvManager` |
| `DatabaseServiceProvider` | `"database"` | Stub — placeholder for Phase 4 |

**Built-in providers (`@ecf/http`):**

| Provider | Binding keys | Description |
|---|---|---|
| `HttpServiceProvider` | `"router"`, `"middleware.registry"`, `"middleware.resolver"`, `"http.kernel"`, `"http.server"` | Registers the full HTTP stack |

---

### Facades

Facades are static proxies to container services. They provide a clean, short-hand API without manually calling `app.make()`.

```js
import { Application, Facade } from "@ecf/core";
import { Config, Log, Event, Env } from "@ecf/core";

const app = new Application();
// ... register providers and boot ...
Facade.setApplication(app);  // wire facades to the application

// Now use facades statically
Config.set("app.name", "ECF");
Config.get("app.name");              // "ECF"

Log.info("Server started", { port: 3000 });
Log.error("Something went wrong", { code: 500 });

Event.listen("user.created", (payload) => {
    console.log("New user:", payload.name);
});
Event.dispatch("user.created", { name: "John" });

Env.get("DB_HOST", "localhost");
```

**Available core facades:**

| Facade | Accessor | Backed by |
|---|---|---|
| `Config` | `"config"` | `ConfigManager` |
| `Log` | `"logger"` | `LoggerManager` |
| `Event` | `"event"` | `EventManager` |
| `Env` | `"env"` | `EnvManager` |

**HTTP facade:**

| Facade | Accessor | Backed by |
|---|---|---|
| `Route` | `"router"` | `Router` |

---

### Config

`ConfigManager` supports dot-notation paths for nested configuration.

```js
import { ConfigManager } from "@ecf/core";

const config = new ConfigManager();

config.set("app.name", "ECF");
config.set("app.debug", true);
config.set("database.host", "localhost");
config.set("database.port", 5432);

config.get("app.name");           // "ECF"
config.get("database.port");      // 5432
config.get("missing.key", "default"); // "default"
```

---

### Logger

`LoggerManager` routes log calls to pluggable transports.

```js
import { LoggerManager, ConsoleTransport } from "@ecf/core";

const logger = new LoggerManager();
logger.addTransport(new ConsoleTransport());

logger.info("App started");
logger.warning("Disk space low", { free: "500MB" });
logger.error("Request failed", { status: 500, url: "/api/users" });
logger.critical("Database connection lost");
```

**Creating a custom transport:**

```js
import { Transport } from "@ecf/core";

class FileTransport extends Transport {
    log(level, message, context = {}) {
        // write to a file
    }
}

logger.addTransport(new FileTransport());
logger.removeTransport(existingTransport);
```

---

### Events

`EventManager` provides synchronous event broadcasting with built-in error isolation (one failing listener does not block others).

```js
import { EventManager, LoggerManager, ConsoleTransport } from "@ecf/core";

const logger = new LoggerManager();
logger.addTransport(new ConsoleTransport());

const events = new EventManager(logger);

// Listen
events.listen("order.placed", (payload) => {
    console.log("Order placed:", payload.orderId);
});

// Dispatch — returns array of any listener errors
const errors = events.dispatch("order.placed", { orderId: 42 });

// Check / remove
events.has("order.placed");    // true
events.forget("order.placed"); // remove all listeners for this event
events.clear();                // remove all events
```

---

### Environment (.env)

`EnvironmentServiceProvider` automatically loads `.env` from `process.cwd()` on boot.

```env
# .env
APP_NAME=ECF
APP_PORT=3000
DB_HOST=localhost
DB_PASSWORD=secret
```

```js
import { EnvManager, DotEnvLoader } from "@ecf/core";

const loader = new DotEnvLoader();
const parsed = loader.load("./.env"); // { APP_NAME: "ECF", APP_PORT: "3000", ... }

const env = new EnvManager();
env.set("APP_NAME", "ECF");
env.get("APP_NAME");             // "ECF"
env.get("MISSING", "fallback"); // "fallback"
env.has("APP_NAME");             // true
env.all();                       // { APP_NAME: "ECF", ... }
```

---

## HTTP Layer

### Routing

The `Router` supports static and dynamic (parameterized) routes. Import the `Route` facade for a clean API.

```js
import { Route } from "@ecf/http";

// HTTP methods
Route.get("/",            (req, res) => res.text("Home"));
Route.post("/users",      (req, res) => res.json({ created: true }));
Route.put("/users/{id}",  (req, res) => res.json({ updated: true }));
Route.patch("/users/{id}",(req, res) => res.json({ patched: true }));
Route.delete("/users/{id}",(req, res) => res.json({ deleted: true }));
Route.head("/health",     (req, res) => res.status(200).end());
Route.options("/",        (req, res) => res.status(204).end());

// Register for all methods
Route.any("/webhook", (req, res) => res.json({ ok: true }));

// Dynamic parameters — accessed via req.params
Route.get("/users/{id}", (req, res) => {
    const { id } = req.params; // "42"
    return res.json({ id });
});

// Multiple parameters
Route.get("/users/{userId}/posts/{postId}", (req, res) => {
    const { userId, postId } = req.params;
    return res.json({ userId, postId });
});

// Controller tuple syntax — [ControllerClass, "methodName"]
Route.get("/users", [UserController, "index"]);
Route.post("/users", [UserController, "store"]);
```

**Important:** Static routes must be defined **before** dynamic routes with overlapping segments:

```js
Route.get("/users/new",      handler); // define first
Route.get("/users/{id}",     handler); // define after
```

---

### Request

```js
Route.get("/example", (req, res) => {
    // Method & URL
    req.method;         // "GET"
    req.url;            // "/example?sort=asc"
    req.path;           // "/example"

    // Query string
    req.query;          // { sort: "asc" }

    // Route params
    req.params;         // { id: "42" } — set by router

    // Headers
    req.header("content-type");   // "application/json"
    req.hasHeader("authorization"); // true / false
    req.headers;                  // frozen copy of all headers

    // Cookies
    req.cookies;        // { session: "abc123" }

    // Body — async, delegates to BodyParserManager
    const body = await req.body(); // {}  (note: parser not yet implemented)

    // Network info
    req.ip;             // "127.0.0.1"
    req.protocol;       // "http" or "https"
    req.secure;         // false
    req.host;           // "localhost:3000"
    req.origin;         // "http://localhost:3000"
    req.userAgent;      // "Mozilla/5.0 ..."

    return res.json({ ok: true });
});
```

---

### Response

```js
Route.get("/demo", (req, res) => {
    // Text response
    res.text("Hello World");

    // HTML response
    res.html("<h1>Hello</h1>");

    // JSON response
    res.json({ message: "ok", data: [1, 2, 3] });

    // Set status code
    res.status(201).json({ created: true });
    res.status(404).text("Not Found");

    // Set headers
    res.header("X-Request-Id", "abc-123");
    res.hasHeader("X-Request-Id"); // true
    res.removeHeader("X-Request-Id");

    // Redirect
    res.redirect("/new-location");          // 302
    res.redirect("/permanent", 301);        // 301

    // End with no body
    res.status(204).end();

    // Send raw — auto-detects type
    res.send("plain string");   // sends as-is
    res.send({ key: "value" }); // auto-serializes to JSON
    res.send(Buffer.from("binary")); // sends buffer

    // Check if already sent
    res.headersSent; // true / false
});
```

---

### Middleware

Middleware intercepts requests before they reach the route handler.

**Function-style middleware:**

```js
const logger = (req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    return next(); // call next to continue the chain
};

const auth = (req, res, next) => {
    const token = req.header("authorization");
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
};
```

**Class-style middleware (extends `Middleware`):**

```js
import { Middleware } from "@ecf/http";

class CorsMiddleware extends Middleware {
    handle(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
        return next();
    }
}
```

**Registering global middleware (runs on every request):**

```js
// On the application instance
app.use(logger);
app.use(auth);
app.use(new CorsMiddleware());
```

**Registering route-specific middleware:**

```js
// Via the Route facade
Route.use("GET", "/users/new", auth);
Route.get("/users/new", (req, res) => {
    return res.html("<h1>New User Form</h1>");
});
```

---

### Pipeline

The `Pipeline` executes middleware in order and calls the final destination handler.

```js
import { Pipeline, Request, Response } from "@ecf/http";

const pipeline = new Pipeline();

const result = await pipeline
    .send(request, response)
    .through([logger, auth, new CorsMiddleware()])
    .then((req, res) => handler(req, res));
```

The pipeline is built using `reduceRight` — middleware is executed in the order it is passed to `through()`, with each calling `next()` to proceed.

---

## Exported API

### `@ecf/core`

```js
import {
    // Application
    Application,
    Container,
    ServiceProvider,
    Facade,

    // Errors
    ECFError,
    ContainerError,
    ConfigError,
    LoggerError,
    EventError,
    EnvError,

    // Config
    ConfigManager,
    ConfigServiceProvider,
    Config,                     // Facade

    // Logger
    LoggerManager,
    LoggerServiceProvider,
    Log,                        // Facade
    Transport,
    ConsoleTransport,

    // Events
    EventManager,
    EventServiceProvider,
    Event,                      // Facade

    // Environment
    EnvManager,
    DotEnvLoader,
    EnvironmentServiceProvider,
    Env,                        // Facade

    // Database (stub)
    DatabaseServiceProvider,
} from "@ecf/core";
```

### `@ecf/http`

```js
import {
    // Re-exported from @ecf/core
    Application,
    Container,
    ServiceProvider,
    Facade,
    ConfigManager,
    ConfigError,
    ContainerError,
    ECFError,

    // HTTP
    Request,
    Response,
    Route,                      // Facade → Router
    Router,
    Pipeline,
    Middleware,
    HttpKernel,
    HttpServer,
    HttpServiceProvider,
    MiddlewareRegistry,

    // Errors
    RequestError,
    ResponseError,
    RouterError,
    RouteError,
    PipelineError,
    HttpKernelError,
    HttpServerError,
    MiddlewareRegistryError,
} from "@ecf/http";
```

---

## Roadmap

### Phase 1 — Core Foundation ✅ Complete

- IoC Container with circular dependency detection
- Application bootstrapping lifecycle
- Service Providers
- ConfigManager with dot-notation paths
- LoggerManager with pluggable transports (ConsoleTransport)
- EventManager with error-isolated dispatch
- EnvManager + DotEnvLoader (`.env` file support)
- Facade system

### Phase 2 — HTTP Layer ✅ Complete

- Router (static + dynamic routes, all HTTP methods)
- Request (params, query, headers, cookies, body, IP)
- Response (text, html, json, redirect, status, headers)
- Middleware Pipeline
- MiddlewareRegistry (global + per-route)
- HttpKernel
- HttpServer
- HttpServiceProvider

### Phase 3 — Application Layer 🔲 Planned

- Controller base class
- View Engine (`.ecf` template syntax)
- Request Validation
- Session handling
- Cookie writing on Response
- CSRF protection

### Phase 4 — Database Layer 🔲 Planned

- Database abstraction
- Query Builder
- ORM
- Migrations
- Seeders

### Phase 5 — Developer Tools 🔲 Planned

- CLI (`ecf make:controller`, `ecf make:provider`, etc.)
- Job Queue
- Cache layer
- Task Scheduler
- Mail sending

---

## Documentation

See [docs/ecf-framework.md](docs/ecf-framework.md) for the full framework architecture overview.

See [issues.md](issues.md) for known bugs, missing features, and improvement opportunities.

See [fix.md](fix.md) for documented solutions to known bugs.
