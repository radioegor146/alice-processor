import {StructuredResponse} from "../types";

export interface ResponseParser {
    parse(text: string): StructuredResponse;
}