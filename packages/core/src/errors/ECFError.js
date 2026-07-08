/**
 * Base error for all ECF errors.
 */
export default class ECFError extends Error {
    constructor(message) {
        super(message);

        this.name = this.constructor.name;

        Error.captureStackTrace?.(this, this.constructor);
    }
}