import {SessionContext, State} from "../types";
import {StateServer} from "./types";

export class SystemStateServer implements StateServer {

    getName(): string {
        return "system";
    }

    async getState(context: SessionContext): Promise<State> {
        return {
            "date_time": {
                description: "current time and date in DD-MM-YYYY HH:MM:SS format",
                value: this.getCurrentTimeAndDateFormatted()
            },
            "input_person_gender": {
                description: "gender of person who talked to you",
                value: (context.metadata as any)["gender"] ?? "unknown"
            },
            "input_person_age": {
                description: "age of person who talked to you",
                value: (context.metadata as any)["age"] ?? "unknown"
            }
        };
    }

    private getCurrentTimeAndDateFormatted(): string {
        const date = new Date();
        return `${date.getDate().toString().padStart(2, "0")}-${
            (date.getMonth() + 1).toString().padStart(2, "0")}-${
            date.getFullYear().toString().padStart(4, "0")} ${
            date.getHours().toString().padStart(2, "0")}:${
            date.getMinutes().toString().padStart(2, "0")}:${
            date.getSeconds().toString().padStart(2, "0")}`;
    }
}