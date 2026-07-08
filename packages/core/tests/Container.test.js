import { describe } from "node:test";

import test from "node:test";
import assert from "node:assert/strict";
import { Container } from "../src/index.js";
import ContainerError from "../src/errors/ContainerError.js";
describe("Container", () => {


test("Container can be created", () => {

    const container = new Container();
    container.bind("uuid", () => ({}));
    const one = container.make("uuid");
    
    const two = container.make("uuid");
    container.singleton("config", () => ({}));
    const a = container.make("config");
    
    const s = container.make("config");
    assert.ok(container);
    assert.notStrictEqual(one, two);
    assert.strictEqual(a, s);
    

});
test("bind returns a new instance every time", () => {

    const container = new Container();

    container.bind("user", () => ({}));

    const first = container.make("user");
    const second = container.make("user");

    assert.notStrictEqual(first, second);

});
test("singleton returns the same instance", () => {

    const container = new Container();

    container.singleton("config", () => ({}));

    const first = container.make("config");
    const second = container.make("config");

    assert.strictEqual(first, second);

});
test("instance returns the registered object", () => {

    const container = new Container();

    const logger = {};

    container.instance("logger", logger);

    assert.strictEqual(
        container.make("logger"),
        logger
    );

});
test("has returns true when service exists", () => {

    const container = new Container();

    container.instance("config", {});

    assert.equal(
        container.has("config"),
        true
    );

});
test("remove deletes a service", () => {

    const container = new Container();

    container.instance("cache", {});

    container.remove("cache");

    assert.equal(
        container.has("cache"),
        false
    );

});
test("flush clears all services", () => {

    const container = new Container();

    container.instance("a", {});
    container.instance("b", {});
    container.instance("c", {});

    container.flush();

    assert.equal(container.has("a"), false);
    assert.equal(container.has("b"), false);
    assert.equal(container.has("c"), false);

});


test("throws ContainerError for unknown service", () => {

    const container = new Container();

    assert.throws(() => {

        container.make("payment");

    }, ContainerError);

});
});