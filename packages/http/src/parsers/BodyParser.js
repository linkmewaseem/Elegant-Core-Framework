import BodyParserError from "../errors/BodyParserError.js";

export default class BodyParser {
    supports(contentType) {
        throw new BodyParserError("BodyParser.supports() must be implemented.");
    }

    parse(rawBody) {
        throw new BodyParserError("BodyParser.parse() must be implemented.");
    }
}
