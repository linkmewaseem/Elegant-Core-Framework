# ECF

ECF is a lightweight dependency injection and service container framework for JavaScript and Node.js applications. The project is currently organized around a core package that provides container-based service registration, singleton management, provider-based bootstrapping, and basic error handling.

## Features

- Lightweight service container
- Bind and resolve services with factories
- Singleton support
- Dependency resolution through the container
- Service provider registration and boot lifecycle
- Circular dependency detection
- Small and extensible core package

## Project Structure

- packages/core/src: core framework implementation
- packages/core/tests: unit tests for the container and application
- docs: project documentation
- apps, packages, tools: workspace areas for future expansion

## Installation

This repository uses pnpm workspaces.

```bash
pnpm install
```

## Running Tests

```bash
pnpm test
```

## Quick Example

```js
import { Application, ServiceProvider } from "@ecf/core";

class DatabaseProvider extends ServiceProvider {
  register(app) {
    app.singleton("database", () => ({ connected: true }));
  }
}

const app = new Application();
app.register(DatabaseProvider);
app.boot();

console.log(app.make("database"));
```

## Documentation

- Framework overview: [docs/ecf-framework.md](docs/ecf-framework.md)

## Current Status

The framework is in an early alpha stage and focuses on the foundation of dependency injection rather than a large ecosystem of helpers.
