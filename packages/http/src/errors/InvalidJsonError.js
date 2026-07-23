import {ECFError} from '@ecf/core';

/**
 * Error thrown when JSON body parsing fails.
 */
export default class InvalidJsonError extends ECFError {
    constructor(message) {
        super(message);
        this.name = "InvalidJsonError";
    }
}
