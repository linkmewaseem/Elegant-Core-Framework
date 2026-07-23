import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import BodyParser from "../src/parsers/BodyParser.js";
import JsonBodyParser from "../src/parsers/JsonBodyParser.js";
import FormBodyParser from "../src/parsers/FormBodyParser.js";
import TextBodyParser from "../src/parsers/TextBodyParser.js";
import RawBodyParser from "../src/parsers/RawBodyParser.js";
import BodyParserManager from "../src/BodyParserManager.js";

import BodyParserError from "../src/errors/BodyParserError.js";
import InvalidJsonError from "../src/errors/InvalidJsonError.js";
import PayloadTooLargeError from "../src/errors/PayloadTooLargeError.js";
import parseByteSize from "../src/utils/parseByteSize.js";
import normalizeContentType from "../src/utils/normalizeContentType.js";

// Helper fake Request for BodyParserManager.parse(request)
function makeFakeRequest({ contentType = "", body = "" } = {}) {
    const stream = new Readable({
        read() {
            this.push(Buffer.from(body));
            this.push(null);
        }
    });

    return {
        raw: stream,
        header(name) {
            if (name.toLowerCase() === "content-type") {
                return contentType;
            }
            return null;
        }
    };
}

describe("parseByteSize utility", () => {
    test("returns numbers directly", () => {
        assert.equal(parseByteSize(1024), 1024);
    });

    test("parses byte string sizes", () => {
        assert.equal(parseByteSize("500b"), 500);
        assert.equal(parseByteSize("1kb"), 1024);
        assert.equal(parseByteSize("2mb"), 2 * 1024 * 1024);
        assert.equal(parseByteSize("1.5gb"), Math.floor(1.5 * 1024 * 1024 * 1024));
    });

    test("throws TypeError on invalid size formats or types", () => {
        assert.throws(() => parseByteSize("invalid"), TypeError);
        assert.throws(() => parseByteSize(null), TypeError);
    });
});

describe("normalizeContentType utility", () => {
    test("strips parameters and normalizes to lowercase", () => {
        assert.equal(normalizeContentType("Application/JSON; charset=utf-8"), "application/json");
        assert.equal(normalizeContentType(" text/html ; boundary=something "), "text/html");
    });

    test("returns empty string for non-string input", () => {
        assert.equal(normalizeContentType(null), "");
        assert.equal(normalizeContentType(undefined), "");
    });
});

describe("BodyParser - abstract base class", () => {
    test("supports() throws BodyParserError", () => {
        const parser = new BodyParser();
        assert.throws(() => parser.supports("application/json"), BodyParserError);
    });

    test("parse() throws BodyParserError", () => {
        const parser = new BodyParser();
        assert.throws(() => parser.parse(Buffer.from("")), BodyParserError);
    });
});

describe("JsonBodyParser - unit tests", () => {
    const parser = new JsonBodyParser();

    test("supports() matches application/json", () => {
        assert.equal(parser.supports("application/json"), true);
        assert.equal(parser.supports("application/json; charset=utf-8"), true);
        assert.equal(parser.supports("text/plain"), false);
        assert.equal(parser.supports(null), false);
    });

    test("parse() returns empty object for empty string or whitespace", () => {
        assert.deepEqual(parser.parse(Buffer.from("")), {});
        assert.deepEqual(parser.parse(Buffer.from("   \n")), {});
    });

    test("parse() parses valid JSON buffer", () => {
        const result = parser.parse(Buffer.from('{"name":"Ali","age":25}'));
        assert.deepEqual(result, { name: "Ali", age: 25 });
    });

    test("parse() throws InvalidJsonError on malformed JSON", () => {
        assert.throws(() => parser.parse(Buffer.from("{invalid")), InvalidJsonError);
    });
});

describe("FormBodyParser - unit tests", () => {
    const parser = new FormBodyParser();

    test("supports() matches application/x-www-form-urlencoded", () => {
        assert.equal(parser.supports("application/x-www-form-urlencoded"), true);
        assert.equal(parser.supports("application/json"), false);
    });

    test("parse() returns empty object for empty string", () => {
        assert.deepEqual(parser.parse(Buffer.from("")), {});
    });

    test("parse() parses urlencoded form body", () => {
        const result = parser.parse(Buffer.from("name=John+Doe&email=john%40gmail.com"));
        assert.deepEqual(result, { name: "John Doe", email: "john@gmail.com" });
    });
});

