import ContainerError from "./errors/ContainerError.js";

export default class Container {

    #bindings = new Map();

    #singletons = new Map();

    #instances = new Map();

    /**
     * Register a transient service.
     */
    bind(name, factory) {

        this.#bindings.set(name, factory);

        return this;
    }

    /**
     * Register a singleton service.
     */
    singleton(name, factory) {

        this.#singletons.set(name, factory);

        return this;
    }

    /**
     * Register an existing object instance.
     */
    instance(name, value) {

        this.#instances.set(name, value);

        return this;
    }

    /**
     * Resolve a service.
     */
    make(name) {

        if (this.#instances.has(name)) {
            return this.#instances.get(name);
        }

        if (this.#singletons.has(name)) {

            const object = this.#singletons.get(name)(this);

            this.#instances.set(name, object);

            return object;
        }

        if (this.#bindings.has(name)) {
            return this.#bindings.get(name)(this);
        }

        throw new ContainerError(
            `Service [${name}] is not registered.`
        );
    }

    /**
     * Check service existence.
     */
    has(name) {

        return (
            this.#bindings.has(name) ||
            this.#singletons.has(name) ||
            this.#instances.has(name)
        );
    }

    /**
     * Remove a service.
     */
    remove(name) {

        this.#bindings.delete(name);

        this.#singletons.delete(name);

        this.#instances.delete(name);

        return this;
    }

    /**
     * Clear container.
     */
    flush() {

        this.#bindings.clear();

        this.#singletons.clear();

        this.#instances.clear();

        return this;
    }

}
