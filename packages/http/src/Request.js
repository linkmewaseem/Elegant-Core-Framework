import RequestError from "./errors/RequestError.js";
import AttributeBag from "./AttributeBag.js";
import { URL } from "node:url";

export default class Request {
    #cache;

    constructor(incomingMessage, bodyParserManager) {
        this.validateIncomingMessage(incomingMessage);
        this.validateBodyParserManager(bodyParserManager);

        this.raw = incomingMessage;
        this.bodyParserManager = bodyParserManager;
        this.attributes = new AttributeBag();

        this.#cache = {
            url: null,
            query: null,
            cookies: null,
            body: null,
            bodyParsed: false,
            headers: null
        };
    }

    // ---- Basic request info ----

    get method() {
        return this.raw.method;
    }

    get url() {
        return this.raw.url;
    }

    get parsedUrl() {
        if (this.#cache.url === null) {
            const host = this.header("host") || "localhost";
            this.#cache.url = new URL(this.raw.url, `http://${host}`);
        }
        return this.#cache.url;
    }

    get path() {
        return this.parsedUrl.pathname;
    }

    get headers() {
        if (this.#cache.headers === null) {
            this.#cache.headers = Object.freeze({ ...this.raw.headers });
        }
        return this.#cache.headers;
    }

    header(name) {
        this.validateHeaderName(name);
        const key = name.trim().toLowerCase();
        return this.raw.headers[key] ?? null;
    }

    hasHeader(name) {
        this.validateHeaderName(name);
        const key = name.trim().toLowerCase();
        return Object.prototype.hasOwnProperty.call(this.raw.headers, key);
    }

    // ---- Query ----

    get query() {
        if (this.#cache.query === null) {
            this.#cache.query = Object.freeze(Object.fromEntries(this.parsedUrl.searchParams));
        }
        return this.#cache.query;
    }

    // ---- Params (set by Router, read by developer) ----

    get params() {
        const params = this.attributes.get("params", {});
        return Object.freeze({ ...params });
    }

    // ---- Cookies ----

    get cookies() {
        if (this.#cache.cookies === null) {
            this.#cache.cookies = Object.freeze(this.parseCookies());
        }
        return this.#cache.cookies;
    }

    parseCookies() {
        const header = this.header("cookie");
        const result = {};

        if (!header) {
            return result;
        }

        for (const pair of header.split(";")) {
            const [key, ...rest] = pair.trim().split("=");
            if (!key) continue;

            const rawValue = rest.join("=") ?? "";

            try {
                result[key] = decodeURIComponent(rawValue);
            } catch {
                result[key] = rawValue; // malformed encoding — fall back to raw value
            }
        }

        return result;
    }

    // ---- Body (lazy, delegated to BodyParserManager) ----

    async body() {
        if (!this.#cache.bodyParsed) {
            try {
                this.#cache.body = await this.bodyParserManager.parse(this);
                this.#cache.bodyParsed = true;
            } catch (error) {
                this.#cache.body = null;
                this.#cache.bodyParsed = false; // don't cache a failed attempt
                throw error;
            }
        }
        return this.#cache.body;
    }

    // ---- Network / security info ----

    get ip() {
        return this.raw.socket?.remoteAddress ?? null;
    }

    get protocol() {
        return this.secure ? "https" : "http";
    }

    get secure() {
        return this.header("x-forwarded-proto") === "https" || this.raw.socket?.encrypted === true;
    }

    get host() {
        return this.header("host") ?? null;
    }

    get origin() {
        return `${this.protocol}://${this.host}`;
    }

    get userAgent() {
        return this.header("user-agent") ?? null;
    }

    // ---- Validation ----

    validateIncomingMessage(incomingMessage) {
        if (
            !incomingMessage ||
            typeof incomingMessage.method !== "string" ||
            typeof incomingMessage.url !== "string" ||
            typeof incomingMessage.headers !== "object" ||
            incomingMessage.headers === null
        ) {
            throw new RequestError("Request requires a valid IncomingMessage object.");
        }
    }

    validateBodyParserManager(bodyParserManager) {
        if (!bodyParserManager || typeof bodyParserManager.parse !== "function") {
            throw new RequestError("Request requires a BodyParserManager with a parse() method.");
        }
    }

    validateHeaderName(name) {
        if (typeof name !== "string" || name.trim() === "") {
            throw new RequestError("Header name must be a non-empty string.");
        }
    }
}