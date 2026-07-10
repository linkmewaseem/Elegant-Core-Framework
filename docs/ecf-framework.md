# ECF Framework Documentation

## Overview

ECF is a lightweight dependency injection and service container framework for JavaScript and Node.js applications. The current implementation is intentionally small and focused on the core ideas of binding services, resolving them on demand, and bootstrapping application features through service providers.

The framework is organized around a central container and a simple application wrapper that exposes the container API in a more ergonomic way.

## Current Project Status

- Package name: @ecf/core
- Version: 0.1.0-alpha.1
- Runtime: Node.js 22+
- Module format: ECMAScript modules (ESM)
- Test runner: Node.js built-in test runner

## Repository Structure

- packages/core/src: framework source code
- packages/core/tests: unit tests for the container and application lifecycle
- packages: workspace packages for future expansion
- docs: project documentation

## Core Concepts

### 1. Container

The container is the heart of the framework. It manages:

- service bindings
- singleton instances
- dependency resolution
- validation and error handling

The container supports:

- bind(name, factory): register a factory-based service
- singleton(name, factory): register a singleton service
- make(name): resolve and return a service instance
- has(name): check whether a binding exists
- forget(name): remove a binding and its cached instance
- flush(): clear all bindings and instances

### 2. Application

The Application class is a thin layer over the container. It delegates the container methods and adds application-level registration and bootstrapping behavior.

It provides:

- bind(), singleton(), make(), has(), forget(), flush()
- register(ProviderClass): register a service provider
- boot(): run provider registration and boot hooks

### 3. Service Providers

Service providers are classes that extend the base ServiceProvider class. They give the application a structured way to register services and bootstrap behavior.

A provider typically implements:

- register(app): add bindings to the application container
- boot(app): run setup logic after providers are registered

### 4. Bindings and Resolution

Each binding stores a factory function and a flag indicating whether it should behave as a singleton. When a service is resolved, the container invokes the factory and returns the result.

The framework also detects circular dependencies and throws an error when a service depends on itself indirectly.

## Main Classes

### Application

Location: packages/core/src/Application.js

The Application class creates a container, stores registered providers, and exposes the main container API.

### Container

Location: packages/core/src/Container.js

The Container class handles service registration, resolution, instance caching, and error validation.

### Binding

Location: packages/core/src/Binding.js

Binding stores the factory and the singleton flag used by the container.

### Resolver

Location: packages/core/src/Resolver.js

The resolver is a minimal abstraction that resolves a binding through its factory function.

### ServiceProvider

Location: packages/core/src/ServiceProvider.js

This is the base class for all providers. It provides no-op register and boot methods that can be overridden by subclasses.

### Error Classes

Location: packages/core/src/errors/

ECF defines a small hierarchy of errors:

- ECFError: base error for the framework
- ContainerError: raised for invalid bindings, missing services, and container-related issues

## Example Usage

### Basic container usage

```js
import { Container } from "@ecf/core";

const container = new Container();

container.bind("logger", () => ({
  log(message) {
    console.log(message);
  },
}));

container.make("logger").log("Hello from ECF");
```

### Singleton usage

```js
import { Container } from "@ecf/core";

const container = new Container();

container.singleton("config", () => ({ env: "production" }));

const first = container.make("config");
const second = container.make("config");

console.log(first === second); // true
```

### Application and providers

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

## Current Implementation Notes

The framework is still in an early alpha stage. Some parts of the codebase are intentionally minimal, and the public API is focused on the container and provider lifecycle rather than a large ecosystem of helpers.

A few implementation notes are worth keeping in mind:

- Config and Logger files exist in the source tree but are not currently exported from the main entrypoint.
- The core package is designed as a foundation for future expansion.
- The current behavior is stable for the tested container and provider use cases.

## Testing

The current test suite covers:

- binding and resolution behavior
- singleton behavior
- forgetting and flushing bindings
- provider registration and boot lifecycle
- circular dependency detection
- basic integration with a sample database provider

## Why ECF Matters

ECF provides a clean and lightweight foundation for building applications that need dependency injection without the overhead of a larger framework. Its main strengths are:

- simplicity
- explicit service registration
- easy provider-based extension points
- clear separation between application setup and service resolution

## Recommended Next Steps

If the project continues to evolve, the following areas would be natural next steps:

1. Expand the public API with config and logger support.
2. Add more advanced dependency injection patterns.
3. Improve documentation and examples for real-world usage.
4. Add integration tests for larger application scenarios.
5. Consider packaging and publishing the framework for broader reuse.
