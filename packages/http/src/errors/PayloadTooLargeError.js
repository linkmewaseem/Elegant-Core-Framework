import BodyParserError from "./BodyParserError.js";

export default class PayloadTooLargeError extends BodyParserError {
    constructor(message, { limit, received } = {}) {
        super(message);
        this.name = "PayloadTooLargeError";
        this.limit = limit;
        this.received = received;
    }
}