describe("TextBodyParser - unit tests", () => {
    const parser = new TextBodyParser();

    test("supports() matches text/plain", () => {
        assert.equal(parser.supports("text/plain"), true);
        assert.equal(parser.supports("application/json"), false);
    });

    test("parse() returns utf-8 text", () => {
        const result = parser.parse(Buffer.from("Hello World!"));
        assert.equal(result, "Hello World!");
    });
});

describe("RawBodyParser - unit tests", () => {
    const parser = new RawBodyParser();

    test("supports() matches application/octet-stream", () => {
        assert.equal(parser.supports("application/octet-stream"), true);
        assert.equal(parser.supports("text/plain"), false);
    });

    test("parse() returns raw Buffer as-is", () => {
        const buf = Buffer.from([0x01, 0x02, 0x03]);
        const result = parser.parse(buf);
        assert.strictEqual(result, buf);
    });
});

describe("BodyParserManager - integration & management", () => {

    test("register() validates parser interface", () => {
        const manager = new BodyParserManager();
        assert.throws(() => manager.register(null), BodyParserError);
        assert.throws(() => manager.register({ supports: () => {} }), BodyParserError);
    });

    test("use() acts as alias for register()", () => {
        const manager = new BodyParserManager();
        const jsonParser = new JsonBodyParser();
        manager.use(jsonParser);

        assert.equal(manager.parsers.length, 1);
        assert.strictEqual(manager.parsers[0], jsonParser);
    });

    test("remove() unregisters a parser", () => {
        const manager = new BodyParserManager();
        const jsonParser = new JsonBodyParser();
        manager.register(jsonParser);
        assert.equal(manager.parsers.length, 1);

        manager.remove(jsonParser);
        assert.equal(manager.parsers.length, 0);
    });

    test("parse() returns empty object if no parser matches content-type", async () => {
        const manager = new BodyParserManager();
        manager.register(new JsonBodyParser());

        const request = makeFakeRequest({ contentType: "text/xml", body: "<xml></xml>" });
        const result = await manager.parse(request);

        assert.deepEqual(result, {});
    });

    test("parse() reads stream and delegates to matched parser", async () => {
        const manager = new BodyParserManager();
        manager.register(new JsonBodyParser());
        manager.register(new FormBodyParser());

        const jsonReq = makeFakeRequest({
            contentType: "application/json",
            body: '{"status":"ok"}'
        });

        const jsonResult = await manager.parse(jsonReq);
        assert.deepEqual(jsonResult, { status: "ok" });

        const formReq = makeFakeRequest({
            contentType: "application/x-www-form-urlencoded",
            body: "foo=bar&baz=qux"
        });

        const formResult = await manager.parse(formReq);
        assert.deepEqual(formResult, { foo: "bar", baz: "qux" });
    });

    test("supports async parsers", async () => {
        const manager = new BodyParserManager();
        const asyncParser = {
            supports: (ct) => ct === "custom/async",
            parse: async (buf) => ({ asyncData: buf.toString() })
        };

        manager.register(asyncParser);

        const req = makeFakeRequest({
            contentType: "custom/async",
            body: "hello async"
        });

        const result = await manager.parse(req);
        assert.deepEqual(result, { asyncData: "hello async" });
    });

});

describe("BodyParserManager - size limit", () => {

    test("should throw PayloadTooLargeError when body exceeds the limit", async () => {
        const manager = new BodyParserManager({ limit: 10 }); // 10 bytes
        manager.register(new JsonBodyParser());

        const request = makeFakeRequest({
            contentType: "application/json",
            body: '{"name":"this is definitely more than ten bytes"}'
        });

        await assert.rejects(() => manager.parse(request), PayloadTooLargeError);
    });

    test("should accept string limits like '1mb'", () => {
        const manager = new BodyParserManager({ limit: "1mb" });
        assert.equal(manager.limit, 1024 * 1024);
    });

});

describe("BodyParserManager - content-type normalization", () => {

    test("should match Content-Type regardless of case or charset param", async () => {
        const manager = new BodyParserManager();
        manager.register(new JsonBodyParser());

        const request = makeFakeRequest({
            contentType: "Application/JSON; charset=utf-8",
            body: '{"a":1}'
        });

        const result = await manager.parse(request);
        assert.deepEqual(result, { a: 1 });
    });

});
