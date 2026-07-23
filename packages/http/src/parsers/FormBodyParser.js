import BodyParser from "./BodyParser.js";

export default class FormBodyParser extends BodyParser {
    supports(contentType) {
        return typeof contentType === "string" && contentType.includes("application/x-www-form-urlencoded");
    }

    parse(rawBody) {
        const text = rawBody.toString("utf8").trim();

        if (text === "") {
            return {};
        }

        const params = new URLSearchParams(text);
        return Object.fromEntries(params);
    }
}
