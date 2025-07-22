import {StructuredResponse} from "../types";
import {ResponseParser} from "./types";
import z from "zod";

const responseType = z.object({
    text: z.string(),
    continue_dialog: z.boolean(),
    function_calls: z.array(z.object({
        name: z.string(),
        args: z.record(z.number())
    }))
});

export class JSONFormatResponseParser implements ResponseParser {

    parse(text: string): StructuredResponse {
        try {
            const response = responseType.parse(JSON.parse(text));
            return {
                text: response.text,
                requireMoreInput: response.continue_dialog,
                functionCalls: response.function_calls.map(call => ({
                    name: call.name,
                    parameters: call.args
                }))
            };
        } catch (e) {
            return {
                text: "",
                functionCalls: [],
                requireMoreInput: false
            };
        }
    }
}