import BodyParser from "./BodyParser.js";

export default class RawBodyParser extends BodyParser {
    supports(contentType) {
        return typeof contentType === "string" && contentType.includes("application/octet-stream");
    }

    parse(rawBody) {
        return rawBody; // already a Buffer
    }
}
