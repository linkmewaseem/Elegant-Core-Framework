const UNITS = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };

export default function parseByteSize(value) {
    if (typeof value === "number") {
        return value;
    }

    if (typeof value !== "string") {
        throw new TypeError("Size limit must be a number or a string like '1mb'.");
    }

    const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);

    if (!match) {
        throw new TypeError(`Invalid size limit: "${value}"`);
    }

    const amount = parseFloat(match[1]);
    const unit = match[2] ?? "b";

    return Math.floor(amount * UNITS[unit]);
}
