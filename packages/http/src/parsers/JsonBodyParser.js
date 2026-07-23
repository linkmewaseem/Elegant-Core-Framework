import BodyParser from "./BodyParser.js";
import InvalidJsonError from "../errors/InvalidJsonError.js";

export default class JsonBodyParser extends BodyParser {
    supports(contentType) {
        return typeof contentType === "string" && contentType.includes("application/json");
    }

    parse(rawBody) {
        const text = rawBody.toString("utf8").trim();

        if (text === "") {
            return {};
        }

        try {
            return JSON.parse(text);
        } catch (error) {
            throw new InvalidJsonError(`Invalid JSON body: ${error.message}`);
        }
    }
}
