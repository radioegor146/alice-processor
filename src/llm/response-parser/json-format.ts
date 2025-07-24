import {StructuredResponse} from "../types";
import {ResponseParser} from "./types";
import z from "zod";
import {getLogger} from "../../logger";

const responseType = z.object({
    text: z.string(),
    continue_dialog: z.boolean(),
    function_calls: z.array(z.object({
        name: z.string(),
        args: z.record(z.union([z.number(), z.string()])),
        schedule: z.string().optional()
    }))
});

const scheduleTimeRegexes: { regex: RegExp, coefficient: number }[] = [
    {
        regex: /^(?<value>[.\d]+)ms$/, coefficient: 1
    },
    {
        regex: /^(?<value>[.\d]+)s$/, coefficient: 1000
    },
    {
        regex: /^(?<value>[.\d]+)m$/, coefficient: 60 * 1000
    },
    {
        regex: /^(?<value>[.\d]+)h$/, coefficient: 60 * 60 * 1000
    },
    {
        regex: /^(?<value>[.\d]+)d$/, coefficient: 24 * 60 * 60 * 1000
    },
];

export class JSONFormatResponseParser implements ResponseParser {
    private readonly logger = getLogger();

    parse(text: string): StructuredResponse {
        try {
            const response = responseType.parse(JSON.parse(text));
            return {
                text: response.text,
                requireMoreInput: response.continue_dialog,
                functionCalls: response.function_calls.map(call => ({
                    name: call.name,
                    parameters: call.args,
                    schedule: call.schedule ? this.parseSchedule(call.schedule) : undefined
                }))
            };
        } catch (e) {
            this.logger.warn(`Failed to parse JSON response from LLM: ${e}`);
            return {
                text: "",
                functionCalls: [],
                requireMoreInput: false
            };
        }
    }

    private parseSchedule(schedule: string): number {
        const parts = schedule.split(" ").filter(part => part);
        let result = 0;
        for (const part of parts) {
            let matched = false;
            for (const {regex, coefficient} of scheduleTimeRegexes) {
                const match = part.match(regex);
                if (!match) {
                    continue;
                }
                matched = true;
                result += coefficient * parseFloat(match.groups?.value ?? "0");
            }
            if (!matched) {
                this.logger.warn(`Failed to parse 'schedule' part from LLM: '${part}'`);
            }
        }
        return result;
    }
}