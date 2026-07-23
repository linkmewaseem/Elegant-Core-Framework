export default function normalizeContentType(contentType) {
    if (typeof contentType !== "string") {
        return "";
    }

    // "Application/JSON; charset=utf-8" -> "application/json"
    return contentType.split(";")[0].trim().toLowerCase();
}
