import BodyParserError from "./errors/BodyParserError.js";
import PayloadTooLargeError from "./errors/PayloadTooLargeError.js";
import parseByteSize from "./utils/parseByteSize.js";
import normalizeContentType from "./utils/normalizeContentType.js";

const DEFAULT_LIMIT = "1mb";

export default class BodyParserManager {
    constructor({ limit = DEFAULT_LIMIT } = {}) {
        this.parsers = [];
        this.limit = parseByteSize(limit);
    }

    // ---- Public API ----

    register(parser) {
        this.validateParser(parser);
        this.parsers.push(parser);
        return this;
    }

    use(parser) {
        return this.register(parser);
    }

    remove(parser) {
        this.parsers = this.parsers.filter((p) => p !== parser);
        return this;
    }

    async parse(request) {
        const contentType = normalizeContentType(request.header("content-type"));
        const parser = this.resolve(contentType);

        if (!parser) {
            return {};
        }

        const rawBody = await this.readRawBody(request.raw);
        return await parser.parse(rawBody); // works whether parser.parse is sync or async
    }

    // ---- Internal ----

    resolve(contentType) {
        return this.parsers.find((parser) => parser.supports(contentType)) ?? null;
    }

    readRawBody(stream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let received = 0;
            let settled = false;

            const fail = (error) => {
                if (settled) return;
                settled = true;
                stream.destroy();
                reject(error);
            };

            stream.on("data", (chunk) => {
                received += chunk.length;

                if (received > this.limit) {
                    fail(new PayloadTooLargeError(
                        `Request body exceeds the size limit of ${this.limit} bytes.`,
                        { limit: this.limit, received }
                    ));
                    return;
                }

                chunks.push(chunk);
            });

            stream.on("end", () => {
                if (settled) return;
                settled = true;
                resolve(Buffer.concat(chunks));
            });

            stream.on("error", fail);
        });
    }

    // ---- Validation ----

    validateParser(parser) {
        if (
            !parser ||
            typeof parser.supports !== "function" ||
            typeof parser.parse !== "function"
        ) {
            throw new BodyParserError("Parser must implement supports() and parse() methods.");
        }
    }
}
