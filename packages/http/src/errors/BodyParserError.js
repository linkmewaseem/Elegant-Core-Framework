import {ECFError} from '@ecf/core';

/**
 * Error thrown when a body parser-related error occurs.
 */
export default class BodyParserError extends ECFError {
    constructor(message) {
        super(message);
        this.name = "BodyParserError";
    }
}
