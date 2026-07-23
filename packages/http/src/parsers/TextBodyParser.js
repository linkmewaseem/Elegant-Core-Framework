import BodyParser from "./BodyParser.js";

export default class TextBodyParser extends BodyParser {
    supports(contentType) {
        return typeof contentType === "string" && contentType.includes("text/plain");
    }

    parse(rawBody) {
        return rawBody.toString("utf8");
    }
}
