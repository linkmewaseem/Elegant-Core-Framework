import ECFError from './ECFError.js';

/**
 * Error thrown when a pipeline-related error occurs.
 */
export default class PipelineError extends ECFError {
    constructor(message) {
        super(message);
         this.name = "PipelineError";
    }
}
